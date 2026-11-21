"""Messenger V4 — durable schedule queue and genuine device delivery receipts.

No external queue: on Render single worker a startup task catches up with stored
jobs. If the free web service is asleep, due jobs wait until it wakes; the UI
never promises second-perfect delivery. Scheduled messages never bypass current
friendship, blocks, sanctions, attachment ownership or revoked account access.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

logger=logging.getLogger('mtunz.messaging_v4')
SCHEDULE_LIMIT=50
MAX_DELAY=366*86400

class DeliveryAck(BaseModel):
    up_to:int=Field(ge=1)

class ScheduledCreate(BaseModel):
    recipient_id:int
    body:str=Field(default='',max_length=2000)
    attachment_id:int|None=None
    reply_to:int|None=None
    send_at:int=Field(gt=0)

class ScheduledEdit(BaseModel):
    body:str=Field(default='',max_length=2000)
    send_at:int=Field(gt=0)

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    current_user,hub,now=core.current_user,core.hub,core.now
    require_peer,has_block=core.require_peer,core.has_block
    with db() as c:
        existing={row['name'] for row in c.execute('PRAGMA table_info(messages)')}
        if 'delivered_at' not in existing:
            c.execute('ALTER TABLE messages ADD COLUMN delivered_at INTEGER')
        if 'client_message_id' not in existing:
            c.execute('ALTER TABLE messages ADD COLUMN client_message_id TEXT')
        c.executescript("""
          CREATE UNIQUE INDEX IF NOT EXISTS dm_client_message_unique
            ON messages(sender_id,client_message_id)
            WHERE client_message_id IS NOT NULL;
          CREATE TABLE IF NOT EXISTS scheduled_messages (
            id INTEGER PRIMARY KEY,
            sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL DEFAULT '',
            attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
            reply_to INTEGER,
            send_at INTEGER NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending',
            message_id INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            failure_reason TEXT NOT NULL DEFAULT ''
          );
          CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
            ON scheduled_messages(state,send_at,id);
          CREATE INDEX IF NOT EXISTS scheduled_messages_sender_idx
            ON scheduled_messages(sender_id,state,send_at);
        """)

    def can_schedule(c,sender_id,recipient_id,attachment_id,reply_to):
        require_peer(c,sender_id,recipient_id)
        target=one(c,'''SELECT sanction_kind,sanction_until,needs_display_name
                        FROM users WHERE id=? AND is_admin=0''',(recipient_id,))
        if not target or target['needs_display_name']:
            raise HTTPException(403,'Người nhận chưa sẵn sàng trò chuyện.')
        if attachment_id is not None:
            core.file_for_message(c,attachment_id,sender_id)
            if one(c,'''SELECT 1 FROM scheduled_messages
                         WHERE attachment_id=? AND state='pending' ''',(attachment_id,)):
                raise HTTPException(409,'Tệp này đã được lên lịch gửi. Vui lòng tải tệp khác.')
        if reply_to is not None and not one(c,'''SELECT 1 FROM messages WHERE id=?
                    AND deleted_at IS NULL AND
                    ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))''',
                    (reply_to,sender_id,recipient_id,recipient_id,sender_id)):
            raise HTTPException(404,'Tin nhắn muốn trả lời không tồn tại.')

    def validate_time(stamp):
        current=now()
        if stamp<current+20 or stamp>current+MAX_DELAY:
            raise HTTPException(422,'Hãy chọn giờ gửi tối thiểu 20 giây và không quá 366 ngày sau hiện tại.')

    @app.post('/api/messages/delivered/{other_id}')
    async def delivered_ack(request:Request,other_id:int,body:DeliveryAck):
        u=current_user(request)
        with db() as c:
            require_peer(c,u['id'],other_id)
            # ACK only actual messages for the authenticated recipient.
            highest=one(c,'''SELECT id FROM messages WHERE id=? AND sender_id=?
                               AND recipient_id=?''',(body.up_to,other_id,u['id']))
            if not highest:
                raise HTTPException(404,'Tin nhắn không thuộc cuộc trò chuyện này.')
            stamp=now()
            changed=c.execute('''UPDATE messages SET delivered_at=?
                       WHERE sender_id=? AND recipient_id=? AND id<=?
                       AND delivered_at IS NULL''',(stamp,other_id,u['id'],body.up_to)).rowcount
            prefs=one(c,'SELECT show_receipts FROM users WHERE id=?',(u['id'],))
            hidden=not prefs['show_receipts'] or core.is_restricted(c,u['id'],other_id)
        if changed and not hidden:
            await hub.user(other_id,'delivered',by=u['id'],up_to=body.up_to,at=stamp)
        return {'ok':True,'delivered':changed}

    @app.get('/api/scheduled-messages')
    async def scheduled_list(request:Request,recipient_id:int=0):
        u=current_user(request)
        with db() as c:
            args=[u['id']]
            query='''SELECT id,recipient_id,body,attachment_id,reply_to,send_at,state,
                            message_id,created_at,failure_reason FROM scheduled_messages
                     WHERE sender_id=? AND state IN ('pending','failed')'''
            if recipient_id:
                query+=' AND recipient_id=?'
                args.append(recipient_id)
            query+=' ORDER BY send_at ASC LIMIT 100'
            rows=many(c,query,tuple(args))
        return {'messages':rows}

    @app.post('/api/scheduled-messages')
    async def schedule_message(request:Request,body:ScheduledCreate):
        u=current_user(request)
        core.throttle(request,'schedule-create',40,3600,str(u['id']))
        text=body.body.strip()
        if not text and body.attachment_id is None:
            raise HTTPException(422,'Hãy nhập nội dung hoặc chọn một tệp.')
        validate_time(body.send_at)
        with db() as c:
            can_schedule(c,u['id'],body.recipient_id,body.attachment_id,body.reply_to)
            count=one(c,"SELECT COUNT(*) n FROM scheduled_messages WHERE sender_id=? AND state='pending'",(u['id'],))['n']
            if count>=SCHEDULE_LIMIT:raise HTTPException(429,'Bạn có tối đa 50 tin đang hẹn giờ.')
            stamp=now()
            item=c.execute('''INSERT INTO scheduled_messages
              (sender_id,recipient_id,body,attachment_id,reply_to,send_at,state,created_at,updated_at)
              VALUES(?,?,?,?,?,?,'pending',?,?)''',
              (u['id'],body.recipient_id,text,body.attachment_id,body.reply_to,body.send_at,stamp,stamp))
            identifier=item.lastrowid
        wake.set()
        return {'ok':True,'id':identifier,'send_at':body.send_at,'state':'pending'}

    @app.patch('/api/scheduled-messages/{item_id}')
    async def edit_schedule(request:Request,item_id:int,body:ScheduledEdit):
        u=current_user(request)
        core.throttle(request,'schedule-edit',90,3600,str(u['id']))
        validate_time(body.send_at)
        with db() as c:
            original=one(c,'''SELECT * FROM scheduled_messages
                              WHERE id=? AND sender_id=? AND state='pending' ''',
                         (item_id,u['id']))
            if not original:raise HTTPException(409,'Tin này đã được gửi hoặc không còn cho sửa.')
            if not body.body.strip() and original['attachment_id'] is None:
                raise HTTPException(422,'Không thể để trống tin nhắn.')
            changed=c.execute('''UPDATE scheduled_messages
                       SET body=?,send_at=?,updated_at=?
                       WHERE id=? AND sender_id=? AND state='pending' ''',
                       (body.body.strip(),body.send_at,now(),item_id,u['id']))
            if changed.rowcount!=1:raise HTTPException(409,'Tin đã thay đổi trên thiết bị khác.')
        wake.set()
        return {'ok':True,'id':item_id,'send_at':body.send_at}

    @app.delete('/api/scheduled-messages/{item_id}')
    async def cancel_schedule(request:Request,item_id:int):
        u=current_user(request)
        with db() as c:
            deleted=c.execute('''DELETE FROM scheduled_messages
                        WHERE id=? AND sender_id=? AND state='pending' ''',
                        (item_id,u['id']))
            if deleted.rowcount!=1:
                raise HTTPException(409,'Tin này đã được gửi hoặc hủy trước đó.')
        wake.set()
        return {'ok':True}

    async def deliver_due():
        with db() as c:
            emergency=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
        if emergency and emergency['value']=='1':
            return 0
        # Query only a small page of jobs; each item is claimed in the same
        # transaction as the message insert. No duplicate after process restart.
        with db() as c:
            due=many(c,"SELECT id FROM scheduled_messages WHERE state='pending' AND send_at<=? ORDER BY send_at,id LIMIT 30",(now(),))
        completed=0
        for ref in due:
            message=None
            sender_id=recipient_id=None
            with db() as c:
                emergency=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
                if emergency and emergency['value']=='1':
                    break
                claim=c.execute('''UPDATE scheduled_messages SET state='processing',updated_at=?
                           WHERE id=? AND state='pending' AND send_at<=?''',
                           (now(),ref['id'],now()))
                if claim.rowcount!=1:continue
                row=one(c,'SELECT * FROM scheduled_messages WHERE id=?',(ref['id'],))
                sender_id,recipient_id=row['sender_id'],row['recipient_id']
                sender=one(c,'SELECT * FROM users WHERE id=?',(sender_id,))
                allowed=bool(sender and not sender['is_admin'] and
                    (not sender['sanction_kind'] or
                     (sender['sanction_until'] and sender['sanction_until']<=now())))
                try:
                    if not allowed:
                        raise HTTPException(403,'Người gửi không còn quyền sử dụng tài khoản.')
                    can_schedule(c,sender_id,recipient_id,None,row['reply_to'])
                    if row['attachment_id']:
                        # Revalidate ownership AND that a voice/file was not
                        # consumed by another conversation after scheduling.
                        core.file_for_message(c,row['attachment_id'],sender_id)
                    unique='scheduled:'+str(row['id'])
                    lifespan=(core.v6_vanish_seconds(c,sender_id,recipient_id)
                              if core.v6_feature_on(c,'disappearing_dm') else 0)
                    created=now()
                    saved=c.execute('''INSERT INTO messages
                          (sender_id,recipient_id,body,attachment_id,reply_to,
                           created_at,client_message_id,expires_at)
                          VALUES(?,?,?,?,?,?,?,?)''',
                          (sender_id,recipient_id,row['body'],row['attachment_id'],
                           row['reply_to'],created,unique,
                           created+lifespan if lifespan else None))
                    message=core.message_details(c,one(c,'SELECT * FROM messages WHERE id=?',(saved.lastrowid,)))
                    c.execute('''UPDATE scheduled_messages
                              SET state='sent',updated_at=?,message_id=? WHERE id=?''',
                              (now(),saved.lastrowid,row['id']))
                    p=one(c,'SELECT muted FROM chat_preferences WHERE user_id=? AND other_id=?',
                          (recipient_id,sender_id))
                    if not p or not p['muted']:
                        core.notify_user_persist(c,recipient_id,
                            (f'Tin nhắn tự biến mất từ {sender["display_name"] or "Thành viên"}.'
                             if lifespan else
                             f'Tin nhắn hẹn giờ mới từ {sender["display_name"] or "Thành viên"}.'))
                except HTTPException as exc:
                    c.execute('''UPDATE scheduled_messages SET state='failed',updated_at=?,
                               failure_reason=? WHERE id=?''',
                              (now(),str(exc.detail)[:160],row['id']))
            if message:
                await asyncio.gather(
                    hub.user(sender_id,'message',message=message),
                    hub.user(recipient_id,'message',message=message),
                    hub.user(sender_id,'scheduled-updated'))
            else:
                await hub.user(sender_id,'scheduled-updated')
            completed+=1
        return completed

    wake=asyncio.Event()
    core.messenger_v4_wake=wake
    # Callable in tests and useful for a future explicitly authorized worker.
    core.messaging_v4_deliver_due=deliver_due

    async def worker():
        while True:
            try:
                finished=await deliver_due()
                # Wake no later than the next scheduled timestamp, or check
                # occasionally for jobs from an alternate worker/restart.
                with db() as c:
                    next_row=one(c,"SELECT MIN(send_at) next_at FROM scheduled_messages WHERE state='pending'")
                until=int(next_row['next_at'])-now() if next_row and next_row['next_at'] is not None else 60
                with db() as c:
                    locked=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
                wait=30 if locked and locked['value']=='1' else (
                    0.2 if finished==30 else max(0.3,min(60,until)))
                wake.clear()
                try:await asyncio.wait_for(wake.wait(),timeout=wait)
                except asyncio.TimeoutError:pass
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception('Scheduled message worker failed; will retry.')
                await asyncio.sleep(10)

    @app.on_event('startup')
    async def startup_messenger_v4():
        app.state.messenger_v4_task=asyncio.create_task(worker())

    @app.on_event('shutdown')
    async def shutdown_messenger_v4():
        task=getattr(app.state,'messenger_v4_task',None)
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
