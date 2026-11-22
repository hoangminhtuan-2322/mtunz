"""V17: private profiles, protected identity quotas and authenticated media downloads.
All tests use disposable SQLite; no production data is accessed.
"""
import io
import pytest
from fastapi.testclient import TestClient
from app import app, db, now, RATE_BUCKETS
from test_flows import logged_admin, register_user


@pytest.fixture(autouse=True)
def clear_v17():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('identity_change_events','message_requests','world_messages',
                      'message_pins','group_messages','group_members','chat_groups',
                      'reactions','chat_preferences','attachments','recovery_grants',
                      'ticket_messages','tickets','notifications','messages','friendships',
                      'blocks','restrictions','sessions','trusted_devices',
                      'login_challenges','registrations','audit','account_deletion_requests'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
    yield
    RATE_BUCKETS.clear()


def test_username_one_change_per_60_days_requires_password_and_pin():
    admin=logged_admin()
    alice=register_user(admin,'identity_alice')
    bob=register_user(admin,'identity_bob')
    status=alice.get('/api/me/identity/status')
    assert status.status_code==200
    assert status.json()['quota']['username']['remaining']==1
    endpoint='/api/me/identity/username'
    payload={'new_value':'new_identity_alice','password':'GreatPassword123','pin':'1234'}
    assert alice.post(endpoint,json={**payload,'pin':'0000'}).status_code==401
    assert alice.post(endpoint,json={**payload,'password':'wrong'}).status_code==401
    assert alice.post(endpoint,json={**payload,'new_value':'identity_bob'}).status_code==409
    assert bob.post(endpoint,json=payload).status_code==409
    changed=alice.post(endpoint,json=payload)
    assert changed.status_code==200,changed.text
    assert changed.json()['quota']['username']['remaining']==0
    me=alice.get('/api/me').json()['user']
    assert me['id'] and me['username']=='new_identity_alice'
    with db() as c:
        assert c.execute("SELECT COUNT(*) n FROM identity_change_events WHERE kind='username'").fetchone()['n']==1
    assert alice.post(endpoint,json={**payload,'new_value':'after_alice'}).status_code==429
    with db() as c:
        c.execute("UPDATE identity_change_events SET changed_at=? WHERE user_id=? AND kind='username'",
                  (now()-60*86400-1,me['id']))
    again=alice.post(endpoint,json={**payload,'new_value':'after_alice'})
    assert again.status_code==200,again.text
    assert alice.get('/api/me').json()['user']['username']=='after_alice'


def test_display_name_two_per_rolling_30_days_and_no_unverified_bypass():
    admin=logged_admin()
    alice=register_user(admin,'name_alice')
    uid=alice.get('/api/me').json()['user']['id']
    profile='/api/me/profile'
    current=alice.get('/api/me').json()['user']['display_name']
    assert alice.patch(profile,json={'display_name':'Change without PIN','bio':'Profile',
              'show_online':True,'show_receipts':True}).status_code==403
    assert alice.post('/api/me/display-name',json={'display_name':'Bypass onboarding'}).status_code==403
    assert alice.patch(profile,json={'display_name':current,'bio':'Allowed change',
                  'show_online':False,'show_receipts':False}).status_code==200
    assert alice.get('/api/me/identity/status').json()['quota']['display_name']['remaining']==2
    endpoint='/api/me/identity/display_name'
    payload={'new_value':'Tên mới lần một','password':'GreatPassword123','pin':'1234'}
    assert alice.post(endpoint,json={**payload,'pin':'0000'}).status_code==401
    first=alice.post(endpoint,json=payload)
    assert first.status_code==200,first.text
    second=alice.post(endpoint,json={**payload,'new_value':'Tên mới lần hai'})
    assert second.status_code==200,second.text
    assert second.json()['quota']['display_name']['remaining']==0
    assert alice.post(endpoint,json={**payload,'new_value':'Tên mới lần ba'}).status_code==429
    with db() as c:
        c.execute("DELETE FROM identity_change_events WHERE user_id=? AND kind='display_name'",(uid,))
        c.execute("INSERT INTO identity_change_events(user_id,kind,changed_at) VALUES(?,?,?)",
                  (uid,'display_name',now()-31*86400))
        c.execute("INSERT INTO identity_change_events(user_id,kind,changed_at) VALUES(?,?,?)",
                  (uid,'display_name',now()))
    assert alice.get('/api/me/identity/status').json()['quota']['display_name']['remaining']==1
    assert alice.post(endpoint,json={**payload,'new_value':'Tên mới lần ba'}).status_code==200


def test_private_account_hides_profile_media_from_strangers_but_friends_can_view():
    admin=logged_admin()
    alice=register_user(admin,'private_alice')
    bob=register_user(admin,'private_bob')
    aid=alice.get('/api/me').json()['user']['id']
    bid=bob.get('/api/me').json()['user']['id']
    image=b'\\x89PNG\\r\\n\\x1a\\n'+b'0'*90
    uploaded=alice.post('/api/uploads',files={'file':('avatar.png',io.BytesIO(image),'image/png')})
    assert uploaded.status_code==200,uploaded.text
    fid=uploaded.json()['attachment']['id']
    saved=alice.patch('/api/me/social',json={'profile_visibility':'friends',
            'headline':'Riêng tư','website':'https://example.org',
            'avatar_attachment_id':fid,'allow_message_requests':False})
    assert saved.status_code==200,saved.text
    own=alice.get(f'/api/profile/{aid}').json()['profile']
    outsider=bob.get(f'/api/profile/{aid}').json()['profile']
    assert own['headline']=='Riêng tư' and own['avatar_url']
    assert outsider['private'] is True
    assert outsider['headline']=='' and outsider['website']==''
    assert outsider['avatar_url'] is None and outsider['created_at'] is None
    assert outsider['last_seen'] is None
    assert bob.get(f'/api/profile/{aid}/avatar').status_code==404
    search=bob.get('/api/people/search',params={'q':'private_alice'}).json()['users']
    # Member lookup uses display name or public ID, not private login name.
    assert search==[]
    public_id=alice.get('/api/me').json()['user']['public_id']
    search=bob.get('/api/people/search',params={'q':public_id}).json()['users']
    assert len(search)==1 and search[0]['private_profile'] is True
    assert search[0]['avatar_url'] is None
    assert bob.post('/api/friends/request/'+str(aid)).status_code==200
    assert alice.post('/api/friends/accept/'+str(bid)).status_code==200
    friend=bob.get(f'/api/profile/{aid}').json()['profile']
    assert friend['private'] is False and friend['headline']=='Riêng tư'
    assert bob.get(f'/api/profile/{aid}/avatar').status_code==200
    assert alice.patch('/api/me/social',json={'profile_visibility':'only_me'}).status_code==200
    assert bob.get(f'/api/profile/{aid}').json()['profile']['private'] is True


def test_authorized_video_and_image_download_and_permission_enforcement():
    admin=logged_admin()
    alice=register_user(admin,'media_alice')
    bob=register_user(admin,'media_bob')
    guest=register_user(admin,'media_guest')
    a=alice.get('/api/me').json()['user']['id']
    b=bob.get('/api/me').json()['user']['id']
    assert alice.post('/api/friends/request/'+str(b)).status_code==200
    assert bob.post('/api/friends/accept/'+str(a)).status_code==200
    clip=b'\\x00\\x00\\x00\\x18ftypisom'+b'0'*64
    upload=alice.post('/api/uploads',files={'file':('short.mp4',clip,'video/mp4')})
    assert upload.status_code==200,upload.text
    fid=upload.json()['attachment']['id']
    assert guest.get(f'/api/attachments/{fid}?download=1').status_code==403
    assert bob.get(f'/api/attachments/{fid}?download=1').status_code==403
    sent=alice.post('/api/messages',json={'recipient_id':b,'body':'Video ngắn','attachment_id':fid})
    assert sent.status_code==200,sent.text
    play=bob.get(f'/api/attachments/{fid}')
    saved=bob.get(f'/api/attachments/{fid}?download=1')
    assert play.status_code==200 and saved.status_code==200
    assert play.content==clip and saved.content==clip
    assert play.headers['content-disposition'].startswith('inline;')
    assert saved.headers['content-disposition'].startswith('attachment;')
    assert 'filename*=' in saved.headers['content-disposition']
    assert guest.get(f'/api/attachments/{fid}?download=1').status_code==403
    image=b'\\x89PNG\\r\\n\\x1a\\n'+b'0'*80
    pic=alice.post('/api/uploads',files={'file':('photo.png',image,'image/png')})
    assert pic.status_code==200
    image_id=pic.json()['attachment']['id']
    assert alice.get(f'/api/attachments/{image_id}?download=1').headers['content-disposition'].startswith('attachment;')
    assert alice.get(f'/api/attachments/{image_id}').headers['content-disposition'].startswith('inline;')
    assert alice.post('/api/uploads',files={'file':('malware.svg',b'<svg/>','image/svg+xml')}).status_code==415
