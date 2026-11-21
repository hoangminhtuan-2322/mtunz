"""Bounded PostgreSQL connection reuse without requiring a live Neon database."""
import contextlib
import types
import sys

from pg_storage import PGConnection
import pg_storage


def test_pool_is_small_reused_and_commits_transactions(monkeypatch):
    created = []

    class FakeConnection:
        def execute(self, sql, args=()):
            return types.SimpleNamespace(rowcount=1, fetchone=lambda: {"ok": 1})

    class FakePool:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.opened = 0
            self.closed = 0
            self.borrowed = 0
            created.append(self)

        def open(self, **kwargs):
            self.opened += 1

        @contextlib.contextmanager
        def connection(self):
            self.borrowed += 1
            yield FakeConnection()

        def close(self):
            self.closed += 1

    monkeypatch.setitem(sys.modules, "psycopg_pool",
                        types.SimpleNamespace(ConnectionPool=FakePool))
    monkeypatch.setattr(pg_storage, "_POOL", None)
    monkeypatch.setattr(pg_storage, "_POOL_URL", None)
    monkeypatch.setenv("PG_POOL_SIZE", "500")

    with pg_storage.postgres_db("postgresql://user:pass@localhost/disposable") as db:
        assert isinstance(db, PGConnection)
        assert db.execute("SELECT 1").fetchone() == {"ok": 1}
    with pg_storage.postgres_db("postgresql://user:pass@localhost/disposable") as db:
        db.execute("SELECT 2")
    assert len(created) == 1, "Connections reuse one bounded pool per worker"
    p = created[0]
    assert p.borrowed == 2 and p.opened == 1
    assert p.kwargs["min_size"] == 0 and p.kwargs["max_size"] == 6
    assert p.kwargs["kwargs"]["prepare_threshold"] is None, "Safe for pooled Neon endpoints"

    with pg_storage.postgres_db("postgresql://user:pass@localhost/second-test") as db:
        db.execute("SELECT 3")
    assert len(created) == 2
    assert p.closed == 1, "Old pool is not left connected after a URL change"
