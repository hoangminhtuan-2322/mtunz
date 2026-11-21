"""V6 Admin operations: real metrics, monitored security signals and feature flags.

No secrets, IP addresses, passwords, personal messages or user identity appear
in the telemetry response. Flags can be modified only with active Admin + PIN.
"""
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from typing import Literal
import time

FLAGS=(
    ('registration_intake','Tiếp nhận đăng ký','Cho phép gửi yêu cầu đăng ký mới',1),
    ('member_uploads','Tải tệp và sticker','Cho phép tải tệp, ảnh, sticker và ghi âm mới',1),
    ('calls','Gọi thoại / video','Cho phép bắt đầu cuộc gọi WebRTC giữa bạn bè',1),
    ('disappearing_dm','Tin nhắn tự biến mất','Cho phép cài thời hạn tự xóa cho các tin nhắn mới',1),
    ('community_polls','Bình chọn cộng đồng','Cho phép thành viên bình chọn trong Chat thế giới',1),
    ('world_rooms','Phòng Chat thế giới','Cho phép lựa chọn phòng chủ đề đang được Admin mở',1),
)
FLAG_CODES={x[0] for x in FLAGS}

class FlagChange(BaseModel):
    code:Literal['calls','disappearing_dm','community_polls','world_rooms','registration_intake','member_uploads']
    enabled:bool
    admin_pin:str=Field(min_length=4,max_length=6)

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
          CREATE TABLE IF NOT EXISTS feature_flags(
            code TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL DEFAULT 0
          );
        """)
        for code,_,__,default in FLAGS:
            c.execute('INSERT INTO feature_flags(code,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO NOTHING',
                      (code,default,core.now()))

    def is_enabled(c,code):
        item=one(c,'SELECT enabled FROM feature_flags WHERE code=?',(code,))
        return bool(item['enabled']) if item else False
    core.v6_feature_on=is_enabled

    @app.get('/api/features')
    async def member_feature_flags(request:Request):
        core.current_user(request)
        with db() as c:
            return {'features':{row['code']:bool(row['enabled']) for row in c.execute('SELECT code,enabled FROM feature_flags') if row['code'] in FLAG_CODES}}

    @app.get('/api/admin/ops/overview')
    async def admin_ops_overview(request:Request):
        admin=core.require_admin(request)
        start=time.perf_counter()
        current=core.now()
        with db() as c:
            def count(table,where='',args=()):
                return int(one(c,'SELECT COUNT(*) AS n FROM '+table+((' WHERE '+where) if where else ''),
                               args)['n'])
            messages=count('messages','created_at>=?',(current-3600,))
            messages_day=count('messages','created_at>=?',(current-86400,))
            group_hour=count('group_messages','created_at>=?',(current-3600,))
            world_hour=count('world_messages','created_at>=?',(current-3600,))
            active=count('sessions','expires_at>? AND user_id IN (SELECT id FROM users WHERE is_admin=0)',(current,))
            pending=count('user_reports',"status='pending'")
            pending_reg=count('registrations',"status='pending'")
            failed_jobs=count('scheduled_messages',"state='failed'")
            due_jobs=count('scheduled_messages',"state='pending' AND send_at<=?",(current,))
            pending_approval=count('admin_login_requests',"state='pending' AND expires_at>?",(current,))
            pin_failures=count('audit',"action='admin_pin_denied' AND created_at>=?",(current-86400,))
            blocked_sessions=count('admin_pin_attempts','locked_until>?',(current,))
            open_support=count('tickets',"status='open'")
            rooms=many(c,'SELECT id,slug,title,active FROM world_rooms ORDER BY id')
            flags=[{'code':code,'title':title,'description':description,
                    'enabled':is_enabled(c,code)} for code,title,description,_ in FLAGS]
        online=sum(1 for uid,sockets in core.hub.users.items() if sockets and uid!=admin['id'])
        elapsed=round((time.perf_counter()-start)*1000,1)
        alerts=[]
        if blocked_sessions:alerts.append({'level':'high','kind':'pin','text':'Có phiên xác minh PIN Admin đang bị khóa do nhiều lần nhập sai.'})
        if pending_approval:alerts.append({'level':'high','kind':'approvals','text':f'{pending_approval} thiết bị đang chờ Admin duyệt.'})
        if pin_failures>=3:alerts.append({'level':'medium','kind':'pin','text':f'{pin_failures} lần nhập PIN Admin sai trong 24 giờ.'})
        if failed_jobs:alerts.append({'level':'medium','kind':'schedule','text':f'{failed_jobs} tin hẹn giờ không thể gửi; cần kiểm tra quyền hoặc tệp.'})
        if pending:alerts.append({'level':'info','kind':'reports','text':f'{pending} báo cáo cộng đồng cần xét duyệt.'})
        if due_jobs:alerts.append({'level':'info','kind':'schedule','text':f'{due_jobs} tin hẹn giờ quá hạn đang chờ xử lý.'})
        return {'server_time':current,'database_response_ms':elapsed,
                'online_members':online,'active_member_sessions':active,
                'direct_messages_1h':messages,'direct_messages_24h':messages_day,
                'group_messages_1h':group_hour,'world_messages_1h':world_hour,
                'pending_reports':pending,'pending_registrations':pending_reg,
                'failed_scheduled':failed_jobs,'overdue_scheduled':due_jobs,
                'open_support_tickets':open_support,'pending_admin_approvals':pending_approval,
                'admin_pin_denials_24h':pin_failures,'alerts':alerts,
                'rooms':rooms,'flags':flags,
                'caveat':'Số trực tuyến là người dùng đang kết nối WebSocket tới instance hiện tại; không phải tổng toàn cụm.'}

    @app.post('/api/admin/ops/flags')
    async def admin_change_flag(request:Request,body:FlagChange):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'admin-feature-flags',16,3600,str(admin['id']))
        with db() as c:
            c.execute('UPDATE feature_flags SET enabled=?,updated_at=? WHERE code=?',
                      (int(body.enabled),core.now(),body.code))
            core.admin_log(c,admin['id'],'feature_flag_changed',
                           f'code={body.code};enabled={int(body.enabled)}')
        await core.hub.broadcast_members('feature-flags-updated',code=body.code)
        return {'ok':True,'code':body.code,'enabled':body.enabled}
