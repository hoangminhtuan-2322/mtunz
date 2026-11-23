"""Opt-in Expo native push notifications without exposing private message bodies.

Tokens are bound to revocable native sessions, not user IDs alone. A bounded
worker sends generic notifications to the fixed Expo HTTPS gateway.
"""
import asyncio
import logging
import os
import re
import requests
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from web_notifications import admin_alert_kind

LOG = logging.getLogger('mtunz.native_push')
EXPO_GATEWAY = 'https://exp.host/--/api/v2/push/send'
TOKEN_PATTERN = re.compile(r'^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{16,180}\]$')
PUSH_BODY = {
    'dm':'Bạn có tin nhắn mới.', 'group':'Bạn có tin nhắn mới trong nhóm.',
    'registration':'Có tài khoản mới chờ duyệt.',
    'support':'Có yêu cầu hỗ trợ hoặc tin nhắn hỗ trợ mới.',
    'test':'Đây là thông báo thử từ mtunz.',
    'support_reply':'Quản trị viên đã trả lời yêu cầu hỗ trợ của bạn.',
}


def install(core):
    app, db, one = core.app, core.db, core.one
    with db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS mobile_push_tokens (
            token TEXT PRIMARY KEY,
            session_hash TEXT NOT NULL,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            updated_at BIGINT NOT NULL
        )''')
        c.execute('CREATE INDEX IF NOT EXISTS mobile_push_user_idx ON mobile_push_tokens(user_id)')

    class Register(BaseModel):
        token: str = Field(min_length=30, max_length=220)

    def native_session_hash(request):
        # Only native bearer-authenticated sessions may register push tokens.
        auth = request.headers.get('authorization', '')
        if not auth.startswith('Bearer '):
            raise HTTPException(403, 'Yêu cầu phiên đăng nhập của ứng dụng.')
        value = auth[7:]
        if not re.fullmatch(r'[A-Za-z0-9_-]{30,128}', value):
            raise HTTPException(401, 'Phiên đăng nhập không hợp lệ.')
        return core.digest(value)

    @app.get('/api/mobile/push')
    def push_status(request: Request):
        user=core.current_user(request)
        sid=native_session_hash(request)
        with db() as c:
            enabled=bool(one(c,'SELECT 1 FROM mobile_push_tokens WHERE session_hash=? AND user_id=?',
                             (sid,user['id'])))
        return {'enabled':enabled}

    @app.post('/api/mobile/push')
    def enable_push(request: Request, body: Register):
        user = core.current_user(request)
        sid = native_session_hash(request)
        core.throttle(request, 'native-push', 20, 3600, str(user['id']))
        if not TOKEN_PATTERN.fullmatch(body.token):
            raise HTTPException(422, 'Mã thông báo thiết bị không hợp lệ.')
        with db() as c:
            c.execute('''INSERT INTO mobile_push_tokens(token,session_hash,user_id,updated_at)
                         VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET
                         session_hash=excluded.session_hash,
                         user_id=excluded.user_id,updated_at=excluded.updated_at''',
                      (body.token,sid,user['id'],core.now()))
            # A native session registers only its most recent push token.
            c.execute('DELETE FROM mobile_push_tokens WHERE session_hash=? AND token<>?',
                      (sid,body.token))
        return {'enabled':True}

    @app.delete('/api/mobile/push')
    def disable_push(request: Request):
        core.current_user(request,allow_deletion=True)
        sid = native_session_hash(request)
        with db() as c:
            c.execute('DELETE FROM mobile_push_tokens WHERE session_hash=?', (sid,))
        return {'enabled':False}

    previous_logout = core.forget_push_on_logout
    def cleanup_logout(c, session_hash, device_hash):
        previous_logout(c,session_hash,device_hash)
        c.execute('DELETE FROM mobile_push_tokens WHERE session_hash=?',(session_hash,))
    core.forget_push_on_logout = cleanup_logout

    def send_mobile(uid, kind, chat_id, body, foreground, session=None):
        at=core.now()
        with db() as c:
            if kind in ('dm','group'):
                if kind=='dm' and (core.has_block(c,uid,chat_id) or not core.friends(c,uid,chat_id)):
                    return False
                if not core.alert_allowed(c,kind,uid,chat_id,body,at):
                    return False
            if kind in ('registration','support') and not one(c,'SELECT 1 FROM users WHERE id=? AND is_admin=1',(uid,)):
                return False
            if kind=='support_reply' and not one(c,
                "SELECT 1 FROM tickets WHERE id=? AND owner_id=? AND status<>'deleted'",(chat_id,uid)):
                return False
            if one(c,'SELECT 1 FROM account_deletion_requests WHERE user_id=?',(uid,)):
                return False
            if one(c,"""SELECT 1 FROM users WHERE id=? AND sanction_kind IS NOT NULL
                        AND (sanction_until IS NULL OR sanction_until>?)""",(uid,at)):
                return False
            # Keep tokens tied to a session, including for the one-device test.
            sql='SELECT p.token,p.session_hash,p.updated_at FROM mobile_push_tokens p JOIN sessions s ON s.token_hash=p.session_hash AND s.user_id=p.user_id WHERE p.user_id=? AND s.expires_at>?'
            params=(uid,at)
            if session:
                sql+=' AND p.session_hash=?'
                params+=(session,)
            rows=core.many(c,sql+' ORDER BY p.updated_at DESC LIMIT 12',params)
        recipients=[row for row in rows if row['session_hash'] not in foreground]
        messages=[{'to':row['token'],'sound':'default','title':'mtunz','body':PUSH_BODY[kind],
                   'data':{'kind':kind,'chat_id':chat_id},'channelId':'messages',
                   'ttl':60 if kind=='test' else 1800,'priority':'high'} for row in recipients]
        if not messages:
            return False
        try:
            access_token=os.environ.get('EXPO_ACCESS_TOKEN','')
            headers={'Authorization':'Bearer '+access_token} if access_token else {}
            response=requests.post(EXPO_GATEWAY,json=messages,headers=headers,timeout=6,allow_redirects=False)
            if response.status_code!=200:
                LOG.warning('Native push gateway returned status %s',response.status_code)
                return False
            receipts=response.json().get('data') or []
            if isinstance(receipts,dict):
                receipts=[receipts]
            accepted=False
            for item,recipient in zip(receipts,recipients):
                if not isinstance(item,dict):
                    continue
                if item.get('status')=='ok':
                    accepted=True
                elif (item.get('details') or {}).get('error')=='DeviceNotRegistered':
                    with db() as c:
                        c.execute('DELETE FROM mobile_push_tokens WHERE token=? AND session_hash=? AND updated_at=?',
                                  (recipient['token'],recipient['session_hash'],recipient['updated_at']))
            return accepted
        except (requests.RequestException,ValueError,TypeError,AttributeError):
            LOG.warning('Native push gateway unavailable')
            return False

    @app.post('/api/mobile/push/test')
    async def push_test(request: Request):
        user=core.current_user(request)
        sid=native_session_hash(request)
        core.throttle(request,'native-push-test',3,60,str(user['id']))
        with db() as c:
            if not one(c,'SELECT 1 FROM mobile_push_tokens WHERE session_hash=? AND user_id=?',
                       (sid,user['id'])):
                raise HTTPException(409,'Hãy bật thông báo trên thiết bị này trước.')
        if not await asyncio.to_thread(send_mobile,user['id'],'test',0,'',frozenset(),sid):
            raise HTTPException(503,'Cổng thông báo chưa chấp nhận lệnh gửi. Hãy kiểm tra rồi bật lại thông báo.')
        return {'accepted':True}

    async def mobile_worker():
        queue=app.state.mobile_push_queue
        while True:
            try:
                item=await queue.get()
                try:
                    await asyncio.to_thread(send_mobile,*item)
                finally:
                    queue.task_done()
            except asyncio.CancelledError:
                raise
            except Exception:
                LOG.warning('Native push processing failed')

    previous_enqueue = core.enqueue_web_push
    def enqueue_both(uid,event,foreground_devices,data):
        previous_enqueue(uid,event,foreground_devices,data)
        queue=getattr(app.state,'mobile_push_queue',None)
        if queue is None or queue.full():
            return
        foreground=frozenset(core.hub.session_hashes[ws] for ws in core.hub.users.get(uid,())
                             if ws in core.hub.foreground and ws in core.hub.session_hashes)
        admin_kind=admin_alert_kind(event,data)
        if admin_kind:
            queue.put_nowait((uid,admin_kind,data.get('ticket_id',0),'',foreground))
            return
        # Admin replies also notify the ticket's account owner on Android.
        # The payload contains only a generic message and a ticket ID.
        if event=='support-message' and data.get('message',{}).get('from_admin'):
            ticket_id=data.get('ticket_id')
            if isinstance(ticket_id,int) and ticket_id>0:
                queue.put_nowait((uid,'support_reply',ticket_id,'',foreground))
            return
        msg=data.get('message') if event in ('message','group-message') else None
        if not msg or msg.get('sender_id')==uid:
            return
        if event=='message':
            queue.put_nowait((uid,'dm',msg['sender_id'],msg.get('body',''),foreground))
        else:
            queue.put_nowait((uid,'group',data['group_id'],msg.get('body',''),foreground))
    core.enqueue_web_push=enqueue_both

    @app.on_event('startup')
    async def start_mobile_push_worker():
        app.state.mobile_push_queue=asyncio.Queue(maxsize=256)
        app.state.mobile_push_worker=asyncio.create_task(mobile_worker())

    @app.on_event('shutdown')
    async def stop_mobile_push_worker():
        worker=getattr(app.state,'mobile_push_worker',None)
        app.state.mobile_push_queue=None
        if worker:
            worker.cancel()
            await asyncio.gather(worker,return_exceptions=True)
