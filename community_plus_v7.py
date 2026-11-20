"""mtunz V6+ community events and sanction appeals.

All actions are bound to sessions; Admin writes require a fresh PIN. Members
cannot view other members' appeals and cannot RSVP for an inactive room.
"""
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from typing import Literal


class EventCreate(BaseModel):
    room_id:int=Field(gt=0)
    title:str=Field(min_length=5,max_length=100)
    details:str=Field(default='',max_length=600)
    starts_at:int=Field(gt=0)
    ends_at:int=Field(gt=0)
    admin_pin:str=Field(min_length=4,max_length=6)

class EventStatus(BaseModel):
    canceled:bool
    admin_pin:str=Field(min_length=4,max_length=6)

class AppealCreate(BaseModel):
    reason:str=Field(min_length=15,max_length=900)

class AppealDecision(BaseModel):
    outcome:Literal['accepted','rejected']
    note:str=Field(min_length=10,max_length=500)
    admin_pin:str=Field(min_length=4,max_length=6)


def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
          CREATE TABLE IF NOT EXISTS community_events (
            id INTEGER PRIMARY KEY,
            room_id INTEGER NOT NULL REFERENCES world_rooms(id),
            creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
            starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            canceled_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS community_events_schedule_idx
            ON community_events(starts_at,id);
          CREATE TABLE IF NOT EXISTS community_event_rsvps (
            event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(event_id,user_id)
          );
          CREATE TABLE IF NOT EXISTS sanction_appeals (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_at INTEGER,
            reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            review_note TEXT NOT NULL DEFAULT ''
          );
          CREATE INDEX IF NOT EXISTS sanction_appeals_pending_idx
            ON sanction_appeals(status,created_at);
        """)

    def event_view(c,row,uid=0):
        attendance=one(c,'SELECT COUNT(*) n FROM community_event_rsvps WHERE event_id=?',(row['id'],))['n']
        own=bool(uid and one(c,'SELECT 1 FROM community_event_rsvps WHERE event_id=? AND user_id=?',(row['id'],uid)))
        return {'id':row['id'],'room_id':row['room_id'],'title':row['title'],
                'details':row['details'],'starts_at':row['starts_at'],
                'ends_at':row['ends_at'],'canceled':bool(row['canceled_at']),
                'attendees':attendance,'attending':own}

    @app.get('/api/community/events')
    async def events(request:Request,room_id:int=0):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Chỉ dành cho thành viên.')
        if room_id<0:raise HTTPException(422,'Phòng không hợp lệ.')
        with db() as c:
            rows=many(c,'''SELECT e.* FROM community_events e
                 JOIN world_rooms r ON r.id=e.room_id
                 WHERE (?=0 OR e.room_id=?) AND e.ends_at>?
                   AND r.active=1 AND e.canceled_at IS NULL
                 ORDER BY e.starts_at ASC LIMIT 30''',
                 (room_id,room_id,core.now()-3600))
            return {'events':[event_view(c,row,u['id']) for row in rows]}

    @app.get('/api/admin/community/events')
    async def admin_events(request:Request):
        core.require_admin(request)
        with db() as c:
            rows=many(c,'SELECT * FROM community_events ORDER BY starts_at DESC LIMIT 40')
            return {'events':[event_view(c,row) for row in rows]}

    @app.post('/api/admin/community/events')
    async def create_event(request:Request,body:EventCreate):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'create-community-event',20,3600,str(admin['id']))
        at=core.now()
        if body.starts_at<at+60 or body.starts_at>at+90*86400 or body.ends_at<=body.starts_at or body.ends_at-body.starts_at>7*86400:
            raise HTTPException(422,'Sự kiện phải bắt đầu sau tối thiểu 1 phút, trong 90 ngày tới và kéo dài không quá 7 ngày.')
        with db() as c:
            room=one(c,'SELECT active FROM world_rooms WHERE id=?',(body.room_id,))
            if not room or not room['active']:
                raise HTTPException(403,'Chỉ tạo sự kiện trong phòng đang mở.')
            upcoming=one(c,'SELECT COUNT(*) n FROM community_events WHERE canceled_at IS NULL AND ends_at>?',(at,))['n']
            if upcoming>=40:raise HTTPException(409,'Đã đạt giới hạn 40 sự kiện sắp tới.')
            cur=c.execute('''INSERT INTO community_events
                      (room_id,creator_id,title,details,starts_at,ends_at,created_at)
                      VALUES(?,?,?,?,?,?,?)''',
                      (body.room_id,admin['id'],body.title.strip(),body.details.strip(),body.starts_at,body.ends_at,at))
            eid=cur.lastrowid
            core.admin_log(c,admin['id'],'community_event_created',f'event_id={eid};room={body.room_id}')
        await core.hub.broadcast_members('community-events-updated',room_id=body.room_id)
        return {'ok':True,'id':eid}

    @app.post('/api/admin/community/events/{event_id}/cancel')
    async def cancel_event(request:Request,event_id:int,body:EventStatus):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        if not body.canceled:raise HTTPException(422,'Chỉ cho phép hủy, không khôi phục sự kiện đã hủy.')
        with db() as c:
            row=one(c,'SELECT id,room_id,canceled_at FROM community_events WHERE id=?',(event_id,))
            if not row:raise HTTPException(404,'Không tìm thấy sự kiện.')
            if row['canceled_at']:raise HTTPException(409,'Sự kiện đã hủy.')
            c.execute('UPDATE community_events SET canceled_at=? WHERE id=?',(core.now(),event_id))
            core.admin_log(c,admin['id'],'community_event_canceled',f'event_id={event_id}')
        await core.hub.broadcast_members('community-events-updated',room_id=row['room_id'])
        return {'ok':True}

    @app.post('/api/community/events/{event_id}/rsvp')
    async def rsvp_event(request:Request,event_id:int):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Tài khoản quản trị không tham gia sự kiện.')
        core.throttle(request,'event-rsvp',25,3600,str(u['id']))
        with db() as c:
            row=one(c,'''SELECT e.id,e.room_id,e.starts_at,e.ends_at,e.canceled_at,r.active
                         FROM community_events e JOIN world_rooms r ON r.id=e.room_id
                         WHERE e.id=?''',(event_id,))
            if not row or row['canceled_at'] or not row['active'] or row['ends_at']<=core.now():
                raise HTTPException(403,'Sự kiện không còn nhận đăng ký.')
            old=one(c,'SELECT 1 FROM community_event_rsvps WHERE event_id=? AND user_id=?',(event_id,u['id']))
            if old:
                c.execute('DELETE FROM community_event_rsvps WHERE event_id=? AND user_id=?',(event_id,u['id']))
            else:
                c.execute('INSERT INTO community_event_rsvps(event_id,user_id,created_at) VALUES(?,?,?)',
                          (event_id,u['id'],core.now()))
            new=event_view(c,one(c,'SELECT * FROM community_events WHERE id=?',(event_id,)),u['id'])
        return {'event':new}

    def current_sanction(c,u):
        at=core.now()
        p=one(c,'SELECT world_muted_until,admin_muted_until FROM world_penalties WHERE user_id=?',(u['id'],))
        muted=bool(p and max(int(p['world_muted_until'] or 0),int(p['admin_muted_until'] or 0))>at)
        account=bool(u['sanction_kind'] and (not u['sanction_until'] or u['sanction_until']>at))
        return 'account' if account else 'world' if muted else ''

    @app.get('/api/me/appeals')
    async def my_appeals(request:Request):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Admin không gửi kháng nghị.')
        with db() as c:
            rows=many(c,'''SELECT id,kind,reason,created_at,status,reviewed_at,review_note
                           FROM sanction_appeals WHERE user_id=?
                           ORDER BY id DESC LIMIT 15''',(u['id'],))
            return {'appeals':rows}

    @app.post('/api/me/appeals')
    async def appeal(request:Request,body:AppealCreate):
        # Current-user checks can block suspended accounts; the endpoint still
        # permits active World Chat sanctions without weakening account login.
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Admin không gửi kháng nghị.')
        core.throttle(request,'submit-appeal',4,86400,str(u['id']))
        with db() as c:
            kind=current_sanction(c,u)
            if not kind:raise HTTPException(403,'Chỉ kháng nghị khi đang bị hạn chế.')
            pending=one(c,"SELECT 1 FROM sanction_appeals WHERE user_id=? AND status='pending'",(u['id'],))
            if pending:raise HTTPException(409,'Bạn đã có kháng nghị đang chờ xử lý.')
            at=core.now()
            recent=one(c,'SELECT COUNT(*) n FROM sanction_appeals WHERE user_id=? AND created_at>?',(u['id'],at-30*86400))['n']
            if recent>=3:raise HTTPException(429,'Bạn đã đạt số lần kháng nghị trong 30 ngày.')
            row=c.execute('INSERT INTO sanction_appeals(user_id,kind,reason,created_at) VALUES(?,?,?,?)',
                          (u['id'],kind,body.reason.strip(),at))
        await core.hub.admins('appeal-new')
        return {'ok':True,'id':row.lastrowid}

    @app.get('/api/admin/appeals')
    async def admin_appeals(request:Request):
        core.require_admin(request)
        with db() as c:
            rows=many(c,'''SELECT a.id,a.user_id,a.kind,a.reason,a.created_at,a.status,
                                    a.reviewed_at,a.review_note,
                                    u.public_id,u.display_name
                             FROM sanction_appeals a JOIN users u ON u.id=a.user_id
                             ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,
                                      a.id DESC LIMIT 80''')
            return {'appeals':rows}

    @app.post('/api/admin/appeals/{appeal_id}/decision')
    async def decide_appeal(request:Request,appeal_id:int,body:AppealDecision):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'appeal-decision',30,3600,str(admin['id']))
        with db() as c:
            appeal=one(c,"SELECT * FROM sanction_appeals WHERE id=? AND status='pending'",(appeal_id,))
            if not appeal:raise HTTPException(409,'Kháng nghị không còn chờ xử lý.')
            changed=c.execute('''UPDATE sanction_appeals SET status=?,reviewed_at=?,reviewed_by=?,review_note=?
                        WHERE id=? AND status='pending' ''',
                        (body.outcome,core.now(),admin['id'],body.note.strip(),appeal_id))
            if changed.rowcount!=1:raise HTTPException(409,'Kháng nghị đã được xử lý.')
            if body.outcome=='accepted':
                if appeal['kind']=='world':
                    c.execute('''UPDATE world_penalties SET world_muted_until=0,
                              admin_muted_until=0,admin_reason='' WHERE user_id=?''',(appeal['user_id'],))
                else:
                    c.execute("UPDATE users SET sanction_kind=NULL,sanction_until=NULL,sanction_reason='' WHERE id=?",
                              (appeal['user_id'],))
            core.admin_log(c,admin['id'],'appeal_reviewed',
                           f'appeal_id={appeal_id};outcome={body.outcome};category={appeal["kind"]}')
        await core.hub.user(appeal['user_id'],'appeal-reviewed',outcome=body.outcome)
        return {'ok':True}
