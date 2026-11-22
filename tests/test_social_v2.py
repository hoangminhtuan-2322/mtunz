"""Social v2: stable public IDs, consent-first inbox, images and world anonymity."""
import io

import pytest
from fastapi.testclient import TestClient

from test_flows import logged_admin, register_user, RATE_BUCKETS
from app import app, db


@pytest.fixture(autouse=True)
def reset_social_world():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('message_requests','world_messages','message_pins','group_messages','group_members',
                      'chat_groups','reactions','chat_preferences','attachments','recovery_grants',
                      'ticket_messages','tickets','notifications','messages','friendships','blocks',
                      'restrictions','sessions','login_challenges','registrations','audit'):
            c.execute(f'DELETE FROM {table}')
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1")
    yield
    with db() as c:
        c.execute('DELETE FROM message_requests')
        c.execute('DELETE FROM world_messages')
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0 WHERE id=1")


def pair():
    admin=logged_admin()
    a=register_user(admin,'social_alpha')
    b=register_user(admin,'social_beta')
    return admin,a,b,a.get('/api/me').json()['user'],b.get('/api/me').json()['user']


def test_seven_digit_public_ids_and_nonadmin_direct_messaging():
    admin,a,b,au,bu=pair()
    assert 1_000_000<=int(au['public_id'])<=9_999_999
    assert 1_000_000<=int(bu['public_id'])<=9_999_999
    assert au['public_id']!=bu['public_id']
    assert a.get('/api/people/search',params={'q':str(bu['public_id'])}).json()['users'][0]['id']==bu['id']
    assert admin.post('/api/messages',json={'recipient_id':bu['id'],'body':'Admin cannot DM'}).status_code==403
    assert a.post('/api/messages',json={'recipient_id':bu['id'],'body':'No friendship'}).status_code==403
    assert a.post(f"/api/friends/request/{bu['id']}").status_code==200
    assert b.post(f"/api/friends/accept/{au['id']}").status_code==200
    friends=a.get('/api/friends')
    assert friends.status_code==200,friends.text
    assert friends.json()['friends'][0]['public_id']==bu['public_id']
    assert a.post('/api/messages',json={'recipient_id':bu['id'],'body':'Hello'}).status_code==200


def test_message_requests_opt_in_and_acceptance():
    _,a,b,au,bu=pair()
    assert b.patch('/api/me/social',json={'allow_message_requests':False}).status_code==200
    denied=a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Hello'})
    assert denied.status_code==403,denied.text
    assert b.patch('/api/me/social',json={'allow_message_requests':True}).status_code==200
    request=a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Xin chào bạn'})
    assert request.status_code==200,request.text
    assert a.post('/api/message-requests',json={'recipient_id':bu['id'],'intro':'Spam'}).status_code==409
    inbox=b.get('/api/message-requests').json()['requests']
    assert len(inbox)==1 and inbox[0]['intro']=='Xin chào bạn'
    accepted=b.post(f"/api/message-requests/{inbox[0]['id']}/decision",json={'accept':True})
    assert accepted.status_code==200,accepted.text
    history=b.get(f"/api/messages/{au['id']}").json()['messages']
    assert history and history[-1]['body']=='Xin chào bạn'


def test_profile_photo_visibility_and_member_settings():
    _,a,b,au,bu=pair()
    uploaded=a.post('/api/uploads',files={'file':('profile.png',io.BytesIO(b'\x89PNG\r\n\x1a\n'+b'0'*256),'image/png')})
    assert uploaded.status_code==200,uploaded.text
    fid=uploaded.json()['attachment']['id']
    patch=a.patch('/api/me/social',json={
        'avatar_attachment_id':fid,'headline':'Chào cộng đồng','profile_visibility':'only_me',
        'website':'https://example.org','world_anonymous':True,
    })
    assert patch.status_code==200,patch.text
    assert a.get(f"/api/profile/{au['id']}/avatar").status_code==200
    assert b.get(f"/api/profile/{au['id']}/avatar").status_code==404
    other=b.get(f"/api/profile/{au['id']}").json()['profile']
    assert other['private'] and not other['bio'] and not other['avatar_url']
    assert a.patch('/api/me/social',json={'website':'javascript:alert(1)'}).status_code==422
    assert a.patch('/api/me/social',json={'profile_visibility':'everyone'}).status_code==200
    assert b.get(f"/api/profile/{au['id']}/avatar").status_code==200


