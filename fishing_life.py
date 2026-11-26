"""Fishing Life v1: authenticated, bounded, server-owned fishing economy."""
import json
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Annotated
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

TIERS = [
 ('Phổ thông',40000,100),('Không phổ biến',25000,150),
 ('Đặc biệt',15000,250),('Hiếm',10000,500),('Siêu hiếm',6000,1000),
 ('Sử thi',3000,2500),('Huyền thoại',800,7500),('Thần thoại',180,25000),
 ('Thiên giới',19,100000),('Vô cực',1,1000000),
]
MUTATIONS = [('Bình thường',90000,1),('Khổng lồ',5000,2),('Hoàng kim',3000,3),
 ('Phát sáng',1500,5),('Pha lê',450,10),('Cầu vồng',49,30),('Vũ trụ',1,100)]
RODS = [
 {'name':'Cần tre','price':0,'luck':1,'control':0},
 {'name':'Cần sợi carbon','price':450,'luck':2,'control':150},
 {'name':'Cần ánh trăng','price':1800,'luck':3,'control':300},
 {'name':'Cần biển sâu','price':8000,'luck':5,'control':450},
 {'name':'Cần rồng biển','price':25000,'luck':10,'control':600},
]
BAITS = [{'name':'Giun đất','price':0,'luck':1},{'name':'Mồi tôm','price':8,'luck':2},
 {'name':'Mồi dạ quang','price':25,'luck':3}]
