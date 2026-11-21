"""Verify backup guards without network, credentials or real database writes."""
import importlib.util
from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "mtunz_neon_backup", ROOT / "scripts" / "backup_neon.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def test_neon_backup_requires_direct_encrypted_url():
    url = "postgresql://u:p%40ss@ep-sample-pooler.ap-southeast-1.aws.neon.tech/mtunz?sslmode=require"
    with pytest.raises(ValueError, match="pooled"):
        backup.connection_environment(url)
    with pytest.raises(ValueError, match="TLS"):
        backup.connection_environment(
            "postgresql://u:p@ep-sample.aws.neon.tech/mtunz?sslmode=disable")
    with pytest.raises(ValueError, match="PostgreSQL"):
        backup.connection_environment("https://example.test/")


def test_neon_backup_keeps_secret_out_of_command_line():
    env = backup.connection_environment(
        "postgresql://alice:a%24b%40c@ep-sample.aws.neon.tech/mtunz?sslmode=require",
        {"PGSERVICE": "unknown", "PGOPTIONS": "unsafe"})
    assert env["PGPASSWORD"] == "a$b@c"
    assert env["PGDATABASE"] == "mtunz"
    assert env["PGSSLMODE"] == "require"
    assert env["PGHOST"] == "ep-sample.aws.neon.tech"
    assert "PGOPTIONS" not in env and "PGSERVICE" not in env


def test_verified_backup_is_private_and_atomic(monkeypatch, tmp_path):
    archive_bytes = b"postgres-custom-archive-fixture"
    seen = []

    def fake_run(argv, **kwargs):
        seen.append(argv)
        assert "secret" not in " ".join(argv)
        if argv[0] == "pg_dump":
            Path(argv[-1]).write_bytes(archive_bytes)
            return subprocess.CompletedProcess(argv, 0, "", "")
        if argv[0] == "pg_restore":
            return subprocess.CompletedProcess(
                argv, 0, "1234; 1259 1 TABLE public users admin\n", "")
        raise AssertionError(argv)

    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    target, manifest = backup.backup(
        "postgresql://user:secret@ep-neon.example/mtunz?sslmode=require",
        tmp_path / "db-backups")
    assert target.exists() and target.read_bytes() == archive_bytes
    assert manifest.exists()
    assert target.stat().st_mode & 0o077 == 0
    assert manifest.stat().st_mode & 0o077 == 0
    assert target.parent.stat().st_mode & 0o077 == 0
    assert len(seen) == 2
    assert not list(target.parent.glob("*.partial"))


def test_backup_refuses_repository_and_invalid_archive(monkeypatch, tmp_path):
    with pytest.raises(ValueError, match="OUTSIDE"):
        backup.backup("postgresql://u:p@db.example/demo?sslmode=require",
                      ROOT / "backups")
    def failed(argv, **kwargs):
        if argv[0] == "pg_dump":
            Path(argv[-1]).write_bytes(b"bad archive")
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(argv, 0, "", "")
    monkeypatch.setattr(backup.subprocess, "run", failed)
    dest = tmp_path / "backups"
    with pytest.raises(RuntimeError, match="users table"):
        backup.backup("postgresql://u:p@db.example/demo?sslmode=require", dest)
    assert not list(dest.glob("*.dump"))
    assert not list(dest.glob("*.partial"))
