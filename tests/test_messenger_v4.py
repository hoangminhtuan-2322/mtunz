"""Messenger V4 integration tests; only disposable SQLite fixtures, never Neon."""
import asyncio
import io

import pytest
import app as core
from app import db, now, RATE_BUCKETS
from test_flows import logged_admin, register_user

@pytest.fixture(autouse=True)
def clean_v4():
    RATE_BUCKETS.clear()
    with db() as c:
        for table in ('scheduled_messages','admin_login_requests','message_requests',
                      'world_messages','world_penalties','user_reports','message_pins',
                      'group_messages','group_members','chat_groups','reactions',
                      'chat_preferences','attachments','recovery_grants','ticket_messages',
                      'tickets','notifications','messages','friendships','blocks',
                      'restrictions','sessions','trusted_devices','login_challenges',
                      'registrations','audit','account_deletion_requests'):
            c.execute('DELETE FROM '+table)
        c.execute('DELETE FROM users WHERE is_admin=0')
        c.execute("UPDATE settings SET value='100' WHERE key='max_users'")
    yield
    RATE_BUCKETS.clear()


def pair():
    admin=logged_admin()
    alice=register_user(admin,'voice_alice')
    bob=register_user(admin,'voice_bob')
    aid=alice.get('/api/me').json()['user']['id']
    bid=bob.get('/api/me').json()['user']['id']
    assert alice.post('/api/friends/request/'+str(bid)).status_code==200
    assert bob.post('/api/friends/accept/'+str(aid)).status_code==200
    return admin,alice,bob,aid,bid


def test_idempotent_chat_and_collision_rejected():
    _,alice,bob,aid,bid=pair()
    payload={'recipient_id':bid,'body':'Xin chào V4','client_message_id':'c_12345678123456781234567812345678'}
    first=alice.post('/api/messages',json=payload)
    assert first.status_code==200,first.text
    assert first.json()['replayed'] is False
    second=alice.post('/api/messages',json=payload)
    assert second.status_code==200,second.text
    assert second.json()['replayed'] is True
    assert second.json()['message']['id']==first.json()['message']['id']
    assert len(bob.get('/api/messages/'+str(aid)).json()['messages'])==1
    wrong=alice.post('/api/messages',json={**payload,'body':'Other text'})
    assert wrong.status_code==409
    assert alice.post('/api/messages',json={**payload,'client_message_id':'invalid'}).status_code==422


def test_real_device_delivery_ack_and_read_privacy():
    _,alice,bob,aid,bid=pair()
    sent=alice.post('/api/messages',json={'recipient_id':bid,'body':'Delivery receipt'})
    mid=sent.json()['message']['id']
    before=alice.get('/api/messages/'+str(bid)).json()['messages'][0]
    assert before['delivered_at'] is None and before['read_at'] is None
    assert alice.post('/api/messages/delivered/'+str(bid),json={'up_to':mid}).status_code==404
    ack=bob.post('/api/messages/delivered/'+str(aid),json={'up_to':mid})
    assert ack.status_code==200,ack.text
    assert ack.json()['delivered']==1
    assert bob.post('/api/messages/delivered/'+str(aid),json={'up_to':mid}).json()['delivered']==0
    delivered=alice.get('/api/messages/'+str(bid)).json()['messages'][0]
    assert delivered['delivered_at'] and delivered['read_at'] is None
    with db() as c:c.execute('UPDATE users SET show_receipts=0 WHERE id=?',(bid,))
    hidden=alice.get('/api/messages/'+str(bid)).json()['messages'][0]
    assert hidden['delivered_at'] is None and hidden['read_at'] is None
    assert bob.post('/api/messages/read/'+str(aid)).status_code==200
    with db() as c:c.execute('UPDATE users SET show_receipts=1 WHERE id=?',(bid,))
    read=alice.get('/api/messages/'+str(bid)).json()['messages'][0]
    assert read['read_at'] and read['delivered_at']


def test_scheduled_send_edit_cancel_and_exactly_once_restart():
    _,alice,bob,aid,bid=pair()
    future=now()+90
    sent=alice.post('/api/scheduled-messages',json={'recipient_id':bid,'body':'Birthday','send_at':future})
    assert sent.status_code==200,sent.text
    sid=sent.json()['id']
    assert alice.get('/api/scheduled-messages').json()['messages'][0]['id']==sid
    assert bob.get('/api/scheduled-messages').json()['messages']==[]
    illegal=bob.patch('/api/scheduled-messages/'+str(sid),json={'body':'Hacked','send_at':future+90})
    assert illegal.status_code==409
    changed=alice.patch('/api/scheduled-messages/'+str(sid),
                        json={'body':'Happy birthday 🎉','send_at':future+100})
    assert changed.status_code==200,changed.text
    with db() as c:c.execute('UPDATE scheduled_messages SET send_at=? WHERE id=?',(now()-1,sid))
    assert asyncio.run(core.messaging_v4_deliver_due())==1
    assert asyncio.run(core.messaging_v4_deliver_due())==0
    texts=[m['body'] for m in bob.get('/api/messages/'+str(aid)).json()['messages']]
    assert texts==['Happy birthday 🎉']
    assert alice.delete('/api/scheduled-messages/'+str(sid)).status_code==409
    another=alice.post('/api/scheduled-messages',json={'recipient_id':bid,'body':'Cancel','send_at':future})
    assert another.status_code==200
    assert alice.delete('/api/scheduled-messages/'+str(another.json()['id'])).status_code==200
    assert alice.delete('/api/scheduled-messages/'+str(another.json()['id'])).status_code==409


def test_schedule_is_refused_after_block_before_due():
    _,alice,bob,aid,bid=pair()
    r=alice.post('/api/scheduled-messages',json={'recipient_id':bid,'body':'Should not send','send_at':now()+80})
    assert r.status_code==200
    assert bob.post('/api/blocks/'+str(aid)).status_code==200
    with db() as c:c.execute('UPDATE scheduled_messages SET send_at=? WHERE id=?',(now()-1,r.json()['id']))
    assert asyncio.run(core.messaging_v4_deliver_due())==1
    with db() as c:
        record=c.execute('SELECT state,message_id FROM scheduled_messages WHERE id=?',(r.json()['id'],)).fetchone()
        assert record['state']=='failed' and record['message_id'] is None
        assert c.execute('SELECT COUNT(*) n FROM messages').fetchone()['n']==0


def test_authenticated_voice_media_waveform_and_size_limits():
    _,alice,bob,aid,bid=pair()
    payload=io.BytesIO(b'\x1a\x45\xdf\xa3'+b'0'*1024)
    file=alice.post('/api/uploads',files={'file':('voice.webm',payload,'audio/webm')},
       data={'waveform':'182fba908ab11c20','duration_ms':'15000'})
    assert file.status_code==200,file.text
    fid=file.json()['attachment']['id']
    msg=alice.post('/api/messages',json={'recipient_id':bid,'body':'','attachment_id':fid})
    assert msg.status_code==200,msg.text
    media=msg.json()['message']['attachment']
    assert media['mime']=='audio/webm' and media['duration_ms']==15000
    assert media['waveform']=='182fba908ab11c20'
    assert bob.get('/api/attachments/'+str(fid)).status_code==200
    bad=alice.post('/api/uploads',files={'file':('fake.webm',io.BytesIO(b'NOT_MEDIA'),'audio/webm')},
       data={'waveform':'0'*32,'duration_ms':'999'})
    assert bad.status_code==415
