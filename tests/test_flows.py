"""Functional smoke tests. Run with: pytest -q"""
import os
import sys
import tempfile
from pathlib import Path

os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='mtunz_test_')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402
from app import app, db, RATE_BUCKETS  # noqa: E402
import pytest


@pytest.fixture(autouse=True)
def clean_database():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('group_messages','group_members','chat_groups','reactions','chat_preferences','attachments','recovery_grants','ticket_messages','tickets','notifications',
                      'messages','friendships','blocks','restrictions','sessions',
                      'login_challenges','registrations','audit'):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")



def logged_admin():
    c=TestClient(app)
    assert c.get('/').status_code==200
    assert c.post('/api/auth/start',json={'username':'admin'}).status_code==200
    assert c.post('/api/auth/password',json={'username':'admin','password':'mtunz7'}).json()['admin'] is True
    assert c.get('/api/me').json()['user']['is_admin'] is True
    return c


def register_user(admin,name,pw='GreatPassword123',pin='1234'):
    guest=TestClient(app)
    guest.get('/')
    assert guest.post('/api/registration/request',json={'username':name,'phone':'0912345678','email':'demo@example.com'}).json()['status']=='pending'
    assert guest.post('/api/registration/complete',json={'username':name,'password':pw,'pin':pin,'pin_length':len(pin)}).status_code==403
    pending=[r for r in admin.get('/api/admin/registrations').json()['registrations'] if r['username']==name][0]
    assert admin.post(f'/api/admin/registrations/{pending["id"]}/decision',json={'approve':True}).status_code==200
    assert guest.get('/api/registration/status').json()['requests'][0]['status']=='approved'
    assert guest.post('/api/registration/complete',json={'username':name,'password':pw,'pin':pin,'pin_length':len(pin)}).status_code==200
    assert guest.post('/api/auth/start',json={'username':name}).status_code==200
    challenge=guest.post('/api/auth/password',json={'username':name,'password':pw}).json()['challenge']
    assert guest.post('/api/auth/pin',json={'challenge':challenge,'pin':pin}).json()['ok'] is True
    return guest


def test_full_user_friend_chat_admin_and_recovery():
    admin=logged_admin()
    first=register_user(admin,'hoa_demo')
    second=register_user(admin,'minh_demo',pin='123456')
    u=first.get('/api/me').json()['user']
    v=second.get('/api/me').json()['user']
    assert first.post(f'/api/friends/request/{v["id"]}').status_code==200
    assert second.post(f'/api/friends/accept/{u["id"]}').status_code==200
    assert first.post('/api/messages',json={'recipient_id':v['id'],'body':'Xin chào từ bài test'}).status_code==200
    history=second.get(f'/api/messages/{u["id"]}').json()['messages']
    assert len(history)==1 and history[0]['body']=='Xin chào từ bài test'
    assert second.post(f'/api/messages/read/{u["id"]}').json()['ok']
    assert first.get(f'/api/messages/{v["id"]}').json()['messages'][0]['read_at']
    assert first.post(f'/api/restrict/{v["id"]}').json()['restricted'] is True
    assert any(f['restricted'] for f in first.get('/api/friends').json()['friends'])
    assert admin.get(f'/api/admin/users/{u["id"]}/messages').json()['messages'][0]['body']=='Xin chào từ bài test'
    assert any(l['action']=='moderation_messages' for l in admin.get('/api/admin/audit').json()['logs'])
    # Guest recovery chat and admin-signed one-time reset (manual verification step).
    ticket=first.post('/api/support/tickets',json={'kind':'pin','claim':'Tôi quên mã PIN'}).json()['id']
    first.post(f'/api/support/tickets/{ticket}/messages',json={'body':'Xin hỗ trợ khôi phục PIN'})
    assert admin.post(f'/api/admin/tickets/{ticket}/messages',json={'body':'Hãy cung cấp bằng chứng sở hữu.'}).status_code==200
    assert admin.post(f'/api/admin/tickets/{ticket}/grant',json={'username':'hoa_demo','verified':False}).status_code==422
    assert admin.post(f'/api/admin/tickets/{ticket}/grant',json={'username':'hoa_demo','verified':True}).status_code==200
    text=first.get(f'/api/support/tickets/{ticket}/messages').json()['messages'][-1]['body']
    code=text.split(': ')[-1].split('.')[0]
    assert len(code)>10
    assert first.post('/api/support/reset',json={'code':code,'new_value':'65432','pin_length':5}).status_code==200
    assert first.post('/api/support/reset',json={'code':code,'new_value':'22222','pin_length':5}).status_code==403
    assert first.get('/api/me').json()['user'] is None  # Recovery revokes old sessions.
    login=first.post('/api/auth/password',json={'username':'hoa_demo','password':'GreatPassword123'}).json()
    assert first.post('/api/auth/pin',json={'challenge':login['challenge'],'pin':'65432'}).status_code==200
    assert first.post('/api/me/pin',json={'old_pin':'65432','new_pin':'987654','pin_length':6}).json()['ok']
    # Sanction immediately invalidates the session.
    assert admin.post(f'/api/admin/users/{u["id"]}/sanction',json={'kind':'lock','minutes':60,'reason':'Kiểm tra'}).status_code==200
    assert first.get('/api/me').json()['user'] is None
    assert first.post('/api/messages',json={'recipient_id':v['id'],'body':'Lẽ ra bị khóa'}).status_code in (401,403)
    assert admin.post(f'/api/admin/users/{u["id"]}/sanction',json={'kind':'unban'}).status_code==200


def test_permissions_and_capacity():
    admin=logged_admin()
    guest=TestClient(app);guest.get('/')
    assert guest.get('/api/admin/users').status_code==401
    assert guest.post('/api/auth/password',json={'username':'admin','password':'wrong'}).status_code==401
    assert admin.post('/api/admin/capacity',json={'max_users':1}).status_code==200
    first=register_user(admin,'first_one')
    guest.post('/api/registration/request',json={'username':'second_one','phone':'0912345678'})
    rid=[r for r in admin.get('/api/admin/registrations').json()['registrations'] if r['username']=='second_one'][0]['id']
    assert admin.post(f'/api/admin/registrations/{rid}/decision',json={'approve':True}).status_code==409
    assert admin.post(f'/api/admin/registrations/{rid}/decision',json={'approve':False}).status_code==200
    assert first.get('/api/people/search?q=admin').json()['users']==[]
    assert first.post('/api/admin/capacity',json={'max_users':100}).status_code==403


def test_realtime_message_and_immediate_admin_sanction():
    admin=logged_admin()
    alice=register_user(admin,'alice_live')
    bob=register_user(admin,'bob_live')
    alice_id=alice.get('/api/me').json()['user']['id']
    bob_id=bob.get('/api/me').json()['user']['id']
    alice.post(f'/api/friends/request/{bob_id}')
    bob.post(f'/api/friends/accept/{alice_id}')
    with alice.websocket_connect('/ws') as alice_ws:
        assert bob.post('/api/messages',json={'recipient_id':alice_id,'body':'Tin nhắn trực tiếp'}).status_code==200
        event=alice_ws.receive_json()
        assert event['type']=='message' and event['message']['body']=='Tin nhắn trực tiếp'
        assert admin.post(f'/api/admin/users/{alice_id}/sanction',json={'kind':'ban','reason':'Vi phạm'}).status_code==200
        event=alice_ws.receive_json()
        assert event['type']=='account-sanction' and event['kind']=='ban'
    assert alice.get('/api/me').json()['user'] is None
