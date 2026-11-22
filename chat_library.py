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


def install(core):
    app, db, one, many = core.app, core.db, core.one, core.many

    with db() as c:
        columns = {row['name'] for row in c.execute('PRAGMA table_info(chat_preferences)')}
        if 'nickname' not in columns:
            c.execute("ALTER TABLE chat_preferences ADD COLUMN nickname TEXT NOT NULL DEFAULT ''")

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
        return {'nickname': nickname}

    @app.get('/api/chats/{scope}/{chat_id}/shared')
    async def shared_content(request: Request, scope: Literal['dm', 'group'], chat_id: int,
                             kind: Literal['media', 'files', 'links'] = 'media',
                             before: int = Query(9223372036854775807, ge=1, le=9223372036854775807)):
        uid = member(request)
        with db() as c:
            if scope == 'dm':
                core.require_peer(c, uid, chat_id)
                table = 'messages'
                where = '''((m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?))
                           AND (m.expires_at IS NULL OR m.expires_at>?)'''
                params = (uid, chat_id, chat_id, uid, core.now())
            else:
                if not one(c, 'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?', (chat_id, uid)):
                    raise HTTPException(403, 'Bạn không phải thành viên của nhóm này.')
                table, where, params = 'group_messages', 'm.group_id=?', (chat_id,)
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
                filters = media if kind == 'media' else f"NOT {media}"
                params += ('image/%', 'video/%')
            limit = 12 if kind == 'media' else 24
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