MAPS = [
 {'name':'Ao Bình Yên','rod':0,'base':20,'fish':['Cá rô đồng','Cá diếc','Cá trắm cỏ','Cá chép','Cá koi','Cá chép gương','Koi hoàng kim','Cá sen ánh nguyệt','Cá ngọc trời','Linh ngư vô cực']},
 {'name':'Sông Sương Mai','rod':1,'base':32,'fish':['Cá lòng tong','Cá mè','Cá trê','Cá lóc','Cá chình','Cá hô','Cá đuối sông vàng','Cá rồng sương','Cá thủy tinh thiên hà','Long ngư vô cực']},
 {'name':'Vịnh Ánh Trăng','rod':2,'base':55,'fish':['Cá cơm','Cá mòi','Cá thu','Cá mú','Cá ngừ','Cá kiếm','Cá mặt trăng bạc','Cá rồng biển','Cá tinh vân','Cá đại dương vô cực']},
]
BAG_LIMIT=200
GOLD_LIMIT=10**12
QUESTS=[('catch','Câu 5 con cá',5,75),('sell','Bán 5 con cá',5,60),('rare','Bắt 1 cá từ cấp IV',1,100)]
FishId=Annotated[str,Field(pattern=r'^[a-f0-9]{32}

def clock_ms():
    return int(time.time()*1000)

def weighted(weights):
    r=secrets.randbelow(sum(weights))
    for i,w in enumerate(weights):
        if r<w:return i
        r-=w
    raise RuntimeError('invalid weights')

def tier_weights(rod,bait):
    luck=RODS[rod]['luck']*BAITS[bait]['luck']
    return [t[1]*(luck if i>=4 else 1) for i,t in enumerate(TIERS)]

def roll_fish(region,rod,bait):
    tier=weighted(tier_weights(rod,bait))
    mutation=weighted([m[1] for m in MUTATIONS])
    # Relative weight varies within a species; giant mutation doubles mass.
    size=75+secrets.randbelow(76)
    grams=(150+tier*tier*100)*size//100*(2 if mutation==1 else 1)
    value=max(1,MAPS[region]['base']*TIERS[tier][2]*MUTATIONS[mutation][2]*size//10000)
    return {'id':secrets.token_hex(16),'species':region*10+tier,'region':region,
            'name':MAPS[region]['fish'][tier],'tier':tier,'mutation':mutation,
            'grams':grams,'value':value}

class Cast(BaseModel):
    region:int=Field(ge=0,lt=len(MAPS))
    bait:int=Field(default=0,ge=0,lt=len(BAITS))

class Tap(BaseModel):
    cast_id:str=Field(pattern=r'^[a-f0-9]{32}$')
    step:int=Field(ge=0,le=8)

class Rod(BaseModel):
    rod:int=Field(ge=0,lt=len(RODS))

class Sell(BaseModel):
    fish_id:str=Field(pattern=r'^[a-f0-9]{32}$')

class BulkSell(BaseModel):
    fish_ids:list[FishId]=Field(min_length=1,max_length=BAG_LIMIT)

class Claim(BaseModel):
    quest:int=Field(ge=0,lt=len(QUESTS))
    day:str=Field(pattern=r'^\d{4}-\d{2}-\d{2}
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS fishing_players (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          gold BIGINT NOT NULL DEFAULT 150 CHECK(gold>=0),
          rod INTEGER NOT NULL DEFAULT 0, owned_rod INTEGER NOT NULL DEFAULT 0,
          caught BIGINT NOT NULL DEFAULT 0, xp BIGINT NOT NULL DEFAULT 0,
          cast_id TEXT NOT NULL DEFAULT '', cast_fish TEXT NOT NULL DEFAULT '',
          step INTEGER NOT NULL DEFAULT 0, action_at BIGINT NOT NULL DEFAULT 0,
          deadline BIGINT NOT NULL DEFAULT 0, pulls INTEGER NOT NULL DEFAULT 0,
          last_result TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fishing_bag (
          id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, tier INTEGER NOT NULL, mutation INTEGER NOT NULL,
          grams INTEGER NOT NULL, value BIGINT NOT NULL, caught_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS fishing_bag_owner ON fishing_bag(user_id,caught_at);
        CREATE TABLE IF NOT EXISTS fishing_book (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, caught BIGINT NOT NULL DEFAULT 0,
          record_grams INTEGER NOT NULL, PRIMARY KEY(user_id,species)
        );
        CREATE TABLE IF NOT EXISTS fishing_daily (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          day TEXT NOT NULL, catch_count INTEGER NOT NULL DEFAULT 0,
          sell_count INTEGER NOT NULL DEFAULT 0, rare_count INTEGER NOT NULL DEFAULT 0,
          claimed INTEGER NOT NULL DEFAULT 0
        );
        """)
    def member(request,action):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Game dành cho tài khoản thành viên.')
        core.throttle(request,'fishing-'+action,120 if action=='state' else 90,60,str(u['id']))
        return u['id']

    def player(c,uid):
        c.execute('INSERT INTO fishing_players(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
        # A write locks the account row until commit on PostgreSQL and serializes SQLite writes.
        c.execute('UPDATE fishing_players SET gold=gold WHERE user_id=?',(uid,))
        return one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))

    def daily(c,uid):
        day=day_key()
        c.execute('INSERT INTO fishing_daily(user_id,day) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING',(uid,day))
        c.execute('UPDATE fishing_daily SET day=?,catch_count=0,sell_count=0,rare_count=0,claimed=0 WHERE user_id=? AND day<>?',(day,uid,day))
        return one(c,'SELECT * FROM fishing_daily WHERE user_id=?',(uid,))

    def progress(c,uid,catches=0,sales=0,rare=0):
        daily(c,uid)
        c.execute('UPDATE fishing_daily SET catch_count=catch_count+?,sell_count=sell_count+?,rare_count=rare_count+? WHERE user_id=?',
                  (catches,sales,rare,uid))

    def clear_cast(c,uid,result):
        c.execute("""UPDATE fishing_players SET cast_id='',cast_fish='',step=0,
                  action_at=0,deadline=0,pulls=0,last_result=? WHERE user_id=?""",(result,uid))

    def snapshot(c,uid,message=''):
        p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        now=clock_ms()
        if p['cast_id'] and now>p['deadline']:
            clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
            p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        bag=many(c,'SELECT id,species,tier,mutation,grams,value FROM fishing_bag WHERE user_id=? ORDER BY caught_at DESC,id LIMIT 200',(uid,))
        for f in bag:
            f['name']=MAPS[f['species']//10]['fish'][f['species']%10]
        book=many(c,'SELECT species,caught,record_grams FROM fishing_book WHERE user_id=? ORDER BY species',(uid,))
        daily_row=daily(c,uid)
        counts=[daily_row['catch_count'],daily_row['sell_count'],daily_row['rare_count']]
        quests=[{'id':i,'name':q[1],'goal':q[2],'reward':q[3],'progress':min(counts[i],q[2]),'claimed':bool(daily_row['claimed']&(1<<i))} for i,q in enumerate(QUESTS)]
        return {'daily':{'day':daily_row['day'],'quests':quests},'odds':odds_for_rod(p['rod']),'gold':p['gold'],'rod':p['rod'],'owned_rod':p['owned_rod'],'caught':p['caught'],
          'xp':p['xp'],'level':1+int(p['xp'])//100,'bag':bag,'bag_limit':BAG_LIMIT,
          'book':book,'server_ms':now,'message':message or p['last_result'],
          'cast':{'id':p['cast_id'],'step':p['step'],'action_at':p['action_at'],
                  'deadline':p['deadline'],'pulls':p['pulls'],'region':json.loads(p['cast_fish'])['region']} if p['cast_id'] else None,
          'catalog':{'tiers':[{'name':t[0],'weight':t[1]} for t in TIERS],
            'mutations':[{'name':m[0],'weight':m[1]} for m in MUTATIONS],
            'rods':RODS,'baits':BAITS,'maps':MAPS}}

    @app.get('/api/fishing/state')
    async def state(request:Request):
        uid=member(request,'state')
        with db() as c:
            player(c,uid)
            return snapshot(c,uid)

    @app.post('/api/fishing/cast')
    async def cast(request:Request,body:Cast):
        uid=member(request,'cast')
        with db() as c:
            p=player(c,uid)
            now=clock_ms()
            if p['cast_id'] and now<=p['deadline']:
                return snapshot(c,uid,'Bạn đang câu.')
            if p['rod']<MAPS[body.region]['rod']:
                raise HTTPException(403,'Cần trang bị cần câu tốt hơn.')
            if one(c,'SELECT COUNT(*) n FROM fishing_bag WHERE user_id=?',(uid,))['n']>=BAG_LIMIT:
                raise HTTPException(409,'Túi đầy. Hãy bán bớt cá.')
            price=BAITS[body.bait]['price']
            if p['gold']<price:raise HTTPException(409,'Không đủ vàng mua mồi.')
            fish=roll_fish(body.region,p['rod'],body.bait)
            at=now+3000+secrets.randbelow(3001)
            pulls=2+fish['tier']//3
            c.execute("""UPDATE fishing_players SET gold=gold-?,cast_id=?,cast_fish=?,
                      step=0,action_at=?,deadline=?,pulls=?,last_result='' WHERE user_id=?""",
                      (price,secrets.token_hex(16),json.dumps(fish),at,at+4500,pulls,uid))
            return snapshot(c,uid,'Đã thả cần. Chờ cá cắn!')

    @app.post('/api/fishing/tap')
    async def tap(request:Request,body:Tap):
        uid=member(request,'tap')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']!=body.cast_id or p['step']!=body.step:
                return snapshot(c,uid)
            now=clock_ms()
            if now<p['action_at']:
                return snapshot(c,uid,'Chưa đến lúc kéo.')
            if now>p['deadline']:
                clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
                return snapshot(c,uid)
            fish=json.loads(p['cast_fish'])
            if p['step']<p['pulls']:
                at=now+800+secrets.randbelow(901)
                window=max(1300,3000-fish['tier']*175+RODS[p['rod']]['control'])
                c.execute('UPDATE fishing_players SET step=step+1,action_at=?,deadline=? WHERE user_id=?',(at,at+window,uid))
                return snapshot(c,uid,'Giữ nhịp, kéo khi có tín hiệu!')
            c.execute("""INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at)
                         VALUES(?,?,?,?,?,?,?,?)""",
                      (fish['id'],uid,fish['species'],fish['tier'],fish['mutation'],fish['grams'],fish['value'],now))
            c.execute("""INSERT INTO fishing_book(user_id,species,caught,record_grams) VALUES(?,?,1,?)
                         ON CONFLICT(user_id,species) DO UPDATE SET caught=fishing_book.caught+1,
                         record_grams=CASE WHEN fishing_book.record_grams<excluded.record_grams
                         THEN excluded.record_grams ELSE fishing_book.record_grams END""",
                      (uid,fish['species'],fish['grams']))
            c.execute('UPDATE fishing_players SET caught=caught+1,xp=xp+? WHERE user_id=?',(10+fish['tier']*5,uid))
            progress(c,uid,catches=1,rare=int(fish['tier']>=3))
            clear_cast(c,uid,'Bắt được '+fish['name']+' · '+MUTATIONS[fish['mutation']][0]+'!')
            return snapshot(c,uid)

    @app.post('/api/fishing/cancel')
    async def cancel(request:Request,body:Tap):
        uid=member(request,'cancel')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']==body.cast_id and p['step']==body.step:
                clear_cast(c,uid,'Đã thu cần. Mồi đã dùng không hoàn lại.')
            return snapshot(c,uid)

    @app.post('/api/fishing/rod')
    async def rod(request:Request,body:Rod):
        uid=member(request,'rod')
        with db() as c:
            p=player(c,uid)
            if p['cast_id'] and clock_ms()<=p['deadline']:
                raise HTTPException(409,'Thu cần trước khi đổi trang bị.')
            owned=p['owned_rod']
            if body.rod>owned+1:raise HTTPException(409,'Nâng cấp theo thứ tự.')
            cost=RODS[body.rod]['price'] if body.rod>owned else 0
            if p['gold']<cost:raise HTTPException(409,'Chưa đủ vàng.')
            c.execute('UPDATE fishing_players SET gold=gold-?,rod=?,owned_rod=? WHERE user_id=?',
                      (cost,body.rod,max(owned,body.rod),uid))
            return snapshot(c,uid,'Đã trang bị '+RODS[body.rod]['name'])

    @app.post('/api/fishing/sell')
    async def sell(request:Request,body:Sell):
        uid=member(request,'sell')
        with db() as c:
            p=player(c,uid)
            fish=one(c,'SELECT value FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            if not fish:return snapshot(c,uid,'Cá không còn trong túi.')
            if p['gold']+fish['value']>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            c.execute('DELETE FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(fish['value'],uid))
            progress(c,uid,sales=1)
            return snapshot(c,uid,'Đã bán cá: +'+str(fish['value'])+' vàng')
)]

def day_key():
    return datetime.fromtimestamp(clock_ms()/1000,timezone(timedelta(hours=7))).date().isoformat()

def odds_for_rod(rod):
    result=[]
    for bait in range(len(BAITS)):
        weights=tier_weights(rod,bait)
        result.append([round(w/sum(weights)*100,8) for w in weights])
    return result

def clock_ms():
    return int(time.time()*1000)

def weighted(weights):
    r=secrets.randbelow(sum(weights))
    for i,w in enumerate(weights):
        if r<w:return i
        r-=w
    raise RuntimeError('invalid weights')

def tier_weights(rod,bait):
    luck=RODS[rod]['luck']*BAITS[bait]['luck']
    return [t[1]*(luck if i>=4 else 1) for i,t in enumerate(TIERS)]

def roll_fish(region,rod,bait):
    tier=weighted(tier_weights(rod,bait))
    mutation=weighted([m[1] for m in MUTATIONS])
    # Relative weight varies within a species; giant mutation doubles mass.
    size=75+secrets.randbelow(76)
    grams=(150+tier*tier*100)*size//100*(2 if mutation==1 else 1)
    value=max(1,MAPS[region]['base']*TIERS[tier][2]*MUTATIONS[mutation][2]*size//10000)
    return {'id':secrets.token_hex(16),'species':region*10+tier,'region':region,
            'name':MAPS[region]['fish'][tier],'tier':tier,'mutation':mutation,
            'grams':grams,'value':value}

class Cast(BaseModel):
    region:int=Field(ge=0,lt=len(MAPS))
    bait:int=Field(default=0,ge=0,lt=len(BAITS))

class Tap(BaseModel):
    cast_id:str=Field(pattern=r'^[a-f0-9]{32}$')
    step:int=Field(ge=0,le=8)

class Rod(BaseModel):
    rod:int=Field(ge=0,lt=len(RODS))

class Sell(BaseModel):
    fish_id:str=Field(pattern=r'^[a-f0-9]{32}$')

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS fishing_players (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          gold BIGINT NOT NULL DEFAULT 150 CHECK(gold>=0),
          rod INTEGER NOT NULL DEFAULT 0, owned_rod INTEGER NOT NULL DEFAULT 0,
          caught BIGINT NOT NULL DEFAULT 0, xp BIGINT NOT NULL DEFAULT 0,
          cast_id TEXT NOT NULL DEFAULT '', cast_fish TEXT NOT NULL DEFAULT '',
          step INTEGER NOT NULL DEFAULT 0, action_at BIGINT NOT NULL DEFAULT 0,
          deadline BIGINT NOT NULL DEFAULT 0, pulls INTEGER NOT NULL DEFAULT 0,
          last_result TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fishing_bag (
          id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, tier INTEGER NOT NULL, mutation INTEGER NOT NULL,
          grams INTEGER NOT NULL, value BIGINT NOT NULL, caught_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS fishing_bag_owner ON fishing_bag(user_id,caught_at);
        CREATE TABLE IF NOT EXISTS fishing_book (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, caught BIGINT NOT NULL DEFAULT 0,
          record_grams INTEGER NOT NULL, PRIMARY KEY(user_id,species)
        );
        """)
    def member(request,action):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Game dành cho tài khoản thành viên.')
        core.throttle(request,'fishing-'+action,120 if action=='state' else 90,60,str(u['id']))
        return u['id']

    def player(c,uid):
        c.execute('INSERT INTO fishing_players(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
        # A write locks the account row until commit on PostgreSQL and serializes SQLite writes.
        c.execute('UPDATE fishing_players SET gold=gold WHERE user_id=?',(uid,))
        return one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))

    def clear_cast(c,uid,result):
        c.execute("""UPDATE fishing_players SET cast_id='',cast_fish='',step=0,
                  action_at=0,deadline=0,pulls=0,last_result=? WHERE user_id=?""",(result,uid))

    def snapshot(c,uid,message=''):
        p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        now=clock_ms()
        if p['cast_id'] and now>p['deadline']:
            clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
            p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        bag=many(c,'SELECT id,species,tier,mutation,grams,value FROM fishing_bag WHERE user_id=? ORDER BY caught_at DESC,id LIMIT 200',(uid,))
        for f in bag:
            f['name']=MAPS[f['species']//10]['fish'][f['species']%10]
        book=many(c,'SELECT species,caught,record_grams FROM fishing_book WHERE user_id=? ORDER BY species',(uid,))
        return {'gold':p['gold'],'rod':p['rod'],'owned_rod':p['owned_rod'],'caught':p['caught'],
          'xp':p['xp'],'level':1+int(p['xp'])//100,'bag':bag,'bag_limit':BAG_LIMIT,
          'book':book,'server_ms':now,'message':message or p['last_result'],
          'cast':{'id':p['cast_id'],'step':p['step'],'action_at':p['action_at'],
                  'deadline':p['deadline'],'pulls':p['pulls'],'region':json.loads(p['cast_fish'])['region']} if p['cast_id'] else None,
          'catalog':{'tiers':[{'name':t[0],'weight':t[1]} for t in TIERS],
            'mutations':[{'name':m[0],'weight':m[1]} for m in MUTATIONS],
            'rods':RODS,'baits':BAITS,'maps':MAPS}}

    @app.get('/api/fishing/state')
    async def state(request:Request):
        uid=member(request,'state')
        with db() as c:
            player(c,uid)
            return snapshot(c,uid)

    @app.post('/api/fishing/cast')
    async def cast(request:Request,body:Cast):
        uid=member(request,'cast')
        with db() as c:
            p=player(c,uid)
            now=clock_ms()
            if p['cast_id'] and now<=p['deadline']:
                return snapshot(c,uid,'Bạn đang câu.')
            if p['rod']<MAPS[body.region]['rod']:
                raise HTTPException(403,'Cần trang bị cần câu tốt hơn.')
            if one(c,'SELECT COUNT(*) n FROM fishing_bag WHERE user_id=?',(uid,))['n']>=BAG_LIMIT:
                raise HTTPException(409,'Túi đầy. Hãy bán bớt cá.')
            price=BAITS[body.bait]['price']
            if p['gold']<price:raise HTTPException(409,'Không đủ vàng mua mồi.')
            fish=roll_fish(body.region,p['rod'],body.bait)
            at=now+3000+secrets.randbelow(3001)
            pulls=2+fish['tier']//3
            c.execute("""UPDATE fishing_players SET gold=gold-?,cast_id=?,cast_fish=?,
                      step=0,action_at=?,deadline=?,pulls=?,last_result='' WHERE user_id=?""",
                      (price,secrets.token_hex(16),json.dumps(fish),at,at+4500,pulls,uid))
            return snapshot(c,uid,'Đã thả cần. Chờ cá cắn!')

    @app.post('/api/fishing/tap')
    async def tap(request:Request,body:Tap):
        uid=member(request,'tap')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']!=body.cast_id or p['step']!=body.step:
                return snapshot(c,uid)
            now=clock_ms()
            if now<p['action_at']:
                return snapshot(c,uid,'Chưa đến lúc kéo.')
            if now>p['deadline']:
                clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
                return snapshot(c,uid)
            fish=json.loads(p['cast_fish'])
            if p['step']<p['pulls']:
                at=now+800+secrets.randbelow(901)
                window=max(1300,3000-fish['tier']*175+RODS[p['rod']]['control'])
                c.execute('UPDATE fishing_players SET step=step+1,action_at=?,deadline=? WHERE user_id=?',(at,at+window,uid))
                return snapshot(c,uid,'Giữ nhịp, kéo khi có tín hiệu!')
            c.execute("""INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at)
                         VALUES(?,?,?,?,?,?,?,?)""",
                      (fish['id'],uid,fish['species'],fish['tier'],fish['mutation'],fish['grams'],fish['value'],now))
            c.execute("""INSERT INTO fishing_book(user_id,species,caught,record_grams) VALUES(?,?,1,?)
                         ON CONFLICT(user_id,species) DO UPDATE SET caught=fishing_book.caught+1,
                         record_grams=CASE WHEN fishing_book.record_grams<excluded.record_grams
                         THEN excluded.record_grams ELSE fishing_book.record_grams END""",
                      (uid,fish['species'],fish['grams']))
            c.execute('UPDATE fishing_players SET caught=caught+1,xp=xp+? WHERE user_id=?',(10+fish['tier']*5,uid))
            clear_cast(c,uid,'Bắt được '+fish['name']+' · '+MUTATIONS[fish['mutation']][0]+'!')
            return snapshot(c,uid)

    @app.post('/api/fishing/cancel')
    async def cancel(request:Request,body:Tap):
        uid=member(request,'cancel')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']==body.cast_id and p['step']==body.step:
                clear_cast(c,uid,'Đã thu cần. Mồi đã dùng không hoàn lại.')
            return snapshot(c,uid)

    @app.post('/api/fishing/rod')
    async def rod(request:Request,body:Rod):
        uid=member(request,'rod')
        with db() as c:
            p=player(c,uid)
            if p['cast_id'] and clock_ms()<=p['deadline']:
                raise HTTPException(409,'Thu cần trước khi đổi trang bị.')
            owned=p['owned_rod']
            if body.rod>owned+1:raise HTTPException(409,'Nâng cấp theo thứ tự.')
            cost=RODS[body.rod]['price'] if body.rod>owned else 0
            if p['gold']<cost:raise HTTPException(409,'Chưa đủ vàng.')
            c.execute('UPDATE fishing_players SET gold=gold-?,rod=?,owned_rod=? WHERE user_id=?',
                      (cost,body.rod,max(owned,body.rod),uid))
            return snapshot(c,uid,'Đã trang bị '+RODS[body.rod]['name'])

    @app.post('/api/fishing/sell')
    async def sell(request:Request,body:Sell):
        uid=member(request,'sell')
        with db() as c:
            p=player(c,uid)
            fish=one(c,'SELECT value FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            if not fish:return snapshot(c,uid,'Cá không còn trong túi.')
            if p['gold']+fish['value']>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            c.execute('DELETE FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(fish['value'],uid))
            return snapshot(c,uid,'Đã bán cá: +'+str(fish['value'])+' vàng')
)

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS fishing_players (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          gold BIGINT NOT NULL DEFAULT 150 CHECK(gold>=0),
          rod INTEGER NOT NULL DEFAULT 0, owned_rod INTEGER NOT NULL DEFAULT 0,
          caught BIGINT NOT NULL DEFAULT 0, xp BIGINT NOT NULL DEFAULT 0,
          cast_id TEXT NOT NULL DEFAULT '', cast_fish TEXT NOT NULL DEFAULT '',
          step INTEGER NOT NULL DEFAULT 0, action_at BIGINT NOT NULL DEFAULT 0,
          deadline BIGINT NOT NULL DEFAULT 0, pulls INTEGER NOT NULL DEFAULT 0,
          last_result TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fishing_bag (
          id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, tier INTEGER NOT NULL, mutation INTEGER NOT NULL,
          grams INTEGER NOT NULL, value BIGINT NOT NULL, caught_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS fishing_bag_owner ON fishing_bag(user_id,caught_at);
        CREATE TABLE IF NOT EXISTS fishing_book (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, caught BIGINT NOT NULL DEFAULT 0,
          record_grams INTEGER NOT NULL, PRIMARY KEY(user_id,species)
        );
        """)
    def member(request,action):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Game dành cho tài khoản thành viên.')
        core.throttle(request,'fishing-'+action,120 if action=='state' else 90,60,str(u['id']))
        return u['id']

    def player(c,uid):
        c.execute('INSERT INTO fishing_players(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
        # A write locks the account row until commit on PostgreSQL and serializes SQLite writes.
        c.execute('UPDATE fishing_players SET gold=gold WHERE user_id=?',(uid,))
        return one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))

    def clear_cast(c,uid,result):
        c.execute("""UPDATE fishing_players SET cast_id='',cast_fish='',step=0,
                  action_at=0,deadline=0,pulls=0,last_result=? WHERE user_id=?""",(result,uid))

    def snapshot(c,uid,message=''):
        p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        now=clock_ms()
        if p['cast_id'] and now>p['deadline']:
            clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
            p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        bag=many(c,'SELECT id,species,tier,mutation,grams,value FROM fishing_bag WHERE user_id=? ORDER BY caught_at DESC,id LIMIT 200',(uid,))
        for f in bag:
            f['name']=MAPS[f['species']//10]['fish'][f['species']%10]
        book=many(c,'SELECT species,caught,record_grams FROM fishing_book WHERE user_id=? ORDER BY species',(uid,))
        return {'gold':p['gold'],'rod':p['rod'],'owned_rod':p['owned_rod'],'caught':p['caught'],
          'xp':p['xp'],'level':1+int(p['xp'])//100,'bag':bag,'bag_limit':BAG_LIMIT,
          'book':book,'server_ms':now,'message':message or p['last_result'],
          'cast':{'id':p['cast_id'],'step':p['step'],'action_at':p['action_at'],
                  'deadline':p['deadline'],'pulls':p['pulls'],'region':json.loads(p['cast_fish'])['region']} if p['cast_id'] else None,
          'catalog':{'tiers':[{'name':t[0],'weight':t[1]} for t in TIERS],
            'mutations':[{'name':m[0],'weight':m[1]} for m in MUTATIONS],
            'rods':RODS,'baits':BAITS,'maps':MAPS}}

    @app.get('/api/fishing/state')
    async def state(request:Request):
        uid=member(request,'state')
        with db() as c:
            player(c,uid)
            return snapshot(c,uid)

    @app.post('/api/fishing/cast')
    async def cast(request:Request,body:Cast):
        uid=member(request,'cast')
        with db() as c:
            p=player(c,uid)
            now=clock_ms()
            if p['cast_id'] and now<=p['deadline']:
                return snapshot(c,uid,'Bạn đang câu.')
            if p['rod']<MAPS[body.region]['rod']:
                raise HTTPException(403,'Cần trang bị cần câu tốt hơn.')
            if one(c,'SELECT COUNT(*) n FROM fishing_bag WHERE user_id=?',(uid,))['n']>=BAG_LIMIT:
                raise HTTPException(409,'Túi đầy. Hãy bán bớt cá.')
            price=BAITS[body.bait]['price']
            if p['gold']<price:raise HTTPException(409,'Không đủ vàng mua mồi.')
            fish=roll_fish(body.region,p['rod'],body.bait)
            at=now+3000+secrets.randbelow(3001)
            pulls=2+fish['tier']//3
            c.execute("""UPDATE fishing_players SET gold=gold-?,cast_id=?,cast_fish=?,
                      step=0,action_at=?,deadline=?,pulls=?,last_result='' WHERE user_id=?""",
                      (price,secrets.token_hex(16),json.dumps(fish),at,at+4500,pulls,uid))
            return snapshot(c,uid,'Đã thả cần. Chờ cá cắn!')

    @app.post('/api/fishing/tap')
    async def tap(request:Request,body:Tap):
        uid=member(request,'tap')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']!=body.cast_id or p['step']!=body.step:
                return snapshot(c,uid)
            now=clock_ms()
            if now<p['action_at']:
                return snapshot(c,uid,'Chưa đến lúc kéo.')
            if now>p['deadline']:
                clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
                return snapshot(c,uid)
            fish=json.loads(p['cast_fish'])
            if p['step']<p['pulls']:
                at=now+800+secrets.randbelow(901)
                window=max(1300,3000-fish['tier']*175+RODS[p['rod']]['control'])
                c.execute('UPDATE fishing_players SET step=step+1,action_at=?,deadline=? WHERE user_id=?',(at,at+window,uid))
                return snapshot(c,uid,'Giữ nhịp, kéo khi có tín hiệu!')
            c.execute("""INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at)
                         VALUES(?,?,?,?,?,?,?,?)""",
                      (fish['id'],uid,fish['species'],fish['tier'],fish['mutation'],fish['grams'],fish['value'],now))
            c.execute("""INSERT INTO fishing_book(user_id,species,caught,record_grams) VALUES(?,?,1,?)
                         ON CONFLICT(user_id,species) DO UPDATE SET caught=fishing_book.caught+1,
                         record_grams=CASE WHEN fishing_book.record_grams<excluded.record_grams
                         THEN excluded.record_grams ELSE fishing_book.record_grams END""",
                      (uid,fish['species'],fish['grams']))
            c.execute('UPDATE fishing_players SET caught=caught+1,xp=xp+? WHERE user_id=?',(10+fish['tier']*5,uid))
            clear_cast(c,uid,'Bắt được '+fish['name']+' · '+MUTATIONS[fish['mutation']][0]+'!')
            return snapshot(c,uid)

    @app.post('/api/fishing/cancel')
    async def cancel(request:Request,body:Tap):
        uid=member(request,'cancel')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']==body.cast_id and p['step']==body.step:
                clear_cast(c,uid,'Đã thu cần. Mồi đã dùng không hoàn lại.')
            return snapshot(c,uid)

    @app.post('/api/fishing/rod')
    async def rod(request:Request,body:Rod):
        uid=member(request,'rod')
        with db() as c:
            p=player(c,uid)
            if p['cast_id'] and clock_ms()<=p['deadline']:
                raise HTTPException(409,'Thu cần trước khi đổi trang bị.')
            owned=p['owned_rod']
            if body.rod>owned+1:raise HTTPException(409,'Nâng cấp theo thứ tự.')
            cost=RODS[body.rod]['price'] if body.rod>owned else 0
            if p['gold']<cost:raise HTTPException(409,'Chưa đủ vàng.')
            c.execute('UPDATE fishing_players SET gold=gold-?,rod=?,owned_rod=? WHERE user_id=?',
                      (cost,body.rod,max(owned,body.rod),uid))
            return snapshot(c,uid,'Đã trang bị '+RODS[body.rod]['name'])

    @app.post('/api/fishing/sell')
    async def sell(request:Request,body:Sell):
        uid=member(request,'sell')
        with db() as c:
            p=player(c,uid)
            fish=one(c,'SELECT value FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            if not fish:return snapshot(c,uid,'Cá không còn trong túi.')
            if p['gold']+fish['value']>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            c.execute('DELETE FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(fish['value'],uid))
            return snapshot(c,uid,'Đã bán cá: +'+str(fish['value'])+' vàng')
)]

def day_key():
    return datetime.fromtimestamp(clock_ms()/1000,timezone(timedelta(hours=7))).date().isoformat()

def odds_for_rod(rod):
    result=[]
    for bait in range(len(BAITS)):
        weights=tier_weights(rod,bait)
        result.append([round(w/sum(weights)*100,8) for w in weights])
    return result

def clock_ms():
    return int(time.time()*1000)

def weighted(weights):
    r=secrets.randbelow(sum(weights))
    for i,w in enumerate(weights):
        if r<w:return i
        r-=w
    raise RuntimeError('invalid weights')

def tier_weights(rod,bait):
    luck=RODS[rod]['luck']*BAITS[bait]['luck']
    return [t[1]*(luck if i>=4 else 1) for i,t in enumerate(TIERS)]

def roll_fish(region,rod,bait):
    tier=weighted(tier_weights(rod,bait))
    mutation=weighted([m[1] for m in MUTATIONS])
    # Relative weight varies within a species; giant mutation doubles mass.
    size=75+secrets.randbelow(76)
    grams=(150+tier*tier*100)*size//100*(2 if mutation==1 else 1)
    value=max(1,MAPS[region]['base']*TIERS[tier][2]*MUTATIONS[mutation][2]*size//10000)
    return {'id':secrets.token_hex(16),'species':region*10+tier,'region':region,
            'name':MAPS[region]['fish'][tier],'tier':tier,'mutation':mutation,
            'grams':grams,'value':value}

class Cast(BaseModel):
    region:int=Field(ge=0,lt=len(MAPS))
    bait:int=Field(default=0,ge=0,lt=len(BAITS))

class Tap(BaseModel):
    cast_id:str=Field(pattern=r'^[a-f0-9]{32}$')
    step:int=Field(ge=0,le=8)

class Rod(BaseModel):
    rod:int=Field(ge=0,lt=len(RODS))

class Sell(BaseModel):
    fish_id:str=Field(pattern=r'^[a-f0-9]{32}$')

def install(core):
    app,db,one,many=core.app,core.db,core.one,core.many
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS fishing_players (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          gold BIGINT NOT NULL DEFAULT 150 CHECK(gold>=0),
          rod INTEGER NOT NULL DEFAULT 0, owned_rod INTEGER NOT NULL DEFAULT 0,
          caught BIGINT NOT NULL DEFAULT 0, xp BIGINT NOT NULL DEFAULT 0,
          cast_id TEXT NOT NULL DEFAULT '', cast_fish TEXT NOT NULL DEFAULT '',
          step INTEGER NOT NULL DEFAULT 0, action_at BIGINT NOT NULL DEFAULT 0,
          deadline BIGINT NOT NULL DEFAULT 0, pulls INTEGER NOT NULL DEFAULT 0,
          last_result TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fishing_bag (
          id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, tier INTEGER NOT NULL, mutation INTEGER NOT NULL,
          grams INTEGER NOT NULL, value BIGINT NOT NULL, caught_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS fishing_bag_owner ON fishing_bag(user_id,caught_at);
        CREATE TABLE IF NOT EXISTS fishing_book (
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          species INTEGER NOT NULL, caught BIGINT NOT NULL DEFAULT 0,
          record_grams INTEGER NOT NULL, PRIMARY KEY(user_id,species)
        );
        """)
    def member(request,action):
        u=core.current_user(request)
        if u['is_admin']:raise HTTPException(403,'Game dành cho tài khoản thành viên.')
        core.throttle(request,'fishing-'+action,120 if action=='state' else 90,60,str(u['id']))
        return u['id']

    def player(c,uid):
        c.execute('INSERT INTO fishing_players(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
        # A write locks the account row until commit on PostgreSQL and serializes SQLite writes.
        c.execute('UPDATE fishing_players SET gold=gold WHERE user_id=?',(uid,))
        return one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))

    def clear_cast(c,uid,result):
        c.execute("""UPDATE fishing_players SET cast_id='',cast_fish='',step=0,
                  action_at=0,deadline=0,pulls=0,last_result=? WHERE user_id=?""",(result,uid))

    def snapshot(c,uid,message=''):
        p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        now=clock_ms()
        if p['cast_id'] and now>p['deadline']:
            clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
            p=one(c,'SELECT * FROM fishing_players WHERE user_id=?',(uid,))
        bag=many(c,'SELECT id,species,tier,mutation,grams,value FROM fishing_bag WHERE user_id=? ORDER BY caught_at DESC,id LIMIT 200',(uid,))
        for f in bag:
            f['name']=MAPS[f['species']//10]['fish'][f['species']%10]
        book=many(c,'SELECT species,caught,record_grams FROM fishing_book WHERE user_id=? ORDER BY species',(uid,))
        return {'gold':p['gold'],'rod':p['rod'],'owned_rod':p['owned_rod'],'caught':p['caught'],
          'xp':p['xp'],'level':1+int(p['xp'])//100,'bag':bag,'bag_limit':BAG_LIMIT,
          'book':book,'server_ms':now,'message':message or p['last_result'],
          'cast':{'id':p['cast_id'],'step':p['step'],'action_at':p['action_at'],
                  'deadline':p['deadline'],'pulls':p['pulls'],'region':json.loads(p['cast_fish'])['region']} if p['cast_id'] else None,
          'catalog':{'tiers':[{'name':t[0],'weight':t[1]} for t in TIERS],
            'mutations':[{'name':m[0],'weight':m[1]} for m in MUTATIONS],
            'rods':RODS,'baits':BAITS,'maps':MAPS}}

    @app.get('/api/fishing/state')
    async def state(request:Request):
        uid=member(request,'state')
        with db() as c:
            player(c,uid)
            return snapshot(c,uid)

    @app.post('/api/fishing/cast')
    async def cast(request:Request,body:Cast):
        uid=member(request,'cast')
        with db() as c:
            p=player(c,uid)
            now=clock_ms()
            if p['cast_id'] and now<=p['deadline']:
                return snapshot(c,uid,'Bạn đang câu.')
            if p['rod']<MAPS[body.region]['rod']:
                raise HTTPException(403,'Cần trang bị cần câu tốt hơn.')
            if one(c,'SELECT COUNT(*) n FROM fishing_bag WHERE user_id=?',(uid,))['n']>=BAG_LIMIT:
                raise HTTPException(409,'Túi đầy. Hãy bán bớt cá.')
            price=BAITS[body.bait]['price']
            if p['gold']<price:raise HTTPException(409,'Không đủ vàng mua mồi.')
            fish=roll_fish(body.region,p['rod'],body.bait)
            at=now+3000+secrets.randbelow(3001)
            pulls=2+fish['tier']//3
            c.execute("""UPDATE fishing_players SET gold=gold-?,cast_id=?,cast_fish=?,
                      step=0,action_at=?,deadline=?,pulls=?,last_result='' WHERE user_id=?""",
                      (price,secrets.token_hex(16),json.dumps(fish),at,at+4500,pulls,uid))
            return snapshot(c,uid,'Đã thả cần. Chờ cá cắn!')

    @app.post('/api/fishing/tap')
    async def tap(request:Request,body:Tap):
        uid=member(request,'tap')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']!=body.cast_id or p['step']!=body.step:
                return snapshot(c,uid)
            now=clock_ms()
            if now<p['action_at']:
                return snapshot(c,uid,'Chưa đến lúc kéo.')
            if now>p['deadline']:
                clear_cast(c,uid,'Cá đã thoát. Hãy thử lại!')
                return snapshot(c,uid)
            fish=json.loads(p['cast_fish'])
            if p['step']<p['pulls']:
                at=now+800+secrets.randbelow(901)
                window=max(1300,3000-fish['tier']*175+RODS[p['rod']]['control'])
                c.execute('UPDATE fishing_players SET step=step+1,action_at=?,deadline=? WHERE user_id=?',(at,at+window,uid))
                return snapshot(c,uid,'Giữ nhịp, kéo khi có tín hiệu!')
            c.execute("""INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at)
                         VALUES(?,?,?,?,?,?,?,?)""",
                      (fish['id'],uid,fish['species'],fish['tier'],fish['mutation'],fish['grams'],fish['value'],now))
            c.execute("""INSERT INTO fishing_book(user_id,species,caught,record_grams) VALUES(?,?,1,?)
                         ON CONFLICT(user_id,species) DO UPDATE SET caught=fishing_book.caught+1,
                         record_grams=CASE WHEN fishing_book.record_grams<excluded.record_grams
                         THEN excluded.record_grams ELSE fishing_book.record_grams END""",
                      (uid,fish['species'],fish['grams']))
            c.execute('UPDATE fishing_players SET caught=caught+1,xp=xp+? WHERE user_id=?',(10+fish['tier']*5,uid))
            clear_cast(c,uid,'Bắt được '+fish['name']+' · '+MUTATIONS[fish['mutation']][0]+'!')
            return snapshot(c,uid)

    @app.post('/api/fishing/cancel')
    async def cancel(request:Request,body:Tap):
        uid=member(request,'cancel')
        with db() as c:
            p=player(c,uid)
            if p['cast_id']==body.cast_id and p['step']==body.step:
                clear_cast(c,uid,'Đã thu cần. Mồi đã dùng không hoàn lại.')
            return snapshot(c,uid)

    @app.post('/api/fishing/rod')
    async def rod(request:Request,body:Rod):
        uid=member(request,'rod')
        with db() as c:
            p=player(c,uid)
            if p['cast_id'] and clock_ms()<=p['deadline']:
                raise HTTPException(409,'Thu cần trước khi đổi trang bị.')
            owned=p['owned_rod']
            if body.rod>owned+1:raise HTTPException(409,'Nâng cấp theo thứ tự.')
            cost=RODS[body.rod]['price'] if body.rod>owned else 0
            if p['gold']<cost:raise HTTPException(409,'Chưa đủ vàng.')
            c.execute('UPDATE fishing_players SET gold=gold-?,rod=?,owned_rod=? WHERE user_id=?',
                      (cost,body.rod,max(owned,body.rod),uid))
            return snapshot(c,uid,'Đã trang bị '+RODS[body.rod]['name'])

    @app.post('/api/fishing/sell')
    async def sell(request:Request,body:Sell):
        uid=member(request,'sell')
        with db() as c:
            p=player(c,uid)
            fish=one(c,'SELECT value FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            if not fish:return snapshot(c,uid,'Cá không còn trong túi.')
            if p['gold']+fish['value']>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            c.execute('DELETE FROM fishing_bag WHERE id=? AND user_id=?',(body.fish_id,uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(fish['value'],uid))
            return snapshot(c,uid,'Đã bán cá: +'+str(fish['value'])+' vàng')

    @app.post('/api/fishing/sell-common')
    async def sell_common(request:Request,body:BulkSell):
        uid=member(request,'sell')
        with db() as c:
            p=player(c,uid)
            # Use explicit IDs from the displayed inventory. A replay cannot sell
            # newly acquired fish, and rare or mutated fish are always excluded.
            ids=list(dict.fromkeys(body.fish_ids))
            marks=','.join('?' for _ in ids)
            rows=many(c,'SELECT id,value FROM fishing_bag WHERE user_id=? AND tier<=2 AND mutation=0 AND id IN ('+marks+')',(uid,*ids))
            total=sum(row['value'] for row in rows)
            if not rows:return snapshot(c,uid,'Không còn cá phổ thông được chọn.')
            if p['gold']+total>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            for row in rows:c.execute('DELETE FROM fishing_bag WHERE id=? AND user_id=?',(row['id'],uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(total,uid))
            progress(c,uid,sales=len(rows))
            return snapshot(c,uid,'Đã bán '+str(len(rows))+' cá: +'+str(total)+' vàng')

    @app.post('/api/fishing/claim')
    async def claim(request:Request,body:Claim):
        uid=member(request,'claim')
        with db() as c:
            p=player(c,uid)
            d=daily(c,uid)
            if body.day!=d['day']:return snapshot(c,uid,'Ngày đã đổi. Kiểm tra nhiệm vụ mới.')
            mask=1<<body.quest
            q=QUESTS[body.quest]
            count=d[['catch_count','sell_count','rare_count'][body.quest]]
            if d['claimed']&mask:return snapshot(c,uid,'Đã nhận thưởng nhiệm vụ này.')
            if count<q[2]:raise HTTPException(409,'Nhiệm vụ chưa hoàn thành.')
            if p['gold']+q[3]>GOLD_LIMIT:raise HTTPException(409,'Đã đạt giới hạn vàng.')
            c.execute('UPDATE fishing_daily SET claimed=? WHERE user_id=?',(d['claimed']|mask,uid))
            c.execute('UPDATE fishing_players SET gold=gold+? WHERE user_id=?',(q[3],uid))
            return snapshot(c,uid,'Hoàn thành nhiệm vụ: +'+str(q[3])+' vàng')