def test_world_anonymous_is_snapshot_and_admin_can_moderate():
    admin,a,b,au,_=pair()
    enable=admin.post('/api/admin/world/config',json={
        'enabled':True,'schedule_enabled':False,'open_minute':540,'close_minute':1320,
        'admin_pin':'2345'
    })
    assert enable.status_code==200,enable.text
    assert a.patch('/api/me/social',json={'world_anonymous':True}).status_code==200
    sent=a.post('/api/world/messages',json={'body':'Tin gửi ẩn danh'})
    assert sent.status_code==200,sent.text
    m=sent.json()['message']
    assert m['anonymous'] and m['sender_id']==0
    world=b.get('/api/world/messages').json()['messages'][-1]
    assert world['sender_id']==0 and world['display_name']=='Ẩn danh'
    assert a.get('/api/world/messages').json()['messages'][-1]['is_mine']
    assert a.patch('/api/me/social',json={'world_anonymous':False}).status_code==200
    previous=b.get('/api/world/messages').json()['messages'][-1]
    assert previous['anonymous']
    report=b.post('/api/reports',json={
        'scope':'world','target_id':0,'message_id':m['id'],'reason':'spam',
        'description':'Nội dung cần kiểm tra vì có dấu hiệu spam'
    })
    assert report.status_code==200,report.text
    moderation=admin.get('/api/admin/world').json()['recent_messages'][-1]
    assert moderation['sender_id']==au['id'] and moderation['anonymous']


def test_private_nickname_and_shared_library_permissions_and_pagination():
    admin,alice,bob,a,b=pair()
    aid,bid=a['id'],b['id']
    shared=f'/api/chats/dm/{bid}/shared'
    nickname=f'/api/chats/{bid}/nickname'
    assert alice.get(shared).status_code==403
    assert alice.put(nickname,json={'nickname':'Mèo'}).status_code==403
    assert admin.get(shared).status_code==403
    assert alice.post(f'/api/friends/request/{bid}').status_code==200
    assert bob.post(f'/api/friends/accept/{aid}').status_code==200

    assert alice.put(nickname,json={'nickname':'  Mèo   nhỏ '}).json()['nickname']=='Mèo nhỏ'
    assert alice.get('/api/friends').json()['friends'][0]['nickname']=='Mèo nhỏ'
    assert bob.get('/api/friends').json()['friends'][0]['nickname']==''
    assert 'nickname' not in bob.get(f'/api/profile/{aid}').json()['profile']
    assert alice.put(nickname,json={'nickname':' '}).json()['nickname']==''
    assert alice.get('/api/friends').json()['friends'][0]['nickname']==''

    image=alice.post('/api/uploads',files={'file':('photo.png',b'\x89PNG\r\n\x1a\n'+b'0'*32,'image/png')}).json()['attachment']
    document=alice.post('/api/uploads',files={'file':('note.txt',b'note','text/plain')}).json()['attachment']
    clip=b'\x00\x00\x00\x18ftypisom'+b'0'*64
    video=alice.post('/api/uploads',files={'file':('short.mp4',clip,'video/mp4')}).json()['attachment']
    for attachment in (image,document,video):
        assert alice.post('/api/messages',json={'recipient_id':bid,'attachment_id':attachment['id']}).status_code==200
    assert [entry['attachment_id'] for entry in alice.get(shared).json()['items']]==[video['id'],image['id']]
    assert [entry['attachment_id'] for entry in alice.get(shared,params={'kind':'files'}).json()['items']]==[document['id']]
    inline=bob.get(image['url'])
    saved=bob.get(image['url'],params={'download':'1'})
    assert inline.headers['content-disposition'].startswith('inline')
    assert saved.headers['content-disposition'].startswith('attachment')
    assert saved.content==inline.content


    text='Tham khảo (https://example.org/a_(b)). https://user:password@example.org/ javascript:alert(1)'
    result=alice.post('/api/messages',json={'recipient_id':bid,'body':text}).json()['message']
    mid=result['id']
    with db() as c:
        c.executemany('INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)',
                      [(aid,bid,f'https://example.org/{n}',result['created_at']) for n in range(25)])
        c.execute('INSERT INTO messages(sender_id,recipient_id,body,created_at,expires_at) VALUES(?,?,?,?,?)',
                  (aid,bid,'https://expired.example',result['created_at'],result['created_at']-1))
    links=f'/api/chats/dm/{aid}/shared'
    first=bob.get(links,params={'kind':'links'}).json()
    second=bob.get(links,params={'kind':'links','before':first['next_before']}).json()
    assert len(first['items'])==24 and len(second['items'])==2 and second['next_before'] is None
    assert second['items'][-1]['id']==mid
    assert second['items'][-1]['links']==[{'url':'https://example.org/a_(b)','host':'example.org'}]
    assert 'body' not in second['items'][-1]
    with db() as c:
        assert c.execute('SELECT read_at FROM messages WHERE id=?',(mid,)).fetchone()['read_at'] is None
    assert alice.delete(f'/api/messages/{mid}').status_code==200
    assert all(item['id']!=mid for item in bob.get(links,params={'kind':'links','before':first['next_before']}).json()['items'])

    gid=alice.post('/api/groups',json={'title':'Kho nhóm','member_ids':[bid]}).json()['id']
    assert alice.post(f'/api/groups/{gid}/messages',json={'body':'https://group.example'}).status_code==200
    group_library=f'/api/chats/group/{gid}/shared?kind=links'
    assert bob.get(group_library).json()['items'][0]['links'][0]['host']=='group.example'
    assert alice.delete(f'/api/groups/{gid}/members/{bid}').status_code==200
    assert bob.get(group_library).status_code==403
    assert bob.post(f'/api/blocks/{aid}').status_code==200
    assert alice.get(shared).status_code==403


