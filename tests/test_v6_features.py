"""V6 chat, community and operations integration tests — disposable SQLite only."""
import io
import pytest
import app as core
from app import app,db,now,RATE_BUCKETS,hash_secret
from fastapi.testclient import TestClient
from test_flows import logged_admin,register_user

@pytest.fixture(autouse=True)
def v6_clean():
    RATE_BUCKETS.clear()
    with db() as c:
        for t in ('world_poll_votes','world_poll_options','world_polls',
                  'message_edit_history','scheduled_messages','admin_pin_attempts',
                  'admin_login_requests','message_requests','user_reports',
                  'world_messages','world_penalties','message_pins',
                  'group_messages','group_members','chat_groups','reactions',
                  'chat_preferences','attachments','recovery_grants',
                  'ticket_messages','tickets','notifications','messages',
                  'friendships','blocks','restrictions','sessions','trusted_devices',
                  'login_challenges','registrations','audit',
                  'account_deletion_requests','support_rate_limits'):
            c.execute('DELETE FROM '+t)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute('UPDATE world_rooms SET active=CASE WHEN slug=? THEN 1 ELSE 0 END',('general',))
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0,slow_seconds=0,announcement='' WHERE id=1")
        c.execute('UPDATE feature_flags SET enabled=1')
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
    yield
    with db() as c:
        for t in ('world_poll_votes','world_poll_options','world_polls','message_edit_history',
                  'admin_pin_attempts','admin_login_requests','sessions'):
            c.execute('DELETE FROM '+t)
        c.execute("UPDATE users SET password_hash=?,pin_hash=NULL,pin_length=NULL WHERE username='admin'",
                  (hash_secret('mtunz7'),))
        c.execute("UPDATE world_settings SET enabled=0,schedule_enabled=0,slow_seconds=0,announcement='' WHERE id=1")
        c.execute('UPDATE feature_flags SET enabled=1')
    RATE_BUCKETS.clear()

def setup():
    admin=logged_admin()
    users=[]
    for name in ('v6_amy','v6_bob'):
        users.append(register_user(admin,name))
    a,b=users
    aid=a.get('/api/me').json()['user']['id']
    bid=b.get('/api/me').json()['user']['id']
    assert a.post('/api/friends/request/'+str(bid)).status_code==200
    assert b.post('/api/friends/accept/'+str(aid)).status_code==200
    return admin,a,b,aid,bid

def set_pin(admin):
    r=admin.post('/api/me/pin/setup',json={'current_password':'mtunz7','pin':'2345','pin_length':4})
    assert r.status_code==200,r.text

def test_disappearing_dm_privacy_and_attachment_expiry():
    admin,a,b,aid,bid=setup()
    no_access=admin.get('/api/chat/disappear/'+str(bid))
    assert no_access.status_code==403
    choice=a.patch('/api/chat/disappear/'+str(bid),json={'seconds':3600})
    assert choice.status_code==200,choice.text
    assert a.get('/api/chat/disappear/'+str(bid)).json()['seconds']==3600
    sent=a.post('/api/messages',json={'recipient_id':bid,'body':'Tin tạm thời bí mật'})
    assert sent.status_code==200,sent.text
    mid=sent.json()['message']['id']
    with db() as c:
        saved=c.execute('SELECT expires_at,created_at FROM messages WHERE id=?',(mid,)).fetchone()
        assert saved['expires_at']==saved['created_at']+3600
    search=b.get('/api/chat/search/v6',params={'scope':'dm','chat_id':aid,'q':'bí mật'})
    assert search.status_code==200
    assert len(search.json()['results'])==1
    upload=a.post('/api/uploads',files={
        'file':('photo.png',io.BytesIO(b'\x89PNG\r\n\x1a\n'+b'0'*256),'image/png')})
    assert upload.status_code==200,upload.text
    fid=upload.json()['attachment']['id']
    photo=a.post('/api/messages',json={'recipient_id':bid,'body':'Ảnh tạm thời','attachment_id':fid})
    assert photo.status_code==200,photo.text
    assert b.get('/api/attachments/'+str(fid)).status_code==200
    photo_mid=photo.json()['message']['id']
    with db() as c:c.execute('UPDATE messages SET expires_at=? WHERE id IN (?,?)',(now()-1,mid,photo_mid))
    assert b.get('/api/messages/'+str(aid)).json()['messages']==[]
    assert b.get('/api/chat/search/v6',params={'scope':'dm','chat_id':aid,'q':'bí mật'}).json()['results']==[]
    assert b.get('/api/attachments/'+str(fid)).status_code==404
    assert core.v6_prune_expired()>=2
    with db() as c:
        assert c.execute('SELECT body FROM messages WHERE id=?',(mid,)).fetchone()['body']==''
        assert c.execute('SELECT COUNT(*) n FROM attachments WHERE id=?',(fid,)).fetchone()['n']==0

