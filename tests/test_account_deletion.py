"""Account deletion regression: user self-service, admin authority and FK cleanup.

Runs against an isolated SQLite test database. Never targets production Neon.
"""
import os
import sys
import hashlib
import tempfile
import time
from account_deletion import purge_due_deletions
from pathlib import Path

os.environ.setdefault('DATA_DIR', tempfile.mkdtemp(prefix='mtunz_deletion_tests_'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app import DATA_DIR, RATE_BUCKETS, app, db, hash_secret  # noqa: E402


CONFIRM = 'XOA VINH VIEN'
PASSWORD = 'StrongPassword456!'
PIN = '123456'


@pytest.fixture(autouse=True)
def reset_test_database():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in (
            'reactions','group_messages','group_members','chat_groups',
            'chat_preferences','attachments','recovery_grants',
            'ticket_messages','tickets','notifications','messages',
            'friendships','blocks','restrictions','sessions','trusted_devices',
            'login_challenges','registrations','audit','account_deletion_requests',
        ):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute(
            'UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL '
            "WHERE username='admin'", (hash_secret('mtunz7'),)
        )
    yield
    with db() as c:
        c.execute('DELETE FROM sessions')
        c.execute("UPDATE users SET pin_hash=NULL,pin_length=NULL WHERE username='admin'")


def login_admin():
    client = TestClient(app)
    assert client.post('/api/auth/start',json={'username':'admin'}).status_code == 200
    login = client.post('/api/auth/password', json={
        'username':'admin','password':'mtunz7'
    })
    assert login.status_code == 200, login.text
    protect = client.post('/api/me/pin/setup',json={
        'current_password':'mtunz7','pin':PIN,'pin_length':6
    })
    assert protect.status_code == 200, protect.text
    return client


def create_member(admin, name):
    client = TestClient(app)
    digits=int.from_bytes(hashlib.sha256(name.encode('utf-8')).digest()[:6],'big')%1_000_000_000
    phone='0'+str(digits).zfill(9)
    assert client.post('/api/registration/request',
                       json={'username':name,'phone':phone}).status_code == 200
    pending = admin.get('/api/admin/registrations').json()['registrations']
    ticket = next(x['id'] for x in pending if x['username'] == name)
    assert admin.post(f'/api/admin/registrations/{ticket}/decision',
                      json={'approve':True,'admin_pin':PIN}).status_code == 200
    assert client.post('/api/registration/complete',json={
        'username':name,'password':PASSWORD,'pin':PIN,'pin_length':6,'accepted_terms':True
    }).status_code == 200
    assert client.post('/api/auth/logout').status_code == 200
    auth = client.post('/api/auth/password',json={
        'username':name,'password':PASSWORD
    })
    assert auth.status_code == 200, auth.text
    challenge = auth.json()['challenge']
    pin = client.post('/api/auth/pin',json={'challenge':challenge,'pin':PIN})
    assert pin.status_code == 200,pin.text
    completed=client.post('/api/me/display-name',json={'display_name':'Thành viên '+name})
    assert completed.status_code == 200,completed.text
    return client, client.get('/api/me').json()['user']['id']


def login_member(client,name):
    challenge=client.post('/api/auth/password',json={'username':name,'password':PASSWORD})
    assert challenge.status_code==200,challenge.text
    return client.post('/api/auth/pin',json={'challenge':challenge.json()['challenge'],'pin':PIN})


def delete_payload(name, password=PASSWORD, pin=PIN, *, schedule=False):
    return {'username':name,'password':password,'pin':pin,
            'confirm':'XOA SAU 3 NGAY' if schedule else CONFIRM}


def test_self_delete_requires_live_password_pin_username_and_explicit_phrase():
    admin=login_admin()
    member,uid=create_member(admin,'wants_exit')
    endpoint='/api/me/delete'
    assert member.post(endpoint,json=delete_payload('wants_exit',password='bad',schedule=True)).status_code==401
    assert member.post(endpoint,json=delete_payload('wants_exit',pin='000000',schedule=True)).status_code==401
    assert member.post(endpoint,json=delete_payload('wrong_name',schedule=True)).status_code==422
    assert member.post(endpoint,json={**delete_payload('wants_exit'),'confirm':'YES'}).status_code==422
    with db() as c:
        assert c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone()


def test_self_delete_cleans_dependencies_and_preserves_surviving_group():
    admin=login_admin()
    member,uid=create_member(admin,'erase_self')
    friend,friend_id=create_member(admin,'still_here')
    # Recreate a realistic graph, including records with NO ACTION foreign keys.
    filename='a'*40+'.txt'
    uploads=Path(DATA_DIR)/'uploads'
    uploads.mkdir(parents=True,exist_ok=True)
    path=uploads/filename
    path.write_bytes(b'private attachment bytes')
    with db() as c:
        c.execute('INSERT INTO friendships(u1,u2,requested_by,state,created_at) '
                  'VALUES(?,?,?,?,?)',(min(uid,friend_id),max(uid,friend_id),uid,'accepted',1000))
        c.execute('INSERT INTO messages(sender_id,recipient_id,body,created_at) '
                  'VALUES(?,?,?,?)',(uid,friend_id,'private text',1000))
        dm_id=c.execute('SELECT id FROM messages WHERE sender_id=?',(uid,)).fetchone()['id']
        c.execute('INSERT INTO reactions(scope,message_id,user_id,emoji) VALUES(?,?,?,?)',
                  ('dm',dm_id,friend_id,'👍'))
        filecur=c.execute('INSERT INTO attachments(owner_id,stored_name,original_name,mime,size,created_at,file_content) '
                          'VALUES(?,?,?,?,?,?,?)',(uid,filename,'private.txt','text/plain',24,1000,b'private attachment bytes'))
        aid=filecur.lastrowid
        c.execute('INSERT INTO messages(sender_id,recipient_id,body,attachment_id,created_at) '
                  'VALUES(?,?,?,?,?)',(uid,friend_id,'',aid,1001))
        group=c.execute('INSERT INTO chat_groups(title,created_by,created_at) VALUES(?,?,?)',
                        ('Shared room',uid,1000)).lastrowid
        c.execute('INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',
                  (group,uid,'owner',1000))
        c.execute('INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',
                  (group,friend_id,'member',1001))
        sent=c.execute('INSERT INTO group_messages(group_id,sender_id,body,attachment_id,created_at) '
                       'VALUES(?,?,?,?,?)',(group,uid,'private group',aid,1002)).lastrowid
        kept=c.execute('INSERT INTO group_messages(group_id,sender_id,body,created_at) '
                       'VALUES(?,?,?,?)',(group,friend_id,'keep this message',1003)).lastrowid
        c.execute('INSERT INTO reactions(scope,message_id,user_id,emoji) VALUES(?,?,?,?)',
                  ('group',sent,friend_id,'👍'))
        c.execute('INSERT INTO reactions(scope,message_id,user_id,emoji) VALUES(?,?,?,?)',
                  ('group',kept,uid,'❤️'))
        empty_group=c.execute('INSERT INTO chat_groups(title,created_by,created_at) VALUES(?,?,?)',
                              ('Empty room',uid,1000)).lastrowid
        c.execute('INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',
                  (empty_group,uid,'owner',1000))
        lone=c.execute('INSERT INTO group_messages(group_id,sender_id,body,created_at) '
                       'VALUES(?,?,?,?)',(empty_group,uid,'bye',1004)).lastrowid
        c.execute('INSERT INTO reactions(scope,message_id,user_id,emoji) VALUES(?,?,?,?)',
                  ('group',lone,friend_id,'👍'))
        c.execute('INSERT INTO chat_preferences(user_id,other_id,muted) VALUES(?,?,?)',
                  (uid,friend_id,1))
        c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                  (uid,'private notice',1000))
        ticket=c.execute('INSERT INTO tickets(guest_id,owner_id,kind,claim,created_at) VALUES(?,?,?,?,?)',
                         ('guest-ref',uid,'password','private support',1000)).lastrowid
        c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) '
                  'VALUES(?,?,?,?)',(ticket,0,'support message',1000))
        c.execute('INSERT INTO recovery_grants(token_hash,ticket_id,user_id,kind,expires_at) '
                  'VALUES(?,?,?,?,?)',('recovery-key',ticket,uid,'password',99999))
    response=member.post('/api/me/delete',json=delete_payload('erase_self',schedule=True))
    assert response.status_code==200,response.text
    assert response.json()['pending'] is True
    assert response.json()['purge_at']-response.json()['requested_at']==3*86400
    assert member.get('/api/me').json()['user'] is None
    assert path.exists(),'Grace period must preserve uploaded content.'
    assert admin.get('/api/admin/deletions').json()['requests'][0]['username']=='erase_self'
    response=admin.post(f'/api/admin/users/{uid}/delete',
                        json={'username':'erase_self','confirm':CONFIRM,'admin_pin':PIN})
    assert response.status_code==200,response.text
    assert response.json()['deleted_user_id']==uid
    assert member.get('/api/me').json()['user'] is None
    assert not path.exists(),'Local uploaded file should be removed after commit'
    with db() as c:
        assert c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM users WHERE id=?',(friend_id,)).fetchone()
        assert c.execute('SELECT created_by FROM chat_groups WHERE id=?',(group,)).fetchone()['created_by']==friend_id
        assert c.execute('SELECT role FROM group_members WHERE group_id=? AND user_id=?',
                         (group,friend_id)).fetchone()['role']=='owner'
        assert c.execute('SELECT 1 FROM chat_groups WHERE id=?',(empty_group,)).fetchone() is None
        assert c.execute('SELECT 1 FROM group_messages WHERE id=?',(kept,)).fetchone()
        assert c.execute('SELECT 1 FROM group_messages WHERE sender_id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM messages WHERE sender_id=? OR recipient_id=?',
                         (uid,uid)).fetchone() is None
        assert c.execute('SELECT 1 FROM attachments WHERE owner_id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM reactions WHERE user_id=? OR message_id IN (?,?,?)',
                         (uid,dm_id,sent,lone)).fetchone() is None
        assert c.execute('SELECT 1 FROM ticket_messages WHERE ticket_id=?',(ticket,)).fetchone() is None
        assert c.execute('SELECT 1 FROM tickets WHERE id=?',(ticket,)).fetchone() is None
        assert c.execute('SELECT 1 FROM recovery_grants WHERE user_id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM sessions WHERE user_id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM registrations WHERE username=?',('erase_self',)).fetchone() is None
    assert friend.get('/api/me').json()['user']['username']=='still_here'
    assert friend.get('/api/groups').status_code==200
    assert member.post('/api/auth/start',json={'username':'erase_self'}).status_code==404