def test_profile_save_updates_only_submitted_fields():
    _,alice,bob,a,_=pair()
    renamed=alice.post('/api/me/identity/display_name',json={
        'new_value':'Tên hiển thị mới','password':'GreatPassword123','pin':'1234'})
    assert renamed.status_code==200,renamed.text
    profile=alice.patch('/api/me/profile',json={'bio':'Giới thiệu','show_online':False})
    assert profile.status_code==200,profile.text
    contact=alice.patch('/api/me/profile',json={'email':'new@example.com'})
    assert contact.status_code==200,contact.text
    own=alice.get('/api/me').json()['user']
    assert own['email']=='new@example.com' and own['display_name']=='Tên hiển thị mới' and own['bio']=='Giới thiệu'
    assert not own['show_online']
    other=bob.get(f"/api/profile/{a['id']}").json()['profile']
    assert {'email','phone','username'}.isdisjoint(other)


def test_workflow_unread_window_context_and_library_filters():
    _,alice,bob,a,b=pair()
    aid,bid=a['id'],b['id']
    assert alice.post(f'/api/friends/request/{bid}').status_code==200
    assert bob.post(f'/api/friends/accept/{aid}').status_code==200
    with db() as c:
        c.executemany('INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)',
                      [(aid,bid,f'https://example.org/n/{i}',1000+i) for i in range(85)])
        c.execute("INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)",
                  (bid,aid,'https://example.org/reply',1090))
    path=f'/api/messages/{aid}'
    latest=bob.get(path).json()
    assert latest['first_unread_id']<latest['messages'][0]['id']
    first=bob.get(path,params={'unread_window':1}).json()
    assert first['more_after'] and first['messages'][0]['id']==first['first_unread_id']
    second=bob.get(path,params={'after':first['messages'][-1]['id']}).json()
    assert not second['more_after'] and len(first['messages'])+len(second['messages'])==86
    target=first['messages'][14]['id']
    context=f'/api/chats/dm/{aid}/context/{target}'
    excerpt=bob.get(context).json()
    assert excerpt['target_id']==target and len(excerpt['messages'])==16
    assert excerpt['messages'][7]['id']==target and 'read_at' not in excerpt['messages'][7]
    with db() as c:
        assert c.execute('SELECT read_at FROM messages WHERE id=?',(target,)).fetchone()['read_at'] is None
    library=bob.get(f'/api/chats/dm/{aid}/shared',
        params={'kind':'links','since':1080,'until':1100,'sender_id':aid}).json()['items']
    assert len(library)==5 and all(item['sender_id']==aid for item in library)
    assert alice.get(f'/api/chats/dm/{bid}/context/{target+10000}').status_code==404
    assert bob.post(f'/api/blocks/{aid}').status_code==200
    assert bob.get(context).status_code==403


