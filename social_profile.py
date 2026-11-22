"""Social identity, profile images, world privacy and opt-in message requests.

All member identities are stable internal DB keys; new public IDs use CSPRNG
seven-digit identifiers. Existing foreign-key references are never rewritten.
"""
import re
import secrets
from typing import Literal

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field


def random_public_id() -> int:
    return 1_000_000 + secrets.randbelow(9_000_000)


def install(core):
    app, db, one, many = core.app, core.db, core.one, core.many
    current_user, hub, now = core.current_user, core.hub, core.now
    is_friend, has_block = core.friends, core.has_block

    with db() as c:
        present = {v['name'] for v in c.execute('PRAGMA table_info(users)')}
        for field, kind in [
            ('public_id', 'INTEGER'), ('headline', 'TEXT NOT NULL DEFAULT \'\''),
            ('website', 'TEXT NOT NULL DEFAULT \'\''), ('avatar_attachment_id', 'INTEGER'),
            ('cover_attachment_id', 'INTEGER'),
            ('profile_visibility', "TEXT NOT NULL DEFAULT 'everyone'"),
            ('allow_message_requests', 'INTEGER NOT NULL DEFAULT 1'),
            ('world_anonymous', 'INTEGER NOT NULL DEFAULT 0'),
        ]:
            if field not in present:
                c.execute(f'ALTER TABLE users ADD COLUMN {field} {kind}')
        c.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uq ON users(public_id)')
        for u in many(c, 'SELECT id FROM users WHERE public_id IS NULL'):
            for _ in range(64):
                new_id = random_public_id()
                if not one(c, 'SELECT id FROM users WHERE public_id=?', (new_id,)):
                    c.execute('UPDATE users SET public_id=? WHERE id=? AND public_id IS NULL',
                              (new_id, u['id']))
                    break
            else:
                raise RuntimeError('Không thể cấp ID công khai duy nhất.')
        c.executescript("""
            CREATE TABLE IF NOT EXISTS identity_change_events (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                changed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS identity_events_window_idx
                ON identity_change_events(user_id,kind,changed_at);
            CREATE TABLE IF NOT EXISTS message_requests (
                id INTEGER PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                intro TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(sender_id,recipient_id)
            );
            CREATE INDEX IF NOT EXISTS message_requests_recipient_idx
                ON message_requests(recipient_id,state,created_at);
            CREATE INDEX IF NOT EXISTS message_requests_sender_idx
                ON message_requests(sender_id,created_at);
            CREATE INDEX IF NOT EXISTS messages_recipient_unread_idx
                ON messages(recipient_id,sender_id,id) WHERE read_at IS NULL;
            CREATE INDEX IF NOT EXISTS messages_conversation_reverse_idx
                ON messages(recipient_id,sender_id,id);
        """)

    def member(request):
        u=current_user(request)
        if u['is_admin']:
            raise HTTPException(403,'Chỉ thành viên mới sử dụng chức năng này.')
        return u

    def check_image(c, fid, uid):
        if fid is None or fid == 0:
            return None
        f=one(c,'SELECT id,mime,size FROM attachments WHERE id=? AND owner_id=?',(fid,uid))
        if not f or f['mime'] not in ('image/jpeg','image/png','image/webp','image/gif') or f['size'] > 2_000_000:
            raise HTTPException(422,'Chỉ được dùng ảnh JPG, PNG, WebP hoặc GIF tối đa 2 MB do bạn tải lên.')
        return fid

    def media_url(uid,kind,attachment_id):
        return f'/api/profile/{uid}/{kind}' if attachment_id else None

    def social_data(row):
        return {
            'public_id': row['public_id'], 'headline':row['headline'] or '',
            'website':row['website'] or '', 'profile_visibility':row['profile_visibility'],
            'allow_message_requests':bool(row['allow_message_requests']),
            'world_anonymous':bool(row['world_anonymous']),
            'avatar_url':media_url(row['id'],'avatar',row['avatar_attachment_id']),
            'cover_url':media_url(row['id'],'cover',row['cover_attachment_id'])
        }

    @app.get('/api/me/social')
    async def my_social(request:Request):
        u=member(request)
        with db() as c:
            row=one(c,'SELECT * FROM users WHERE id=?',(u['id'],))
        return {'profile':social_data(row)}

    class SocialUpdate(BaseModel):
        headline: str|None=Field(default=None,max_length=90)
        website: str|None=Field(default=None,max_length=180)
        avatar_attachment_id: int|None=None
        cover_attachment_id: int|None=None
        profile_visibility: Literal['everyone','friends','only_me']|None=None
        allow_message_requests: bool|None=None
        world_anonymous: bool|None=None

    @app.patch('/api/me/social')
    async def update_social(request:Request,body:SocialUpdate):
        u=member(request)
        with db() as c:
            updates={}
            if body.headline is not None:
                updates['headline']=' '.join(body.headline.split())
            if body.website is not None:
                url=body.website.strip()
                if url and (not re.fullmatch(r'https://[^\s/]+(?:/[^\s]*)?',url,re.I) or len(url)>180):
                    raise HTTPException(422,'Liên kết phải là URL HTTPS hợp lệ.')
                updates['website']=url
            if body.avatar_attachment_id is not None:
                updates['avatar_attachment_id']=check_image(c,body.avatar_attachment_id,u['id'])
            if body.cover_attachment_id is not None:
                updates['cover_attachment_id']=check_image(c,body.cover_attachment_id,u['id'])
            for field in ('profile_visibility','allow_message_requests','world_anonymous'):
                value=getattr(body,field)
                if value is not None:
                    updates[field]=int(value) if isinstance(value,bool) else value
            if updates:
                expression=','.join(field+'=?' for field in updates)
                c.execute(f'UPDATE users SET {expression} WHERE id=?',(*updates.values(),u['id']))
            updated=one(c,'SELECT * FROM users WHERE id=?',(u['id'],))
        return {'ok':True,'profile':social_data(updated)}

    # Distinct from onboarding: changing an established identity needs both
    # secrets and a durable, database-enforced rolling quota.
    USERNAME_WINDOW = 60*86400
    DISPLAY_WINDOW = 30*86400

    def identity_quota(c,uid,at):
        result={}
        for kind,days,limit in (('username',60,1),('display_name',30,2)):
            window=days*86400
            rows=many(c,'''SELECT changed_at FROM identity_change_events
                            WHERE user_id=? AND kind=? AND changed_at>?
                            ORDER BY changed_at ASC''',(uid,kind,at-window))
            used=len(rows)
            result[kind]={'remaining':max(0,limit-used),
                          'limit':limit,'window_days':days,
                          'next_at':int(rows[used-limit]['changed_at'])+window if used>=limit else None}
        return result

    class IdentityChange(BaseModel):
        new_value:str=Field(min_length=1,max_length=70)
        password:str=Field(min_length=1,max_length=128)
        pin:str=Field(min_length=4,max_length=6)

    @app.get('/api/me/identity/status')
    async def identity_status(request:Request):
        u=member(request)
        with db() as c:
            status=identity_quota(c,u['id'],now())
        return {'username':u['username'],'display_name':u['display_name'] or '',
                'quota':status,'pin_required':True,'pin_configured':bool(u['pin_hash'])}

    @app.post('/api/me/identity/{kind}')
    async def change_identity(request:Request,kind:Literal['username','display_name'],
                              body:IdentityChange):
        u=member(request)
        core.throttle(request,'member-identity-change',8,3600,str(u['id']))
        if u['needs_display_name']:
            raise HTTPException(409,'Hãy hoàn tất tên hiển thị đầu tiên trước khi đổi danh tính.')
        with db() as c:
            if not core.POSTGRES_MODE:
                c.execute('BEGIN IMMEDIATE')
            suffix=' FOR UPDATE' if core.POSTGRES_MODE else ''
            current=one(c,'SELECT id,username,display_name,password_hash,pin_hash,pin_length FROM users WHERE id=? AND is_admin=0'+suffix,(u['id'],))
            if not current:
                raise HTTPException(401,'Phiên đăng nhập không hợp lệ.')
            if not current['pin_hash']:
                raise HTTPException(403,'Bạn cần thiết lập mã PIN trước khi đổi tên.')
            if (not core.verify_secret(current['password_hash'],body.password) or
                    not core.verify_secret(current['pin_hash'],body.pin)):
                raise HTTPException(401,'Mật khẩu hoặc mã PIN không chính xác.')
            at=now()
            quota=identity_quota(c,u['id'],at)[kind]
            if quota['remaining']<=0:
                raise HTTPException(429,'Đã hết lượt đổi tên trong kỳ này. Hãy xem thời điểm đổi tiếp trong Hồ sơ cá nhân.')
            if kind=='username':
                value=core.norm_username(body.new_value)
                if value==current['username']:
                    raise HTTPException(422,'Tên đăng nhập mới phải khác tên hiện tại.')
                if (one(c,'SELECT 1 FROM users WHERE username=? AND id!=?',(value,u['id'])) or
                    one(c,"SELECT 1 FROM registrations WHERE username=? AND status IN ('pending','approved')",(value,))):
                    raise HTTPException(409,'Tên đăng nhập đã được sử dụng hoặc đang được giữ chỗ.')
                if value=='admin':
                    raise HTTPException(409,'Tên đăng nhập này không thể sử dụng.')
                c.execute('UPDATE users SET username=? WHERE id=?',(value,u['id']))
            else:
                value=core.validate_display_name(body.new_value,current['username'])
                if value==current['display_name']:
                    raise HTTPException(422,'Tên hiển thị mới phải khác tên hiện tại.')
                c.execute('UPDATE users SET display_name=? WHERE id=?',(value,u['id']))
            c.execute('INSERT INTO identity_change_events(user_id,kind,changed_at) VALUES(?,?,?)',
                      (u['id'],kind,at))
            updated=identity_quota(c,u['id'],at)
        await hub.user(u['id'],'identity-updated',kind=kind)
        return {'ok':True,'kind':kind,'value':value,'quota':updated}

    @app.get('/api/profile/{uid}/{kind}')
    async def profile_image(request:Request,uid:int,kind:Literal['avatar','cover']):
        viewer=member(request)
        with db() as c:
            target=one(c,'''SELECT id,avatar_attachment_id,cover_attachment_id,profile_visibility
                              FROM users WHERE id=? AND is_admin=0''',(uid,))
            if not target or (uid!=viewer['id'] and has_block(c,uid,viewer['id'])):
                raise HTTPException(404,'Ảnh không tồn tại.')
            if uid!=viewer['id'] and (target['profile_visibility']=='only_me' or
                    (target['profile_visibility']=='friends' and not is_friend(c,viewer['id'],uid))):
                raise HTTPException(404,'Ảnh không tồn tại.')
            fid=target['avatar_attachment_id' if kind=='avatar' else 'cover_attachment_id']
            if not fid:
                raise HTTPException(404,'Chưa có ảnh.')
            f=one(c,'SELECT stored_name,mime,file_content FROM attachments WHERE id=? AND owner_id=?',(fid,uid))
            if not f or f['mime'] not in ('image/jpeg','image/png','image/webp','image/gif'):
                raise HTTPException(404,'Ảnh không tồn tại.')
            if core.POSTGRES_MODE:
                return Response(content=bytes(f['file_content'] or b''),media_type=f['mime'],
                                headers={'Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'})
            local=core.DATA_DIR/'uploads'/f['stored_name']
            if not local.is_file():
                raise HTTPException(404,'Ảnh không tồn tại.')
            return FileResponse(local,media_type=f['mime'],headers={'Cache-Control':'private, max-age=120'})

    class MessageRequestIn(BaseModel):
        recipient_id: int
        intro: str=Field(min_length=1,max_length=500)

    @app.get('/api/message-requests')
    async def list_message_requests(request:Request):
        u=member(request)
        with db() as c:
            if not u['allow_message_requests']:
                return {'enabled':False,'requests':[]}
            rows=many(c,'''SELECT mr.id,mr.sender_id,mr.intro,mr.created_at,
                    us.display_name,us.public_id,us.avatar_attachment_id
                    FROM message_requests mr JOIN users us ON us.id=mr.sender_id
                    WHERE mr.recipient_id=? AND mr.state='pending' AND us.is_admin=0
                    ORDER BY mr.created_at DESC LIMIT 40''',(u['id'],))
            rows=[dict(row,avatar_url=media_url(row['sender_id'],'avatar',row['avatar_attachment_id']))
                  for row in rows if not has_block(c,u['id'],row['sender_id'])]
        return {'enabled':True,'requests':rows}

    @app.post('/api/message-requests')
    async def create_message_request(request:Request,body:MessageRequestIn):
        u=member(request)
        intro=body.intro.strip()
        if not intro:
            raise HTTPException(422,'Lời nhắn không được để trống.')
        with db() as c:
            target=one(c,'SELECT id,allow_message_requests FROM users WHERE id=? AND is_admin=0 AND needs_display_name=0',
                       (body.recipient_id,))
            if not target or u['id']==body.recipient_id:
                raise HTTPException(404,'Không tìm thấy người dùng.')
            if not target['allow_message_requests']:
                raise HTTPException(403,'Người dùng này không nhận tin nhắn chờ.')
            if has_block(c,u['id'],body.recipient_id):
                raise HTTPException(403,'Không thể gửi lời nhắn đến tài khoản này.')
            if is_friend(c,u['id'],body.recipient_id):
                raise HTTPException(409,'Hai bạn đã kết bạn. Hãy dùng hội thoại riêng.')
            if one(c,'SELECT 1 FROM message_requests WHERE sender_id=? AND recipient_id=?',
                   (u['id'],body.recipient_id)):
                raise HTTPException(409,'Bạn đã gửi lời nhắn cho người này trước đó.')
            sent=one(c,'''SELECT COUNT(*) AS n FROM message_requests
                          WHERE sender_id=? AND created_at>?''',(u['id'],now()-86400))
            if sent['n']>=8:
                raise HTTPException(429,'Bạn đã gửi quá nhiều tin nhắn chờ trong 24 giờ.')
            result=c.execute('''INSERT INTO message_requests(sender_id,recipient_id,intro,state,created_at,updated_at)
                                VALUES(?,?,?,'pending',?,?)''',
                             (u['id'],body.recipient_id,intro,now(),now()))
            req_id=result.lastrowid
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                      (body.recipient_id,'Bạn có tin nhắn chờ mới.',now()))
        await hub.user(body.recipient_id,'message-requests-updated')
        return {'ok':True,'id':req_id}

    class RequestDecision(BaseModel):
        accept: bool

    @app.post('/api/message-requests/{request_id}/decision')
    async def decide_message_request(request:Request,request_id:int,body:RequestDecision):
        u=member(request)
        message=None
        with db() as c:
            item=one(c,'SELECT * FROM message_requests WHERE id=? AND recipient_id=? AND state=\'pending\'',
                     (request_id,u['id']))
            if not item:
                raise HTTPException(404,'Không tìm thấy tin nhắn chờ.')
            if not u['allow_message_requests'] or has_block(c,u['id'],item['sender_id']):
                raise HTTPException(403,'Không thể tiếp nhận tin nhắn chờ.')
            c.execute('UPDATE message_requests SET state=?,updated_at=? WHERE id=?',
                      ('accepted' if body.accept else 'declined',now(),request_id))
            if body.accept:
                a,b=sorted((u['id'],item['sender_id']))
                c.execute("""INSERT INTO friendships(u1,u2,requested_by,state,created_at)
                             VALUES(?,?,?,'accepted',?)
                             ON CONFLICT(u1,u2) DO UPDATE SET state='accepted'""",
                          (a,b,item['sender_id'],now()))
                result=c.execute('''INSERT INTO messages(sender_id,recipient_id,body,created_at)
                                    VALUES(?,?,?,?)''',
                                 (item['sender_id'],u['id'],item['intro'],now()))
                message=core.message_details(c,one(c,'SELECT * FROM messages WHERE id=?',(result.lastrowid,)))
        await hub.user(item['sender_id'],'message-requests-updated')
        await hub.user(u['id'],'message-requests-updated')
        if body.accept:
            for uid in (u['id'],item['sender_id']):
                await hub.user(uid,'friends-updated')
                await hub.user(uid,'message',message=message)
        return {'ok':True,'accepted':body.accept}
