"""mtunz V6: expiring direct messages, bounded edit history and filtered chat search.

Server-side authorization is required for every read. Expired content is not
returned even if the expiration worker has not run yet. Scheduled messages
re-evaluate the current sender's disappearing-message preference at delivery.
"""
import asyncio
import logging
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from typing import Literal

LOG=logging.getLogger("mtunz.chat_v6")
VANISH_CHOICES=(0,3600,86400,604800)

class DisappearSetting(BaseModel):
    seconds:Literal[0,3600,86400,604800]

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        cols={r['name'] for r in c.execute('PRAGMA table_info(messages)')}
        if 'expires_at' not in cols:
            c.execute('ALTER TABLE messages ADD COLUMN expires_at INTEGER')
        cols={r['name'] for r in c.execute('PRAGMA table_info(chat_preferences)')}
        if 'vanish_seconds' not in cols:
            c.execute('ALTER TABLE chat_preferences ADD COLUMN vanish_seconds INTEGER NOT NULL DEFAULT 0')
        c.executescript("""
          CREATE INDEX IF NOT EXISTS dm_expire_due_idx ON messages(expires_at)
            WHERE expires_at IS NOT NULL;
          CREATE TABLE IF NOT EXISTS message_edit_history (
            id INTEGER PRIMARY KEY,
            scope TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            editor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            previous_body TEXT NOT NULL,
            changed_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS edit_history_message_idx
            ON message_edit_history(scope,message_id,id);
        """)

    def vanish_seconds(c,user_id,other_id):
        item=one(c,"SELECT vanish_seconds FROM chat_preferences WHERE user_id=? AND other_id=?",
                 (user_id,other_id))
        return int(item['vanish_seconds']) if item else 0

    core.v6_vanish_seconds=vanish_seconds

    @app.get('/api/chat/disappear/{other_id}')
    async def disappear_status(request:Request,other_id:int):
        u=core.current_user(request)
        with db() as c:
            if not core.v6_feature_on(c,'disappearing_dm'):
                raise HTTPException(403,'Tính năng tin nhắn tự biến mất đã được Admin tắt.')
            core.require_peer(c,u['id'],other_id)
            seconds=vanish_seconds(c,u['id'],other_id)
        return {'seconds':seconds,'options':list(VANISH_CHOICES),
                'explanation':'Chỉ áp dụng cho các tin mới bạn gửi. Tin đã gửi không đổi.'}

    @app.patch('/api/chat/disappear/{other_id}')
    async def disappear_update(request:Request,other_id:int,body:DisappearSetting):
        u=core.current_user(request)
        core.throttle(request,'vanish-set',30,3600,str(u['id']))
        with db() as c:
            if not core.v6_feature_on(c,'disappearing_dm'):
                raise HTTPException(403,'Tính năng tin nhắn tự biến mất đã được Admin tắt.')
            core.require_peer(c,u['id'],other_id)
            c.execute('''INSERT INTO chat_preferences(user_id,other_id,vanish_seconds)
                         VALUES(?,?,?) ON CONFLICT(user_id,other_id)
                         DO UPDATE SET vanish_seconds=excluded.vanish_seconds''',
                      (u['id'],other_id,body.seconds))
        return {'ok':True,'seconds':body.seconds}

    @app.get('/api/chat/search/v6')
    async def advanced_search(request:Request,scope:Literal['dm','group'],chat_id:int,
                              q:str='',since:int=0,until:int=0,
                              from_user:int=0,media:Literal['all','files','text']='all',
                              limit:int=30):
        u=core.current_user(request)
        if chat_id<=0 or len(q)>120 or limit<1 or limit>50:
            raise HTTPException(422,'Bộ lọc tìm kiếm không hợp lệ.')
        if since<0 or until<0 or (since and until and since>until):
            raise HTTPException(422,'Khoảng thời gian không hợp lệ.')
        with db() as c:
            pattern='%'+q.strip().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
            if scope=='dm':
                core.require_peer(c,u['id'],chat_id)
                sql='''SELECT m.id,m.body,m.created_at,m.sender_id,m.attachment_id,
                        a.original_name AS attachment_name
                       FROM messages m LEFT JOIN attachments a ON a.id=m.attachment_id
                       WHERE ((m.sender_id=? AND m.recipient_id=?) OR
                              (m.recipient_id=? AND m.sender_id=?))
                         AND m.deleted_at IS NULL
                         AND (m.expires_at IS NULL OR m.expires_at>?)'''
                args=[u['id'],chat_id,u['id'],chat_id,core.now()]
            else:
                permitted=one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',
                              (chat_id,u['id']))
                if not permitted:raise HTTPException(403,'Bạn không thuộc nhóm này.')
                sql='''SELECT m.id,m.body,m.created_at,m.sender_id,m.attachment_id,
                        a.original_name AS attachment_name
                       FROM group_messages m LEFT JOIN attachments a ON a.id=m.attachment_id
                       WHERE m.group_id=? AND m.deleted_at IS NULL'''
                args=[chat_id]
            if q.strip():
                sql+=" AND (m.body LIKE ? ESCAPE '\\' OR COALESCE(a.original_name,'') LIKE ? ESCAPE '\\')"
                args.extend([pattern,pattern])
            if since:sql+=' AND m.created_at>=?';args.append(since)
            if until:sql+=' AND m.created_at<=?';args.append(until)
            if from_user:sql+=' AND m.sender_id=?';args.append(from_user)
            if media=='files':sql+=' AND m.attachment_id IS NOT NULL'
            if media=='text':sql+=' AND m.attachment_id IS NULL'
            sql+=' ORDER BY m.id DESC LIMIT ?';args.append(limit)
            result=many(c,sql,tuple(args))
        return {'results':result,'count':len(result)}

    @app.get('/api/chat/message/{scope}/{message_id}/versions')
    async def message_versions(request:Request,scope:Literal['dm','group'],message_id:int,
                               chat_id:int):
        u=core.current_user(request)
        with db() as c:
            if scope=='dm':
                core.require_peer(c,u['id'],chat_id)
                m=one(c,'''SELECT id,sender_id,body,deleted_at,expires_at FROM messages
                         WHERE id=? AND ((sender_id=? AND recipient_id=?) OR
                         (sender_id=? AND recipient_id=?))''',
                      (message_id,u['id'],chat_id,chat_id,u['id']))
                if not m or m['deleted_at'] or m['expires_at'] and m['expires_at']<=core.now():
                    raise HTTPException(404,'Tin nhắn không còn tồn tại.')
            else:
                if not one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',(chat_id,u['id'])):
                    raise HTTPException(403,'Bạn không thuộc nhóm.')
                m=one(c,'SELECT * FROM group_messages WHERE group_id=? AND id=?',(chat_id,message_id))
                if not m or m['deleted_at']:raise HTTPException(404,'Tin nhắn không còn tồn tại.')
            if m['sender_id']!=u['id']:
                raise HTTPException(403,'Chỉ người gửi được xem lịch sử sửa tin của chính mình.')
            rows=many(c,'''SELECT previous_body,changed_at FROM message_edit_history
                           WHERE scope=? AND message_id=? ORDER BY id DESC LIMIT 10''',
                      (scope,message_id))
        return {'versions':rows,'current_body':m['body']}

    def prune_expired(limit=200):
        at=core.now()
        with db() as c:
            rows=many(c,'''SELECT id FROM messages WHERE expires_at IS NOT NULL
                           AND expires_at<=? AND deleted_at IS NULL
                           ORDER BY expires_at,id LIMIT ?''',(at,limit))
            if not rows:return 0
            ids=[r['id'] for r in rows]
            for mid in ids:
                c.execute('''UPDATE messages SET body='',attachment_id=NULL,
                             deleted_at=?,expires_at=NULL WHERE id=?''',(at,mid))
                c.execute("DELETE FROM reactions WHERE scope='dm' AND message_id=?",(mid,))
                c.execute("DELETE FROM message_pins WHERE scope='dm' AND message_id=?",(mid,))
                c.execute("DELETE FROM message_edit_history WHERE scope='dm' AND message_id=?",(mid,))
            return len(ids)

    core.v6_prune_expired=prune_expired
    async def worker():
        while True:
            try:
                while prune_expired(200)==200:await asyncio.sleep(.05)
                await asyncio.sleep(20)
            except asyncio.CancelledError:raise
            except Exception:
                LOG.exception('V6 expiry worker temporarily failed')
                await asyncio.sleep(20)

    @app.on_event('startup')
    async def start_v6_expiry():
        app.state.v6_expiry_task=asyncio.create_task(worker())

    @app.on_event('shutdown')
    async def stop_v6_expiry():
        task=getattr(app.state,'v6_expiry_task',None)
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
