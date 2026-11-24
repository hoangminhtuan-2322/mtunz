"""Public Android release catalog: only stable, uploaded APKs from the mtunz repository."""
import json
import re
import threading
import time
from urllib.request import Request, urlopen

REPO = 'hoangminhtuan-2322/mtunz'
API = f'https://api.github.com/repos/{REPO}/releases?per_page=100'
BASE = f'https://github.com/{REPO}/releases/download/'
TAG = re.compile(r'android-v(\d+\.\d+\.\d+)-code([1-9]\d{0,9})\Z')
_lock = threading.Lock()
_cached = None
_expires = 0.0

def select_release(rows):
    candidates = []
    for row in rows:
        if not isinstance(row, dict) or row.get('draft') or row.get('prerelease'):
            continue
        tag = row.get('tag_name', '')
        match = TAG.fullmatch(tag) if isinstance(tag, str) else None
        if not match or not row.get('published_at'):
            continue
        version, code_text = match.groups()
        code = int(code_text)
        if code > 2100000000:
            continue
        name = f'mtunz-android-v{version}-code{code}.apk'
        url = BASE + tag + '/' + name
        for asset in row.get('assets', []) or []:
            if not isinstance(asset, dict):
                continue
            if asset.get('name') != name or asset.get('browser_download_url') != url:
                continue
            size = asset.get('size', 0)
            if asset.get('state') != 'uploaded' or not isinstance(size, int) or size <= 0:
                continue
            digest = asset.get('digest') or ''
            candidates.append({'available': True, 'platform': 'android',
                'package': 'com.mtunz.web', 'version': version, 'version_code': code,
                'size_bytes': size, 'published_at': row['published_at'], 'download_url': url,
                'sha256': digest[7:] if re.fullmatch(r'sha256:[a-f0-9]{64}', digest) else None})
    return max(candidates, key=lambda item: item['version_code'], default={
        'available': False, 'platform': 'android', 'package': 'com.mtunz.web'})

def latest_android_release():
    global _cached, _expires
    with _lock:
        if _cached is not None and time.monotonic() < _expires:
            return dict(_cached)
        try:
            request = Request(API, headers={'Accept': 'application/vnd.github+json',
                'User-Agent': 'mtunz-release-catalog', 'X-GitHub-Api-Version': '2022-11-28'})
            with urlopen(request, timeout=5) as response:
                rows = json.loads(response.read(2 * 1024 * 1024))
            if not isinstance(rows, list):
                raise ValueError('Invalid release catalog')
            _cached = select_release(rows)
            _expires = time.monotonic() + 120
            return dict(_cached)
        except (OSError, ValueError, TypeError, AttributeError):
            _expires = time.monotonic() + 30
            if _cached is not None:
                _cached = {**_cached, 'stale': True}
                return dict(_cached)
            return {'available': False, 'platform': 'android', 'package': 'com.mtunz.web',
                    'unavailable_reason': 'catalog_unreachable'}