def test_edit_history_author_only_and_filtered_search():
    _,a,b,aid,bid=setup()
    mid=a.post('/api/messages',json={'recipient_id':bid,'body':'Nội dung đầu'}).json()['message']['id']
    assert a.patch('/api/messages/'+str(mid),json={'body':'Nội dung đã sửa'}).status_code==200
    mine=a.get('/api/chat/message/dm/'+str(mid)+'/versions',params={'chat_id':bid})
    assert mine.status_code==200,mine.text
    assert mine.json()['versions'][0]['previous_body']=='Nội dung đầu'
    assert b.get('/api/chat/message/dm/'+str(mid)+'/versions',params={'chat_id':aid}).status_code==403
    lookup=b.get('/api/chat/search/v6',params={
        'scope':'dm','chat_id':aid,'from_user':aid,'media':'text','q':'đã sửa'})
    assert lookup.status_code==200 and len(lookup.json()['results'])==1
    assert b.get('/api/chat/search/v6',params={
        'scope':'dm','chat_id':aid,'since':now()+60}).json()['results']==[]
    assert a.delete('/api/messages/'+str(mid)).status_code==200
    with db() as c:
        assert c.execute('SELECT COUNT(*) n FROM message_edit_history').fetchone()['n']==0

def test_room_slow_mode_polls_one_vote_and_admin_permissions():
    admin,a,b,aid,bid=setup();set_pin(admin)
    enable=admin.post('/api/admin/world/config',json={
        'enabled':True,'schedule_enabled':False,'open_minute':540,'close_minute':1320,
        'admin_password':'mtunz7','admin_pin':'2345'})
    assert enable.status_code==200,enable.text
    rooms=a.get('/api/world/rooms').json()['rooms']
    assert rooms and rooms[0]['slug']=='general'
    custom=admin.post('/api/admin/world/rooms',json={
        'slug':'dev-v6','title':'Lập trình','active':False,'admin_pin':'2345'})
    assert custom.status_code==200,custom.text
    rid=custom.json()['id']
    assert a.post('/api/world/messages',json={'room_id':rid,'body':'Tin thử'}).status_code==403
    opened=admin.patch('/api/admin/world/rooms/'+str(rid),json={'active':True,'admin_pin':'2345'})
    assert opened.status_code==200
    settings=admin.post('/api/admin/world/controls',json={
        'announcement':'Tôn trọng các thành viên','slow_seconds':10,'admin_pin':'2345'})
    assert settings.status_code==200,settings.text
    status=a.get('/api/world/status').json()
    assert status['slow_seconds']==10 and status['announcement']=='Tôn trọng các thành viên'
    sent=a.post('/api/world/messages',json={'room_id':rid,'body':'Chào mừng'})
    assert sent.status_code==200,sent.text
    assert sent.json()['message']['room_id']==rid
    assert a.get('/api/world/messages').json()['messages']==[]
    assert a.get('/api/world/messages',params={'room_id':rid}).json()['messages'][0]['body']=='Chào mừng'
    spam=a.post('/api/world/messages',json={'room_id':rid,'body':'Tin rất nhanh'})
    assert spam.status_code==429,spam.text
    assert spam.json()['detail']['code']=='world_slow_mode'
    poll=admin.post('/api/admin/world/polls',json={
        'room_id':rid,'question':'Bạn thích học môn nào?',
        'options':['Python','Cơ sở dữ liệu'],'duration_minutes':60,'admin_pin':'2345'})
    assert poll.status_code==200,poll.text
    pid=poll.json()['id']
    selected=b.get('/api/world/polls',params={'room_id':rid}).json()['polls'][0]
    option=selected['options'][0]['id']
    vote=b.post('/api/world/polls/'+str(pid)+'/vote',json={'option_id':option})
    assert vote.status_code==200,vote.text
    assert vote.json()['poll']['total_votes']==1
    assert b.post('/api/world/polls/'+str(pid)+'/vote',json={'option_id':option}).status_code==409
    flags=admin.post('/api/admin/ops/flags',json={
        'code':'community_polls','enabled':False,'admin_pin':'2345'})
    assert flags.status_code==200
    assert a.get('/api/world/polls',params={'room_id':rid}).json()['polls']==[]
    assert a.post('/api/world/polls/'+str(pid)+'/vote',json={'option_id':option}).status_code==403
    assert admin.get('/api/admin/world/polls').status_code==200

