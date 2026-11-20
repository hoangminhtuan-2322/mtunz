"""V6 community: controlled topic rooms, one-vote polls and Admin announcements.

No public direct write APIs to create rooms or polls. Admin actions are PIN
protected, and voting is bound to a real user id at database uniqueness level.
"""
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from typing import Literal

DEFAULT_ROOMS=(('general','Chung'),('study','Học tập'),('technology','Công nghệ'),
               ('gaming','Game'),('chill','Tâm sự'))

class RoomCreate(BaseModel):
    slug:str=Field(min_length=3,max_length=24,pattern=r'^[a-z][a-z0-9_-]+$')
    title:str=Field(min_length=3,max_length=40)
    active:bool=False
    admin_pin:str=Field(min_length=4,max_length=6)

class RoomToggle(BaseModel):
    active:bool
    admin_pin:str=Field(min_length=4,max_length=6)

class PollCreate(BaseModel):
    room_id:int=Field(gt=0)
    question:str=Field(min_length=5,max_length=180)
    options:list[str]=Field(min_length=2,max_length=6)
    duration_minutes:int=Field(default=1440,ge=5,le=10080)
    admin_pin:str=Field(min_length=4,max_length=6)

class PollVote(BaseModel):
    option_id:int=Field(gt=0)

class PinnedNotice(BaseModel):
    announcement:str=Field(default='',max_length=400)
    slow_seconds:Literal[0,5,10,30,60]=0
    admin_pin:str=Field(min_length=4,max_length=6)


