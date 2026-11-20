"""Admin V7 diagnostic: server-derived readiness and risk indicators.

No credentials, raw IPs, usernames, message text or authentication tokens are
returned. Read-only report; cannot mutate security policy or change permissions.
"""
import os
import time
from fastapi import Request


def install(core):
    app,db,one=core.app,core.db,core.one

    @app.get('/api/admin/ops/security-readiness')
    async def readiness(request:Request):
        admin=core.require_admin(request)
        at=core.now()
        start=time.perf_counter()
        with db() as c:
            def count(query,args=()):
                return int(one(c,query,args)['n'])
            sessions=count('SELECT COUNT(*) n FROM sessions WHERE user_id=? AND expires_at>?',(admin['id'],at))
            recent_pin=count("SELECT COUNT(*) n FROM audit WHERE action='admin_pin_denied' AND created_at>?",(at-86400,))
            approvals=count("SELECT COUNT(*) n FROM admin_login_requests WHERE state='pending' AND expires_at>?",(at,))
            reports=count("SELECT COUNT(*) n FROM user_reports WHERE status='pending'")
            appeals=count("SELECT COUNT(*) n FROM sanction_appeals WHERE status='pending'")
            events=count("SELECT COUNT(*) n FROM community_events WHERE canceled_at IS NULL AND ends_at>?",(at,))
            overdue=count("SELECT COUNT(*) n FROM scheduled_messages WHERE state='pending' AND send_at<?",(at-120,))
            lockdown=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
            pin=one(c,'SELECT pin_hash FROM users WHERE id=?',(admin['id'],))
        latency_ms=round((time.perf_counter()-start)*1000,1)
        alerts=[]
        if not pin or not pin['pin_hash']:
            alerts.append({'severity':'high','code':'admin_pin_off','summary':'PIN quản trị chưa được bật'})
        if sessions>1:
            alerts.append({'severity':'info','code':'second_session','summary':f'Có {sessions} phiên quản trị hoạt động'})
        if recent_pin>=3:
            alerts.append({'severity':'high','code':'pin_denied','summary':f'{recent_pin} lần PIN sai trong 24 giờ'})
        if approvals:
            alerts.append({'severity':'medium','code':'approvals','summary':f'{approvals} yêu cầu đăng nhập đang chờ'})
        if overdue:
            alerts.append({'severity':'medium','code':'scheduled_overdue','summary':f'{overdue} tin hẹn giờ đang quá hạn 2 phút'})
        if appeals:
            alerts.append({'severity':'info','code':'appeals','summary':f'{appeals} kháng nghị cần xem xét'})
        if reports:
            alerts.append({'severity':'info','code':'reports','summary':f'{reports} báo cáo vi phạm chưa xử lý'})
        if latency_ms>800:
            alerts.append({'severity':'medium','code':'db_latency','summary':'Phản hồi truy vấn chỉ số Neon đang chậm'})
        # These are operational recommendations, not promises of security.
        checklist=[
            {'id':'admin_pin','label':'PIN quản trị','ok':bool(pin and pin['pin_hash'])},
            {'id':'session_limit','label':'Giới hạn phiên Admin','ok':sessions<=2},
            {'id':'emergency','label':'Chế độ khẩn cấp','ok':True},
            {'id':'incident_review','label':'Hàng chờ báo cáo/kháng nghị','ok':reports==0 and appeals==0},
            {'id':'schedule','label':'Hàng đợi tin nhắn hẹn giờ','ok':overdue==0},
        ]
        return {'generated_at':at,'db_query_ms':latency_ms,
                'status':'emergency' if lockdown and lockdown['value']=='1' else
                         'attention' if any(a['severity']=='high' for a in alerts) else 'monitoring',
                'active_admin_sessions':sessions,'pending_approvals':approvals,
                'pending_appeals':appeals,'pending_reports':reports,
                'community_events':events,'overdue_scheduled':overdue,
                'pin_denials_24h':recent_pin,'emergency_lockdown':bool(lockdown and lockdown['value']=='1'),
                'checks':checklist,'alerts':alerts,
                'notes':[
                    'Chỉ số WebSocket trong một instance không thay thế giám sát đa instance.',
                    'Không có kiểm chứng snapshot Neon mới nhất trong báo cáo này.',
                    'WebRTC cần TURN để hoạt động ổn định qua NAT/firewall khắt khe.',
                ]}
