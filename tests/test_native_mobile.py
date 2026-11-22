"""Native auth regression on disposable local SQLite database."""
import os
import tempfile
os.environ.setdefault('DATA_DIR', tempfile.mkdtemp(prefix='mtunz_native_test_'))
import pytest
from fastapi.testclient import TestClient
from app import app, db, RATE_BUCKETS, hub
from test_flows import logged_admin, register_user


@pytest.fixture(autouse=True)
def clean_native():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('scheduled_messages','admin_login_requests','message_requests',
                      'world_messages','world_penalties','user_reports','message_pins',
                      'group_messages','group_members','chat_groups','reactions',
                      'chat_preferences','attachments','recovery_grants','ticket_messages',
                      'tickets','notifications','messages','friendships','blocks',
                      'restrictions','sessions','trusted_devices','login_challenges',
                      'registrations','audit','account_deletion_requests'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
    yield
    RATE_BUCKETS.clear()


def test_native_pin_session_chat_ws_and_revocation():
    admin = logged_admin()
    browser = register_user(admin, 'native_member')
    user_id = browser.get('/api/me').json()['user']['id']
    native = TestClient(app)
    password = native.post('/api/mobile/auth/password',
                           json={'username':'native_member','password':'GreatPassword123'})
    assert password.status_code == 200, password.text
    challenge = password.json()['challenge']
    assert native.post('/api/auth/pin', json={'challenge':challenge,'pin':'1234'}).status_code == 401
    assert native.post('/api/mobile/auth/pin',
                       json={'challenge':challenge,'pin':'bad-pin'}).status_code == 401
    verified = native.post('/api/mobile/auth/pin', json={'challenge':challenge,'pin':'1234'})
    assert verified.status_code == 200, verified.text
    token = verified.json()['access_token']
    headers = {'Authorization': 'Bearer ' + token}
    # No session cookie is needed; both API and WebSocket honor revocable session.
    assert 's' not in verified.cookies
    me = native.get('/api/me', headers=headers)
    assert me.status_code == 200 and me.json()['user']['id'] == user_id
    assert native.get('/api/friends', headers=headers).status_code == 200
    with native.websocket_connect('/ws', headers=headers):
        assert bool(hub.users.get(user_id))
    revoked = native.post('/api/auth/logout', headers=headers)
    assert revoked.status_code == 200
    assert native.get('/api/me', headers=headers).json()['user'] is None


def test_native_rejects_admin_and_wrong_password():
    admin = logged_admin()
    client = TestClient(app)
    assert client.post('/api/mobile/auth/password',
        json={'username':'admin','password':'mtunz7'}).status_code == 401
    assert client.post('/api/mobile/auth/password',
        json={'username':'missing_user','password':'x'}).status_code == 401


def native_login(username, password='GreatPassword123', pin='1234'):
    client=TestClient(app)
    start=client.post('/api/mobile/auth/password',json={'username':username,'password':password})
    assert start.status_code==200,start.text
    verified=client.post('/api/mobile/auth/pin',
        json={'challenge':start.json()['challenge'],'pin':pin})
    assert verified.status_code==200,verified.text
    return client,{'Authorization':'Bearer '+verified.json()['access_token']}


def test_native_websocket_receives_web_dm_reaction_edit_and_group_events():
    admin=logged_admin()
    alice=register_user(admin,'native_sender')
    bob=register_user(admin,'native_receiver')
    aid=alice.get('/api/me').json()['user']['id']
    bid=bob.get('/api/me').json()['user']['id']
    assert alice.post(f'/api/friends/request/{bid}').status_code==200
    assert bob.post(f'/api/friends/accept/{aid}').status_code==200
    client,headers=native_login('native_receiver')
    with client.websocket_connect('/ws',headers=headers) as socket:
        sent=alice.post('/api/messages',json={
            'recipient_id':bid,'body':'Xin chào từ web',
            'client_message_id':'native_web_1234567890123456'})
        assert sent.status_code==200,sent.text
        mid=sent.json()['message']['id']
        event=socket.receive_json()
        assert event['type']=='message' and event['message']['id']==mid
        assert event['message']['body']=='Xin chào từ web'

        edit=alice.patch('/api/messages/'+str(mid),json={'body':'Nội dung đã sửa'})
        assert edit.status_code==200,edit.text
        edited=socket.receive_json()
        assert edited['type']=='message-updated' and edited['message_id']==mid
        assert edited['body']=='Nội dung đã sửa'

        reaction=client.post('/api/messages/'+str(mid)+'/reaction',
            headers=headers,json={'emoji':'👍'})
        assert reaction.status_code==200,reaction.text
        reacting=socket.receive_json()
        assert reacting['type']=='message-reaction'
        assert reacting['message_id']==mid and reacting['emoji']=='👍'

        changed=client.put('/api/chats/'+str(aid)+'/nickname',headers=headers,
            json={'nickname':'Bạn thân'})
        assert changed.status_code==200,changed.text
        assert socket.receive_json()['type']=='friends-updated'
        own=client.get('/api/friends',headers=headers).json()['friends']
        assert next(r for r in own if r['other_id']==aid)['nickname']=='Bạn thân'

        group=alice.post('/api/groups',json={'title':'Native realtime test','member_ids':[bid]})
        assert group.status_code==200,group.text
        gid=group.json()['id']
        assert socket.receive_json()['type']=='groups-updated'
        message=alice.post(f'/api/groups/{gid}/messages',json={
            'body':'Tin nhắn nhóm realtime','client_message_id':'native_group_1234567890123456'})
        assert message.status_code==200,message.text
        evt=socket.receive_json()
        assert evt['type']=='group-message' and evt['group_id']==gid
        assert evt['message']['body']=='Tin nhắn nhóm realtime'


def test_native_device_manager_keeps_current_session_and_revokes_web():
    admin=logged_admin()
    browser=register_user(admin,'native_sessions')
    client,headers=native_login('native_sessions')
    detail=client.get('/api/me/sessions',headers=headers)
    assert detail.status_code==200,detail.text
    assert len([r for r in detail.json()['sessions'] if r['current']])==1
    before=browser.get('/api/me').json()['user']
    assert before is not None
    revoke=client.post('/api/me/sessions/revoke-others',headers=headers)
    assert revoke.status_code==200,revoke.text
    assert client.get('/api/me',headers=headers).json()['user'] is not None
    assert browser.get('/api/me').json()['user'] is None


def test_native_push_registration_is_session_scoped_and_removed_on_logout():
    admin=logged_admin()
    register_user(admin,'native_push_user')
    client,headers=native_login('native_push_user')
    token='ExpoPushToken['+('A'*24)+']'
    saved=client.post('/api/mobile/push',headers=headers,json={'token':token})
    assert saved.status_code==200,saved.text
    with db() as c:
        registered=c.execute('SELECT COUNT(*) n FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
    assert registered['n']==1
    assert client.post('/api/mobile/push',headers=headers,json={'token':'https://evil.com'}).status_code==422
    assert client.post('/api/mobile/push',json={'token':token}).status_code in (401,403)
    out=client.post('/api/auth/logout',headers=headers)
    assert out.status_code==200,out.text
    with db() as c:
        remaining=c.execute('SELECT COUNT(*) n FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
    assert remaining['n']==0


def test_native_websocket_origin_with_bearer_and_revocation():
    admin=logged_admin()
    register_user(admin,'native_origin')
    client,headers=native_login('native_origin')
    # Some mobile runtimes send their own Origin; bearer authentication does
    # not rely on browser CSRF cookies, and the actual token is DB-verified.
    with client.websocket_connect('/ws',headers={**headers,'Origin':'http://localhost:19000'}) as ws:
        assert ws is not None
    assert client.post('/api/auth/logout',headers=headers).status_code==200
    assert client.get('/api/me',headers=headers).json()['user'] is None



def test_native_signup_uses_existing_admin_approval_and_web_identity():
    admin = logged_admin()
    native = TestClient(app)
    request = native.post('/api/mobile/registration/request', json={
        'username':'native_new_signup','phone':'0981234567','email':'native.signup@example.com',
    })
    assert request.status_code == 200, request.text
    claim = request.json()['registration_token']
    pending = native.post('/api/mobile/registration/status', json={'token':claim})
    assert pending.status_code == 200 and pending.json()['registration']['status'] == 'pending'
    rejected = native.post('/api/mobile/registration/complete', json={
        'token':claim,'username':'native_new_signup','password':'VeryStrongPassword123',
        'pin':'1234','pin_length':4,'accepted_terms':True,
    })
    assert rejected.status_code == 403
    rows=admin.get('/api/admin/registrations').json()['registrations']
    entry=next(r for r in rows if r['username']=='native_new_signup')
    approval=admin.post(f'/api/admin/registrations/{entry["id"]}/decision',
        json={'approve':True,'admin_pin':'2345'})
    assert approval.status_code == 200,approval.text
    approved=native.post('/api/mobile/registration/status',json={'token':claim}).json()
    assert approved['registration']['status']=='approved'
    no_consent=native.post('/api/mobile/registration/complete', json={
        'token':claim,'username':'native_new_signup','password':'VeryStrongPassword123',
        'pin':'1234','pin_length':4,'accepted_terms':False,
    })
    assert no_consent.status_code==422
    completed=native.post('/api/mobile/registration/complete', json={
        'token':claim,'username':'native_new_signup','password':'VeryStrongPassword123',
        'pin':'1234','pin_length':4,'accepted_terms':True,
    })
    assert completed.status_code == 200, completed.text
    headers={'Authorization':'Bearer '+completed.json()['access_token']}
    profile=native.get('/api/me',headers=headers)
    assert profile.status_code==200,profile.text
    assert profile.json()['user']['onboarding_required']
    name=native.post('/api/me/display-name',headers=headers,
        json={'display_name':'Thành viên Native'})
    assert name.status_code==200,name.text
    assert native.get('/api/me',headers=headers).json()['user']['display_name']=='Thành viên Native'
    replay=native.post('/api/mobile/registration/complete',json={
        'token':claim,'username':'native_new_signup','password':'VeryStrongPassword123',
        'pin':'1234','pin_length':4,'accepted_terms':True})
    assert replay.status_code==403
