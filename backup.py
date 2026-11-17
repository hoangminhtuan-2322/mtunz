"""Consistent single-file SQLite backup plus all stored attachments.
Run: python backup.py [output directory]. Creates a dated ZIP safe to move to another disk.
"""
import argparse
import json
import os
import shutil
import sqlite3
import os
import tempfile
import time
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def make_backup(destination:Path, data_dir:Path):
    database=data_dir/'mtunz.sqlite3'
    legacy=data_dir/('ve' + 'lora.sqlite3')
    if not database.is_file() and legacy.is_file():
        database=legacy
    if not database.is_file():
        raise SystemExit('Chưa có cơ sở dữ liệu. Hãy khởi động mtunz ít nhất một lần.')
    destination.mkdir(parents=True,exist_ok=True)
    stamp=time.strftime('%Y%m%d_%H%M%S')
    target=destination/f'mtunz_backup_{stamp}.zip'
    with tempfile.TemporaryDirectory(prefix='mtunz_backup_') as temp:
        working=Path(temp)/database.name
        src=sqlite3.connect(database,timeout=15)
        dest=sqlite3.connect(working)
        try:src.backup(dest)
        finally:dest.close();src.close()
        partial=target.with_suffix('.zip.partial')
        with zipfile.ZipFile(partial,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            z.write(working, f'data/{database.name}')
            uploads=data_dir/'uploads'
            if uploads.exists():
                for file in uploads.rglob('*'):
                    if file.is_file() and not file.is_symlink():
                        z.write(file, str(Path('data/uploads')/file.relative_to(uploads)))
            z.writestr('BACKUP_INFO.json',json.dumps({'created_at_utc':int(time.time()),'contents':'sqlite + uploads','version':'2.0'},ensure_ascii=False,indent=2))
        partial.replace(target)
    return target

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Sao lưu mtunz an toàn')
    parser.add_argument('output',nargs='?',default=str(ROOT/'backups'))
    args=parser.parse_args()
    result=make_backup(Path(args.output),Path(os.getenv('DATA_DIR',str(ROOT/'data'))))
    print(f'Đã sao lưu: {result}')
