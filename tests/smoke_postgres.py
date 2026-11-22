"""One-shot integration smoke against an EPHEMERAL PostgreSQL database.

Run only with a disposable database and TEST_POSTGRES_URL set.
Never run this against a database with real user data.
"""
import os
from contextlib import closing
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

    enrollment=admin.post("/api/me/pin/setup",json={
        "current_password":os.environ["ADMIN_PASSWORD"],"pin":"2345","pin_length":4})
    assert enrollment.status_code==200,enrollment.text

    with closing(TestClient(app, base_url="https://testserver")) as guest:
        guest.get("/")
        req = guest.post("/api/registration/request", json={"username": "render_ci_user", "phone": "0912345678"})
        assert req.status_code == 200, req.text
        pending = admin.get("/api/admin/registrations").json()["registrations"]
        registration = next(x for x in pending if x["username"] == "render_ci_user")
        approved = admin.post(
            f"/api/admin/registrations/{registration['id']}/decision",
            json={"approve": True, "admin_pin":"2345"},
        )
        assert approved.status_code == 200, approved.text
        complete = guest.post(
            "/api/registration/complete",
            json={
                "username": "render_ci_user",
                "password": "RenderTestPassword123!",
                "pin": "123456",
                "pin_length": 6,
                "accepted_terms": True,
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
        first_name = guest.post("/api/me/display-name",json={"display_name":"Minh thử nghiệm"})
        assert first_name.status_code == 200, first_name.text

        account=guest.get("/api/me").json()["user"]
        matches=admin.get("/api/admin/users",params={"q":"#"+str(account["public_id"])}).json()
        assert matches["total"]==1 and matches["users"][0]["id"]==account["id"]
        scheduled=guest.post("/api/me/delete",json={
            "username":"render_ci_user","password":"RenderTestPassword123!",
            "pin":"123456","confirm":"XOA SAU 3 NGAY"})
        assert scheduled.status_code==200,scheduled.text
        cancel=admin.post(f"/api/admin/users/{account['id']}/delete/cancel",json={"admin_pin":"2345"})
        assert cancel.status_code==200,cancel.text
        login_again=guest.post("/api/auth/password",json={
            "username":"render_ci_user","password":"RenderTestPassword123!"})
        assert login_again.status_code==200,login_again.text
        unlocked=guest.post("/api/auth/pin",json={"challenge":login_again.json()["challenge"],"pin":"123456"})
        assert unlocked.status_code==200,unlocked.text
        assert guest.get("/api/me/push").json()["public_key"]

        config=admin.post("/api/admin/world/config",json={
            "enabled":True,"schedule_enabled":False,"open_minute":540,"close_minute":1320,
            "admin_pin":"2345"
        })
        assert config.status_code==200,config.text
        sent=guest.post("/api/world/messages",json={"body":"Chào Chat thế giới"})
        assert sent.status_code==200,sent.text
        message_id=sent.json()["message"]["id"]
        assert isinstance(message_id,int) and message_id>0
        assert guest.get("/api/world/messages").json()["messages"][0]["id"]==message_id
        assert admin.get("/api/admin/world").json()["total_messages"]==1

        with closing(TestClient(app,base_url="https://testserver")) as peer:
            peer.get("/")
            req2=peer.post("/api/registration/request",json={
                "username":"render_ci_peer","phone":"0901234567"})
            assert req2.status_code==200,req2.text
            pending2=admin.get("/api/admin/registrations").json()["registrations"]
            rid2=next(r["id"] for r in pending2 if r["username"]=="render_ci_peer")
            approved2=admin.post(f"/api/admin/registrations/{rid2}/decision",
                                 json={"approve":True,"admin_pin":"2345"})
            assert approved2.status_code==200,approved2.text
            complete2=peer.post("/api/registration/complete",json={
                "username":"render_ci_peer","password":"RenderPeerPassword123!",
                "pin":"123456","pin_length":6,"accepted_terms":True})
            assert complete2.status_code==200,complete2.text
            assert peer.post("/api/me/display-name",json={
                "display_name":"Hội viên phản ánh"}).status_code==200
            victim=peer.get("/api/me").json()["user"]
            original=guest.get("/api/me").json()["user"]
            complaint=peer.post("/api/reports",json={
                "target_id":original["id"],"scope":"world","message_id":message_id,
                "reason":"spam","description":"Tin nhắn công cộng cần kiểm tra"})
            assert complaint.status_code==200,complaint.text
            report_id=complaint.json()["report_id"]
            assert report_id>0
            review=admin.post(f"/api/admin/reports/{report_id}/review",json={
                "decision":"reviewed","note":"Đã kiểm tra trên PostgreSQL",
                "admin_pin":"2345"})
            assert review.status_code==200,review.text

        endpoint="/api/admin/security/maintenance"
        enabled=admin.post(endpoint,json={"enabled":True,"admin_pin":"2345"})
        assert enabled.status_code==200,enabled.text
        assert guest.get("/api/me").status_code==503
        assert admin.get("/api/me").json()["user"]["is_admin"]
        assert admin.post(endpoint,json={"enabled":False,"admin_pin":"2345"}).status_code==200

with db() as connection:
    assert connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 3
    assert connection.execute("SELECT COUNT(*) AS n FROM trusted_devices").fetchone()["n"] == 0
    assert connection.execute("SELECT COUNT(*) AS n FROM world_messages").fetchone()["n"]==1
    assert connection.execute("SELECT COUNT(*) AS n FROM user_reports").fetchone()["n"]==1
print("PostgreSQL smoke OK: auth, World Chat, moderation settings and reviewed reports.")
