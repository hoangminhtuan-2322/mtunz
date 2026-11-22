"""Opt-in Web Push for offline devices and pending account reminders."""
import asyncio
import base64
import binascii
import json
import logging
import re
from urllib.parse import urlsplit

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException, Request
from pywebpush import WebPushException, webpush
from pydantic import BaseModel, Field


class PushSubscription(BaseModel):
    endpoint: str = Field(max_length=2048)
    keys: dict[str, str]


GATEWAYS = {'fcm.googleapis.com','updates.push.services.mozilla.com',
            'web.push.apple.com','wns.windows.com','notify.windows.com'}
GATEWAY_SUFFIXES = ('.push.apple.com','.notify.windows.com','.push.services.mozilla.com')
LOG = logging.getLogger('mtunz.push')


def allowed_endpoint(endpoint):
    if not endpoint.isascii() or any(char.isspace() or ord(char)<32 for char in endpoint):
        return False
    try:
        url=urlsplit(endpoint)
        host=url.hostname or ''
        return (url.scheme=='https' and url.netloc in (host,host+':443') and not url.username
                and not url.password and not url.fragment and url.path.startswith('/')
                and (host in GATEWAYS or host.endswith(GATEWAY_SUFFIXES)))
    except ValueError:
        return False


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def decode_key(value, size):
    if not re.fullmatch(r'[A-Za-z0-9_-]+={0,2}',value) or len(value)>90:
        return None
    try:
        plain=base64.urlsafe_b64decode(value.rstrip('=')+'='*((-len(value.rstrip('=')))%4))
    except (ValueError,binascii.Error):
        return None
    return plain if len(plain)==size else None


