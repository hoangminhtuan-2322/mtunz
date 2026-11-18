"""Integration and permission tests for groups, media, reactions, profiles and account controls."""
import io
import pytest
from fastapi.testclient import TestClient
from test_flows import logged_admin, register_user, db, RATE_BUCKETS
from app import app


@pytest.fixture(autouse=True)
def clean_extended_db():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('message_pins','group_messages','group_members','chat_groups','reactions','chat_preferences',
                      'attachments','recovery_grants','ticket_messages','tickets','notifications',
                      'messages','friendships','blocks','restrictions','sessions',
                      'login_challenges','registrations','audit'):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")


def setup_pair():
    admin=logged_admin()
    alice=register_user(admin,'feature_alice')
    bob=register_user(admin,'feature_bob')
    a=alice.get('/api/me').json()['user']['id']
    b=bob.get('/api/me').json()['user']['id']
    assert alice.post(f'/api/friends/request/{b}').status_code==200
    assert bob.post(f'/api/friends/accept/{a}').status_code==200
    return admin,alice,bob,a,b


def test_group_membership_edit_reactions_and_moderation():
    admin,alice,bob,a,b=setup_pair()
    guest=TestClient(app);guest.get('/')
    assert guest.get('/api/groups').status_code==401
    response=alice.post('/api/groups',json={'title':'Nhóm thật','member_ids':[b]})
    assert response.status_code==200,response.text
    gid=response.json()['id']
    assert bob.get('/api/groups').json()['groups'][0]['id']==gid
    msg=alice.post(f'/api/groups/{gid}/messages',json={'body':'Chào nhóm'}).json()['message']
    assert msg['body']=='Chào nhóm'
    mid=msg['id']
    assert bob.post(f'/api/groups/{gid}/messages/{mid}/reaction',json={'emoji':'❤️'}).json()['ok']
    history=alice.get(f'/api/groups/{gid}/messages').json()['messages']
    assert history[0]['reactions'][0]['emoji']=='❤️'
    assert bob.patch(f'/api/groups/{gid}',json={'title':'Người lạ'}).status_code==403
    assert alice.patch(f'/api/groups/{gid}',json={'title':'Nhóm đã đổi tên','description':'Trò chuyện'}).status_code==200
    assert alice.patch(f'/api/groups/{gid}/messages/{mid}',json={'body':'Chào đã sửa'}).status_code==200
    assert bob.delete(f'/api/groups/{gid}/messages/{mid}').status_code==403
    assert alice.delete(f'/api/groups/{gid}/messages/{mid}').status_code==200
    assert bob.get(f'/api/groups/{gid}/messages').json()['messages'][0]['body']==''
    assert bob.post(f'/api/groups/{gid}/read').status_code==200
    assert admin.get('/api/admin/groups').json()['groups'][0]['title']=='Nhóm đã đổi tên'
    assert admin.get(f'/api/admin/groups/{gid}/messages').status_code==200
    assert bob.delete(f'/api/groups/{gid}/members/{a}').status_code==403
    assert alice.delete(f'/api/groups/{gid}/members/{b}').status_code==200
    assert bob.get(f'/api/groups/{gid}/messages').status_code==403
    assert bob.post(f'/api/groups/{gid}/messages',json={'body':'Giả mạo'}).status_code==403


def test_file_permissions_message_actions_and_security():
    admin,alice,bob,a,b=setup_pair()
    eve=register_user(admin,'feature_eve')
    image=b'\x89PNG\r\n\x1a\n'+b'0'*128
    bad=alice.post('/api/uploads',files={'file':('hello.svg',b'<svg/>','image/svg+xml')})
    assert bad.status_code==415
    bad=alice.post('/api/uploads',files={'file':('spoof.png',b'not a real png','image/png')})
    assert bad.status_code==415
    bad=alice.post('/api/uploads',files={'file':('huge.txt',b'a'*(12*1024*1024+1),'text/plain')})
    assert bad.status_code==413
    uploaded=alice.post('/api/uploads',files={'file':('thunghiem.png',image,'image/png')})
    assert uploaded.status_code==200, uploaded.text
    fid=uploaded.json()['attachment']['id']
    assert bob.get(f'/api/attachments/{fid}').status_code==403
    assert eve.get(f'/api/attachments/{fid}').status_code==403
    msg=alice.post('/api/messages',json={'recipient_id':b,'body':'Ảnh test','attachment_id':fid})
    assert msg.status_code==200,msg.text
    mid=msg.json()['message']['id']
    assert bob.get(f'/api/attachments/{fid}').content==image
    assert eve.get(f'/api/attachments/{fid}').status_code==403
    assert alice.post('/api/messages',json={'recipient_id':b,'body':'Tái sử dụng','attachment_id':fid}).status_code==409
    assert bob.patch(f'/api/messages/{mid}',json={'body':'Sửa trái phép'}).status_code==403
    assert alice.patch(f'/api/messages/{mid}',json={'body':'Ảnh đã sửa'}).status_code==200
    assert bob.post(f'/api/messages/{mid}/reaction',json={'emoji':'😂'}).status_code==200
    assert eve.post(f'/api/messages/{mid}/reaction',json={'emoji':'😂'}).status_code==404
    results=bob.get(f'/api/search/messages?other_id={a}&q=%E1%BA%A2nh').json()['results']
    assert results and results[0]['id']==mid
    assert alice.delete(f'/api/messages/{mid}').status_code==200
    assert bob.get(f'/api/attachments/{fid}').status_code==403


def test_profile_sessions_notifications_and_exports():
    _,alice,bob,a,b=setup_pair()
    response=alice.patch('/api/me/profile',json={'display_name':'Alicia','bio':'Mình là Alice','show_online':False,'show_receipts':False})
    assert response.status_code==200,response.text
    assert alice.get('/api/me').json()['user']['display_name']=='Alicia'
    assert bob.get(f'/api/profile/{a}').json()['profile']['bio']=='Mình là Alice'
    assert bob.get('/api/friends').json()['friends'][0]['online']==False
    assert alice.post('/api/chats/99999/preferences',json={'muted':True,'archived':True}).status_code==403
    assert alice.post(f'/api/chats/{b}/preferences',json={'muted':True,'archived':True}).status_code==200
    assert alice.get('/api/friends').json()['friends'][0]['archived'] is True
    second=TestClient(app)
    second.get('/')
    pwd=second.post('/api/auth/password',json={'username':'feature_alice','password':'GreatPassword123'}).json()
    second.post('/api/auth/pin',json={'challenge':pwd['challenge'],'pin':'1234'})
    assert len(alice.get('/api/me/sessions').json()['sessions'])==2
    assert alice.post('/api/me/sessions/revoke-others').status_code==200
    assert second.get('/api/me').json()['user'] is None
    exported=alice.get('/api/me/export')
    assert exported.status_code==200 and exported.json()['account']['username']=='feature_alice'
    assert 'attachment' in exported.headers['content-disposition']
    assert alice.post('/api/notifications/read').status_code==200
