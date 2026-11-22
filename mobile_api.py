"""Native mobile password/PIN authentication reusing mtunz server-side sessions.

Native clients use Authorization: Bearer <opaque session> from a platform secure
store. No admin bypass, no JWT, and no independent message/user database.
"""
from fastapi import HTTPException, Request
import re
from pydantic import BaseModel, Field


def install(core):
    app = core.app

    class NativePassword(BaseModel):
        username: str = Field(min_length=3, max_length=60)
        password: str = Field(min_length=1, max_length=512)

    class NativePin(BaseModel):
        challenge: str = Field(min_length=30, max_length=128)
        pin: str = Field(min_length=4, max_length=12)

    @app.post('/api/mobile/auth/password')
    async def mobile_password(request: Request, body: NativePassword):
        login = core.normalize_login(body.username)
        core.throttle(request, 'native-password', 15, 900, login)
        with core.db() as c:
            user = core.login_user(c, login)
            if not user or not core.verify_secret(user['password_hash'], body.password):
                raise HTTPException(401, 'Tài khoản hoặc mật khẩu không chính xác.')
            if not user['is_admin']:
                core.require_member_service(c)
            elif not user['pin_hash']:
                raise HTTPException(403, 'Admin cần bật PIN trên website trước khi đăng nhập ứng dụng.')
            if user['sanction_kind'] and (not user['sanction_until'] or user['sanction_until'] > core.now()):
                raise HTTPException(403, 'Tài khoản đang bị hạn chế.')
            if not user['pin_hash']:
                raise HTTPException(403, 'Vui lòng thiết lập PIN trên website trước.')
            challenge = core.token()
            # The guest_id marker intentionally cannot pass the browser PIN endpoint.
            c.execute(
                'INSERT INTO login_challenges(token_hash,guest_id,user_id,expires_at) VALUES(?,?,?,?)',
                (core.digest(challenge), 'native', user['id'], core.now() + 300),
            )
            return {'next': 'pin', 'challenge': challenge, 'pin_length': user['pin_length']}

    @app.post('/api/mobile/auth/pin')
    async def mobile_pin(request: Request, body: NativePin):
        core.throttle(request, 'native-pin', 12, 900, core.digest(body.challenge))
        with core.db() as c:
            challenge = core.one(
                c, '''SELECT l.*,u.pin_hash,u.pin_length,u.is_admin,u.sanction_kind,u.sanction_until
                      FROM login_challenges l JOIN users u ON u.id=l.user_id
                      WHERE l.token_hash=?''', (core.digest(body.challenge),),
            )
            if (not challenge or challenge['guest_id'] != 'native'
                    or challenge['expires_at'] <= core.now()):
                raise HTTPException(401, 'Phiên xác minh đã hết hạn, vui lòng đăng nhập lại.')
            if challenge['is_admin']:
                # Use the same persistent Admin PIN lockout and audit as web.
                admin = core.one(c, 'SELECT * FROM users WHERE id=?',
                                 (challenge['user_id'],))
                core.verify_admin_pin_stepup(request, admin, body.pin)
            else:
                core.require_member_service(c)
                valid_pin = (len(body.pin) == challenge['pin_length'] and body.pin.isascii()
                             and body.pin.isdigit()
                             and core.verify_secret(challenge['pin_hash'], body.pin))
                if not valid_pin:
                    raise HTTPException(401, 'Mã PIN không chính xác.')
            if challenge['sanction_kind'] and (not challenge['sanction_until']
                or challenge['sanction_until'] > core.now()):
                raise HTTPException(403, 'Tài khoản đang bị hạn chế.')
            if core.one(c, 'SELECT 1 FROM account_deletion_requests WHERE user_id=?',
                        (challenge['user_id'],)):
                raise HTTPException(423, 'Tài khoản đang chờ xóa. Hãy đăng nhập website để xử lý.')
            c.execute('DELETE FROM login_challenges WHERE token_hash=?', (core.digest(body.challenge),))
            # The existing web security gate enforces the two-session limit
            # and requires approval on the currently authenticated Admin device.
            # Bind the approval request to this native login challenge rather
            # than the ephemeral web guest cookie.
            request.state.gid = 'nativeadmin:' + core.digest(body.challenge)[:40]
            pending = (core.admin_login_gate(c, challenge['user_id'], request)
                       if challenge['is_admin'] else None)
            if pending:
                return {**pending, 'challenge': body.challenge}
            session = core.issue_session(c, challenge['user_id'], request)
            expiry = core.one(c, 'SELECT expires_at FROM sessions WHERE token_hash=?',
                              (core.digest(session),))['expires_at']
        # Token only over HTTPS in production. Client stores it in OS secure storage.
        return {'ok': True, 'access_token': session, 'token_type': 'Bearer',
                'expires_in': max(0, expiry - core.now()), 'admin': bool(challenge['is_admin'])}


    class NativeAdminApproval(BaseModel):
        challenge: str = Field(min_length=30, max_length=128)
        approval_token: str = Field(min_length=30, max_length=128)

    @app.post('/api/mobile/auth/admin/approval/status')
    async def mobile_admin_approval(request: Request, body: NativeAdminApproval):
        # A second Admin session may only be claimed after the original device
        # has approved it with its own Admin PIN on the website.
        core.throttle(request, 'native-admin-approval', 70, 600,
                      core.digest(body.approval_token))
        marker = 'nativeadmin:' + core.digest(body.challenge)[:40]
        with core.db() as c:
            row = core.one(c, '''SELECT * FROM admin_login_requests
                      WHERE token_hash=? AND guest_id=?''',
                      (core.digest(body.approval_token), marker))
            if not row:
                raise HTTPException(404, 'Yêu cầu phê duyệt không tồn tại.')
            if row['expires_at'] <= core.now():
                return {'status': 'expired'}
            if row['state'] != 'approved':
                return {'status': row['state'] if row['state'] in ('pending','denied')
                        else 'expired'}
            if core.POSTGRES_MODE:
                c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',(row['user_id'],))
            count = core.one(c, '''SELECT COUNT(*) n FROM sessions
                       WHERE user_id=? AND expires_at>?''',
                       (row['user_id'],core.now()))['n']
            if count >= 2:
                return {'status': 'full'}
            changed = c.execute('''UPDATE admin_login_requests SET state='claimed'
                      WHERE request_id=? AND state='approved' ''',(row['request_id'],))
            if changed.rowcount != 1:
                return {'status': 'expired'}
            session = core.issue_session(c,row['user_id'],request)
            core.admin_log(c,row['user_id'],'admin_native_approved_session',
                           'native_request=' + row['request_id'][:8])
            expires = core.one(c,'SELECT expires_at FROM sessions WHERE token_hash=?',
                               (core.digest(session),))['expires_at']
        return {'status':'active', 'admin':True, 'ok':True,
                'access_token':session, 'token_type':'Bearer',
                'expires_in':max(0,expires-core.now())}


    # Registration reuses the existing admin approval table, but binds the
    # request to an opaque native claim key rather than browser-only guest cookies.
    class NativeSignupRequest(BaseModel):
        username: str = Field(min_length=3,max_length=24)
        phone: str = Field(min_length=8,max_length=40)
        email: str = Field(default='',max_length=254)

    class NativeSignupClaim(BaseModel):
        token: str = Field(min_length=30,max_length=128)

    class NativeSignupComplete(NativeSignupClaim):
        username: str
        password: str
        pin: str
        pin_length: int
        accepted_terms: bool

    def registration_guest(token):
        if not re.fullmatch(r'[A-Za-z0-9_-]{30,128}',token):
            raise HTTPException(401,'Yêu cầu đăng ký không hợp lệ.')
        return 'native:' + core.digest(token)[:40]

    @app.post('/api/mobile/registration/request')
    async def request_registration(request: Request, body: NativeSignupRequest):
        core.throttle(request,'native-signup',6,3600)
        name=core.norm_username(body.username)
        phone=core.normalize_phone(body.phone)
        email=core.normalize_email(body.email)
        claim=core.token()
        with core.db() as c:
            core.require_member_service(c)
            if name=='admin' or core.one(c,'SELECT 1 FROM users WHERE username=?',(name,)):
                raise HTTPException(409,'Tên đăng nhập đã được sử dụng.')
            if core.one(c,'SELECT 1 FROM users WHERE phone=?',(phone,)):
                raise HTTPException(409,'Số điện thoại đã liên kết với tài khoản khác.')
            if core.one(c,"SELECT 1 FROM registrations WHERE username=? AND status IN ('pending','approved','completed')",(name,)):
                raise HTTPException(409,'Tên đăng nhập đã được sử dụng hoặc đang chờ duyệt.')
            c.execute('DELETE FROM registrations WHERE username=?',(name,))
            c.execute('''INSERT INTO registrations(username,guest_id,created_at,phone,email)
                         VALUES(?,?,?,?,?)''',(name,registration_guest(claim),core.now(),phone,email))
        await core.hub.admins('registration-updated')
        return {'status':'pending','username':name,'registration_token':claim}

    @app.post('/api/mobile/registration/status')
    async def registration_status(request: Request, body: NativeSignupClaim):
        core.throttle(request,'native-signup-status',80,3600,core.digest(body.token))
        with core.db() as c:
            row=core.one(c,'''SELECT username,status,created_at FROM registrations
                              WHERE guest_id=? ORDER BY id DESC LIMIT 1''',
                         (registration_guest(body.token),))
        return {'registration':dict(row) if row else None}

    @app.post('/api/mobile/registration/complete')
    async def complete_registration(request: Request, body: NativeSignupComplete):
        core.throttle(request,'native-signup-complete',12,3600,core.digest(body.token))
        if not body.accepted_terms:
            raise HTTPException(422,'Bạn cần đồng ý với điều khoản và chính sách quyền riêng tư.')
        core.ensure_password(body.password)
        core.ensure_pin(body.pin,body.pin_length)
        name=core.norm_username(body.username)
        with core.db() as c:
            core.require_member_service(c)
            registration=core.one(c,'''SELECT * FROM registrations
                  WHERE username=? AND guest_id=? AND status='approved' ''',
                  (name,registration_guest(body.token)))
            if not registration:
                raise HTTPException(403,'Đăng ký chưa được quản trị viên phê duyệt.')
            phone=core.normalize_phone(registration['phone'])
            email=core.normalize_email(registration['email'])
            if core.one(c,'SELECT 1 FROM users WHERE username=? OR phone=?',(name,phone)):
                raise HTTPException(409,'Tên đăng nhập hoặc số điện thoại đã được sử dụng.')
            total,reserved,max_users=core.registration_capacity(c)
            if total >= max_users:
                raise HTTPException(409,'Hệ thống đã đạt giới hạn tài khoản.')
            try:
                uid=core.create_member(c,username=name,password_hash=core.hash_secret(body.password),
                    pin_hash=core.hash_secret(body.pin),pin_length=body.pin_length,phone=phone,email=email)
            except Exception as exc:
                if isinstance(exc,(core.sqlite3.IntegrityError,)):
                    raise HTTPException(409,'Tên tài khoản đã tồn tại.') from exc
                raise
            c.execute('UPDATE users SET terms_accepted_at=?,terms_accepted_version=? WHERE id=?',
                      (core.now(),core.TERMS_VERSION,uid))
            c.execute("UPDATE registrations SET status='completed' WHERE username=? AND guest_id=?",
                      (name,registration_guest(body.token)))
            session=core.issue_session(c,uid,request)
        await core.hub.admins('registration-updated')
        return {'ok':True,'access_token':session,'token_type':'Bearer','onboarding_required':True}
