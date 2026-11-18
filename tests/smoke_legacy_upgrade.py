"""Prove safe migration from an existing PostgreSQL users table, not only a fresh DB.

This runs ONLY against the disposable CI PostgreSQL service. It preserves a
preexisting admin credential and upgrades missing feature, consent, and world
tables. Never supply a production Neon URL.
"""
import os
import sys
import time
from pathlib import Path

url=os.environ.get('TEST_POSTGRES_URL','')
if not url or 'localhost' not in url and '127.0.0.1' not in url:
    raise SystemExit('Refusing legacy upgrade test: TEST_POSTGRES_URL must be localhost CI Postgres')
os.environ['DATABASE_URL']=url
os.environ['REQUIRE_POSTGRES']='1'
os.environ['PUBLIC_MODE']='1'
os.environ['COOKIE_SECURE']='1'
os.environ['ADMIN_PASSWORD']='TemporaryCISecret-NotForProduction-2026'

import psycopg
from argon2 import PasswordHasher
from psycopg.rows import dict_row

# Simulate an older Neon production installation: core account rows already
# exist, but new onboarding, world, consent and chat feature tables do not.
with psycopg.connect(url,row_factory=dict_row) as c:
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        pin_hash TEXT,
        pin_length INTEGER,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_seen INTEGER,
        sanction_kind TEXT,
        sanction_until INTEGER,
        sanction_reason TEXT)""")
    if c.execute("SELECT count(*) AS n FROM users").fetchone()['n']:
        raise SystemExit('Refusing to seed into non-empty CI database')
    existing_hash=PasswordHasher(time_cost=2,memory_cost=19456,parallelism=1).hash(
        os.environ['ADMIN_PASSWORD'])
    prior_admin=c.execute("""INSERT INTO users(username,password_hash,is_admin,created_at)
                              VALUES('admin',%s,1,%s) RETURNING id""",
                          (existing_hash,int(time.time()))).fetchone()['id']

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app import app,db

with TestClient(app,base_url='https://testserver') as client:
    assert client.get('/health').status_code==200
    assert client.get('/terms').status_code==200
    assert client.get('/privacy').status_code==200

with db() as c:
    admin=c.execute('SELECT id,password_hash,terms_accepted_at,terms_accepted_version FROM users WHERE username=?',('admin',)).fetchone()
    assert admin['id']==prior_admin,'Upgrade changed the preexisting admin ID'
    assert admin['password_hash']==existing_hash,'Upgrade changed the preexisting password hash'
    assert admin['terms_accepted_at'] is None,'Legacy users may not be force-consented'
    assert admin['terms_accepted_version'] is None
    assert c.execute("""SELECT count(*) AS n FROM information_schema.columns
                         WHERE table_name='users' AND column_name='needs_display_name'""").fetchone()['n']==1
    assert c.execute('SELECT count(*) AS n FROM message_pins').fetchone()['n']==0
    world=c.execute('SELECT enabled FROM world_settings WHERE id=1').fetchone()
    assert world is not None and not world['enabled'], 'World Chat must remain closed by default'

print('Legacy PostgreSQL migration OK: existing account/hash preserved, new consent/onboarding/world schema ready.')
