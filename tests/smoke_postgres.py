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

        rejected=guest.patch("/api/me/profile",json={"display_name":"Chưa xác minh"})
        assert rejected.status_code==403,rejected.text
        renamed=guest.post("/api/me/identity/display_name",json={
            "new_value":"Minh đã xác minh","password":"RenderTestPassword123!","pin":"123456"})
        assert renamed.status_code==200,renamed.text
        assert renamed.json()["quota"]["display_name"]["remaining"]==1
        saved=guest.patch("/api/me/profile",json={"bio":"Kiểm thử hồ sơ PostgreSQL"})
        assert saved.status_code==200,saved.text
        assert guest.get("/api/me").json()["user"]["display_name"]=="Minh đã xác minh"

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
            assert guest.post(f"/api/friends/request/{victim['id']}").status_code==200
            assert peer.post(f"/api/friends/accept/{original['id']}").status_code==200
            alias=guest.put(f"/api/chats/{victim['id']}/nickname",json={"nickname":"Bạn thử nghiệm"})
            assert alias.status_code==200,alias.text
            assert guest.get("/api/friends").json()["friends"][0]["nickname"]=="Bạn thử nghiệm"
            direct=guest.post("/api/messages",json={"recipient_id":victim["id"],"body":"https://example.org/share"})
            assert direct.status_code==200,direct.text
            shared=f"/api/chats/dm/{original['id']}/shared"
            assert peer.get(shared).json()["items"]==[]
            links=peer.get(shared,params={"kind":"links"})
            assert links.status_code==200,links.text
            assert links.json()["items"][0]["links"][0]["host"]=="example.org"

            video=b"\x00\x00\x00\x18ftypisom"+bytes(range(64))
            uploaded=guest.post("/api/uploads",files={"file":("clip.mp4",video,"video/mp4")})
            assert uploaded.status_code==200,uploaded.text
            media=uploaded.json()["attachment"]["url"]
            assert peer.get(media,headers={"Range":"bytes=0-1"}).status_code==403
            attached=guest.post("/api/messages",json={"recipient_id":victim["id"],
                "attachment_id":uploaded.json()["attachment"]["id"]})
            assert attached.status_code==200,attached.text
            piece=peer.get(media,headers={"Range":"bytes=0-1"})
            assert piece.status_code==206 and piece.content==video[:2]
            assert piece.headers["content-range"]==f"bytes 0-1/{len(video)}"
            assert piece.headers["accept-ranges"]=="bytes"
            tail=peer.get(media,headers={"Range":"bytes=-4"})
            assert tail.status_code==206 and tail.content==video[-4:]
            outside=peer.get(media,headers={"Range":f"bytes={len(video)}-"})
            assert outside.status_code==416 and outside.headers["content-range"]==f"bytes */{len(video)}"
            full=peer.get(media,params={"download":"1"},headers={"Range":"bytes=0-1"})
            assert full.status_code==200 and full.content==video
            assert full.headers["content-disposition"].startswith("attachment;")

            group=guest.post("/api/groups",json={"title":"Nhóm kiểm thử","member_ids":[victim["id"]]})
            assert group.status_code==200,group.text
            gid=group.json()["id"]
            send={"body":"Nhắn một lần","client_message_id":"c_postgres_retry_1234567"}
            grouped=guest.post(f"/api/groups/{gid}/messages",json=send)
            assert grouped.status_code==200,grouped.text
            repeat=guest.post(f"/api/groups/{gid}/messages",json=send)
            assert repeat.json()["message"]["id"]==grouped.json()["message"]["id"]
            seen=peer.get(f"/api/groups/{gid}/messages")
            assert seen.status_code==200 and seen.json()["first_unread_id"]==grouped.json()["message"]["id"],seen.text
            complaint=peer.post("/api/reports",json={
                "target_id":original["id"],"scope":"world","message_id":message_id,
                "reason":"spam","description":"Tin nhắn công cộng cần kiểm tra"})
            assert complaint.status_code==200,complaint.text
            report_id=complaint.json()["report_id"]
            assert report_id>0
            started=admin.post(f"/api/admin/reports/{report_id}/review",json={
                "decision":"in_review","note":"Đang kiểm tra","admin_pin":"2345"})
            assert started.status_code==200,started.text
            review=admin.post(f"/api/admin/reports/{report_id}/review",json={
                "decision":"reviewed","note":"Đã kiểm tra trên PostgreSQL",
                "admin_pin":"2345"})
            assert review.status_code==200,review.text
            history=admin.get(f"/api/admin/reports/{report_id}/history").json()["events"]
            assert [event["status"] for event in history]==["in_review","reviewed"]

        ticket=guest.post("/api/support/tickets",json={"kind":"other","claim":"Kiểm thử xóa phiếu"})
        assert ticket.status_code==200,ticket.text
        ticket_id=ticket.json()["id"]
        intake="/api/admin/support/intake"
        assert admin.patch(intake,json={"paused":True,"admin_pin":"2345"}).json()["paused"]
        assert guest.post("/api/support/tickets",json={"kind":"other"}).json()["detail"]["code"]=="support_paused"
        assert guest.post(f"/api/support/tickets/{ticket_id}/messages",json={"body":"Tin nhắn kiểm thử"}).status_code==200
        path=f"/api/admin/tickets/{ticket_id}"
        assert admin.post(path+"/status",json={"status":"closed","admin_pin":"2345"}).status_code==200
        assert admin.request("DELETE",path,json={"admin_pin":"2345"}).status_code==200
        assert guest.get(f"/api/support/tickets/{ticket_id}/messages").status_code==404
        assert not admin.patch(intake,json={"paused":False,"admin_pin":"2345"}).json()["paused"]

        # Exercise the integrated game against disposable PostgreSQL, not production.
        fish=guest.get('/api/fishing/state')
        assert fish.status_code==200,fish.text
        assert fish.json()['gold']==150
        assert len(fish.json()['daily']['quests'])==3
        cast=guest.post('/api/fishing/cast',json={'region':0,'bait':0})
        assert cast.status_code==200,cast.text
        active=cast.json()['cast']
        assert active and active['region']==0 and 'fish' not in active
        assert guest.post('/api/fishing/cancel',json={'cast_id':active['id'],'step':active['step']}).json()['cast'] is None
        assert guest.post('/api/fishing/sell-common',json={'fish_ids':['0'*32]}).json()['gold']==150
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
