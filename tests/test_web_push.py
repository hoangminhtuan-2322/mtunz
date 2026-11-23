"""Backend Web Push regression coverage with a fake gateway."""
import json
import time
from queue import Empty, Queue

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
import pytest
from requests import Response

import app as core
import web_notifications as push
from test_flows import clean_database, logged_admin, register_user


@pytest.fixture
def gateway(monkeypatch, clean_database):
    with core.db() as connection:
        connection.execute('DELETE FROM web_push_subscriptions')
        connection.execute('DELETE FROM support_rate_limits')
        connection.execute("UPDATE settings SET value='0' WHERE key='support_intake_paused'")
    sent = Queue()

    def capture(subscription, **kwargs):
        sent.put((subscription['endpoint'], json.loads(kwargs['data'])))
        response = Response()
        response.status_code = 201
        return response

    monkeypatch.setattr(push, 'webpush', capture)
    return sent


def subscribe(client, suffix, sound=True):
    key = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        Encoding.X962, PublicFormat.UncompressedPoint)
    endpoint = f'https://fcm.googleapis.com/fcm/send/test-{suffix}'
    result = client.post('/api/me/push', json={
        'endpoint': endpoint, 'keys': {'p256dh': push.b64(key), 'auth': push.b64(b'a'*16)},
        'sound': sound})
    assert result.status_code == 200, result.text
    return endpoint


def receive_until(socket, kind):
    while True:
        event = socket.receive_json()
        if event['type'] == kind:
            return event


def wait_for_foreground(client, expected):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if bool(client.portal.call(lambda: core.hub.foreground.copy())) == expected:
            return
        time.sleep(.005)
    pytest.fail('WebSocket visibility update was not applied')


def test_admin_background_alerts_and_foreground_suppression(gateway):
    admin = logged_admin()
    endpoint = subscribe(admin, 'admin', sound=False)
    browser = TestClient(core.app)
    browser.get('/')
    with TestClient(core.app) as running:
        running.cookies.update(browser.cookies)
        with running.websocket_connect('/ws', cookies=dict(admin.cookies)) as socket:
            socket.send_json({'type': 'alert-visibility', 'visible': True})
            wait_for_foreground(running, True)
            result = running.post('/api/registration/request', json={
                'username': 'needs_review', 'phone': '0912345612'})
            assert result.status_code == 200
            assert receive_until(socket, 'registration-updated')['new_request']
            with pytest.raises(Empty):
                gateway.get(timeout=.15)
            socket.send_json({'type': 'alert-visibility', 'visible': False})
            wait_for_foreground(running, False)
            ticket = running.post('/api/support/tickets', json={'kind': 'other', 'claim': 'Private claim'})
            assert ticket.status_code == 200, ticket.text
            tid = ticket.json()['id']
            assert receive_until(socket, 'support-updated')['new_request']
            assert gateway.get(timeout=3) == (endpoint, {'type': 'support', 'chat_id': tid, 'silent': True})
        result = running.post(f'/api/support/tickets/{tid}/messages', json={'body': 'Private help request'})
        assert result.status_code == 200, result.text
        assert gateway.get(timeout=3) == (endpoint, {'type': 'support', 'chat_id': tid, 'silent': True})
        result = running.post('/api/registration/request', json={'username': 'second_review', 'phone': '0912345613'})
        assert result.status_code == 200
        assert gateway.get(timeout=3) == (endpoint, {'type': 'registration', 'chat_id': 0, 'silent': True})
        assert running.post('/api/registration/request', json={'username': 'second_review', 'phone': '0912345613'}).status_code == 200
        with pytest.raises(Empty):
            gateway.get(timeout=.15)


def test_member_gets_background_chat_and_logout_removes_subscription(gateway):
    admin = logged_admin()
    sender = register_user(admin, 'push_sender')
    receiver = register_user(admin, 'push_receiver')
    sender_id, receiver_id = (client.get('/api/me').json()['user']['id'] for client in (sender, receiver))
    assert sender.post(f'/api/friends/request/{receiver_id}').status_code == 200
    assert receiver.post(f'/api/friends/accept/{sender_id}').status_code == 200
    endpoint = subscribe(receiver, 'recipient')
    with TestClient(core.app) as running:
        running.cookies.update(sender.cookies)
        with running.websocket_connect('/ws', cookies=dict(receiver.cookies)) as socket:
            socket.send_json({'type': 'alert-visibility', 'visible': False})
            assert running.post('/api/messages', json={'recipient_id': receiver_id, 'body': 'Private message'}).status_code == 200
            receive_until(socket, 'message')
            assert gateway.get(timeout=3) == (endpoint, {'type': 'dm', 'chat_id': sender_id, 'silent': False})
        assert receiver.post('/api/auth/lock').status_code == 200
        assert running.post('/api/messages', json={'recipient_id': receiver_id, 'body': 'App is closed'}).status_code == 200
        assert gateway.get(timeout=3) == (endpoint, {'type': 'dm', 'chat_id': sender_id, 'silent': False})

        challenge = receiver.post('/api/auth/password', json={
            'username': 'push_receiver', 'password': 'GreatPassword123'}).json()['challenge']
        assert receiver.post('/api/auth/pin', json={'challenge': challenge, 'pin': '1234'}).status_code == 200
        assert receiver.post('/api/auth/logout').status_code == 200
        assert running.post('/api/messages', json={'recipient_id': receiver_id, 'body': 'After explicit logout'}).status_code == 200
        with pytest.raises(Empty):
            gateway.get(timeout=.2)


def test_test_push_respects_device_preferences_and_reports_expired_subscription(gateway, monkeypatch):
    admin = logged_admin()
    assert admin.post('/api/me/push/test').status_code == 409
    endpoint = subscribe(admin, 'testing')
    assert admin.patch('/api/me/push', json={'sound': False}).json() == {'sound': False}
    assert admin.get('/api/me/push').json()['sound'] is False
    assert admin.post('/api/me/push/test').json() == {'accepted': True}
    assert gateway.get(timeout=3) == (endpoint, {'type': 'test', 'chat_id': 0, 'silent': True})

    def expired(subscription, **kwargs):
        response = Response()
        response.status_code = 410
        raise push.WebPushException('Expired subscription', response=response)

    monkeypatch.setattr(push, 'webpush', expired)
    assert admin.post('/api/me/push/test').status_code == 503
    assert admin.get('/api/me/push').json()['enabled'] is False


def test_push_test_uses_real_encryption_and_vapid_signing(monkeypatch, clean_database):
    import requests

    with core.db() as connection:
        connection.execute('DELETE FROM web_push_subscriptions')
    admin = logged_admin()
    endpoint = subscribe(admin, 'encrypted')
    calls = []

    def deliver(self, method, url, **kwargs):
        calls.append((method, url, kwargs))
        response = Response()
        response.status_code = 201
        return response

    monkeypatch.setattr(requests.Session, 'request', deliver)
    assert admin.post('/api/me/push/test').json() == {'accepted': True}
    [(method, url, options)] = calls
    assert (method, url) == ('POST', endpoint)
    headers = {name.lower(): value for name, value in options['headers'].items()}
    assert headers['content-encoding'] == 'aes128gcm'
    assert headers['authorization'].startswith('vapid t=')
    assert options['allow_redirects'] is False
    assert b'"type"' not in options['data']
