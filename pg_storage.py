"""Small PostgreSQL adapter for mtunz's existing SQLite-shaped query API.

SQLite is used only for local development. Render Free never stores account data
on its ephemeral filesystem: DATABASE_URL connects to persistent Neon PostgreSQL.
This module retains the app's parameterized SQL and converts only its known
SQLite syntax (qmark parameters, id primary keys, IGNORE inserts, PRAGMA).
"""
from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager

SERIAL_TABLES = {
    'users', 'registrations', 'messages', 'tickets', 'ticket_messages',
    'notifications', 'audit', 'attachments', 'chat_groups', 'group_messages',
    'world_messages', 'user_reports', 'message_requests', 'scheduled_messages',
}


def convert_sql(query: str) -> str:
    q = query.strip().rstrip(';')
    q = re.sub(r'\bPRAGMA\s+journal_mode\s*=\s*WAL\b', '', q, flags=re.I)
    q = re.sub(r'\bINTEGER\s+PRIMARY\s+KEY\b', 'BIGSERIAL PRIMARY KEY', q, flags=re.I)
    q = re.sub(r'\bBLOB\b', 'BYTEA', q, flags=re.I)
    q = re.sub(r'\s+COLLATE\s+NOCASE\b', '', q, flags=re.I)
    q = re.sub(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', 'INSERT INTO', q, flags=re.I)
    if re.match(r'INSERT\s+INTO\s+(settings|blocks)\b', q, re.I) and 'ON CONFLICT' not in q.upper():
        # The two legacy statements used SQLite INSERT OR IGNORE.
        q += ' ON CONFLICT DO NOTHING'
    q = re.sub(r'\bMAX\s*\(\s*last_read_id\s*,\s*\?\s*\)',
               'GREATEST(last_read_id, ?)', q, flags=re.I)
    # All application queries use '?' only as parameter markers, never as a JSON operator.
    return q.replace('?', '%s')


class PGCursor:
    def __init__(self, cursor, lastrowid=None):
        self._cursor = cursor
        self.lastrowid = lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)


class PGConnection:
    def __init__(self, connection):
        self._connection = connection

    def execute(self, query, params=()):
        text = query.strip()
        pragma = re.fullmatch(r'PRAGMA\s+table_info\(([a-z_]+)\)', text, re.I)
        if pragma:
            sql = '''SELECT column_name AS name FROM information_schema.columns
                     WHERE table_schema=current_schema() AND table_name=%s'''
            return PGCursor(self._connection.execute(sql, (pragma.group(1).lower(),)))
        if re.fullmatch(r'PRAGMA\s+foreign_keys\s*=\s*ON', text, re.I):
            return PGCursor(self._connection.execute('SELECT 1'))
        q = convert_sql(text)
        if not q:
            return None
        match = re.match(r'INSERT\s+INTO\s+([a-z_]+)\b', q, re.I)
        # lastrowid is not a PostgreSQL cursor feature. Retrieve generated IDs
        # with RETURNING instead of relying on lastval()/sequence races.
        get_id = bool(match and match.group(1).lower() in SERIAL_TABLES and 'RETURNING' not in q.upper())
        if get_id:
            q += ' RETURNING id'
        try:
            cursor = self._connection.execute(q, params)
        except Exception as exc:
            # Preserve the existing app's duplicate-username error handling.
            if exc.__class__.__name__ == 'UniqueViolation':
                raise sqlite3.IntegrityError('Unique constraint violation') from exc
            raise
        returned = cursor.fetchone() if get_id else None
        row_id = returned['id'] if returned else None
        return PGCursor(cursor, lastrowid=row_id)

    def executescript(self, script):
        for statement in script.split(';'):
            if statement.strip() and not re.match(r'^\s*PRAGMA\s+journal_mode', statement, re.I):
                self.execute(statement)


@contextmanager
def postgres_db(database_url: str):
    import psycopg
    from psycopg.rows import dict_row
    # Neon pooled URLs are recommended for HTTP traffic. One Render worker
    # holds realtime websocket clients; a new short DB transaction is opened
    # for each operation and is always closed afterwards.
    with psycopg.connect(database_url, row_factory=dict_row, connect_timeout=12) as connection:
        yield PGConnection(connection)
