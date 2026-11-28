"""Account isolation, timed catch, single-use token and economy regression."""
from test_flows import logged_admin, register_user, clean_database
from fastapi.testclient import TestClient
from app import app, db
import fishing_game as game

def test_fishing_game_round_trip(monkeypatch):
    admin=logged_admin()
    a=register_user(admin,'fishing_alice')
    b=register_user(admin,'fishing_bob')
    assert TestClient(app).get('/api/fishing').status_code in (401,403)
    assert admin.get('/api/fishing').status_code==403
    now=[1800000000000]
    monkeypatch.setattr(game,'clock_ms',lambda:now[0])
    monkeypatch.setattr(game,'weighted_fish',lambda level:game.FISH[0])
    s=a.get('/api/fishing').json()
    assert s['level']==1 and s['coins']==0 and len(s['rods'])==10
    assert len(s['fish'])==13 and not s['bag']
    assert a.post('/api/fishing/upgrade',json={'level':2}).status_code==409
    assert a.post('/api/fishing/sell',json={'fish_id':'minnow','quantity':1}).status_code==409
    cast=a.post('/api/fishing/cast').json()['cast']
    assert a.post('/api/fishing/cast').json()['cast']['token']==cast['token']
    assert b.post('/api/fishing/reel',json={'token':cast['token']}).status_code==409
    early=a.post('/api/fishing/reel',json={'token':cast['token']}).json()
    assert early['result']=={'caught':False,'reason':'early'}
    cast=a.post('/api/fishing/cast').json()['cast']
    now[0]=cast['expires_at']+1
    late=a.post('/api/fishing/reel',json={'token':cast['token']}).json()
    assert late['result']=={'caught':False,'reason':'late'}
    for _ in range(10):
        cast=a.post('/api/fishing/cast').json()['cast']
        now[0]=cast['bite_at']
        response=a.post('/api/fishing/reel',json={'token':cast['token']})
        assert response.status_code==200,response.text
        assert response.json()['result']['caught']
        assert a.post('/api/fishing/reel',json={'token':cast['token']}).status_code==409
    s=a.get('/api/fishing').json()
    assert s['bag']=={'minnow':10} and s['caught']==10 and s['daily']['caught']==10
    assert b.get('/api/fishing').json()['bag']=={}
    s=a.post('/api/fishing/sell',json={'fish_id':'minnow','quantity':10}).json()
    assert s['coins']==80 and not s['bag'] and s['collection']=={'minnow':10}
    assert a.post('/api/fishing/upgrade',json={'level':3}).status_code==409
    s=a.post('/api/fishing/upgrade',json={'level':2}).json()
    assert s['level']==2 and s['coins']==20
    s=a.post('/api/fishing/daily').json()
    assert s['coins']==120 and s['daily']['claimed']
    assert a.post('/api/fishing/daily').status_code==409
    assert a.get('/api/fishing/ranking').json()['ranking'][0]['name']=='Bạn'
    now[0]+=86400000
    assert a.get('/api/fishing').json()['daily']['caught']==0

def test_fishing_weighted_pool_unlocks_by_rod():
    for level in range(1,11):
        for _ in range(50):
            fish=game.weighted_fish(level)
            assert fish[4]<=level
