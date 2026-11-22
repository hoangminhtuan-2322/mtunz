"""Native mobile password/PIN authentication reusing mtunz server-side sessions.

Native clients use Authorization: Bearer <opaque session> from a platform secure
store. No admin bypass, no JWT, and no independent message/user database.
"""
from fastapi import HTTPException, Request
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
            core.require_member_service(c)
            user = core.login_user(c, login)
            if not user or user['is_admin'] or not core.verify_secret(user['password_hash'], body.password):
                raise HTTPException(401, 'Tài khoản hoặc mật khẩu không chính xác.')
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
                    or challenge['expires_at'] <= core.now() or challenge['is_admin']):
                raise HTTPException(401, 'Phiên xác minh đã hết hạn, vui lòng đăng nhập lại.')
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
            session = core.issue_session(c, challenge['user_id'], request)
            expiry = core.one(c, 'SELECT expires_at FROM sessions WHERE token_hash=?',
                              (core.digest(session),))['expires_at']
        # Token only over HTTPS in production. Client stores it in OS secure storage.
        return {'ok': True, 'access_token': session, 'token_type': 'Bearer',
                'expires_in': max(0, expiry - core.now())}
