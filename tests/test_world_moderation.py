"""World Chat moderation: tested against disposable SQLite only.

The five-in-three-second rule and its three-warning ladder are enforced by
PostgreSQL/SQLite state, never only in the browser.
"""
import pytest
from fastapi.testclient import TestClient
import app as core
from app import app, db, RATE_BUCKETS, hash_secret
from test_flows import logged_admin, register_user


@pytest.fixture(autouse=True)
def reset_world():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('user_reports','world_messages','world_penalties','message_pins',
                      'group_messages','group_members','chat_groups','reactions','chat_preferences',
                      'attachments','recovery_grants','ticket_messages','tickets','notifications',
                      'messages','friendships','blocks','restrictions','sessions','trusted_devices',
                      'login_challenges','registrations','audit','account_deletion_requests'):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute('UPDATE world_settings SET enabled=0,schedule_enabled=0,open_minute=540,close_minute=1320')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
    yield
    with db() as c:
        c.execute('DELETE FROM user_reports')
        c.execute('DELETE FROM world_messages')
        c.execute('DELETE FROM world_penalties')
        c.execute('UPDATE world_settings SET enabled=0,schedule_enabled=0')


def admin_config(admin, enabled=True, scheduled=False, start=540, end=1320):
    return admin.post('/api/admin/world/config',json={
        'enabled':enabled,'schedule_enabled':scheduled,
        'open_minute':start,'close_minute':end,'admin_pin':'2345'
    })


def test_world_is_coming_soon_by_default_but_readable_when_admin_closes():
    admin=logged_admin()
    alice=register_user(admin,'world_alice')
    status=alice.get('/api/world/status')
    assert status.status_code==200 and status.json()['enabled'] is False
    assert alice.get('/api/world/messages').json()['messages']==[]
    assert alice.post('/api/world/messages',json={'body':'Xin chào'}).status_code==403
    enabled=admin_config(admin)
    assert enabled.status_code==200,enabled.text
    assert alice.get('/api/world/status').json()['open'] is True
    sent=alice.post('/api/world/messages',json={'body':'Xin chào mọi người'})
    assert sent.status_code==200,sent.text
    assert 'username' not in sent.json()['message']
    assert alice.get('/api/world/messages').json()['messages'][0]['body']=='Xin chào mọi người'
    assert admin_config(admin,enabled=False).status_code==200
    assert alice.get('/api/world/messages').json()['messages'][0]['body']=='Xin chào mọi người'
    assert alice.post('/api/world/messages',json={'body':'Đã đóng'}).status_code==403



def test_anonymous_alias_persists_per_message_without_exposing_account_identity():
    admin=logged_admin()
    alice=register_user(admin,'world_alias_alice')
    bob=register_user(admin,'world_alias_bob')
    assert admin_config(admin).status_code==200
    assert alice.patch('/api/me/social',json={'world_anonymous':True}).status_code==200
    first=alice.post('/api/world/messages',json={'body':'Xin chào','anonymous_name':'Mây Đêm'})
    assert first.status_code==200,first.text
    message=first.json()['message']
    assert message['anonymous'] is True
    assert message['display_name']=='Mây Đêm' and message['sender_id']==0
    assert 'username' not in message
    public=bob.get('/api/world/messages').json()['messages'][0]
    assert public['display_name']=='Mây Đêm' and public['sender_id']==0
    assert public['anonymous_name'] is None
    assert alice.get('/api/world/messages').json()['messages'][0]['is_mine'] is True

    second=alice.post('/api/world/messages',json={'body':'Đổi biệt danh','anonymous_name':'Sao Khuya'})
    assert second.status_code==200,second.text
    names=[msg['display_name'] for msg in bob.get('/api/world/messages').json()['messages']]
    assert names==['Mây Đêm','Sao Khuya']
    admin_messages=admin.get('/api/admin/world').json()['recent_messages']
    assert admin_messages[0]['sender_id']==alice.get('/api/me').json()['user']['id']
    assert admin_messages[0]['anonymous_name']=='Sao Khuya'

    forbidden=alice.post('/api/world/messages',json={'body':'Không giả mạo Admin','anonymous_name':'Admin'})
    assert forbidden.status_code==422
    too_short=alice.post('/api/world/messages',json={'body':'Tên ngắn','anonymous_name':'X'})
    assert too_short.status_code==422
    assert alice.patch('/api/me/social',json={'world_anonymous':False}).status_code==200
    normal=alice.post('/api/world/messages',json={'body':'Tin công khai','anonymous_name':'Giả Danh'})
    assert normal.status_code==200,normal.text
    assert normal.json()['message']['anonymous'] is False
    assert normal.json()['message']['display_name']!='Giả Danh'


