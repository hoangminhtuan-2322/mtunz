"""Functional smoke tests. Run with: pytest -q"""
import os
import hashlib
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



def logged_admin(enroll=True):
    c=TestClient(app)
    assert c.get('/').status_code==200
    assert c.post('/api/auth/start',json={'username':'admin'}).status_code==200
    login=c.post('/api/auth/password',json={'username':'admin','password':'mtunz7'}).json()
    if login.get('challenge'):
        assert c.post('/api/auth/pin',json={'challenge':login['challenge'],'pin':'2345'}).json()['ok']
    else:
        assert login['admin'] is True
        if enroll:
            result=c.post('/api/me/pin/setup',json={'current_password':'mtunz7','pin':'2345','pin_length':4})
            assert result.status_code==200,result.text
    assert c.get('/api/me').json()['user']['is_admin'] is True
    return c


def register_user(admin,name,pw='GreatPassword123',pin='1234'):
    guest=TestClient(app)
    guest.get('/')
    digits=int.from_bytes(hashlib.sha256(name.encode('utf-8')).digest()[:6],'big') % 1_000_000_000
    phone='0'+str(digits).zfill(9)
    assert guest.post('/api/registration/request',json={'username':name,'phone':phone,'email':'demo@example.com'}).json()['status']=='pending'
    assert guest.post('/api/registration/complete',json={'username':name,'password':pw,'pin':pin,'pin_length':len(pin),'accepted_terms':True}).status_code==403
    pending=[r for r in admin.get('/api/admin/registrations').json()['registrations'] if r['username']==name][0]
    assert admin.post(f'/api/admin/registrations/{pending["id"]}/decision',json={'approve':True,'admin_pin':'2345'}).status_code==200
    assert guest.get('/api/registration/status').json()['requests'][0]['status']=='approved'
    missing=guest.post('/api/registration/complete',json={'username':name,'password':pw,'pin':pin,'pin_length':len(pin)})
    assert missing.status_code==422, missing.text
    assert guest.post('/api/registration/complete',json={'username':name,'password':pw,'pin':pin,'pin_length':len(pin),'accepted_terms':True}).status_code==200
    with db() as c:
        consent=c.execute('SELECT terms_accepted_at,terms_accepted_version FROM users WHERE username=?',(name,)).fetchone()
        assert consent['terms_accepted_at']>0 and consent['terms_accepted_version']=='2026-11-18'
    # The real interface continues directly into the name popup; these helpers
    # intentionally re-enter the password/PIN flow, so end onboarding first.
    assert guest.post('/api/auth/logout').status_code==200
    assert guest.post('/api/auth/start',json={'username':name}).status_code==200
    challenge=guest.post('/api/auth/password',json={'username':name,'password':pw}).json()['challenge']
    assert guest.post('/api/auth/pin',json={'challenge':challenge,'pin':pin}).json()['ok'] is True
    assert guest.get('/api/me').json()['user']['onboarding_required'] is True
    named=guest.post('/api/me/display-name',json={'display_name':'Thành viên '+name})
    assert named.status_code==200,named.text
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
    assert admin.post(f'/api/admin/tickets/{ticket}/messages',json={'body':'Hãy cung cấp bằng chứng sở hữu.','admin_pin':'2345'}).status_code==200
    assert admin.post(f'/api/admin/tickets/{ticket}/grant',json={'username':'hoa_demo','verified':False}).status_code==422
    assert admin.post(f'/api/admin/tickets/{ticket}/grant',json={'username':'hoa_demo','verified':True}).status_code==401
    assert admin.post(f'/api/admin/tickets/{ticket}/grant',json={'username':'hoa_demo','verified':True, 'admin_pin':'2345'}).status_code==200
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
    assert admin.post(f'/api/admin/users/{u["id"]}/sanction',json={'kind':'lock','minutes':60,'reason':'Kiểm tra', 'admin_pin':'2345'}).status_code==200
    assert first.get('/api/me').json()['user'] is None
    assert first.post('/api/messages',json={'recipient_id':v['id'],'body':'Lẽ ra bị khóa'}).status_code in (401,403)
    assert admin.post(f'/api/admin/users/{u["id"]}/sanction',json={'kind':'unban', 'admin_pin':'2345'}).status_code==200


def test_admin_can_inspect_friends_and_one_private_thread_without_read_receipts():
    admin=logged_admin()
    alice=register_user(admin,'inspect_alice')
    bob=register_user(admin,'inspect_bob')
    carol=register_user(admin,'inspect_carol')
    aid,bid,cid=(c.get('/api/me').json()['user']['id'] for c in (alice,bob,carol))
    assert alice.post(f'/api/friends/request/{bid}').status_code==200
    assert bob.post(f'/api/friends/accept/{aid}').status_code==200
    assert carol.post(f'/api/friends/request/{aid}').status_code==200
    base=f'/api/admin/users/{aid}'
    assert bob.get(base+'/friends').status_code==403
    assert bob.get(base+'/messages',params={'peer_id':bid}).status_code==403
    friends=admin.get(base+'/friends',params={'limit':1}).json()
    assert friends['counts']=={'total':2,'accepted':1}
    assert friends['friends'][0]['id']==bid
    pending=admin.get(base+'/friends',params={'offset':friends['next_offset']}).json()
    assert pending['friends'][0]['requested_by']==cid
    assert pending['friends'][0]['state']=='pending'

    sent=alice.post('/api/messages',json={'recipient_id':bid,'body':'Kiểm tra tin nhắn thứ nhất'}).json()['message']
    assert bob.post('/api/messages',json={'recipient_id':aid,'body':'Kiểm tra tin nhắn thứ hai'}).status_code==200
    # A different conversation must stay out of the selected thread.
    with db() as c:
        c.execute("INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)",
                  (cid,aid,'Cuộc trò chuyện khác',sent['created_at']))
    sid=sent['id']
    params={'peer_id':bid,'limit':1}
    response=admin.get(base+'/messages',params=params)
    assert response.headers['cache-control']=='no-store'
    recent=response.json()
    assert [m['body'] for m in recent['messages']]==['Kiểm tra tin nhắn thứ hai']
    older=admin.get(base+'/messages',params={**params,'before':recent['next_before']}).json()
    assert [m['id'] for m in older['messages']]==[sid]
    assert older['next_before'] is None
    assert admin.get(base+'/messages',params={'peer_id':aid}).status_code==404
    with db() as c:
        rows=c.execute('SELECT read_at,delivered_at FROM messages WHERE id>=?',(sid,)).fetchall()
        assert all(row['read_at'] is None and row['delivered_at'] is None for row in rows)
    logs=admin.get('/api/admin/audit').json()['logs']
    assert any(log['action']=='admin_view_user_friends' for log in logs)
    assert any(log['action']=='moderation_messages' and f'peer_id={bid}' in log['detail'] for log in logs)


