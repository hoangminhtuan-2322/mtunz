"""Immutable audit search/details and sensitive admin management authorization."""
from fastapi.testclient import TestClient
from app import app, db, RATE_BUCKETS
from test_flows import logged_admin, register_user, clean_database


def test_audit_drilldown_filters_and_integrity():
    RATE_BUCKETS.clear()
    admin = logged_admin()
    member = register_user(admin, 'audit_case')
    user_id = member.get('/api/me').json()['user']['id']

    # Existing entries retain a stable identity and actor when queried.
    listing = admin.get('/api/admin/audit?limit=10&offset=0')
    assert listing.status_code == 200, listing.text
    data = listing.json()
    assert set(('logs', 'total', 'offset', 'has_more')).issubset(data)
    assert data['logs']
    event = data['logs'][0]
    assert event['id'] >= 1
    assert event['admin_username'] == 'admin'
    assert event['severity'] in ('high', 'medium', 'info')

    detail = admin.get(f"/api/admin/audit/{event['id']}")
    assert detail.status_code == 200, detail.text
    assert detail.json()['event']['id'] == event['id']
    assert detail.json()['event']['created_at'] == event['created_at']

    filt = admin.get('/api/admin/audit?limit=10&action=registration_approved')
    assert filt.status_code == 200
    assert all(x['action'] == 'registration_approved' for x in filt.json()['logs'])
    search = admin.get('/api/admin/audit?q=audit_case')
    assert search.status_code == 200
    assert any('audit_case' in x['detail'] for x in search.json()['logs'])
    assert admin.get('/api/admin/audit?limit=101').status_code == 422
    assert admin.get('/api/admin/audit?offset=-1').status_code == 422
    assert admin.get('/api/admin/audit?since=500&until=100').status_code == 422
    assert admin.get('/api/admin/audit/99999999').status_code == 404
    assert admin.delete(f"/api/admin/audit/{event['id']}").status_code == 405
    assert admin.patch(f"/api/admin/audit/{event['id']}", json={'detail': 'altered'}).status_code == 405

    guest = TestClient(app)
    guest.get('/')
    assert guest.get('/api/admin/audit').status_code == 401
    assert member.get('/api/admin/audit').status_code == 403
    assert guest.get(f"/api/admin/audit/{event['id']}").status_code == 401
    assert member.get(f"/api/admin/audit/{event['id']}").status_code == 403
    assert admin.get(f'/api/admin/users/{user_id}/details').status_code == 200


def test_sensitive_admin_user_edit_and_session_revoke():
    RATE_BUCKETS.clear()
    admin = logged_admin()
    member = register_user(admin, 'editable_member')
    user_id = member.get('/api/me').json()['user']['id']
    endpoint = f'/api/admin/users/{user_id}/edit'
    payload = {'display_name': 'Tên được chỉnh', 'bio': 'Cập nhật hồ sơ',
               'phone': '0912345678', 'email': 'test@example.com',
               'reason': 'Yêu cầu hỗ trợ từ người dùng'}

    assert member.post(endpoint, json={**payload, 'admin_pin':'2345'}).status_code == 403
    assert TestClient(app).post(endpoint, json={**payload, 'admin_pin':'2345'}).status_code == 401
    assert admin.post(endpoint, json={**payload, 'admin_pin':'0000'}).status_code == 401
    assert admin.post(endpoint, json=payload).status_code == 401
    assert admin.post(endpoint, json={**payload, 'admin_pin':'2345'}).status_code == 200
    info = admin.get(f'/api/admin/users/{user_id}/details').json()['user']
    assert info['display_name'] == 'Tên được chỉnh'
    assert info['phone'] == '+84912345678'
    assert info['email'] == 'test@example.com'

    revoke = f'/api/admin/users/{user_id}/sessions/revoke'
    reason = {'reason': 'Người dùng yêu cầu thu hồi phiên'}
    assert member.post(revoke, json={**reason, 'admin_pin':'2345'}).status_code == 403
    assert admin.post(revoke, json={**reason, 'admin_pin':'0000'}).status_code == 401
    result = admin.post(revoke, json={**reason, 'admin_pin':'2345'})
    assert result.status_code == 200, result.text
    assert result.json()['sessions_revoked'] >= 1
    assert member.get('/api/me').json()['user'] is None
    with db() as c:
        logs = c.execute("SELECT action, detail FROM audit WHERE action IN "
                         "('admin_edit_user','admin_revoke_user_sessions')").fetchall()
        assert any(r['action'] == 'admin_edit_user' for r in logs)
        assert any(r['action'] == 'admin_revoke_user_sessions' for r in logs)
        assert all('test@example.com' not in r['detail'] for r in logs)


def test_maintenance_member_reset_is_high_impact():
    """Data resets must not appear as ordinary informational events."""
    from app import enrich_audit
    example = {'id': 14, 'action': 'maintenance_member_reset', 'detail':
               'Non-admin accounts and user-generated data reset; '
               'administrator and configuration retained', 'admin_username': 'admin'}
    enriched = enrich_audit(example)
    assert enriched['severity'] == 'high'
    assert enriched['detail'] == example['detail']