def test_workflow_idempotency_alerts_and_report_history():
    from app import alert_allowed, now

    admin,alice,bob,a,b=pair()
    aid,bid=a['id'],b['id']
    assert alice.post(f'/api/friends/request/{bid}').status_code==200
    assert bob.post(f'/api/friends/accept/{aid}').status_code==200
    upload={'file':('test.txt',b'attachment','text/plain')}
    key={'upload_key':'c_upload_key_1234567890'}
    first=alice.post('/api/uploads',files=upload,data=key)
    repeat=alice.post('/api/uploads',files=upload,data=key)
    assert first.status_code==repeat.status_code==200
    assert first.json()['attachment']==repeat.json()['attachment']
    assert alice.post('/api/uploads',files={'file':('test.txt',b'another','text/plain')},data=key).status_code==409
    gid=alice.post('/api/groups',json={'title':'Nhóm thử','member_ids':[bid]}).json()['id']
    group=f'/api/groups/{gid}/messages'
    member=bob.put(f'/api/chats/group/{gid}/alerts',json={'mode':'mentions'})
    assert member.status_code==200,member.text
    assert bob.get('/api/groups').json()['groups'][0]['alert_mode']=='mentions'
    assert alice.get(f'/api/groups/{gid}').json()['members'][0]['public_id']
    assert bob.put(f'/api/chats/dm/{aid}/alerts',json={'mode':'mentions'}).status_code==422
    until=now()+3600
    assert bob.put(f'/api/chats/dm/{aid}/alerts',json={'mode':'muted','until':until}).status_code==200
    assert bob.get('/api/friends').json()['friends'][0]['mute_until']==until
    with db() as c:
        assert not alert_allowed(c,'group',bid,gid,'Không nhắc',now())
        assert alert_allowed(c,'group',bid,gid,f'Nhờ @{b["public_id"]}.',now())
        assert not alert_allowed(c,'group',bid,gid,f'abc@{b["public_id"]}.',now())
        assert not alert_allowed(c,'dm',bid,aid,'Tin',until-1)
        assert alert_allowed(c,'dm',bid,aid,'Tin',until)
    send={'body':'Tin đính kèm','attachment_id':first.json()['attachment']['id'],
          'client_message_id':'c_group_send_123456789'}
    published=alice.post(group,json=send).json()['message']
    assert alice.post(group,json=send).json()['message']['id']==published['id']
    assert alice.post(group,json={**send,'body':'Nội dung khác'}).status_code==409
    assert len(bob.get(group).json()['messages'])==1
    report=bob.post('/api/reports',json={'scope':'profile','target_id':aid,'reason':'spam',
                    'description':'Báo cáo dùng để kiểm tra quy trình.'}).json()['report_id']
    path=f'/api/admin/reports/{report}'
    assert bob.get(path+'/history').status_code==403
    for status in ['in_review','reviewed']:
        result=admin.post(path+'/review',json={'decision':status,'note':f'Ghi chú {status}','admin_pin':'2345'})
        assert result.status_code==200,result.text
    events=admin.get(path+'/history').json()['events']
    assert [event['status'] for event in events]==['in_review','reviewed']
    assert events[0]['note']=='Ghi chú in_review'
    assert admin.post(path+'/review',json={'decision':'dismissed','note':'Đổi quyết định','admin_pin':'2345'}).status_code==409
