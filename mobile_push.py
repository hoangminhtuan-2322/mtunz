"""Opt-in Expo native push notifications without exposing private message bodies.

Tokens are bound to revocable native sessions, not user IDs alone. A bounded
worker sends generic notifications to the fixed Expo HTTPS gateway.
"""
import asyncio
import logging
import re
import requests
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

LOG = logging.getLogger('mtunz.native_push')
EXPO_GATEWAY = 'https://exp.host/--/api/v2/push/send'
TOKEN_PATTERN = re.compile(r'^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{16,180}\]$')


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

    @app.post('/api/mobile/push')
    def enable_push(request: Request, body: Register):
        user = core.current_user(request)
        sid = native_session_hash(request)
        if user['is_admin']:
            raise HTTPException(403, 'Không hỗ trợ thông báo quản trị qua ứng dụng.')
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

    def send_mobile(uid, kind, chat_id, body, active_sessions):
        with db() as c:
            if kind=='dm':
                if core.has_block(c,uid,chat_id) or not core.friends(c,uid,chat_id):
                    return
            if not core.alert_allowed(c,kind,uid,chat_id,body,core.now()):
                return
            if one(c,'''SELECT 1 FROM account_deletion_requests WHERE user_id=?''',(uid,)):
                return
            if one(c,'''SELECT 1 FROM users WHERE id=? AND sanction_kind IS NOT NULL
                        AND (sanction_until IS NULL OR sanction_until>?)''',(uid,core.now())):
                return
            # This join also prevents push from sessions revoked in another tab.
            rows=core.many(c,'''SELECT p.token,p.session_hash FROM mobile_push_tokens p
                 JOIN sessions s ON s.token_hash=p.session_hash AND s.user_id=p.user_id
                 WHERE p.user_id=? AND s.expires_at>?
                 ORDER BY p.updated_at DESC LIMIT 12''',(uid,core.now()))
        messages=[{'to':r['token'],'sound':'default','title':'mtunz',
                   'body':'Bạn có tin nhắn mới.',
                   'data':{'kind':kind,'chat_id':chat_id},
                   'ttl':1800,'priority':'high'} for r in rows if r['session_hash'] not in active_sessions]
        if not messages:
            return
        try:
            response=requests.post(EXPO_GATEWAY,json=messages,timeout=6,allow_redirects=False)
            if response.status_code!=200:
                LOG.warning('Native push gateway returned non-successful status')
                return
            receipts=response.json().get('data') or []
            if isinstance(receipts,dict):
                receipts=[receipts]
            for item,recipient in zip(receipts,messages):
                if item.get('status')=='error' and item.get('details',{}).get('error')=='DeviceNotRegistered':
                    with db() as c:
                        c.execute('DELETE FROM mobile_push_tokens WHERE token=?',(recipient['to'],))
        except (requests.RequestException,ValueError,TypeError):
            LOG.warning('Native push gateway unavailable')

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
    def enqueue_both(uid,event,online,data):
        previous_enqueue(uid,event,online,data)
        msg=data.get('message') if event in ('message','group-message') else None
        if not msg or msg.get('sender_id')==uid:return
        queue=getattr(app.state,'mobile_push_queue',None)
        if queue is None or queue.full():return
        active=frozenset(core.hub.session_hashes.get(ws) for ws in core.hub.users.get(uid,()))
        if event=='message':
            queue.put_nowait((uid,'dm',msg['sender_id'],msg.get('body',''),active))
        else:
            queue.put_nowait((uid,'group',data['group_id'],msg.get('body',''),active))
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
