"""Admin V3 security and world release regressions (SQLite test database only)."""
import io
import pytest
from fastapi.testclient import TestClient
from app import app,db,RATE_BUCKETS,hash_secret,now
from test_flows import logged_admin,register_user


@pytest.fixture(autouse=True)
def clean_v3():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('admin_login_requests','message_requests','user_reports','world_messages',
                      'world_penalties','message_pins','group_messages','group_members','chat_groups',
                      'reactions','chat_preferences','attachments','recovery_grants','ticket_messages',
                      'tickets','notifications','messages','friendships','blocks','restrictions',
                      'sessions','trusted_devices','login_challenges','registrations','audit',
                      'account_deletion_requests'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
        c.execute('UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1')
    yield
    # Restore the shared Admin fixture for tests in other modules.
    with db() as c:
        c.execute('DELETE FROM admin_login_requests')
        c.execute('DELETE FROM sessions')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
    RATE_BUCKETS.clear()


def admin_with_pin():
    admin=logged_admin()
    r=admin.post('/api/me/pin/setup',json={'current_password':'mtunz7',
                                            'pin':'2345','pin_length':4})
    assert r.status_code==200,r.text
    return admin


def test_second_admin_login_waits_for_explicit_pin_approval():
    admin=admin_with_pin()
    second=TestClient(app);second.get('/')
    start=second.post('/api/auth/start',json={'username':'admin'})
    assert start.status_code==200
    challenge=second.post('/api/auth/password',json={'username':'admin','password':'mtunz7'}).json()['challenge']
    waiting=second.post('/api/auth/pin',json={'challenge':challenge,'pin':'2345'})
    assert waiting.status_code==200,waiting.text
    assert waiting.json()['next']=='admin-approval'
    token=waiting.json()['approval_token']
    assert second.get('/api/me').json()['user'] is None
    pending=admin.get('/api/admin/login-approvals').json()['pending']
    assert len(pending)==1
    bad=admin.post('/api/admin/login-approvals/'+pending[0]['request_id']+'/decision',
                   json={'approve':True,'admin_pin':'9999'})
    assert bad.status_code==401
    granted=admin.post('/api/admin/login-approvals/'+pending[0]['request_id']+'/decision',
                       json={'approve':True,'admin_pin':'2345'})
    assert granted.status_code==200,granted.text
    claim=second.post('/api/auth/admin/approval/status',json={'approval_token':token})
    assert claim.status_code==200,claim.text
    assert claim.json()['status']=='active'
    assert second.get('/api/me').json()['user']['is_admin'] is True
    assert second.post('/api/auth/admin/approval/status',json={'approval_token':token}).json()['status']=='expired'
    third=TestClient(app);third.get('/')
    p=third.post('/api/auth/password',json={'username':'admin','password':'mtunz7'})
    assert p.status_code==200
    attempt=third.post('/api/auth/pin',json={'challenge':p.json()['challenge'],'pin':'2345'})
    assert attempt.status_code==409


def test_pin_only_lock_exact_seconds_and_chat_pinning():
    admin=admin_with_pin()
    a=register_user(admin,'v3_a')
    b=register_user(admin,'v3_b')
    uid=a.get('/api/me').json()['user']['id']
    bid=b.get('/api/me').json()['user']['id']
    assert a.post('/api/friends/request/'+str(bid)).status_code==200
    assert b.post('/api/friends/accept/'+str(uid)).status_code==200
    pref=a.post('/api/chats/'+str(bid)+'/preferences',json={
        'muted':False,'archived':True,'pinned':True
    })
    assert pref.status_code==200,pref.text
    f=a.get('/api/friends').json()['friends'][0]
    assert f['pinned'] and f['archived']
    assert a.post('/api/chats/'+str(bid)+'/preferences',
                  json={'muted':True,'archived':True}).status_code==200
    assert a.get('/api/friends').json()['friends'][0]['pinned']
    bad=admin.post('/api/admin/users/'+str(uid)+'/sanction',json={
        'kind':'lock','seconds':65,'reason':'Quấy rối liên tục','admin_pin':'0000'
    })
    assert bad.status_code==401
    start=now()
    good=admin.post('/api/admin/users/'+str(uid)+'/sanction',json={
        'kind':'lock','seconds':65,'reason':'Quấy rối liên tục','admin_pin':'2345'
    })
    assert good.status_code==200,good.text
    with db() as c:
        x=c.execute('SELECT sanction_until FROM users WHERE id=?',(uid,)).fetchone()
    assert start+65<=x['sanction_until']<=now()+65
    assert admin.post('/api/admin/users/'+str(uid)+'/sanction',json={
        'kind':'unban','admin_pin':'2345'
    }).status_code==200


def test_world_media_remains_readable_after_admin_closes_room():
    admin=admin_with_pin()
    member=register_user(admin,'v3_world')
    config={'enabled':True,'schedule_enabled':False,'open_minute':540,
            'close_minute':1320,'admin_password':'mtunz7','admin_pin':'2345'}
    assert admin.post('/api/admin/world/config',json=config).status_code==200
    payload=member.post('/api/uploads',files={
        'file':('world.png',io.BytesIO(b'\x89PNG\r\n\x1a\n'+b'8'*128),'image/png')
    })
    assert payload.status_code==200,payload.text
    fid=payload.json()['attachment']['id']
    sent=member.post('/api/world/messages',json={'body':'','attachment_id':fid})
    assert sent.status_code==200,sent.text
    assert sent.json()['message']['attachment']['id']==fid
    assert admin.post('/api/admin/world/config',json={**config,'enabled':False}).status_code==200
    assert member.get('/api/world/status').json()['open'] is False
    history=member.get('/api/world/messages').json()['messages']
    assert history[-1]['attachment']['id']==fid
    assert member.get('/api/attachments/'+str(fid)).status_code==200
    assert member.post('/api/world/messages',json={'body':'Phòng đóng'}).status_code==403


def test_audit_cleanup_and_full_member_reset_require_correct_pin():
    admin=admin_with_pin()
    member=register_user(admin,'v3_reset')
    uid=member.get('/api/me').json()['user']['id']
    preview=admin.get('/api/admin/data-reset/preview')
    assert preview.status_code==200 and preview.json()['members']==1
    payload={'confirm':'XOA TOAN BO NGUOI DUNG','expected_members':1,'admin_pin':'0000'}
    assert admin.post('/api/admin/data-reset',json=payload).status_code==401
    assert admin.get('/api/admin/data-reset/preview').json()['members']==1
    logs=admin.get('/api/admin/audit').json()['logs']
    assert logs
    assert admin.post('/api/admin/audit/prune',json={
        'mode':'selected','ids':[logs[0]['id']],'confirm':'XOA NHAT KY','admin_pin':'2345'
    }).status_code==200
    with db() as c:
        before=c.execute("SELECT password_hash,pin_hash FROM users WHERE is_admin=1").fetchone()
        pw,pin=before['password_hash'],before['pin_hash']
    erased=admin.post('/api/admin/data-reset',json={**payload,'admin_pin':'2345'})
    assert erased.status_code==200,erased.text
    with db() as c:
        assert c.execute('SELECT count(*) n FROM users WHERE is_admin=0').fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM registrations').fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM messages').fetchone()['n']==0
        current=c.execute("SELECT password_hash,pin_hash FROM users WHERE is_admin=1").fetchone()
        assert current['password_hash']==pw and current['pin_hash']==pin
        assert c.execute('SELECT count(*) n FROM sessions WHERE user_id=(SELECT id FROM users WHERE is_admin=1)').fetchone()['n']==1
    assert admin.get('/api/me').json()['user']['is_admin']
    assert member.get('/api/me').json()['user'] is None
