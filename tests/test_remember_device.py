"""Persistent trusted-device and per-visit PIN security regression tests.

Uses local disposable SQLite only; never runs against live Neon customer data.
"""
import pytest
from fastapi.testclient import TestClient
from app import (
    app, db, now, hash_secret, RATE_BUCKETS, REMEMBER_COOKIE, one,
)


@pytest.fixture(autouse=True)
def isolate_remembered_device_tests():
    RATE_BUCKETS.clear()
    with db() as c:
        c.execute("DELETE FROM trusted_devices")
        c.execute("DELETE FROM sessions")
        c.execute("DELETE FROM login_challenges")
        c.execute("DELETE FROM registrations")
        c.execute("DELETE FROM users WHERE username='saved_demo'")
        c.execute("UPDATE users SET pin_hash=NULL,pin_length=NULL WHERE username='admin'")
    yield
    with db() as c:
        c.execute("DELETE FROM trusted_devices")
        c.execute("DELETE FROM sessions")
        c.execute("DELETE FROM login_challenges")
        c.execute("DELETE FROM registrations")
        c.execute("DELETE FROM users WHERE username='saved_demo'")
        c.execute("UPDATE users SET pin_hash=NULL,pin_length=NULL WHERE username='admin'")
    RATE_BUCKETS.clear()


def new_user(username="saved_demo", pin="543210"):
    with db() as c:
        c.execute("""INSERT INTO users(username,password_hash,pin_hash,pin_length,created_at)
                     VALUES(?,?,?,?,?)""",
                  (username,hash_secret("SecurePassword123!"),hash_secret(pin),len(pin),now()))


def login_with_pin(client, username="saved_demo", pin="543210", remember=True):
    assert client.get("/").status_code == 200
    assert client.post("/api/auth/start",json={"username":username}).status_code == 200
    password = client.post("/api/auth/password",json={
        "username":username,"password":"SecurePassword123!"})
    assert password.status_code == 200, password.text
    challenge = password.json()["challenge"]
    verified = client.post("/api/auth/pin",json={
        "challenge":challenge,"pin":pin,"remember_device":remember})
    assert verified.status_code == 200, verified.text
    return verified


def test_device_is_hashed_and_pin_required_on_explicit_new_visit():
    new_user()
    c=TestClient(app)
    result=login_with_pin(c)
    cookie=result.cookies.get(REMEMBER_COOKIE)
    assert cookie is not None and len(cookie)>30
    cookie_header=result.headers["set-cookie"].lower()
    assert "httponly" in cookie_header and "samesite=strict" in cookie_header
    with db() as dbconn:
        row=one(dbconn,"SELECT * FROM trusted_devices WHERE user_id=(SELECT id FROM users WHERE username=?)",
                ("saved_demo",))
        assert row and row["token_hash"] != cookie
        assert row["failed_attempts"]==0
    assert c.get("/api/me").json()["user"]["username"]=="saved_demo"

    # A NEW tab without a tab-scoped marker invokes this flow, invalidating
    # stale cookie access while preserving optional PIN-only device unlock.
    status=c.post("/api/auth/remembered")
    assert status.status_code==200
    assert status.json()=={"remembered":True,"username":"saved_demo","pin_length":6}
    assert c.get("/api/me").json()["user"] is None
    assert c.get("/api/friends").status_code==401

    unlocked=c.post("/api/auth/remembered/unlock",json={"pin":"543210"})
    assert unlocked.status_code==200,unlocked.text
    assert c.get("/api/me").json()["user"]["username"]=="saved_demo"


def test_reload_uses_readonly_device_status_without_revoking_session():
    new_user()
    client=TestClient(app)
    login_with_pin(client,remember=True)
    before=client.get('/api/me')
    assert before.status_code==200 and before.json()['user']['username']=='saved_demo'
    device=client.get('/api/auth/remembered/status')
    assert device.status_code==200
    assert device.json()=={'remembered':True,'username':'saved_demo','pin_length':6}
    # The same cookie is still valid after repeated refresh-status reads.
    assert client.get('/api/me').json()['user']['username']=='saved_demo'
    assert client.get('/api/auth/remembered/status').json()['remembered'] is True
    with db() as c:
        assert one(c,'SELECT count(*) n FROM sessions')['n']==1


def test_wrong_pin_is_limited_persistently_even_if_request_buckets_clear():
    new_user()
    c=TestClient(app)
    login_with_pin(c)
    c.post("/api/auth/remembered")
    for i in range(4):
        response=c.post("/api/auth/remembered/unlock",json={"pin":"000000"})
        assert response.status_code==401, (i,response.text)
        assert response.json()["detail"]=="Mã PIN không chính xác. Vui lòng thử lại."
    last=c.post("/api/auth/remembered/unlock",json={"pin":"000000"})
    assert last.status_code==429
    with db() as dbconn:
        rec=one(dbconn,"SELECT failed_attempts,locked_until FROM trusted_devices")
        assert rec["failed_attempts"]==5
        assert rec["locked_until"]>now()
    RATE_BUCKETS.clear()
    assert c.post("/api/auth/remembered/unlock",json={"pin":"543210"}).status_code==429
    assert c.get("/api/me").json()["user"] is None


