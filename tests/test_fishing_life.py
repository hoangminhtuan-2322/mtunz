import sqlite3
from contextlib import contextmanager
from types import SimpleNamespace
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import fishing_life as game

def test_weights():
    assert sum(game.tier_weights(0,0))==100000
    assert sum(m[1] for m in game.MUTATIONS)==100000
    assert game.tier_weights(4,0)[9]==10
    assert len({n for m in game.MAPS for n in m['fish']})==30

def test_fishing_flow(tmp_path,monkeypatch):
    path=tmp_path/'game.db'
    @contextmanager
    def db():
        c=sqlite3.connect(path)
        c.row_factory=sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:c.close()
    with db() as c:
        c.execute('CREATE TABLE users(id INTEGER PRIMARY KEY)')
        c.executemany('INSERT INTO users(id) VALUES(?)',[(1,),(2,)])
    def current(request):
        if not request.headers.get('x-user'):raise HTTPException(401)
        return {'id':int(request.headers['x-user']),'is_admin':False}
    core=SimpleNamespace(app=FastAPI(),db=db,one=lambda c,q,a=():c.execute(q,a).fetchone(),
      many=lambda c,q,a=():[dict(r) for r in c.execute(q,a)],current_user=current,throttle=lambda *a:None)
    game.install(core)
    t=[100000]
    monkeypatch.setattr(game,'clock_ms',lambda:t[0])
    monkeypatch.setattr(game.secrets,'randbelow',lambda n:0)
    client=TestClient(core.app)
    prefix='/api/fishing/'
    assert client.get(prefix+'state').status_code==401
    a={'x-user':'1'};b={'x-user':'2'}
    def post(action,payload,h=a):
        r=client.post(prefix+action,json=payload,headers=h)
        assert r.status_code==200,r.text
        return r.json()
    initial=client.get(prefix+'state',headers=a).json()
    assert initial['gold']==150
    assert abs(sum(initial['odds'][0])-100)<1e-6
    assert client.post(prefix+'claim',headers=a,json={'quest':0,'day':initial['daily']['day']}).status_code==409
    assert client.post(prefix+'cast',json={'region':2},headers=a).status_code==403
    d=post('cast',{'region':0,'bait':0})
    first=d['cast']
    assert 'fish' not in first and first['region']==0
    assert post('cast',{'region':0})['cast']==first
    payload={'cast_id':first['id'],'step':0}
    assert post('tap',payload)['cast']==first
    assert post('tap',payload,b)['cast'] is None
    while d['cast']:
        old=d['cast']
        t[0]=old['action_at']
        payload={'cast_id':old['id'],'step':old['step']}
        d=post('tap',payload)
        replay=post('tap',payload)
        assert replay['cast']==d['cast']
        assert replay['caught']==d['caught']
    assert len(d['bag'])==1 and d['caught']==1 and len(d['book'])==1
    f=d['bag'][0]
    assert post('sell',{'fish_id':f['id']},b)['gold']==150
    d=post('sell',{'fish_id':f['id']})
    assert d['gold']==150+f['value'] and not d['bag']
    assert post('sell',{'fish_id':f['id']})['gold']==d['gold']
    assert client.post(prefix+'rod',json={'rod':1},headers=a).status_code==409
    with db() as c:c.execute('UPDATE fishing_players SET gold=500 WHERE user_id=1')
    d=post('rod',{'rod':1})
    assert d['gold']==50 and d['rod']==1
    assert post('rod',{'rod':1})['gold']==50
    d=post('cast',{'region':1,'bait':1})
    assert d['gold']==42
    t[0]=d['cast']['deadline']+1
    assert post('tap',{'cast_id':d['cast']['id'],'step':d['cast']['step']})['cast'] is None
    # Seed visible catches to verify the safe sale path, protection, replay and quest rewards.
    with db() as c:
        for i in range(5):
            c.execute('INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at) VALUES(?,?,?,?,?,?,?,?)',
                      (f'{i+1:032x}',1,0,0,0,100,20,t[0]))
        for ident,owner,tier,mutation in [('a'*32,1,3,0),('b'*32,1,0,1),('c'*32,2,0,0)]:
            c.execute('INSERT INTO fishing_bag(id,user_id,species,tier,mutation,grams,value,caught_at) VALUES(?,?,?,?,?,?,?,?)',
                      (ident,owner,tier,tier,mutation,100,50,t[0]))
    ids=[f'{i+1:032x}' for i in range(5)]+['a'*32,'b'*32,'c'*32]
    d=post('sell-common',{'fish_ids':ids+[ids[0]]})
    assert d['gold']==142 and len(d['bag'])==2
    assert post('sell-common',{'fish_ids':ids})['gold']==142
    assert client.get(prefix+'state',headers=b).json()['bag'][0]['id']=='c'*32
    day=d['daily']['day']
    assert d['daily']['quests'][1]['progress']==5
    d=post('claim',{'quest':1,'day':day})
    assert d['gold']==202 and d['daily']['quests'][1]['claimed']
    assert post('claim',{'quest':1,'day':day})['gold']==202
    t[0]+=86400000
    d=post('claim',{'quest':1,'day':day})
    assert d['gold']==202 and d['daily']['day']!=day and not d['daily']['quests'][1]['claimed']
    with db() as c:
        c.execute('DELETE FROM users WHERE id=1')
        assert not c.execute('SELECT * FROM fishing_daily WHERE user_id=1').fetchall()
        assert not c.execute('SELECT * FROM fishing_players WHERE user_id=1').fetchall()
        assert not c.execute('SELECT * FROM fishing_book WHERE user_id=1').fetchall()