def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        settings={r['name'] for r in c.execute('PRAGMA table_info(world_settings)')}
        if 'slow_seconds' not in settings:
            c.execute('ALTER TABLE world_settings ADD COLUMN slow_seconds INTEGER NOT NULL DEFAULT 0')
        if 'announcement' not in settings:
            c.execute("ALTER TABLE world_settings ADD COLUMN announcement TEXT NOT NULL DEFAULT ''")
        messages={r['name'] for r in c.execute('PRAGMA table_info(world_messages)')}
        if 'room_id' not in messages:
            c.execute('ALTER TABLE world_messages ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1')
        penalties={r['name'] for r in c.execute('PRAGMA table_info(world_penalties)')}
        if 'last_sent_at' not in penalties:
            c.execute('ALTER TABLE world_penalties ADD COLUMN last_sent_at INTEGER NOT NULL DEFAULT 0')
        c.executescript("""
          CREATE TABLE IF NOT EXISTS world_rooms(
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS world_polls(
            id INTEGER PRIMARY KEY,
            room_id INTEGER NOT NULL REFERENCES world_rooms(id),
            question TEXT NOT NULL,
            creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            closes_at INTEGER NOT NULL,
            closed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS world_poll_room_idx ON world_polls(room_id,created_at);
          CREATE TABLE IF NOT EXISTS world_poll_options(
            id INTEGER PRIMARY KEY,
            poll_id INTEGER NOT NULL REFERENCES world_polls(id) ON DELETE CASCADE,
            text TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS world_poll_votes(
            poll_id INTEGER NOT NULL REFERENCES world_polls(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            option_id INTEGER NOT NULL REFERENCES world_poll_options(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(poll_id,user_id)
          );
        """)
        for slug,title in DEFAULT_ROOMS:
            c.execute('''INSERT INTO world_rooms(slug,title,active,created_at)
                         VALUES(?,?,?,?) ON CONFLICT(slug) DO NOTHING''',
                      (slug,title,1 if slug=='general' else 0,core.now()))

    def available_room(c,room_id,write=False):
        row=one(c,'SELECT * FROM world_rooms WHERE id=?',(room_id,))
        if not row:raise HTTPException(404,'Không tìm thấy phòng Chat thế giới.')
        if write and not row['active']:
            raise HTTPException(403,'Phòng này đang đóng bởi Admin.')
        return row

    core.v6_world_room=available_room

    @app.get('/api/world/rooms')
    async def list_rooms(request:Request):
        user=core.current_user(request)
        if user['is_admin']:raise HTTPException(403,'Dành cho thành viên.')
        with db() as c:
            rooms=many(c,'''SELECT r.id,r.slug,r.title,r.active,
                 (SELECT COUNT(*) FROM world_messages m WHERE m.room_id=r.id AND m.deleted_at IS NULL) AS total_messages
                 FROM world_rooms r ORDER BY id ASC''')
        return {'rooms':rooms}

    @app.get('/api/admin/world/rooms')
    async def admin_rooms(request:Request):
        core.require_admin(request)
        with db() as c:
            rows=many(c,'SELECT * FROM world_rooms ORDER BY id')
        return {'rooms':rows}

    @app.post('/api/admin/world/rooms')
    async def admin_create_room(request:Request,body:RoomCreate):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        core.throttle(request,'world-room-create',12,3600,str(admin['id']))
        with db() as c:
            total=one(c,'SELECT COUNT(*) n FROM world_rooms')['n']
            if total>=12:raise HTTPException(409,'Tối đa 12 phòng chủ đề.')
            if one(c,'SELECT 1 FROM world_rooms WHERE slug=?',(body.slug,)):
                raise HTTPException(409,'Tên đường dẫn phòng đã tồn tại.')
            result=c.execute('INSERT INTO world_rooms(slug,title,active,created_at) VALUES(?,?,?,?)',
                             (body.slug,body.title.strip(),int(body.active),core.now()))
            core.admin_log(c,admin['id'],'world_room_created',
                           f'room_id={result.lastrowid}; active={int(body.active)}')
        await core.hub.broadcast_members('world-rooms-updated')
        return {'ok':True,'id':result.lastrowid}

    @app.patch('/api/admin/world/rooms/{room_id}')
    async def admin_toggle_room(request:Request,room_id:int,body:RoomToggle):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        with db() as c:
            room=available_room(c,room_id)
            c.execute('UPDATE world_rooms SET active=? WHERE id=?',(int(body.active),room_id))
            core.admin_log(c,admin['id'],'world_room_updated',
                           f'room_id={room_id};active={int(body.active)}')
        await core.hub.broadcast_members('world-rooms-updated')
        return {'ok':True}

    def render_poll(c,poll,user_id):
        rows=many(c,'''SELECT o.id,o.text,COUNT(v.user_id) AS votes
                       FROM world_poll_options o
                       LEFT JOIN world_poll_votes v ON v.option_id=o.id AND v.poll_id=o.poll_id
                       WHERE o.poll_id=? GROUP BY o.id,o.text ORDER BY o.id''',(poll['id'],))
        chosen=one(c,'SELECT option_id FROM world_poll_votes WHERE poll_id=? AND user_id=?',
                   (poll['id'],user_id)) if user_id else None
        return {'id':poll['id'],'room_id':poll['room_id'],'question':poll['question'],
                'created_at':poll['created_at'],'closes_at':poll['closes_at'],
                'closed':bool(poll['closed_at'] or poll['closes_at']<=core.now()),
                'own_vote':chosen['option_id'] if chosen else None,
                'options':[{'id':r['id'],'text':r['text'],'votes':int(r['votes'])} for r in rows],
                'total_votes':sum(int(r['votes']) for r in rows)}

    @app.get('/api/world/polls')
    async def world_polls(request:Request,room_id:int=1):
        user=core.current_user(request)
        if user['is_admin']:raise HTTPException(403,'Dành cho thành viên.')
        with db() as c:
            available_room(c,room_id)
            rows=many(c,'SELECT * FROM world_polls WHERE room_id=? ORDER BY id DESC LIMIT 8',(room_id,))
            return {'polls':[render_poll(c,r,user['id']) for r in rows]}

    @app.post('/api/admin/world/polls')
    async def admin_create_poll(request:Request,body:PollCreate):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        items=[x.strip() for x in body.options]
        if any(len(x)<1 or len(x)>80 for x in items) or len(set(x.lower() for x in items))!=len(items):
            raise HTTPException(422,'Lựa chọn không hợp lệ hoặc trùng nhau.')
        with db() as c:
            available_room(c,body.room_id,True)
            existing=one(c,'''SELECT 1 FROM world_polls WHERE room_id=?
                               AND closed_at IS NULL AND closes_at>?''',(body.room_id,core.now()))
            if existing:raise HTTPException(409,'Phòng này đã có một bình chọn đang mở.')
            cur=c.execute('''INSERT INTO world_polls(room_id,question,creator_id,created_at,closes_at)
                             VALUES(?,?,?,?,?)''',
                           (body.room_id,body.question.strip(),admin['id'],core.now(),
                            core.now()+body.duration_minutes*60))
            for item in items:
                c.execute('INSERT INTO world_poll_options(poll_id,text) VALUES(?,?)',
                          (cur.lastrowid,item))
            core.admin_log(c,admin['id'],'world_poll_created',f'room={body.room_id};poll={cur.lastrowid}')
            identifier=cur.lastrowid
        await core.hub.broadcast_members('world-poll-updated',room_id=body.room_id)
        return {'ok':True,'id':identifier}

    @app.post('/api/world/polls/{poll_id}/vote')
    async def vote_world_poll(request:Request,poll_id:int,body:PollVote):
        user=core.current_user(request)
        if user['is_admin']:raise HTTPException(403,'Admin không bỏ phiếu bằng tài khoản quản trị.')
        core.throttle(request,'world-poll-vote',30,3600,str(user['id']))
        with db() as c:
            poll=one(c,'SELECT * FROM world_polls WHERE id=?',(poll_id,))
            if not poll:raise HTTPException(404,'Bình chọn không tồn tại.')
            available_room(c,poll['room_id'],True)
            world=one(c,'SELECT enabled FROM world_settings WHERE id=1')
            if not world or not world['enabled'] or poll['closed_at'] or poll['closes_at']<=core.now():
                raise HTTPException(403,'Bình chọn đã đóng.')
            if not one(c,'SELECT 1 FROM world_poll_options WHERE id=? AND poll_id=?',
                       (body.option_id,poll_id)):
                raise HTTPException(422,'Lựa chọn không thuộc bình chọn.')
            cur=c.execute('''INSERT INTO world_poll_votes(poll_id,user_id,option_id,created_at)
                             VALUES(?,?,?,?) ON CONFLICT(poll_id,user_id) DO NOTHING''',
                          (poll_id,user['id'],body.option_id,core.now()))
            if cur.rowcount!=1:raise HTTPException(409,'Bạn đã bình chọn trước đó.')
            updated=render_poll(c,poll,user['id'])
        await core.hub.broadcast_members('world-poll-updated',room_id=poll['room_id'])
        return {'poll':updated}

    @app.post('/api/admin/world/polls/{poll_id}/close')
    async def admin_close_poll(request:Request,poll_id:int,body:RoomToggle):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        with db() as c:
            poll=one(c,'SELECT id,room_id FROM world_polls WHERE id=?',(poll_id,))
            if not poll:raise HTTPException(404,'Không tìm thấy bình chọn.')
            c.execute('UPDATE world_polls SET closed_at=COALESCE(closed_at,?) WHERE id=?',
                      (core.now(),poll_id))
            core.admin_log(c,admin['id'],'world_poll_closed',f'poll={poll_id}')
        await core.hub.broadcast_members('world-poll-updated',room_id=poll['room_id'])
        return {'ok':True}

    @app.post('/api/admin/world/controls')
    async def admin_controls(request:Request,body:PinnedNotice):
        admin=core.require_admin(request)
        core.verify_admin_pin_stepup(request,admin,body.admin_pin)
        with db() as c:
            c.execute('UPDATE world_settings SET slow_seconds=?,announcement=?,updated_at=? WHERE id=1',
                      (body.slow_seconds,body.announcement.strip(),core.now()))
            core.admin_log(c,admin['id'],'world_controls_changed',
                           f'slow={body.slow_seconds};announcement_len={len(body.announcement.strip())}')
        await core.hub.broadcast_members('world-status')
        return {'ok':True}