def test_world_daily_schedule_supports_cross_midnight_and_on_demand_changes():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    admin=logged_admin()
    alice=register_user(admin,'world_scheduler')
    minute=datetime.fromtimestamp(core.now(),ZoneInfo('Asia/Ho_Chi_Minh')).hour*60+datetime.fromtimestamp(core.now(),ZoneInfo('Asia/Ho_Chi_Minh')).minute
    # A schedule including the current minute is open.
    assert admin_config(admin,scheduled=True,start=(minute-30)%1440,end=(minute+30)%1440).status_code==200
    assert alice.get('/api/world/status').json()['open'] is True
    # A schedule 1-2h into the future is currently closed.
    assert admin_config(admin,scheduled=True,start=(minute+60)%1440,end=(minute+120)%1440).status_code==200
    s=alice.get('/api/world/status').json()
    assert s['open'] is False and s['next_change_at']>core.now()
    assert s['timezone']=='Asia/Ho_Chi_Minh'
    assert admin_config(admin,scheduled=True,start=30,end=30).status_code==422


def test_spam_warning_three_strikes_and_automatic_mute_only_world():
    admin=logged_admin()
    alice=register_user(admin,'world_spam_a')
    bob=register_user(admin,'world_spam_b')
    a,b=alice.get('/api/me').json()['user']['id'],bob.get('/api/me').json()['user']['id']
    assert alice.post(f'/api/friends/request/{b}').status_code==200
    assert bob.post(f'/api/friends/accept/{a}').status_code==200
    assert admin_config(admin).status_code==200
    for round in range(3):
        for i in range(4):
            assert alice.post('/api/world/messages',json={'body':'Test '+str(round)+'-'+str(i)}).status_code==200
        warning=alice.post('/api/world/messages',json={'body':'Tin thứ 5'})
        assert warning.status_code==(429 if round<2 else 423),warning.text
        data=warning.json()['detail']
        if round<2:
            assert data['code']=='world_spam_warning'
            assert data['warnings']==round+1
        else:
            assert data['code']=='world_muted'
            assert data['strikes']==1
            assert data['duration_seconds']==12*3600
    s=alice.get('/api/world/status').json()
    assert s['muted_until']>core.now() and s['strikes']==1
    assert alice.post('/api/world/messages',json={'body':'Không được gửi'}).status_code==423
    assert alice.get('/api/world/messages').status_code==200
    # The world-only penalty must not touch DMs or group messaging.
    assert alice.post('/api/messages',json={'recipient_id':b,'body':'Chat riêng vẫn ổn'}).status_code==200
    group=alice.post('/api/groups',json={'title':'Nhóm không bị phạt','member_ids':[b]})
    assert group.status_code==200,group.text
    gid=group.json()['id']
    assert alice.post(f'/api/groups/{gid}/messages',json={'body':'Nhóm vẫn ổn'}).status_code==200


