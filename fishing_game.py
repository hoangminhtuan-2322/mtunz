"""Server-authoritative, account-bound cozy fishing game. All currency is virtual."""
import json
import secrets
import time
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

FISH = [
    ('minnow','Cá lòng tong','common',8,1,38,'🐟'),
    ('carp','Cá chép','common',14,1,30,'🐟'),
    ('perch','Cá rô','common',18,1,25,'🐠'),
    ('tilapia','Cá rô phi','common',24,2,22,'🐟'),
    ('catfish','Cá trê','uncommon',42,2,15,'🐟'),
    ('koi','Cá koi','uncommon',65,3,12,'🐠'),
    ('salmon','Cá hồi','rare',115,4,8,'🐟'),
    ('puffer','Cá nóc','rare',165,5,6,'🐡'),
    ('ray','Cá đuối','rare',240,6,5,'🐟'),
    ('moon','Cá ánh trăng','epic',400,7,3,'🐠'),
    ('dragon','Cá rồng','epic',650,8,2,'🐉'),
    ('gold','Cá vàng thần thoại','legendary',1100,9,1,'🐠'),
    ('star','Cá sao đại dương','legendary',1800,10,1,'🌟'),
]
RODS = [
    ('Cần tre',0),('Cần gỗ',60),('Cần sợi carbon',160),
    ('Cần bạc',340),('Cần thủy triều',650),('Cần san hô',1100),
    ('Cần ánh trăng',1800),('Cần đại dương',2900),
    ('Cần hoàng kim',4600),('Cần thiên hà',7200),
]
def clock_ms():
    return int(time.time()*1000)
def day_key(ms):
    return datetime.fromtimestamp(ms/1000,timezone(timedelta(hours=7))).date().isoformat()
def weighted_fish(level):
    pool=[(f,max(1,f[5]*(12-level) if f[2]=='common' else f[5]*(level+2))) for f in FISH if f[4]<=level]
    draw=secrets.randbelow(sum(w for _,w in pool))
    for f,w in pool:
        if draw<w:return f
        draw-=w
    raise RuntimeError('empty fish pool')
def data_for(row,now):
    bag=json.loads(row['bag']); collection=json.loads(row['collection'])
    cast=None
    if row['cast_token'] and now<=row['bite_ms']+row['window_ms']:
        cast={'token':row['cast_token'],'bite_at':row['bite_ms'],'expires_at':row['bite_ms']+row['window_ms']}
    today=day_key(now)
    return {'coins':row['coins'],'level':row['level'],'caught':row['caught'],
            'bag':bag,'collection':collection,'cast':cast,'server_now':now,
            'daily':{'caught':row['daily_count'] if row['daily_day']==today else 0,
                     'claimed':bool(row['daily_claimed']) if row['daily_day']==today else False,'target':10,'reward':100},
            'fish':[{'id':f[0],'name':f[1],'rarity':f[2],'value':f[3],'unlock':f[4],'emoji':f[6]} for f in FISH],
            'rods':[{'level':i+1,'name':r[0],'price':r[1]} for i,r in enumerate(RODS)]}

class Reel(BaseModel):
    token:str=Field(min_length=10,max_length=80)
class Sell(BaseModel):
    fish_id:str=Field(min_length=1,max_length=40)
    quantity:int=Field(ge=1,le=1000)
class Upgrade(BaseModel):
    level:int=Field(ge=2,le=10)

