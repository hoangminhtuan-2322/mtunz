"""One-shot integration smoke against an EPHEMERAL PostgreSQL database.

Run only with a disposable database and TEST_POSTGRES_URL set.
Never run this against a database with real user data.
"""
import os
from pathlib import Path
import sys

URL = os.environ.get("TEST_POSTGRES_URL", "")
if not URL:
    raise SystemExit("TEST_POSTGRES_URL must point to a disposable PostgreSQL database.")

os.environ["DATABASE_URL"] = URL
os.environ["REQUIRE_POSTGRES"] = "1"
os.environ["PUBLIC_MODE"] = "1"
os.environ["COOKIE_SECURE"] = "1"
os.environ["ADMIN_PASSWORD"] = "TemporaryCISecret-NotForProduction-2026"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app import app, db

with TestClient(app, base_url="https://testserver") as admin:
    assert admin.get("/health").json()["ok"] is True
    assert admin.get("/").status_code == 200
    assert admin.post("/api/auth/start", json={"username": "admin"}).status_code == 200
    login = admin.post(
        "/api/auth/password",
        json={"username": "admin", "password": os.environ["ADMIN_PASSWORD"]},
    )
    assert login.status_code == 200, login.text
    assert login.json().get("admin") is True, login.text
    assert admin.get("/api/me").json()["user"]["is_admin"] is True

    with TestClient(app, base_url="https://testserver") as guest:
        guest.get("/")
        req = guest.post("/api/registration/request", json={"username": "render_ci_user", "phone": "0912345678"})
        assert req.status_code == 200, req.text
        pending = admin.get("/api/admin/registrations").json()["registrations"]
        registration = next(x for x in pending if x["username"] == "render_ci_user")
        approved = admin.post(
            f"/api/admin/registrations/{registration['id']}/decision",
            json={"approve": True},
        )
        assert approved.status_code == 200, approved.text
        complete = guest.post(
            "/api/registration/complete",
            json={
                "username": "render_ci_user",
                "password": "RenderTestPassword123!",
                "pin": "123456",
                "pin_length": 6,
            },
        )
        assert complete.status_code == 200, complete.text
        assert guest.post("/api/auth/logout").status_code == 200
        check = guest.post("/api/auth/start", json={"username": "render_ci_user"})
        assert check.status_code == 200, check.text
        pw = guest.post(
            "/api/auth/password",
            json={"username": "render_ci_user", "password": "RenderTestPassword123!"},
        )
        assert pw.status_code == 200, pw.text
        pin = guest.post(
            "/api/auth/pin", json={"challenge": pw.json()["challenge"], "pin": "123456"}
        )
        assert pin.status_code == 200, pin.text
        assert guest.get("/api/me").json()["user"]["username"] == "render_ci_user"

with db() as connection:
    assert connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 2
    assert connection.execute("SELECT COUNT(*) AS n FROM trusted_devices").fetchone()["n"] == 0
print("PostgreSQL smoke OK: server boot, health, admin, approval, password and PIN.")
