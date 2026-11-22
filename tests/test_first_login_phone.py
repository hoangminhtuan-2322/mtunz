"""Mandatory display-name onboarding, private peer identity and phone+password login."""
import pytest
from fastapi.testclient import TestClient
from app import app, db, RATE_BUCKETS, hash_secret
from test_flows import logged_admin, register_user

@pytest.fixture(autouse=True)
def clean():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('message_pins','group_messages','group_members','chat_groups','reactions',
                      'chat_preferences','attachments','recovery_grants','ticket_messages','tickets',
                      'notifications','messages','friendships','blocks','restrictions',
                      'sessions','trusted_devices','login_challenges','registrations',
                      'audit','account_deletion_requests'):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")


def create_approved(admin,name='private_account',phone='0912345678'):
    guest=TestClient(app);guest.get('/')
    req=guest.post('/api/registration/request',json={'username':name,'phone':phone})
    assert req.status_code==200,req.text
    rid=next(r['id'] for r in admin.get('/api/admin/registrations').json()['registrations']
             if r['username']==name)
    approved=admin.post(f'/api/admin/registrations/{rid}/decision',json={'approve':True,'admin_pin':'2345'})
    assert approved.status_code==200,approved.text
    complete=guest.post('/api/registration/complete',json={
        'username':name,'password':'LongPasswordForTest123!','pin':'123456','pin_length':6,'accepted_terms':True})
    assert complete.status_code==200,complete.text
    return guest,complete.json()['id']


def phone_login(guest,phone='0912345678',remember=False):
    start=guest.post('/api/auth/start',json={'username':phone})
    assert start.status_code==200,start.text
    assert start.json()['username']=='+84912345678'
    assert start.json()['username']!='private_account'
    password=guest.post('/api/auth/password',json={
        'username':phone,'password':'LongPasswordForTest123!'})
    assert password.status_code==200,password.text
    auth=guest.post('/api/auth/pin',json={
        'challenge':password.json()['challenge'],'pin':'123456',
        'remember_device':remember})
    assert auth.status_code==200,auth.text
    return auth


def test_required_name_cannot_be_skipped_or_reapproved():
    admin=logged_admin()
    guest,uid=create_approved(admin)
    # Approved completion creates the initial onboarding session and immediately
    # displays the compulsory name popup (without re-entering password and PIN).
    assert guest.get('/api/me').json()['user']['onboarding_required'] is True
    # Dismissing onboarding means a *real* logout, not a new approval request.
    assert guest.post('/api/auth/logout').status_code==200
    assert guest.get('/api/me').json()['user'] is None
    auth=phone_login(guest,remember=True)
    assert auth.json()['remembered'] is False  # Must not bypass onboarding next visit.
    myself=guest.get('/api/me').json()['user']
    assert myself['id']==uid and myself['onboarding_required'] is True
    assert guest.get('/api/friends').status_code==403
    assert guest.get('/api/groups').status_code==403
    assert guest.patch('/api/me/profile',json={'display_name':'Bypass'}).status_code==403
    assert guest.post('/api/me/display-name',json={'display_name':'  '}).status_code==422
    assert guest.post('/api/me/display-name',json={'display_name':'private_account'}).status_code==422
    set_name=guest.post('/api/me/display-name',json={'display_name':'Minh Anh'})
    assert set_name.status_code==200,set_name.text
    assert guest.get('/api/me').json()['user']['display_name']=='Minh Anh'
    assert guest.get('/api/me').json()['user']['onboarding_required'] is False
    assert guest.get('/api/friends').status_code==200
    assert guest.post('/api/auth/logout').status_code==200
    assert guest.get('/api/me').json()['user'] is None
    assert phone_login(guest).status_code==200
    assert guest.get('/api/me').json()['user']['display_name']=='Minh Anh'
    assert guest.get('/api/registration/status').json()['requests']==[]
    with db() as c:
        row=c.execute("SELECT status FROM registrations WHERE username='private_account'").fetchone()
        assert row['status']=='completed'
        assert c.execute('SELECT COUNT(*) AS n FROM users WHERE id=?',(uid,)).fetchone()['n']==1


def test_phone_uniqueness_and_existing_login_compatibility():
    admin=logged_admin()
    first=register_user(admin,'known_member')
    phone=first.get('/api/me').json()['user']['phone']
    assert first.post('/api/auth/start',json={'username':phone}).status_code==200
    guest=TestClient(app);guest.get('/')
    duplicate=guest.post('/api/registration/request',json={
        'username':'second_account','phone':phone})
    assert duplicate.status_code==409,duplicate.text
    assert first.get('/api/me').json()['user']['onboarding_required'] is False


def test_public_profile_search_and_friends_do_not_expose_login_username():
    admin=logged_admin()
    one=register_user(admin,'private_login_one')
    two=register_user(admin,'private_login_two')
    uid=one.get('/api/me').json()['user']['id']
    updated=one.patch('/api/me/profile',json={'display_name':'Minh Anh','bio':''})
    assert updated.status_code==200,updated.text
    name=one.get('/api/me').json()['user']['display_name']
    profile=two.get(f'/api/profile/{uid}')
    assert profile.status_code==200
    assert 'username' not in profile.json()['profile']
    assert profile.json()['profile']['display_name']==name
    response=two.get(f'/api/people/search?q={uid}')
    assert response.status_code==200,response.text
    result=response.json()['users'][0]
    assert result['display_name']==name
    assert result['username']==name
    assert result['username']!='private_login_one'
    assert two.get('/api/people/search?q=private_login_one').json()['users']==[]
    assert two.post(f'/api/friends/request/{uid}').status_code==200
    friends=one.get('/api/friends').json()['friends']
    assert friends[0]['username']=='Thành viên private_login_two'
