"""Admin V5 security operations: live risk indicators and emergency containment.

All privileged writes require the currently authenticated admin session and PIN.
Do not expose IP addresses, cookie values, password hashes, tokens or raw PII.
"""
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field


class PinOnly(BaseModel):
    admin_pin:str=Field(min_length=4,max_length=6)


class Lockdown(PinOnly):
    enabled:bool


def install(core):
    app,db,one=core.app,core.db,core.one
    now=core.now
    with db() as c:
        c.execute("INSERT INTO settings(key,value) VALUES('emergency_lockdown','0'),('maintenance_mode','0') ON CONFLICT(key) DO NOTHING")

    @app.get('/api/admin/security/overview')
    async def security_overview(request:Request):
        admin=core.require_admin(request)
        with db() as c:
            active=one(c,'SELECT COUNT(*) n FROM sessions WHERE user_id=? AND expires_at>?',(admin['id'],now()))['n']
            approvals=one(c,"SELECT COUNT(*) n FROM admin_login_requests WHERE user_id=? AND state='pending' AND expires_at>?",(admin['id'],now()))['n']
            denied=one(c,"SELECT COUNT(*) n FROM audit WHERE action IN ('admin_pin_denied','admin_stepup_denied') AND created_at>=?",(now()-86400,))['n']
            pending=one(c,"SELECT COUNT(*) n FROM registrations WHERE status='pending'")['n']
            world=one(c,"SELECT enabled,schedule_enabled FROM world_settings WHERE id=1")
            emergency=one(c,"SELECT value FROM settings WHERE key='emergency_lockdown'")
            maintenance=core.maintenance_enabled(c)
            failed=one(c,'SELECT failures,locked_until FROM admin_pin_attempts WHERE admin_id=?',(admin['id'],))
        return {'pin_enabled':bool(admin['pin_hash']),'pin_length':admin['pin_length'],
                'admin_sessions':int(active),'session_limit':2,'pending_approvals':int(approvals),
                'rejected_sensitive_actions_24h':int(denied),'pending_registrations':int(pending),
                'world_enabled':bool(world and world['enabled']),
                'world_scheduled':bool(world and world['schedule_enabled']),
                'emergency_lockdown':bool(emergency and emergency['value']=='1'),
                'maintenance_mode':maintenance,
                'pin_lockout_until':int(failed['locked_until']) if failed else 0,
                'pin_failures':int(failed['failures']) if failed else 0,
                'admin_session_ttl_minutes':120,
                'updated_at':now()}

    @app.post('/api/admin/security/revoke-others')
    async def revoke_other_admin_sessions(request:Request,body:PinOnly):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'security-revoke-others',8,3600,str(admin['id']))
        cookie=request.cookies.get('s')
        current_hash=core.digest(cookie or '')
        with db() as c:
            active=one(c,'SELECT 1 FROM sessions WHERE user_id=? AND token_hash=? AND expires_at>?',
                       (admin['id'],current_hash,now()))
            if not active:raise HTTPException(401,'Phiên quản trị hiện tại không còn hiệu lực.')
            result=c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',
                            (admin['id'],current_hash))
            revoked=max(0,result.rowcount)
            c.execute('DELETE FROM trusted_devices WHERE user_id=?',(admin['id'],))
            c.execute('DELETE FROM admin_login_requests WHERE user_id=?',(admin['id'],))
            core.admin_log(c,admin['id'],'admin_other_sessions_revoked',
                           f'count={revoked}; pending_approvals_cleared=true')
        await core.hub.terminate_user(admin['id'],except_hash=current_hash)
        return {'ok':True,'revoked_sessions':revoked,'current_session_preserved':True}

    @app.post('/api/admin/security/lockdown')
    async def change_emergency_lockdown(request:Request,body:Lockdown):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'security-lockdown',8,3600,str(admin['id']))
        with db() as c:
            c.execute("INSERT INTO settings(key,value) VALUES('emergency_lockdown',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                      ('1' if body.enabled else '0',))
            if body.enabled:
                c.execute('UPDATE world_settings SET enabled=0,schedule_enabled=0,updated_at=? WHERE id=1',(now(),))
            core.admin_log(c,admin['id'],'admin_emergency_lockdown',
                           'enabled' if body.enabled else 'disabled')
        # Wake persisted scheduled jobs as soon as the lockdown is lifted.
        if not body.enabled and getattr(core,'messenger_v4_wake',None):
            core.messenger_v4_wake.set()
        await core.hub.broadcast_members('emergency-mode',enabled=bool(body.enabled))
        return {'ok':True,'enabled':bool(body.enabled),
                'world_chat_disabled':bool(body.enabled)}

    @app.post('/api/admin/security/maintenance')
    async def change_maintenance(request:Request,body:Lockdown):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'security-maintenance',12,3600,str(admin['id']))
        with db() as c:
            c.execute("UPDATE settings SET value=? WHERE key='maintenance_mode'", ('1' if body.enabled else '0',))
            revoked=set()
            if body.enabled:
                revoked={row['token_hash'] for row in c.execute("""DELETE FROM sessions
                    WHERE user_id IN (SELECT id FROM users WHERE is_admin=0) RETURNING token_hash""")}
            core.admin_log(c,admin['id'],'maintenance_mode','enabled' if body.enabled else 'disabled')
        hub=core.hub
        sockets=[ws for ws, token_hash in hub.session_hashes.items() if token_hash in revoked]
        for token_hash in revoked:
            hub.valid_session_until.pop(token_hash,None)
        await hub.send(sockets,{'type':'maintenance-mode'})
        for ws in sockets:
            try:
                await ws.close(code=1008)
            except Exception:
                pass
        return {'enabled':bool(body.enabled),'revoked_sessions':len(revoked)}