def test_logout_and_password_changes_revoke_trusted_device():
    new_user()
    c=TestClient(app)
    login_with_pin(c)
    assert c.post("/api/auth/logout").status_code==200
    with db() as dbconn:
        assert one(dbconn,"SELECT COUNT(*) AS n FROM trusted_devices")["n"]==0
    assert c.post("/api/auth/remembered").json()["remembered"] is False

    login_with_pin(c)
    change=c.post("/api/me/password",json={
        "old_password":"SecurePassword123!","new_password":"EvenStrongerPassword!2"})
    assert change.status_code==200,change.text
    assert c.post("/api/auth/remembered").json()["remembered"] is False


def test_forgetting_one_device_revokes_cookie_and_token():
    new_user()
    c=TestClient(app)
    login_with_pin(c)
    assert c.post("/api/auth/remembered/forget").status_code==200
    assert c.post("/api/auth/remembered").json()["remembered"] is False
    with db() as dbconn:
        assert one(dbconn,"SELECT COUNT(*) AS n FROM trusted_devices")["n"]==0


def test_admin_enrollment_requires_password_then_pin_on_following_signin():
    c=TestClient(app)
    c.get("/")
    assert c.post("/api/auth/start",json={"username":"admin"}).status_code==200
    old_admin=c.post("/api/auth/password",json={"username":"admin","password":"mtunz7"})
    assert old_admin.status_code==200 and old_admin.json()["admin"] is True
    assert c.post("/api/me/pin/setup",json={
        "current_password":"bad","pin":"123456","pin_length":6}).status_code==401
    enrolled=c.post("/api/me/pin/setup",json={
        "current_password":"mtunz7","pin":"123456","pin_length":6})
    assert enrolled.status_code==200,enrolled.text
    assert c.get("/api/me").json()["user"]["pin_length"]==6
    assert c.post("/api/me/pin/setup",json={
        "current_password":"mtunz7","pin":"123456","pin_length":6}).status_code==409

    # A new tab (not a normal reload) forces admin authentication again.
    c.post("/api/auth/remembered")
    assert c.get("/api/me").json()["user"] is None
    c.post("/api/auth/start",json={"username":"admin"})
    stage=c.post("/api/auth/password",json={"username":"admin","password":"mtunz7"})
    assert stage.status_code==200 and stage.json()["next"]=="pin"
    wrong=c.post("/api/auth/pin",json={
        "challenge":stage.json()["challenge"],"pin":"000000"})
    assert wrong.status_code==401
    assert wrong.json()["detail"]=="Mã PIN không chính xác. Vui lòng thử lại."
    short=c.post("/api/auth/pin",json={
        "challenge":stage.json()["challenge"],"pin":"12"})
    assert short.status_code==401
    assert short.json()["detail"]=="Mã PIN không chính xác. Vui lòng thử lại."
    verified=c.post("/api/auth/pin",json={
        "challenge":stage.json()["challenge"],"pin":"123456","remember_device":True})
    assert verified.status_code==200 and verified.json()["admin"] is True
    assert verified.json()["remembered"] is False
    # Admin must never get a long-lived PIN-only login shortcut.
    assert c.post("/api/auth/remembered").json()["remembered"] is False
    assert c.get("/api/me").json()["user"] is None
    assert c.post("/api/auth/remembered/unlock",json={"pin":"123456"}).status_code==401
    c.post("/api/auth/start",json={"username":"admin"})
    refreshed=c.post("/api/auth/password",json={"username":"admin","password":"mtunz7"})
    again=c.post("/api/auth/pin",json={"challenge":refreshed.json()["challenge"],"pin":"123456"})
    assert again.status_code==200
    assert c.get("/api/me").json()["user"]["is_admin"] is True


def test_existing_login_can_opt_out_of_remembering():
    new_user()
    c=TestClient(app)
    login_with_pin(c,remember=True)
    c.post("/api/auth/remembered")
    c.post("/api/auth/start",json={"username":"saved_demo"})
    stage=c.post("/api/auth/password",json={
        "username":"saved_demo","password":"SecurePassword123!"})
    result=c.post("/api/auth/pin",json={
        "challenge":stage.json()["challenge"],"pin":"543210","remember_device":False})
    assert result.status_code==200
    assert c.post("/api/auth/remembered").json()["remembered"] is False
    assert c.get("/api/me").json()["user"] is None


def test_revoking_other_sessions_also_revokes_saved_devices():
    new_user()
    first=TestClient(app)
    second=TestClient(app)
    login_with_pin(first)
    login_with_pin(second)
    original=first.get("/api/me/sessions")
    assert original.status_code==200,original.text
    assert len(original.json()["remembered_devices"])==2
    assert sum(d["current"] for d in original.json()["remembered_devices"])==1
    revoked=first.post("/api/me/sessions/revoke-others")
    assert revoked.status_code==200,revoked.text
    current=first.get("/api/me/sessions").json()
    assert len(current["remembered_devices"])==1
    assert current["remembered_devices"][0]["current"] is True
    assert second.post("/api/auth/remembered").json()["remembered"] is False
    assert second.get("/api/me").json()["user"] is None


def test_changing_pin_revokes_saved_device_on_next_visit():
    new_user()
    client=TestClient(app)
    login_with_pin(client)
    changed=client.post("/api/me/pin",json={
        "old_pin":"543210","new_pin":"765432","pin_length":6
    })
    assert changed.status_code==200,changed.text
    assert client.post("/api/auth/remembered").json()["remembered"] is False
    assert client.get("/api/me").json()["user"] is None
