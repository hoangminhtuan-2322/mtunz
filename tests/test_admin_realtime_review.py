"""V14 admin-only account review and realtime activity, disposable SQLite fixtures."""
import asyncio

import pytest
import app as core
from app import db, now
from test_messenger_v4 import pair, clean_v4


@pytest.fixture(autouse=True)
def isolate_v14(clean_v4):
    yield


def test_admin_account_review_is_audited_and_excludes_secrets():
    admin, alice, bob, aid, bid = pair()
    with db() as c:
        c.execute('''INSERT INTO user_reports(reporter_id,target_id,reason,description,scope,created_at)
                     VALUES(?,?,?,?,?,?)''',(bid,aid,'Lừa đảo nghi vấn',
                                                    'Báo cáo cần xác minh','direct',now()))
        c.execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES(?,?)',(bid,aid))
    assert bob.get(f'/api/admin/users/{aid}/details').status_code==403
    assert alice.get(f'/api/admin/users/{aid}/details').status_code==403
    details=admin.get(f'/api/admin/users/{aid}/details')
    assert details.status_code==200,details.text
    u=details.json()['user']
    assert u['id']==aid
    assert u['public_id']>0
    assert u['created_at']>0
    assert u['terms_accepted_at']>0
    assert u['registration']['status']=='completed'
    assert u['contact_verified'] is False
    assert u['reports']['total']==1 and u['reports']['pending']==1
    assert u['recent_reports'][0]['reason']=='Lừa đảo nghi vấn'
    assert u['blocks_received']==1
    assert u['friend_count']==1
    assert u['contacts'][0]['id']==bid
    assert u['session_count']>=1
    assert u['last_active_session_at']>0
    assert u['online'] is False
    for forbidden in ('password_hash','pin_hash','token_hash','session_hash',
                      'recovery_code','ip_address','guest_id'):
        assert forbidden not in u
    assert admin.get(f'/api/admin/audit?q=user_id%3D{aid}').status_code==200
    logs=admin.get('/api/admin/audit').json()['logs']
    assert any(a['action']=='admin_view_user_details' and a['detail']==f'user_id={aid}'
               for a in logs)

    own_friends=alice.get('/api/friends').json()['friends']
    public_profile=bob.get(f'/api/profile/{aid}').json()['profile']
    for record in [*own_friends,public_profile]:
        assert 'reports' not in record and 'contacts' not in record
        assert 'blocks_received' not in record and 'registration' not in record


def test_admin_member_activity_is_authenticated_throttled_and_not_broadcast_to_members(monkeypatch):
    admin, alice, bob, aid, bid=pair()
    token=alice.cookies.get('s')
    assert token
    events=[]

    async def capture_admins(event, **payload):
        events.append((event,payload))

    monkeypatch.setattr(core.hub,'admins',capture_admins)
    socket=object()
    core.hub.users[aid].add(socket)
    try:
        with db() as c:
            c.execute('UPDATE users SET last_seen=NULL WHERE id=?',(aid,))
        assert asyncio.run(core.note_admin_member_activity(aid,session_hash='invalid')) is False
        assert not events
        assert asyncio.run(core.note_admin_member_activity(
            aid,session_hash=core.digest(token),online=True)) is True
        assert len(events)==1
        event,data=events[0]
        assert event=='admin-member-activity'
        assert data['user_id']==aid and data['online'] is True
        assert data['last_seen']>0
        assert set(data)=={'user_id','last_seen','online'}
        assert asyncio.run(core.note_admin_member_activity(
            aid,session_hash=core.digest(token),online=True)) is False
        assert len(events)==1

        listing=admin.get('/api/admin/users').json()['users']
        row=next(x for x in listing if x['id']==aid)
        assert row['online'] is True and row['last_seen']==data['last_seen']
        detail=admin.get(f'/api/admin/users/{aid}/details').json()['user']
        assert detail['online'] is True and detail['last_seen']==data['last_seen']

        # Privacy opt-out stays reciprocal for members; Admin review is separate.
        with db() as c:
            c.execute('UPDATE users SET show_online=0 WHERE id=?',(aid,))
        other=next(x for x in bob.get('/api/friends').json()['friends']
                   if x['other_id']==aid)
        assert other['online'] is False and other['last_seen'] is None
        assert asyncio.run(core.note_admin_member_activity(
            aid,session_hash=core.digest(token),force=True,online=False)) is True
        assert events[-1][1]['online'] is False
    finally:
        core.hub.users[aid].discard(socket)


def test_admin_user_search_private_contact_and_public_identifier():
    admin,alice,bob,aid,bid=pair()
    member=alice.get('/api/me').json()['user']
    def users(q):
        result=admin.get('/api/admin/users',params={'q':str(q)})
        assert result.status_code==200,result.text
        return {entry['id'] for entry in result.json()['users']}
    assert aid in users(member['public_id'])
    assert aid in users(member['phone'])
    assert aid in users(member['email'])
    assert aid in users(aid)
    assert bob.get('/api/admin/users',params={'q':member['phone']}).status_code==403