def install(core):
    app,db,one=core.app,core.db,core.one
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS fishing_players (
            user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            coins BIGINT NOT NULL DEFAULT 0 CHECK(coins>=0),
            level INTEGER NOT NULL DEFAULT 1 CHECK(level>=1 AND level<=10),
            caught BIGINT NOT NULL DEFAULT 0,
            bag TEXT NOT NULL DEFAULT '{}', collection TEXT NOT NULL DEFAULT '{}',
            cast_token TEXT, bite_ms BIGINT NOT NULL DEFAULT 0, window_ms INTEGER NOT NULL DEFAULT 0,
            daily_day TEXT NOT NULL DEFAULT '', daily_count INTEGER NOT NULL DEFAULT 0,
            daily_claimed INTEGER NOT NULL DEFAULT 0)""")
    def user(request,action):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Dùng tài khoản thành viên để chơi.')
        core.throttle(request,'fishing-'+action,120,60,str(u['id']))
        return u['id']
    def lock(c,uid):
        # Insert/upsert and row write serialize state changes on SQLite and PostgreSQL.
        c.execute('INSERT INTO fishing_players(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
        c.execute('UPDATE fishing_players SET level=level WHERE user_id=?',(uid,))
        return one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
    def state(c,uid,now):
        return data_for(one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,)),now)
    @app.get('/api/fishing')
    def fishing_state(request:Request):
        uid=user(request,'read')
        with db() as c:
            row=lock(c,uid)
            return data_for(row,clock_ms())
    @app.post('/api/fishing/cast')
    def fishing_cast(request:Request):
        uid=user(request,'cast')
        with db() as c:
            row=lock(c,uid); now=clock_ms()
            if row['cast_token'] and now<=row['bite_ms']+row['window_ms']:
                return data_for(row,now)
            bite=now+1800+secrets.randbelow(2500)
            window=1200+row['level']*120
            c.execute('UPDATE fishing_players SET cast_token=?,bite_ms=?,window_ms=? WHERE user_id=?',
                      (secrets.token_urlsafe(18),bite,window,uid))
            return state(c,uid,now)
    @app.post('/api/fishing/reel')
    def fishing_reel(request:Request,body:Reel):
        uid=user(request,'reel')
        with db() as c:
            row=lock(c,uid);now=clock_ms()
            if not row['cast_token'] or body.token!=row['cast_token']:
                raise HTTPException(409,'Lượt câu đã kết thúc. Hãy tải lại.')
            c.execute('UPDATE fishing_players SET cast_token=NULL WHERE user_id=?',(uid,))
            if now<row['bite_ms'] or now>row['bite_ms']+row['window_ms']:
                return {**state(c,uid,now),'result':{'caught':False,'reason':'early' if now<row['bite_ms'] else 'late'}}
            f=weighted_fish(row['level']);bag=json.loads(row['bag']);collection=json.loads(row['collection'])
            bag[f[0]]=bag.get(f[0],0)+1;collection[f[0]]=collection.get(f[0],0)+1
            day=day_key(now);count=row['daily_count'] if row['daily_day']==day else 0
            claimed=row['daily_claimed'] if row['daily_day']==day else 0
            c.execute("""UPDATE fishing_players SET bag=?,collection=?,caught=caught+1,
                daily_day=?,daily_count=?,daily_claimed=? WHERE user_id=?""",
                (json.dumps(bag),json.dumps(collection),day,count+1,claimed,uid))
            return {**state(c,uid,now),'result':{'caught':True,'fish_id':f[0]}}
    @app.post('/api/fishing/sell')
    def fishing_sell(request:Request,body:Sell):
        uid=user(request,'sell')
        f=next((f for f in FISH if f[0]==body.fish_id),None)
        if not f:raise HTTPException(404,'Không có loại cá này.')
        with db() as c:
            row=lock(c,uid);bag=json.loads(row['bag'])
            if bag.get(f[0],0)<body.quantity:raise HTTPException(409,'Không đủ cá trong giỏ.')
            bag[f[0]]-=body.quantity
            if not bag[f[0]]:del bag[f[0]]
            c.execute('UPDATE fishing_players SET bag=?,coins=coins+? WHERE user_id=?',
                      (json.dumps(bag),f[3]*body.quantity,uid))
            return state(c,uid,clock_ms())
    @app.post('/api/fishing/upgrade')
    def fishing_upgrade(request:Request,body:Upgrade):
        uid=user(request,'upgrade')
        with db() as c:
            row=lock(c,uid)
            if row['cast_token'] and clock_ms()<=row['bite_ms']+row['window_ms']:
                raise HTTPException(409,'Kết thúc lượt câu trước khi nâng cần.')
            if body.level!=row['level']+1:raise HTTPException(409,'Chỉ được nâng cấp từng cấp.')
            price=RODS[body.level-1][1]
            if row['coins']<price:raise HTTPException(409,'Không đủ xu.')
            c.execute('UPDATE fishing_players SET level=?,coins=coins-? WHERE user_id=?',(body.level,price,uid))
            return state(c,uid,clock_ms())
    @app.post('/api/fishing/daily')
    def fishing_daily(request:Request):
        uid=user(request,'daily')
        with db() as c:
            row=lock(c,uid);now=clock_ms()
            if row['daily_day']!=day_key(now) or row['daily_count']<10 or row['daily_claimed']:
                raise HTTPException(409,'Chưa hoàn thành hoặc đã nhận thưởng.')
            c.execute('UPDATE fishing_players SET daily_claimed=1,coins=coins+100 WHERE user_id=?',(uid,))
            return state(c,uid,now)
    @app.get('/api/fishing/ranking')
    def fishing_ranking(request:Request):
        uid=user(request,'ranking')
        with db() as c:
            rows=core.many(c,'SELECT user_id,caught,level FROM fishing_players WHERE caught>0 ORDER BY caught DESC,user_id ASC LIMIT 20')
        return {'ranking':[{'rank':i+1,'name':'Bạn' if row['user_id']==uid else 'Ngư thủ '+str(i+1),
                            'caught':row['caught'],'level':row['level']} for i,row in enumerate(rows)]}
