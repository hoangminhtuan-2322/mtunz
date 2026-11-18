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
