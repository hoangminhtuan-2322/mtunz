"""Backup/restore exercise ONLY against the disposable local CI database."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from postgres_backup import make_postgres_backup, postgres_environment, digest

url=os.environ['TEST_POSTGRES_URL']
info=conninfo_to_dict(url)
if info.get('host') not in ('localhost','127.0.0.1','::1') or info.get('dbname')!='mtunz_ci' or info.get('user')!='mtunz_ci':
    raise SystemExit('Refusing backup drill outside disposable CI database.')
restore_db='mtunz_ci_restore'
with psycopg.connect(url,autocommit=True) as source:
    expected=source.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    assert expected>0
    attachments=source.execute('SELECT COUNT(*) FROM attachments').fetchone()[0]
    assert attachments>0
    source.execute('CREATE DATABASE mtunz_ci_restore')
try:
    with tempfile.TemporaryDirectory() as folder:
        artifact=make_postgres_backup(Path(folder),url,allow_local=True)
        dump=artifact/'database.dump'
        manifest=json.loads((artifact/'BACKUP_INFO.json').read_text())
        assert manifest['sha256']==digest(dump)
        assert manifest['bytes']==dump.stat().st_size
        restore_url=make_conninfo(url,dbname=restore_db)
        env=postgres_environment(restore_url,allow_local=True)
        subprocess.run(['pg_restore','--no-password','--exit-on-error','--no-owner','--no-privileges','--dbname',restore_db,str(dump)],
                       env=env,check=True,timeout=300)
        with psycopg.connect(restore_url) as restored:
            assert restored.execute('SELECT COUNT(*) FROM users').fetchone()[0]==expected
            assert restored.execute('SELECT COUNT(*) FROM attachments').fetchone()[0]==attachments
            assert restored.execute('SELECT COUNT(*) FROM messages').fetchone()[0]>0
finally:
    with psycopg.connect(url,autocommit=True) as source:
        source.execute('DROP DATABASE mtunz_ci_restore')
print('PostgreSQL backup, integrity hash and isolated restore drill passed.')