def test_penalty_ladder_and_30_day_clean_period_reset():
    admin=logged_admin()
    alice=register_user(admin,'world_ladder')
    assert admin_config(admin).status_code==200
    for tier,duration in enumerate((12*3600,86400,3*86400,7*86400,15*86400),start=1):
        for wave in range(3):
            for attempt in range(5):
                r=alice.post('/api/world/messages',json={'body':'Cảnh báo '+str(tier)+' '+str(wave)+' '+str(attempt)})
                if attempt<4:
                    assert r.status_code==200,(tier,wave,attempt,r.text)
                elif wave<2:
                    assert r.status_code==429,(tier,wave,attempt,r.text)
                else:
                    assert r.status_code==423,(tier,wave,attempt,r.text)
                    detail=r.json()['detail']
                    assert detail['strikes']==tier
                    assert detail['duration_seconds']==duration
                    assert detail['account_locked'] is (tier==5)
        if tier<5:
            with db() as c:
                c.execute('UPDATE world_penalties SET world_muted_until=0 WHERE user_id=?',
                          (alice.get('/api/me').json()['user']['id'],))
    assert alice.get('/api/me').status_code==403
    with db() as c:
        row=c.execute('SELECT sanction_kind,sanction_until FROM users WHERE username=?',('world_ladder',)).fetchone()
        assert row['sanction_kind']=='lock' and row['sanction_until']>core.now()+14*86400
        # Simulate 30 penalty-free days and completed lock for retention policy.
        c.execute("UPDATE users SET sanction_kind=NULL,sanction_until=NULL,sanction_reason=NULL WHERE username='world_ladder'")
        c.execute('''UPDATE world_penalties SET last_violation_at=?,world_muted_until=0 WHERE
                     user_id=(SELECT id FROM users WHERE username=?)''',
                  (core.now()-31*86400,'world_ladder'))
    fresh=alice.get('/api/world/status').json()
    assert fresh['strikes']==0 and fresh['warnings']==0
    assert alice.post('/api/world/messages',json={'body':'Tôi đã thay đổi'}).status_code==200


def test_admin_can_mute_and_reset_world_without_disabling_private_messages():
    admin=logged_admin()
    alice=register_user(admin,'world_manual')
    bob=register_user(admin,'world_manual_friend')
    a,b=alice.get('/api/me').json()['user']['id'],bob.get('/api/me').json()['user']['id']
    assert alice.post(f'/api/friends/request/{b}').status_code==200
    assert bob.post(f'/api/friends/accept/{a}').status_code==200
    assert admin_config(admin).status_code==200
    bad=admin.post('/api/admin/world/mute',json={'user_id':a,'minutes':720,'reason':'Vi phạm nội quy','admin_pin':'0000'})
    assert bad.status_code==401
    mute=admin.post('/api/admin/world/mute',json={
        'user_id':a,'minutes':720,'reason':'Spam cộng đồng','admin_pin':'2345'})
    assert mute.status_code==200,mute.text
    assert alice.get('/api/world/status').json()['muted_until']>core.now()
    assert alice.post('/api/world/messages',json={'body':'Bị khóa'}).status_code==423
    assert alice.post('/api/messages',json={'recipient_id':b,'body':'Chat bạn bè'}).status_code==200
    assert admin.post('/api/admin/world/reset',json={
        'user_id':a,'reason':'Đã kiểm chứng', 'admin_pin':'2345'}).status_code==200
    # Reset escalation must not remove an admin-imposed world mute.
    assert alice.get('/api/world/status').json()['muted_until']>core.now()
    assert admin.post('/api/admin/world/mute',json={
        'user_id':a,'minutes':0,'reason':'Đã gỡ hạn chế','admin_pin':'2345'}).status_code==200
    assert alice.post('/api/world/messages',json={'body':'Hết hạn chế'}).status_code==200


