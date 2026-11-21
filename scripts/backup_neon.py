"""Safely export a mtunz Neon Postgres database without affecting its data.

Usage:
  BACKUP_DATABASE_URL='postgresql://...DIRECT-HOST.../db?sslmode=require' \
      python scripts/backup_neon.py --output-dir ~/mtunz-backups

Requirements: pg_dump and pg_restore from a compatible PostgreSQL client.
Never use the Render DATABASE_URL if it points at a -pooler host.
Only local, permission-restricted archives are created, never GitHub artifacts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs, unquote

ROOT = Path(__file__).resolve().parents[1]


def connection_environment(url: str, current_env: dict[str, str] | None = None) -> dict[str, str]:
    """Use PG* env vars, never expose connection credentials in process argv."""
    parsed = urlsplit(url.strip())
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError("BACKUP_DATABASE_URL must be a PostgreSQL connection URL")
    host = parsed.hostname
    if "-pooler" in host:
        raise ValueError("Use a direct Neon hostname, not a pooled (-pooler) endpoint")
    name = unquote(parsed.path.lstrip("/"))
    if not name or "/" in name or not parsed.username:
        raise ValueError("Backup URL is missing a database name or user")
    query = parse_qs(parsed.query)
    sslmode = query.get("sslmode", ["require"])[0]
    if sslmode not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("Backup connection must verify TLS (sslmode=require or stricter)")
    env = dict(os.environ if current_env is None else current_env)
    env.update({
        "PGHOST": host,
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": unquote(parsed.username),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGDATABASE": name,
        "PGSSLMODE": sslmode,
        "PGCONNECT_TIMEOUT": "15",
        "PGAPPNAME": "mtunz-read-only-backup",
    })
    # Reject any alternate PG service files or query strings that could change
    # the target implicitly. We accept only these explicit connection fields.
    for k in ("PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGHOSTADDR"):
        env.pop(k, None)
    return env


def backup(url: str, destination: Path) -> tuple[Path, Path]:
    env = connection_environment(url)
    destination = destination.expanduser().resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError("Backups must be stored OUTSIDE the Git repository")
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destination, 0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stem = f"mtunz_neon_{stamp}_{secrets.token_hex(3)}"
    target = destination / f"{stem}.dump"
    partial = destination / f".{stem}.partial"
    metadata = destination / f"{stem}.json"
    fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    try:
        result = subprocess.run(
            ["pg_dump", "--format=custom", "--no-owner", "--no-acl",
             "--file", str(partial)],
            env=env, capture_output=True, text=True, timeout=900, check=False,
        )
        if result.returncode:
            raise RuntimeError("pg_dump could not complete; verify direct Neon credentials and PostgreSQL client version")
        listing = subprocess.run(
            ["pg_restore", "--list", str(partial)],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if listing.returncode or not re.search(r"\bTABLE\s+public\s+users\b", listing.stdout):
            raise RuntimeError("Backup verification failed: archive missing mtunz users table")
        sha = hashlib.sha256()
        with partial.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                sha.update(block)
        record = {
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "format": "PostgreSQL pg_dump custom",
            "file": target.name,
            "sha256": sha.hexdigest(),
            "bytes": partial.stat().st_size,
            "validated_with": "pg_restore --list",
            "restore": "TEST IN A DISPOSABLE DATABASE BEFORE PRODUCTION USE",
        }
        os.replace(partial, target)
        tmp_meta = metadata.with_suffix(".json.partial")
        fd = os.open(tmp_meta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf8") as output:
            json.dump(record, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(tmp_meta, metadata)
        return target, metadata
    finally:
        partial.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only verified backup of mtunz Neon PostgreSQL")
    parser.add_argument("--output-dir", default=str(Path.home() / "mtunz-backups"))
    args = parser.parse_args()
    url = os.getenv("BACKUP_DATABASE_URL", "")
    if not url:
        parser.error("Set BACKUP_DATABASE_URL to a direct (unpooled) Neon connection URL")
    try:
        archive, manifest = backup(url, Path(args.output_dir))
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        # Never print a connection URL, credentials, pg_dump stderr or SQL data.
        print(f"Neon backup failed: {exc}", file=sys.stderr)
        return 1
    print(f"Verified backup: {archive}")
    print(f"SHA256 metadata: {manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
