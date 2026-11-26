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
        for table in ('mobile_push_receipts','mobile_push_tokens','scheduled_messages','admin_login_requests','message_requests',
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


def test_native_admin_requires_pin_and_existing_device_approval():
    admin = logged_admin()
    native = TestClient(app)
    bad = native.post('/api/mobile/auth/password',
        json={'username':'admin','password':'incorrect-password'})
    assert bad.status_code == 401
    first = native.post('/api/mobile/auth/password',
        json={'username':'admin','password':'mtunz7'})
    assert first.status_code == 200, first.text
    challenge = first.json()['challenge']
    wrong = native.post('/api/mobile/auth/pin',
        json={'challenge':challenge,'pin':'0000'})
    assert wrong.status_code in (401,429)
    # The web Admin has an active session, so new native login needs approval.
    pending = native.post('/api/mobile/auth/pin',
        json={'challenge':challenge,'pin':'2345'})
    assert pending.status_code == 200, pending.text
    assert pending.json()['next'] == 'admin-approval'
    approval_token = pending.json()['approval_token']
    claim = {'challenge':challenge,'approval_token':approval_token}
    waiting = native.post('/api/mobile/auth/admin/approval/status',json=claim)
    assert waiting.status_code == 200 and waiting.json()['status']=='pending'
    reqs = admin.get('/api/admin/login-approvals').json()['pending']
    rid = reqs[0]['request_id']
    decided = admin.post('/api/admin/login-approvals/'+rid+'/decision',
        json={'approve':True,'admin_pin':'2345'})
    assert decided.status_code == 200,decided.text
    ready = native.post('/api/mobile/auth/admin/approval/status',json=claim)
    assert ready.status_code == 200,ready.text
    assert ready.json()['status']=='active'
    bearer={'Authorization':'Bearer '+ready.json()['access_token']}
    me = native.get('/api/me',headers=bearer)
    assert me.status_code==200 and me.json()['user']['is_admin']
    assert native.get('/api/admin/stats',headers=bearer).status_code==200
    assert native.post('/api/mobile/auth/admin/approval/status',
        json=claim).json()['status']=='expired'
    assert native.post('/api/auth/logout',headers=bearer).status_code==200
    assert native.get('/api/me',headers=bearer).json()['user'] is None


def test_native_rejects_wrong_password():
    logged_admin()
    client = TestClient(app)
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


def test_native_admin_receives_background_registration_and_support(monkeypatch):
    from queue import Queue
    from requests import Response
    import mobile_push

    admin=logged_admin()
    assert admin.post('/api/auth/logout').status_code==200
    native,headers=native_login('admin',password='mtunz7',pin='2345')
    endpoint='ExpoPushToken[nativeadmin_test_0123456789]'
    assert native.get('/api/mobile/push',headers=headers).json()=={'enabled':False}
    assert native.post('/api/mobile/push',headers=headers,json={'token':endpoint}).status_code==200
    assert native.get('/api/mobile/push',headers=headers).json()=={'enabled':True}
    sent=Queue()

    def expo_request(url, **kwargs):
        assert url==mobile_push.EXPO_GATEWAY
        assert kwargs['allow_redirects'] is False
        messages=kwargs['json']
        sent.put(messages)
        response=Response()
        response.status_code=200
        response._content=b'{"data":[{"status":"ok","id":"message-receipt"}]}'
        return response

    monkeypatch.setattr(mobile_push.requests,'post',expo_request)
    with TestClient(app) as running:
        guest=running.get('/')
        assert guest.status_code==200
        result=running.post('/api/registration/request',json={
            'username':'native_push_signup','phone':'0912345617'})
        assert result.status_code==200,result.text
        [message]=sent.get(timeout=3)
        assert message['to']==endpoint
        assert {k:message['data'][k] for k in ('kind','chat_id')}=={'kind':'registration','chat_id':0}
        assert len(message['data']['session_binding'])==64
        assert 'categoryId' not in message
        assert 'native_push_signup' not in message['body']
        assert message['channelId']=='messages' and message['sound']=='default'
        with db() as c:
            c.execute('DELETE FROM support_rate_limits')
            c.execute("UPDATE settings SET value='0' WHERE key='support_intake_paused'")
        ticket=running.post('/api/support/tickets',json={'kind':'other','claim':'Private data'})
        assert ticket.status_code==200,ticket.text
        tid=ticket.json()['id']
        [message]=sent.get(timeout=3)
        assert {k:message['data'][k] for k in ('kind','chat_id')}=={'kind':'support','chat_id':tid}
        assert len(message['data']['session_binding'])==64
        assert 'categoryId' not in message
        assert 'Private data' not in message['body']
        assert running.post(f'/api/support/tickets/{tid}/messages',json={'body':'Confidential'}).status_code==200
        [message]=sent.get(timeout=3)
        assert message['data']['kind']=='support' and 'Confidential' not in message['body']
        assert native.post('/api/mobile/push/test',headers=headers).json()=={'accepted':True}
        [message]=sent.get(timeout=3)
        assert message['to']==endpoint and message['data']['kind']=='test'


def test_native_support_owned_ticket_sync_and_authorization():
    """One ticket across native bearer and web; other members see nothing."""
    admin=logged_admin()
    browser=register_user(admin,'native_support_owner')
    stranger=register_user(admin,'native_support_other')
    native,headers=native_login('native_support_owner')
    created=native.post('/api/support/tickets',headers=headers,
                        json={'kind':'other','claim':'Cần hỗ trợ tài khoản'})
    assert created.status_code==200,created.text
    ticket_id=created.json()['id']
    fresh=TestClient(app)
    listing=fresh.get('/api/support/tickets',headers=headers)
    assert listing.status_code==200,listing.text
    assert any(row['id']==ticket_id for row in listing.json()['tickets'])
    assert any(row['id']==ticket_id for row in browser.get('/api/support/tickets').json()['tickets'])
    assert stranger.get(f'/api/support/tickets/{ticket_id}/messages').status_code==404
    assert stranger.post(f'/api/support/tickets/{ticket_id}/messages',
                         json={'body':'Không phải chủ tài khoản'}).status_code==404
    sent=fresh.post(f'/api/support/tickets/{ticket_id}/messages',headers=headers,
                    json={'body':'Tôi gửi từ app Android'})
    assert sent.status_code==200,sent.text
    assert any(m['body']=='Tôi gửi từ app Android'
               for m in browser.get(f'/api/support/tickets/{ticket_id}/messages').json()['messages'])
    with fresh.websocket_connect('/ws',headers=headers) as ws:
        reply=admin.post(f'/api/admin/tickets/{ticket_id}/messages',
                         json={'body':'Hỗ trợ đã nhận'})
        assert reply.status_code==200,reply.text
        event=ws.receive_json()
        assert event['type']=='support-message' and event['ticket_id']==ticket_id
        assert event['message']['body']=='Hỗ trợ đã nhận'


def test_android_support_reply_push_to_owner_without_private_body(monkeypatch):
    """A real Android bearer session gets an admin support reply push, not private content."""
    from queue import Queue
    from requests import Response
    import mobile_push
    admin=logged_admin()
    register_user(admin,'native_support_push_user')
    client,headers=native_login('native_support_push_user')
    token='ExpoPushToken['+('R'*32)+']'
    assert client.post('/api/mobile/push',headers=headers,json={'token':token}).status_code==200
    ticket=client.post('/api/support/tickets',headers=headers,
                       json={'kind':'other','claim':'Bí mật hỗ trợ'})
    assert ticket.status_code==200,ticket.text
    tid=ticket.json()['id']
    received=Queue()
    def expo_request(url,**kwargs):
        assert url==mobile_push.EXPO_GATEWAY
        received.put(kwargs['json'])
        response=Response()
        response.status_code=200
        response._content=b'{"data":[{"status":"ok","id":"accepted"}]}'
        return response
    monkeypatch.setattr(mobile_push.requests,'post',expo_request)
    with TestClient(app) as running:
        # Use the SAME event loop as the push worker: separate TestClients
        # cannot reliably wake a cross-loop asyncio.Queue.
        running.cookies.update(admin.cookies)
        sent=running.post(f'/api/admin/tickets/{tid}/messages',
                          json={'body':'Thông tin tài khoản riêng tư'})
        assert sent.status_code==200,sent.text
        [message]=received.get(timeout=4)
        assert message['to']==token
        assert {k:message['data'][k] for k in ('kind','chat_id')}=={'kind':'support_reply','chat_id':tid}
        assert len(message['data']['session_binding'])==64
        assert 'categoryId' not in message
        assert 'Thông tin tài khoản riêng tư' not in message['body']
        assert message['channelId']=='messages'


def test_expo_receipt_checks_report_delivery_errors_and_expire_tokens(monkeypatch):
    """An Expo ticket is not delivery; receipts must prune unregistered devices."""
    import time
    import mobile_push
    from requests import Response
    admin=logged_admin()
    register_user(admin,'native_receipt_user')
    native,headers=native_login('native_receipt_user')
    token='ExpoPushToken['+('Z'*28)+']'
    assert native.post('/api/mobile/push',headers=headers,json={'token':token}).status_code==200
    with db() as c:
        row=c.execute('SELECT session_hash,registration_id FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
        assert row is not None
        sid=row['session_hash']
        c.execute('''INSERT INTO mobile_push_receipts
                     (receipt_id,token,session_hash,created_at,registration_id) VALUES(?,?,?,?,?)''',
                  ('expo-receipt-invalid',token,sid,int(time.time())-1000,row['registration_id']))
    called=[]
    def receipt_request(url,**kwargs):
        assert url==mobile_push.EXPO_RECEIPTS_GATEWAY
        assert kwargs['json']=={'ids':['expo-receipt-invalid']}
        assert kwargs['allow_redirects'] is False
        called.append(True)
        response=Response()
        response.status_code=200
        response._content=b'{"data":{"expo-receipt-invalid":{"status":"error","details":{"error":"DeviceNotRegistered"}}}}'
        return response
    monkeypatch.setattr(mobile_push.requests,'post',receipt_request)
    assert app.state.mobile_check_expo_receipts()==1
    assert called
    with db() as c:
        assert not c.execute('SELECT 1 FROM mobile_push_receipts WHERE receipt_id=?',
                             ('expo-receipt-invalid',)).fetchone()
        assert not c.execute('SELECT 1 FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
    assert native.get('/api/mobile/push',headers=headers).json()=={'enabled':False}


def test_expo_receipt_missing_retained_until_available(monkeypatch):
    """A receipt missing at the gateway is not a delivery confirmation."""
    import time
    import mobile_push
    from requests import Response
    with db() as c:
        c.execute('''INSERT INTO mobile_push_receipts
                     (receipt_id,token,session_hash,created_at) VALUES(?,?,?,?)''',
                  ('expo-receipt-not-ready','ExpoPushToken['+'Y'*24+']','dead-session',
                   int(time.time())-1000))
    def pending_request(url,**kwargs):
        assert url==mobile_push.EXPO_RECEIPTS_GATEWAY
        response=Response()
        response.status_code=200
        response._content=b'{"data":{}}'
        return response
    monkeypatch.setattr(mobile_push.requests,'post',pending_request)
    assert app.state.mobile_check_expo_receipts()==0
    with db() as c:
        assert c.execute('SELECT 1 FROM mobile_push_receipts WHERE receipt_id=?',
                         ('expo-receipt-not-ready',)).fetchone()

def test_mobile_notification_message_actions_keep_private_body_and_bind_session():
    from mobile_push import build_push_message, MESSAGE_CATEGORY
    import hashlib
    row={'token':'ExpoPushToken[test-token]','session_hash':'a'*64}
    message=build_push_message(row,'dm',42)
    assert message['categoryId']==MESSAGE_CATEGORY
    assert message['body']=='Bạn có tin nhắn mới.'
    assert message['data']=={'kind':'dm','chat_id':42,'session_binding':hashlib.sha256(('mtunz-push-response:'+row['session_hash']).encode()).hexdigest()}
    assert row['session_hash'] not in str(message)
    assert build_push_message(row,'group',42)['categoryId']==MESSAGE_CATEGORY
    assert 'categoryId' not in build_push_message(row,'support_reply',42)


def test_split_notification_channel_routing_legacy_fallback():
    from mobile_push import build_push_message
    row={'token':'ExpoPushToken[test-token]','session_hash':'a'*64}
    expected={'dm':'messages','group':'messages','test':'messages','support_reply':'mtunz-support-v1','registration':'mtunz-admin-v1','support':'mtunz-admin-v1'}
    for kind, channel in expected.items():
        assert build_push_message(row,kind,1)['channelId']=='messages'
        assert build_push_message(dict(row,split_channels=0),kind,1)['channelId']=='messages'
        assert build_push_message(dict(row,split_channels=1),kind,1)['channelId']==channel


def test_background_call_notice_is_generic_short_lived_callback_hint():
    from mobile_push import build_push_message
    row={'token':'ExpoPushToken[test-token]','session_hash':'a'*64,'split_channels':1}
    notice=build_push_message(row,'call_notice',42)
    assert notice['ttl']==30
    assert notice['channelId']=='messages'
    assert 'categoryId' not in notice
    assert set(notice['data'])=={'kind','chat_id','session_binding'}
    assert notice['data']['kind']=='call_notice' and notice['data']['chat_id']==42
    assert row['session_hash'] not in str(notice)
    assert 'signal' not in notice['data'] and 'sdp' not in notice['data']


def test_native_rejects_conflicting_cookie_and_bearer_credentials():
    from starlette.websockets import WebSocketDisconnect
    admin=logged_admin()
    browser=register_user(admin,'mixed_cookie_member')
    register_user(admin,'mixed_bearer_member')
    client,headers=native_login('mixed_bearer_member')
    assert client.get('/api/me',headers=headers).json()['user']['username']=='mixed_bearer_member'
    client.cookies.update(browser.cookies)
    assert client.get('/api/me',headers=headers).status_code==400
    assert client.post('/api/auth/logout',headers=headers).status_code==400
    with pytest.raises(WebSocketDisconnect) as caught:
        with client.websocket_connect('/ws',headers=headers):
            pass
    assert caught.value.code==1008
    client.cookies.clear()
    assert client.get('/api/me',headers=headers).json()['user']['username']=='mixed_bearer_member'
    assert browser.get('/api/me').json()['user']['username']=='mixed_cookie_member'


def test_revoked_native_socket_rechecks_session_on_heartbeat(monkeypatch):
    import importlib
    from starlette.websockets import WebSocketDisconnect
    core=importlib.import_module('app')
    monkeypatch.setattr(core,'SOCKET_SESSION_RECHECK_SECONDS',0)
    admin=logged_admin()
    register_user(admin,'heartbeat_revoke_member')
    client,headers=native_login('heartbeat_revoke_member')
    token=headers['Authorization'][7:]
    with client.websocket_connect('/ws',headers=headers) as ws:
        with db() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?',(core.digest(token),))
        ws.send_json({'type':'presence-heartbeat'})
        with pytest.raises(WebSocketDisconnect) as caught:
            ws.receive_json()
        assert caught.value.code==1008
    # Invalid native tokens cannot silently become guest WebSocket sessions,
    # even when the native HTTP client has acquired a guest cookie.
    assert client.cookies.get('g')
    with pytest.raises(WebSocketDisconnect) as caught:
        with client.websocket_connect('/ws',headers=headers):
            pass
    assert caught.value.code==1008


def test_old_push_receipt_cannot_revoke_reregistered_token(monkeypatch):
    import time
    import mobile_push
    from requests import Response
    admin=logged_admin()
    register_user(admin,'native_receipt_retry')
    native,headers=native_login('native_receipt_retry')
    token='ExpoPushToken['+('W'*28)+']'
    assert native.post('/api/mobile/push',headers=headers,json={'token':token}).status_code==200
    with db() as c:
        old=c.execute('SELECT session_hash,registration_id FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
        c.execute('''INSERT INTO mobile_push_receipts
                     (receipt_id,token,session_hash,created_at,registration_id) VALUES(?,?,?,?,?)''',
                  ('stale-registration',token,old['session_hash'],int(time.time())-1000,old['registration_id']))
    assert native.post('/api/mobile/push',headers=headers,json={'token':token}).status_code==200
    with db() as c:
        current=c.execute('SELECT session_hash,registration_id FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()
        assert current['session_hash']==old['session_hash']
        assert current['registration_id']!=old['registration_id']
    def request(url,**kwargs):
        assert url==mobile_push.EXPO_RECEIPTS_GATEWAY
        response=Response()
        response.status_code=200
        response._content=b'{"data":{"stale-registration":{"status":"error","details":{"error":"DeviceNotRegistered"}}}}'
        return response
    monkeypatch.setattr(mobile_push.requests,'post',request)
    assert app.state.mobile_check_expo_receipts()>=1
    assert native.get('/api/mobile/push',headers=headers).json()['enabled'] is True
    with db() as c:
        assert c.execute('SELECT registration_id FROM mobile_push_tokens WHERE token=?',(token,)).fetchone()['registration_id']==current['registration_id']
        assert not c.execute('SELECT 1 FROM mobile_push_receipts WHERE receipt_id=?',('stale-registration',)).fetchone()