def test_admin_permanent_delete_requires_pin_and_never_deletes_admin():
    admin=login_admin()
    target,uid=create_member(admin,'remove_target')
    other,other_id=create_member(admin,'keep_target')
    payload={'username':'remove_target','confirm':CONFIRM,'admin_pin':PIN}
    guest=TestClient(app)
    assert guest.post(f'/api/admin/users/{uid}/delete',json=payload).status_code==401
    assert other.post(f'/api/admin/users/{uid}/delete',json=payload).status_code==403
    assert admin.post('/api/admin/users/1/delete',
                      json={'username':'admin','confirm':CONFIRM,'admin_pin':PIN}).status_code==404
    assert admin.post(f'/api/admin/users/{uid}/delete',
                      json={**payload,'admin_pin':'000000'}).status_code==401
    assert admin.post(f'/api/admin/users/{uid}/delete',
                      json={**payload,'username':'keep_target'}).status_code==422
    assert target.get('/api/me').json()['user']['username']=='remove_target'
    response=admin.post(f'/api/admin/users/{uid}/delete',json=payload)
    assert response.status_code==200,response.text
    assert response.json()['deleted_user_id']==uid
    assert target.get('/api/me').json()['user'] is None
    assert admin.get('/api/me').json()['user']['is_admin']
    assert other.get('/api/me').json()['user']['id']==other_id
    with db() as c:
        assert c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone() is None
        assert c.execute('SELECT 1 FROM users WHERE id=1 AND is_admin=1').fetchone()
        assert c.execute("SELECT 1 FROM audit WHERE action='permanent_user_delete'").fetchone()


