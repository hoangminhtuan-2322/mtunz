"""mtunz: single-worker realtime messenger using FastAPI.

Local runs use SQLite; Render Free uses persistent Neon PostgreSQL.
Never deploy the bundled demo administrator password to a public server.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from collections import defaultdict
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
POSTGRES_MODE = bool(DATABASE_URL)
if os.getenv('REQUIRE_POSTGRES', '0') == '1' and not POSTGRES_MODE:
    raise RuntimeError('Render: thiếu DATABASE_URL (Neon PostgreSQL). Không khởi chạy để tránh mất dữ liệu.')
DATA_DIR = Path(os.getenv('DATA_DIR', '/tmp/mtunz-temp' if POSTGRES_MODE else str(ROOT / 'data')))
DATA_DIR.mkdir(parents=True, exist_ok=True)
# Keep existing accounts and message history when upgrading a previous installation.
# New installations use mtunz.sqlite3. Existing installations continue using the
# previous database file in-place; do not rename a live SQLite/WAL database.
NEW_DB_FILE = DATA_DIR / 'mtunz.sqlite3'
LEGACY_DB_FILE = DATA_DIR / ('ve' + 'lora.sqlite3')
DB_FILE = NEW_DB_FILE if NEW_DB_FILE.exists() or not LEGACY_DB_FILE.exists() else LEGACY_DB_FILE
PUBLIC_MODE = os.getenv('PUBLIC_MODE', '0') == '1'
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'mtunz7' if not PUBLIC_MODE else '')
# A public server must never be bootstrapped with the documented demo credential.
if PUBLIC_MODE and (len(ADMIN_PASSWORD) < 12 or ADMIN_PASSWORD == 'mtunz7'):
    raise RuntimeError('PUBLIC_MODE=1 yêu cầu ADMIN_PASSWORD mạnh từ 12 ký tự (không dùng mật khẩu demo).')
COOKIE_SECURE = PUBLIC_MODE or os.getenv('COOKIE_SECURE', '0') == '1'
# Optional fixed browser origin for custom domains. Without this, compare against Host.
PUBLIC_ORIGIN = os.getenv('PUBLIC_ORIGIN', '').strip().rstrip('/')
if PUBLIC_ORIGIN and not PUBLIC_ORIGIN.startswith(('https://', 'http://')):
    raise RuntimeError('PUBLIC_ORIGIN phải có dạng https://ten-mien-cua-ban')
if PUBLIC_MODE and PUBLIC_ORIGIN and not PUBLIC_ORIGIN.startswith('https://'):
    raise RuntimeError('PUBLIC_ORIGIN phải dùng HTTPS khi PUBLIC_MODE=1')
USERNAME_RE = re.compile(r'^[a-z][a-z0-9_]{2,23}$')
PH = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
app = FastAPI(title='mtunz', docs_url=None, redoc_url=None)
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')


def now():
    return int(time.time())


def digest(token: str):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def token():
    return secrets.token_urlsafe(32)


def norm_username(name: str):
    value = name.strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(422, 'Tên tài khoản: 3–24 ký tự, bắt đầu bằng chữ, chỉ a-z, 0-9 và _.')
    return value


def ensure_password(v: str):
    minimum = 10 if PUBLIC_MODE else 8
    if len(v) < minimum or len(v) > 128:
        raise HTTPException(422, f'Mật khẩu phải dài từ {minimum} đến 128 ký tự.')
    if v.casefold().strip() in {'password123', '1234567890', '12345678',
                               'qwerty123', 'admin123456', 'password1234'}:
        raise HTTPException(422, 'Mật khẩu này quá phổ biến. Vui lòng chọn mật khẩu khác.')


def ensure_pin(v: str, length: int):
    if length not in (4, 5, 6) or len(v) != length or not v.isascii() or not v.isdigit():
        raise HTTPException(422, 'PIN phải có đúng 4, 5 hoặc 6 chữ số theo độ dài đã chọn.')


def hash_secret(v: str):
    return PH.hash(v)


def verify_secret(hash_value: str, value: str):
    try:
        return PH.verify(hash_value, value)
    except (VerificationError, VerifyMismatchError, ValueError):
        return False


@contextmanager
def db():
    # Render Free disks are ephemeral. Production *must* use Neon PostgreSQL.
    # SQLite is retained for local development and the original functional tests.
    if POSTGRES_MODE:
        from pg_storage import postgres_db
        with postgres_db(DATABASE_URL) as conn:
            yield conn
        return
    c = sqlite3.connect(DB_FILE, timeout=15, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys = ON')
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def one(c, q, args=()):
    return c.execute(q, args).fetchone()


def many(c, q, args=()):
    return [dict(r) for r in c.execute(q, args).fetchall()]


def init_db():
    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL, pin_hash TEXT, pin_length INTEGER,
          is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          last_seen INTEGER, sanction_kind TEXT, sanction_until INTEGER, sanction_reason TEXT
        );
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_challenges (
          token_hash TEXT PRIMARY KEY, guest_id TEXT NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          guest_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL, decided_at INTEGER, decided_by INTEGER
        );
        CREATE TABLE IF NOT EXISTS friendships (
          u1 INTEGER NOT NULL REFERENCES users(id), u2 INTEGER NOT NULL REFERENCES users(id),
          requested_by INTEGER NOT NULL REFERENCES users(id),
          state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
          PRIMARY KEY(u1,u2)
        );
        CREATE TABLE IF NOT EXISTS blocks (
          blocker_id INTEGER NOT NULL REFERENCES users(id),
          blocked_id INTEGER NOT NULL REFERENCES users(id),
          PRIMARY KEY(blocker_id,blocked_id)
        );
        CREATE TABLE IF NOT EXISTS restrictions (
          owner_id INTEGER NOT NULL REFERENCES users(id),
          other_id INTEGER NOT NULL REFERENCES users(id),
          PRIMARY KEY(owner_id,other_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id),
          recipient_id INTEGER NOT NULL REFERENCES users(id),
          body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS msg_lookup ON messages(sender_id,recipient_id,id);
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY, guest_id TEXT NOT NULL, owner_id INTEGER,
          kind TEXT NOT NULL, claim TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ticket_messages (
          id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
          from_admin INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recovery_grants (
          token_hash TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
          user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
          expires_at INTEGER NOT NULL, used_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          body TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit (
          id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL, action TEXT NOT NULL,
          detail TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        ''')
        c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('max_users','100')")
        if not one(c, 'SELECT id FROM users WHERE username=?', ('admin',)):
            c.execute('INSERT INTO users(username,password_hash,is_admin,created_at) VALUES(?,?,1,?)',
                      ('admin', hash_secret(ADMIN_PASSWORD), now()))


init_db()


class Hub:
    def __init__(self):
        self.users: dict[int, set[WebSocket]] = defaultdict(set)
        self.guests: dict[str, set[WebSocket]] = defaultdict(set)
        self.session_hashes: dict[WebSocket, str] = {}

    async def send(self, sockets, payload):
        for ws in list(sockets):
            try:
                await ws.send_json(payload)
            except Exception:
                pass

    async def user(self, uid, event, **data):
        sockets = list(self.users.get(uid, ()))
        # Critical events must be delivered once even after the session is revoked.
        if event not in ('account-sanction', 'session-ended') and sockets:
            with db() as c:
                active = {r['token_hash'] for r in c.execute(
                    'SELECT token_hash FROM sessions WHERE user_id=? AND expires_at>?', (uid, now()))}
            good = []
            for ws in sockets:
                if self.session_hashes.get(ws) in active:
                    good.append(ws)
                else:
                    try: await ws.close(code=1008)
                    except Exception: pass
            sockets = good
        await self.send(sockets, {'type': event, **data})

    async def terminate_user(self, uid, except_hash=None):
        for ws in list(self.users.get(uid, ())):
            if except_hash and self.session_hashes.get(ws) == except_hash:
                continue
            try: await ws.close(code=1008)
            except Exception: pass

    async def terminate_session(self, session_hash):
        for ws, token_hash in list(self.session_hashes.items()):
            if token_hash == session_hash:
                try: await ws.close(code=1008)
                except Exception: pass

    async def guest(self, gid, event, **data):
        await self.send(self.guests.get(gid, ()), {'type': event, **data})

    async def admins(self, event, **data):
        with db() as c:
            ids = [r['id'] for r in c.execute('SELECT id FROM users WHERE is_admin=1')]
        for uid in ids:
            await self.user(uid, event, **data)


hub = Hub()
# Lightweight per-process guardrails. Use centralized Redis counters for multi-worker hosting.
RATE_BUCKETS: dict[tuple, list[int]] = defaultdict(list)
MAX_JSON_REQUEST = 64 * 1024
MAX_UPLOAD_REQUEST = 3 * 1024 * 1024
MAX_WEBSOCKET_EVENT = 16 * 1024
MAX_WEBSOCKET_EVENTS_PER_WINDOW = 100


def throttle(request: Request, scope: str, limit: int, window: int, identity: str = ''):
    peer = request.client.host if request.client else 'unknown'
    key = (scope, peer, identity.lower()[:80])
    current = now()
    # Bound the number of distinct in-memory rate-limit keys against unbounded spam.
    if len(RATE_BUCKETS) > 4000:
        for stale_key, timestamps in list(RATE_BUCKETS.items()):
            if not timestamps or timestamps[-1] < current - 3600:
                RATE_BUCKETS.pop(stale_key, None)
        if len(RATE_BUCKETS) > 5000:
            # Evict the least-recently-used keys; don't reset active login throttles.
            oldest = sorted(RATE_BUCKETS, key=lambda k: RATE_BUCKETS[k][-1] if RATE_BUCKETS[k] else 0)
            for stale_key in oldest[:len(RATE_BUCKETS)-4000]:
                RATE_BUCKETS.pop(stale_key, None)
    hits = [t for t in RATE_BUCKETS[key] if current-t < window]
    if len(hits) >= limit:
        raise HTTPException(429, 'Thao tác quá nhanh. Vui lòng thử lại sau.', headers={'Retry-After': str(max(1, window - (current - hits[0])))})
    hits.append(current)
    RATE_BUCKETS[key] = hits



@app.middleware('http')
async def cookies_and_origin(request: Request, call_next):
    # Cookies are HttpOnly and SameSite=Lax; require consistent browser provenance
    # for state-changing calls, including browsers which omit an Origin header.
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        from fastapi.responses import JSONResponse
        from urllib.parse import urlsplit
        def reject(detail, status=403):
            return JSONResponse({'detail': detail}, status_code=status, headers={'Cache-Control':'no-store'})
        site = request.headers.get('sec-fetch-site', '').lower()
        if site == 'cross-site':
            return reject('Yêu cầu từ trang khác đã bị chặn để bảo vệ tài khoản.')
        origin = request.headers.get('origin')
        referer = request.headers.get('referer')
        b = urlsplit(PUBLIC_ORIGIN) if PUBLIC_ORIGIN else None
        expected_scheme = b.scheme if b else ('https' if COOKIE_SECURE else request.url.scheme)
        expected_host = b.netloc if b else request.headers.get('host', '')
        for supplied in (origin, referer if not origin else None):
            if supplied:
                a = urlsplit(supplied)
                if (a.scheme, a.netloc) != (expected_scheme, expected_host):
                    return reject('Nguồn yêu cầu không hợp lệ.')
        # Reject oversized JSON and uploads early, before parsing or allocating.
        length = request.headers.get('content-length', '')
        if length.isdigit():
            size = int(length)
            limit = MAX_UPLOAD_REQUEST if request.url.path == '/api/uploads' else MAX_JSON_REQUEST
            if size > limit:
                return reject('Nội dung yêu cầu vượt quá dung lượng cho phép.', 413)
        if request.url.path.startswith('/api/') and request.url.path != '/api/uploads':
            media = request.headers.get('content-type', '').split(';', 1)[0].lower().strip()
            if media and media not in ('application/json',):
                return reject('API chỉ chấp nhận dữ liệu JSON.', 415)
    gid = request.cookies.get('g')
    if not gid or len(gid) > 100 or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', gid):
        gid = token()
    request.state.gid = gid
    result = await call_next(request)
    if request.cookies.get('g') != gid:
        result.set_cookie('g', gid, max_age=365*86400, httponly=True, secure=COOKIE_SECURE, samesite='lax', path='/')
    result.headers['X-Content-Type-Options'] = 'nosniff'
    if COOKIE_SECURE:
        result.headers['Strict-Transport-Security'] = 'max-age=31536000'
    result.headers['Permissions-Policy'] = 'geolocation=(), payment=()'
    result.headers['Referrer-Policy'] = 'no-referrer'
    result.headers['X-Frame-Options'] = 'DENY'
    result.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
    result.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    result.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
    result.headers['Cache-Control'] = 'no-store'
    result.headers['Content-Security-Policy'] = ("default-src 'self'; connect-src 'self' ws: wss:; "
         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
         "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; "
         "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    return result


@app.get('/health')
async def health():
    return {'ok':True,'app':'mtunz','version':'2.0'}

@app.get('/')
async def home():
    return FileResponse(ROOT / 'static' / 'index.html')


def current_user(request: Request, require=True):
    t = request.cookies.get('s')
    with db() as c:
        row = one(c, '''SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
                       WHERE s.token_hash=?''', (digest(t),)) if t else None
        if not row or row['expires_at'] <= now():
            if require:
                raise HTTPException(401, 'Phiên đăng nhập đã hết hạn.')
            return None
        if row['sanction_kind'] and row['sanction_until'] and row['sanction_until'] <= now():
            c.execute('UPDATE users SET sanction_kind=NULL,sanction_until=NULL,sanction_reason=NULL WHERE id=?', (row['id'],))
            return current_user_no_sanction(c, row['id'])
        if row['sanction_kind']:
            raise HTTPException(403, {'code': 'sanction', 'kind': row['sanction_kind'],
                                      'until': row['sanction_until'], 'reason': row['sanction_reason']})
        return dict(row)


def current_user_no_sanction(c, uid):
    return dict(one(c, 'SELECT * FROM users WHERE id=?', (uid,)))


def require_admin(request):
    u = current_user(request)
    if not u['is_admin']:
        raise HTTPException(403, 'Chỉ quản trị viên có quyền này.')
    return u


def public_user(u):
    return {'id': u['id'], 'username': u['username'], 'is_admin': bool(u['is_admin']),
            'pin_length': u['pin_length'], 'created_at': u['created_at'],
            'display_name':u['display_name'] or '', 'bio':u['bio'] or '',
            'show_online':bool(u['show_online']), 'show_receipts':bool(u['show_receipts'])}


def issue_session(c, uid):
    raw = token()
    c.execute('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', (digest(raw), uid, now() + 7*86400, now()))
    return raw


def session_response(result, raw):
    from fastapi.responses import JSONResponse
    response = JSONResponse(result)
    response.set_cookie('s', raw, httponly=True, secure=COOKIE_SECURE, samesite='lax', max_age=7*86400)
    return response


def admin_log(c, admin_id, action, detail):
    c.execute('INSERT INTO audit(admin_id,action,detail,created_at) VALUES(?,?,?,?)',
              (admin_id, action, detail[:300], now()))


def get_setting(c):
    return int(one(c, "SELECT value FROM settings WHERE key='max_users'")['value'])


def registration_capacity(c):
    total = one(c, 'SELECT COUNT(*) n FROM users WHERE is_admin=0')['n']
    reserved = one(c, "SELECT COUNT(*) n FROM registrations WHERE status='approved'")['n']
    return total, reserved, get_setting(c)


def has_block(c, a, b):
    return bool(one(c, 'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',
                    (a,b,b,a)))


def friends(c,a,b):
    return bool(one(c, "SELECT 1 FROM friendships WHERE u1=? AND u2=? AND state='accepted'", tuple(sorted((a,b)))))


def is_restricted(c, a, b):
    return bool(one(c, 'SELECT 1 FROM restrictions WHERE owner_id=? AND other_id=?', (a,b)))


def require_peer(c, a, b):
    if a == b or has_block(c,a,b) or not friends(c,a,b):
        raise HTTPException(403, 'Chỉ nhắn tin được với bạn bè chưa bị chặn.')


def user_details(c, u):
    d = public_user(u)
    d.update(sanction_kind=u['sanction_kind'], sanction_until=u['sanction_until'],
             sanction_reason=u['sanction_reason'], last_seen=u['last_seen'])
    return d


# --- Registration: approval BEFORE password/PIN setup ---
class UsernameIn(BaseModel):
    username: str


@app.post('/api/username/check')
async def username_check(request: Request, body: UsernameIn):
    name = norm_username(body.username)
    throttle(request, 'username-check', 75, 900)
    with db() as c:
        if one(c,'SELECT 1 FROM users WHERE username=?',(name,)):
            return {'state': 'exists'}
        if one(c, 'SELECT 1 FROM registrations WHERE username=? AND status IN (\'pending\',\'approved\')', (name,)):
            return {'state': 'reserved'}
    return {'state': 'available'}


@app.post('/api/registration/request')
async def registration_request(request: Request, body: UsernameIn):
    name = norm_username(body.username)
    throttle(request, 'signup', 6, 3600)
    with db() as c:
        if name == 'admin' or one(c,'SELECT 1 FROM users WHERE username=?',(name,)):
            raise HTTPException(409,'Tên đăng nhập đã được sử dụng.')
        existing = one(c, 'SELECT * FROM registrations WHERE username=?',(name,))
        if existing:
            if existing['guest_id'] != request.state.gid and existing['status'] in ('pending','approved'):
                raise HTTPException(409,'Tên này đang được chờ xét duyệt.')
            if existing['guest_id'] == request.state.gid and existing['status'] in ('pending','approved'):
                return {'status': existing['status'], 'username': name}
            if existing['status'] == 'completed':
                raise HTTPException(409,'Tên tài khoản đã được sử dụng.')
            c.execute('DELETE FROM registrations WHERE id=?', (existing['id'],))
        c.execute('INSERT INTO registrations(username,guest_id,created_at) VALUES(?,?,?)',
                  (name,request.state.gid,now()))
    await hub.admins('registration-updated')
    return {'status':'pending','username':name}


@app.get('/api/registration/status')
async def registration_status(request: Request):
    with db() as c:
        rows = many(c, "SELECT username,status,created_at FROM registrations WHERE guest_id=? AND status!='completed' ORDER BY id DESC LIMIT 5", (request.state.gid,))
    return {'requests':rows}


class RegisterComplete(BaseModel):
    username: str
    password: str
    pin: str
    pin_length: int


@app.post('/api/registration/complete')
async def register_complete(request: Request, body: RegisterComplete):
    name = norm_username(body.username)
    ensure_password(body.password)
    ensure_pin(body.pin,body.pin_length)
    with db() as c:
        r = one(c, 'SELECT * FROM registrations WHERE username=? AND guest_id=?', (name,request.state.gid))
        if not r or r['status'] != 'approved':
            raise HTTPException(403,'Yêu cầu của bạn chưa được admin chấp thuận.')
        total, reserved, max_users = registration_capacity(c)
        if total >= max_users:
            raise HTTPException(409,'Hệ thống đã đạt giới hạn người dùng.')
        try:
            c.execute('INSERT INTO users(username,password_hash,pin_hash,pin_length,created_at) VALUES(?,?,?,?,?)',
                      (name,hash_secret(body.password),hash_secret(body.pin),body.pin_length,now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409,'Tên tài khoản đã tồn tại.')
        c.execute("UPDATE registrations SET status='completed' WHERE id=?",(r['id'],))
    await hub.admins('registration-updated')
    return {'ok':True}


# --- Three-stage login ---
@app.post('/api/auth/start')
async def auth_start(request: Request, body: UsernameIn):
    name = norm_username(body.username)
    throttle(request, 'auth-start', 60, 900)
    with db() as c:
        u = one(c, 'SELECT id,is_admin FROM users WHERE username=?', (name,))
    if not u:
        raise HTTPException(404,'Không tìm thấy tài khoản. Bạn có thể gửi yêu cầu đăng ký.')
    return {'username':name,'is_admin':bool(u['is_admin']),'next':'password'}


class PasswordLogin(BaseModel):
    username: str
    password: str


@app.post('/api/auth/password')
async def auth_password(request: Request, body: PasswordLogin):
    name = norm_username(body.username)
    throttle(request, 'password-login', 15, 900, name)
    with db() as c:
        u = one(c, 'SELECT * FROM users WHERE username=?', (name,))
        if not u or not verify_secret(u['password_hash'],body.password):
            raise HTTPException(401,'Tên tài khoản hoặc mật khẩu không đúng.')
        if u['sanction_kind'] and (not u['sanction_until'] or u['sanction_until'] > now()):
            raise HTTPException(403, {'code':'sanction','kind':u['sanction_kind'],
                                      'until':u['sanction_until'],'reason':u['sanction_reason']})
        if u['is_admin']:
            raw = issue_session(c,u['id'])
            return session_response({'ok':True,'admin':True},raw)
        challenge = token()
        c.execute('DELETE FROM login_challenges WHERE guest_id=?', (request.state.gid,))
        c.execute('INSERT INTO login_challenges VALUES(?,?,?,?)',
                  (digest(challenge),request.state.gid,u['id'],now()+5*60))
        return {'next':'pin','challenge':challenge,'pin_length':u['pin_length']}


class PinLogin(BaseModel):
    challenge: str
    pin: str


@app.post('/api/auth/pin')
async def auth_pin(request: Request, body: PinLogin):
    throttle(request, 'pin-login', 12, 900, request.state.gid)
    with db() as c:
        r = one(c, '''SELECT l.*,u.pin_hash,u.pin_length,u.sanction_kind,u.sanction_until
                     FROM login_challenges l JOIN users u ON u.id=l.user_id WHERE l.token_hash=?''',
                (digest(body.challenge),))
        if not r or r['guest_id'] != request.state.gid or r['expires_at'] <= now():
            raise HTTPException(401,'Phiên xác minh PIN hết hạn, vui lòng đăng nhập lại.')
        ensure_pin(body.pin,r['pin_length'])
        if not verify_secret(r['pin_hash'],body.pin):
            raise HTTPException(401,'Mã PIN không đúng.')
        if r['sanction_kind'] and (not r['sanction_until'] or r['sanction_until'] > now()):
            raise HTTPException(403,'Tài khoản đang bị hạn chế.')
        c.execute('DELETE FROM login_challenges WHERE token_hash=?',(digest(body.challenge),))
        raw = issue_session(c,r['user_id'])
        return session_response({'ok':True,'admin':False},raw)


@app.get('/api/me')
async def me(request: Request):
    u = current_user(request, require=False)
    return {'user':public_user(u) if u else None}


@app.post('/api/auth/logout')
async def logout(request: Request):
    t = request.cookies.get('s')
    if t:
        with db() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?',(digest(t),))
        await hub.terminate_session(digest(t))
    from fastapi.responses import JSONResponse
    response=JSONResponse({'ok':True})
    response.delete_cookie('s')
    return response


class ChangePin(BaseModel):
    old_pin: str
    new_pin: str
    pin_length: int


@app.post('/api/me/pin')
async def change_pin(request: Request, body: ChangePin):
    u = current_user(request)
    throttle(request, 'change-pin', 12, 3600, str(u['id']))
    if u['is_admin']:
        raise HTTPException(403,'Admin không sử dụng PIN.')
    ensure_pin(body.new_pin, body.pin_length)
    with db() as c:
        if not verify_secret(u['pin_hash'],body.old_pin):
            raise HTTPException(401,'Mã PIN hiện tại không đúng.')
        c.execute('UPDATE users SET pin_hash=?,pin_length=? WHERE id=?',
                  (hash_secret(body.new_pin),body.pin_length,u['id']))
    return {'ok':True}


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


@app.post('/api/me/password')
async def change_password(request: Request, body: ChangePassword):
    u=current_user(request)
    throttle(request, 'change-password', 12, 3600, str(u['id']))
    ensure_password(body.new_password)
    with db() as c:
        if not verify_secret(u['password_hash'],body.old_password):
            raise HTTPException(401,'Mật khẩu hiện tại không đúng.')
        c.execute('UPDATE users SET password_hash=? WHERE id=?', (hash_secret(body.new_password),u['id']))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',
                  (u['id'],digest(request.cookies.get('s',''))))
    await hub.terminate_user(u['id'], except_hash=digest(request.cookies.get('s','')))
    return {'ok':True}


# --- Friends and blocking ---
@app.get('/api/people/search')
async def people_search(request: Request,q: str=''):
    u=current_user(request)
    if not q.strip(): return {'users':[]}
    with db() as c:
        rows = many(c, '''SELECT id,username FROM users WHERE is_admin=0 AND id!=? AND username LIKE ?
                          AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
                          AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
                          LIMIT 20''', (u['id'], '%'+q.strip()[:24]+'%',u['id'],u['id']))
        for r in rows:
            fr = one(c,'SELECT state,requested_by FROM friendships WHERE u1=? AND u2=?',tuple(sorted((u['id'],r['id']))))
            r['friend_state'] = fr['state'] if fr else 'none'
            r['requested_by_me'] = bool(fr and fr['requested_by']==u['id'])
    return {'users':rows}


@app.get('/api/friends')
async def get_friends(request: Request):
    u=current_user(request)
    with db() as c:
        allrows=many(c, '''SELECT f.*,u.id other_id,u.username FROM friendships f
          JOIN users u ON u.id=CASE WHEN f.u1=? THEN f.u2 ELSE f.u1 END
          WHERE f.u1=? OR f.u2=? ORDER BY f.created_at DESC''',(u['id'],u['id'],u['id']))
        for r in allrows:
            other_user = one(c,'SELECT show_online,display_name FROM users WHERE id=?',(r['other_id'],))
            r['online'] = bool(hub.users.get(r['other_id'])) and bool(other_user['show_online']) and not is_restricted(c,r['other_id'],u['id'])
            r['display_name'] = other_user['display_name'] or ''
            pref=one(c,'SELECT muted,archived FROM chat_preferences WHERE user_id=? AND other_id=?',(u['id'],r['other_id']))
            r['muted'] = bool(pref['muted']) if pref else False
            r['archived'] = bool(pref['archived']) if pref else False
            r['restricted'] = is_restricted(c,u['id'],r['other_id'])
            r['last_seen'] = one(c,'SELECT last_seen FROM users WHERE id=?',(r['other_id'],))['last_seen']
            msg = one(c, '''SELECT body,created_at,sender_id FROM messages
                            WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)
                            ORDER BY id DESC LIMIT 1''', (u['id'],r['other_id'],r['other_id'],u['id']))
            r['last_message']=dict(msg) if msg else None
            r['unread']=one(c,'SELECT count(*) n FROM messages WHERE recipient_id=? AND sender_id=? AND read_at IS NULL',
                            (u['id'],r['other_id']))['n']
        allrows.sort(key=lambda a:a['last_message']['created_at'] if a['last_message'] else a['created_at'],reverse=True)
    return {'friends':allrows}


@app.post('/api/friends/request/{other_id}')
async def friend_request(request: Request,other_id: int):
    u=current_user(request)
    with db() as c:
        if u['id']==other_id or not one(c,'SELECT 1 FROM users WHERE id=? AND is_admin=0',(other_id,)):
            raise HTTPException(404,'Người dùng không hợp lệ.')
        if has_block(c,u['id'],other_id):
            raise HTTPException(403,'Không thể kết bạn với tài khoản đã chặn.')
        a,b=sorted((u['id'],other_id))
        if one(c,'SELECT 1 FROM friendships WHERE u1=? AND u2=?',(a,b)):
            raise HTTPException(409,'Đã có lời mời hoặc đã kết bạn.')
        c.execute('INSERT INTO friendships VALUES(?,?,?,?,?)',(a,b,u['id'],'pending',now()))
        notify_user_persist(c,other_id,f'{u["username"]} đã gửi lời mời kết bạn.')
    await hub.user(other_id,'friends-updated')
    await hub.user(u['id'],'friends-updated')
    return {'ok':True}


@app.post('/api/friends/accept/{other_id}')
async def friend_accept(request: Request,other_id: int):
    u=current_user(request)
    a,b=sorted((u['id'],other_id))
    with db() as c:
        r=one(c,'SELECT * FROM friendships WHERE u1=? AND u2=?',(a,b))
        if not r or r['state']!='pending' or r['requested_by']==u['id']:
            raise HTTPException(403,'Không có lời mời kết bạn chờ chấp thuận.')
        c.execute("UPDATE friendships SET state='accepted' WHERE u1=? AND u2=?",(a,b))
        notify_user_persist(c,other_id,f'{u["username"]} đã chấp nhận lời mời kết bạn.')
    await hub.user(other_id,'friends-updated')
    await hub.user(u['id'],'friends-updated')
    return {'ok':True}


@app.post('/api/friends/remove/{other_id}')
async def friend_remove(request: Request,other_id:int):
    u=current_user(request)
    a,b=sorted((u['id'],other_id))
    with db() as c:
        c.execute('DELETE FROM friendships WHERE u1=? AND u2=?',(a,b))
    await hub.user(other_id,'friends-updated')
    await hub.user(u['id'],'friends-updated')
    return {'ok':True}


@app.get('/api/blocks')
async def get_blocks(request:Request):
    u=current_user(request)
    with db() as c:
        return {'users':many(c,'SELECT users.id,username FROM blocks JOIN users ON users.id=blocks.blocked_id WHERE blocker_id=?',(u['id'],))}


@app.post('/api/blocks/{other_id}')
async def block_user(request:Request,other_id:int):
    u=current_user(request)
    if u['id']==other_id:raise HTTPException(400,'Không thể chặn chính mình.')
    with db() as c:
        if not one(c,'SELECT 1 FROM users WHERE id=? AND is_admin=0',(other_id,)):
            raise HTTPException(404,'Không tìm thấy tài khoản.')
        c.execute('INSERT OR IGNORE INTO blocks VALUES(?,?)',(u['id'],other_id))
        a,b=sorted((u['id'],other_id))
        c.execute('DELETE FROM friendships WHERE u1=? AND u2=?',(a,b))
        c.execute('DELETE FROM restrictions WHERE (owner_id=? AND other_id=?) OR (owner_id=? AND other_id=?)',(u['id'],other_id,other_id,u['id']))
    await hub.user(other_id,'friends-updated')
    await hub.user(u['id'],'friends-updated')
    return {'ok':True}


@app.delete('/api/blocks/{other_id}')
async def unblock_user(request:Request,other_id:int):
    u=current_user(request)
    with db() as c:c.execute('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?',(u['id'],other_id))
    return {'ok':True}


@app.post('/api/restrict/{other_id}')
async def toggle_restrict(request:Request,other_id:int):
    u=current_user(request)
    with db() as c:
        require_peer(c,u['id'],other_id)
        row=one(c,'SELECT 1 FROM restrictions WHERE owner_id=? AND other_id=?',(u['id'],other_id))
        if row:c.execute('DELETE FROM restrictions WHERE owner_id=? AND other_id=?',(u['id'],other_id))
        else:c.execute('INSERT INTO restrictions VALUES(?,?)',(u['id'],other_id))
    await hub.user(u['id'],'friends-updated')
    return {'restricted':not bool(row)}


# --- Messaging: Socket.IO-like events over native WebSocket ---
class SendMessage(BaseModel):
    recipient_id:int
    body:str=Field(default='',max_length=2000)
    attachment_id:int|None=None
    reply_to:int|None=None


@app.get('/api/messages/{other_id}')
async def message_history(request:Request,other_id:int,before:int=0):
    u=current_user(request)
    with db() as c:
        require_peer(c,u['id'],other_id)
        sql='''SELECT id,sender_id,recipient_id,body,created_at,read_at FROM messages WHERE
             ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))'''
        params=[u['id'],other_id,other_id,u['id']]
        if before>0:
            sql+=' AND id<?';params.append(before)
        sql+=' ORDER BY id DESC LIMIT 70'
        result=many(c,sql.replace('SELECT id,sender_id,recipient_id,body,created_at,read_at',
                                  'SELECT *'),params)
        result=[message_details(c,r) for r in result[::-1]]
        # Hide read receipts when the reader opted out or restricted the sender.
        peer=one(c,'SELECT show_receipts FROM users WHERE id=?',(other_id,))
        if not peer['show_receipts'] or is_restricted(c,other_id,u['id']):
            for item in result:
                if item['sender_id']==u['id']:item['read_at']=None
    return {'messages':result}


@app.post('/api/messages')
async def send_message(request:Request,body:SendMessage):
    throttle(request, 'chat-send', 90, 60)
    u=current_user(request)
    text=body.body.strip()
    if not text and not body.attachment_id:raise HTTPException(422,'Nhập nội dung hoặc chọn tệp để gửi.')
    with db() as c:
        require_peer(c,u['id'],body.recipient_id)
        file_for_message(c,body.attachment_id,u['id'])
        if body.reply_to and not one(c,'''SELECT 1 FROM messages WHERE id=? AND
             ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))''',
             (body.reply_to,u['id'],body.recipient_id,body.recipient_id,u['id'])):
            raise HTTPException(404,'Tin nhắn được trả lời không tồn tại.')
        cursor=c.execute('''INSERT INTO messages(sender_id,recipient_id,body,attachment_id,reply_to,created_at)
                          VALUES(?,?,?,?,?,?)''',(u['id'],body.recipient_id,text,body.attachment_id,body.reply_to,now()))
        msg=message_details(c,one(c,'SELECT * FROM messages WHERE id=?',(cursor.lastrowid,)))
        # Do not generate interruption notifications for users who mute this conversation.
        pref=one(c,'SELECT muted FROM chat_preferences WHERE user_id=? AND other_id=?',(body.recipient_id,u['id']))
        if not pref or not pref['muted']:
            notify_user_persist(c,body.recipient_id,f'Tin nhắn từ {u["username"]}: {text[:120] if text else "Đã gửi một tệp"}')
    await hub.user(body.recipient_id,'message',message=msg)
    await hub.user(u['id'],'message',message=msg)
    return {'message':msg}


@app.post('/api/messages/read/{other_id}')
async def read_messages(request:Request,other_id:int):
    u=current_user(request)
    with db() as c:
        require_peer(c,u['id'],other_id)
        t=now()
        cursor=c.execute('UPDATE messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL',
                         (t,u['id'],other_id))
        peer=one(c,'SELECT show_receipts FROM users WHERE id=?',(u['id'],))
        suppress=is_restricted(c,u['id'],other_id) or not peer['show_receipts']
    if cursor.rowcount and not suppress:
        await hub.user(other_id,'read',by=u['id'],at=t)
    return {'ok':True}


@app.get('/api/notifications')
async def get_notifications(request:Request):
    u=current_user(request)
    with db() as c:return {'notifications':many(c,'SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 80',(u['id'],))}


# --- Admin-operated guest support & secure one-time resets ---
class CreateTicket(BaseModel):
    kind:Literal['username','password','pin','other']
    claim:str=Field(default='',max_length=160)


@app.post('/api/support/tickets')
async def create_ticket(request:Request,body:CreateTicket):
    throttle(request, 'ticket-new', 8, 3600)
    u=current_user(request,False)
    with db() as c:
        cursor=c.execute('INSERT INTO tickets(guest_id,owner_id,kind,claim,created_at) VALUES(?,?,?,?,?)',
                         (request.state.gid,u['id'] if u else None,body.kind,body.claim.strip(),now()))
        tid=cursor.lastrowid
    await hub.admins('support-updated')
    return {'id':tid}


@app.get('/api/support/tickets')
async def list_my_tickets(request:Request):
    with db() as c:
        return {'tickets':many(c,'SELECT id,kind,claim,status,created_at FROM tickets WHERE guest_id=? ORDER BY id DESC LIMIT 30',(request.state.gid,))}


def ticket_for_guest(c,request,tid):
    r=one(c,'SELECT * FROM tickets WHERE id=? AND guest_id=?',(tid,request.state.gid))
    if not r:raise HTTPException(404,'Không tìm thấy cuộc trò chuyện hỗ trợ.')
    return r


@app.get('/api/support/tickets/{tid}/messages')
async def my_ticket_messages(request:Request,tid:int):
    with db() as c:
        ticket_for_guest(c,request,tid)
        return {'messages':many(c,'SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id',(tid,))}


class SupportMessage(BaseModel):
    body:str=Field(min_length=1,max_length=1500)


@app.post('/api/support/tickets/{tid}/messages')
async def send_ticket_message(request:Request,tid:int,body:SupportMessage):
    throttle(request, 'ticket-message', 40, 300)
    with db() as c:
        r=ticket_for_guest(c,request,tid)
        if r['status']!='open':raise HTTPException(403,'Yêu cầu đã đóng.')
        cur=c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,0,?,?)',
                      (tid,body.body.strip(),now()))
        msg={'id':cur.lastrowid,'ticket_id':tid,'from_admin':0,'body':body.body.strip(),'created_at':now()}
    await hub.admins('support-message',ticket_id=tid,message=msg)
    return {'message':msg}


class ResetAccount(BaseModel):
    code:str
    new_value:str
    pin_length:int|None=None


@app.post('/api/support/reset')
async def reset_account(request:Request,body:ResetAccount):
    throttle(request, 'ticket-reset', 12, 900)
    with db() as c:
        r=one(c,'''SELECT g.*,t.guest_id FROM recovery_grants g
                   JOIN tickets t ON t.id=g.ticket_id WHERE g.token_hash=?''',(digest(body.code.strip()),))
        if not r or r['guest_id']!=request.state.gid or r['expires_at']<now() or r['used_at']:
            raise HTTPException(403,'Mã khôi phục không hợp lệ hoặc đã hết hạn.')
        if r['kind']=='password':
            ensure_password(body.new_value)
            c.execute('UPDATE users SET password_hash=? WHERE id=?',(hash_secret(body.new_value),r['user_id']))
        elif r['kind']=='pin':
            ensure_pin(body.new_value,body.pin_length or 0)
            c.execute('UPDATE users SET pin_hash=?,pin_length=? WHERE id=?',
                      (hash_secret(body.new_value),body.pin_length,r['user_id']))
        else:raise HTTPException(400,'Loại khôi phục không được hỗ trợ.')
        c.execute('UPDATE recovery_grants SET used_at=? WHERE token_hash=?',(now(),digest(body.code.strip())))
        c.execute('DELETE FROM sessions WHERE user_id=?',(r['user_id'],))
    await hub.user(r['user_id'],'session-ended',reason='Thông tin xác minh vừa được thay đổi.')
    await hub.terminate_user(r['user_id'])
    return {'ok':True}


# --- Administrative controls ---
@app.get('/api/admin/stats')
async def admin_stats(request:Request):
    require_admin(request)
    with db() as c:
        total,reserved,maximum=registration_capacity(c)
        return {'total_users':total,'reserved_slots':reserved,'max_users':maximum,
          'pending':one(c,"SELECT count(*) n FROM registrations WHERE status='pending'")['n'],
          'tickets':one(c,"SELECT count(*) n FROM tickets WHERE status='open'")['n'],
          'messages':one(c,'SELECT count(*) n FROM messages')['n']+one(c,'SELECT count(*) n FROM group_messages')['n'],
          'groups':one(c,'SELECT count(*) n FROM chat_groups')['n'],
          'online':sum(bool(v) for uid,v in hub.users.items() if uid!=1)}


@app.get('/api/admin/registrations')
async def admin_registrations(request:Request):
    require_admin(request)
    with db() as c:return {'registrations':many(c,"SELECT id,username,status,created_at FROM registrations WHERE status IN ('pending','approved','denied') ORDER BY id DESC LIMIT 100")}


class Decision(BaseModel):
    approve:bool


@app.post('/api/admin/registrations/{rid}/decision')
async def admin_decision(request:Request,rid:int,body:Decision):
    admin=require_admin(request)
    with db() as c:
        r=one(c,'SELECT * FROM registrations WHERE id=?',(rid,))
        if not r or r['status']!='pending':raise HTTPException(409,'Yêu cầu không còn chờ duyệt.')
        if body.approve:
            total,reserved,maximum=registration_capacity(c)
            if total+reserved>=maximum:raise HTTPException(409,'Hệ thống đã đủ số lượng tài khoản được phép.')
        status='approved' if body.approve else 'denied'
        c.execute('UPDATE registrations SET status=?,decided_at=?,decided_by=? WHERE id=?',
                  (status,now(),admin['id'],rid))
        admin_log(c,admin['id'],'registration_'+status,r['username'])
    await hub.guest(r['guest_id'],'registration-updated',username=r['username'],status=status)
    await hub.admins('registration-updated')
    return {'ok':True}


class Capacity(BaseModel):
    max_users:int=Field(ge=1,le=100000)


@app.post('/api/admin/capacity')
async def set_capacity(request:Request,body:Capacity):
    admin=require_admin(request)
    with db() as c:
        total,reserved,_=registration_capacity(c)
        if body.max_users<total+reserved:
            raise HTTPException(409,'Giới hạn mới không thể ít hơn số tài khoản và lượt đã phê duyệt.')
        c.execute("UPDATE settings SET value=? WHERE key='max_users'",(str(body.max_users),))
        admin_log(c,admin['id'],'capacity',str(body.max_users))
    return {'ok':True}


@app.get('/api/admin/users')
async def admin_users(request:Request,q:str=''):
    require_admin(request)
    with db() as c:
        rows=many(c,'''SELECT id,username,created_at,last_seen,pin_length,sanction_kind,sanction_until,sanction_reason
                       FROM users WHERE is_admin=0 AND username LIKE ? ORDER BY id DESC LIMIT 200''',
                  ('%'+q.strip()[:24]+'%',))
        for r in rows:
            r['message_count']=one(c,'SELECT count(*) n FROM messages WHERE sender_id=? OR recipient_id=?',(r['id'],r['id']))['n']
            r['friend_count']=one(c,"SELECT count(*) n FROM friendships WHERE state='accepted' AND (u1=? OR u2=?)",(r['id'],r['id']))['n']
    return {'users':rows}


class Sanction(BaseModel):
    kind:Literal['ban','lock','unban']
    minutes:int|None=Field(default=None,ge=1,le=5256000)
    reason:str=Field(default='',max_length=250)


@app.post('/api/admin/users/{uid}/sanction')
async def admin_sanction(request:Request,uid:int,body:Sanction):
    if body.kind=='lock' and not body.minutes:
        raise HTTPException(422, 'Khóa tạm thời cần có thời hạn cụ thể.')
    admin=require_admin(request)
    with db() as c:
        u=one(c,'SELECT * FROM users WHERE id=? AND is_admin=0',(uid,))
        if not u:raise HTTPException(404,'Không tìm thấy tài khoản.')
        kind=None if body.kind=='unban' else body.kind
        expiry=(now()+body.minutes*60) if kind and body.minutes else None
        c.execute('UPDATE users SET sanction_kind=?,sanction_until=?,sanction_reason=? WHERE id=?',
                  (kind,expiry,body.reason.strip() if kind else None,uid))
        if kind:c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        admin_log(c,admin['id'],'sanction_'+body.kind,f"{u['username']}: {body.reason}; mins={body.minutes}")
    if kind:
        await hub.user(uid,'account-sanction',kind=kind,until=expiry,reason=body.reason)
        await hub.terminate_user(uid)
    return {'ok':True}


@app.get('/api/admin/users/{uid}/messages')
async def admin_user_messages(request:Request,uid:int):
    admin=require_admin(request)
    with db() as c:
        u=one(c,'SELECT username FROM users WHERE id=? AND is_admin=0',(uid,))
        if not u:raise HTTPException(404,'Không tìm thấy tài khoản.')
        rows=many(c,'''SELECT m.id,s.username sender,r.username recipient,m.body,m.created_at,m.read_at,
                              m.attachment_id,a.original_name attachment_name,m.deleted_at
                       FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
                       LEFT JOIN attachments a ON a.id=m.attachment_id
                       WHERE m.sender_id=? OR m.recipient_id=? ORDER BY m.id DESC LIMIT 100''',(uid,uid))
        admin_log(c,admin['id'],'moderation_messages',u['username'])
    return {'messages':rows}


@app.get('/api/admin/tickets')
async def admin_tickets(request:Request):
    require_admin(request)
    with db() as c:return {'tickets':many(c,'SELECT * FROM tickets ORDER BY id DESC LIMIT 120')}


@app.get('/api/admin/tickets/{tid}/messages')
async def admin_ticket_messages(request:Request,tid:int):
    require_admin(request)
    with db() as c:
        if not one(c,'SELECT 1 FROM tickets WHERE id=?',(tid,)):raise HTTPException(404,'Không tìm thấy yêu cầu.')
        return {'messages':many(c,'SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id',(tid,))}


@app.post('/api/admin/tickets/{tid}/messages')
async def admin_send_ticket(request:Request,tid:int,body:SupportMessage):
    admin=require_admin(request)
    with db() as c:
        t=one(c,'SELECT * FROM tickets WHERE id=?',(tid,))
        if not t:raise HTTPException(404,'Không tìm thấy yêu cầu.')
        cur=c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,1,?,?)',
                      (tid,body.body.strip(),now()))
        msg={'id':cur.lastrowid,'ticket_id':tid,'from_admin':1,'body':body.body.strip(),'created_at':now()}
        admin_log(c,admin['id'],'support_reply',str(tid))
    await hub.guest(t['guest_id'],'support-message',ticket_id=tid,message=msg)
    return {'message':msg}


class RecoveryGrantIn(BaseModel):
    username:str
    verified:bool=False


@app.post('/api/admin/tickets/{tid}/grant')
async def admin_grant(request:Request,tid:int,body:RecoveryGrantIn):
    admin=require_admin(request)
    if not body.verified:
        raise HTTPException(422,'Admin phải xác nhận đã kiểm tra danh tính qua kênh độc lập.')
    username=norm_username(body.username)
    with db() as c:
        t=one(c,'SELECT * FROM tickets WHERE id=?',(tid,))
        u=one(c,'SELECT * FROM users WHERE username=? AND is_admin=0',(username,))
        if not t or not u or t['kind'] not in ('password','pin'):
            raise HTTPException(400,'Chỉ yêu cầu quên mật khẩu hoặc PIN mới có thể cấp mã.')
        if t['status']!='open':raise HTTPException(409,'Phiếu hỗ trợ đã đóng.')
        raw=secrets.token_urlsafe(12)
        c.execute('INSERT INTO recovery_grants(token_hash,ticket_id,user_id,kind,expires_at) VALUES(?,?,?,?,?)',
                  (digest(raw),tid,u['id'],t['kind'],now()+15*60))
        note=f'Mã đặt lại {"mật khẩu" if t["kind"]=="password" else "PIN"} (dùng 1 lần, hiệu lực 15 phút): {raw}. Nhập mã ở mục Khôi phục bên dưới.'
        c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,1,?,?)',(tid,note,now()))
        admin_log(c,admin['id'],'issue_recovery',f'ticket={tid}, account={username}, type={t["kind"]}')
    await hub.guest(t['guest_id'],'support-updated',ticket_id=tid)
    return {'ok':True}


class TicketClose(BaseModel):
    status:Literal['open','closed']


@app.post('/api/admin/tickets/{tid}/status')
async def admin_ticket_status(request:Request,tid:int,body:TicketClose):
    admin=require_admin(request)
    with db() as c:
        t=one(c,'SELECT * FROM tickets WHERE id=?',(tid,))
        if not t:raise HTTPException(404,'Không tìm thấy yêu cầu.')
        c.execute('UPDATE tickets SET status=? WHERE id=?',(body.status,tid))
        admin_log(c,admin['id'],'ticket_status',f'{tid}: {body.status}')
    await hub.guest(t['guest_id'],'support-updated',ticket_id=tid)
    return {'ok':True}


class Broadcast(BaseModel):
    body:str=Field(min_length=1,max_length=500)


@app.post('/api/admin/broadcast')
async def admin_broadcast(request:Request,body:Broadcast):
    admin=require_admin(request)
    with db() as c:
        ids=[r['id'] for r in c.execute('SELECT id FROM users WHERE is_admin=0')]
        for uid in ids:
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',(uid,body.body.strip(),now()))
        admin_log(c,admin['id'],'broadcast',body.body.strip())
    for uid in ids:
        await hub.user(uid,'announcement',body=body.body.strip())
    return {'ok':True,'recipients':len(ids)}


@app.get('/api/admin/audit')
async def admin_audit(request:Request):
    require_admin(request)
    with db() as c:return {'logs':many(c,'SELECT * FROM audit ORDER BY id DESC LIMIT 100')}


# --- Presence and event bus ---
async def notify_presence(uid,online):
    with db() as c:
        config=one(c,'SELECT show_online FROM users WHERE id=?',(uid,))
        if not config or not config['show_online']:return
        rows=many(c,"SELECT CASE WHEN u1=? THEN u2 ELSE u1 END other_id FROM friendships WHERE state='accepted' AND (u1=? OR u2=?)",(uid,uid,uid))
        targets=[r['other_id'] for r in rows if not is_restricted(c,uid,r['other_id'])]
    for other in targets:
        await hub.user(other,'presence',user_id=uid,online=online)


@app.websocket('/ws')
async def websocket_events(ws:WebSocket):
    origin = ws.headers.get('origin')
    # Browsers send Origin for websocket upgrades. A public deployment refuses
    # cookie-authenticated browser connections without an origin check.
    if PUBLIC_MODE and not origin:
        await ws.close(code=1008)
        return
    if origin:
        from urllib.parse import urlsplit
        actual = urlsplit(origin)
        expected = urlsplit(PUBLIC_ORIGIN) if PUBLIC_ORIGIN else None
        expected_scheme = expected.scheme if expected else ('https' if COOKIE_SECURE else ('https' if ws.url.scheme == 'wss' else 'http'))
        expected_host = expected.netloc if expected else ws.headers.get('host', '')
        if (actual.scheme, actual.netloc) != (expected_scheme, expected_host):
            await ws.close(code=1008)
            return
    await ws.accept()
    sid=ws.cookies.get('s')
    gid=ws.cookies.get('g')
    if gid and (len(gid) > 100 or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',gid)):
        gid = None
    uid=None
    if sid:
        with db() as c:
            r=one(c,'''SELECT u.id,u.sanction_kind,u.sanction_until FROM sessions s
                       JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?''',
                  (digest(sid),now()))
            if r and (not r['sanction_kind'] or (r['sanction_until'] and r['sanction_until']<=now())):
                uid=r['id']
    if uid is not None:
        was_online=bool(hub.users.get(uid))
        hub.users[uid].add(ws)
        hub.session_hashes[ws] = digest(sid)
        if not was_online:await notify_presence(uid,True)
    elif gid:
        hub.guests[gid].add(ws)
    else:
        await ws.close(code=1008)
        return
    try:
        activity = []
        while True:
            raw_message = await ws.receive_text()
            # Stop oversized socket events and floods before decoding JSON.
            if len(raw_message.encode('utf-8')) > MAX_WEBSOCKET_EVENT:
                await ws.close(code=1009)
                break
            current = time.monotonic()
            activity = [t for t in activity if current - t < 30]
            if len(activity) >= MAX_WEBSOCKET_EVENTS_PER_WINDOW:
                await ws.close(code=1008)
                break
            activity.append(current)
            try:
                msg = json.loads(raw_message)
            except json.JSONDecodeError:
                await ws.close(code=1003)
                break
            if not isinstance(msg,dict):
                continue
            if uid is not None and msg.get('type')=='typing':
                other=msg.get('to')
                if not isinstance(other,int):continue
                with db() as c:
                    session_ok=one(c,'SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?',(digest(sid),now()))
                    valid=bool(session_ok and friends(c,uid,other) and not has_block(c,uid,other))
                if valid:await hub.user(other,'typing',from_id=uid,on=bool(msg.get('on')))
            if uid is not None and isinstance(msg,dict) and msg.get('type')=='group-typing':
                gid=msg.get('group_id')
                if not isinstance(gid,int):continue
                with db() as c:
                    session_ok=one(c,'SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?',(digest(sid),now()))
                    targets=group_members_for(c,gid) if session_ok and group_membership(c,gid,uid) else []
                for target in targets:
                    if target!=uid:await hub.user(target,'group-typing',group_id=gid,from_id=uid,on=bool(msg.get('on')))
            if uid is not None and isinstance(msg,dict) and msg.get('type') in ('call-offer','call-answer','call-ice','call-hangup','call-decline'):
                target=msg.get('to')
                if not isinstance(target,int) or target==uid:continue
                with db() as c:
                    session_ok=one(c,'SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?',(digest(sid),now()))
                    permitted=bool(session_ok and friends(c,uid,target) and not has_block(c,uid,target))
                if permitted:
                    # Only narrow signaling fields may transit; never execute/parse remote SDP on the server.
                    blob=msg.get('signal')
                    if len(json.dumps(blob))<14000:
                        await hub.user(target,msg['type'],from_id=uid,signal=blob,video=bool(msg.get('video')))
    except (WebSocketDisconnect,RuntimeError,ValueError):
        pass
    finally:
        if uid is not None:
            hub.users[uid].discard(ws)
            hub.session_hashes.pop(ws, None)
            if not hub.users[uid]:
                with db() as c:c.execute('UPDATE users SET last_seen=? WHERE id=?',(now(),uid))
                await notify_presence(uid,False)
        elif gid:
            hub.guests[gid].discard(ws)

# Persistent upgrades and additional routed features.
import sys as _sys
from features import install as _install_extra_features
_install_extra_features(_sys.modules[__name__])
