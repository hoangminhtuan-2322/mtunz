"""Per-device session management regressions.

Run with local disposable SQLite. These tests never access the live Neon database.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import app, db, now, hash_secret, RATE_BUCKETS, REMEMBER_COOKIE
from device_info import device_metadata

WIN_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
ANDROID_UA = ('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36')


@pytest.fixture(autouse=True)
def isolated_devices():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('trusted_devices','sessions','login_challenges','registrations'):
            c.execute('DELETE FROM ' + table)
        c.execute("DELETE FROM users WHERE username IN ('device_owner','device_guest')")
    yield
    with db() as c:
        for table in ('trusted_devices','sessions','login_challenges','registrations'):
            c.execute('DELETE FROM ' + table)
        c.execute("DELETE FROM users WHERE username IN ('device_owner','device_guest')")
    RATE_BUCKETS.clear()


def make_account(username):
    with db() as c:
        c.execute('''INSERT INTO users(username,password_hash,pin_hash,pin_length,created_at)
                     VALUES(?,?,?,?,?)''',
                  (username, hash_secret('StrongPassword123!'), hash_secret('123456'), 6, now()))


def login(client, username='device_owner'):
    assert client.get('/').status_code == 200
    assert client.post('/api/auth/start', json={'username':username}).status_code == 200
    step=client.post('/api/auth/password',json={
        'username':username,'password':'StrongPassword123!'})
    assert step.status_code == 200,step.text
    done=client.post('/api/auth/pin',json={
        'challenge':step.json()['challenge'],'pin':'123456','remember_device':True})
    assert done.status_code == 200,done.text
    return done


def test_metadata_includes_browser_os_and_approximate_network(monkeypatch):
    monkeypatch.delenv('GEOIP_DB_PATH',raising=False)
    meta=device_metadata(SimpleNamespace(
        client=SimpleNamespace(host='8.8.8.8'),headers={'user-agent':WIN_UA}))
    assert meta['device_name']=='Máy tính Windows'
    assert meta['browser']=='Chrome'
    assert meta['os_name']=='Windows'
    assert meta['network_hint']=='8.8.8.*'
    assert meta['location_hint']=='Không xác định'
    assert '8.8.8.8' not in repr(meta)


def test_session_details_rename_revoke_only_other_session():
    make_account('device_owner')
    first=TestClient(app,headers={'User-Agent':WIN_UA})
    other=TestClient(app,headers={'User-Agent':ANDROID_UA})
    login(first)
    login(other)
    data=first.get('/api/me/sessions').json()
    assert len(data['sessions'])==2
    assert len(data['remembered_devices'])==2
    current=next(x for x in data['sessions'] if x['current'])
    remote=next(x for x in data['sessions'] if not x['current'])
    assert current['browser']=='Chrome'
    assert current['os_name']=='Windows'
    assert remote['device_name']=='Điện thoại Android'
    assert len(remote['id'])==24
    assert 'token_hash' not in repr(data)
    assert first.delete('/api/me/sessions/session/'+current['id']).status_code==409
    renamed=first.patch('/api/me/sessions/session/'+remote['id']+'/label',
                        json={'label':'Điện thoại phụ'})
    assert renamed.status_code==200,renamed.text
    updated=first.get('/api/me/sessions').json()
    assert next(x for x in updated['sessions'] if x['id']==remote['id'])['label']=='Điện thoại phụ'
    assert first.delete('/api/me/sessions/session/'+remote['id']).status_code==200
    assert other.get('/api/me').json()['user'] is None
    assert first.get('/api/me').json()['user']['username']=='device_owner'


def test_can_remove_current_trusted_device_without_logout():
    make_account('device_owner')
    client=TestClient(app,headers={'User-Agent':WIN_UA})
    login(client)
    saved=next(d for d in client.get('/api/me/sessions').json()['remembered_devices']
               if d['current'])
    assert client.patch('/api/me/sessions/remembered/'+saved['id']+'/label',
                        json={'label':'Laptop cá nhân'}).status_code==200
    result=client.delete('/api/me/sessions/remembered/'+saved['id'])
    assert result.status_code==200
    assert REMEMBER_COOKIE not in client.cookies
    assert client.get('/api/me').json()['user'] is not None
    assert client.get('/api/me/sessions').json()['remembered_devices']==[]


def test_devices_cannot_be_managed_cross_account():
    make_account('device_owner')
    make_account('device_guest')
    a=TestClient(app)
    b=TestClient(app)
    login(a,'device_owner')
    login(b,'device_guest')
    device=b.get('/api/me/sessions').json()['sessions'][0]
    path='/api/me/sessions/session/'+device['id']
    assert a.patch(path+'/label',json={'label':'Xâm nhập'}).status_code==404
    assert a.delete(path).status_code==404
    assert b.get('/api/me').json()['user']['username']=='device_guest'


def test_legacy_sessions_without_metadata_have_honest_fallback():
    make_account('device_owner')
    c=TestClient(app)
    login(c)
    with db() as database:
        database.execute("UPDATE sessions SET device_name=NULL,browser=NULL,os_name=NULL")
    entry=c.get('/api/me/sessions').json()['sessions'][0]
    assert entry['label']=='Thiết bị cũ'
    assert entry['os_name']=='Chưa có dữ liệu'
