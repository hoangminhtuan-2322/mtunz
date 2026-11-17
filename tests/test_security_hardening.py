"""Regression tests for mtunz request, cookie and WebSocket defenses."""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import app, RATE_BUCKETS


@pytest.fixture(autouse=True)
def clear_throttles():
    RATE_BUCKETS.clear()
    yield
    RATE_BUCKETS.clear()


def test_security_headers_and_cookie_flags():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert response.headers["Cross-Origin-Opener-Policy"] == "same-origin"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_cross_site_writes_rejected_with_origin_referer_and_fetch_metadata():
    client = TestClient(app)
    client.get("/")
    payload = {"username": "security_demo"}
    assert client.post("/api/username/check", json=payload,
                       headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.post("/api/username/check", json=payload,
                       headers={"Referer": "https://evil.example/path"}).status_code == 403
    assert client.post("/api/username/check", json=payload,
                       headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.post("/api/username/check", json=payload,
                       headers={"Origin": "null"}).status_code == 403
    assert client.post("/api/username/check", json=payload,
                       headers={"Origin": "http://testserver"}).status_code == 200


def test_api_rejects_oversized_payload_and_wrong_mime_type():
    client = TestClient(app)
    client.get("/")
    url = "/api/username/check"
    too_large = b"x" * (64 * 1024 + 1)
    response = client.post(url, content=too_large, headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    assert client.post(url, content="{}", headers={"Content-Type": "text/plain"}).status_code == 415
    assert client.post(url, json={"username": "ordinary_demo"}).status_code == 200


def test_invalid_guest_id_cookie_is_rotated():
    client = TestClient(app)
    client.cookies.set("g", "invalid-id")
    response = client.get("/")
    assert response.status_code == 200
    # Inspect the actual response cookie; the HTTPX test jar can retain both
    # a domainless test cookie and the new testserver.local cookie.
    assert response.cookies.get("g") != "invalid-id"
    assert len(response.cookies.get("g")) >= 16


def test_repeated_user_discovery_is_throttled():
    client = TestClient(app)
    client.get("/")
    results = [client.post("/api/auth/start", json={"username": "not_real_user"}) for _ in range(61)]
    assert all(result.status_code == 404 for result in results[:60])
    assert results[-1].status_code == 429
    assert int(results[-1].headers["Retry-After"]) >= 1


def test_websocket_refuses_oversized_and_invalid_json_events():
    client = TestClient(app)
    client.get("/")
    with client.websocket_connect("/ws") as socket:
        socket.send_text("not-json")
        with pytest.raises(WebSocketDisconnect) as caught:
            socket.receive_json()
        assert caught.value.code == 1003
    with client.websocket_connect("/ws") as socket:
        socket.send_text("x" * (16 * 1024 + 1))
        with pytest.raises(WebSocketDisconnect) as caught:
            socket.receive_json()
        assert caught.value.code == 1009
