"""mtunz: single-worker realtime messenger using FastAPI.

Local runs use SQLite; Render Free uses persistent Neon PostgreSQL.
Never deploy the bundled demo administrator password to a public server.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
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
from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from urllib.parse import unquote_plus
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from device_info import device_metadata

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
TERMS_VERSION = '2026-11-18'
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'mtunz7' if not PUBLIC_MODE else '')
# A public server must never be bootstrapped with the documented demo credential.
if PUBLIC_MODE and (len(ADMIN_PASSWORD) < 12 or ADMIN_PASSWORD == 'mtunz7'):
    raise RuntimeError('PUBLIC_MODE=1 yêu cầu ADMIN_PASSWORD mạnh từ 12 ký tự (không dùng mật khẩu demo).')
COOKIE_SECURE = PUBLIC_MODE or os.getenv('COOKIE_SECURE', '0') == '1'
REMEMBER_COOKIE = '__Host-mtunz-remember' if COOKIE_SECURE else 'mtunz_remember'
REMEMBER_SECONDS = 30 * 86400
# Optional fixed browser origin for custom domains. Without this, compare against Host.
PUBLIC_ORIGIN = os.getenv('PUBLIC_ORIGIN', '').strip().rstrip('/')
if PUBLIC_ORIGIN and not PUBLIC_ORIGIN.startswith(('https://', 'http://')):
    raise RuntimeError('PUBLIC_ORIGIN phải có dạng https://ten-mien-cua-ban')
if PUBLIC_MODE and PUBLIC_ORIGIN and not PUBLIC_ORIGIN.startswith('https://'):
    raise RuntimeError('PUBLIC_ORIGIN phải dùng HTTPS khi PUBLIC_MODE=1')
USERNAME_RE = re.compile(r'^[a-z][a-z0-9_]{2,23}$')
PH = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
app = FastAPI(title='mtunz', docs_url=None, redoc_url=None)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, error: RequestValidationError):
    # Validation errors can contain the entire submitted value, including credentials.
    details=[{key:issue[key] for key in ('loc','msg','type')} for issue in error.errors()]
    return JSONResponse({'detail':details},status_code=422,headers={'Cache-Control':'no-store'})

app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')


@app.get('/api/mobile/release')
def android_release_metadata():
    from android_release_catalog import latest_android_release
    return JSONResponse(latest_android_release(), headers={'Cache-Control': 'no-store'})



def now():
    return int(time.time())


def digest(token: str):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def token():
    return secrets.token_urlsafe(32)


# New members get seven-digit internal and public IDs; existing members retain
# their internal foreign keys and receive separate seven-digit public IDs.
# Never treat an ID as a login secret.
MEMBER_ID_MIN = 1_000_000
MEMBER_ID_MAX = 9_999_999


def random_member_id():
    """Cryptographically secure random numeric account ID (inclusive range)."""
    return MEMBER_ID_MIN + secrets.randbelow(MEMBER_ID_MAX - MEMBER_ID_MIN + 1)


def create_member(c, *, username, password_hash, pin_hash, pin_length, phone, email):
    """Create a member with a unique random ID, safely retrying rare collisions.

    ON CONFLICT(id) DO NOTHING avoids aborting PostgreSQL transactions on an
    ID collision. A competing registration of the same username still raises
    a uniqueness error and the enclosing transaction rolls back.
    """
    for _ in range(32):
        member_id = random_member_id()
        if one(c, 'SELECT 1 FROM users WHERE id=? OR public_id=?',(member_id,member_id)):
            continue
        inserted = c.execute(
            '''INSERT INTO users(id,username,password_hash,pin_hash,pin_length,created_at,phone,email,needs_display_name,public_id)
               VALUES(?,?,?,?,?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING id''',
            (member_id, username, password_hash, pin_hash, pin_length, now(), phone, email, member_id)
        ).fetchone()
        if inserted:
            return int(inserted['id'])
    raise RuntimeError('Không thể cấp ID tài khoản duy nhất. Vui lòng thử lại.')



def norm_username(name: str):
    value = name.strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(422, 'Tên đăng nhập không đúng định dạng.')
    return value

def normalize_phone(value: str) -> str:
    """Normalize VN local numbers or international E.164-like numbers.

    Phone numbers are unverified; never use them as proof of identity.
    """
    number=re.sub(r'[\s().-]', '', str(value or ''))
    if re.fullmatch(r'0[0-9]{9}',number):
        number='+84'+number[1:]
    if not re.fullmatch(r'\+[1-9][0-9]{7,14}',number):
        raise HTTPException(422,'Số điện thoại không hợp lệ.')
    return number


def normalize_login(value: str) -> str:
    """Accept a username or canonical VN/E.164 phone without revealing username."""
    raw = str(value or '').strip()
    if raw and (raw[0].isdigit() or raw.startswith('+')):
        return normalize_phone(raw)
    return norm_username(raw)


def login_user(c, login: str, columns: str = '*'):
    """Never choose an arbitrary account if legacy contact numbers overlap."""
    if login.startswith('+'):
        matches = many(c, f'SELECT {columns} FROM users WHERE phone=? LIMIT 2', (login,))
        return matches[0] if len(matches) == 1 else None
    return one(c, f'SELECT {columns} FROM users WHERE username=?', (login,))


def validate_display_name(value: str, username: str) -> str:
    name = ' '.join(str(value or '').strip().split())
    if len(name) < 2 or len(name) > 50 or not any(ch.isalpha() for ch in name):
        raise HTTPException(422,'Tên hiển thị cần từ 2 đến 50 ký tự và có ít nhất một chữ cái.')
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise HTTPException(422,'Tên hiển thị chứa ký tự không hợp lệ.')
    if name.casefold() == username.casefold():
        raise HTTPException(422,'Hãy chọn tên hiển thị khác tên đăng nhập để bảo vệ riêng tư.')
    return name


def normalize_email(value: str | None) -> str:
    email=str(value or '').strip().lower()
    if not email:
        return ''
    if len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}',email):
        raise HTTPException(422,'Email không hợp lệ. Vui lòng nhập email đúng định dạng.')
    return email


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
        CREATE TABLE IF NOT EXISTS trusted_devices (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON trusted_devices(user_id);
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
        CREATE TABLE IF NOT EXISTS support_rate_limits (
          bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL
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
        c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('support_intake_paused','0')")
        # Stable per-installation secret: never store identifiable client IPs in support counters.
        c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",
                  ('support_rate_salt', token()))
        if not one(c, 'SELECT id FROM users WHERE username=?', ('admin',)):
            c.execute('INSERT INTO users(username,password_hash,is_admin,created_at) VALUES(?,?,1,?)',
                      ('admin', hash_secret(ADMIN_PASSWORD), now()))


init_db()


class Hub:
    def __init__(self):
        self.users: dict[int, set[WebSocket]] = defaultdict(set)
        self.guests: dict[str, set[WebSocket]] = defaultdict(set)
        self.session_hashes: dict[WebSocket, str] = {}
        self.device_hashes: dict[WebSocket, str] = {}
        self.foreground: set[WebSocket] = set()
        self.valid_session_until: dict[str, int] = {}

    async def send(self, sockets, payload, *, member=False):
        async def deliver(ws):
            if member and ws not in self.session_hashes:
                return
            try:
                await asyncio.wait_for(ws.send_json(payload), timeout=2)
            except Exception:
                pass
        if sockets:
            await asyncio.gather(*(deliver(ws) for ws in tuple(sockets)))

    async def broadcast_members(self, event, **data):
        # One query for all live clients, not a database read for each recipient.
        sockets = list(self.session_hashes)
        if not sockets:
            return
        with db() as c:
            active = {r['token_hash'] for r in c.execute(
                'SELECT token_hash FROM sessions WHERE expires_at>?', (now(),))}
        valid = [ws for ws in sockets if self.session_hashes.get(ws) in active]
        for ws in sockets:
            if ws not in valid:
                try: await ws.close(code=1008)
                except Exception: pass
        await self.send(valid, {'type':event, **data}, member=True)

    async def user(self, uid, event, **data):
        sockets = list(self.users.get(uid, ()))
        # Critical events must be delivered once even after the session is revoked.
        if event in ('account-sanction', 'session-ended'):
            for ws in sockets:
                self.valid_session_until.pop(self.session_hashes.get(ws), None)
        elif sockets:
            current = now()
            cached = {self.session_hashes.get(ws) for ws in sockets
                      if self.valid_session_until.get(self.session_hashes.get(ws,''),0)>current}
            if len(cached)==len({self.session_hashes.get(ws) for ws in sockets}):
                active = cached
            else:
                with db() as c:
                    active = {}
                    for row in c.execute('SELECT token_hash,expires_at FROM sessions WHERE user_id=? AND expires_at>?',
                                         (uid,current)):
                        active[row['token_hash']]=row['expires_at']
                for sid in {self.session_hashes.get(ws) for ws in sockets} & active.keys():
                    self.valid_session_until[sid]=min(current+3,active[sid])
            good = []
            for ws in sockets:
                if self.session_hashes.get(ws) in active:
                    good.append(ws)
                else:
                    try: await ws.close(code=1008)
                    except Exception: pass
            sockets = good
        await self.send(sockets, {'type': event, **data}, member=True)
        if event in ('message','group-message','support-message') or data.get('new_request'):
            foreground=frozenset(self.device_hashes[ws] for ws in sockets
                                 if ws in self.foreground and ws in self.device_hashes)
            enqueue_web_push(uid,event,foreground,data)

    def detach_session(self, ws):
        sid = self.session_hashes.pop(ws, None)
        self.device_hashes.pop(ws,None)
        self.foreground.discard(ws)
        self.valid_session_until.pop(sid, None)

    async def close_sockets(self, sockets, notice=None):
        # Stop dispatch as a batch before awaiting sends or closes.
        for ws in sockets:
            self.detach_session(ws)
        if notice:
            await self.send(sockets, {'type':'session-ended', 'reason':notice})

        async def close(ws):
            try: await ws.close(code=1008)
            except Exception: pass
        if sockets:
            await asyncio.gather(*(close(ws) for ws in sockets))

    async def terminate_user(self, uid, except_hash=None):
        sockets = [ws for ws in self.users.get(uid, ())
                   if not except_hash or self.session_hashes.get(ws) != except_hash]
        await self.close_sockets(sockets)

    async def terminate_session(self, session_hash, notice=None):
        sockets = [ws for ws, sid in self.session_hashes.items() if sid == session_hash]
        await self.close_sockets(sockets, notice=notice)

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
# Idle timeout for heartbeat-aware web/native sockets. Older clients retain protocol keepalive.
PRESENCE_HEARTBEAT_TIMEOUT = 20
SOCKET_SESSION_RECHECK_SECONDS = 6


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
    # Never let a cookie silently change the identity of a bearer request.
    if request.url.path.startswith('/api/') and conflicting_credentials(request):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail':'Thông tin phiên đăng nhập xung đột.'},status_code=400,headers={'Cache-Control':'no-store'})
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
                try:
                    a = urlsplit(supplied)
                except ValueError:
                    return reject('Nguồn yêu cầu không hợp lệ.')
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
    # Emergency mode disables creation of user content, without cutting off
    # read-only history, logins, Admin recovery or security operations.
    if request.method in ('POST','PUT','PATCH','DELETE'):
        path=request.url.path
        # One server-side containment gate for every user-content write.
        # Login, logout, account protection, blocking, abuse reporting, support
        # and appeals remain available so users can recover or seek help.
        # The guard runs before endpoints to protect newly added community APIs.
        protected=(
            path in ('/api/uploads','/api/world/messages',
                     '/api/registration/request','/api/registration/complete',
                     '/api/me/profile','/api/me/social')
            or (path.startswith('/api/chats/') and path.endswith(('/nickname','/alerts')))
            or path.startswith(('/api/messages','/api/scheduled-messages',
                                '/api/groups','/api/message-requests',
                                '/api/world/polls/','/api/chat/pins',
                                '/api/chat/forward','/api/chat/disappear/',
                                '/api/friends/request/','/api/friends/accept/',
                                '/api/friends/remove/'))
            or (path.startswith('/api/community/events/') and
                path.endswith('/rsvp'))
        )
        if protected:
            with db() as c:
                row=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
            if row and row['value']=='1':
                return JSONResponse({'detail':'Hệ thống đang ở chế độ an toàn khẩn cấp. Chỉ cho phép xem dữ liệu.'},
                                    status_code=423,headers={'Cache-Control':'no-store'})
    result = await call_next(request)
    if request.cookies.get('g') != gid:
        result.set_cookie('g', gid, max_age=365*86400, httponly=True, secure=COOKIE_SECURE, samesite='lax', path='/')
    result.headers['X-Content-Type-Options'] = 'nosniff'
    if COOKIE_SECURE:
        result.headers['Strict-Transport-Security'] = 'max-age=31536000'
    result.headers['Permissions-Policy'] = 'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), browsing-topics=()'
    result.headers['Referrer-Policy'] = 'no-referrer'
    result.headers['X-Frame-Options'] = 'DENY'
    result.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
    result.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    result.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
    result.headers['Cache-Control'] = 'no-store'
    result.headers['X-Robots-Tag'] = 'noindex, nofollow'
    result.headers['Content-Security-Policy'] = ("default-src 'self'; connect-src 'self' ws: wss: https://api.github.com; "
         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
         "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; "
         "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    return result


@app.get('/.well-known/assetlinks.json', include_in_schema=False)
def android_asset_links():
    return FileResponse(ROOT / 'static' / 'android-assetlinks.json', media_type='application/json')


@app.get('/health')
async def health():
    """Readiness: report 200 only when essential Neon/SQLite tables are reachable.

    Render's HTTP check can use this endpoint. Fail closed without disclosing
    connection strings, SQL errors or any user data to unauthenticated callers.
    """
    try:
        with db() as connection:
            connection.execute('SELECT 1 FROM users LIMIT 1').fetchone()
            connection.execute('SELECT 1 FROM message_pins LIMIT 1').fetchone()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail='Cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.'
        ) from None
    # Render provides the Git SHA automatically. Exposing a short SHA from a
    # public repository is safe and makes deployment drift easy to diagnose.
    release = os.getenv('RENDER_GIT_COMMIT', '').strip().lower()
    result = {'ok':True,'app':'mtunz','version':'2.0'}
    if re.fullmatch(r'[0-9a-f]{40}', release):
        result['commit'] = release[:12]
    return result

@app.get('/')
async def home(request: Request):
    if 'chatgpt.com' in request.query_params.getlist('utm_source'):
        remaining = []
        for part in request.url.query.split('&'):
            key, _, value = part.partition('=')
            if (unquote_plus(key), unquote_plus(value)) != ('utm_source', 'chatgpt.com'):
                remaining.append(part)
        query = '&'.join(remaining)
        return RedirectResponse('/?' + query if query else '/', status_code=302)
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/terms')
async def public_terms():
    return FileResponse(ROOT / 'static' / 'terms.html', media_type='text/html')


@app.get('/privacy')
async def public_privacy():
    return FileResponse(ROOT / 'static' / 'privacy.html', media_type='text/html')


def parse_maintenance_schedule(value):
    return json.loads(value) if value else None


def maintenance_status(c, lock=False):
    query="SELECT key,value FROM settings WHERE key IN ('maintenance_mode','maintenance_schedule') ORDER BY key"
    if lock and POSTGRES_MODE:
        query += ' FOR UPDATE'
    settings={row['key']:row['value'] for row in c.execute(query)}
    schedule=parse_maintenance_schedule(settings.get('maintenance_schedule'))
    at=now()
    manual=settings.get('maintenance_mode')=='1'
    return {'manual':manual,'active':manual or bool(schedule and schedule['starts_at']<=at<schedule['ends_at']),
            'schedule':schedule if schedule and schedule['ends_at']>at else None,'server_time':at}


def maintenance_enabled(c, lock=False):
    return maintenance_status(c,lock)['active']


@app.get('/api/system/maintenance')
def public_maintenance_status():
    with db() as c:
        return maintenance_status(c)


def require_member_service(c, lock=False):
    status=maintenance_status(c,lock)
    if status['active']:
        schedule=status['schedule']
        detail='Hệ thống đang bảo trì. Vui lòng đăng nhập lại sau.'
        if schedule and schedule['starts_at']<=status['server_time']:
            detail+=' '+schedule['reason']
        raise HTTPException(503,{'code':'maintenance','message':detail})


def bearer_token(request):
    header=request.headers.get('authorization','')
    if header.startswith('Bearer ') and re.fullmatch(r'[A-Za-z0-9_-]{30,128}',header[7:]):
        return header[7:]
    return None


def conflicting_credentials(request):
    cookie=request.cookies.get('s')
    return bool(cookie and request.headers.get('authorization') is not None and cookie!=bearer_token(request))


def request_session_token(request):
    """Browser HttpOnly cookie or explicit native bearer; never mix identities."""
    if conflicting_credentials(request):
        return None
    if request.headers.get('authorization') is not None:
        return bearer_token(request)
    return request.cookies.get('s') or None


def current_user(request: Request, require=True, *, allow_deletion=False):
    t = request_session_token(request)
    with db() as c:
        row = one(c, '''SELECT u.*,s.expires_at,s.last_seen AS session_activity_at,
                       (SELECT purge_at FROM account_deletion_requests WHERE user_id=u.id) AS deletion_purge_at,
                       (SELECT value FROM settings WHERE key='maintenance_mode') AS maintenance_mode,
                       (SELECT value FROM settings WHERE key='maintenance_schedule') AS maintenance_schedule
                       FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?''', (digest(t),)) if t else None
        if not row or row['expires_at'] <= now():
            if t:
                require_member_service(c)
            if require:
                raise HTTPException(401, 'Phiên đăng nhập đã hết hạn.')
            return None
        session_activity_at=row['session_activity_at']
        if not row['is_admin']:
            schedule=parse_maintenance_schedule(row['maintenance_schedule'])
            if row['maintenance_mode']=='1' or schedule and schedule['starts_at']<=now()<schedule['ends_at']:
                require_member_service(c)
        deadline=row['deletion_purge_at']
        if deadline is not None and not allow_deletion:
            raise HTTPException(423,{'code':'account_deletion_pending','purge_at':deadline,
                                     'message':'Xác nhận hủy yêu cầu xóa để dùng lại tài khoản.'})
        if row['sanction_kind'] and row['sanction_until'] and row['sanction_until'] <= now():
            c.execute('UPDATE users SET sanction_kind=NULL,sanction_until=NULL,sanction_reason=NULL WHERE id=?', (row['id'],))
            row = current_user_no_sanction(c, row['id'])
            row['deletion_purge_at']=deadline
        if row['sanction_kind']:
            raise HTTPException(403, {'code': 'sanction', 'kind': row['sanction_kind'],
                                      'until': row['sanction_until'], 'reason': row['sanction_reason']})
        # Enforce onboarding in every protected API, not only in the browser.
        # /api/me may inspect the flag; the named endpoint may complete it.
        if (not row['is_admin'] and row['needs_display_name'] and
                request.url.path not in ('/api/me', '/api/me/display-name')):
            raise HTTPException(403,'Bạn cần đặt tên hiển thị trước khi sử dụng mtunz.')
        # Native clients may use REST without a WebSocket. Limit DB writes to
        # once per two minutes for each authenticated, usable member session.
        if not row['is_admin'] and now()-(session_activity_at or 0)>=120:
            timestamp=now()
            c.execute('UPDATE sessions SET last_seen=? WHERE token_hash=? AND last_seen<?',
                      (timestamp,digest(t),timestamp-119))
            c.execute('UPDATE users SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)',
                      (timestamp,row['id'],timestamp))
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
            'public_id':u['public_id'], 'headline':u['headline'] or '',
            'website':u['website'] or '', 'profile_visibility':u['profile_visibility'],
            'avatar_url':f'/api/profile/{u["id"]}/avatar' if u['avatar_attachment_id'] else None,
            'cover_url':f'/api/profile/{u["id"]}/cover' if u['cover_attachment_id'] else None,
            'allow_message_requests':bool(u['allow_message_requests']),
            'world_anonymous':bool(u['world_anonymous']),
            'onboarding_required':bool(u['needs_display_name']),
            'phone':u['phone'] or '', 'email':u['email'] or '',
            'show_online':bool(u['show_online']), 'show_receipts':bool(u['show_receipts'])}


def issue_session(c, uid, request):
    raw = token()
    info = device_metadata(request)
    created = now()
    sql='SELECT is_admin FROM users WHERE id=?'
    user=one(c,sql+(' FOR UPDATE' if POSTGRES_MODE else ''),(uid,))
    if not user:
        raise HTTPException(401,'Tài khoản không còn khả dụng.')
    is_admin = bool(user['is_admin'])
    if not is_admin and POSTGRES_MODE:
        require_member_service(c, lock=True)
    expires = created + (2 * 3600 if is_admin else 7 * 86400)
    deletion=one(c,'SELECT purge_at FROM account_deletion_requests WHERE user_id=?',(uid,)) if not is_admin else None
    if deletion:
        if deletion['purge_at']<=created:
            raise HTTPException(410,'Tài khoản đã đến hạn xóa.')
        expires=min(expires,deletion['purge_at'],created+900)
    c.execute('''INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen,
                 device_name,device_type,browser,os_name,location_hint,network_hint,ip_address)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
              (digest(raw), uid, expires, created, created,
               info['device_name'], info['device_type'], info['browser'], info['os_name'],
               info['location_hint'], info['network_hint'], info['ip_address']))
    if not is_admin and not POSTGRES_MODE:
        require_member_service(c)
    return raw


def session_response(result, raw):
    from fastapi.responses import JSONResponse
    response = JSONResponse(result)
    response.set_cookie('s', raw, httponly=True, secure=COOKIE_SECURE,
                        samesite='strict' if result.get('admin') else 'lax', path='/')
    return response


def remember_cookie(response, raw):
    response.set_cookie(REMEMBER_COOKIE, raw, httponly=True, secure=COOKIE_SECURE,
                        samesite='strict', path='/', max_age=REMEMBER_SECONDS)
    return response


def valid_remember_token(raw):
    return bool(raw and 30 <= len(raw) <= 128 and re.fullmatch(r'[A-Za-z0-9_-]+', raw))


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
    if a == b or has_block(c,a,b) or not friends(c,a,b) or not one(c,\
            'SELECT 1 FROM users WHERE id=? AND is_admin=0', (a,)) or not one(c,\
            'SELECT 1 FROM users WHERE id=? AND is_admin=0', (b,)):
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


class RegistrationRequest(BaseModel):
    username: str
    phone: str = Field(min_length=0,max_length=40)
    email: str = Field(default='',max_length=254)


@app.post('/api/registration/request')
async def registration_request(request: Request, body: RegistrationRequest):
    name = norm_username(body.username)
    phone = normalize_phone(body.phone)
    email = normalize_email(body.email)
    throttle(request, 'signup', 6, 3600)
    with db() as c:
        require_member_service(c)
        if one(c,'SELECT id FROM users WHERE phone=?',(phone,)):
            raise HTTPException(409,'Số điện thoại đã liên kết với tài khoản khác. Vui lòng dùng số khác hoặc liên hệ hỗ trợ.')
        if name == 'admin' or one(c,'SELECT 1 FROM users WHERE username=?',(name,)):
            raise HTTPException(409,'Tên đăng nhập đã được sử dụng.')
        existing = one(c, 'SELECT * FROM registrations WHERE username=?',(name,))
        if existing:
            if existing['guest_id'] != request.state.gid and existing['status'] in ('pending','approved'):
                raise HTTPException(409,'Tên này đang được chờ xét duyệt.')
            if existing['guest_id'] == request.state.gid and existing['status'] in ('pending','approved'):
                # Existing requests from older versions can add contact details.
                c.execute('UPDATE registrations SET phone=?,email=? WHERE id=?',(phone,email,existing['id']))
                return {'status': existing['status'], 'username': name,'phone':phone,'email':email}
            if existing['status'] == 'completed':
                raise HTTPException(409,'Tên tài khoản đã được sử dụng.')
            c.execute('DELETE FROM registrations WHERE id=?', (existing['id'],))
        c.execute('INSERT INTO registrations(username,guest_id,created_at,phone,email) VALUES(?,?,?,?,?)',
                  (name,request.state.gid,now(),phone,email))
    await hub.admins('registration-updated',new_request=True)
    return {'status':'pending','username':name,'phone':phone,'email':email}


@app.get('/api/registration/status')
async def registration_status(request: Request):
    with db() as c:
        rows = many(c, "SELECT username,status,created_at,phone,email FROM registrations WHERE guest_id=? AND status!='completed' ORDER BY id DESC LIMIT 5", (request.state.gid,))
    return {'requests':rows}


class RegisterComplete(BaseModel):
    username: str
    password: str
    pin: str
    pin_length: int
    phone: str | None = Field(default=None,max_length=40)
    accepted_terms: bool = False


@app.post('/api/registration/complete')
async def register_complete(request: Request, body: RegisterComplete):
    name = norm_username(body.username)
    ensure_password(body.password)
    ensure_pin(body.pin,body.pin_length)
    with db() as c:
        require_member_service(c)
        r = one(c, 'SELECT * FROM registrations WHERE username=? AND guest_id=?', (name,request.state.gid))
        if not r or r['status'] != 'approved':
            raise HTTPException(403,'Yêu cầu của bạn chưa được admin chấp thuận.')
        if not body.accepted_terms:
            raise HTTPException(422,'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.')
        phone=normalize_phone(r['phone'] or body.phone)
        email=normalize_email(r['email'])
        if one(c,'SELECT 1 FROM users WHERE phone=?',(phone,)):
            raise HTTPException(409,'Số điện thoại đã liên kết với tài khoản khác. Vui lòng liên hệ hỗ trợ.')
        total, reserved, max_users = registration_capacity(c)
        if total >= max_users:
            raise HTTPException(409,'Hệ thống đã đạt giới hạn người dùng.')
        try:
            member_id = create_member(c, username=name, password_hash=hash_secret(body.password),
                                      pin_hash=hash_secret(body.pin), pin_length=body.pin_length,
                                      phone=phone, email=email)
        except sqlite3.IntegrityError:
            raise HTTPException(409,'Tên tài khoản đã tồn tại.')
        c.execute('''UPDATE users SET terms_accepted_at=?,terms_accepted_version=? WHERE id=?''',
                  (now(), TERMS_VERSION, member_id))
        c.execute("UPDATE registrations SET status='completed' WHERE id=?",(r['id'],))
        # The user has just entered their new password and PIN in the
        # approved registration flow. Give a short onboarding-only session;
        # other APIs stay closed until they set their public display name.
        raw = issue_session(c,member_id,request)
    await hub.admins('registration-updated')
    return session_response({'ok':True,'id':member_id,'onboarding_required':True},raw)


# --- Three-stage login ---
@app.post('/api/auth/start')
async def auth_start(request: Request, body: UsernameIn):
    name = normalize_login(body.username)
    throttle(request, 'auth-start', 60, 900)
    with db() as c:
        u = login_user(c, name, 'id,is_admin')
        if not u or not u['is_admin']:
            require_member_service(c)
    if not u:
        raise HTTPException(404,'Không tìm thấy tài khoản hoặc số điện thoại chưa liên kết duy nhất.')
    return {'username':name,'is_admin':bool(u['is_admin']),'next':'password'}


class PasswordLogin(BaseModel):
    username: str
    password: str


@app.post('/api/auth/password')
async def auth_password(request: Request, body: PasswordLogin):
    name = normalize_login(body.username)
    throttle(request, 'password-login', 15, 900, name)
    with db() as c:
        u = login_user(c, name)
        if not u or not u['is_admin']:
            require_member_service(c)
        if not u or not verify_secret(u['password_hash'],body.password):
            raise HTTPException(401,'Tên tài khoản hoặc mật khẩu không đúng.')
        if u['sanction_kind'] and (not u['sanction_until'] or u['sanction_until'] > now()):
            raise HTTPException(403, {'code':'sanction','kind':u['sanction_kind'],
                                      'until':u['sanction_until'],'reason':u['sanction_reason']})
        if u['is_admin'] and not u['pin_hash']:
            # Prevent concurrent password-only Admin logins from each observing
            # zero active sessions before either creates its own session.
            if POSTGRES_MODE:
                c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',(u['id'],))
            if one(c,'SELECT 1 FROM sessions WHERE user_id=? AND expires_at>?',(u['id'],now())):
                raise HTTPException(409,'Phiên Admin đã hoạt động. Hãy bật PIN tại phiên hiện tại để phê duyệt thiết bị thứ hai.')
            old_device = request.cookies.get(REMEMBER_COOKIE)
            if valid_remember_token(old_device):
                c.execute('DELETE FROM trusted_devices WHERE token_hash=?',(digest(old_device),))
            raw = issue_session(c,u['id'],request)
            response = session_response({'ok':True,'admin':True},raw)
            if old_device: response.delete_cookie(REMEMBER_COOKIE,path='/')
            return response
        challenge = token()
        c.execute('DELETE FROM login_challenges WHERE guest_id=?', (request.state.gid,))
        c.execute('INSERT INTO login_challenges VALUES(?,?,?,?)',
                  (digest(challenge),request.state.gid,u['id'],now()+5*60))
        return {'next':'pin','challenge':challenge,'pin_length':u['pin_length']}


class PinLogin(BaseModel):
    challenge: str
    pin: str
    remember_device: bool = False


@app.post('/api/auth/pin')
async def auth_pin(request: Request, body: PinLogin):
    throttle(request, 'pin-login', 12, 900, request.state.gid)
    with db() as c:
        r = one(c, '''SELECT l.*,u.pin_hash,u.pin_length,u.needs_display_name,u.sanction_kind,u.sanction_until,u.is_admin
                     FROM login_challenges l JOIN users u ON u.id=l.user_id WHERE l.token_hash=?''',
                (digest(body.challenge),))
        if not r or r['guest_id'] != request.state.gid or r['expires_at'] <= now():
            raise HTTPException(401,'Phiên xác minh PIN hết hạn, vui lòng đăng nhập lại.')
        if not r['is_admin']:
            require_member_service(c)
        pin_valid = (len(body.pin) == r['pin_length'] and body.pin.isascii()
                     and body.pin.isdigit() and verify_secret(r['pin_hash'],body.pin))
        if not pin_valid:
            raise HTTPException(401,'Mã PIN không chính xác. Vui lòng thử lại.')
        if r['sanction_kind'] and (not r['sanction_until'] or r['sanction_until'] > now()):
            raise HTTPException(403,'Tài khoản đang bị hạn chế.')
        c.execute('DELETE FROM login_challenges WHERE token_hash=?',(digest(body.challenge),))
        is_admin = bool(one(c,'SELECT is_admin FROM users WHERE id=?',(r['user_id'],))['is_admin'])
        pending=admin_login_gate(c,r['user_id'],request) if is_admin else None
        raw=issue_session(c,r['user_id'],request) if not pending else None
        previous = request.cookies.get(REMEMBER_COOKIE)
        if valid_remember_token(previous):
            c.execute('DELETE FROM trusted_devices WHERE token_hash=?',(digest(previous),))
        # Admins never receive a PIN-only long-lived browser credential.
        pending_deletion=not is_admin and one(c,'SELECT 1 FROM account_deletion_requests WHERE user_id=?',(r['user_id'],))
        saved = token() if body.remember_device and not is_admin and not r['needs_display_name'] and not pending_deletion else None
        if saved:
            info = device_metadata(request)
            created = now()
            c.execute('''INSERT INTO trusted_devices(token_hash,user_id,expires_at,created_at,last_seen,
                         device_name,device_type,browser,os_name,location_hint,network_hint,ip_address)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
                      (digest(saved),r['user_id'],created+REMEMBER_SECONDS,created,created,
                       info['device_name'],info['device_type'],info['browser'],info['os_name'],
                       info['location_hint'],info['network_hint'],info['ip_address']))
    if pending:
        await hub.admins('admin-approval-request')
        return pending
    response = session_response({'ok':True,'admin':is_admin,'remembered':bool(saved)},raw)
    if saved: remember_cookie(response,saved)
    elif request.cookies.get(REMEMBER_COOKIE):
        response.delete_cookie(REMEMBER_COOKIE,path='/')
    return response


@app.get('/api/auth/remembered/status')
async def remembered_status_readonly(request: Request):
    """Check a saved device without revoking the current access session.

    Refreshing an already-authenticated tab must never request a new PIN.
    """
    saved=request.cookies.get(REMEMBER_COOKIE)
    if not valid_remember_token(saved):
        return {'remembered':False}
    with db() as c:
        row=one(c,'''SELECT d.expires_at,u.username,u.pin_hash,u.pin_length,
                     u.is_admin,u.sanction_kind,u.sanction_until
                     FROM trusted_devices d JOIN users u ON u.id=d.user_id
                     WHERE d.token_hash=?''',(digest(saved),))
    if (not row or row['expires_at']<=now() or row['is_admin']
            or not row['pin_hash'] or (row['sanction_kind'] and
            (not row['sanction_until'] or row['sanction_until']>now()))):
        return {'remembered':False}
    return {'remembered':True,'username':row['username'],'pin_length':row['pin_length']}


@app.post('/api/auth/remembered')
async def remembered_status(request: Request):
    """Lock stale cookie sessions on a new-tab visit; provide remembered-device metadata. An in-tab reload skips this endpoint."""
    from fastapi.responses import JSONResponse
    session_raw = request.cookies.get('s')
    saved = request.cookies.get(REMEMBER_COOKIE)
    lock_hash = None
    result = {'remembered': False}
    stale_saved = bool(saved)
    with db() as c:
        if session_raw:
            active = one(c, '''SELECT s.token_hash,u.pin_hash FROM sessions s
                              JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?''',
                         (digest(session_raw),now()))
            if active and active['pin_hash']:
                c.execute('DELETE FROM sessions WHERE token_hash=?',(digest(session_raw),))
                lock_hash = digest(session_raw)
        if valid_remember_token(saved):
            saved_user = one(c, '''SELECT d.token_hash,d.expires_at,u.username,u.pin_length,
                               u.pin_hash,u.is_admin,u.sanction_kind,u.sanction_until
                               FROM trusted_devices d JOIN users u ON u.id=d.user_id
                               WHERE d.token_hash=?''',(digest(saved),))
            if saved_user:
                if (saved_user['is_admin'] or saved_user['expires_at'] <= now() or not saved_user['pin_hash']
                        or (saved_user['sanction_kind'] and
                            (not saved_user['sanction_until'] or saved_user['sanction_until'] > now()))):
                    c.execute('DELETE FROM trusted_devices WHERE token_hash=?',(digest(saved),))
                else:
                    result = {'remembered':True,'username':saved_user['username'],
                              'pin_length':saved_user['pin_length']}
                    stale_saved = False
    if lock_hash:
        await hub.terminate_session(lock_hash)
    response = JSONResponse(result)
    if lock_hash:
        response.delete_cookie('s',path='/')
    if stale_saved:
        response.delete_cookie(REMEMBER_COOKIE,path='/')
    return response


class RememberedUnlock(BaseModel):
    pin: str


@app.post('/api/auth/remembered/unlock')
async def remembered_unlock(request: Request, body: RememberedUnlock):
    saved = request.cookies.get(REMEMBER_COOKIE)
    if not valid_remember_token(saved):
        raise HTTPException(401,'Thiết bị chưa được ghi nhớ. Vui lòng đăng nhập lại.')
    throttle(request,'remembered-unlock',18,900,digest(saved)[:20])
    error = None
    raw = None
    is_admin = False
    with db() as c:
        require_member_service(c)
        r = one(c, '''SELECT d.*,u.pin_hash,u.pin_length,u.is_admin,u.sanction_kind,u.sanction_until
                      FROM trusted_devices d JOIN users u ON u.id=d.user_id
                      WHERE d.token_hash=?''',(digest(saved),))
        if not r or r['expires_at'] <= now() or not r['pin_hash']:
            error = HTTPException(401,'Thiết bị hết hạn hoặc đã bị thu hồi. Hãy đăng nhập lại.')
        elif r['is_admin']:
            error = HTTPException(401,'Admin phải đăng nhập bằng mật khẩu và PIN; ghi nhớ nhanh đã tắt.')
        elif r['sanction_kind'] and (not r['sanction_until'] or r['sanction_until']>now()):
            error = HTTPException(403,'Tài khoản đang bị hạn chế.')
        elif r['locked_until'] > now():
            error = HTTPException(429,'Thiết bị đang tạm khóa do nhập sai mã PIN nhiều lần. Vui lòng thử lại sau.',
                                  headers={'Retry-After':str(max(1,r['locked_until']-now()))})
        else:
            pin_ok = (len(body.pin)==r['pin_length'] and body.pin.isascii()
                      and body.pin.isdigit() and verify_secret(r['pin_hash'],body.pin))
            if not pin_ok:
                attempts = r['failed_attempts']+1
                lock_until = now()+15*60 if attempts>=5 else 0
                c.execute('UPDATE trusted_devices SET failed_attempts=?,locked_until=? WHERE token_hash=?',
                          (attempts,lock_until,digest(saved)))
                error = HTTPException(429 if attempts>=5 else 401,
                   'Bạn đã nhập sai mã PIN 5 lần. Thiết bị tạm khóa trong 15 phút.' if attempts>=5 else 'Mã PIN không chính xác. Vui lòng thử lại.',
                   headers={'Retry-After':'900'} if attempts>=5 else None)
            else:
                info = device_metadata(request)
                c.execute('''UPDATE trusted_devices SET failed_attempts=0,locked_until=0,
                             last_seen=?,device_name=?,device_type=?,browser=?,os_name=?,
                             location_hint=?,network_hint=?,ip_address=? WHERE token_hash=?''',
                          (now(),info['device_name'],info['device_type'],info['browser'],
                           info['os_name'],info['location_hint'],info['network_hint'],info['ip_address'],digest(saved)))
                raw = issue_session(c,r['user_id'],request)
                is_admin = bool(r['is_admin'])
    if error:
        raise error
    return session_response({'ok':True,'admin':is_admin,'remembered':True},raw)


@app.post('/api/auth/remembered/forget')
async def forget_remembered_device(request:Request):
    from fastapi.responses import JSONResponse
    saved = request.cookies.get(REMEMBER_COOKIE)
    if valid_remember_token(saved):
        with db() as c:
            c.execute('DELETE FROM trusted_devices WHERE token_hash=?',(digest(saved),))
    response=JSONResponse({'ok':True})
    response.delete_cookie(REMEMBER_COOKIE,path='/')
    return response


@app.post('/api/auth/lock')
async def lock_session(request:Request):
    """Revoke current access while retaining saved-device credential for PIN unlock."""
    t=request.cookies.get('s')
    from fastapi.responses import JSONResponse
    if t:
        with db() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?',(digest(t),))
        await hub.terminate_session(digest(t))
    response=JSONResponse({'ok':True})
    response.delete_cookie('s',path='/')
    return response


class SetupAdminPin(BaseModel):
    current_password: str
    pin: str
    pin_length: int


@app.post('/api/me/pin/setup')
async def setup_admin_pin(request:Request,body:SetupAdminPin):
    u=require_admin(request)
    throttle(request,'admin-pin-setup',8,3600,str(u['id']))
    ensure_pin(body.pin,body.pin_length)
    if not verify_secret(u['password_hash'],body.current_password):
        raise HTTPException(401,'Mật khẩu quản trị không đúng.')
    with db() as c:
        if one(c,'SELECT pin_hash FROM users WHERE id=?',(u['id'],))['pin_hash']:
            raise HTTPException(409,'PIN đã được thiết lập. Hãy dùng mục Đổi mã PIN.')
        c.execute('UPDATE users SET pin_hash=?,pin_length=? WHERE id=?',
                  (hash_secret(body.pin),body.pin_length,u['id']))
        c.execute('DELETE FROM trusted_devices WHERE user_id=?',(u['id'],))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',
                  (u['id'],digest(request_session_token(request) or '')))
        admin_log(c,u['id'],'enable_admin_pin','Administrator enabled PIN for remembered devices')
    await hub.terminate_user(u['id'],except_hash=digest(request_session_token(request) or ''))
    return {'ok':True,'pin_length':body.pin_length}


@app.get('/api/me')
async def me(request: Request):
    u = current_user(request,require=False,allow_deletion=True)
    if u and u.get('deletion_purge_at') is not None:
        return {'user':{'id':u['id'],'is_admin':False,'deletion_purge_at':u['deletion_purge_at']}}
    return {'user':public_user(u) if u else None}


class SetOnboardingName(BaseModel):
    display_name: str = Field(min_length=1,max_length=70)


@app.post('/api/me/display-name')
async def complete_display_name(request: Request, body: SetOnboardingName):
    u = current_user(request)
    if u['is_admin']:
        raise HTTPException(403,'Bước này chỉ áp dụng cho tài khoản người dùng.')
    if not u['needs_display_name']:
        raise HTTPException(403,'Bạn đã hoàn tất tên ban đầu. Hãy dùng mục Đổi tên và xác minh mật khẩu + PIN.')
    throttle(request,'complete-display-name',12,900,str(u['id']))
    name = validate_display_name(body.display_name,u['username'])
    with db() as c:
        written=c.execute('UPDATE users SET display_name=?,needs_display_name=0 WHERE id=? AND needs_display_name=1',
                          (name,u['id']))
        if written.rowcount!=1:
            raise HTTPException(403,'Bạn đã hoàn tất tên ban đầu. Hãy dùng mục Đổi tên.')
    return {'ok':True,'display_name':name,'onboarding_required':False}


@app.post('/api/auth/logout')
async def logout(request: Request):
    t = request_session_token(request)
    remembered = request.cookies.get(REMEMBER_COOKIE)
    with db() as c:
        if t:
            forget_push_on_logout(c,digest(t),digest(request.state.gid))
            c.execute('DELETE FROM sessions WHERE token_hash=?',(digest(t),))
        if valid_remember_token(remembered):
            c.execute('DELETE FROM trusted_devices WHERE token_hash=?',(digest(remembered),))
    if t: await hub.terminate_session(digest(t))
    from fastapi.responses import JSONResponse
    response=JSONResponse({'ok':True})
    response.delete_cookie('s',path='/')
    response.delete_cookie(REMEMBER_COOKIE,path='/')
    return response


class ChangePin(BaseModel):
    old_pin: str
    new_pin: str
    pin_length: int


@app.post('/api/me/pin')
async def change_pin(request: Request, body: ChangePin):
    u = current_user(request)
    throttle(request, 'change-pin', 12, 3600, str(u['id']))
    if not u['pin_hash']:
        raise HTTPException(403,'Tài khoản chưa thiết lập PIN.')
    ensure_pin(body.new_pin, body.pin_length)
    if u['is_admin']:
        verify_admin_pin_stepup(request,u,body.old_pin)
    with db() as c:
        if not u['is_admin'] and not verify_secret(u['pin_hash'],body.old_pin):
            raise HTTPException(401,'Mã PIN hiện tại không đúng.')
        c.execute('UPDATE users SET pin_hash=?,pin_length=? WHERE id=?',
                  (hash_secret(body.new_pin),body.pin_length,u['id']))
        c.execute('DELETE FROM trusted_devices WHERE user_id=?',(u['id'],))
    return {'ok':True}


class ChangePassword(BaseModel):
    old_password: str = ''
    admin_pin: str = Field(default='',max_length=6)
    new_password: str


@app.post('/api/me/password')
async def change_password(request: Request, body: ChangePassword):
    u=current_user(request)
    if u['is_admin']:
        verify_admin_pin_stepup(request,u,body.admin_pin)
    throttle(request, 'change-password', 12, 3600, str(u['id']))
    ensure_password(body.new_password)
    with db() as c:
        if not u['is_admin'] and not verify_secret(u['password_hash'],body.old_password):
            raise HTTPException(401,'Mật khẩu hiện tại không đúng.')
        c.execute('UPDATE users SET password_hash=? WHERE id=?', (hash_secret(body.new_password),u['id']))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',
                  (u['id'],digest(request_session_token(request) or '')))
        c.execute('DELETE FROM trusted_devices WHERE user_id=?',(u['id'],))
    await hub.terminate_user(u['id'], except_hash=digest(request_session_token(request) or ''))
    return {'ok':True}


# --- Friends and blocking ---
@app.get('/api/people/search')
async def people_search(request: Request,q: str=''):
    u=current_user(request)
    if not q.strip(): return {'users':[]}
    with db() as c:
        search = q.strip()[:24]
        numeric_id = int(search) if search.isascii() and search.isdigit() and len(search) <= 9 else -1
        rows = many(c, '''SELECT id,public_id,avatar_attachment_id,profile_visibility,COALESCE(NULLIF(display_name,''),'Thành viên') AS username,display_name
                          FROM users WHERE is_admin=0 AND id!=? AND needs_display_name=0
                          AND (display_name LIKE ? OR public_id=?)
                          AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
                          AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
                          LIMIT 20''', (u['id'], '%'+search+'%',numeric_id,u['id'],u['id']))
        for r in rows:
            fr = one(c,'SELECT state,requested_by FROM friendships WHERE u1=? AND u2=?',tuple(sorted((u['id'],r['id']))))
            allowed_avatar=(r['profile_visibility']=='everyone' or
                            (r['profile_visibility']=='friends' and bool(fr and fr['state']=='accepted')))
            r['avatar_url'] = f'/api/profile/{r["id"]}/avatar' if r['avatar_attachment_id'] and allowed_avatar else None
            r['private_profile']=r['profile_visibility']!='everyone'
            r.pop('avatar_attachment_id',None)
            r.pop('profile_visibility',None)
            r['friend_state'] = fr['state'] if fr else 'none'
            r['requested_by_me'] = bool(fr and fr['requested_by']==u['id'])
    return {'users':rows}


@app.get('/api/friends')
async def get_friends(request: Request):
    u=current_user(request)
    with db() as c:
        # One joined query avoids multiple Neon roundtrips per friend on every
        # realtime sidebar refresh. Preserve the existing response format.
        allrows=many(c, '''
          SELECT f.*,u.id AS other_id,
                 COALESCE(NULLIF(u.display_name,''),'Thành viên') AS username,
                 u.display_name,u.show_online,u.last_seen,u.public_id,
                 u.avatar_attachment_id,u.profile_visibility,
                 COALESCE(p.muted,0) AS muted,COALESCE(p.mute_until,0) AS mute_until,COALESCE(p.archived,0) AS archived,
                 COALESCE(p.pinned,0) AS pinned,COALESCE(p.vanish_seconds,0) AS vanish_seconds,
                 CASE WHEN f.state='accepted' THEN COALESCE(p.nickname,'') ELSE '' END AS nickname,
                 CASE WHEN r.owner_id IS NULL THEN 0 ELSE 1 END AS restricted,
                 CASE WHEN pr.owner_id IS NULL THEN 0 ELSE 1 END AS peer_restricted,
                 last.body AS last_body, last.created_at AS last_created,
                 last.sender_id AS last_sender,last.id AS last_id,d.through_id AS deleted_through,
                 (SELECT count(*) FROM messages
                   WHERE f.state='accepted' AND recipient_id=? AND sender_id=u.id AND read_at IS NULL
                   AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>?)
                   AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=messages.recipient_id AND h.scope='dm' AND h.chat_id=messages.sender_id AND h.message_id=messages.id)) AS unread
          FROM friendships f
          JOIN users u ON u.id=CASE WHEN f.u1=? THEN f.u2 ELSE f.u1 END
          LEFT JOIN chat_preferences p ON p.user_id=? AND p.other_id=u.id
          LEFT JOIN private_conversation_deletions d ON d.user_id=CASE WHEN f.u1=u.id THEN f.u2 ELSE f.u1 END AND d.scope='dm' AND d.chat_id=u.id
          LEFT JOIN restrictions r ON r.owner_id=? AND r.other_id=u.id
          LEFT JOIN restrictions pr ON pr.owner_id=u.id AND pr.other_id=?
          LEFT JOIN messages last ON last.id=(
              SELECT m.id FROM messages m
              WHERE f.state='accepted' AND ((m.sender_id=? AND m.recipient_id=u.id)
                  OR (m.sender_id=u.id AND m.recipient_id=?))
                AND (m.expires_at IS NULL OR m.expires_at>?) AND m.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=? AND h.scope='dm' AND h.chat_id=u.id AND h.message_id=m.id)
              ORDER BY m.id DESC LIMIT 1)
          WHERE f.u1=? OR f.u2=?
          ORDER BY f.created_at DESC
        ''',(u['id'],now(),u['id'],u['id'],u['id'],u['id'],
             u['id'],u['id'],now(),u['id'],u['id'],u['id']))
        for r in allrows:
            accepted=r['state']=='accepted'
            visibility=r.pop('profile_visibility')
            can_view_avatar=visibility=='everyone' or (visibility=='friends' and accepted)
            peer_restricted=r.pop('peer_restricted')
            show_activity=bool(r['show_online']) and not peer_restricted and (accepted or visibility=='everyone')
            r['online']=show_activity and bool(hub.users.get(r['other_id']))
            if not show_activity:
                r['last_seen']=None
            r['muted']=bool(r['muted'])
            r['archived']=bool(r['archived'])
            r['pinned']=bool(r['pinned'])
            r['restricted']=bool(r['restricted'])
            r['avatar_url']=(f'/api/profile/{r["other_id"]}/avatar'
                             if r.pop('avatar_attachment_id') and can_view_avatar else None)
            r.pop('show_online',None)
            cutoff=r.pop('deleted_through')
            last_id=r.pop('last_id')
            r['conversation_deleted']=accepted and cutoff is not None and not (last_id and last_id>cutoff)
            last_created=r.pop('last_created')
            last_body=r.pop('last_body')
            last_sender=r.pop('last_sender')
            r['last_message']={'body':last_body,'created_at':last_created,'sender_id':last_sender} if accepted and last_created else None
            if not accepted:
                r['unread']=0
        allrows.sort(key=lambda row:(int(row['pinned']),
             row['last_message']['created_at'] if row['last_message'] else row['created_at']),reverse=True)
    return {'friends':allrows}


@app.post('/api/friends/request/{other_id}')
async def friend_request(request: Request,other_id: int):
    u=current_user(request)
    if u['is_admin']:raise HTTPException(403,'Admin không thể kết bạn hoặc nhắn tin riêng.')
    with db() as c:
        if u['id']==other_id or not one(c,'SELECT 1 FROM users WHERE id=? AND is_admin=0',(other_id,)):
            raise HTTPException(404,'Người dùng không hợp lệ.')
        if has_block(c,u['id'],other_id):
            raise HTTPException(403,'Không thể kết bạn với tài khoản đã chặn.')
        a,b=sorted((u['id'],other_id))
        if one(c,'SELECT 1 FROM friendships WHERE u1=? AND u2=?',(a,b)):
            raise HTTPException(409,'Đã có lời mời hoặc đã kết bạn.')
        c.execute('INSERT INTO friendships VALUES(?,?,?,?,?)',(a,b,u['id'],'pending',now()))
        notify_user_persist(c,other_id,f'{u["display_name"] or "Thành viên"} đã gửi lời mời kết bạn.')
    await hub.user(other_id,'friends-updated')
    await hub.user(u['id'],'friends-updated')
    return {'ok':True}


@app.post('/api/friends/accept/{other_id}')
async def friend_accept(request: Request,other_id: int):
    u=current_user(request)
    if u['is_admin']:raise HTTPException(403,'Admin không thể kết bạn hoặc nhắn tin riêng.')
    a,b=sorted((u['id'],other_id))
    with db() as c:
        r=one(c,'SELECT * FROM friendships WHERE u1=? AND u2=?',(a,b))
        if not r or r['state']!='pending' or r['requested_by']==u['id']:
            raise HTTPException(403,'Không có lời mời kết bạn chờ chấp thuận.')
        c.execute("UPDATE friendships SET state='accepted' WHERE u1=? AND u2=?",(a,b))
        notify_user_persist(c,other_id,f'{u["display_name"] or "Thành viên"} đã chấp nhận lời mời kết bạn.')
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
        return {'users':many(c,"SELECT users.id,COALESCE(NULLIF(users.display_name,''),'Thành viên') AS username FROM blocks JOIN users ON users.id=blocks.blocked_id WHERE blocker_id=?",(u['id'],))}


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
    client_message_id:str|None=Field(default=None,max_length=64)


@app.get('/api/messages/{other_id}')
async def message_history(request:Request,other_id:int,before:int=Query(0,ge=0,le=2**63-1),
                              after:int=Query(0,ge=0,le=2**63-1),latest:bool=False,unread_window:bool=False):
    u=current_user(request)
    with db() as c:
        require_peer(c,u['id'],other_id)
        sql='''SELECT * FROM messages WHERE
             ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))'''
        params=[u['id'],other_id,other_id,u['id']]
        sql+=' AND (expires_at IS NULL OR expires_at>?)'
        params.append(now())
        sql+=" AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=? AND h.scope='dm' AND h.chat_id=? AND h.message_id=messages.id)"
        params.extend((u['id'],other_id))
        unread=None
        if not before and not after and not latest:
            unread=one(c,'''SELECT MIN(id) AS id FROM messages WHERE sender_id=? AND recipient_id=?
                            AND deleted_at IS NULL AND read_at IS NULL AND (expires_at IS NULL OR expires_at>?)
                            AND NOT EXISTS (SELECT 1 FROM private_message_hides h WHERE h.user_id=? AND h.scope='dm' AND h.chat_id=? AND h.message_id=messages.id)''',
                       (other_id,u['id'],params[4],u['id'],other_id))['id']
        rows,more_after=history_window(c,many,sql,params,before,after,latest or not unread_window,unread)
        result=message_page(c,rows,viewer_id=u['id'])
        hide_revision=one(c,"SELECT COUNT(*) AS n FROM private_message_hides WHERE user_id=? AND scope='dm' AND chat_id=?",(u['id'],other_id))['n']
        # Hide read receipts when the reader opted out or restricted the sender.
        peer=one(c,'SELECT show_receipts FROM users WHERE id=?',(other_id,))
        if not peer['show_receipts'] or is_restricted(c,other_id,u['id']):
            for item in result:
                if item['sender_id']==u['id']:
                    item['read_at']=None
                    item['delivered_at']=None
    return {'messages':result,'first_unread_id':unread,'more_after':more_after,'private_hide_revision':hide_revision}


@app.post('/api/messages')
async def send_message(request:Request,body:SendMessage):
    throttle(request, 'chat-send', 90, 60)
    u=current_user(request)
    text=body.body.strip()
    if not text and not body.attachment_id:
        raise HTTPException(422,'Nhập nội dung hoặc chọn tệp để gửi.')
    nonce=body.client_message_id
    if nonce is not None and not re.fullmatch(r'[A-Za-z0-9_-]{16,64}',nonce):
        raise HTTPException(422,'Mã xác nhận tin nhắn không hợp lệ.')
    replay=False
    with db() as c:
        require_peer(c,u['id'],body.recipient_id)
        previous=(one(c,'SELECT * FROM messages WHERE sender_id=? AND client_message_id=?',
                      (u['id'],nonce)) if nonce else None)
        if previous:
            if previous['expires_at'] and previous['expires_at']<=now():
                raise HTTPException(410,'Tin nhắn đã tự biến mất.')
            if (previous['recipient_id']!=body.recipient_id or previous['body']!=text or
                    previous['attachment_id']!=body.attachment_id or previous['reply_to']!=body.reply_to):
                raise HTTPException(409,'Mã tin nhắn đã được dùng cho nội dung khác.')
            msg=message_details(c,previous,viewer_id=u['id'])
            replay=True
        else:
            file_for_message(c,body.attachment_id,u['id'])
            if body.attachment_id and one(c,'''SELECT 1 FROM scheduled_messages
                           WHERE attachment_id=? AND state='pending' ''',(body.attachment_id,)):
                raise HTTPException(409,'Tệp đang chờ gửi theo lịch.')
            if body.reply_to and not one(c,'''SELECT 1 FROM messages WHERE id=? AND deleted_at IS NULL
                 AND (expires_at IS NULL OR expires_at>?) AND
                 ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))''',
                 (body.reply_to,now(),u['id'],body.recipient_id,body.recipient_id,u['id'])):
                raise HTTPException(404,'Tin nhắn được trả lời không tồn tại.')
            vanish=(v6_vanish_seconds(c,u['id'],body.recipient_id)
                    if v6_feature_on(c,'disappearing_dm') else 0)
            created=now()
            expires=created+vanish if vanish else None
            sql='''INSERT INTO messages(sender_id,recipient_id,body,attachment_id,reply_to,
                          created_at,client_message_id,expires_at) VALUES(?,?,?,?,?,?,?,?)'''
            args=(u['id'],body.recipient_id,text,body.attachment_id,body.reply_to,created,nonce,expires)
            if nonce:
                sql+=' ON CONFLICT DO NOTHING'
            cursor=c.execute(sql,args)
            if nonce and cursor.rowcount==0:
                # Two simultaneous device retries with the same key: exactly one
                # persisted message, never a duplicate notification.
                old=one(c,'SELECT * FROM messages WHERE sender_id=? AND client_message_id=?',
                        (u['id'],nonce))
                if not old:raise HTTPException(409,'Tin nhắn đang được xử lý, hãy thử lại.')
                if (old['recipient_id']!=body.recipient_id or old['body']!=text or
                        old['attachment_id']!=body.attachment_id or old['reply_to']!=body.reply_to):
                    raise HTTPException(409,'Mã tin nhắn đã được dùng cho nội dung khác.')
                msg=message_details(c,old,viewer_id=u['id'])
                replay=True
            else:
                msg=message_details(c,one(c,'SELECT * FROM messages WHERE id=?',(cursor.lastrowid,)),viewer_id=u['id'])
                if alert_allowed(c,'dm',body.recipient_id,u['id'],text,now()):
                    notify_user_persist(c,body.recipient_id,
                       (f'Tin nhắn tự biến mất từ {u["display_name"] or "Thành viên"}.'
                        if vanish else
                        f'Tin nhắn mới từ {u["display_name"] or "Thành viên"}.'))
    if not replay:
        recipient_message={key:value for key,value in msg.items() if key!='client_message_id'}
        await asyncio.gather(hub.user(body.recipient_id,'message',message=recipient_message),
                             hub.user(u['id'],'message',message=msg))
    return {'message':msg,'replayed':replay}


@app.post('/api/messages/read/{other_id}')
async def read_messages(request:Request,other_id:int,
                        up_to:int=Query(default=9223372036854775807,ge=1,le=9223372036854775807)):
    u=current_user(request)
    with db() as c:
        require_peer(c,u['id'],other_id)
        t=now()
        cursor=c.execute('''UPDATE messages SET read_at=?,delivered_at=COALESCE(delivered_at,?)
                            WHERE recipient_id=? AND sender_id=? AND id<=? AND read_at IS NULL''',
                         (t,t,u['id'],other_id,up_to))
        suppress=is_restricted(c,u['id'],other_id) or not u['show_receipts']
    if cursor.rowcount and not suppress:
        await hub.user(other_id,'read',by=u['id'],at=t,up_to=up_to)
    if cursor.rowcount:
        await hub.user(u['id'],'friends-updated')
    return {'ok':True}


PRIVATE_CHAT_NOTICE = 'Bạn có tin nhắn mới.'
LEGACY_CHAT_NOTICE_PATTERNS = ('Tin nhắn từ %: %', 'Tin nhắn hẹn giờ từ %: %')


@app.get('/api/notifications')
async def get_notifications(request:Request):
    u=current_user(request)
    with db() as c:
        # During a rolling deploy the previous process can still write a legacy preview.
        rows=many(c,'''SELECT id,created_at,read_at,
                       CASE WHEN body LIKE ? OR body LIKE ? THEN ? ELSE body END AS body
                       FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 80''',
                  (*LEGACY_CHAT_NOTICE_PATTERNS,PRIVATE_CHAT_NOTICE,u['id']))
    return {'notifications':rows}



# Persistent, atomic rate limiting for guest-to-admin support. Unlike RATE_BUCKETS,
# these counters survive Render restarts and are shared across workers via Neon.
def support_limit(c, request: Request, scope: str, identity: str, limit: int, window: int):
    salt = one(c, "SELECT value FROM settings WHERE key='support_rate_salt'")['value']
    fingerprint = hmac.new(salt.encode(), identity.encode(), hashlib.sha256).hexdigest()
    key = f'{scope}:{fingerprint}'
    current = now()
    bucket_start = current - current % window
    # Atomic UPSERT ensures simultaneous requests cannot both pass the final slot.
    # Rows are reset in the next fixed window without a background scheduler.
    result = c.execute('''INSERT INTO support_rate_limits(bucket_key,window_start,hits)
                          VALUES(?,?,1)
                          ON CONFLICT(bucket_key) DO UPDATE SET
                            window_start=excluded.window_start,
                            hits=CASE WHEN support_rate_limits.window_start=excluded.window_start
                                      THEN support_rate_limits.hits+1 ELSE 1 END
                          WHERE support_rate_limits.window_start!=excluded.window_start
                             OR support_rate_limits.hits < ?
                          RETURNING hits''', (key,bucket_start,limit)).fetchone()
    if not result:
        retry = max(1, bucket_start + window - current)
        raise HTTPException(429, 'Bạn đang gửi quá nhiều yêu cầu tới admin. Vui lòng thử lại sau.',
                            headers={'Retry-After': str(retry)})
    # Gradually remove dormant fingerprints; never store the original IP address.
    if secrets.randbelow(100) == 0:
        c.execute('DELETE FROM support_rate_limits WHERE window_start < ?', (current-2*86400,))


def support_peer(request: Request) -> str:
    # Use the TCP peer, not untrusted X-Forwarded-For headers supplied by clients.
    return request.client.host if request.client else 'unknown'


# --- Admin-operated guest support & secure one-time resets ---
class CreateTicket(BaseModel):
    kind:Literal['username','password','pin','other']
    claim:str=Field(default='',max_length=160)


def support_paused(c, *, lock=False):
    suffix=' FOR UPDATE' if POSTGRES_MODE and lock else ''
    row=one(c,"SELECT value FROM settings WHERE key='support_intake_paused'"+suffix)
    return bool(row and row['value']=='1')


def lock_support_write(c):
    if not POSTGRES_MODE:
        c.execute('BEGIN IMMEDIATE')


def support_ticket(c,tid,*,guest_id=None,owner_id=None,lock=False):
    query="SELECT * FROM tickets WHERE id=? AND status<>'deleted'"
    values=(tid,)
    # Authenticated owners can inspect the same ticket on web and native.
    # Guests remain restricted to their secure cookie; owner_id is server-derived.
    if guest_id is not None and owner_id is not None:
        query+=' AND (guest_id=? OR owner_id=?)'
        values+=(guest_id,owner_id)
    elif guest_id is not None:
        query+=' AND guest_id=?'
        values+=(guest_id,)
    elif owner_id is not None:
        query+=' AND owner_id=?'
        values+=(owner_id,)
    if POSTGRES_MODE and lock:query+=' FOR UPDATE'
    ticket=one(c,query,values)
    if not ticket:raise HTTPException(404,'Không tìm thấy cuộc trò chuyện hỗ trợ.')
    return ticket


@app.post('/api/support/tickets')
async def create_ticket(request:Request,body:CreateTicket):
    throttle(request, 'ticket-new', 8, 3600)
    u=current_user(request,False)
    with db() as c:
        lock_support_write(c)
        if support_paused(c,lock=True):
            raise HTTPException(503,{'code':'support_paused',
                'message':'Trung tâm hỗ trợ đang tạm ngừng nhận phiếu mới.'})
        # Guest IDs are cookie-scoped, so apply a second, wider cap to the network peer.
        support_identity=f'member:{u["id"]}' if u else request.state.gid
        support_limit(c,request,'ticket-create-guest-minute',support_identity,1,60)
        support_limit(c,request,'ticket-create-guest-hour',support_identity,3,3600)
        support_limit(c,request,'ticket-create-peer-hour',support_peer(request),24,3600)
        if u:
            open_count=one(c,"SELECT COUNT(*) AS n FROM tickets WHERE owner_id=? AND status='open'",
                           (u['id'],))['n']
        else:
            open_count=one(c,"SELECT COUNT(*) AS n FROM tickets WHERE guest_id=? AND status='open'",
                           (request.state.gid,))['n']
        if open_count>=2:
            raise HTTPException(429,'Bạn đã có 2 phiếu hỗ trợ đang mở. Vui lòng sử dụng phiếu hiện tại.',
                                headers={'Retry-After':'300'})
        cursor=c.execute('INSERT INTO tickets(guest_id,owner_id,kind,claim,created_at) VALUES(?,?,?,?,?)',
                         (request.state.gid,u['id'] if u else None,body.kind,body.claim.strip(),now()))
        tid=cursor.lastrowid
    await hub.admins('support-updated',ticket_id=tid,new_request=True)
    return {'id':tid}


@app.get('/api/support/tickets')
async def list_my_tickets(request:Request):
    u=current_user(request,False)
    with db() as c:
        if u:
            tickets=many(c,'''SELECT id,kind,claim,status,created_at FROM tickets
                              WHERE (guest_id=? OR owner_id=?) AND status<>'deleted'
                              ORDER BY id DESC LIMIT 30''',(request.state.gid,u['id']))
        else:
            tickets=many(c,'''SELECT id,kind,claim,status,created_at FROM tickets
                              WHERE guest_id=? AND status<>'deleted' ORDER BY id DESC LIMIT 30''',
                         (request.state.gid,))
        return {'tickets':tickets,'paused':support_paused(c)}


@app.get('/api/support/tickets/{tid}/messages')
async def my_ticket_messages(request:Request,tid:int):
    u=current_user(request,False)
    with db() as c:
        ticket=support_ticket(c,tid,guest_id=request.state.gid,
                              owner_id=u['id'] if u else None)
        return {'status':ticket['status'],'messages':many(c,'SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id',(tid,))}


class SupportMessage(BaseModel):
    body:str=Field(min_length=1,max_length=1500)


@app.post('/api/support/tickets/{tid}/messages')
async def send_ticket_message(request:Request,tid:int,body:SupportMessage):
    throttle(request, 'ticket-message', 40, 300)
    message=body.body.strip()
    if not message:
        raise HTTPException(422,'Tin nhắn không được để trống.')
    u=current_user(request,False)
    with db() as c:
        lock_support_write(c)
        r=support_ticket(c,tid,guest_id=request.state.gid,
                         owner_id=u['id'] if u else None,lock=True)
        if r['status']!='open':raise HTTPException(403,'Yêu cầu đã đóng.')
        current=now()
        last=one(c,'''SELECT body,created_at FROM ticket_messages
                      WHERE ticket_id=? AND from_admin=0 ORDER BY id DESC LIMIT 1''',(tid,))
        if last and current-last['created_at'] < 4:
            raise HTTPException(429,'Hãy đợi 4 giây trước khi gửi tin tiếp theo.',
                                headers={'Retry-After':str(max(1,4-(current-last['created_at'])))})
        normalized=lambda value: re.sub(r'\s+',' ',value.strip()).casefold()
        if last and current-last['created_at'] < 60 and normalized(last['body'])==normalized(message):
            raise HTTPException(429,'Tin nhắn trùng nội dung vừa gửi. Không cần gửi lại.',
                                headers={'Retry-After':str(max(1,60-(current-last['created_at'])))})
        support_limit(c,request,'ticket-message-minute',str(tid),6,60)
        support_identity=f'member:{u["id"]}' if u else request.state.gid
        support_limit(c,request,'ticket-message-guest-ten',support_identity,25,600)
        support_limit(c,request,'ticket-message-guest-day',support_identity,100,86400)
        support_limit(c,request,'ticket-message-peer-ten',support_peer(request),90,600)
        support_limit(c,request,'ticket-message-peer-day',support_peer(request),300,86400)
        cur=c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,0,?,?)',
                      (tid,message,current))
        msg={'id':cur.lastrowid,'ticket_id':tid,'from_admin':0,'body':message,'created_at':current}
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
        lock_support_write(c)
        key=digest(body.code.strip())
        grant=one(c,'SELECT ticket_id FROM recovery_grants WHERE token_hash=?',(key,))
        invalid='Mã khôi phục không hợp lệ hoặc đã hết hạn.'
        if not grant:raise HTTPException(403,invalid)
        try:
            support_ticket(c,grant['ticket_id'],guest_id=request.state.gid,lock=True)
        except HTTPException as error:
            raise HTTPException(403,invalid) from error
        r=one(c,'SELECT * FROM recovery_grants WHERE token_hash=?',(key,))
        if not r or r['expires_at']<now() or r['used_at']:
            raise HTTPException(403,invalid)
        if r['kind']=='password':
            ensure_password(body.new_value)
            c.execute('UPDATE users SET password_hash=? WHERE id=?',(hash_secret(body.new_value),r['user_id']))
        elif r['kind']=='pin':
            ensure_pin(body.new_value,body.pin_length or 0)
            c.execute('UPDATE users SET pin_hash=?,pin_length=? WHERE id=?',
                      (hash_secret(body.new_value),body.pin_length,r['user_id']))
        else:raise HTTPException(400,'Loại khôi phục không được hỗ trợ.')
        c.execute('UPDATE recovery_grants SET used_at=? WHERE token_hash=?',(now(),key))
        c.execute('DELETE FROM sessions WHERE user_id=?',(r['user_id'],))
        c.execute('DELETE FROM trusted_devices WHERE user_id=?',(r['user_id'],))
    await hub.user(r['user_id'],'session-ended',reason='Thông tin xác minh vừa được thay đổi.')
    await hub.terminate_user(r['user_id'])
    return {'ok':True}


# --- Administrative controls ---
def admin_online_members(c):
    """Summarize current sockets backed by an active member session."""
    socket_counts = defaultdict(int)
    for session_hash in hub.session_hashes.values():
        socket_counts[session_hash] += 1
    hashes = list(socket_counts)
    members = {}
    at = now()
    for offset in range(0, len(hashes), 250):
        batch = hashes[offset:offset + 250]
        marks = ','.join('?' for _ in batch)
        sessions = many(c, f"""SELECT s.token_hash,s.last_seen,u.id,u.public_id,u.username,u.display_name
                               FROM sessions s JOIN users u ON u.id=s.user_id
                               WHERE s.token_hash IN ({marks}) AND s.expires_at>?
                               AND u.is_admin=0 AND u.needs_display_name=0
                               AND (u.sanction_kind IS NULL OR u.sanction_until<=?)
                               AND NOT EXISTS (SELECT 1 FROM account_deletion_requests d WHERE d.user_id=u.id)""",
                        (*batch, at, at))
        for row in sessions:
            member = members.setdefault(row['id'], {
                'id': row['id'], 'public_id': row['public_id'], 'username': row['username'],
                'display_name': row['display_name'], 'sessions': 0, 'connections': 0, 'last_seen': 0,
            })
            member['sessions'] += 1
            member['connections'] += socket_counts[row['token_hash']]
            member['last_seen'] = max(member['last_seen'], row['last_seen'] or 0)
    return sorted(members.values(), key=lambda member: (-member['last_seen'], member['id']))


@app.get('/api/admin/online-users')
async def admin_online_users(request: Request):
    require_admin(request)
    with db() as c:
        members = admin_online_members(c)
    return {'users': members, 'total': len(members), 'checked_at': now()}


@app.get('/api/admin/stats')
async def admin_stats(request:Request):
    require_admin(request)
    with db() as c:
        total,reserved,maximum=registration_capacity(c)
        deletion_pending = one(c,'SELECT count(*) n FROM account_deletion_requests')['n']
        return {'total_users':total,'reserved_slots':reserved,'max_users':maximum,
          'deletion_pending':deletion_pending,
          'pending':one(c,"SELECT count(*) n FROM registrations WHERE status='pending'")['n'],
          'tickets':one(c,"SELECT count(*) n FROM tickets WHERE status='open'")['n'],
          'messages':one(c,'SELECT count(*) n FROM messages')['n']+one(c,'SELECT count(*) n FROM group_messages')['n'],
          'groups':one(c,'SELECT count(*) n FROM chat_groups')['n'],
          'online':len(admin_online_members(c))}


@app.get('/api/admin/registrations')
async def admin_registrations(request:Request):
    require_admin(request)
    with db() as c:return {'registrations':many(c,"SELECT id,username,status,created_at,phone,email FROM registrations WHERE status IN ('pending','approved','denied') ORDER BY id DESC LIMIT 100")}


class Decision(BaseModel):
    admin_pin:str=Field(default='',max_length=6)
    approve:bool


@app.post('/api/admin/registrations/{rid}/decision')
async def admin_decision(request:Request,rid:int,body:Decision):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
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
    admin_pin:str=Field(default='',max_length=6)


@app.post('/api/admin/capacity')
async def set_capacity(request:Request,body:Capacity):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        total,reserved,_=registration_capacity(c)
        if body.max_users<total+reserved:
            raise HTTPException(409,'Giới hạn mới không thể ít hơn số tài khoản và lượt đã phê duyệt.')
        c.execute("UPDATE settings SET value=? WHERE key='max_users'",(str(body.max_users),))
        admin_log(c,admin['id'],'capacity',str(body.max_users))
    return {'ok':True}


@app.get('/api/admin/users')
async def admin_users(request:Request,q:str=Query('',max_length=120),
                      status:Literal['all','active','locked','banned','pending_deletion']='all',
                      sort:Literal['newest','oldest','name','activity']='oldest',
                      limit:int=Query(50,ge=1,le=100),offset:int=Query(0,ge=0,le=100000)):
    require_admin(request)
    query=q.strip()
    conditions=['u.is_admin=0']
    args=[]
    if query:
        needle='%'+query.lower().replace('!','!!').replace('%','!%').replace('_','!_')+'%'
        conditions.append("""(LOWER(u.username) LIKE ? ESCAPE '!' OR LOWER(COALESCE(u.display_name,'')) LIKE ? ESCAPE '!'
                            OR LOWER(COALESCE(u.email,'')) LIKE ? ESCAPE '!' OR COALESCE(u.phone,'') LIKE ? ESCAPE '!'
                            OR u.id=? OR u.public_id=? OR u.phone=?)""")
        identity=query.removeprefix('#')
        numeric=int(identity) if identity.isascii() and identity.isdigit() and len(identity)<=18 else -1
        phone=''
        if re.fullmatch(r'[+0-9(). -]+',query):
            try:
                phone=normalize_phone(query)
            except HTTPException:
                pass
        args.extend((needle,needle,needle,needle,numeric,numeric,phone))
    if status in ('locked','banned'):
        conditions.append('u.sanction_kind=? AND (u.sanction_until IS NULL OR u.sanction_until>?)')
        args.extend(('lock' if status=='locked' else 'ban',now()))
    elif status=='active':
        conditions.append('(u.sanction_kind IS NULL OR u.sanction_until<=?) AND d.purge_at IS NULL')
        args.append(now())
    elif status=='pending_deletion':
        conditions.append('d.purge_at IS NOT NULL')
    source=' FROM users u LEFT JOIN account_deletion_requests d ON d.user_id=u.id'
    predicate=' WHERE '+' AND '.join(conditions)
    # Join live session activity as well as the disconnect-time user timestamp.
    active_sessions=''' LEFT JOIN (
        SELECT user_id, MAX(last_seen) AS last_seen
        FROM sessions WHERE expires_at>? GROUP BY user_id
    ) recent ON recent.user_id=u.id'''
    last_active='''CASE WHEN COALESCE(u.last_seen,0)>=COALESCE(recent.last_seen,0)
                   THEN u.last_seen ELSE recent.last_seen END'''
    with db() as c:
        total=one(c,'SELECT COUNT(*) n'+source+predicate,args)['n']
        # Only validated connected WebSockets count as online, not old logins.
        online_ids={int(user['id']) for user in admin_online_members(c)}
        online_rank=('CASE WHEN u.id IN ('+','.join(str(uid) for uid in sorted(online_ids))
                     +') THEN 0 ELSE 1 END,' if online_ids else '')
        order={'newest':'u.created_at DESC,u.id DESC','oldest':'u.created_at,u.id',
               'name':"LOWER(COALESCE(NULLIF(u.display_name,''),u.username)),u.id",
               'activity':online_rank+'last_active_at DESC NULLS LAST,u.id DESC'}[sort]
        rows=many(c,"""SELECT u.id,u.public_id,u.username,u.display_name,u.phone,u.email,
                            u.created_at,u.last_seen,u.pin_length,u.sanction_kind,u.sanction_until,u.sanction_reason,
                            d.requested_at AS deletion_requested_at,d.purge_at AS deletion_purge_at,
                            """+last_active+""" AS last_active_at,
                            (SELECT COUNT(*) FROM messages m WHERE m.sender_id=u.id OR m.recipient_id=u.id) AS message_count,
                            (SELECT COUNT(*) FROM friendships f WHERE f.state='accepted' AND (f.u1=u.id OR f.u2=u.id)) AS friend_count"""
                  +source+active_sessions+predicate+' ORDER BY '+order+' LIMIT ? OFFSET ?',
                  (now(),*args,limit,offset))
        for user in rows:
            user['online']=user['id'] in online_ids
    return {'users':rows,'total':total,'offset':offset,'limit':limit,'checked_at':now()}


class Sanction(BaseModel):
    kind:Literal['ban','lock','unban']
    minutes:int|None=Field(default=None,ge=1,le=5256000)
    seconds:int|None=Field(default=None,ge=1,le=157680000)
    reason:str=Field(default='',max_length=250)
    admin_pin:str=Field(default='',max_length=6)


@app.get('/api/admin/users/{uid}/details')
async def admin_user_details(request:Request,uid:int):
    admin=require_admin(request)
    throttle(request,'admin-user-details',90,3600,str(admin['id']))
    with db() as c:
        user=one(c,'''SELECT u.id,u.username,u.display_name,u.bio,u.phone,u.email,
                     u.created_at,u.last_seen,u.show_online,u.show_receipts,
                     u.sanction_kind,u.sanction_until,u.sanction_reason,
                     d.requested_at AS deletion_requested_at,d.purge_at AS deletion_purge_at
                     FROM users u LEFT JOIN account_deletion_requests d ON d.user_id=u.id
                     WHERE u.id=? AND u.is_admin=0''',(uid,))
        if not user:
            raise HTTPException(404,'Không tìm thấy tài khoản người dùng.')
        detail=dict(user)
        detail['friend_count']=one(c,"SELECT count(*) n FROM friendships WHERE state='accepted' AND (u1=? OR u2=?)",(uid,uid))['n']
        detail['message_count']=one(c,'SELECT count(*) n FROM messages WHERE sender_id=? OR recipient_id=?',(uid,uid))['n']
        detail['group_count']=one(c,'SELECT count(*) n FROM group_members WHERE user_id=?',(uid,))['n']
        detail['file_count']=one(c,'SELECT count(*) n FROM attachments WHERE owner_id=?',(uid,))['n']
        detail['session_count']=one(c,'SELECT count(*) n FROM sessions WHERE user_id=? AND expires_at>?',(uid,now()))['n']
        detail['remembered_count']=one(c,'SELECT count(*) n FROM trusted_devices WHERE user_id=? AND expires_at>?',(uid,now()))['n']
        # Never expose passwords, PIN, secret hashes, or session/recovery tokens.
        admin_log(c,admin['id'],'admin_view_user_details',f'user_id={uid}')
    return {'user':detail}


@app.get('/api/admin/users/{uid}/session-security')
async def admin_user_session_security(request:Request,uid:int):
    """Admin-only, audited review of connection IP and optional GeoIP hints."""
    admin=require_admin(request)
    throttle(request,'admin-session-security',30,3600,str(admin['id']))
    with db() as c:
        target=one(c,'SELECT id,username FROM users WHERE id=? AND is_admin=0',(uid,))
        if not target:
            raise HTTPException(404,'Không tìm thấy người dùng.')
        fields=('device_label,device_name,device_type,browser,os_name,'
                'ip_address,network_hint,location_hint,created_at,last_seen,expires_at')
        sessions=many(c,f'''SELECT {fields} FROM sessions
                          WHERE user_id=? AND expires_at>?
                          ORDER BY created_at DESC LIMIT 30''',(uid,now()))
        devices=many(c,f'''SELECT {fields} FROM trusted_devices
                         WHERE user_id=? AND expires_at>?
                         ORDER BY created_at DESC LIMIT 30''',(uid,now()))
        # Audit metadata access; never log the network/location values themselves.
        admin_log(c,admin['id'],'admin_view_session_security',
                  f'user_id={uid}; sessions={len(sessions)}; remembered={len(devices)}')
    return {'user_id':uid,'username':target['username'],
            'sessions':sessions,'remembered_devices':devices}

@app.post('/api/admin/users/{uid}/sanction')
async def admin_sanction(request:Request,uid:int,body:Sanction):
    admin=require_admin(request)
    if body.kind=='lock' and not (body.seconds or body.minutes):
        raise HTTPException(422, 'Khóa tạm thời cần có thời hạn cụ thể.')
    if body.kind!='unban' and len(body.reason.strip())<5:
        raise HTTPException(422,'Phải ghi rõ lý do xử lý tối thiểu 5 ký tự.')
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        u=one(c,'SELECT * FROM users WHERE id=? AND is_admin=0',(uid,))
        if not u:raise HTTPException(404,'Không tìm thấy tài khoản.')
        kind=None if body.kind=='unban' else body.kind
        duration=body.seconds if body.seconds is not None else body.minutes*60 if body.minutes else None
        expiry=(now()+duration) if kind and duration else None
        c.execute('UPDATE users SET sanction_kind=?,sanction_until=?,sanction_reason=? WHERE id=?',
                  (kind,expiry,body.reason.strip() if kind else None,uid))
        if kind:
            c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
            c.execute('DELETE FROM trusted_devices WHERE user_id=?',(uid,))
        admin_log(c,admin['id'],'sanction_'+body.kind,f"user_id={uid}; reason={body.reason.strip()[:180]}; seconds={duration}")
    if kind:
        await hub.user(uid,'account-sanction',kind=kind,until=expiry,reason=body.reason)
        await hub.terminate_user(uid)
    return {'ok':True}


@app.get('/api/admin/users/{uid}/friends')
async def admin_user_friends(request:Request,response:Response,uid:int,
                             offset:int=Query(0,ge=0,le=1000000),limit:int=Query(40,ge=1,le=100)):
    admin=require_admin(request)
    with db() as c:
        member=one(c,'SELECT username,display_name FROM users WHERE id=? AND is_admin=0',(uid,))
        if not member:raise HTTPException(404,'Không tìm thấy tài khoản.')
        counts=one(c,'''SELECT COUNT(*) AS total,
                         COUNT(CASE WHEN state='accepted' THEN 1 END) AS accepted
                         FROM friendships WHERE u1=? OR u2=?''',(uid,uid))
        rows=many(c,'''SELECT u.id,u.public_id,u.username,u.display_name,u.last_seen,
                             f.state,f.requested_by,f.created_at
                      FROM friendships f JOIN users u ON u.id=CASE WHEN f.u1=? THEN f.u2 ELSE f.u1 END
                      WHERE f.u1=? OR f.u2=?
                      ORDER BY CASE WHEN f.state='accepted' THEN 0 ELSE 1 END,
                               f.created_at DESC,u.id
                      LIMIT ? OFFSET ?''',(uid,uid,uid,limit,offset))
        admin_log(c,admin['id'],'admin_view_user_friends',f"user_id={uid}; username={member['username']}; offset={offset}")
    response.headers['Cache-Control']='no-store'
    return {'user':dict(member),'friends':rows,'counts':dict(counts),
            'next_offset':offset+limit if offset+limit<counts['total'] else None}


@app.get('/api/admin/users/{uid}/messages')
async def admin_user_messages(request:Request,response:Response,uid:int,peer_id:int|None=Query(None,ge=1),
                              before:int=Query(9223372036854775807,ge=1,le=9223372036854775807),
                              limit:int=Query(100,ge=1,le=100)):
    admin=require_admin(request)
    with db() as c:
        member=one(c,'SELECT username,display_name FROM users WHERE id=? AND is_admin=0',(uid,))
        if not member:raise HTTPException(404,'Không tìm thấy tài khoản.')
        peer=None
        if peer_id is not None:
            peer=one(c,'SELECT username,display_name FROM users WHERE id=? AND id<>? AND is_admin=0',(peer_id,uid))
            if not peer:raise HTTPException(404,'Không tìm thấy người trò chuyện.')
            pair_filter='((m.sender_id=? AND m.recipient_id=?) OR (m.recipient_id=? AND m.sender_id=?))'
            pair_params=(uid,peer_id,uid,peer_id)
        else:
            pair_filter='(m.sender_id=? OR m.recipient_id=?)'
            pair_params=(uid,uid)
        rows=many(c,f'''SELECT m.id,m.sender_id,m.recipient_id,s.username sender,r.username recipient,
                              m.body,m.created_at,m.read_at,m.attachment_id,a.original_name attachment_name,a.mime AS attachment_mime,
                              m.deleted_at
                       FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
                       LEFT JOIN attachments a ON a.id=m.attachment_id
                       WHERE {pair_filter} AND m.id<?
                         AND (m.expires_at IS NULL OR m.expires_at>?)
                         AND m.deleted_at IS NULL
                       ORDER BY m.id DESC LIMIT ?''',(*pair_params,before,now(),limit+1))
        admin_log(c,admin['id'],'moderation_messages',
                  f"user_id={uid}; username={member['username']}; peer_id={peer_id or 'all'}; before={before}")
    response.headers['Cache-Control']='no-store'
    return {'user':dict(member),'peer':dict(peer) if peer else None,'messages':rows[:limit],
            'next_before':rows[limit-1]['id'] if len(rows)>limit else None}


@app.get('/api/admin/tickets')
async def admin_tickets(request:Request):
    require_admin(request)
    with db() as c:
        return {'tickets':many(c,"SELECT * FROM tickets WHERE status<>'deleted' ORDER BY id DESC LIMIT 120"),
                'paused':support_paused(c)}


@app.get('/api/admin/tickets/{tid}/messages')
async def admin_ticket_messages(request:Request,tid:int):
    require_admin(request)
    with db() as c:
        support_ticket(c,tid)
        return {'messages':many(c,'SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id',(tid,))}


class SupportIntakeIn(BaseModel):
    paused:bool
    admin_pin:str=Field(default='',max_length=6)


@app.patch('/api/admin/support/intake')
async def set_support_intake(request:Request,body:SupportIntakeIn):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        lock_support_write(c)
        if support_paused(c,lock=True)!=body.paused:
            c.execute("UPDATE settings SET value=? WHERE key='support_intake_paused'",
                      ('1' if body.paused else '0',))
            admin_log(c,admin['id'],'support_intake','paused' if body.paused else 'open')
    await hub.admins('support-updated')
    return {'paused':body.paused}


class DeleteSupportTicketIn(BaseModel):
    admin_pin:str=Field(default='',max_length=6)


@app.delete('/api/admin/tickets/{tid}')
async def delete_support_ticket(request:Request,tid:int,body:DeleteSupportTicketIn):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        lock_support_write(c)
        ticket=support_ticket(c,tid,lock=True)
        if ticket['status'] not in ('closed','spam'):
            raise HTTPException(409,'Hãy đóng phiếu trước khi xóa cuộc trò chuyện.')
        c.execute('DELETE FROM recovery_grants WHERE ticket_id=?',(tid,))
        c.execute('DELETE FROM ticket_messages WHERE ticket_id=?',(tid,))
        # Keep the identifier so SQLite does not issue it to a different ticket.
        c.execute("UPDATE tickets SET status='deleted',guest_id='',owner_id=NULL,claim='',kind='other',created_at=0 WHERE id=?",(tid,))
        admin_log(c,admin['id'],'support_delete',f'ticket_id={tid}')
    await hub.guest(ticket['guest_id'],'support-deleted',ticket_id=tid)
    if ticket['owner_id']:
        await hub.user(ticket['owner_id'],'support-deleted',ticket_id=tid)
    await hub.admins('support-updated',ticket_id=tid)
    return {'ok':True}


@app.post('/api/admin/tickets/{tid}/messages')
async def admin_send_ticket(request:Request,tid:int,body:SupportMessage):
    admin=require_admin(request)
    throttle(request,'admin-support-reply',90,60,str(admin['id']))
    message=body.body.strip()
    if not message:
        raise HTTPException(422,'Tin nhắn không được để trống.')
    with db() as c:
        lock_support_write(c)
        t=support_ticket(c,tid,lock=True)
        if t['status']!='open':raise HTTPException(409,'Hãy mở lại phiếu trước khi trả lời.')
        cur=c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,1,?,?)',
                      (tid,message,now()))
        msg={'id':cur.lastrowid,'ticket_id':tid,'from_admin':1,'body':message,'created_at':now()}
        admin_log(c,admin['id'],'support_reply',str(tid))
    await hub.guest(t['guest_id'],'support-message',ticket_id=tid,message=msg)
    if t['owner_id']:
        await hub.user(t['owner_id'],'support-message',ticket_id=tid,message=msg)
    return {'message':msg}


class RecoveryGrantIn(BaseModel):
    username:str
    verified:bool=False
    admin_pin:str=Field(default='',max_length=6)


@app.post('/api/admin/tickets/{tid}/grant')
async def admin_grant(request:Request,tid:int,body:RecoveryGrantIn):
    admin=require_admin(request)
    if not body.verified:
        raise HTTPException(422,'Admin phải xác nhận đã kiểm tra danh tính qua kênh độc lập.')
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    username=norm_username(body.username)
    with db() as c:
        lock_support_write(c)
        t=support_ticket(c,tid,lock=True)
        u=one(c,'SELECT * FROM users WHERE username=? AND is_admin=0',(username,))
        if not u or t['kind'] not in ('password','pin'):
            raise HTTPException(400,'Chỉ yêu cầu quên mật khẩu hoặc PIN mới có thể cấp mã.')
        if t['status']!='open':raise HTTPException(409,'Phiếu hỗ trợ đã đóng.')
        raw=secrets.token_urlsafe(12)
        c.execute('INSERT INTO recovery_grants(token_hash,ticket_id,user_id,kind,expires_at) VALUES(?,?,?,?,?)',
                  (digest(raw),tid,u['id'],t['kind'],now()+15*60))
        note=f'Mã đặt lại {"mật khẩu" if t["kind"]=="password" else "PIN"} (dùng 1 lần, hiệu lực 15 phút): {raw}. Nhập mã ở mục Khôi phục bên dưới.'
        c.execute('INSERT INTO ticket_messages(ticket_id,from_admin,body,created_at) VALUES(?,1,?,?)',(tid,note,now()))
        admin_log(c,admin['id'],'issue_recovery',f'ticket={tid}, account={username}, type={t["kind"]}')
    await hub.guest(t['guest_id'],'support-updated',ticket_id=tid)
    if t['owner_id']:
        await hub.user(t['owner_id'],'support-updated',ticket_id=tid)
    return {'ok':True}


class TicketClose(BaseModel):
    admin_pin:str=Field(default='',max_length=6)
    status:Literal['open','closed','spam']


@app.post('/api/admin/tickets/{tid}/status')
async def admin_ticket_status(request:Request,tid:int,body:TicketClose):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        lock_support_write(c)
        t=support_ticket(c,tid,lock=True)
        c.execute('UPDATE tickets SET status=? WHERE id=?',(body.status,tid))
        admin_log(c,admin['id'],'support_mark_spam' if body.status=='spam' else 'ticket_status',f'{tid}: {body.status}')
    await hub.guest(t['guest_id'],'support-updated',ticket_id=tid)
    if t['owner_id']:
        await hub.user(t['owner_id'],'support-updated',ticket_id=tid)
    return {'ok':True}


class Broadcast(BaseModel):
    body:str=Field(min_length=1,max_length=500)
    admin_pin:str=Field(default='',max_length=6)


@app.post('/api/admin/broadcast')
async def admin_broadcast(request:Request,body:Broadcast):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    with db() as c:
        ids=[r['id'] for r in c.execute('SELECT id FROM users WHERE is_admin=0')]
        for uid in ids:
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',(uid,body.body.strip(),now()))
        admin_log(c,admin['id'],'broadcast',body.body.strip())
    for uid in ids:
        await hub.user(uid,'announcement',body=body.body.strip())
    return {'ok':True,'recipients':len(ids)}


# Security events are intentionally append-only. A privileged administrator can
# inspect/export them, but cannot alter or erase evidence through the web API.
AUDIT_HIGH_RISK = {
    'maintenance_mode', 'admin_cancel_account_deletion', 'maintenance_member_reset', 'permanent_user_delete', 'issue_recovery', 'admin_stepup_denied',
    'admin_revoke_user_sessions', 'admin_edit_user', 'enable_admin_pin', 'support_delete',
    'sanction_ban', 'sanction_lock', 'admin_password_change',
}
AUDIT_MEDIUM_RISK = {
    'sanction_unban', 'broadcast', 'capacity', 'registration_denied',
    'admin_view_user_details', 'admin_view_user_friends', 'moderation_messages', 'moderation_group',
}

def enrich_audit(row):
    item = dict(row)
    action = item['action']
    item['severity'] = ('high' if action in AUDIT_HIGH_RISK
                        else 'medium' if action in AUDIT_MEDIUM_RISK else 'info')
    item['admin_username'] = item.get('admin_username') or 'Tài khoản quản trị đã xóa'
    return item


@app.get('/api/admin/audit')
async def admin_audit(request:Request, limit:int=100, offset:int=0,
                      q:str='', action:str='', since:int=0, until:int=0):
    admin=require_admin(request)
    throttle(request,'admin-audit-list',120,3600,str(admin['id']))
    if not 1<=limit<=100 or not 0<=offset<=100000 or len(q)>100 or len(action)>80:
        raise HTTPException(422,'Bộ lọc nhật ký không hợp lệ.')
    if since<0 or until<0 or (since and until and since>until):
        raise HTTPException(422,'Khoảng thời gian không hợp lệ.')
    conditions=['1=1']
    args=[]
    if q.strip():
        conditions.append('(a.action LIKE ? OR a.detail LIKE ? OR u.username LIKE ?)')
        needle='%'+q.strip()+'%'
        args.extend((needle,needle,needle))
    if action.strip():
        conditions.append('a.action=?')
        args.append(action.strip())
    if since:
        conditions.append('a.created_at>=?')
        args.append(since)
    if until:
        conditions.append('a.created_at<=?')
        args.append(until)
    where=' AND '.join(conditions)
    with db() as c:
        total=one(c,'''SELECT COUNT(*) n FROM audit a
                         LEFT JOIN users u ON u.id=a.admin_id
                         WHERE '''+where,tuple(args))['n']
        rows=many(c,'''SELECT a.id,a.admin_id,a.action,a.detail,a.created_at,
                              u.username admin_username
                       FROM audit a LEFT JOIN users u ON u.id=a.admin_id
                       WHERE '''+where+''' ORDER BY a.id DESC LIMIT ? OFFSET ?''',
                  tuple(args)+(limit,offset))
    return {'logs':[enrich_audit(x) for x in rows],
            'total':total,'limit':limit,'offset':offset,
            'has_more':offset+len(rows)<total}


@app.get('/api/admin/audit/{event_id}')
async def admin_audit_detail(request:Request,event_id:int):
    admin=require_admin(request)
    throttle(request,'admin-audit-detail',90,3600,str(admin['id']))
    with db() as c:
        row=one(c,'''SELECT a.id,a.admin_id,a.action,a.detail,a.created_at,
                            u.username admin_username
                     FROM audit a LEFT JOIN users u ON u.id=a.admin_id
                     WHERE a.id=?''',(event_id,))
        if not row:
            raise HTTPException(404,'Không tìm thấy sự kiện quản trị.')
        result=enrich_audit(row)
        admin_log(c,admin['id'],'audit_detail_view',f'event_id={event_id}')
    return {'event':result}


class AdminUserEdit(BaseModel):
    display_name:str=Field(default='',max_length=50)
    bio:str=Field(default='',max_length=220)
    phone:str=Field(min_length=0,max_length=40)
    email:str=Field(default='',max_length=254)
    reason:str=Field(min_length=5,max_length=250)
    admin_pin:str=Field(default='',max_length=6)


@app.post('/api/admin/users/{uid}/edit')
async def admin_edit_user(request:Request,uid:int,body:AdminUserEdit):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    throttle(request,'admin-edit-user',30,3600,str(admin['id']))
    phone=normalize_phone(body.phone)
    email=normalize_email(body.email)
    with db() as c:
        user=one(c,'SELECT id,username FROM users WHERE id=? AND is_admin=0',(uid,))
        if not user:
            raise HTTPException(404,'Không tìm thấy người dùng hợp lệ.')
        if one(c,'SELECT id FROM users WHERE phone=? AND id!=?',(phone,uid)):
            raise HTTPException(409,'Số điện thoại này đang được sử dụng bởi tài khoản khác.')
        c.execute('''UPDATE users SET display_name=?,bio=?,phone=?,email=?
                     WHERE id=? AND is_admin=0''',
                  (body.display_name.strip(),body.bio.strip(),phone,email,uid))
        # Never write phone, email, passwords, PIN or profile content into audit.
        admin_log(c,admin['id'],'admin_edit_user',
                  f'user_id={uid}; fields=display_name,bio,phone,email; justification=provided')
    await hub.user(uid,'profile-updated')
    return {'ok':True,'user_id':uid}


class AdminSessionRevoke(BaseModel):
    reason:str=Field(min_length=5,max_length=250)
    admin_pin:str=Field(default='',max_length=6)


@app.post('/api/admin/users/{uid}/sessions/revoke')
async def admin_revoke_user_sessions(request:Request,uid:int,body:AdminSessionRevoke):
    admin=require_admin(request)
    verify_admin_pin_stepup(request,admin,body.admin_pin)
    throttle(request,'admin-revoke-user-sessions',15,3600,str(admin['id']))
    with db() as c:
        user=one(c,'SELECT id FROM users WHERE id=? AND is_admin=0',(uid,))
        if not user:
            raise HTTPException(404,'Không tìm thấy người dùng hợp lệ.')
        sessions=one(c,'SELECT COUNT(*) n FROM sessions WHERE user_id=?',(uid,))['n']
        devices=one(c,'SELECT COUNT(*) n FROM trusted_devices WHERE user_id=?',(uid,))['n']
        c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        c.execute('DELETE FROM trusted_devices WHERE user_id=?',(uid,))
        admin_log(c,admin['id'],'admin_revoke_user_sessions',
                  f'user_id={uid}; sessions={sessions}; devices={devices}; justification=provided')
    await hub.user(uid,'session-ended',reason='Các phiên đã được quản trị viên thu hồi.')
    await hub.terminate_user(uid)
    return {'ok':True,'sessions_revoked':sessions,'devices_revoked':devices}


# --- Presence and event bus ---
async def notify_presence(uid,online,last_seen=None):
    # Deliver the precise server-side transition timestamp. Previously peers
    # received only online=False and kept displaying a stale cached last_seen.
    with db() as c:
        config=one(c,'SELECT show_online,last_seen FROM users WHERE id=?',(uid,))
        if not config or not config['show_online']:return
        stamp=int(last_seen if last_seen is not None else config['last_seen'] or 0)
        rows=many(c,"SELECT CASE WHEN u1=? THEN u2 ELSE u1 END other_id FROM friendships WHERE state='accepted' AND (u1=? OR u2=?)",(uid,uid,uid))
        targets=[r['other_id'] for r in rows if not is_restricted(c,uid,r['other_id'])]
    for other in targets:
        await hub.user(other,'presence',user_id=uid,online=bool(online),last_seen=stamp)


def socket_session_valid(c,session_hash,uid):
    row=one(c,'''SELECT u.is_admin,u.needs_display_name,u.sanction_kind,u.sanction_until
                 FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>?
                 AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=u.id)''',
            (session_hash,uid,now()))
    return bool(row and not row['needs_display_name'] and
                (not row['sanction_kind'] or row['sanction_until'] and row['sanction_until']<=now()) and
                (row['is_admin'] or not maintenance_enabled(c)))


@app.websocket('/ws')
async def websocket_events(ws:WebSocket):
    origin = ws.headers.get('origin')
    # Browsers send Origin for websocket upgrades. A public deployment refuses
    # cookie-authenticated browser connections without an origin check.
    native_token=bearer_token(ws)
    has_authorization=ws.headers.get('authorization') is not None
    cookie=ws.cookies.get('s')
    if conflicting_credentials(ws) or (has_authorization and not native_token):
        await ws.close(code=1008)
        return
    # Keep Origin enforcement for browser cookie connections. Native client
    # uses a revocable bearer session validated against the same DB.
    if PUBLIC_MODE and not origin and (cookie or not native_token):
        await ws.close(code=1008)
        return
    if origin and (cookie or not native_token):
        from urllib.parse import urlsplit
        try:
            actual = urlsplit(origin)
        except ValueError:
            await ws.close(code=1008)
            return
        expected = urlsplit(PUBLIC_ORIGIN) if PUBLIC_ORIGIN else None
        expected_scheme = expected.scheme if expected else ('https' if COOKIE_SECURE else ('https' if ws.url.scheme == 'wss' else 'http'))
        expected_host = expected.netloc if expected else ws.headers.get('host', '')
        if (actual.scheme, actual.netloc) != (expected_scheme, expected_host):
            await ws.close(code=1008)
            return
    sid=request_session_token(ws)
    gid=ws.cookies.get('g')
    if gid and (len(gid) > 100 or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',gid)):
        gid = None
    uid=None
    paused=False
    if sid:
        with db() as c:
            r=one(c,'''SELECT u.id,u.is_admin,u.sanction_kind,u.sanction_until,u.needs_display_name FROM sessions s
                       JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?
                       AND NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=u.id)''',
                  (digest(sid),now()))
            paused=(not r or not r['is_admin']) and maintenance_enabled(c)
            if not paused and r and not r['needs_display_name'] and (not r['sanction_kind'] or
                    (r['sanction_until'] and r['sanction_until']<=now())):
                uid=r['id']
    # Validate bearer sessions before upgrading the transport. Maintenance is
    # the only exception: the client needs the explicit notice before closing.
    if uid is None and has_authorization:
        if paused:
            await ws.accept()
            await hub.send([ws], {'type':'maintenance-mode'})
        await ws.close(code=1008)
        return
    if uid is None and not gid and not paused:
        await ws.close(code=1008)
        return
    await ws.accept()
    if paused:
        await hub.send([ws], {'type':'maintenance-mode'})
    if uid is not None:
        was_online=bool(hub.users.get(uid))
        hub.users[uid].add(ws)
        hub.session_hashes[ws] = digest(sid)
        if gid:hub.device_hashes[ws]=digest(gid)
        with db() as c:
            timestamp=now()
            c.execute('UPDATE sessions SET last_seen=? WHERE token_hash=? AND user_id=?',
                      (timestamp,digest(sid),uid))
            c.execute('UPDATE users SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)',
                      (timestamp,uid,timestamp))
        if not was_online:await notify_presence(uid,True,last_seen=timestamp)
    elif gid and not has_authorization:
        hub.guests[gid].add(ws)
    else:
        await ws.close(code=1008)
        return
    try:
        activity = []
        last_session_activity = now()
        last_session_check = time.monotonic()
        heartbeat_enabled = False
        while True:
            # Heartbeat-aware browser/native clients should not remain online
            # after a network drop or an OS-killed app. Legacy clients still
            # rely on WebSocket protocol keepalive for compatibility.
            try:
                raw_message = await asyncio.wait_for(
                    ws.receive_text(), timeout=PRESENCE_HEARTBEAT_TIMEOUT if heartbeat_enabled else None)
            except asyncio.TimeoutError:
                try:
                    await asyncio.wait_for(ws.close(code=1001), timeout=1)
                except (RuntimeError, OSError, asyncio.TimeoutError):
                    pass
                break
            if uid is not None:
                # A detached socket cannot act even if transport closure is delayed.
                if hub.session_hashes.get(ws)!=digest(sid):
                    await ws.close(code=1008)
                    break
                if time.monotonic()-last_session_check>=SOCKET_SESSION_RECHECK_SECONDS:
                    with db() as c:
                        valid=socket_session_valid(c,digest(sid),uid)
                    last_session_check=time.monotonic()
                    if not valid:
                        hub.detach_session(ws)
                        await ws.close(code=1008)
                        break
            if uid is not None and now() - last_session_activity >= 120:
                with db() as c:
                    timestamp=now()
                    c.execute('UPDATE sessions SET last_seen=? WHERE token_hash=? AND user_id=?',
                              (timestamp,digest(sid),uid))
                    c.execute('UPDATE users SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)',
                              (timestamp,uid,timestamp))
                last_session_activity = now()
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
            if uid is not None and msg.get('type')=='presence-heartbeat':
                heartbeat_enabled = True
                continue
            if ws in hub.session_hashes and msg.get('type')=='alert-visibility':
                if msg.get('visible') is True:hub.foreground.add(ws)
                else:hub.foreground.discard(ws)
                continue
            if uid is not None and msg.get('type')=='typing':
                other=msg.get('to')
                if not isinstance(other,int):continue
                with db() as c:
                    session_ok=one(c,"""SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?
                               AND NOT EXISTS(SELECT 1 FROM settings
                                 WHERE key='emergency_lockdown' AND value='1')""",(digest(sid),now()))
                    valid=bool(session_ok and friends(c,uid,other) and not has_block(c,uid,other))
                if valid:await hub.user(other,'typing',from_id=uid,on=bool(msg.get('on')))
            if uid is not None and isinstance(msg,dict) and msg.get('type')=='group-typing':
                gid=msg.get('group_id')
                if not isinstance(gid,int):continue
                with db() as c:
                    session_ok=one(c,"""SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?
                               AND NOT EXISTS(SELECT 1 FROM settings
                                 WHERE key='emergency_lockdown' AND value='1')""",(digest(sid),now()))
                    targets=group_members_for(c,gid) if session_ok and group_membership(c,gid,uid) else []
                for target in targets:
                    if target!=uid:await hub.user(target,'group-typing',group_id=gid,from_id=uid,on=bool(msg.get('on')))
            if uid is not None and isinstance(msg,dict) and msg.get('type') in ('call-offer','call-answer','call-ice','call-hangup','call-decline'):
                target=msg.get('to')
                if not isinstance(target,int) or target==uid:continue
                with db() as c:
                    session_ok=one(c,"""SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?
                               AND NOT EXISTS(SELECT 1 FROM settings
                                 WHERE key='emergency_lockdown' AND value='1')""",(digest(sid),now()))
                    permitted=bool(session_ok and friends(c,uid,target) and not has_block(c,uid,target)
                                   and v6_feature_on(c,'calls'))
                if permitted:
                    # Only narrow signaling fields may transit; never execute/parse remote SDP on the server.
                    blob=msg.get('signal')
                    if len(json.dumps(blob))<14000:
                        await hub.user(target,msg['type'],from_id=uid,signal=blob,video=bool(msg.get('video')))
                        # A call notice is a short-lived callback hint, not a persisted SDP or live invite.
                        if msg['type']=='call-offer' and isinstance(blob,dict) and blob.get('type')=='offer' and isinstance(blob.get('sdp'),str) and blob['sdp']:
                            if not any(s in hub.foreground for s in hub.users.get(target, ())):
                                try:
                                    throttle(ws,'native-call-notice-sender',5,60,str(uid))
                                    throttle(ws,'native-call-notice-pair',1,45,f'{uid}:{target}')
                                except HTTPException:
                                    pass  # Suppress push spam, not live WebRTC signaling.
                                else:
                                    enqueue_web_push(target,'call-notice',frozenset(),{'from_id':uid,'created_at':now()})
    except (WebSocketDisconnect,RuntimeError,ValueError):
        pass
    finally:
        if uid is not None:
            hub.users[uid].discard(ws)
            hub.detach_session(ws)
            if not hub.users[uid]:
                timestamp=now()
                with db() as c:
                    c.execute('UPDATE users SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)',
                              (timestamp,uid,timestamp))
                await notify_presence(uid,False,last_seen=timestamp)
        elif gid:
            hub.guests[gid].discard(ws)

# Persistent upgrades and additional routed features.
import sys as _sys
from mobile_api import install as _install_mobile_api
_install_mobile_api(_sys.modules[__name__])
from features import install as _install_extra_features
_install_extra_features(_sys.modules[__name__])
from chat_library import alert_allowed, history_window, install as _install_chat_library
_install_chat_library(_sys.modules[__name__])
from web_notifications import install as _install_web_notifications
_install_web_notifications(_sys.modules[__name__])
from mobile_push import install as _install_mobile_push
_install_mobile_push(_sys.modules[__name__])
from world_chat import install as _install_world_chat
_install_world_chat(_sys.modules[__name__])
from social_profile import install as _install_social_profile
_install_social_profile(_sys.modules[__name__])
from admin_hardening import install as _install_admin_hardening
_install_admin_hardening(_sys.modules[__name__])
from admin_security_v5 import install as _install_admin_security_v5
_install_admin_security_v5(_sys.modules[__name__])
from messaging_v4 import install as _install_messaging_v4
_install_messaging_v4(_sys.modules[__name__])
from smart_chat_v6 import install as _install_smart_chat_v6
_install_smart_chat_v6(_sys.modules[__name__])
from community_v6 import install as _install_community_v6
_install_community_v6(_sys.modules[__name__])
from admin_ops_v6 import install as _install_admin_ops_v6
_install_admin_ops_v6(_sys.modules[__name__])
from community_plus_v7 import install as _install_community_plus_v7
_install_community_plus_v7(_sys.modules[__name__])
from admin_readiness_v7 import install as _install_admin_readiness_v7
_install_admin_readiness_v7(_sys.modules[__name__])
