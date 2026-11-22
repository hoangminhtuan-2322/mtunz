"""Native auth regression on disposable local SQLite database."""
import os
import tempfile
os.environ.setdefault('DATA_DIR', tempfile.mkdtemp(prefix='mtunz_native_test_'))
import pytest
from fastapi.testclient import TestClient
from app import app, db, RATE_BUCKETS, hub
from test_flows import logged_admin, register_user


@pytest.fixture(autouse=True)
def clean_native():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('scheduled_messages','admin_login_requests','message_requests',
                      'world_messages','world_penalties','user_reports','message_pins',
                      'group_messages','group_members','chat_groups','reactions',
                      'chat_preferences','attachments','recovery_grants','ticket_messages',
                      'tickets','notifications','messages','friendships','blocks',
                      'restrictions','sessions','trusted_devices','login_challenges',
                      'registrations','audit','account_deletion_requests'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
    yield
    RATE_BUCKETS.clear()


def test_native_pin_session_chat_ws_and_revocation():
    admin = logged_admin()
    browser = register_user(admin, 'native_member')
    user_id = browser.get('/api/me').json()['user']['id']
    native = TestClient(app)
    password = native.post('/api/mobile/auth/password',
                           json={'username':'native_member','password':'GreatPassword123'})
    assert password.status_code == 200, password.text
    challenge = password.json()['challenge']
    assert native.post('/api/auth/pin', json={'challenge':challenge,'pin':'1234'}).status_code == 401
    assert native.post('/api/mobile/auth/pin',
                       json={'challenge':challenge,'pin':'bad-pin'}).status_code == 401
    verified = native.post('/api/mobile/auth/pin', json={'challenge':challenge,'pin':'1234'})
    assert verified.status_code == 200, verified.text
    token = verified.json()['access_token']
    headers = {'Authorization': 'Bearer ' + token}
    # No session cookie is needed; both API and WebSocket honor revocable session.
    assert 's' not in verified.cookies
    me = native.get('/api/me', headers=headers)
    assert me.status_code == 200 and me.json()['user']['id'] == user_id
    assert native.get('/api/friends', headers=headers).status_code == 200
    with native.websocket_connect('/ws', headers=headers):
        assert bool(hub.users.get(user_id))
    revoked = native.post('/api/auth/logout', headers=headers)
    assert revoked.status_code == 200
    assert native.get('/api/me', headers=headers).json()['user'] is None


def test_native_rejects_admin_and_wrong_password():
    admin = logged_admin()
    client = TestClient(app)
    assert client.post('/api/mobile/auth/password',
        json={'username':'admin','password':'mtunz7'}).status_code == 401
    assert client.post('/api/mobile/auth/password',
        json={'username':'missing_user','password':'x'}).status_code == 401
