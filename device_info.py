"""Privacy-conscious session/device summaries.

Store the connection IP for audited admin review. Do not store the full User-Agent, browser fingerprint or high-precision location.
"""
from __future__ import annotations

import ipaddress
import os
from functools import lru_cache
from pathlib import Path


def _agent_details(user_agent: str) -> dict:
    ua = (user_agent or '')[:512].lower()
    if 'iphone' in ua or 'ipod' in ua:
        device, system, kind = 'iPhone', 'iOS', 'mobile'
    elif 'ipad' in ua:
        device, system, kind = 'iPad', 'iPadOS', 'tablet'
    elif 'android' in ua:
        kind = 'tablet' if 'mobile' not in ua else 'mobile'
        device, system = ('Máy tính bảng Android' if kind == 'tablet' else 'Điện thoại Android'), 'Android'
    elif 'windows' in ua:
        device, system, kind = 'Máy tính Windows', 'Windows', 'desktop'
    elif 'macintosh' in ua or 'mac os x' in ua:
        device, system, kind = 'Máy Mac', 'macOS', 'desktop'
    elif 'cros' in ua:
        device, system, kind = 'Chromebook', 'ChromeOS', 'desktop'
    elif 'linux' in ua:
        device, system, kind = 'Máy tính Linux', 'Linux', 'desktop'
    else:
        device, system, kind = 'Thiết bị không xác định', 'Không xác định', 'unknown'

    if 'edg/' in ua or 'edga/' in ua or 'edgios/' in ua:
        browser = 'Edge'
    elif 'opr/' in ua or 'opera' in ua:
        browser = 'Opera'
    elif 'firefox/' in ua or 'fxios/' in ua:
        browser = 'Firefox'
    elif 'crios/' in ua or 'chrome/' in ua:
        browser = 'Chrome'
    elif 'safari/' in ua:
        browser = 'Safari'
    else:
        browser = 'Không xác định'
    return {'device_name': device, 'device_type': kind, 'browser': browser,
            'os_name': system}


@lru_cache(maxsize=2)
def _geo_reader(path: str):
    try:
        import geoip2.database
        if not path or not Path(path).is_file():
            return None
        return geoip2.database.Reader(path)
    except (ImportError, OSError, ValueError):
        return None


def device_metadata(request) -> dict:
    """Best-effort, non-precise metadata from the connection itself.

    A GeoLite2-City .mmdb may optionally be configured with GEOIP_DB_PATH.
    No outbound geolocation requests are made; no untrusted geo headers are used.
    """
    result = _agent_details(request.headers.get('user-agent', ''))
    location, network, address = 'Không xác định', '', None
    peer = request.client.host if request.client else ''
    try:
        ip = ipaddress.ip_address(peer)
        if not ip.is_global:
            location = 'Mạng nội bộ / không xác định'
        elif ip.version == 4:
            prefix = str(ipaddress.ip_network(f'{ip}/24', strict=False).network_address)
            network = prefix.rsplit('.', 1)[0] + '.*'
        else:
            network = str(ipaddress.ip_network(f'{ip}/48', strict=False))
        if ip.is_global:
            address = str(ip)
            reader = _geo_reader(os.getenv('GEOIP_DB_PATH', '').strip())
            if reader:
                try:
                    item = reader.city(str(ip))
                    parts = [item.city.name, item.subdivisions.most_specific.name,
                             item.country.name]
                    location = ', '.join(dict.fromkeys(p for p in parts if p)) or location
                except Exception:
                    # Unknown IPs and unavailable data must not block login.
                    pass
    except ValueError:
        pass
    result['location_hint'] = location[:140]
    result['network_hint'] = network[:80]
    result['ip_address'] = address
    return result
