"""Shared content and private labels for member conversations."""
import re
from typing import Literal
from urllib.parse import urlsplit

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, Field


LINK = re.compile(r'https?://[^\s<>"\x27\\]+', re.IGNORECASE)


def message_links(body):
    urls = {}
    for match in LINK.finditer(body):
        url = match[0].rstrip('.,;:!?…。、！？')
        for opening, closing in (('(', ')'), ('[', ']'), ('{', '}')):
            while url.endswith(closing) and url.count(closing) > url.count(opening):
                url = url[:-1]
        try:
            parsed = urlsplit(url)
            host = parsed.hostname
            parsed.port  # Reject malformed ports.
        except ValueError:
            continue
        if host and parsed.username is None and not any(ord(char) < 32 for char in url):
            urls[url] = host
        if len(urls) == 12:
            break
    return [{'url': url, 'host': host} for url, host in urls.items()]


class AlertSettings(BaseModel):
    mode: Literal['all','muted','mentions']
    until: int = Field(default=0,ge=0,le=9223372036854775807)


def alert_allowed(c,scope,uid,chat,message,at):
    if scope=='dm':
        pref=c.execute('SELECT muted,mute_until FROM chat_preferences WHERE user_id=? AND other_id=?',
                       (uid,chat)).fetchone()
        return not pref or not (pref['muted'] or pref['mute_until']>at)
    pref=c.execute('''SELECT m.alert_mode,m.mute_until,u.public_id FROM group_members m
                      JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.user_id=?''',(chat,uid)).fetchone()
    if not pref:return False
    if pref['alert_mode']=='muted':
        return bool(pref['mute_until'] and pref['mute_until']<=at)
    if pref['alert_mode']=='mentions':
        return bool(pref['public_id'] and re.search(r'(?<![\w@])@'+str(pref['public_id'])+r'(?!\w)',message or ''))
    return True


def history_window(c, many, sql, params, before, after, latest, unread_id, column='id'):
    if after:
        rows=many(c,sql+f' AND {column}>? ORDER BY id LIMIT 71',(*params,after))
        return rows[:70],len(rows)>70
    rows=many(c,sql+(f' AND {column}<?' if before else '')+' ORDER BY id DESC LIMIT 70',
              (*params,before) if before else params)
    if not before and not latest and unread_id and rows and unread_id<rows[-1]['id']:
        prior=many(c,sql+f' AND {column}<? ORDER BY id DESC LIMIT 10',(*params,unread_id))
        following=many(c,sql+f' AND {column}>=? ORDER BY id LIMIT 61',(*params,unread_id))
        return prior[::-1]+following[:60],len(following)>60
    return rows[::-1],False


