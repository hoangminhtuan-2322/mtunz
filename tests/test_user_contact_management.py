"""Private contact details, required registration phone and admin audit tests."""
from fastapi.testclient import TestClient
import pytest
from app import app, db, RATE_BUCKETS
from test_flows import logged_admin, register_user

@pytest.fixture(autouse=True)
def clean_accounts():
    RATE_BUCKETS.clear()
    with db() as c:
        for name in ('reactions','group_messages','group_members','chat_groups',
                     'chat_preferences','attachments','recovery_grants','ticket_messages',
                     'tickets','notifications','messages','friendships','blocks','restrictions',
                     'sessions','trusted_devices','login_challenges','registrations',
                     'audit','account_deletion_requests'):
            c.execute(f'DELETE FROM {name}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE users SET pin_hash=NULL,pin_length=NULL WHERE username='admin'")


def test_signup_requires_phone_and_admin_can_review_contact():
    admin=logged_admin()
    guest=TestClient(app)
    guest.get('/')
    url='/api/registration/request'
    assert guest.post(url,json={'username':'contact_demo'}).status_code==422
    assert guest.post(url,json={'username':'contact_demo','phone':'invalid'}).status_code==422
    assert guest.post(url,json={'username':'contact_demo','phone':'0912345678',
                                'email':'broken-email'}).status_code==422
    created=guest.post(url,json={'username':'contact_demo','phone':'0912345678',
                                 'email':'Demo.Person@GMAIL.com'})
    assert created.status_code==200,created.text
    assert created.json()['phone']=='+84912345678'
    assert created.json()['email']=='demo.person@gmail.com'
    own=guest.get('/api/registration/status').json()['requests'][0]
    assert own['phone']=='+84912345678'
    pending=next(x for x in admin.get('/api/admin/registrations').json()['registrations']
                 if x['username']=='contact_demo')
    assert pending['phone']=='+84912345678'
    assert pending['email']=='demo.person@gmail.com'
    assert admin.post(f"/api/admin/registrations/{pending['id']}/decision",
                      json={'approve':True,'admin_pin':'2345'}).status_code==200
    complete=guest.post('/api/registration/complete',json={
        'username':'contact_demo','password':'SecurePassword123!',
        'pin':'123456','pin_length':6,'accepted_terms':True})
    assert complete.status_code==200,complete.text
    assert guest.post('/api/auth/logout').status_code==200
    assert guest.post('/api/auth/start',json={'username':'contact_demo'}).status_code==200
    stage=guest.post('/api/auth/password',json={
        'username':'contact_demo','password':'SecurePassword123!'}).json()
    assert guest.post('/api/auth/pin',json={
        'challenge':stage['challenge'],'pin':'123456'}).status_code==200
    me=guest.get('/api/me').json()['user']
    assert me['phone']=='+84912345678'
    assert me['email']=='demo.person@gmail.com'


def test_private_contact_is_not_exposed_to_peers_and_admin_views_are_audited():
    admin=logged_admin()
    member=register_user(admin,'contact_member')
    other=register_user(admin,'contact_peer')
    uid=member.get('/api/me').json()['user']['id']
    assert member.patch('/api/me/profile',json={
        'display_name':'Riêng tư','bio':'Tài khoản cá nhân',
        'show_online':False,'show_receipts':True,
        'phone':'0907654321','email':'private.mail@gmail.com'}).status_code==200
    profile=other.get(f'/api/profile/{uid}')
    assert profile.status_code==200
    assert 'phone' not in profile.json()['profile']
    assert 'email' not in profile.json()['profile']
    assert other.get(f'/api/admin/users/{uid}/details').status_code==403
    assert TestClient(app).get(f'/api/admin/users/{uid}/details').status_code==401
    detail=admin.get(f'/api/admin/users/{uid}/details')
    assert detail.status_code==200,detail.text
    u=detail.json()['user']
    assert u['display_name']=='Riêng tư'
    assert u['phone']=='+84907654321'
    assert u['email']=='private.mail@gmail.com'
    assert u['show_online']==0
    assert all(k not in u for k in ('password','pin','password_hash','pin_hash',
                                   'pin_length','token_hash','locked_until'))
    with db() as c:
        log=c.execute("SELECT action,detail FROM audit WHERE action='admin_view_user_details'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
        assert log and log['detail']==f'user_id={uid}'
    export=member.get('/api/me/export')
    assert export.status_code==200
    assert export.json()['account']['phone']=='+84907654321'
    assert export.json()['account']['email']=='private.mail@gmail.com'


def test_legacy_user_without_phone_is_not_locked_out():
    admin=logged_admin()
    member=register_user(admin,'legacy_contact')
    uid=member.get('/api/me').json()['user']['id']
    with db() as c:
        c.execute('UPDATE users SET phone=NULL,email=NULL WHERE id=?',(uid,))
    assert member.get('/api/me').json()['user']['phone']==''
    detail=admin.get(f'/api/admin/users/{uid}/details')
    assert detail.status_code==200
    assert detail.json()['user']['phone'] is None
    assert member.patch('/api/me/profile',json={
        'display_name':'Legacy','bio':'','show_online':True,'show_receipts':True}).status_code==200
    assert member.patch('/api/me/profile',json={
        'display_name':'Legacy','bio':'','show_online':True,'show_receipts':True,
        'phone':'0911223344','email':''}).status_code==200
    assert member.get('/api/me').json()['user']['phone']=='+84911223344'


def test_member_and_guest_cannot_access_admin_management_endpoints():
    """Admin UI strings are cosmetic; endpoint authorization is the security boundary."""
    admin=logged_admin()
    member=register_user(admin,'boundary_member')
    guest=TestClient(app)
    guest.get('/')
    uid=member.get('/api/me').json()['user']['id']
    endpoints=(
        '/api/admin/stats',
        '/api/admin/registrations',
        '/api/admin/users',
        '/api/admin/tickets',
        '/api/admin/audit',
        '/api/admin/groups',
        '/api/admin/deletions',
        f'/api/admin/users/{uid}/details',
        f'/api/admin/users/{uid}/messages',
    )
    for endpoint in endpoints:
        assert guest.get(endpoint).status_code==401,endpoint
        assert member.get(endpoint).status_code==403,endpoint
        assert admin.get(endpoint).status_code==200,endpoint
