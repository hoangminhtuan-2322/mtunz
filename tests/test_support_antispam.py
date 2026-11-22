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
    resp = admin.post(endpoint, json={'status': 'spam','admin_pin':'2345'})
    assert resp.status_code == 200, resp.text
    assert next(x for x in admin.get('/api/admin/tickets').json()['tickets']
                if x['id'] == ticket)['status'] == 'spam'
    blocked = guest.post(f'/api/support/tickets/{ticket}/messages', json={'body': 'Cố tình spam'})
    assert blocked.status_code == 403
    with db() as c:
        log = c.execute("SELECT action FROM audit WHERE action='support_mark_spam'").fetchone()
    assert log is not None
    assert admin.post(endpoint, json={'status': 'open','admin_pin':'2345'}).status_code == 200
    assert guest.post(f'/api/support/tickets/{ticket}/messages',
                      json={'body': 'Tin nhắn hợp lệ sau khi mở lại'}).status_code == 200


def test_support_ticket_accepts_empty_optional_memory():
    guest = TestClient(app)
    assert guest.get('/').status_code == 200
    response = guest.post('/api/support/tickets', json={'kind': 'other', 'claim': ''})
    assert response.status_code == 200, response.text
    ticket_id = response.json()['id']
    with db() as c:
        ticket = c.execute('SELECT kind, claim FROM tickets WHERE id=?', (ticket_id,)).fetchone()
    assert ticket['kind'] == 'other'
    assert ticket['claim'] == ''


def test_admin_can_pause_new_intake_while_open_chats_continue():
    admin=logged_admin()
    guest,ticket=guest_ticket()
    intake='/api/admin/support/intake'
    assert guest.patch(intake,json={'paused':True,'admin_pin':'2345'}).status_code==401
    assert admin.patch(intake,json={'paused':True}).status_code==401
    try:
        assert admin.patch(intake,json={'paused':True,'admin_pin':'2345'}).json()['paused']
        assert admin.get('/api/admin/tickets').json()['paused']
        assert guest.get('/api/support/tickets').json()['paused']
        fresh=TestClient(app)
        fresh.get('/')
        blocked=fresh.post('/api/support/tickets',json={'kind':'other'})
        assert blocked.status_code==503 and blocked.json()['detail']['code']=='support_paused'
        assert guest.post(f'/api/support/tickets/{ticket}/messages',json={'body':'Tiếp tục hỗ trợ'}).status_code==200
        assert admin.post(f'/api/admin/tickets/{ticket}/messages',
                          json={'body':'Đã nhận','admin_pin':'2345'}).status_code==200
        assert len(guest.get(f'/api/support/tickets/{ticket}/messages').json()['messages'])==2
    finally:
        assert not admin.patch(intake,json={'paused':False,'admin_pin':'2345'}).json()['paused']
    assert fresh.post('/api/support/tickets',json={'kind':'other'}).status_code==200


def test_delete_closed_ticket_removes_history_and_revokes_unused_grant():
    from test_flows import register_user

    admin=logged_admin()
    guest=register_user(admin,'old_support')
    res=guest.post('/api/support/tickets',json={'kind':'pin','claim':'Nội dung cần xóa'})
    assert res.status_code==200,res.text
    ticket=res.json()['id']
    path=f'/api/admin/tickets/{ticket}'
    assert guest.request('DELETE',path,json={'admin_pin':'2345'}).status_code==403
    assert admin.request('DELETE',path,json={'admin_pin':'2345'}).status_code==409
    issued=admin.post(path+'/grant',json={'username':'old_support','verified':True,'admin_pin':'2345'})
    assert issued.status_code==200,issued.text
    history=f'/api/support/tickets/{ticket}/messages'
    text=guest.get(history).json()['messages'][-1]['body']
    code=text.split(': ')[-1].split('.')[0]
    assert admin.post(path+'/status',json={'status':'closed','admin_pin':'2345'}).status_code==200
    assert guest.get(history).json()['status']=='closed'
    assert admin.request('DELETE',path,json={}).status_code==401
    assert admin.request('DELETE',path,json={'admin_pin':'2345'}).status_code==200
    assert guest.get(history).status_code==404
    assert admin.get(path+'/messages').status_code==404
    assert not any(item['id']==ticket for item in admin.get('/api/admin/tickets').json()['tickets'])
    assert not any(item['id']==ticket for item in guest.get('/api/support/tickets').json()['tickets'])
    assert guest.post('/api/support/reset',json={'code':code,'new_value':'6789','pin_length':4}).status_code==403
    with db() as c:
        assert c.execute('SELECT 1 FROM ticket_messages WHERE ticket_id=?',(ticket,)).fetchone() is None
        assert c.execute('SELECT 1 FROM recovery_grants WHERE ticket_id=?',(ticket,)).fetchone() is None
        tombstone=c.execute('SELECT guest_id,owner_id,claim FROM tickets WHERE id=?',(ticket,)).fetchone()
        assert tuple(tombstone)==('',None,'')
        assert c.execute("SELECT 1 FROM audit WHERE action='support_delete' AND detail=?",(f'ticket_id={ticket}',)).fetchone()
