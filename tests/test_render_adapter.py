"""Render-specific smoke tests that do not require Neon credentials.

These test the adapter's SQL conversion and deployment fail-closed behavior;
real Neon/Render integration still requires an external DB account.
"""
import os
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pg_storage import PGConnection, convert_sql  # noqa: E402


def test_sqlite_ddl_and_queries_are_adapted_to_postgres():
    ddl = "CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE)"
    converted = convert_sql(ddl)
    assert 'BIGSERIAL PRIMARY KEY' in converted
    assert 'COLLATE NOCASE' not in converted
    assert convert_sql('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)') == (
        'INSERT INTO settings(key,value) VALUES(%s,%s) ON CONFLICT DO NOTHING'
    )
    assert convert_sql('INSERT OR IGNORE INTO blocks VALUES(?,?)') == (
        'INSERT INTO blocks VALUES(%s,%s) ON CONFLICT DO NOTHING'
    )
    assert convert_sql('UPDATE group_members SET last_read_id=MAX(last_read_id,?) WHERE group_id=?') == (
        'UPDATE group_members SET last_read_id=GREATEST(last_read_id, %s) WHERE group_id=%s'
    )
    assert convert_sql('file_content BLOB') == 'file_content BYTEA'


class FakeCursor:
    rowcount = 1

    def __init__(self, rows):
        self.rows = list(rows)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def fetchall(self):
        rows, self.rows = self.rows, []
        return rows

    def __iter__(self):
        return iter(self.rows)


class FakeConnection:
    def __init__(self):
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        if 'RETURNING id' in sql:
            return FakeCursor([{'id': 123}])
        if 'information_schema.columns' in sql:
            return FakeCursor([{'name': 'id'}, {'name': 'username'}])
        return FakeCursor([{'ok': True}])


def test_pg_connection_preserves_lastrowid_rowcount_and_pragma():
    fake = FakeConnection()
    conn = PGConnection(fake)
    inserted = conn.execute('INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)', (1, 2, 'hi', 1000))
    assert inserted.lastrowid == 123
    assert inserted.rowcount == 1
    assert fake.executed[0][0].endswith('RETURNING id')
    assert fake.executed[0][1] == (1, 2, 'hi', 1000)
    assert [row['name'] for row in conn.execute('PRAGMA table_info(users)')] == ['id', 'username']


def test_render_blueprint_never_uses_ephemeral_sqlite():
    blueprint = yaml.safe_load((ROOT / 'render.yaml').read_text())
    service = blueprint['services'][0]
    assert service['plan'] == 'free'
    assert service['runtime'] == 'python'
    assert service['healthCheckPath'] == '/health'
    assert '--workers 1' in service['startCommand']
    settings = {e['key']: e for e in service['envVars']}
    assert settings['REQUIRE_POSTGRES']['value'] == '1'
    assert settings['PUBLIC_MODE']['value'] == '1'
    assert settings['COOKIE_SECURE']['value'] == '1'
    assert settings['ADMIN_PASSWORD']['sync'] is False
    assert settings['DATABASE_URL']['sync'] is False
    proc = subprocess.run([sys.executable, '-c', 'import app'], cwd=ROOT,
                          env={**os.environ, 'REQUIRE_POSTGRES': '1', 'DATABASE_URL': ''},
                          capture_output=True, text=True)
    assert proc.returncode != 0
    assert 'thiếu DATABASE_URL' in proc.stderr
