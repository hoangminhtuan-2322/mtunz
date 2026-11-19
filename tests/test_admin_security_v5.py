"""Security V5 regressions. Tests run against disposable SQLite only."""
import pytest
from app import app, db, now, RATE_BUCKETS, hash_secret
from fastapi.testclient import TestClient
from test_flows import logged_admin, register_user


@pytest.fixture(autouse=True)
def clean_security_v5():
    RATE_BUCKETS.clear()
    with db() as c:
        for name in ('scheduled_messages','admin_pin_attempts','admin_login_requests',
                     'message_requests','user_reports','world_messages','world_penalties',
                     'message_pins','group_messages','group_members','chat_groups',
                     'reactions','chat_preferences','attachments','recovery_grants',
                     'ticket_messages','tickets','notifications','messages','friendships',
                     'blocks','restrictions','sessions','trusted_devices',
                     'login_challenges','registrations','audit',
                     'account_deletion_requests','support_rate_limits'):
            c.execute('DELETE FROM '+name)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
        c.execute("UPDATE settings SET value='0' WHERE key='emergency_lockdown'")
        c.execute('UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1')
    yield
    with db() as c:
        c.execute('DELETE FROM admin_pin_attempts')
        c.execute('DELETE FROM sessions')
        c.execute('DELETE FROM admin_login_requests')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='0' WHERE key='emergency_lockdown'")
    RATE_BUCKETS.clear()


def admin_with_pin():
    admin=logged_admin()
    resp=admin.post('/api/me/pin/setup',json={'current_password':'mtunz7','pin':'2345','pin_length':4})
    assert resp.status_code==200,resp.text
    return admin


def test_security_status_admin_only_and_content_not_disclosed():
    admin=admin_with_pin()
    other=TestClient(app)
    assert other.get('/api/admin/security/overview').status_code==401
    details=admin.get('/api/admin/security/overview')
    assert details.status_code==200,details.text
    v=details.json()
    assert v['pin_enabled'] is True
    assert v['admin_sessions']==1
    assert v['session_limit']==2
    assert 'password_hash' not in details.text
    assert 'pin_hash' not in details.text
    assert 'token_hash' not in details.text


def test_failed_admin_pin_proof_is_durable_and_lockout_survives_same_session():
    admin=admin_with_pin()
    for i in range(5):
        r=admin.post('/api/admin/security/revoke-others',json={'admin_pin':'0000'})
        assert r.status_code==(429 if i==4 else 401),r.text
    with db() as c:
        row=c.execute('SELECT failures,locked_until FROM admin_pin_attempts').fetchone()
        assert row['failures']==5 and row['locked_until']>=now()+899
    assert admin.post('/api/admin/security/revoke-others',json={'admin_pin':'2345'}).status_code==429
    with db() as c:
        c.execute('UPDATE admin_pin_attempts SET locked_until=?,failures=0',(now()-1,))
    assert admin.post('/api/admin/security/revoke-others',json={'admin_pin':'2345'}).status_code==200
    with db() as c:
        assert c.execute('SELECT COUNT(*) n FROM admin_pin_attempts').fetchone()['n']==0


def test_emergency_lockdown_is_pin_gated_and_blocks_new_content_not_history():
    admin=admin_with_pin()
    alice=register_user(admin,'v5_alice')
    bob=register_user(admin,'v5_bob')
    aid=alice.get('/api/me').json()['user']['id']
    bid=bob.get('/api/me').json()['user']['id']
    assert alice.post('/api/friends/request/'+str(bid)).status_code==200
    assert bob.post('/api/friends/accept/'+str(aid)).status_code==200
    assert alice.post('/api/messages',json={'recipient_id':bid,'body':'Tin cũ'}).status_code==200
    bad=admin.post('/api/admin/security/lockdown',json={'enabled':True,'admin_pin':'0000'})
    assert bad.status_code==401
    enabled=admin.post('/api/admin/security/lockdown',json={'enabled':True,'admin_pin':'2345'})
    assert enabled.status_code==200,enabled.text
    assert alice.post('/api/messages',json={'recipient_id':bid,'body':'Bị chặn'}).status_code==423
    assert alice.post('/api/scheduled-messages',
                      json={'recipient_id':bid,'body':'Đợi','send_at':now()+180}).status_code==423
    assert bob.get('/api/messages/'+str(aid)).json()['messages'][0]['body']=='Tin cũ'
    assert admin.get('/api/admin/security/overview').json()['emergency_lockdown'] is True
    disabled=admin.post('/api/admin/security/lockdown',json={'enabled':False,'admin_pin':'2345'})
    assert disabled.status_code==200,disabled.text
    assert alice.post('/api/messages',json={'recipient_id':bid,'body':'Đã mở'}).status_code==200