def test_ops_restricted_flags_and_factory_reset_scopes():
    admin,a,b,aid,bid=setup();set_pin(admin)
    assert a.get('/api/admin/ops/overview').status_code==403
    info=admin.get('/api/admin/ops/overview')
    assert info.status_code==200,info.text
    data=info.json()
    assert data['active_member_sessions']>=2
    assert {f['code'] for f in data['flags']}=={'registration_intake','member_uploads','calls','disappearing_dm','community_polls','world_rooms'}
    assert not any(k in info.text for k in ('password_hash','pin_hash','token_hash'))
    assert admin.post('/api/admin/ops/flags',json={
        'code':'calls','enabled':False,'admin_pin':'0000'}).status_code==401
    assert admin.post('/api/admin/ops/flags',json={
        'code':'calls','enabled':False,'admin_pin':'2345'}).status_code==200
    assert a.get('/api/features').json()['features']['calls'] is False
    preview=admin.get('/api/admin/data-reset/preview').json()
    assert any(scope['table']=='world_rooms' for scope in preview['all_scopes'])
    assert any(scope['table']=='world_poll_votes' for scope in preview['all_scopes'])
    assert any(scope['table']=='message_edit_history' for scope in preview['all_scopes'])
    assert admin.post('/api/admin/data-reset',json={
      'confirm':'XOA TOAN BO NGUOI DUNG','expected_members':preview['members'],
      'revision':preview['revision'],'admin_pin':'2345'}).status_code==200
    assert admin.get('/api/me').json()['user']['is_admin'] is True
    assert admin.get('/api/admin/world/rooms').json()['rooms'][0]['slug']=='general'
    assert a.get('/api/me').json()['user'] is None
    with db() as c:
        assert c.execute('SELECT COUNT(*) n FROM world_poll_votes').fetchone()['n']==0
        assert c.execute('SELECT COUNT(*) n FROM message_edit_history').fetchone()['n']==0
        assert c.execute('SELECT enabled FROM feature_flags WHERE code=?',('calls',)).fetchone()['enabled']==1


def test_recall_updates_notices_and_unread_without_affecting_other_messages():
    _,sender,recipient,sender_id,recipient_id=setup()
    def notices():
        return [n['body'] for n in recipient.get('/api/notifications').json()['notifications']]
    original=sender.post('/api/messages',json={'recipient_id':recipient_id,'body':'Bản nháp'})
    mid=original.json()['message']['id']
    sender.post('/api/messages',json={'recipient_id':recipient_id,'body':'Giữ lại'})
    assert any('Bản nháp' in body for body in notices())
    assert sender.patch(f'/api/messages/{mid}',json={'body':'Đã chỉnh sửa'}).status_code==200
    assert any('Đã chỉnh sửa' in body for body in notices())
    assert sender.delete(f'/api/messages/{mid}').status_code==200
    remaining=notices()
    assert not any('Bản nháp' in body or 'Đã chỉnh sửa' in body for body in remaining)
    assert any('Giữ lại' in body for body in remaining)
    friend=next(f for f in recipient.get('/api/friends').json()['friends'] if f['other_id']==sender_id)
    assert friend['unread']==1


def test_studio_preferences_and_admin_intake_controls():
    admin,a,b,_,_=setup()
    set_pin(admin)
    assert a.patch('/api/me/appearance',json={'wallpaper':'lagoon'}).status_code==200
    assert a.get('/api/me').json()['user']['chat_wallpaper']=='lagoon'
    assert b.get('/api/me').json()['user']['chat_wallpaper']=='midnight'
    assert a.patch('/api/me/appearance',json={'wallpaper':'bogus'}).status_code==422
    for code in ('member_uploads','registration_intake'):
        change={'code':code,'enabled':False,'admin_pin':'2345'}
        assert a.post('/api/admin/ops/flags',json=change).status_code==403
        assert admin.post('/api/admin/ops/flags',json={**change,'admin_pin':'9999'}).status_code==401
        assert admin.post('/api/admin/ops/flags',json=change).status_code==200
    assert a.post('/api/uploads',files={'file':('demo.txt',b'demo','text/plain')}).status_code==423
    guest=TestClient(app)
    assert guest.post('/api/registration/request',json={'username':'studio_new','phone':'0977777712'}).status_code==423
    assert a.get('/api/me').status_code==200
    assert admin.post('/api/admin/ops/flags',json={'code':'member_uploads','enabled':True,'admin_pin':'2345'}).status_code==200
    assert a.post('/api/uploads',files={'file':('demo.txt',b'demo','text/plain')}).status_code==200
