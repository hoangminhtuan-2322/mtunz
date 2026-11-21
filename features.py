"""Additional persistent collaboration features for mtunz.

Each route checks authenticated membership/ownership on the server. Files are outside
StaticFiles; a URL without the proper session and relationship cannot fetch them.
"""

import os
import re
import json
import secrets
import sqlite3
from pathlib import Path
from typing import Literal
from account_deletion import delete_user_records, purge_due_deletions, DELETION_GRACE_SECONDS
import asyncio
import logging
from urllib.parse import quote

from fastapi import HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

EMOJIS = {'❤️', '😂', '👍', '😮', '😢', '🔥', '👏', '🎉'}
MAX_UPLOAD = 12 * 1024 * 1024
# Safe, deliberately limited allow-list; executable, HTML and SVG files are forbidden.
ALLOWED = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'application/pdf': '.pdf', 'text/plain': '.txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/zip': '.zip',
    'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
}


def install(core):
    app, db, one, many = core.app, core.db, core.one, core.many
    now, current_user, hub = core.now, core.current_user, core.hub
    require_admin, require_peer = core.require_admin, core.require_peer
    friends, has_block, throttle, admin_log = core.friends, core.has_block, core.throttle, core.admin_log
    data_dir = core.DATA_DIR
    upload_dir = data_dir / 'uploads'
    upload_dir.mkdir(parents=True, exist_ok=True)
    hosted = core.POSTGRES_MODE
    upload_limit = 2 * 1024 * 1024 if hosted else MAX_UPLOAD

    def migrate():
        with db() as c:
            def column(table, name, sqltype):
                if name not in [x['name'] for x in c.execute(f'PRAGMA table_info({table})')]:
                    c.execute(f'ALTER TABLE {table} ADD COLUMN {name} {sqltype}')
            for col, typ in [('display_name','TEXT'),('bio','TEXT'),('phone','TEXT'),('email','TEXT'),('show_online','INTEGER NOT NULL DEFAULT 1'),('show_receipts','INTEGER NOT NULL DEFAULT 1')]:
                column('users', col, typ)
            # Legacy accounts remain usable. Only newly completed registrations
            # require the first-login display-name onboarding step.
            column('users','needs_display_name','INTEGER NOT NULL DEFAULT 0')
            # Only explicit approved-registration consent is recorded. Legacy
            # accounts have NULL; never claim acceptance on their behalf.
            column('users','terms_accepted_at','INTEGER')
            column('users','terms_accepted_version','TEXT')
            # Existing deployments might contain duplicate, unverified phones.
            # Avoid failing startup; ambiguous phone login will be rejected.
            if not one(c,"SELECT phone FROM users WHERE phone IS NOT NULL AND phone<>'' GROUP BY phone HAVING COUNT(*)>1 LIMIT 1"):
                c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone<>''")
            for col, typ in [('phone','TEXT'),('email','TEXT')]:
                column('registrations',col,typ)
            for col, typ in [('attachment_id','INTEGER'),('reply_to','INTEGER'),('edited_at','INTEGER'),('deleted_at','INTEGER')]:
                column('messages', col, typ)
            column('notifications', 'read_at','INTEGER')
            column('notifications','message_id','INTEGER REFERENCES messages(id) ON DELETE CASCADE')
            if 'preview_kind' not in {r['name'] for r in c.execute('PRAGMA table_info(notifications)')}:
                column('notifications','preview_kind','TEXT')
                # Old previews have no reliable message ID. Keep the original rows
                # and show a generic label instead of guessing the conversation.
                c.execute("""UPDATE notifications SET preview_kind='legacy'
                             WHERE body LIKE ? OR body LIKE ?""",
                          ('Tin nhắn từ %: %','Tin nhắn hẹn giờ từ %: %'))
            c.execute('CREATE INDEX IF NOT EXISTS notifications_message_idx ON notifications(message_id) WHERE message_id IS NOT NULL')
            column('sessions','created_at','INTEGER')
            for table in ('sessions', 'trusted_devices'):
                for name, typ in (
                    ('last_seen', 'INTEGER'), ('device_label', 'TEXT'),
                    ('device_name', 'TEXT'), ('device_type', 'TEXT'),
                    ('browser', 'TEXT'), ('os_name', 'TEXT'),
                    ('location_hint', 'TEXT'), ('network_hint', 'TEXT')):
                    column(table, name, typ)
            c.executescript('''
              CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
                stored_name TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
                mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL,
                file_content BLOB);
              CREATE TABLE IF NOT EXISTS chat_groups (
                id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS group_members (
                group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id), role TEXT NOT NULL DEFAULT 'member',
                joined_at INTEGER NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(group_id,user_id));
              CREATE TABLE IF NOT EXISTS group_messages (
                id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL DEFAULT '',
                attachment_id INTEGER REFERENCES attachments(id), reply_to INTEGER,
                edited_at INTEGER, deleted_at INTEGER, created_at INTEGER NOT NULL);
              CREATE INDEX IF NOT EXISTS group_messages_idx ON group_messages(group_id,id);
              CREATE TABLE IF NOT EXISTS reactions (
                scope TEXT NOT NULL, message_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id), emoji TEXT NOT NULL,
                PRIMARY KEY(scope,message_id,user_id,emoji));
              CREATE TABLE IF NOT EXISTS chat_preferences (
                user_id INTEGER NOT NULL REFERENCES users(id), other_id INTEGER NOT NULL REFERENCES users(id),
                muted INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(user_id,other_id));
              CREATE TABLE IF NOT EXISTS account_deletion_requests (
                user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                requested_at INTEGER NOT NULL,
                purge_at INTEGER NOT NULL);
              CREATE INDEX IF NOT EXISTS deletion_due_idx ON account_deletion_requests(purge_at);
            ''')
            c.executescript('''
              CREATE TABLE IF NOT EXISTS message_pins(
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                scope TEXT NOT NULL,
                chat_id INTEGER NOT NULL,
                message_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(user_id,scope,chat_id,message_id));
              CREATE INDEX IF NOT EXISTS message_pins_chat_idx
                ON message_pins(user_id,scope,chat_id,created_at);
            ''')
            column('messages','forwarded','INTEGER NOT NULL DEFAULT 0')
            column('group_messages','forwarded','INTEGER NOT NULL DEFAULT 0')
            column('attachments','file_content','BLOB')
            column('attachments','waveform',"TEXT NOT NULL DEFAULT ''")
            column('attachments','duration_ms','INTEGER NOT NULL DEFAULT 0')
            column('chat_preferences','pinned','INTEGER NOT NULL DEFAULT 0')
    migrate()

    def active_member(c, gid, uid):
        member = one(c, '''SELECT gm.*,g.title,g.description,g.created_by
                          FROM group_members gm JOIN chat_groups g ON g.id=gm.group_id
                          WHERE gm.group_id=? AND gm.user_id=?''', (gid,uid))
        if not member:
            raise HTTPException(403, 'Bạn không phải thành viên của nhóm này.')
        return member

    def safe_attachment(c, attachment_id, uid):
        if attachment_id is None:
            return None
        file = one(c, 'SELECT * FROM attachments WHERE id=? AND owner_id=?', (attachment_id,uid))
        if not file:
            raise HTTPException(403, 'Tệp đính kèm không thuộc tài khoản của bạn.')
        # Uploaded file can be sent once; prevents leaking a file into unrelated rooms.
        if one(c, 'SELECT 1 FROM messages WHERE attachment_id=? UNION SELECT 1 FROM group_messages WHERE attachment_id=? UNION SELECT 1 FROM world_messages WHERE attachment_id=?',
               (attachment_id,attachment_id,attachment_id)):
            raise HTTPException(409, 'Tệp đã được gửi. Vui lòng tải lên lại.')
        return file

    def file_meta(c, file_id):
        if file_id is None:return None
        f = one(c, 'SELECT id,original_name,mime,size,waveform,duration_ms FROM attachments WHERE id=?',(file_id,))
        if not f:return None
        return {'id':f['id'],'name':f['original_name'],'mime':f['mime'],'size':f['size'],
                'duration_ms':f['duration_ms'] or 0,
                'waveform':f['waveform'] or '',
                'url':f'/api/attachments/{f["id"]}'}

    def reactions_for(c, scope, mid):
        rows = many(c,'SELECT user_id,emoji FROM reactions WHERE scope=? AND message_id=?',(scope,mid))
        return rows

    def message_dict(c, row, scope='dm'):
        result=dict(row)
        if row['deleted_at'] or (scope=='dm' and result.get('expires_at') and result['expires_at']<=now()):
            result['body']=''
            result['attachment']=None
            result['reactions']=[]
        else:
            result['attachment']=file_meta(c,row['attachment_id'])
            result['reactions']=reactions_for(c,scope,row['id'])
        return result

    def notify(c, uid, body, message_id=None, preview_kind=None):
        c.execute('''INSERT INTO notifications(user_id,body,created_at,message_id,preview_kind)
                     VALUES(?,?,?,?,?)''',(uid,body[:500],now(),message_id,preview_kind))

    class Profile(BaseModel):
        display_name:str=Field(default='',max_length=50)
        bio:str=Field(default='',max_length=220)
        show_online:bool=True
        show_receipts:bool=True
        phone:str | None=Field(default=None,max_length=40)
        email:str | None=Field(default=None,max_length=254)

    @app.patch('/api/me/profile')
    async def edit_profile(request:Request, body:Profile):
        u=current_user(request)
        phone=core.normalize_phone(body.phone) if body.phone is not None else u['phone']
        email=core.normalize_email(body.email) if body.email is not None else u['email']
        name=core.validate_display_name(body.display_name,u['username'])
        with db() as c:
            if phone and one(c,'SELECT id FROM users WHERE phone=? AND id!=?',(phone,u['id'])):
                raise HTTPException(409,'Số điện thoại này đang được sử dụng bởi tài khoản khác.')
            c.execute('''UPDATE users SET display_name=?,bio=?,show_online=?,show_receipts=?,
                          phone=?,email=? WHERE id=?''',
                      (name,body.bio.strip(),int(body.show_online),
                       int(body.show_receipts),phone,email,u['id']))
        return {'ok':True}

    @app.get('/api/profile/{uid}')
    async def show_profile(request:Request,uid:int):
        u=current_user(request)
        with db() as c:
            r=one(c,'''SELECT id,public_id,display_name,bio,headline,website,created_at,last_seen,
                               show_online,profile_visibility,avatar_attachment_id,cover_attachment_id
                        FROM users WHERE id=? AND is_admin=0''',(uid,))
            if not r or (uid!=u['id'] and has_block(c,uid,u['id'])):
                raise HTTPException(404,'Không tìm thấy người dùng.')
            allowed=(uid==u['id'] or bool(u['is_admin']) or r['profile_visibility']=='everyone' or
                     (r['profile_visibility']=='friends' and friends(c,uid,u['id'])))
            p=dict(r)
            p['last_seen']=r['last_seen'] if r['show_online'] or uid==u['id'] else None
            p['avatar_url']=f'/api/profile/{uid}/avatar' if allowed and r['avatar_attachment_id'] else None
            p['cover_url']=f'/api/profile/{uid}/cover' if allowed and r['cover_attachment_id'] else None
            p['headline']=r['headline'] if allowed else ''
            p['bio']=r['bio'] if allowed else ''
            p['website']=r['website'] if allowed else ''
            p.pop('avatar_attachment_id',None)
            p.pop('cover_attachment_id',None)
            p['private']=not allowed
        return {'profile':p}

    @app.get('/api/me/sessions')
    async def own_sessions(request:Request):
        u=current_user(request)
        saved=request.cookies.get(core.REMEMBER_COOKIE)
        saved_hash=core.digest(saved) if core.valid_remember_token(saved) else ''
        active_hash=core.digest(request.cookies.get('s',''))
        # Member API never returns security-only IP or GeoIP hints.
        columns='token_hash,expires_at,created_at,last_seen,device_label,device_name,device_type,browser,os_name'
        with db() as c:
            c.execute('UPDATE sessions SET last_seen=? WHERE token_hash=? AND user_id=?',(now(),active_hash,u['id']))
            rows=many(c,f'SELECT {columns} FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC',(u['id'],now()))
            devices=many(c,f'SELECT {columns} FROM trusted_devices WHERE user_id=? AND expires_at>? ORDER BY created_at DESC',(u['id'],now()))
        for kind, entries, active in (('session',rows,active_hash),('remembered',devices,saved_hash)):
            for entry in entries:
                stored=entry.pop('token_hash')
                entry['id']=core.digest(kind+':'+stored)[:24]
                entry['current']=stored==active
                entry['label']=entry.pop('device_label') or entry['device_name'] or 'Thiết bị cũ'
                for field in ('device_name','browser','os_name'):
                    entry[field]=entry[field] or 'Chưa có dữ liệu'
        return {'sessions':rows,'remembered_devices':devices}

    def owned_device(c, user_id, kind, public_id):
        if kind not in ('session', 'remembered') or not re.fullmatch(r'[a-f0-9]{24}', public_id):
            raise HTTPException(404, 'Không tìm thấy thiết bị.')
        table = 'sessions' if kind == 'session' else 'trusted_devices'
        entries = many(c, f'SELECT token_hash FROM {table} WHERE user_id=?', (user_id,))
        entry = next((x for x in entries if core.digest(kind+':'+x['token_hash'])[:24] == public_id), None)
        if not entry:
            raise HTTPException(404, 'Thiết bị không tồn tại hoặc đã được thu hồi.')
        return table, entry['token_hash']

    class DeviceLabel(BaseModel):
        label: str = Field(max_length=40)

    @app.patch('/api/me/sessions/{kind}/{device_id}/label')
    async def rename_own_device(request:Request,kind:str,device_id:str,body:DeviceLabel):
        u=current_user(request)
        label=body.label.strip()
        if any(ord(ch)<32 or ord(ch)==127 for ch in label):
            raise HTTPException(422,'Tên thiết bị không được chứa ký tự điều khiển.')
        with db() as c:
            table, stored_hash=owned_device(c,u['id'],kind,device_id)
            c.execute(f'UPDATE {table} SET device_label=? WHERE token_hash=? AND user_id=?',
                      (label,stored_hash,u['id']))
        return {'ok':True}

    @app.delete('/api/me/sessions/{kind}/{device_id}')
    async def revoke_own_device(request:Request,kind:str,device_id:str):
        u=current_user(request)
        active_hash=core.digest(request.cookies.get('s',''))
        saved=request.cookies.get(core.REMEMBER_COOKIE)
        saved_hash=core.digest(saved) if core.valid_remember_token(saved) else ''
        with db() as c:
            table, stored_hash=owned_device(c,u['id'],kind,device_id)
            if kind == 'session' and stored_hash == active_hash:
                raise HTTPException(409,'Không thể thu hồi phiên hiện tại. Hãy chọn Đăng xuất.')
            c.execute(f'DELETE FROM {table} WHERE token_hash=? AND user_id=?',(stored_hash,u['id']))
        if kind == 'session':
            for ws, connected_hash in list(hub.session_hashes.items()):
                if connected_hash == stored_hash:
                    try:
                        await ws.send_json({'type':'session-ended','reason':'Phiên đăng nhập đã bị thu hồi.'})
                    except Exception:
                        pass
            await hub.terminate_session(stored_hash)
        response=JSONResponse({'ok':True})
        if kind == 'remembered' and stored_hash == saved_hash:
            response.delete_cookie(core.REMEMBER_COOKIE,path='/')
        return response

    @app.post('/api/me/sessions/revoke-others')
    async def revoke_others(request:Request):
        u=current_user(request)
        current=core.digest(request.cookies.get('s',''))
        remembered=request.cookies.get(core.REMEMBER_COOKIE)
        saved_hash=core.digest(remembered) if core.valid_remember_token(remembered) else ''
        with db() as c:
            c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash!=?', (u['id'], current))
            c.execute('DELETE FROM trusted_devices WHERE user_id=? AND token_hash!=?',
                      (u['id'],saved_hash))
        await hub.terminate_user(u['id'], except_hash=current)
        return {'ok':True}


    # 30-day self-service deletion grace period. Admin can irreversibly purge
    # immediately, but only after password+PIN reauthentication.
    class PermanentDelete(BaseModel):
        username: str = Field(min_length=1, max_length=80)
        password: str = Field(min_length=1, max_length=128)
        pin: str | None = None
        confirm: Literal['XOA VINH VIEN', 'XOA SAU 30 NGAY']

    class CancelDelete(BaseModel):
        password: str = Field(min_length=1, max_length=128)
        pin: str | None = None

    def check_delete_identity(c, actor_id: int, body):
        actor=one(c,'SELECT * FROM users WHERE id=?',(actor_id,))
        if not actor or not core.verify_secret(actor['password_hash'],body.password):
            raise HTTPException(401,'Mật khẩu xác nhận không đúng.')
        if actor['pin_hash'] and not core.verify_secret(actor['pin_hash'],body.pin or ''):
            raise HTTPException(401,'Mã PIN xác nhận không đúng.')
        return actor

    def remove_local_uploads(names):
        for filename in names:
            if not re.fullmatch(r'[a-f0-9]{40}\.(?:png|jpg|webp|gif|pdf|txt|docx|xlsx|zip|webm|ogg|m4a|mp3|wav)',filename or ''):
                continue
            try:
                (upload_dir/filename).unlink(missing_ok=True)
            except OSError:
                pass

    async def finish_account_delete(result):
        uid=result['deleted_user_id']
        await hub.user(uid,'session-ended',reason='Tài khoản đã bị xóa vĩnh viễn.')
        await hub.terminate_user(uid)
        for peer in result['friend_ids']:
            await hub.user(peer,'friends-updated')
        for peer in result['group_peer_ids']:
            await hub.user(peer,'groups-updated')
        remove_local_uploads(result['filenames'])

    @app.get('/api/me/deletion')
    async def own_deletion_status(request:Request):
        actor=current_user(request)
        with db() as c:
            row=one(c,'SELECT requested_at,purge_at FROM account_deletion_requests WHERE user_id=?',
                    (actor['id'],))
        return {'pending':bool(row), 'requested_at':row['requested_at'] if row else None,
                'purge_at':row['purge_at'] if row else None}

    @app.post('/api/me/delete')
    async def request_own_deletion(request:Request,body:PermanentDelete):
        actor=current_user(request)
        if actor['is_admin']:
            raise HTTPException(403,'Tài khoản Admin không thể tự xóa tại mục cài đặt.')
        if body.confirm!='XOA SAU 30 NGAY':
            raise HTTPException(422,'Hãy xác nhận đúng yêu cầu xóa sau 30 ngày.')
        throttle(request,'delete-own-account',5,3600,str(actor['id']))
        with db() as c:
            current=check_delete_identity(c,actor['id'],body)
            if current['username'].casefold()!=body.username.strip().casefold():
                raise HTTPException(422,'Tên tài khoản xác nhận không khớp.')
            if one(c,'SELECT user_id FROM account_deletion_requests WHERE user_id=?',(actor['id'],)):
                raise HTTPException(409,'Yêu cầu xóa đã được lên lịch. Bạn có thể hủy trước hạn.')
            requested=now()
            deadline=requested+DELETION_GRACE_SECONDS
            c.execute('INSERT INTO account_deletion_requests(user_id,requested_at,purge_at) VALUES(?,?,?)',
                      (actor['id'],requested,deadline))
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                      (actor['id'],'Bạn đã yêu cầu xóa tài khoản sau 30 ngày. Có thể hủy trong Cài đặt trước hạn.',requested))
        await hub.admins('account-deletion-updated')
        return {'ok':True,'pending':True,'requested_at':requested,'purge_at':deadline}

    @app.post('/api/me/delete/cancel')
    async def cancel_own_deletion(request:Request,body:CancelDelete):
        actor=current_user(request)
        if actor['is_admin']:
            raise HTTPException(403,'Tài khoản quản trị không có yêu cầu tự xóa.')
        throttle(request,'cancel-delete-account',8,3600,str(actor['id']))
        with db() as c:
            check_delete_identity(c,actor['id'],body)
            changed=c.execute('DELETE FROM account_deletion_requests WHERE user_id=? AND purge_at>?',
                              (actor['id'],now()))
            if changed.rowcount!=1:
                raise HTTPException(409,'Không có yêu cầu xóa còn hiệu lực để hủy.')
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                      (actor['id'],'Bạn đã hủy yêu cầu xóa tài khoản.',now()))
        await hub.admins('account-deletion-updated')
        return {'ok':True,'pending':False}

    @app.get('/api/admin/deletions')
    async def admin_deletion_queue(request:Request):
        require_admin(request)
        with db() as c:
            rows=many(c,'''SELECT d.user_id,u.username,d.requested_at,d.purge_at
                            FROM account_deletion_requests d
                            JOIN users u ON u.id=d.user_id AND u.is_admin=0
                            ORDER BY d.purge_at ASC LIMIT 500''')
        return {'requests':rows}

    @app.post('/api/admin/users/{uid}/delete')
    async def delete_member_as_admin(request:Request,uid:int,body:PermanentDelete):
        admin=require_admin(request)
        if not admin['pin_hash']:
            raise HTTPException(403,'Hãy bật PIN quản trị trước khi xóa vĩnh viễn tài khoản.')
        if body.confirm!='XOA VINH VIEN':
            raise HTTPException(422,'Xác nhận xóa vĩnh viễn không hợp lệ.')
        throttle(request,'admin-delete-account',5,3600,str(admin['id']))
        with db() as c:
            check_delete_identity(c,admin['id'],body)
            target=one(c,'SELECT id,username FROM users WHERE id=? AND is_admin=0',(uid,))
            if not target:
                raise HTTPException(404,'Không tìm thấy tài khoản người dùng có thể xóa.')
            if target['username'].casefold()!=body.username.strip().casefold():
                raise HTTPException(422,'Tên tài khoản xác nhận không khớp.')
            result=delete_user_records(c,uid)
            admin_log(c,admin['id'],'permanent_user_delete',f'user_id={uid}; request=admin_approved')
        await finish_account_delete(result)
        await hub.admins('account-deletion-updated')
        return {'ok':True,'deleted_user_id':uid}

    async def process_due_deletions():
        # Any failed DB operation rolls back the current user; next hourly retry is safe.
        try:
            for result in purge_due_deletions(db,now()):
                await finish_account_delete(result)
            # Expired pending records are never silently restored by worker failures.
        except Exception:
            logging.getLogger('mtunz.deletion').exception('Scheduled account deletion failed')

    async def deletion_worker():
        while True:
            await process_due_deletions()
            await asyncio.sleep(3600)

    @app.on_event('startup')
    async def start_deletion_worker():
        app.state.deletion_worker=asyncio.create_task(deletion_worker())

    @app.on_event('shutdown')
    async def stop_deletion_worker():
        task=getattr(app.state,'deletion_worker',None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    @app.get('/api/me/export')
    async def export_account(request:Request):
        u=current_user(request)
        with db() as c:
            user=one(c,'SELECT username,created_at,display_name,bio,phone,email,terms_accepted_at,terms_accepted_version FROM users WHERE id=?',(u['id'],))
            direct=many(c,'''SELECT id,sender_id,recipient_id,body,created_at,edited_at,deleted_at FROM messages
                             WHERE (sender_id=? OR recipient_id=?) AND
                             (expires_at IS NULL OR expires_at>?) ORDER BY id''',(u['id'],u['id'],now()))
            groups=many(c,'''SELECT gm.group_id,g.title,gm.role FROM group_members gm
                             JOIN chat_groups g ON g.id=gm.group_id WHERE gm.user_id=?''',(u['id'],))
            tickets=many(c,'SELECT id,kind,claim,status,created_at FROM tickets WHERE owner_id=?',(u['id'],))
        resp=JSONResponse({'account':dict(user),'direct_messages':direct,'groups':groups,'support_tickets':tickets})
        resp.headers['Content-Disposition']="attachment; filename=mtunz-my-data.json"
        return resp

    @app.post('/api/uploads')
    async def upload(request:Request, file:UploadFile=File(...), waveform:str=Form(''), duration_ms:int=Form(0)):
        u=current_user(request)
        throttle(request, 'upload', 35, 3600, str(u['id']))
        mime=(file.content_type or '').lower().split(';')[0]
        if mime not in ALLOWED:
            raise HTTPException(415,'Định dạng không hỗ trợ. Hãy dùng ảnh, PDF, TXT, DOCX, XLSX hoặc ZIP.')
        safe_name=re.sub(r'[\x00-\x1f\x7f/\\]+','_', Path(file.filename or 'tep-tin').name).strip('. ')[:120] or 'tep-tin'
        if safe_name.lower().endswith(('.html','.htm','.svg','.js','.exe','.bat','.cmd','.ps1')):
            raise HTTPException(415,'Định dạng có thể thực thi không được cho phép.')
        if len(waveform)>80 or (waveform and not re.fullmatch(r'[0-9a-f]{8,80}',waveform)):
            raise HTTPException(422,'Dữ liệu dạng sóng không hợp lệ.')
        if duration_ms<0 or duration_ms>120000:
            raise HTTPException(422,'Bản ghi tối đa 120 giây.')
        if not mime.startswith('audio/'):
            waveform=''
            duration_ms=0
        stored=secrets.token_hex(20)+ALLOWED[mime]
        path=upload_dir/stored
        total=0
        try:
            with path.open('xb') as out:
                first=b''
                while chunk:=await file.read(65536):
                    total+=len(chunk)
                    if total>upload_limit:raise HTTPException(413,'Tệp vượt quá hạn mức cho phép (2 MB trên Render Free).')
                    if len(first)<20:first+=(chunk[:20-len(first)])
                    out.write(chunk)
            signatures={
                'image/png':first.startswith(b'\x89PNG\r\n\x1a\n'),
                'image/jpeg':first.startswith(b'\xff\xd8\xff'),
                'image/gif':first.startswith((b'GIF87a',b'GIF89a')),
                'image/webp':first.startswith(b'RIFF') and first[8:12]==b'WEBP',
                'application/pdf':first.startswith(b'%PDF-'),
                'audio/webm':first.startswith(b'\x1a\x45\xdf\xa3'),
                'audio/ogg':first.startswith(b'OggS'),
                'audio/mp4':first[4:8]==b'ftyp',
                'audio/mpeg':first.startswith(b'ID3') or (len(first)>1 and first[0]==0xff and first[1]&0xe0==0xe0),
                'audio/wav':first.startswith(b'RIFF') and first[8:12]==b'WAVE',
                'audio/x-wav':first.startswith(b'RIFF') and first[8:12]==b'WAVE',
                'application/zip':first.startswith(b'PK\x03\x04'),
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document':first.startswith(b'PK\x03\x04'),
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':first.startswith(b'PK\x03\x04'),
            }
            if total==0 or (mime in signatures and not signatures[mime]):
                raise HTTPException(415,'Nội dung tệp không đúng định dạng đã khai báo.')
            with db() as c:
                if hosted:
                    used=one(c,'SELECT COALESCE(SUM(size),0) AS total FROM attachments WHERE owner_id=?',(u['id'],))['total']
                    if used + total > 25*1024*1024:
                        raise HTTPException(413,'Đã đạt giới hạn 25 MB tệp lưu trữ mỗi tài khoản trên gói miễn phí.')
                    # Render Free storage disappears after sleeping/redeploying.
                    # Keep small attachments in PostgreSQL instead (Neon quota applies).
                    content=path.read_bytes()
                    cur=c.execute('''INSERT INTO attachments(owner_id,stored_name,original_name,mime,size,created_at,file_content,waveform,duration_ms)
                                     VALUES(?,?,?,?,?,?,?,?,?)''',(u['id'],stored,safe_name,mime,total,now(),content,waveform,duration_ms))
                else:
                    cur=c.execute('''INSERT INTO attachments(owner_id,stored_name,original_name,mime,size,created_at,waveform,duration_ms)
                                     VALUES(?,?,?,?,?,?,?,?)''',(u['id'],stored,safe_name,mime,total,now(),waveform,duration_ms))
                ident=cur.lastrowid
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        finally:
            if hosted:
                path.unlink(missing_ok=True)
            await file.close()
        return {'attachment':{'id':ident,'name':safe_name,'mime':mime,'size':total,'url':f'/api/attachments/{ident}'}}

    @app.get('/api/attachments/{file_id}')
    async def download(request:Request,file_id:int):
        u=current_user(request)
        with db() as c:
            f=one(c,'SELECT id,owner_id,stored_name,original_name,mime,size FROM attachments WHERE id=?',(file_id,))
            if not f:raise HTTPException(404,'Tệp không tồn tại.')
            # One upload can be sent once. If that DM expired, even the
            # original uploader/Admin cannot access its ephemeral media.
            expired=one(c,'''SELECT 1 FROM messages WHERE attachment_id=?
                              AND expires_at IS NOT NULL AND expires_at<=?''',
                        (file_id,now()))
            if expired:raise HTTPException(404,'Tệp của tin nhắn đã hết hạn.')
            allowed=f['owner_id']==u['id']
            if u['is_admin']:
                linked=one(c,'''SELECT 1 FROM messages WHERE attachment_id=?
                                UNION SELECT 1 FROM group_messages WHERE attachment_id=?''',(file_id,file_id))
                if linked:
                    allowed=True
                    admin_log(c,u['id'],'moderation_attachment',str(file_id))
            if not allowed:
                direct=many(c,'''SELECT m.sender_id,m.recipient_id FROM messages m
                                 WHERE m.attachment_id=? AND m.deleted_at IS NULL
                                 AND (m.expires_at IS NULL OR m.expires_at>?)''',(file_id,now()))
                allowed=any(u['id'] in (m['sender_id'],m['recipient_id']) and friends(c,m['sender_id'],m['recipient_id']) and not has_block(c,m['sender_id'],m['recipient_id']) for m in direct)
            if not allowed:
                grp=many(c,'SELECT group_id FROM group_messages WHERE attachment_id=? AND deleted_at IS NULL',(file_id,))
                allowed=any(one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',(g['group_id'],u['id'])) for g in grp)
            if not allowed:
                allowed=bool(one(c,'''SELECT 1 FROM world_messages
                                   WHERE attachment_id=? AND deleted_at IS NULL''',(file_id,)))
            if not allowed:raise HTTPException(403,'Bạn không có quyền tải tệp này.')
        inline=f['mime'].startswith(('image/','audio/'))
        headers={'X-Content-Type-Options':'nosniff', 'Cache-Control':'private, no-store'}
        if hosted:
            from fastapi.responses import Response
            # Read the blob only AFTER permission checks, never via a public static URL.
            with db() as c:
                payload=one(c,'SELECT file_content FROM attachments WHERE id=?',(file_id,))
            if not payload or payload['file_content'] is None:
                raise HTTPException(404,'Nội dung tệp chưa được lưu trong PostgreSQL.')
            disposition='inline' if inline else 'attachment'
            headers['Content-Disposition']=f"{disposition}; filename*=UTF-8''{quote(f['original_name'])}"
            return Response(content=bytes(payload['file_content']), media_type=f['mime'], headers=headers)
        path=upload_dir/f['stored_name']
        if not path.is_file():raise HTTPException(404,'Dữ liệu tệp không còn trên máy chủ.')
        return FileResponse(path, media_type=f['mime'],
                            filename=f['original_name'],content_disposition_type='inline' if inline else 'attachment',headers=headers)

    class GroupCreate(BaseModel):
        title:str=Field(min_length=2,max_length=70)
        member_ids:list[int]=Field(min_length=1,max_length=30)

    @app.post('/api/groups')
    async def create_group(request:Request,body:GroupCreate):
        u=current_user(request)
        if u['is_admin']:raise HTTPException(403,'Admin quản trị không tham gia nhóm cá nhân.')
        member_ids=set(body.member_ids)
        if u['id'] in member_ids:raise HTTPException(422,'Không được tự thêm mình lần nữa.')
        with db() as c:
            for other in member_ids:require_peer(c,u['id'],other)
            cur=c.execute('INSERT INTO chat_groups(title,created_by,created_at) VALUES(?,?,?)',(body.title.strip(),u['id'],now()))
            gid=cur.lastrowid
            c.execute('INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,?,?)',(gid,u['id'],'owner',now()))
            for uid in member_ids:
                c.execute('INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)',(gid,uid,now()))
                notify(c,uid,f'{u["display_name"] or "Thành viên"} đã thêm bạn vào nhóm “{body.title.strip()}”.')
        for uid in member_ids|{u['id']}:
            await hub.user(uid,'groups-updated')
        return {'id':gid}

    @app.get('/api/groups')
    async def list_groups(request:Request):
        u=current_user(request)
        with db() as c:
            rows=many(c,'''SELECT g.id,g.title,g.description,g.created_by,g.created_at,gm.role,gm.last_read_id,
                           (SELECT COUNT(*) FROM group_members z WHERE z.group_id=g.id) AS member_count,
                           (SELECT COUNT(*) FROM group_messages m WHERE m.group_id=g.id AND m.id>gm.last_read_id AND m.sender_id!=?) AS unread
                           FROM chat_groups g JOIN group_members gm ON gm.group_id=g.id
                           WHERE gm.user_id=? ORDER BY g.id DESC''',(u['id'],u['id']))
            for g in rows:
                last=one(c,'''SELECT m.id,m.body,m.sender_id,m.created_at,m.deleted_at,m.attachment_id,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username
                          FROM group_messages m JOIN users u ON u.id=m.sender_id WHERE m.group_id=? ORDER BY m.id DESC LIMIT 1''',(g['id'],))
                g['last_message']=dict(last) if last else None
            rows.sort(key=lambda g:g['last_message']['created_at'] if g['last_message'] else g['created_at'],reverse=True)
        return {'groups':rows}

    @app.get('/api/groups/{gid}')
    async def group_detail(request:Request,gid:int):
        u=current_user(request)
        with db() as c:
            group=active_member(c,gid,u['id'])
            members=many(c,'''SELECT gm.user_id,gm.role,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username,u.display_name FROM group_members gm JOIN users u
                              ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END,u.username''',(gid,))
        return {'group':dict(group),'members':members}

    class GroupEdit(BaseModel):
        title:str=Field(min_length=2,max_length=70)
        description:str=Field(default='',max_length=350)

    @app.patch('/api/groups/{gid}')
    async def edit_group(request:Request,gid:int,body:GroupEdit):
        u=current_user(request)
        with db() as c:
            m=active_member(c,gid,u['id'])
            if m['role']!='owner':raise HTTPException(403,'Chỉ trưởng nhóm được đổi thông tin nhóm.')
            c.execute('UPDATE chat_groups SET title=?,description=? WHERE id=?',(body.title.strip(),body.description.strip(),gid))
            members=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in members:await hub.user(uid,'groups-updated')
        return {'ok':True}

    class AddMembers(BaseModel):
        member_ids:list[int]=Field(min_length=1,max_length=30)

    @app.post('/api/groups/{gid}/members')
    async def add_members(request:Request,gid:int,body:AddMembers):
        u=current_user(request)
        new_ids=set(body.member_ids)
        with db() as c:
            m=active_member(c,gid,u['id'])
            if m['role']!='owner':raise HTTPException(403,'Chỉ trưởng nhóm được thêm thành viên.')
            count=one(c,'SELECT COUNT(*) AS n FROM group_members WHERE group_id=?',(gid,))['n']
            if count+len(new_ids)>50:raise HTTPException(409,'Mỗi nhóm tối đa 50 thành viên.')
            for uid in new_ids:
                require_peer(c,u['id'],uid)
                if one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',(gid,uid)):
                    raise HTTPException(409,'Có người đã tham gia nhóm.')
            for uid in new_ids:
                c.execute('INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)',(gid,uid,now()))
                notify(c,uid,f'{u["display_name"] or "Thành viên"} đã mời bạn vào nhóm “{m["title"]}”.')
            targets=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in targets:await hub.user(uid,'groups-updated')
        return {'ok':True}

    @app.delete('/api/groups/{gid}/members/{uid}')
    async def remove_member(request:Request,gid:int,uid:int):
        u=current_user(request)
        with db() as c:
            m=active_member(c,gid,u['id'])
            if uid!=u['id'] and m['role']!='owner':raise HTTPException(403,'Chỉ trưởng nhóm có quyền xóa thành viên.')
            member=one(c,'SELECT role FROM group_members WHERE group_id=? AND user_id=?',(gid,uid))
            if not member:raise HTTPException(404,'Không tìm thấy thành viên.')
            if member['role']=='owner':
                other=one(c,"SELECT user_id FROM group_members WHERE group_id=? AND user_id!=? ORDER BY joined_at,user_id LIMIT 1",(gid,uid))
                if other:c.execute("UPDATE group_members SET role='owner' WHERE group_id=? AND user_id=?",(gid,other['user_id']))
            c.execute('DELETE FROM group_members WHERE group_id=? AND user_id=?',(gid,uid))
            rest=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
            if not rest:c.execute('DELETE FROM chat_groups WHERE id=?',(gid,))
        for member_id in set(rest+[uid]):await hub.user(member_id,'groups-updated')
        return {'ok':True}

    class GroupMessage(BaseModel):
        body:str=Field(default='',max_length=2000)
        attachment_id:int|None=None
        reply_to:int|None=None

    @app.get('/api/groups/{gid}/messages')
    async def group_history(request:Request,gid:int,before:int=0):
        u=current_user(request)
        with db() as c:
            active_member(c,gid,u['id'])
            sql="SELECT m.*,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username FROM group_messages m JOIN users u ON u.id=m.sender_id WHERE m.group_id=?"
            args=[gid]
            if before>0:sql+=' AND m.id<?';args.append(before)
            messages=many(c,sql+' ORDER BY m.id DESC LIMIT 70',args)
            result=[message_dict(c,x,'group') for x in messages[::-1]]
        return {'messages':result}

    @app.post('/api/groups/{gid}/messages')
    async def send_group(request:Request,gid:int,body:GroupMessage):
        u=current_user(request)
        throttle(request,'group-send',90,60,str(u['id']))
        text=body.body.strip()
        if not text and not body.attachment_id:raise HTTPException(422,'Hãy nhập tin nhắn hoặc đính kèm tệp.')
        with db() as c:
            active_member(c,gid,u['id'])
            safe_attachment(c,body.attachment_id,u['id'])
            if body.reply_to and not one(c,'SELECT 1 FROM group_messages WHERE id=? AND group_id=?',(body.reply_to,gid)):
                raise HTTPException(404,'Tin nhắn trả lời không tồn tại.')
            cur=c.execute('''INSERT INTO group_messages(group_id,sender_id,body,attachment_id,reply_to,created_at)
                             VALUES(?,?,?,?,?,?)''',(gid,u['id'],text,body.attachment_id,body.reply_to,now()))
            msg=dict(one(c,"SELECT m.*,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username FROM group_messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?",(cur.lastrowid,)))
            msg=message_dict(c,msg,'group')
            members=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        await asyncio.gather(*(hub.user(uid,'group-message',group_id=gid,message=msg) for uid in members))
        return {'message':msg}

    @app.post('/api/groups/{gid}/read')
    async def group_read(request:Request,gid:int):
        u=current_user(request)
        with db() as c:
            active_member(c,gid,u['id'])
            latest=one(c,'SELECT MAX(id) AS n FROM group_messages WHERE group_id=?',(gid,))['n'] or 0
            c.execute('UPDATE group_members SET last_read_id=MAX(last_read_id,?) WHERE group_id=? AND user_id=?',(latest,gid,u['id']))
        return {'ok':True}

    class TextEdit(BaseModel):
        body:str=Field(default='',max_length=2000)

    def dm_message_owner(c, mid, uid, admin=False):
        m=one(c,'SELECT * FROM messages WHERE id=?',(mid,))
        if not m:raise HTTPException(404,'Tin nhắn không tồn tại.')
        if not admin and m['sender_id']!=uid:raise HTTPException(403,'Chỉ người gửi được sửa tin nhắn.')
        return m

    def group_message_owner(c, gid, mid, uid):
        active_member(c,gid,uid)
        m=one(c,'SELECT * FROM group_messages WHERE id=? AND group_id=?',(mid,gid))
        if not m:raise HTTPException(404,'Tin nhắn không tồn tại.')
        if m['sender_id']!=uid:raise HTTPException(403,'Chỉ người gửi được sửa tin nhắn.')
        return m

    async def dm_changed(m):
        for uid in {m['sender_id'],m['recipient_id']}:
            await hub.user(uid,'message-updated',message_id=m['id'])

    @app.patch('/api/messages/{mid}')
    async def edit_dm(request:Request,mid:int,body:TextEdit):
        u=current_user(request)
        with db() as c:
            m=dm_message_owner(c,mid,u['id'])
            if m['deleted_at'] or m['expires_at'] and m['expires_at']<=now():
                raise HTTPException(409,'Tin nhắn đã thu hồi hoặc hết hạn.')
            if now()-m['created_at']>15*60:raise HTTPException(409,'Chỉ sửa được trong vòng 15 phút.')
            text=body.body.strip()
            if not text and not m['attachment_id']:raise HTTPException(422,'Nội dung không được trống.')
            if text!=m['body']:
                c.execute('''INSERT INTO message_edit_history(scope,message_id,editor_id,previous_body,changed_at)
                             VALUES('dm',?,?,?,?)''',(mid,u['id'],m['body'],now()))
                c.execute('UPDATE messages SET body=?,edited_at=? WHERE id=?',(text,now(),mid))
        await dm_changed(m)
        return {'ok':True}

    @app.delete('/api/messages/{mid}')
    async def remove_dm(request:Request,mid:int):
        u=current_user(request)
        with db() as c:
            m=dm_message_owner(c,mid,u['id'])
            c.execute("UPDATE messages SET deleted_at=COALESCE(deleted_at,?), body='' WHERE id=?",(now(),mid))
            c.execute('DELETE FROM notifications WHERE message_id=?',(mid,))
            c.execute("DELETE FROM message_pins WHERE scope='dm' AND message_id=?",(mid,))
            c.execute("DELETE FROM reactions WHERE scope='dm' AND message_id=?",(mid,))
            c.execute("DELETE FROM message_edit_history WHERE scope='dm' AND message_id=?",(mid,))
        await dm_changed(m)
        return {'ok':True}

    @app.patch('/api/groups/{gid}/messages/{mid}')
    async def edit_group_message(request:Request,gid:int,mid:int,body:TextEdit):
        u=current_user(request)
        with db() as c:
            m=group_message_owner(c,gid,mid,u['id'])
            if m['deleted_at']:
                raise HTTPException(409,'Tin nhắn đã thu hồi hoặc hết hạn.')
            if now()-m['created_at']>15*60:raise HTTPException(409,'Chỉ sửa được trong 15 phút.')
            text=body.body.strip()
            if not text and not m['attachment_id']:raise HTTPException(422,'Nội dung không được trống.')
            if text!=m['body']:
                c.execute('''INSERT INTO message_edit_history(scope,message_id,editor_id,previous_body,changed_at)
                             VALUES('group',?,?,?,?)''',(mid,u['id'],m['body'],now()))
                c.execute('UPDATE group_messages SET body=?,edited_at=? WHERE id=?',(text,now(),mid))
            targets=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in targets:await hub.user(uid,'group-message-updated',group_id=gid,message_id=mid)
        return {'ok':True}

    @app.delete('/api/groups/{gid}/messages/{mid}')
    async def remove_group_message(request:Request,gid:int,mid:int):
        u=current_user(request)
        with db() as c:
            group_message_owner(c,gid,mid,u['id'])
            c.execute("UPDATE group_messages SET deleted_at=COALESCE(deleted_at,?),body='' WHERE id=?",(now(),mid))
            c.execute("DELETE FROM message_pins WHERE scope='group' AND message_id=?",(mid,))
            c.execute("DELETE FROM reactions WHERE scope='group' AND message_id=?",(mid,))
            c.execute("DELETE FROM message_edit_history WHERE scope='group' AND message_id=?",(mid,))
            targets=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in targets:await hub.user(uid,'group-message-updated',group_id=gid,message_id=mid)
        return {'ok':True}


    # Pinned messages are private bookmarks in each chat, not global moderation.
    class PinMessage(BaseModel):
        scope: Literal['dm','group']
        chat_id: int = Field(gt=0)
        message_id: int = Field(gt=0)

    def checked_chat_message(c, uid, scope, chat_id, mid):
        if scope == 'dm':
            require_peer(c, uid, chat_id)
            row=one(c,'''SELECT * FROM messages WHERE id=? AND deleted_at IS NULL
                         AND (expires_at IS NULL OR expires_at>?)
                         AND ((sender_id=? AND recipient_id=?) OR
                              (sender_id=? AND recipient_id=?))''',
                    (mid,now(),uid,chat_id,chat_id,uid))
        else:
            active_member(c,chat_id,uid)
            row=one(c,'SELECT * FROM group_messages WHERE id=? AND group_id=? AND deleted_at IS NULL',
                    (mid,chat_id))
        if not row:
            raise HTTPException(404,'Không tìm thấy tin nhắn trong cuộc trò chuyện này.')
        return row

    @app.get('/api/chat/pins')
    async def list_chat_pins(request:Request,scope:Literal['dm','group'],chat_id:int):
        u=current_user(request)
        if chat_id<=0:raise HTTPException(422,'Cuộc trò chuyện không hợp lệ.')
        with db() as c:
            if scope=='dm':
                require_peer(c,u['id'],chat_id)
                rows=many(c,'''SELECT p.message_id,m.body,m.created_at
                  FROM message_pins p JOIN messages m ON m.id=p.message_id
                  WHERE p.user_id=? AND p.scope='dm' AND p.chat_id=?
                  AND m.deleted_at IS NULL AND
                  ((m.sender_id=? AND m.recipient_id=?) OR
                   (m.sender_id=? AND m.recipient_id=?))
                  ORDER BY p.created_at DESC,p.message_id DESC LIMIT 5''',
                  (u['id'],chat_id,u['id'],chat_id,chat_id,u['id']))
            else:
                active_member(c,chat_id,u['id'])
                rows=many(c,'''SELECT p.message_id,m.body,m.created_at
                  FROM message_pins p JOIN group_messages m ON m.id=p.message_id
                  WHERE p.user_id=? AND p.scope='group' AND p.chat_id=?
                  AND m.group_id=? AND m.deleted_at IS NULL
                  ORDER BY p.created_at DESC,p.message_id DESC LIMIT 5''',
                  (u['id'],chat_id,chat_id))
        return {'pins':rows}

    @app.post('/api/chat/pins')
    async def toggle_chat_pin(request:Request,body:PinMessage):
        u=current_user(request)
        throttle(request,'pin-message',50,60,str(u['id']))
        with db() as c:
            checked_chat_message(c,u['id'],body.scope,body.chat_id,body.message_id)
            existing=one(c,'''SELECT 1 FROM message_pins WHERE user_id=? AND
                 scope=? AND chat_id=? AND message_id=?''',
                 (u['id'],body.scope,body.chat_id,body.message_id))
            if existing:
                c.execute('''DELETE FROM message_pins WHERE user_id=? AND
                    scope=? AND chat_id=? AND message_id=?''',
                    (u['id'],body.scope,body.chat_id,body.message_id))
                pinned=False
            else:
                count=one(c,'''SELECT count(*) n FROM message_pins WHERE
                    user_id=? AND scope=? AND chat_id=?''',
                    (u['id'],body.scope,body.chat_id))['n']
                if count>=5:raise HTTPException(409,'Mỗi cuộc trò chuyện ghim tối đa 5 tin. Hãy bỏ ghim một tin trước.')
                c.execute('''INSERT INTO message_pins(user_id,scope,chat_id,message_id,created_at)
                    VALUES(?,?,?,?,?)''',(u['id'],body.scope,body.chat_id,body.message_id,now()))
                pinned=True
        return {'pinned':pinned}

    class ForwardMessage(BaseModel):
        source_scope: Literal['dm','group']
        source_chat_id: int=Field(gt=0)
        message_id: int=Field(gt=0)
        target_scope: Literal['dm','group']
        target_id: int=Field(gt=0)

    @app.post('/api/chat/forward')
    async def forward_chat_message(request:Request,body:ForwardMessage):
        u=current_user(request)
        throttle(request,'forward-message',35,60,str(u['id']))
        with db() as c:
            source=checked_chat_message(c,u['id'],body.source_scope,body.source_chat_id,body.message_id)
            content=source['body'] or ''
            attachment_id=source['attachment_id']
            if not content.strip() and not attachment_id:
                raise HTTPException(409,'Tin nhắn không còn nội dung để chuyển tiếp.')
            if body.target_scope=='dm':
                require_peer(c,u['id'],body.target_id)
                cur=c.execute('''INSERT INTO messages
                  (sender_id,recipient_id,body,attachment_id,created_at,forwarded)
                  VALUES(?,?,?,?,?,1)''',
                  (u['id'],body.target_id,content,attachment_id,now()))
                message=message_dict(c,one(c,'SELECT * FROM messages WHERE id=?',(cur.lastrowid,)),'dm')
                targets=[u['id'],body.target_id]
                pref=one(c,'SELECT muted FROM chat_preferences WHERE user_id=? AND other_id=?',
                         (body.target_id,u['id']))
                if not pref or not pref['muted']:
                    notify(c,body.target_id,f'{u["display_name"] or "Thành viên"} đã chuyển tiếp một tin nhắn.',message_id=cur.lastrowid)
            else:
                active_member(c,body.target_id,u['id'])
                cur=c.execute('''INSERT INTO group_messages
                  (group_id,sender_id,body,attachment_id,created_at,forwarded)
                  VALUES(?,?,?,?,?,1)''',
                  (body.target_id,u['id'],content,attachment_id,now()))
                row=one(c,'''SELECT m.*,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username FROM group_messages m
                              JOIN users u ON u.id=m.sender_id WHERE m.id=?''',(cur.lastrowid,))
                message=message_dict(c,row,'group')
                targets=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',
                                                      (body.target_id,))]
        if body.target_scope=='dm':
            for uid in set(targets):
                await hub.user(uid,'message',message=message)
        else:
            for uid in targets:
                await hub.user(uid,'group-message',group_id=body.target_id,message=message)
        return {'message':message}

    class React(BaseModel):
        emoji:str

    def toggle_reaction(c,scope,mid,uid,emoji):
        if emoji not in EMOJIS:raise HTTPException(422,'Biểu cảm không được hỗ trợ.')
        existing=one(c,'SELECT 1 FROM reactions WHERE scope=? AND message_id=? AND user_id=? AND emoji=?',(scope,mid,uid,emoji))
        if existing:
            c.execute('DELETE FROM reactions WHERE scope=? AND message_id=? AND user_id=? AND emoji=?',(scope,mid,uid,emoji))
        else:
            c.execute('INSERT INTO reactions VALUES(?,?,?,?)',(scope,mid,uid,emoji))

    @app.post('/api/messages/{mid}/reaction')
    async def react_dm(request:Request,mid:int,body:React):
        u=current_user(request)
        with db() as c:
            m=one(c,'''SELECT * FROM messages WHERE id=? AND (sender_id=? OR recipient_id=?)
                      AND (expires_at IS NULL OR expires_at>?)''',(mid,u['id'],u['id'],now()))
            if not m or m['deleted_at']:raise HTTPException(404,'Tin nhắn không tồn tại.')
            require_peer(c,m['sender_id'],m['recipient_id'])
            toggle_reaction(c,'dm',mid,u['id'],body.emoji)
        await dm_changed(m)
        return {'ok':True}

    @app.post('/api/groups/{gid}/messages/{mid}/reaction')
    async def react_group(request:Request,gid:int,mid:int,body:React):
        u=current_user(request)
        with db() as c:
            active_member(c,gid,u['id'])
            m=one(c,'SELECT * FROM group_messages WHERE id=? AND group_id=? AND deleted_at IS NULL',(mid,gid))
            if not m:raise HTTPException(404,'Tin nhắn không tồn tại.')
            toggle_reaction(c,'group',mid,u['id'],body.emoji)
            targets=[r['user_id'] for r in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in targets:await hub.user(uid,'group-message-updated',group_id=gid,message_id=mid)
        return {'ok':True}

    @app.get('/api/search/messages')
    async def find_message(request:Request,q:str='',group_id:int|None=None,other_id:int|None=None):
        u=current_user(request)
        if not q.strip() or len(q)>100:return {'results':[]}
        with db() as c:
            pattern='%'+q.strip().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
            if group_id is not None:
                active_member(c,group_id,u['id'])
                rows=many(c,"SELECT m.id,m.body,m.created_at,COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username FROM group_messages m JOIN users u ON u.id=m.sender_id WHERE group_id=? AND body LIKE ? ESCAPE '\\' AND deleted_at IS NULL ORDER BY m.id DESC LIMIT 50",(group_id,pattern))
            else:
                if other_id is None:raise HTTPException(422,'Cần chọn một cuộc trò chuyện.')
                require_peer(c,u['id'],other_id)
                rows=many(c,"SELECT id,body,created_at,sender_id FROM messages WHERE ((sender_id=? AND recipient_id=?) OR (recipient_id=? AND sender_id=?)) AND body LIKE ? ESCAPE '\\' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY id DESC LIMIT 50",(u['id'],other_id,u['id'],other_id,pattern,now()))
        return {'results':rows}

    @app.post('/api/notifications/read')
    async def mark_notices(request:Request):
        u=current_user(request)
        with db() as c:
            c.execute('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?',(now(),u['id']))
        return {'ok':True}

    class Prefs(BaseModel):
        muted:bool=False
        archived:bool=False
        pinned:bool|None=None

    @app.post('/api/chats/{other_id}/preferences')
    async def set_prefs(request:Request,other_id:int,body:Prefs):
        u=current_user(request)
        with db() as c:
            require_peer(c,u['id'],other_id)
            previous=one(c,'SELECT pinned FROM chat_preferences WHERE user_id=? AND other_id=?',
                         (u['id'],other_id))
            pinned=int(body.pinned) if body.pinned is not None else int(previous['pinned']) if previous else 0
            c.execute('''INSERT INTO chat_preferences(user_id,other_id,muted,archived,pinned)
                         VALUES(?,?,?,?,?)
                         ON CONFLICT(user_id,other_id)
                         DO UPDATE SET muted=excluded.muted,archived=excluded.archived,pinned=excluded.pinned''',
                      (u['id'],other_id,int(body.muted),int(body.archived),pinned))
        return {'ok':True}

    @app.get('/api/admin/groups')
    async def admin_groups(request:Request):
        require_admin(request)
        with db() as c:
            rows=many(c,'''SELECT g.id,g.title,g.created_at,u.username creator,
                           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) members,
                           (SELECT COUNT(*) FROM group_messages m WHERE m.group_id=g.id) messages
                           FROM chat_groups g JOIN users u ON u.id=g.created_by ORDER BY g.id DESC LIMIT 150''')
        return {'groups':rows}

    @app.get('/api/admin/groups/{gid}/messages')
    async def admin_group_messages(request:Request,gid:int):
        u=require_admin(request)
        with db() as c:
            if not one(c,'SELECT 1 FROM chat_groups WHERE id=?',(gid,)):raise HTTPException(404,'Nhóm không tồn tại.')
            rows=many(c,'''SELECT m.id,m.group_id,m.body,m.created_at,m.deleted_at,u.username sender
                           FROM group_messages m JOIN users u ON u.id=m.sender_id
                           WHERE m.group_id=? ORDER BY m.id DESC LIMIT 150''',(gid,))
            admin_log(c,u['id'],'moderation_group',str(gid))
        return {'messages':rows}

    @app.delete('/api/admin/groups/{gid}/messages/{mid}')
    async def admin_remove_group_message(request:Request,gid:int,mid:int):
        u=require_admin(request)
        with db() as c:
            m=one(c,'SELECT * FROM group_messages WHERE id=? AND group_id=?',(mid,gid))
            if not m:raise HTTPException(404,'Tin nhắn không tồn tại.')
            c.execute("UPDATE group_messages SET body='',deleted_at=COALESCE(deleted_at,?) WHERE id=?",(now(),mid))
            c.execute("DELETE FROM message_pins WHERE scope='group' AND message_id=?",(mid,))
            admin_log(c,u['id'],'remove_group_message',f'{gid}/{mid}')
            targets=[x['user_id'] for x in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
        for uid in targets:await hub.user(uid,'group-message-updated',group_id=gid,message_id=mid)
        return {'ok':True}

    # Upgraded payloads include caption, attachment, reactions and reply references.
    core.message_details = lambda c, r: message_dict(c,r,'dm')
    core.file_for_message = safe_attachment
    core.notify_user_persist = notify
    core.profile_upgrade = True
    core.group_members_for = lambda c,gid:[x['user_id'] for x in many(c,'SELECT user_id FROM group_members WHERE group_id=?',(gid,))]
    core.group_membership = lambda c,gid,uid: bool(one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',(gid,uid)))
