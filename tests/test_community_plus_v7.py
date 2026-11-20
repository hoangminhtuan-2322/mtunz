"""Community V7 integration tests (test database only)."""
import pytest
from app import db,now,RATE_BUCKETS,hash_secret
from test_flows import logged_admin,register_user

@pytest.fixture(autouse=True)
def isolate():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('community_event_rsvps','community_events','sanction_appeals','world_poll_votes',
                      'world_poll_options','world_polls','message_edit_history','scheduled_messages',
                      'admin_pin_attempts','admin_login_requests','message_requests','user_reports',
                      'world_messages','world_penalties','message_pins','group_messages','group_members',
                      'chat_groups','reactions','chat_preferences','attachments','recovery_grants',
                      'ticket_messages','tickets','notifications','messages','friendships','blocks',
                      'restrictions','sessions','trusted_devices','login_challenges','registrations',
                      'audit','account_deletion_requests','support_rate_limits'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",(hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
        c.execute("UPDATE world_rooms SET active=CASE WHEN slug='general' THEN 1 ELSE 0 END")
    yield
    with db() as c:
        c.execute('DELETE FROM community_event_rsvps')
        c.execute('DELETE FROM community_events')
        c.execute('DELETE FROM sanction_appeals')
        c.execute('DELETE FROM sessions')
        c.execute('DELETE FROM admin_pin_attempts')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",(hash_secret('mtunz7'),))
    RATE_BUCKETS.clear()

def users():
    admin=logged_admin()
    assert admin.post('/api/me/pin/setup',json={'current_password':'mtunz7','pin':'2345','pin_length':4}).status_code==200
    a=register_user(admin,'plus_alice')
    b=register_user(admin,'plus_bob')
    return admin,a,b

def test_event_creation_and_attendance():
    admin,a,b=users()
    data={'room_id':1,'title':'Giao lưu lập trình','starts_at':now()+3600,'ends_at':now()+7200,'admin_pin':'2345'}
    assert admin.post('/api/admin/community/events',json={**data,'admin_pin':'0000'}).status_code==401
    r=admin.post('/api/admin/community/events',json=data)
    assert r.status_code==200,r.text
    eid=r.json()['id']
    assert a.get('/api/admin/community/events').status_code==403
    assert a.get('/api/community/events').json()['events'][0]['id']==eid
    assert a.post('/api/community/events/'+str(eid)+'/rsvp').json()['event']['attending']
    assert b.get('/api/community/events').json()['events'][0]['attendees']==1
    assert not a.post('/api/community/events/'+str(eid)+'/rsvp').json()['event']['attending']
    assert admin.post('/api/admin/community/events/'+str(eid)+'/cancel',
                      json={'canceled':True,'admin_pin':'2345'}).status_code==200
    assert a.get('/api/community/events').json()['events']==[]

def test_world_appeal_and_pin_review():
    admin,a,b=users()
    uid=a.get('/api/me').json()['user']['id']
    with db() as c:
        c.execute('INSERT INTO world_penalties(user_id,admin_muted_until,admin_reason) VALUES(?,?,?)',
                  (uid,now()+3600,'Spam'))
    r=a.post('/api/me/appeals',json={'reason':'Tôi muốn kháng nghị vì đây có thể là sự nhầm lẫn.'})
    assert r.status_code==200,r.text
    aid=r.json()['id']
    assert a.post('/api/me/appeals',json={'reason':'Tôi muốn xét lại lần thứ hai hôm nay'}).status_code==409
    assert b.get('/api/me/appeals').json()['appeals']==[]
    assert b.get('/api/admin/appeals').status_code==403
    assert admin.post('/api/admin/appeals/'+str(aid)+'/decision',
      json={'outcome':'accepted','note':'Đã xem xét đầy đủ','admin_pin':'0000'}).status_code==401
    ok=admin.post('/api/admin/appeals/'+str(aid)+'/decision',
      json={'outcome':'accepted','note':'Đã xem xét đầy đủ','admin_pin':'2345'})
    assert ok.status_code==200,ok.text
    with db() as c:
        assert c.execute('SELECT admin_muted_until FROM world_penalties WHERE user_id=?',(uid,)).fetchone()['admin_muted_until']==0

def test_private_readiness_and_full_reset_scope():
    admin,a,b=users()
    assert a.get('/api/admin/ops/security-readiness').status_code==403
    report=admin.get('/api/admin/ops/security-readiness')
    assert report.status_code==200,report.text
    assert 'pin_hash' not in report.text and 'password_hash' not in report.text
    r=admin.post('/api/admin/community/events',json={
      'room_id':1,'title':'Lịch giao lưu','starts_at':now()+3600,
      'ends_at':now()+7200,'admin_pin':'2345'})
    assert r.status_code==200,r.text
    preview=admin.get('/api/admin/data-reset/preview').json()
    assert any(x['table']=='community_events' for x in preview['all_scopes'])
    result=admin.post('/api/admin/data-reset',json={
        'confirm':'XOA TOAN BO NGUOI DUNG','expected_members':preview['members'],
        'revision':preview['revision'],'admin_pin':'2345'})
    assert result.status_code==200,result.text
    with db() as c:
        assert c.execute('SELECT COUNT(*) n FROM community_events').fetchone()['n']==0
    assert admin.get('/api/me').json()['user']['is_admin']