def test_full_reset_requires_revision_and_preserves_admin_secrets_and_session():
    admin=admin_with_pin()
    a=register_user(admin,'v5_reset_alice')
    b=register_user(admin,'v5_reset_bob')
    aid=a.get('/api/me').json()['user']['id']
    bid=b.get('/api/me').json()['user']['id']
    a.post('/api/friends/request/'+str(bid))
    b.post('/api/friends/accept/'+str(aid))
    assert a.post('/api/messages',json={'recipient_id':bid,'body':'Xóa sau reset'}).status_code==200
    scheduled=a.post('/api/scheduled-messages',json={
        'recipient_id':bid,'body':'Không được gửi','send_at':now()+360})
    assert scheduled.status_code==200,scheduled.text
    with db() as c:
        before=c.execute("SELECT username,password_hash,pin_hash,pin_length FROM users WHERE is_admin=1").fetchone()
        admin_secret=tuple(before[k] for k in ('username','password_hash','pin_hash','pin_length'))
    preview=admin.get('/api/admin/data-reset/preview')
    assert preview.status_code==200,preview.text
    data=preview.json()
    assert data['members']==2
    assert data['scheduled_messages']==1 and data['direct_messages']==1
    payload={'confirm':'XOA TOAN BO NGUOI DUNG','expected_members':2,
             'revision':data['revision'],'admin_pin':'2345'}
    # No revision means no deletion is permitted.
    assert admin.post('/api/admin/data-reset',json={
        'confirm':'XOA TOAN BO NGUOI DUNG','expected_members':2,'admin_pin':'2345'}).status_code==422
    assert a.post('/api/messages',json={'recipient_id':bid,'body':'Thay đổi thống kê'}).status_code==200
    assert admin.post('/api/admin/data-reset',json=payload).status_code==409
    payload['revision']=admin.get('/api/admin/data-reset/preview').json()['revision']
    erased=admin.post('/api/admin/data-reset',json=payload)
    assert erased.status_code==200,erased.text
    assert erased.json()['admin_preserved'] is True
    with db() as c:
        current=c.execute("SELECT username,password_hash,pin_hash,pin_length FROM users WHERE is_admin=1").fetchone()
        assert tuple(current[k] for k in ('username','password_hash','pin_hash','pin_length'))==admin_secret
        for table in ('scheduled_messages','message_requests','attachments','world_messages',
                      'messages','registrations','notifications','user_reports','tickets','audit'):
            count=c.execute('SELECT COUNT(*) n FROM '+table).fetchone()['n']
            assert count==(1 if table=='audit' else 0),(table,count)
        assert c.execute('SELECT COUNT(*) n FROM users WHERE is_admin=0').fetchone()['n']==0
        assert c.execute('SELECT COUNT(*) n FROM sessions').fetchone()['n']==1
        assert c.execute("SELECT value FROM settings WHERE key='max_users'").fetchone()['value']=='100'
        assert c.execute('SELECT enabled,schedule_enabled FROM world_settings WHERE id=1').fetchone()['enabled']==0
    assert a.get('/api/me').json()['user'] is None
    assert admin.get('/api/me').json()['user']['is_admin']
    assert admin.get('/api/admin/data-reset/preview').json()['members']==0


def test_revoke_others_clears_pending_admin_second_session_without_current_logout():
    admin=admin_with_pin()
    second=TestClient(app)
    second.get('/')
    p=second.post('/api/auth/password',json={'username':'admin','password':'mtunz7'})
    assert p.status_code==200
    waiting=second.post('/api/auth/pin',json={'challenge':p.json()['challenge'],'pin':'2345'})
    assert waiting.status_code==200 and waiting.json()['next']=='admin-approval'
    assert admin.get('/api/admin/login-approvals').json()['pending']
    removed=admin.post('/api/admin/security/revoke-others',json={'admin_pin':'2345'})
    assert removed.status_code==200,removed.text
    assert admin.get('/api/admin/login-approvals').json()['pending']==[]
    assert admin.get('/api/me').json()['user']['is_admin'] is True
    assert second.post('/api/auth/admin/approval/status',
                       json={'approval_token':waiting.json()['approval_token']}).status_code==404
