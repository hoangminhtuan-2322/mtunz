"""Anti-spam controls for anonymous support chats directed at administrators."""
from fastapi.testclient import TestClient
import pytest
import app as core
from app import app, db, RATE_BUCKETS
from test_flows import logged_admin, clean_database


@pytest.fixture(autouse=True)
def reset_support_limits(clean_database):
    RATE_BUCKETS.clear()
    with db() as c:
        c.execute('DELETE FROM support_rate_limits')


def guest_ticket():
    guest = TestClient(app)
    assert guest.get('/').status_code == 200
    r = guest.post('/api/support/tickets', json={'kind': 'other', 'claim': 'Cần được hỗ trợ'})
    assert r.status_code == 200, r.text
    return guest, r.json()['id']


def test_support_rejects_rapid_and_duplicate_messages(monkeypatch):
    base = (core.now() // 60) * 60 + 10
    monkeypatch.setattr(core, 'now', lambda: base)
    guest, ticket = guest_ticket()
    path = f'/api/support/tickets/{ticket}/messages'
    assert guest.post(path, json={'body': ' Xin chào admin '}).status_code == 200
    denied = guest.post(path, json={'body': 'Nội dung khác'})
    assert denied.status_code == 429
    assert int(denied.headers['Retry-After']) >= 1

    monkeypatch.setattr(core, 'now', lambda: base + 5)
    repeat = guest.post(path, json={'body': 'xin   chào ADMIN'})
    assert repeat.status_code == 429
    assert guest.post(path, json={'body': '   '}).status_code == 422
    assert guest.post(path, json={'body': 'Mình cần tư vấn tài khoản.'}).status_code == 200
    with db() as c:
        rows = c.execute('SELECT body FROM ticket_messages WHERE ticket_id=?', (ticket,)).fetchall()
    assert [r['body'] for r in rows] == ['Xin chào admin', 'Mình cần tư vấn tài khoản.']


def test_support_message_limit_survives_memory_reset(monkeypatch):
    base = (core.now() // 60) * 60 + 1
    monkeypatch.setattr(core, 'now', lambda: base)
    guest, ticket = guest_ticket()
    path = f'/api/support/tickets/{ticket}/messages'
    for i in range(6):
        monkeypatch.setattr(core, 'now', lambda i=i: base + 4*i)
        response = guest.post(path, json={'body': f'Câu hỏi riêng số {i}'})
        assert response.status_code == 200, response.text
    RATE_BUCKETS.clear()  # A new worker or restart cannot reset the DB quota.
    monkeypatch.setattr(core, 'now', lambda: base + 25)
    blocked = guest.post(path, json={'body': 'Vượt giới hạn 6 tin trong một phút'})
    assert blocked.status_code == 429
    assert int(blocked.headers['Retry-After']) > 0
    with db() as c:
        assert c.execute('SELECT COUNT(*) AS n FROM ticket_messages WHERE ticket_id=?',
                         (ticket,)).fetchone()['n'] == 6
    # A fresh window allows a legitimate message.
    monkeypatch.setattr(core, 'now', lambda: base + 61)
    assert guest.post(path, json={'body': 'Câu hỏi tiếp theo'}).status_code == 200


def test_support_ticket_creation_limits_and_open_ticket_cap(monkeypatch):
    base = (core.now() // 60) * 60 + 1
    monkeypatch.setattr(core, 'now', lambda: base)
    guest, first = guest_ticket()
    RATE_BUCKETS.clear()
    immediate = guest.post('/api/support/tickets', json={'kind': 'other'})
    assert immediate.status_code == 429

    monkeypatch.setattr(core, 'now', lambda: base + 61)
    second = guest.post('/api/support/tickets', json={'kind': 'password'})
    assert second.status_code == 200, second.text
    assert second.json()['id'] != first
    monkeypatch.setattr(core, 'now', lambda: base + 122)
    third = guest.post('/api/support/tickets', json={'kind': 'pin'})
    assert third.status_code == 429  # Never flood admin with open tickets.


def test_admin_can_mark_spam_and_reopen(monkeypatch):
    base = (core.now() // 60) * 60 + 1
    monkeypatch.setattr(core, 'now', lambda: base)
    admin = logged_admin()
    guest, ticket = guest_ticket()
    endpoint = f'/api/admin/tickets/{ticket}/status'
    assert guest.post(endpoint, json={'status': 'spam'}).status_code in (401, 403)
    resp = admin.post(endpoint, json={'status': 'spam'})
    assert resp.status_code == 200, resp.text
    assert next(x for x in admin.get('/api/admin/tickets').json()['tickets']
                if x['id'] == ticket)['status'] == 'spam'
    blocked = guest.post(f'/api/support/tickets/{ticket}/messages', json={'body': 'Cố tình spam'})
    assert blocked.status_code == 403
    with db() as c:
        log = c.execute("SELECT action FROM audit WHERE action='support_mark_spam'").fetchone()
    assert log is not None
    assert admin.post(endpoint, json={'status': 'open'}).status_code == 200
    assert guest.post(f'/api/support/tickets/{ticket}/messages',
                      json={'body': 'Tin nhắn hợp lệ sau khi mở lại'}).status_code == 200