def test_permissions_and_capacity():
    admin=logged_admin()
    guest=TestClient(app);guest.get('/')
    assert guest.get('/api/admin/users').status_code==401
    assert guest.post('/api/auth/password',json={'username':'admin','password':'wrong'}).status_code==401
    assert admin.post('/api/admin/capacity',json={'max_users':1}).status_code==401
    assert admin.post('/api/admin/capacity',json={'max_users':1, 'admin_pin':'2345'}).status_code==200
    assert admin.post('/api/admin/broadcast',json={'body':'Thông báo'}).status_code==401
    assert admin.post('/api/admin/broadcast',json={'body':'Thông báo', 'admin_pin':'2345'}).status_code==200
    first=register_user(admin,'first_one')
    guest.post('/api/registration/request',json={'username':'second_one','phone':'0912345678'})
    rid=[r for r in admin.get('/api/admin/registrations').json()['registrations'] if r['username']=='second_one'][0]['id']
    assert admin.post(f'/api/admin/registrations/{rid}/decision',json={'approve':True,'admin_pin':'2345'}).status_code==409
    assert admin.post(f'/api/admin/registrations/{rid}/decision',json={'approve':False,'admin_pin':'2345'}).status_code==200
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
        assert admin.post(f'/api/admin/users/{alice_id}/sanction',json={'kind':'ban','reason':'Vi phạm', 'admin_pin':'2345'}).status_code==200
        event=alice_ws.receive_json()
        assert event['type']=='account-sanction' and event['kind']=='ban'
    assert alice.get('/api/me').json()['user'] is None


def test_new_member_ids_are_random_numeric_unique_and_searchable(monkeypatch):
    import app as core
    admin=logged_admin()
    original_admin=admin.get('/api/me').json()['user']['id']
    first=register_user(admin,'id_first')
    second=register_user(admin,'id_second')
    first_id=first.get('/api/me').json()['user']['id']
    second_id=second.get('/api/me').json()['user']['id']
    assert original_admin < core.MEMBER_ID_MIN
    assert all(isinstance(v,int) and core.MEMBER_ID_MIN<=v<=core.MEMBER_ID_MAX
               for v in (first_id,second_id))
    assert first_id!=second_id
    assert first.get('/api/me').json()['user']['id']==first_id
    assert second.get(f'/api/people/search?q={first_id}').json()['users'][0]['id']==first_id
    assert admin.get(f'/api/admin/users?q={first_id}').json()['users'][0]['id']==first_id
    assert not second.get('/api/people/search?q=1').json()['users'] or all(
        u['username']!='admin' for u in second.get('/api/people/search?q=1').json()['users'])

    # Force two real key collisions to confirm safe retries on both SQLite and PG.
    unused = next(n for n in range(1000,1100) if n not in (first_id,second_id))
    ids=iter((first_id,second_id,unused))
    monkeypatch.setattr(core,'random_member_id',lambda: next(ids))
    third=register_user(admin,'id_collision')
    assert third.get('/api/me').json()['user']['id']==unused
    assert admin.get('/api/me').json()['user']['id']==original_admin


def test_admin_online_list_matches_stats_and_groups_sockets_by_account():
    admin=logged_admin()
    member=register_user(admin,'online_admin_demo')
    member_id=member.get('/api/me').json()['user']['id']
    route='/api/admin/online-users'
    assert TestClient(app).get(route).status_code==401
    assert member.get(route).status_code==403
    assert admin.get(route).json()['users']==[]
    with member.websocket_connect('/ws'):
        with member.websocket_connect('/ws'):
            response=admin.get(route)
            assert response.status_code==200 and response.headers['cache-control']=='no-store'
            result=response.json()
            assert result['total']==admin.get('/api/admin/stats').json()['online']==1
            [online]=result['users']
            assert online['id']==member_id and online['username']=='online_admin_demo'
            assert online['sessions']==1 and online['connections']==2 and online['last_seen']>0
            assert set(online)=={'id','public_id','username','display_name','last_seen','sessions','connections'}
            # Ignore sockets whose backing sessions are no longer valid.
            with db() as c:
                c.execute('UPDATE sessions SET expires_at=0 WHERE user_id=?',(member_id,))
            assert admin.get(route).json()['total']==0
    assert admin.get(route).json()['total']==0