def install(core):
    app, db, one, many = core.app, core.db, core.one, core.many

    with db() as c:
        columns = {row['name'] for row in c.execute('PRAGMA table_info(chat_preferences)')}
        if 'nickname' not in columns:
            c.execute("ALTER TABLE chat_preferences ADD COLUMN nickname TEXT NOT NULL DEFAULT ''")

        if 'mute_until' not in columns:
            c.execute('ALTER TABLE chat_preferences ADD COLUMN mute_until BIGINT NOT NULL DEFAULT 0')
        group_columns={r['name'] for r in c.execute('PRAGMA table_info(group_members)')}
        if 'alert_mode' not in group_columns:
            c.execute("ALTER TABLE group_members ADD COLUMN alert_mode TEXT NOT NULL DEFAULT 'all'")
        if 'mute_until' not in group_columns:
            c.execute('ALTER TABLE group_members ADD COLUMN mute_until BIGINT NOT NULL DEFAULT 0')

    def conversation(c,uid,scope,chat):
        if scope=='dm':
            core.require_peer(c,uid,chat)
            return ('messages', '((m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?)) AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>?) AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=? AND h.scope=\'dm\' AND h.chat_id=? AND h.message_id=m.id)',
                    (uid,chat,chat,uid,core.now(),uid,chat))
        if not one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',(chat,uid)):
            raise HTTPException(403,'Bạn không phải thành viên của nhóm này.')
        return 'group_messages',"m.group_id=? AND m.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=? AND h.scope='group' AND h.chat_id=m.group_id AND h.message_id=m.id)",(chat,uid)

    def member(request):
        user = core.current_user(request)
        if user['is_admin']:
            raise HTTPException(403, 'Chỉ thành viên trong cuộc trò chuyện mới có quyền truy cập.')
        return user['id']

    class Nickname(BaseModel):
        nickname: str = Field(max_length=40)

    @app.put('/api/chats/{peer_id}/nickname')
    async def update_nickname(request: Request, peer_id: int, body: Nickname):
        uid = member(request)
        nickname = ' '.join(body.nickname.split())
        if any(ord(char) < 32 or char in '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069' for char in nickname):
            raise HTTPException(422, 'Biệt danh chứa ký tự không hợp lệ.')
        with db() as c:
            core.require_peer(c, uid, peer_id)
            c.execute('''INSERT INTO chat_preferences(user_id,other_id,nickname) VALUES(?,?,?)
                         ON CONFLICT(user_id,other_id) DO UPDATE SET nickname=excluded.nickname''',
                      (uid, peer_id, nickname))
        await core.hub.user(uid,'friends-updated')
        return {'nickname': nickname}

    @app.get('/api/chats/{scope}/{chat_id}/shared')
    async def shared_content(request: Request, scope: Literal['dm', 'group'], chat_id: int,
                             kind: Literal['media', 'images', 'videos', 'files', 'links'] = 'media',
                             sender_id: int = Query(0,ge=0,le=9223372036854775807),
                             since: int = Query(0,ge=0,le=9223372036854775807),
                             until: int = Query(0,ge=0,le=9223372036854775807),
                             before: int = Query(9223372036854775807, ge=1, le=9223372036854775807)):
        uid = member(request)
        if since and until and since>until:raise HTTPException(422,'Khoảng thời gian không hợp lệ.')
        with db() as c:
            table, where, params = conversation(c,uid,scope,chat_id)
            if sender_id:
                where += ' AND m.sender_id=?'
                params += (sender_id,)
            if since:
                where += ' AND m.created_at>=?'
                params += (since,)
            if until:
                where += ' AND m.created_at<=?'
                params += (until,)
            columns = 'm.id,m.sender_id,m.created_at,u.display_name'
            joins = 'JOIN users u ON u.id=m.sender_id'
            if kind == 'links':
                columns += ',m.body'
                filters = '(LOWER(m.body) LIKE ? OR LOWER(m.body) LIKE ?)'
                params += ('%http://%', '%https://%')
            else:
                columns += ',a.id AS attachment_id,a.original_name AS name,a.mime,a.size'
                joins += ' JOIN attachments a ON a.id=m.attachment_id'
                media = "(a.mime LIKE ? OR a.mime LIKE ?)"
                if kind == 'images':
                    filters = 'a.mime LIKE ?'
                    params += ('image/%',)
                elif kind == 'videos':
                    filters = 'a.mime LIKE ?'
                    params += ('video/%',)
                else:
                    filters = media if kind == 'media' else f"NOT {media}"
                    params += ('image/%', 'video/%')
            limit = 12 if kind in ('media', 'images', 'videos') else 24
            rows = many(c, f'''SELECT {columns} FROM {table} m {joins}
                               WHERE {where} AND {filters} AND m.deleted_at IS NULL AND m.id<?
                               ORDER BY m.id DESC LIMIT ?''', (*params, before, limit + 1))
        page = rows[:limit]
        cursor = page[-1]['id'] if len(rows) > limit else None
        if kind == 'links':
            for row in page:
                row['links'] = message_links(row.pop('body'))
            page = [row for row in page if row['links']]
        return {'items': page, 'next_before': cursor}

    @app.get('/api/chats/{scope}/{chat_id}/context/{message_id}')
    async def message_context(request: Request, scope: Literal['dm', 'group'],
                              chat_id: int, message_id: int):
        uid = member(request)
        with db() as c:
            table, where, params = conversation(c, uid, scope, chat_id)
            if not one(c, f'SELECT m.id FROM {table} m WHERE {where} AND m.id=?', (*params,message_id)):
                raise HTTPException(404,'Tin nhắn không còn khả dụng trong hội thoại.')
            columns = "m.*,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username"
            base = f'SELECT {columns} FROM {table} m JOIN users u ON u.id=m.sender_id WHERE {where}'
            earlier = many(c, base+' AND m.id<=? ORDER BY m.id DESC LIMIT 8', (*params,message_id))
            later = many(c, base+' AND m.id>? ORDER BY m.id LIMIT 8', (*params,message_id))
            messages = core.message_page(c,earlier[::-1]+later,scope,viewer_id=uid)
            # Context previews never advance unread state or expose receipt metadata.
            for item in messages:
                item.pop('read_at',None)
                item.pop('delivered_at',None)
            return {'messages':messages,'target_id':message_id}

    @app.put('/api/chats/{scope}/{chat_id}/alerts')
    async def set_alerts(request:Request,scope:Literal['dm','group'],chat_id:int,body:AlertSettings):
        uid=member(request)
        at=core.now()
        if body.mode=='mentions' and scope!='group':
            raise HTTPException(422,'Chỉ nhóm trò chuyện hỗ trợ nhắc tên.')
        if body.until and (body.mode!='muted' or not at<body.until<=at+86400*2):
            raise HTTPException(422,'Thời điểm bật lại thông báo không hợp lệ.')
        with db() as c:
            if scope=='dm':
                core.require_peer(c,uid,chat_id)
                c.execute('''INSERT INTO chat_preferences(user_id,other_id,muted,mute_until)
                             VALUES(?,?,?,?) ON CONFLICT(user_id,other_id)
                             DO UPDATE SET muted=excluded.muted,mute_until=excluded.mute_until''',
                          (uid,chat_id,int(body.mode=='muted' and not body.until),body.until))
            else:
                changed=c.execute('UPDATE group_members SET alert_mode=?,mute_until=? WHERE group_id=? AND user_id=?',
                                  (body.mode,body.until,chat_id,uid))
                if not changed.rowcount:raise HTTPException(403,'Bạn không phải thành viên của nhóm này.')
        await core.hub.user(uid,'chat-alert-settings',scope=scope,chat_id=chat_id,mode=body.mode,until=body.until)
        return {'mode':body.mode,'until':body.until}
