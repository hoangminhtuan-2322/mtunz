"""Readiness probes must not give false-positive success on database outage."""
from contextlib import contextmanager
from fastapi.testclient import TestClient
import app as mtunz


def test_health_returns_ok_only_when_database_available():
    with TestClient(mtunz.app) as client:
        response = client.get('/health')
        assert response.status_code == 200, response.text
        assert response.json()['ok'] is True
        assert response.json()['app'] == 'mtunz'
        assert response.headers['cache-control'] == 'no-store'


def test_health_returns_503_without_exposing_connection_errors(monkeypatch):
    @contextmanager
    def unavailable_db():
        raise RuntimeError('SECRET_DATABASE_URL_HIDDEN')
        yield  # pragma: no cover

    monkeypatch.setattr(mtunz, 'db', unavailable_db)
    with TestClient(mtunz.app) as client:
        response = client.get('/health')
        assert response.status_code == 503
        assert response.json()['detail'] == 'Cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.'
        assert 'SECRET_DATABASE_URL_HIDDEN' not in response.text
        assert response.headers['cache-control'] == 'no-store'


def test_health_identifies_render_release_without_leaking_environment(monkeypatch):
    sha='aabbccddeeff'*3+'aabb'
    assert len(sha)==40
    monkeypatch.setenv('RENDER_GIT_COMMIT',sha)
    with TestClient(mtunz.app) as client:
        response=client.get('/health')
        assert response.status_code==200
        assert response.json()['commit']==sha[:12]
    monkeypatch.setenv('RENDER_GIT_COMMIT','SECRET_DATABASE_URL_HIDDEN')
    with TestClient(mtunz.app) as client:
        response=client.get('/health')
        assert response.status_code==200
        assert 'commit' not in response.json()
        assert 'SECRET_DATABASE_URL_HIDDEN' not in response.text
