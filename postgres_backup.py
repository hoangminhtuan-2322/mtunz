"""Offline, private logical PostgreSQL backup; never run inside a web request."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from psycopg.conninfo import conninfo_to_dict

_ALLOWED = {
    'host':'PGHOST', 'port':'PGPORT', 'dbname':'PGDATABASE', 'user':'PGUSER',
    'password':'PGPASSWORD', 'sslmode':'PGSSLMODE', 'channel_binding':'PGCHANNELBINDING',
    'connect_timeout':'PGCONNECT_TIMEOUT', 'sslrootcert':'PGSSLROOTCERT',
}

def postgres_environment(url, *, allow_local=False):
    try:
        options = conninfo_to_dict(url)
    except Exception:
        raise ValueError('Invalid PostgreSQL backup connection configuration.') from None
    if set(options) - set(_ALLOWED):
        raise ValueError('Unsupported PostgreSQL backup connection option.')
    host = options.get('host', '')
    if not host or ',' in host or not options.get('dbname') or not options.get('user'):
        raise ValueError('An explicit single-host database and user are required.')
    if '-pooler' in host.lower():
        raise ValueError('Use the direct database connection, not a pooler.')
    local = allow_local and host in ('localhost', '127.0.0.1', '::1')
    if not local and options.get('sslmode') not in ('require','verify-ca','verify-full'):
        raise ValueError('TLS is required for remote backup connections.')
    # Do not inherit unrelated libpq credentials, routing or session settings.
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update({_ALLOWED[k]:v for k,v in options.items()})
    env.setdefault('PGCONNECT_TIMEOUT','15')
    return env

def run_tool(command, env):
    try:
        result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=3600, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('Backup tool unavailable or timed out.') from None
    if result.returncode:
        raise RuntimeError('PostgreSQL backup tool failed; check connectivity and tool version.')

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()

def make_postgres_backup(destination, url, *, allow_local=False):
    env = postgres_environment(url, allow_local=allow_local)
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / ('mtunz_pg_'+time.strftime('%Y%m%d_%H%M%S',time.gmtime())+'_'+uuid.uuid4().hex[:12])
    temp = Path(tempfile.mkdtemp(prefix='.mtunz_backup_', dir=destination))
    try:
        dump = temp/'database.dump'
        # Custom-format archive is consistent and includes bytea attachment data.
        # Never expose connection strings or passwords through command arguments.
        run_tool(['pg_dump','--no-password','--format=custom','--no-owner','--no-privileges','--file',str(dump)],env)
        if not dump.is_file() or dump.stat().st_size==0:
            raise RuntimeError('Empty backup archive.')
        dump.chmod(0o600)
        run_tool(['pg_restore','--list',str(dump)],env)
        manifest=temp/'BACKUP_INFO.json'
        manifest.write_text(json.dumps({'format':'postgres-custom','created_at_utc':int(time.time()),
                                        'bytes':dump.stat().st_size,'sha256':digest(dump)},indent=2)+'\n',encoding='utf-8')
        manifest.chmod(0o600)
        temp.rename(target)
        return target
    finally:
        if temp.exists():
            shutil.rmtree(temp)