def test_three_day_cancellation_is_authenticated_and_preserves_data():
    admin=login_admin()
    member,uid=create_member(admin,'reconsider')
    created=member.post('/api/me/delete',json=delete_payload('reconsider',schedule=True))
    assert created.status_code==200,created.text
    deadline=created.json()['purge_at']
    assert member.get('/api/me').json()['user'] is None
    assert TestClient(app).post('/api/me/delete/keep',json={'confirm':True}).status_code==401
    login=login_member(member,'reconsider')
    assert login.status_code==200,login.text
    held=member.get('/api/me').json()['user']
    assert held=={'id':uid,'is_admin':False,'deletion_purge_at':deadline}
    assert member.get('/api/friends').status_code==423
    assert member.post('/api/me/delete/keep',json={'confirm':False}).status_code==422
    assert member.post('/api/me/delete',json=delete_payload('reconsider',schedule=True)).status_code==423
    status=member.get('/api/me/deletion').json()
    assert status['pending'] is True and status['purge_at']==deadline
    assert admin.get('/api/admin/deletions').json()['requests'][0]['user_id']==uid
    users=admin.get('/api/admin/users')
    assert users.status_code==200,users.text
    item=next(u for u in users.json()['users'] if u['id']==uid)
    assert item['deletion_purge_at']==deadline
    url='/api/me/delete/cancel'
    assert member.post(url,json={'password':'wrong','pin':PIN}).status_code==401
    assert member.post(url,json={'password':PASSWORD,'pin':'000000'}).status_code==401
    restricted_cookie=member.cookies.get('s')
    assert member.post('/api/me/delete/keep',json={'confirm':True}).status_code==200
    assert member.cookies.get('s')!=restricted_cookie
    assert member.get('/api/friends').status_code==200
    assert member.get('/api/me/deletion').json()['pending'] is False
    assert member.get('/api/me').json()['user']['id']==uid
    assert admin.get('/api/admin/deletions').json()['requests']==[]
    assert member.post(url,json={'password':PASSWORD,'pin':PIN}).status_code==409