class PushGatewaySession(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs['allow_redirects']=False
        return super().request(method,url,**kwargs)


def install(core):
    app,db,one=core.app,core.db,core.one
    with db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS web_push_subscriptions (
            endpoint TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_hash TEXT NOT NULL, public_key TEXT NOT NULL, auth_key TEXT NOT NULL,
            updated_at BIGINT NOT NULL
        )''')
        c.execute('CREATE INDEX IF NOT EXISTS web_push_user_idx ON web_push_subscriptions(user_id,device_hash)')
        columns={r['name'] for r in c.execute('PRAGMA table_info(account_deletion_requests)')}
        if 'reminded_at' not in columns:
            c.execute('ALTER TABLE account_deletion_requests ADD COLUMN reminded_at BIGINT')
        existing=one(c,"SELECT value FROM settings WHERE key='web_push_vapid'")
        if not existing:
            key=ec.generate_private_key(ec.SECP256R1())
            der=key.private_bytes(serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,
                                  serialization.NoEncryption())
            c.execute("INSERT INTO settings(key,value) VALUES('web_push_vapid',?) ON CONFLICT(key) DO NOTHING",(b64(der),))
            existing=one(c,"SELECT value FROM settings WHERE key='web_push_vapid'")
        secret=existing['value']
    key=serialization.load_der_private_key(base64.urlsafe_b64decode(secret+'='*((-len(secret))%4)),password=None)
    public=b64(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint))

    @app.get('/api/me/push')
    def push_status(request:Request):
        user=core.current_user(request)
        with db() as c:
            enabled=bool(one(c,'SELECT 1 FROM web_push_subscriptions WHERE user_id=? AND device_hash=?',
                             (user['id'],core.digest(request.state.gid))))
        return {'enabled':enabled,'public_key':public}

    @app.post('/api/me/push')
    def push_enable(request:Request,body:PushSubscription):
        user=core.current_user(request)
        core.throttle(request,'push-enable',15,3600,str(user['id']))
        if not allowed_endpoint(body.endpoint):
            raise HTTPException(422,'Trình duyệt sử dụng cổng thông báo chưa được hỗ trợ.')
        public_key=decode_key(body.keys.get('p256dh',''),65)
        auth_key=decode_key(body.keys.get('auth',''),16)
        try:
            if not public_key or not auth_key or public_key[0]!=4:
                raise ValueError
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),public_key)
        except ValueError:
            raise HTTPException(422,'Thông tin đăng ký thông báo không hợp lệ.')
        device=core.digest(request.state.gid)
        with db() as c:
            c.execute('DELETE FROM web_push_subscriptions WHERE device_hash=? AND endpoint<>?',(device,body.endpoint))
            c.execute('''INSERT INTO web_push_subscriptions(endpoint,user_id,device_hash,public_key,auth_key,updated_at)
                         VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,
                         device_hash=excluded.device_hash,public_key=excluded.public_key,
                         auth_key=excluded.auth_key,updated_at=excluded.updated_at''',
                      (body.endpoint,user['id'],device,b64(public_key),b64(auth_key),core.now()))
        return {'enabled':True}

    @app.delete('/api/me/push')
    def push_disable(request:Request):
        user=core.current_user(request,allow_deletion=True)
        with db() as c:
            c.execute('DELETE FROM web_push_subscriptions WHERE user_id=? AND device_hash=?',
                      (user['id'],core.digest(request.state.gid)))
        return {'enabled':False}

    def forget_on_logout(c, session_hash, device_hash):
        c.execute('''DELETE FROM web_push_subscriptions WHERE device_hash=?
                     AND user_id IN (SELECT user_id FROM sessions WHERE token_hash=?
                      AND NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=sessions.user_id))''',
                  (device_hash,session_hash))

    core.forget_push_on_logout=forget_on_logout

    def deliver(uid, kind, chat_id=0, online=frozenset(), message_body=''):
        with db() as c:
            rows=core.many(c,'SELECT * FROM web_push_subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 12',(uid,))
            if kind in ('dm','group') and rows:
                if one(c,'''SELECT 1 FROM users u WHERE u.id=? AND
                         ((u.sanction_kind IS NOT NULL AND (u.sanction_until IS NULL OR u.sanction_until>?))
                          OR EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=u.id))''',(uid,core.now())):
                    return True
                if kind=='dm':
                    if core.has_block(c,uid,chat_id) or not core.friends(c,uid,chat_id):
                        return True
                if not core.alert_allowed(c,kind,uid,chat_id,message_body,core.now()):
                    return True
        payload=json.dumps({'type':kind,'chat_id':chat_id})
        complete=True
        for row in rows:
            if row['device_hash'] in online:
                continue
            endpoint=row['endpoint']
            if not allowed_endpoint(endpoint):
                continue
            try:
                with PushGatewaySession() as session:
                    response=webpush({'endpoint':endpoint,'keys':{'p256dh':row['public_key'],'auth':row['auth_key']}},
                        data=payload,vapid_private_key=secret,vapid_claims={'sub':core.PUBLIC_ORIGIN or 'https://mtunz.onrender.com'},
                        ttl=3600 if kind=='deletion' else 1800,timeout=4,requests_session=session)
                complete=complete and 200<=response.status_code<300
            except WebPushException as error:
                response=error.response
                status=response.status_code if response is not None else 0
                if status in (404,410):
                    with db() as c:
                        c.execute('DELETE FROM web_push_subscriptions WHERE endpoint=? AND updated_at=?',
                                  (endpoint,row['updated_at']))
                else:
                    complete=False
            except (requests.RequestException,ValueError):
                complete=False
        return complete

    async def push_worker(queue):
        while True:
            try:
                uid,kind,chat_id,online,message_body=await queue.get()
                try:
                    await asyncio.to_thread(deliver,uid,kind,chat_id,online,message_body)
                finally:
                    queue.task_done()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Gateway URLs and keys are confidential, including in logs.
                LOG.warning('Could not deliver a push notification')

    def enqueue(uid,event,online,data):
        message=data.get('message')
        if event not in ('message','group-message') or not message or message.get('sender_id')==uid:
            return
        queue=getattr(app.state,'web_push_queue',None)
        if not queue or queue.full():
            return
        if event=='message':
            item=(uid,'dm',message['sender_id'],online,message.get('body',''))
        else:
            item=(uid,'group',data['group_id'],online,message.get('body',''))
        queue.put_nowait(item)

    core.enqueue_web_push=enqueue

    def remind_pending():
        at=core.now()
        with db() as c:
            pending=core.many(c,'''SELECT user_id,purge_at FROM account_deletion_requests
                  WHERE reminded_at IS NULL AND purge_at>? AND purge_at<=?
                  ORDER BY purge_at LIMIT 25''',(at,at+86400))
        for row in pending:
            uid,deadline=row['user_id'],row['purge_at']
            if not deliver(uid,'deletion'):
                continue
            with db() as c:
                changed=c.execute('''UPDATE account_deletion_requests SET reminded_at=?
                      WHERE user_id=? AND purge_at=? AND purge_at>? AND reminded_at IS NULL''',
                      (core.now(),uid,deadline,core.now()))
                if changed.rowcount:
                    c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                              (uid,'Tài khoản đang chờ xóa và còn dưới 24 giờ. Đăng nhập để chọn giữ tài khoản.',core.now()))

    async def reminder_worker():
        while True:
            try:
                await asyncio.to_thread(remind_pending)
            except Exception:
                LOG.warning('Could not check pending account reminders')
            await asyncio.sleep(300)

    core.process_deletion_reminders=remind_pending

    @app.on_event('startup')
    async def start_push_workers():
        queue=asyncio.Queue(maxsize=256)
        app.state.web_push_queue=queue
        app.state.web_push_workers=[asyncio.create_task(push_worker(queue)),asyncio.create_task(reminder_worker())]

    @app.on_event('shutdown')
    async def stop_push_workers():
        tasks=getattr(app.state,'web_push_workers',())
        if tasks:
            app.state.web_push_queue=None
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
