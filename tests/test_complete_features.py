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
        for table in ('message_hidden','message_pins','group_messages','group_members','chat_groups','reactions','chat_preferences',
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
    summary=bob.get('/api/groups').json()['groups'][0]
    assert summary['unread']==1 and summary['last_message']['body']==msg['body']=='Chào nhóm'
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
    assert bob.get('/api/groups').json()['groups'][0]['unread']==0
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


def test_private_chat_pins_and_forward_permissions():
    admin, alice, bob, a, b = setup_pair()
    outsider = register_user(admin, 'feature_outsider')
    created = alice.post('/api/messages', json={'recipient_id': b, 'body': 'Tin quan trọng'})
    assert created.status_code == 200, created.text
    mid = created.json()['message']['id']
    pin = {'scope': 'dm', 'chat_id': b, 'message_id': mid}
    assert alice.post('/api/chat/pins', json=pin).json()['pinned'] is True
    pins = alice.get(f'/api/chat/pins?scope=dm&chat_id={b}')
    assert pins.status_code == 200 and pins.json()['pins'][0]['message_id'] == mid
    assert outsider.post('/api/chat/pins', json=pin).status_code in (403, 404)
    assert bob.get(f'/api/chat/pins?scope=dm&chat_id={a}').json()['pins'] == []

    # Sender-only editing has a hard 15-minute server-side deadline.
    assert bob.patch(f'/api/messages/{mid}', json={'body':'Không được sửa'}).status_code == 403
    assert alice.patch(f'/api/messages/{mid}', json={'body':'Đã cập nhật'}).status_code == 200
    with db() as c:
        c.execute('UPDATE messages SET created_at=created_at-901 WHERE id=?', (mid,))
    assert alice.patch(f'/api/messages/{mid}', json={'body':'Quá hạn'}).status_code == 409

    # Only current members can forward to a group; untrusted viewers cannot.
    group = alice.post('/api/groups', json={'title':'Nhóm chuyển tiếp','member_ids':[b]})
    assert group.status_code == 200, group.text
    gid = group.json()['id']
    forward = {'source_scope':'dm','source_chat_id':b,'message_id':mid,
               'target_scope':'group','target_id':gid}
    result = alice.post('/api/chat/forward', json=forward)
    assert result.status_code == 200, result.text
    assert result.json()['message']['forwarded'] == 1
    assert result.json()['message']['body'] == 'Đã cập nhật'
    assert bob.get(f'/api/groups/{gid}/messages').json()['messages'][0]['forwarded'] == 1
    assert outsider.post('/api/chat/forward', json=forward).status_code in (403, 404)
    assert outsider.post('/api/chat/pins', json={
        'scope':'group','chat_id':gid,'message_id':result.json()['message']['id']
    }).status_code in (403, 404)

    # Pins are private; recalling a message clears saved references.
    assert alice.delete(f'/api/messages/{mid}').status_code == 200
    assert alice.get(f'/api/chat/pins?scope=dm&chat_id={b}').json()['pins'] == []
    assert alice.post('/api/chat/forward', json=forward).status_code == 404


def test_group_forward_and_pin_limit():
    admin,alice,bob,a,b=setup_pair()
    group=alice.post('/api/groups',json={'title':'Nhóm ghim','member_ids':[b]})
    gid=group.json()['id']
    ids=[]
    for idx in range(6):
        msg=alice.post(f'/api/groups/{gid}/messages',json={'body':f'Mục {idx}'})
        assert msg.status_code==200,msg.text
        ids.append(msg.json()['message']['id'])
    for mid in ids[:5]:
        assert bob.post('/api/chat/pins',json={'scope':'group','chat_id':gid,'message_id':mid}).json()['pinned']
    full=bob.post('/api/chat/pins',json={'scope':'group','chat_id':gid,'message_id':ids[5]})
    assert full.status_code==409
    assert bob.post('/api/chat/pins',json={'scope':'group','chat_id':gid,'message_id':ids[0]}).json()['pinned'] is False
    assert bob.post('/api/chat/pins',json={'scope':'group','chat_id':gid,'message_id':ids[5]}).json()['pinned'] is True
    forwarded=bob.post('/api/chat/forward',json={
        'source_scope':'group','source_chat_id':gid,'message_id':ids[5],
        'target_scope':'dm','target_id':a
    })
    assert forwarded.status_code==200,forwarded.text
    assert forwarded.json()['message']['forwarded']==1
    assert alice.get(f'/api/messages/{b}').json()['messages'][-1]['forwarded']==1


def test_same_origin_location_requires_explicit_browser_permission():
    # Permissions Policy permits the browser to ask for user consent on this origin.
    with TestClient(app) as client:
        response=client.get('/health')
        assert response.status_code==200
        policy=response.headers.get('permissions-policy','')
        assert 'geolocation=(self)' in policy
        assert 'payment=()' in policy


def test_forwarding_images_preserves_attachment_permissions():
    admin, alice, bob, alice_id, bob_id = setup_pair()
    charlie = register_user(admin, 'feature_charlie')
    charlie_id = charlie.get('/api/me').json()['user']['id']
    stranger = register_user(admin, 'feature_stranger')
    assert bob.post(f'/api/friends/request/{charlie_id}').status_code == 200
    assert charlie.post(f'/api/friends/accept/{bob_id}').status_code == 200
    group = bob.post('/api/groups',json={'title':'Ảnh chuyển tiếp','member_ids':[charlie_id]})
    assert group.status_code == 200,group.text
    gid = group.json()['id']
    image = bytes.fromhex('89504e470d0a1a0a') + b'0'*100
    uploaded = alice.post('/api/uploads', files={'file': ('photo.png',image,'image/png')})
    assert uploaded.status_code == 200,uploaded.text
    file_id = uploaded.json()['attachment']['id']
    source = alice.post('/api/messages',json={'recipient_id':bob_id,'body':'Ảnh gốc','attachment_id':file_id})
    assert source.status_code == 200,source.text
    source_id = source.json()['message']['id']
    assert stranger.get(f'/api/attachments/{file_id}').status_code == 403
    forwarded = bob.post('/api/chat/forward',json={
       'source_scope':'dm','source_chat_id':alice_id,'message_id':source_id,
       'target_scope':'group','target_id':gid
    })
    assert forwarded.status_code == 200,forwarded.text
    assert forwarded.json()['message']['attachment']['id'] == file_id
    assert charlie.get(f'/api/attachments/{file_id}').status_code == 200
    assert stranger.get(f'/api/attachments/{file_id}').status_code == 403

def test_single_notice_read_is_private_and_unread_filter_runs_before_limit():
    _,alice,bob,a,_=setup_pair()
    with db() as c:
        target=c.execute("INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)",
                         (a,'Tin chưa đọc',100)).lastrowid
        for i in range(81):
            c.execute('INSERT INTO notifications(user_id,body,created_at,read_at) VALUES(?,?,?,?)',
                      (a,f'Tin đã đọc {i}',101+i,101+i))
    path=f'/api/notifications/{target}/read'
    assert bob.post(path).status_code==404
    assert alice.get('/api/notifications?unread_only=true').json()['notifications'][0]['id']==target
    assert alice.post(path).status_code==200
    assert alice.post(path).status_code==200
    assert all(n['id']!=target for n in alice.get('/api/notifications?unread_only=true').json()['notifications'])


def test_delete_message_for_me_dm_keeps_other_participant_history():
    admin,alice,bob,alice_id,bob_id=setup_pair()
    stranger=register_user(admin,'feature_delete_stranger')
    first=alice.post('/api/messages',json={'recipient_id':bob_id,'body':'Chỉ một người được ẩn'})
    assert first.status_code==200,first.text
    mid=first.json()['message']['id']
    assert stranger.post(f'/api/messages/{mid}/hide').status_code==404
    guest=TestClient(app)
    assert guest.post(f'/api/messages/{mid}/hide').status_code==401
    assert bob.get(f'/api/messages/{alice_id}').json()['messages'][-1]['id']==mid
    assert bob.post(f'/api/messages/{mid}/hide').status_code==200
    assert bob.post(f'/api/messages/{mid}/hide').status_code==200  # idempotent
    assert not any(m['id']==mid for m in bob.get(f'/api/messages/{alice_id}').json()['messages'])
    assert any(m['id']==mid for m in alice.get(f'/api/messages/{bob_id}').json()['messages'])
    assert not bob.get('/api/search/messages',params={'other_id':alice_id,'q':'một người'}).json()['results']
    assert alice.get('/api/search/messages',params={'other_id':bob_id,'q':'một người'}).json()['results']
    assert not bob.get('/api/chat/search/v6',params={'scope':'dm','chat_id':alice_id,'q':'một người'}).json()['results']
    assert alice.get('/api/chat/search/v6',params={'scope':'dm','chat_id':bob_id,'q':'một người'}).json()['results']
    assert bob.get('/api/friends').json()['friends'][0]['last_message'] is None
    assert alice.get('/api/friends').json()['friends'][0]['last_message']['body']=='Chỉ một người được ẩn'
    assert alice.delete(f'/api/messages/{mid}').status_code==200
    assert bob.get(f'/api/messages/{alice_id}').json()['messages']==[]


def test_delete_message_for_me_group_only_changes_one_members_view():
    admin,alice,bob,alice_id,bob_id=setup_pair()
    stranger=register_user(admin,'feature_group_guest')
    created=alice.post('/api/groups',json={'title':'Nhóm kiểm tra xóa','member_ids':[bob_id]})
    assert created.status_code==200,created.text
    gid=created.json()['id']
    sent=alice.post(f'/api/groups/{gid}/messages',json={'body':'Cần giữ ở phía bạn'})
    assert sent.status_code==200,sent.text
    mid=sent.json()['message']['id']
    assert stranger.post(f'/api/groups/{gid}/messages/{mid}/hide').status_code==403
    assert bob.post(f'/api/groups/{gid}/messages/{mid}/hide').status_code==200
    assert bob.post(f'/api/groups/{gid}/messages/{mid}/hide').status_code==200
    assert bob.get(f'/api/groups/{gid}/messages').json()['messages']==[]
    assert alice.get(f'/api/groups/{gid}/messages').json()['messages'][0]['id']==mid
    assert bob.get('/api/groups').json()['groups'][0]['last_message'] is None
    assert bob.get('/api/groups').json()['groups'][0]['unread']==0
    assert alice.get('/api/groups').json()['groups'][0]['last_message']['id']==mid
    assert not bob.get('/api/search/messages',params={'group_id':gid,'q':'giữ'}).json()['results']
    assert alice.get('/api/search/messages',params={'group_id':gid,'q':'giữ'}).json()['results']
    assert not bob.get('/api/chat/search/v6',params={'scope':'group','chat_id':gid,'q':'giữ'}).json()['results']
    assert alice.get('/api/chat/search/v6',params={'scope':'group','chat_id':gid,'q':'giữ'}).json()['results']
    assert bob.delete(f'/api/groups/{gid}/messages/{mid}').status_code==403
    assert alice.delete(f'/api/groups/{gid}/messages/{mid}').status_code==200


def test_personal_delete_prevents_other_retrieval_of_attached_file():
    admin,alice,bob,alice_id,bob_id=setup_pair()
    image=b'\x89PNG\r\n\x1a\n'+b'0'*128
    uploaded=alice.post('/api/uploads',files={'file':('test.png',image,'image/png')})
    assert uploaded.status_code==200,uploaded.text
    file_id=uploaded.json()['attachment']['id']
    sent=alice.post('/api/messages',json={'recipient_id':bob_id,
                                            'body':'Ảnh đã gửi','attachment_id':file_id})
    assert sent.status_code==200,sent.text
    mid=sent.json()['message']['id']
    assert bob.get(f'/api/attachments/{file_id}').status_code==200
    assert bob.post(f'/api/messages/{mid}/hide').status_code==200
    assert bob.get(f'/api/attachments/{file_id}').status_code==403
    assert alice.get(f'/api/attachments/{file_id}').status_code==200
