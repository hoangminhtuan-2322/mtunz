"""Release-facing tests: real unauthenticated policy routes and browser protections."""
from fastapi.testclient import TestClient
from app import app


def test_release_policy_documents_are_accessible_without_login():
    with TestClient(app) as client:
        for path, title, sibling in (
            ('/terms', 'Điều khoản sử dụng', '/privacy'),
            ('/privacy', 'Chính sách quyền riêng tư', '/terms'),
        ):
            response=client.get(path)
            assert response.status_code==200,response.text
            assert response.headers['content-type'].startswith('text/html')
            assert title in response.text
            assert f'href="{sibling}"' in response.text
            assert 'mtunz' in response.text.lower()
            assert 'no-store' in response.headers.get('cache-control','')
            assert "frame-ancestors 'none'" in response.headers['content-security-policy']


def test_chat_image_compression_allowed_by_csp_without_untrusted_scripts():
    with TestClient(app) as client:
        response=client.get('/')
        assert response.status_code==200
        csp=response.headers['content-security-policy']
        assert "img-src 'self' data: blob:" in csp
        assert "script-src 'self'" in csp
        assert "object-src 'none'" in csp
        assert "frame-ancestors 'none'" in csp


def test_home_removes_only_chatgpt_referral_query():
    with TestClient(app) as client:
        response = client.get('/?utm_source=chatgpt.com')
        assert response.status_code == 200
        assert response.url.path == '/' and not response.url.query
        assert len(response.history) == 1

        response = client.get('/?label=a%20b&utm_source=chatgpt.com&utm_source=other&tag=1&tag=2',
                              follow_redirects=False)
        assert response.status_code == 302
        assert response.headers['location'] == '/?label=a%20b&utm_source=other&tag=1&tag=2'
        assert client.get('/?utm_source=other', follow_redirects=False).status_code == 200


def test_android_app_link_contains_only_the_published_package_and_certificate():
    import re

    with TestClient(app) as client:
        response = client.get('/.well-known/assetlinks.json')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/json')
    [statement] = response.json()
    assert statement['relation'] == ['delegate_permission/common.handle_all_urls']
    assert statement['target']['namespace'] == 'android_app'
    assert statement['target']['package_name'] == 'com.mtunz.web'
    [fingerprint] = statement['target']['sha256_cert_fingerprints']
    assert re.fullmatch(r'(?:[0-9A-F]{2}:){31}[0-9A-F]{2}', fingerprint)