def test_member_reports_are_permission_checked_and_admin_reviews_are_logged():
    admin=logged_admin()
    alice=register_user(admin,'world_report_alice')
    bob=register_user(admin,'world_report_bob')
    a,b=alice.get('/api/me').json()['user']['id'],bob.get('/api/me').json()['user']['id']
    assert admin_config(admin).status_code==200
    msg=bob.post('/api/world/messages',json={'body':'Vi phạm cần xem xét'})
    assert msg.status_code==200,msg.text
    mid=msg.json()['message']['id']
    payload={'target_id':b,'reason':'spam','description':'Tài khoản quảng cáo và quấy rầy',
             'scope':'world','message_id':mid}
    submit=alice.post('/api/reports',json=payload)
    assert submit.status_code==200,submit.text
    rid=submit.json()['report_id']
    assert alice.post('/api/reports',json=payload).status_code==429
    assert alice.post('/api/reports',json={**payload,'target_id':a}).status_code==403
    assert alice.post('/api/reports',json={**payload,'message_id':mid+1}).status_code==403
    assert bob.get('/api/admin/reports').status_code==403
    items=admin.get('/api/admin/reports').json()['reports']
    assert items[0]['id']==rid and items[0]['evidence']=='Vi phạm cần xem xét'
    fail=admin.post(f'/api/admin/reports/{rid}/review',json={
        'decision':'reviewed','note':'Đã kiểm tra','admin_pin':'0000'})
    assert fail.status_code==401
    reviewed=admin.post(f'/api/admin/reports/{rid}/review',json={
        'decision':'reviewed','note':'Đã đối soát nội dung','admin_pin':'2345'})
    assert reviewed.status_code==200,reviewed.text
    assert admin.post(f'/api/admin/reports/{rid}/review',json={
        'decision':'dismissed','note':'Không phù hợp','admin_pin':'2345'}).status_code==409
    with db() as c:
        audit=c.execute("SELECT action FROM audit WHERE action='member_report_review' ORDER BY id DESC LIMIT 1").fetchone()
        assert audit and audit['action']=='member_report_review'
    assert alice.get('/api/notifications').json()['notifications'][0]['body'].startswith('Báo cáo #')
    # Even if moderators resolve earlier reports, a reporter cannot flood the
    # same hour with unlimited fresh records.
    for _ in range(5):
        again=alice.post('/api/reports',json=payload)
        assert again.status_code==200,again.text
        with db() as c:
            c.execute("UPDATE user_reports SET status='dismissed' WHERE id=?",
                      (again.json()['report_id'],))
    assert alice.post('/api/reports',json=payload).status_code==429


def test_reports_from_private_and_group_messages_verify_read_access():
    admin=logged_admin()
    alice=register_user(admin,'report_dm_alice')
    bob=register_user(admin,'report_dm_bob')
    outsider=register_user(admin,'report_outsider')
    a=alice.get('/api/me').json()['user']['id']
    b=bob.get('/api/me').json()['user']['id']
    assert alice.post(f'/api/friends/request/{b}').status_code==200
    assert bob.post(f'/api/friends/accept/{a}').status_code==200
    direct=bob.post('/api/messages',json={'recipient_id':a,'body':'Tin nhắn cần xem xét'})
    assert direct.status_code==200,direct.text
    mid=direct.json()['message']['id']
    dm_payload={'target_id':b,'scope':'dm','message_id':mid,'reason':'harassment',
                'description':'Người gửi thường xuyên quấy rối'}
    dm=alice.post('/api/reports',json=dm_payload)
    assert dm.status_code==200,dm.text
    assert outsider.post('/api/reports',json=dm_payload).status_code==403
    # Admin has resolved the first case. Another message in a group is
    # independently reportable, with group membership verified server-side.
    with db() as c:
        c.execute("UPDATE user_reports SET status='reviewed' WHERE id=?",
                  (dm.json()['report_id'],))
    group=alice.post('/api/groups',json={'title':'Cộng đồng nhỏ','member_ids':[b]})
    assert group.status_code==200,group.text
    gid=group.json()['id']
    posted=bob.post(f'/api/groups/{gid}/messages',json={'body':'Tin nhắn nhóm cần kiểm tra'})
    assert posted.status_code==200,posted.text
    group_mid=posted.json()['message']['id']
    group_payload={'target_id':b,'scope':'group','group_id':gid,'message_id':group_mid,
                   'reason':'spam','description':'Spam vào phòng nhóm liên tục'}
    ok=alice.post('/api/reports',json=group_payload)
    assert ok.status_code==200,ok.text
    bad=outsider.post('/api/reports',json=group_payload)
    assert bad.status_code==403,bad.text
    reports=admin.get('/api/admin/reports?status=all').json()['reports']
    found=next(x for x in reports if x['id']==ok.json()['report_id'])
    assert found['evidence']=='Tin nhắn nhóm cần kiểm tra'
    assert found['scope']=='group' and found['source_group_id']==gid
