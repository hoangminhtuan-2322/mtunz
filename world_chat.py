"""mtunz World Chat + community safety.

All moderation is scoped to World Chat unless the fifth escalation locks the
whole account for 15 days. The feature remains OFF until an admin opens it.
Daily schedules use Asia/Ho_Chi_Minh and are evaluated on every request.
No background worker is needed for opens/closes.
"""
from datetime import datetime, timedelta, time as datetime_time
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Literal

ZONE = ZoneInfo("Asia/Ho_Chi_Minh")
RESET_AFTER = 30 * 86400
SPAM_WINDOW = 3
SPAM_THRESHOLD = 5
WARNINGS_PER_PENALTY = 3
MUTE_DURATIONS = (12*3600, 86400, 3*86400, 7*86400)
ACCOUNT_LOCK_SECONDS = 15*86400

def install(core):
    app, db, one, many = core.app, core.db, core.one, core.many
    current_user, require_admin = core.current_user, core.require_admin
    admin_log, verify_admin_stepup = core.admin_log, core.verify_admin_stepup
    hub = core.hub

    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS world_settings (
          id INTEGER PRIMARY KEY CHECK (id=1),
          enabled INTEGER NOT NULL DEFAULT 0,
          schedule_enabled INTEGER NOT NULL DEFAULT 0,
          open_minute INTEGER NOT NULL DEFAULT 540,
          close_minute INTEGER NOT NULL DEFAULT 1320,
          updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS world_messages (
          id INTEGER PRIMARY KEY,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          deleted_at INTEGER,
          anonymous INTEGER NOT NULL DEFAULT 0,
          attachment_id INTEGER REFERENCES attachments(id)
        );
        CREATE INDEX IF NOT EXISTS world_messages_recent_idx
          ON world_messages(created_at,id);
        CREATE TABLE IF NOT EXISTS world_penalties (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          warnings INTEGER NOT NULL DEFAULT 0,
          strikes INTEGER NOT NULL DEFAULT 0,
          last_violation_at INTEGER NOT NULL DEFAULT 0,
          window_started INTEGER NOT NULL DEFAULT 0,
          window_count INTEGER NOT NULL DEFAULT 0,
          world_muted_until INTEGER NOT NULL DEFAULT 0,
          admin_muted_until INTEGER NOT NULL DEFAULT 0,
          admin_reason TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS user_reports (
          id INTEGER PRIMARY KEY,
          reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          description TEXT NOT NULL,
          scope TEXT NOT NULL,
          source_message_id INTEGER,
          source_group_id INTEGER,
          evidence TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewed_by INTEGER,
          admin_note TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS user_reports_queue_idx
          ON user_reports(status,created_at);
        CREATE INDEX IF NOT EXISTS user_reports_reporter_idx
          ON user_reports(reporter_id,target_id,created_at);
        """)
        message_fields={v['name'] for v in c.execute('PRAGMA table_info(world_messages)')}
        if 'anonymous' not in message_fields:
            c.execute('ALTER TABLE world_messages ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0')
        if 'attachment_id' not in message_fields:
            c.execute('ALTER TABLE world_messages ADD COLUMN attachment_id INTEGER')
        c.execute("""INSERT INTO world_settings(id,enabled,schedule_enabled,open_minute,close_minute,updated_at)
                     VALUES(1,0,0,540,1320,0) ON CONFLICT(id) DO NOTHING""")

    def timestamp():
        return core.now()

    def effective_status(c, uid=None):
        settings=one(c, 'SELECT * FROM world_settings WHERE id=1')
        at=timestamp()
        minute_dt=datetime.fromtimestamp(at,ZONE)
        minute=minute_dt.hour*60+minute_dt.minute
        schedule_active=bool(settings['schedule_enabled'])
        opened=bool(settings['enabled'])
        if schedule_active:
            start,end=int(settings['open_minute']),int(settings['close_minute'])
            scheduled_open=(start<=minute<end) if start<end else (minute>=start or minute<end)
            opened=opened and scheduled_open
        else:
            scheduled_open=True
        reason=('Sắp ra mắt: quản trị viên chưa mở Chat thế giới.'
                if not settings['enabled'] else
                'Chat thế giới đang đóng theo lịch quản trị.' if not scheduled_open else '')
        result={
            'enabled':bool(settings['enabled']), 'open':opened,
            'schedule_enabled':schedule_active,
            'open_minute':settings['open_minute'],'close_minute':settings['close_minute'],
            'timezone':'Asia/Ho_Chi_Minh','server_time':at,
            'slow_seconds':int(settings['slow_seconds'] or 0),
            'announcement':settings['announcement'] or '',
            'closed_reason':reason,'next_change_at':None
        }
        if settings['enabled'] and schedule_active:
            next_min = settings['close_minute'] if scheduled_open else settings['open_minute']
            target = minute_dt.replace(hour=next_min//60,minute=next_min%60,
                                       second=0,microsecond=0)
            if target<=minute_dt:
                target+=timedelta(days=1)
            result['next_change_at']=int(target.timestamp())
        if uid is not None:
            user=one(c,'SELECT strikes,warnings,last_violation_at,world_muted_until,admin_muted_until,admin_reason FROM world_penalties WHERE user_id=?',(uid,))
            if user:
                expired=bool(user['last_violation_at'] and at-user['last_violation_at']>=RESET_AFTER)
                until=max(int(user['world_muted_until']),int(user['admin_muted_until']))
                result.update({
                    'warnings':0 if expired else user['warnings'],
                    'strikes':0 if expired else user['strikes'],
                    'muted_until':until if until>at else 0,
                    'manual_mute_until':user['admin_muted_until'] if user['admin_muted_until']>at else 0,
                    'mute_reason':user['admin_reason'] if user['admin_muted_until']>at else '',
                    'reset_at':user['last_violation_at']+RESET_AFTER if not expired and user['last_violation_at'] else 0
                })
            else:
                result.update(warnings=0,strikes=0,muted_until=0,
                              manual_mute_until=0,mute_reason='',reset_at=0)
            result['can_send']=opened and not bool(result['muted_until'])
        return result

    core.v6_world_status=effective_status

    def world_record(c,row,viewer_id=None,admin=False):
        anonymous=bool(row['anonymous'])
        return {'id':row['id'],'room_id':row['room_id'], 'sender_id':row['sender_id'] if admin or not anonymous else 0,
                'display_name':('Ẩn danh' if anonymous and not admin else row['display_name'] or 'Thành viên'),
                'anonymous':anonymous, 'is_mine':viewer_id==row['sender_id'] if viewer_id else False,
                'body':'' if row['deleted_at'] else row['body'],
                'created_at':row['created_at'],'deleted':bool(row['deleted_at']),
                'attachment':(
                    {'id':row['attachment_id'],'name':row['attachment_name'],
                     'mime':row['attachment_mime'],'size':row['attachment_size'],
                     'url':f'/api/attachments/{row["attachment_id"]}'}
                    if row['attachment_id'] and not row['deleted_at'] else None)}

    @app.get('/api/world/status')
    async def world_status(request:Request):
        user=current_user(request)
        if user['is_admin']:
            raise HTTPException(403,'Khu vực này dành cho thành viên.')
        with db() as c:
            return effective_status(c,user['id'])

    @app.get('/api/world/messages')
    async def world_history(request:Request,before:int=0,room_id:int=1):
        user=current_user(request)
        if user['is_admin']:
            raise HTTPException(403,'Khu vực này dành cho thành viên.')
        with db() as c:
            core.v6_world_room(c,room_id)
            where='WHERE m.room_id=?'
            params=[room_id]
            if before>0:
                where+=' AND m.id<?'
                params.append(before)
            rows=many(c,'''SELECT m.id,m.sender_id,m.body,m.created_at,m.deleted_at,m.anonymous,m.room_id,
                                   m.attachment_id,a.original_name AS attachment_name,
                                   a.mime AS attachment_mime,a.size AS attachment_size,u.display_name
                            FROM world_messages m JOIN users u ON u.id=m.sender_id
                            LEFT JOIN attachments a ON a.id=m.attachment_id '''+
                      where+' ORDER BY m.id DESC LIMIT 70',tuple(params))
            return {'messages':[world_record(c,x,viewer_id=user['id']) for x in rows[::-1]],
                    'status':effective_status(c,user['id'])}

    class WorldMessage(BaseModel):
        body:str=Field(default='',max_length=1200)
        attachment_id:int|None=None
        room_id:int=Field(default=1,ge=1)

    @app.post('/api/world/messages')
    async def world_send(request:Request,body:WorldMessage):
        user=current_user(request)
        if user['is_admin']:
            raise HTTPException(403,'Quản trị viên không gửi tin bằng tài khoản quản trị.')
        content=body.body.strip()
        if not content and not body.attachment_id:
            raise HTTPException(422,'Hãy nhập tin nhắn hoặc chọn tệp đính kèm.')
        at=timestamp()
        penalty_event=None
        global_lock=False
        saved=None
        with db() as c:
            state=effective_status(c,user['id'])
            if not state['open']:
                raise HTTPException(403,state['closed_reason'])
            if body.room_id!=1 and not core.v6_feature_on(c,'world_rooms'):
                raise HTTPException(403,'Phòng chủ đề đã được Admin tạm tắt.')
            core.v6_world_room(c,body.room_id,True)
            if state['muted_until']>at:
                raise HTTPException(423,{'code':'world_muted','muted_until':state['muted_until'],
                                         'strikes':state['strikes'],'warnings':state['warnings']})
            if body.attachment_id is not None:
                core.file_for_message(c,body.attachment_id,user['id'])
            c.execute('INSERT INTO world_penalties(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(user['id'],))
            # Acquire a row-level lock on PostgreSQL. Concurrent submits cannot
            # escape the 5-in-3s rule by racing on different API connections.
            c.execute('UPDATE world_penalties SET window_count=window_count WHERE user_id=?',(user['id'],))
            p=one(c,'SELECT * FROM world_penalties WHERE user_id=?',(user['id'],))
            slow=int(state.get('slow_seconds') or 0)
            last=int(p['last_sent_at'] or 0)
            if slow and last and at-last<slow:
                raise HTTPException(429,{
                    'code':'world_slow_mode','retry_after':slow-(at-last),
                    'message':f'Phòng đang bật chế độ chậm {slow} giây giữa các tin.'
                })
            expired=p['last_violation_at'] and at-p['last_violation_at']>=RESET_AFTER
            warnings=0 if expired else int(p['warnings'])
            strikes=0 if expired else int(p['strikes'])
            if p['window_started'] and 0<=at-p['window_started']<SPAM_WINDOW:
                count=int(p['window_count'])+1
                started=p['window_started']
            else:
                count=1
                started=at
            if count>=SPAM_THRESHOLD:
                warnings+=1
                if warnings>=WARNINGS_PER_PENALTY:
                    warnings=0
                    strikes=min(5,strikes+1)
                    duration=MUTE_DURATIONS[strikes-1] if strikes<5 else ACCOUNT_LOCK_SECONDS
                    until=at+duration
                    c.execute('''UPDATE world_penalties SET warnings=?,strikes=?,last_violation_at=?,
                                 window_started=0,window_count=0,world_muted_until=?
                                 WHERE user_id=?''',(warnings,strikes,at,until,user['id']))
                    if strikes==5:
                        global_lock=True
                        c.execute("""UPDATE users SET sanction_kind='lock',sanction_until=?,
                                     sanction_reason=? WHERE id=? AND is_admin=0""",
                                  (until,'Tự động khóa 15 ngày: vi phạm spam Chat thế giới 5 cấp.',user['id']))
                    text=('Tài khoản bị khóa 15 ngày do spam Chat thế giới.' if global_lock else
                          f'Chat thế giới đã khóa gửi tin cấp {strikes} đến {until}.')
                    penalty_event={'code':'world_account_locked' if global_lock else 'world_muted',
                                   'warnings':0,'strikes':strikes,'muted_until':until,
                                   'account_locked':global_lock,'duration_seconds':duration}
                    c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                              (user['id'],text,at))
                else:
                    c.execute('''UPDATE world_penalties SET warnings=?,strikes=?,last_violation_at=?,
                                 window_started=0,window_count=0,world_muted_until=0
                                 WHERE user_id=?''',(warnings,strikes,at,user['id']))
                    penalty_event={'code':'world_spam_warning','warnings':warnings,
                                   'strikes':strikes,'remaining':3-warnings}
                    c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                              (user['id'],f'Cảnh báo spam Chat thế giới {warnings}/3: không gửi 5 tin trong 3 giây.',at))
            else:
                c.execute('UPDATE world_penalties SET window_started=?,window_count=?,last_sent_at=? WHERE user_id=?',
                          (started,count,at,user['id']))
                anonymous=bool(user['world_anonymous'])
                result=c.execute('INSERT INTO world_messages(sender_id,body,created_at,anonymous,attachment_id,room_id) VALUES(?,?,?,?,?,?)',
                                 (user['id'],content,at,int(anonymous),body.attachment_id,body.room_id))
                mid=result.lastrowid
                saved={'id':mid,'room_id':body.room_id,'sender_id':0 if anonymous else user['id'],
                       'display_name':'Ẩn danh' if anonymous else user['display_name'] or 'Thành viên',
                       'anonymous':anonymous,'body':content,'created_at':at,'deleted':False,
                       'attachment':None}
                if body.attachment_id:
                    file=one(c,'SELECT id,original_name,mime,size FROM attachments WHERE id=?',
                             (body.attachment_id,))
                    saved['attachment']={'id':file['id'],'name':file['original_name'],
                                         'mime':file['mime'],'size':file['size'],
                                         'url':f'/api/attachments/{file["id"]}'}
        if penalty_event:
            if global_lock:
                await hub.user(user['id'],'account-sanction',kind='lock',
                               until=penalty_event['muted_until'],
                               reason='Vi phạm spam Chat thế giới nhiều lần.')
            else:
                await hub.user(user['id'],'world-penalty',**penalty_event)
            return JSONResponse({'detail':penalty_event},status_code=423 if penalty_event['code']!='world_spam_warning' else 429)
        await hub.broadcast_members('world-message',message=saved)
        return {'message':saved}

    class WorldConfig(BaseModel):
        enabled:bool
        schedule_enabled:bool=False
        open_minute:int=Field(ge=0,le=1439)
        close_minute:int=Field(ge=0,le=1439)
        admin_password:str=Field(min_length=1,max_length=128)
        admin_pin:str=Field(default='',max_length=6)

    @app.get('/api/admin/world')
    async def admin_world(request:Request):
        require_admin(request)
        with db() as c:
            config=effective_status(c)
            offenders=many(c,'''SELECT p.user_id,u.display_name,p.warnings,p.strikes,p.last_violation_at,
                                 p.world_muted_until,p.admin_muted_until,p.admin_reason
                                 FROM world_penalties p JOIN users u ON u.id=p.user_id
                                 WHERE p.warnings>0 OR p.strikes>0
                                    OR p.world_muted_until>? OR p.admin_muted_until>?
                                 ORDER BY p.last_violation_at DESC LIMIT 50''',(timestamp(),timestamp()))
            pending=one(c,"SELECT count(*) AS n FROM user_reports WHERE status='pending'")['n']
            total=one(c,'SELECT COUNT(*) AS n FROM world_messages')['n']
            messages=many(c,'''SELECT m.id,m.sender_id,m.body,m.created_at,m.deleted_at,m.anonymous,m.room_id,
                                   m.attachment_id,a.original_name AS attachment_name,
                                   a.mime AS attachment_mime,a.size AS attachment_size,u.display_name
                                FROM world_messages m JOIN users u ON u.id=m.sender_id
                                LEFT JOIN attachments a ON a.id=m.attachment_id
                                ORDER BY m.id DESC LIMIT 30''')
            return {'config':config,'offenders':offenders,
                    'pending_reports':pending,'total_messages':total,
                    'recent_messages':[world_record(c,r,admin=True) for r in messages]}

    @app.post('/api/admin/world/config')
    async def set_world_config(request:Request,body:WorldConfig):
        admin=require_admin(request)
        verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)
        if body.schedule_enabled and body.open_minute==body.close_minute:
            raise HTTPException(422,'Giờ mở và đóng phải khác nhau.')
        with db() as c:
            c.execute('''UPDATE world_settings SET enabled=?,schedule_enabled=?,
                         open_minute=?,close_minute=?,updated_at=? WHERE id=1''',
                      (int(body.enabled),int(body.schedule_enabled),
                       body.open_minute,body.close_minute,timestamp()))
            admin_log(c,admin['id'],'world_config_changed',
                      f'enabled={int(body.enabled)}; schedule={int(body.schedule_enabled)}; open={body.open_minute}; close={body.close_minute}')
            result=effective_status(c)
        for uid in list(hub.users):
            await hub.user(uid,'world-status',open=result['open'],enabled=result['enabled'])
        return {'ok':True,'config':result}

    class WorldMute(BaseModel):
        user_id:int
        minutes:int=Field(ge=0,le=43200)  # 0 = remove manual mute
        reason:str=Field(min_length=5,max_length=250)
        admin_password:str=Field(default='',max_length=128)
        admin_pin:str=Field(default='',max_length=6)

    @app.post('/api/admin/world/mute')
    async def admin_world_mute(request:Request,body:WorldMute):
        admin=require_admin(request)
        if admin['pin_hash']:core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        else:verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)
        at=timestamp()
        with db() as c:
            target=one(c,'SELECT id FROM users WHERE id=? AND is_admin=0',(body.user_id,))
            if not target:
                raise HTTPException(404,'Không tìm thấy thành viên.')
            c.execute('INSERT INTO world_penalties(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',
                      (body.user_id,))
            until=at+body.minutes*60 if body.minutes else 0
            c.execute('UPDATE world_penalties SET admin_muted_until=?,admin_reason=? WHERE user_id=?',
                      (until,body.reason.strip() if until else '',body.user_id))
            admin_log(c,admin['id'],'world_admin_mute',
                      f'user_id={body.user_id}; minutes={body.minutes}; reason=provided')
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                      (body.user_id,('Quản trị viên đã khóa gửi tin Chat thế giới.' if until else
                                     'Quản trị viên đã bỏ hạn chế Chat thế giới.'),at))
        await hub.user(body.user_id,'world-penalty',code='world_admin_mute',muted_until=until)
        return {'ok':True,'muted_until':until}

    class WorldReset(BaseModel):
        user_id:int
        reason:str=Field(min_length=5,max_length=250)
        admin_password:str=Field(default='',max_length=128)
        admin_pin:str=Field(default='',max_length=6)

    @app.post('/api/admin/world/reset')
    async def admin_world_reset(request:Request,body:WorldReset):
        admin=require_admin(request)
        if admin['pin_hash']:core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        else:verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)
        with db() as c:
            target=one(c,'SELECT id FROM users WHERE id=? AND is_admin=0',(body.user_id,))
            if not target:raise HTTPException(404,'Không tìm thấy thành viên.')
            c.execute('''UPDATE world_penalties SET warnings=0,strikes=0,last_violation_at=0,
                         window_count=0,window_started=0,world_muted_until=0 WHERE user_id=?''',
                      (body.user_id,))
            # This is scoped to the world penalty, never changes unrelated
            # admin sanctions or manual World Chat moderation.
            admin_log(c,admin['id'],'world_spam_reset',
                      f'user_id={body.user_id}; justification=provided')
        await hub.user(body.user_id,'world-penalty',code='world_penalty_reset')
        return {'ok':True}

    class ReportBody(BaseModel):
        target_id:int
        reason:Literal['spam','harassment','hate','fraud','impersonation','inappropriate','other']
        description:str=Field(min_length=10,max_length=1000)
        scope:Literal['profile','world','dm','group']='profile'
        message_id:int|None=None
        group_id:int|None=None

    @app.post('/api/reports')
    async def submit_report(request:Request,body:ReportBody):
        reporter=current_user(request)
        if reporter['is_admin']:
            raise HTTPException(403,'Không thể báo cáo tài khoản này.')
        target_id=body.target_id
        if target_id==reporter['id']:
            raise HTTPException(403,'Không thể báo cáo tài khoản này.')
        at=timestamp()
        desc=body.description.strip()
        if len(desc)<10:raise HTTPException(422,'Vui lòng mô tả vi phạm từ 10 ký tự.')
        with db() as c:
            if body.scope=='world' and body.message_id:
                source=one(c,'SELECT sender_id FROM world_messages WHERE id=? AND deleted_at IS NULL',(body.message_id,))
                if not source:
                    raise HTTPException(403,'Tin nhắn không hợp lệ.')
                if body.target_id not in (0,source['sender_id']):
                    raise HTTPException(403,'Tài khoản được báo cáo không khớp nội dung.')
                target_id=source['sender_id']
            if target_id==reporter['id']:
                raise HTTPException(403,'Không thể báo cáo chính mình.')
            target=one(c,'SELECT id FROM users WHERE id=? AND is_admin=0',(target_id,))
            if not target:raise HTTPException(404,'Không tìm thấy tài khoản cần báo cáo.')
            # Persistent per-user abuse control, surviving process restarts.
            recent_total=one(c,'SELECT COUNT(*) AS n FROM user_reports WHERE reporter_id=? AND created_at>?',
                             (reporter['id'],at-3600))['n']
            if recent_total>=6:
                raise HTTPException(429,'Bạn đã gửi quá nhiều báo cáo trong một giờ. Vui lòng thử lại sau.')
            evidence=''
            if body.message_id:
                if body.scope=='world':
                    msg=one(c,'SELECT sender_id,body FROM world_messages WHERE id=? AND deleted_at IS NULL',
                            (body.message_id,))
                    if not msg or msg['sender_id']!=target_id:
                        raise HTTPException(403,'Tin nhắn không hợp lệ.')
                elif body.scope=='dm':
                    msg=one(c,'''SELECT sender_id,body FROM messages WHERE id=? AND sender_id=?
                                 AND recipient_id=? AND deleted_at IS NULL''',
                            (body.message_id,target_id,reporter['id']))
                    if not msg:raise HTTPException(403,'Không thể báo cáo tin nhắn không thuộc cuộc trò chuyện.')
                elif body.scope=='group':
                    member=one(c,'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?',
                               (body.group_id,reporter['id']))
                    msg=one(c,'''SELECT sender_id,body FROM group_messages WHERE id=? AND group_id=?
                                 AND deleted_at IS NULL''',(body.message_id,body.group_id))
                    if not member or not msg or msg['sender_id']!=target_id:
                        raise HTTPException(403,'Không thể báo cáo tin nhắn nhóm không có quyền xem.')
                else:
                    raise HTTPException(422,'Hãy chọn nguồn tin nhắn hợp lệ.')
                evidence=msg['body'][:500]
            recent=one(c,'''SELECT id FROM user_reports WHERE reporter_id=? AND target_id=?
                            AND created_at>? AND status='pending' LIMIT 1''',
                       (reporter['id'],target_id,at-3600))
            if recent:
                raise HTTPException(429,'Bạn đã gửi báo cáo cho thành viên này. Vui lòng chờ admin xem xét.')
            cur=c.execute('''INSERT INTO user_reports(reporter_id,target_id,reason,description,scope,
                             source_message_id,source_group_id,evidence,created_at)
                             VALUES(?,?,?,?,?,?,?,?,?)''',
                          (reporter['id'],target_id,body.reason,desc,body.scope,
                           body.message_id,body.group_id,evidence,at))
            report_id=cur.lastrowid
            # The report row is a durable audit record. Do not impersonate an
            # administrator in the privileged admin-audit table.
        await hub.admins('world-report-new',report_id=report_id)
        return {'ok':True,'report_id':report_id,'status':'pending'}

    @app.get('/api/admin/reports')
    async def list_reports(request:Request,status:str='pending'):
        require_admin(request)
        if status not in ('pending','reviewed','dismissed','all'):
            raise HTTPException(422,'Bộ lọc không hợp lệ.')
        with db() as c:
            query='''SELECT r.*,a.display_name AS reporter_name,b.display_name AS target_name
                     FROM user_reports r JOIN users a ON a.id=r.reporter_id
                     JOIN users b ON b.id=r.target_id'''
            args=()
            if status!='all':
                query+=' WHERE r.status=?'
                args=(status,)
            query+=' ORDER BY r.created_at DESC LIMIT 120'
            rows=many(c,query,args)
            pending=one(c,"SELECT COUNT(*) AS n FROM user_reports WHERE status='pending'")['n']
            return {'reports':rows,'pending':pending}

    class ReportReview(BaseModel):
        decision:Literal['reviewed','dismissed']
        note:str=Field(min_length=5,max_length=600)
        admin_password:str=Field(min_length=1,max_length=128)
        admin_pin:str=Field(default='',max_length=6)

    @app.post('/api/admin/reports/{report_id}/review')
    async def review_report(request:Request,report_id:int,body:ReportReview):
        admin=require_admin(request)
        verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)
        at=timestamp()
        with db() as c:
            report=one(c,'SELECT * FROM user_reports WHERE id=?',(report_id,))
            if not report:raise HTTPException(404,'Báo cáo không tồn tại.')
            if report['status']!='pending':raise HTTPException(409,'Báo cáo đã được xử lý.')
            c.execute('''UPDATE user_reports SET status=?,admin_note=?,reviewed_at=?,reviewed_by=?
                         WHERE id=?''',(body.decision,body.note.strip(),at,admin['id'],report_id))
            admin_log(c,admin['id'],'member_report_review',
                      f'report_id={report_id}; decision={body.decision}; target_id={report["target_id"]}')
            c.execute('INSERT INTO notifications(user_id,body,created_at) VALUES(?,?,?)',
                      (report['reporter_id'],
                       'Báo cáo #'+str(report_id)+' đã được quản trị viên xem xét.',at))
        await hub.user(report['reporter_id'],'notifications-updated')
        return {'ok':True,'decision':body.decision}

    class DeleteWorldMessage(BaseModel):
        reason:str=Field(min_length=5,max_length=250)
        admin_password:str=Field(min_length=1,max_length=128)
        admin_pin:str=Field(default='',max_length=6)

    @app.post('/api/admin/world/messages/{message_id}/remove')
    async def remove_world_message(request:Request,message_id:int,body:DeleteWorldMessage):
        admin=require_admin(request)
        verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)
        at=timestamp()
        with db() as c:
            msg=one(c,'SELECT sender_id FROM world_messages WHERE id=?',(message_id,))
            if not msg:raise HTTPException(404,'Không tìm thấy tin nhắn.')
            c.execute("UPDATE world_messages SET deleted_at=COALESCE(deleted_at,?),body='' WHERE id=?",
                      (at,message_id))
            admin_log(c,admin['id'],'world_message_removed',f'message_id={message_id}; justification=provided')
        for uid in list(hub.users):
            await hub.user(uid,'world-message-removed',message_id=message_id)
        return {'ok':True}