def test_scheduled_purge_is_idempotent_and_never_early():
    admin=login_admin()
    member,uid=create_member(admin,'expired_plan')
    created=member.post('/api/me/delete',json=delete_payload('expired_plan',schedule=True))
    assert created.status_code==200
    now_ts=int(time.time())
    assert purge_due_deletions(db,now_ts)==[]
    with db() as c:
        assert c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone()
        c.execute('UPDATE account_deletion_requests SET purge_at=? WHERE user_id=?',
                  (now_ts-1,uid))
    expired=login_member(member,'expired_plan')
    assert expired.status_code==410,expired.text
    assert member.post('/api/me/delete/keep',json={'confirm':True}).status_code==401
    completed=purge_due_deletions(db,now_ts)
    assert [x['deleted_user_id'] for x in completed]==[uid]
    assert purge_due_deletions(db,now_ts)==[]
    assert member.get('/api/me').json()['user'] is None
    assert admin.get('/api/admin/deletions').json()['requests']==[]


def test_admin_immediate_delete_requires_enrolled_pin():
    admin=login_admin()
    member,uid=create_member(admin,'protect_user')
    with db() as c:
        c.execute("UPDATE users SET pin_hash=NULL,pin_length=NULL WHERE username='admin'")
    response=admin.post(f'/api/admin/users/{uid}/delete',
                        json={'username':'protect_user','confirm':CONFIRM,'admin_pin':PIN})
    assert response.status_code==403
    assert member.get('/api/me').json()['user']['id']==uid


def test_push_reminder_is_persisted_once_inside_the_last_day(monkeypatch):
    import app as core
    import web_notifications as push
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization

    admin=login_admin()
    member,uid=create_member(admin,'remind_me')
    key=ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    payload={'endpoint':'https://fcm.googleapis.com/fcm/send/disposable-test-subscription',
             'keys':{'p256dh':push.b64(key),'auth':push.b64(b'a'*16)}}
    assert member.post('/api/me/push',json=payload).status_code==200
    assert member.get('/api/me/push').json()['enabled']
    assert member.post('/api/me/delete',json=delete_payload('remind_me',schedule=True)).status_code==200
    sent=[]
    class Delivered:
        status_code=201
    monkeypatch.setattr(push,'webpush',lambda sub,**kw: sent.append(kw['data']) or Delivered())
    core.process_deletion_reminders()
    assert sent==[]
    with db() as c:
        c.execute('UPDATE account_deletion_requests SET purge_at=? WHERE user_id=?',(core.now()+3600,uid))
    core.process_deletion_reminders()
    core.process_deletion_reminders()
    assert len(sent)==1 and '"type": "deletion"' in sent[0]
    assert 'remind_me' not in sent[0]
    with db() as c:
        assert c.execute('SELECT reminded_at FROM account_deletion_requests WHERE user_id=?',(uid,)).fetchone()['reminded_at']
