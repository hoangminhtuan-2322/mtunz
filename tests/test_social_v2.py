"""Social v2: stable public IDs, consent-first inbox, images and world anonymity."""
import io

import pytest
from fastapi.testclient import TestClient

from test_flows import logged_admin, register_user
from app import app, db


@pytest.fixture(autouse=True)
def reset_social_world():
    with db() as c:
        c.execute('DELETE FROM message_requests')
        c.execute('DELETE FROM world_messages')
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1")
    yield
    with db() as c:
        c.execute('DELETE FROM message_requests')
        c.execute('DELETE FROM world_messages')
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1")


def pair():
    admin=logged_admin()
    a=register_user(admin,'social_alpha')
    b=register_user(admin,'social_beta')
    return admin,a,b,a.get('/api/me').json()['user'],b.get('/api/me').json()['user']


def test_seven_digit_public_ids_and_nonadmin_direct_messaging():
    admin,a,b,au,bu=pair()
    assert 1_000_000<=int(au['public_id'])<=9_999_999
    assert 1_000_000<=int(bu['public_id'])<=9_999_999
    assert au['public_id']!=bu['public_id']
    assert a.get('/api/people/search',params={'q':str(bu['public_id'])}).json()['users'][0]['id']==bu['id']
    assert admin.post('/api/messages',json={'recipient_id':bu['id'],'body':'Admin cannot DM'}).status_code==403
    assert a.post('/api/messages',json={'recipient_id':bu['id'],'body':'No friendship'}).status_code==403
    assert a.post(f"/api/friends/request/{bu['id']}").status_code==200
    assert b.post(f"/api/friends/accept/{au['id']}").status_code==200
    friends=a.get('/api/friends')
    assert friends.status_code==200,friends.text
    assert friends.json()['friends'][0]['public_id']==bu['public_id']
    assert a.post('/api/messages',json={'recipient_id':bu['id'],'body':'Hello'}).status_code==200


def test_message_requests_opt_in_and_acceptance():
    _,a,b,au,bu=pair()
    assert b.patch('/api/me/social',json={'allow_message_requests':False}).status_code==200
    denied=a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Hello'})
    assert denied.status_code==403,denied.text
    assert b.patch('/api/me/social',json={'allow_message_requests':True}).status_code==200
    request=a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Xin chào bạn'})
    assert request.status_code==200,request.text
    assert a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Spam'}).status_code==409
    inbox=b.get('/api/message-requests').json()['requests']
    assert len(inbox)==1 and inbox[0]['intro']=='Xin chào bạn'
    accepted=b.post(f"/api/message-requests/{inbox[0]['id']}/decision",json={'accept':True})
    assert accepted.status_code==200,accepted.text
    history=b.get(f"/api/messages/{au['id']}").json()['messages']
    assert history and history[-1]['body']=='Xin chào bạn'


def test_profile_photo_visibility_and_member_settings():
    _,a,b,au,bu=pair()
    uploaded=a.post('/api/uploads',files={'file':('profile.png',io.BytesIO(b'\x89PNG\r\n\x1a\n'+b'0'*256),'image/png')})
    assert uploaded.status_code==200,uploaded.text
    fid=uploaded.json()['attachment']['id']
    patch=a.patch('/api/me/social',json={
        'avatar_attachment_id':fid,'headline':'Chào cộng đồng','profile_visibility':'only_me',
        'website':'https://example.org','world_anonymous':True,
    })
    assert patch.status_code==200,patch.text
    assert a.get(f"/api/profile/{au['id']}/avatar").status_code==200
    assert b.get(f"/api/profile/{au['id']}/avatar").status_code==404
    other=b.get(f"/api/profile/{au['id']}").json()['profile']
    assert other['private'] and not other['bio'] and not other['avatar_url']
    assert a.patch('/api/me/social',json={'website':'javascript:alert(1)'}).status_code==422
    assert a.patch('/api/me/social',json={'profile_visibility':'everyone'}).status_code==200
    assert b.get(f"/api/profile/{au['id']}/avatar").status_code==200


def test_world_anonymous_is_snapshot_and_admin_can_moderate():
    admin,a,b,au,_=pair()
    enable=admin.post('/api/admin/world/config',json={
        'enabled':True,'schedule_enabled':False,'open_minute':540,'close_minute':1320,
        'admin_password':'mtunz7'
    })
    assert enable.status_code==200,enable.text
    assert a.patch('/api/me/social',json={'world_anonymous':True}).status_code==200
    sent=a.post('/api/world/messages',json={'body':'Tin gửi ẩn danh'})
    assert sent.status_code==200,sent.text
    m=sent.json()['message']
    assert m['anonymous'] and m['sender_id']==0
    world=b.get('/api/world/messages').json()['messages'][-1]
    assert world['sender_id']==0 and world['display_name']=='Ẩn danh'
    assert a.get('/api/world/messages').json()['messages'][-1]['is_mine']
    assert a.patch('/api/me/social',json={'world_anonymous':False}).status_code==200
    previous=b.get('/api/world/messages').json()['messages'][-1]
    assert previous['anonymous']
    report=b.post('/api/reports',json={
        'scope':'world','target_id':0,'message_id':m['id'],'reason':'spam',
        'description':'Nội dung cần kiểm tra vì có dấu hiệu spam'
    })
    assert report.status_code==200,report.text
    moderation=admin.get('/api/admin/world').json()['recent_messages'][-1]
    assert moderation['sender_id']==au['id'] and moderation['anonymous']
