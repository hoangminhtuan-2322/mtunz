"""Brand visibility and preservation of a legacy user database."""
from pathlib import Path
import os
import sqlite3
import subprocess
import sys
import tempfile
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


def test_brand_in_page_health_and_manifest():
    # Use the already-imported test app so this test shares its isolated database.
    from app import app
    client = TestClient(app)
    html = client.get('/').text
    assert '<title>mtunz | Nhắn tin realtime</title>' in html
    assert 'Đang kết nối mtunz' in html
    assert 'mtunz' in client.get('/health').json()['app']
    assert client.get('/static/manifest.webmanifest').json()['name'] == 'mtunz'
    assert 'mtunz' in client.get('/static/favicon.svg').text


def test_legacy_database_is_kept_without_reset():
    with tempfile.TemporaryDirectory(prefix='mtunz_migration_') as directory:
        old_path = Path(directory) / ('ve' + 'lora.sqlite3')
        with sqlite3.connect(old_path) as connection:
            connection.execute('CREATE TABLE old_data (message TEXT)')
            connection.execute('INSERT INTO old_data VALUES (?)', ('keep-existing-messages',))
        env = {**os.environ, 'DATA_DIR': directory, 'PUBLIC_MODE': '0'}
        code = '''import app\nfrom app import db, DB_FILE\nassert DB_FILE.name.endswith("lora.sqlite3")\nwith db() as c:\n assert c.execute("SELECT message FROM old_data").fetchone()[0]=="keep-existing-messages"\nprint("preserved")'''
        p = subprocess.run([sys.executable, '-c', code], cwd=ROOT, env=env, capture_output=True, text=True)
        assert p.returncode == 0, p.stdout + p.stderr
        assert 'preserved' in p.stdout
        assert not (Path(directory) / 'mtunz.sqlite3').exists()
