'use strict';
const assert = require('node:assert/strict');
const {createRefreshQueue, mergeRecentWindow,reuseMessageRows,upsertMessage,createSerialRefresh,reconnectDelay} = require('../mobile/src/realtime');

(async () => {
  const old = [{id: 1, body: 'old'}, {id: 2, body: 'outdated'}, {id: 7, body: 'new via socket'}];
  const incoming = [{id: 2, body: 'canonical'}, {id: 3, body: 'server'}];
  assert.deepEqual(mergeRecentWindow(old, incoming), [
    {id: 1, body: 'old'}, {id: 2, body: 'canonical'},
    {id: 3, body: 'server'}, {id: 7, body: 'new via socket'},
  ]);
  assert.deepEqual(mergeRecentWindow(old, []), old, 'empty response must not wipe socket messages');
  assert.deepEqual(mergeRecentWindow([], incoming), incoming);

  assert.equal(mergeRecentWindow(old,[]),old);
  assert.equal(reuseMessageRows(old,JSON.parse(JSON.stringify(old))),old);
  const changed=reuseMessageRows(old,[old[0],{id:2,body:'changed'},old[2]]);
  assert.equal(changed[0],old[0]);assert.equal(changed[2],old[2]);assert.notEqual(changed[1],old[1]);
  assert.equal(upsertMessage(old,{id:7,body:'new via socket'}),old);
  assert.deepEqual(upsertMessage(old,{id:3,body:'middle'}).map(x=>x.id),[1,2,3,7]);
  assert.deepEqual(upsertMessage(old,{id:8}).map(x=>x.id),[1,2,7,8]);
  assert.equal(upsertMessage(old,{id:0}),old);
  const received = [];
  const queue = createRefreshQueue(kinds => received.push(kinds), 10);
  queue.schedule(['lists', 'catchup']);
  queue.schedule(['lists']);
  queue.schedule(['chat']);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(received.length, 1, 'burst should trigger only one refresh');
  assert.deepEqual(new Set(received[0]), new Set(['lists', 'catchup', 'chat']),
    'new events must not cancel reconnect catch-up');

  queue.schedule(['lists']);
  queue.schedule();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(received.length, 2);
  assert.equal(received[1], null, 'unscoped event still requires full refresh');

  queue.schedule(['catchup']);
  queue.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(received.length, 2, 'unmounted component must never fetch');
  queue.schedule(['lists']);
  assert.equal(received.length, 2, 'stopped queue ignores new work');
  const sustained=[];const stream=createRefreshQueue(kinds=>sustained.push(kinds),25);
  const interval=setInterval(()=>stream.schedule(['lists']),3);
  try{await new Promise(resolve=>setTimeout(resolve,150));assert(sustained.length>=1,'continuous updates must flush before traffic stops');}
  finally{clearInterval(interval);stream.stop();}
  let starts=0,active=0,peak=0;const releases=[];
  const refresh=createSerialRefresh(async()=>{starts++;active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(resolve));active--;return starts;});
  const first=refresh(),second=refresh(),third=refresh();
  assert.equal(second,third);await Promise.resolve();assert.equal(starts,1);
  releases.shift()();assert.equal(await first,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,2);
  releases.shift()();assert.equal(await second,2);assert.equal(peak,1);
  const failed=createSerialRefresh(()=>{throw Error('offline');});
  await assert.rejects(failed(),/offline/);await assert.rejects(failed(),/offline/);
  assert.equal(reconnectDelay(1200,0),960);assert.equal(reconnectDelay(1200,1),1440);assert.equal(reconnectDelay(30000,1),30000);
  console.log('native realtime queue, stable rows, serial refresh and reconnect jitter regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

const {createRoomWindowGuard}=require('../mobile/src/realtime');
const guard=createRoomWindowGuard();
guard.reset('dm:1');
const oldVisit=guard.visit('dm:1'),oldLatest=guard.begin('dm:1',0),oldPage=guard.begin('dm:1',100);
assert(guard.olderBusy());assert.equal(guard.begin('dm:1',50),null);
guard.reset('dm:2');guard.reset('dm:1');
const latest=guard.begin('dm:1',0),newPage=guard.begin('dm:1',200);
assert(!guard.current(oldVisit)&&!guard.accepts(oldLatest)&&!guard.accepts(oldPage));
assert(!guard.finish(oldPage));assert(guard.olderBusy());
assert.equal(guard.pageMore(newPage,12),false);
assert.equal(guard.pageMore(latest,70),null,'Latest refresh cannot reopen exhausted pagination');
assert(guard.finish(newPage));assert(!guard.olderBusy());
const r1=guard.begin('dm:1',0),r2=guard.begin('dm:1',0);
assert(!guard.accepts(r1)&&guard.accepts(r2));
guard.reset(null);assert(!guard.accepts(r2));assert.equal(guard.begin('dm:1',0),null);
guard.reset('group:2');const visit=guard.visit('group:2');guard.exhausted(visit);
assert.equal(guard.pageMore(guard.begin('group:2',0),70),null);
console.log('Room visit isolation, out-of-order REST and independent pagination ownership: PASS');

const {createForegroundTicker,applyReceipt,reuseEqualPayload}=require('../mobile/src/realtime');
let ticks=0,startsTicker=0,stopsTicker=0,callback;
const ticker=createForegroundTicker(()=>ticks++,15000,{
 setInterval(fn,delay){assert.equal(delay,15000);startsTicker++;callback=fn;return startsTicker;},
 clearInterval(){stopsTicker++;}
});
ticker.start();ticker.start();assert.equal(startsTicker,1);
const oldTick=callback;oldTick();assert.equal(ticks,1);
ticker.stop();ticker.stop();oldTick();assert.equal(ticks,1);assert.equal(stopsTicker,1);
ticker.start();oldTick();callback();assert.equal(ticks,2);ticker.stop();
const receiptRows=[{id:1,sender_id:7,read_at:100},{id:2,sender_id:7},{id:3,sender_id:8}];
assert.equal(applyReceipt(receiptRows,7,'read',1,90),receiptRows);
assert.equal(applyReceipt(receiptRows,7,'read',1,100),receiptRows);
assert.equal(applyReceipt(receiptRows,7,'read',2,null),receiptRows);
const updated=applyReceipt(receiptRows,7,'read',2,100);
assert.equal(updated[0],receiptRows[0]);assert.equal(updated[1].read_at,100);assert.equal(updated[2],receiptRows[2]);
assert.equal(reuseEqualPayload(receiptRows,JSON.parse(JSON.stringify(receiptRows))),receiptRows);
console.log('Foreground-only timers, stale timer callbacks and stable receipt/list references: PASS');

{
 const {createHistoryJournal,applyHistoryEvent,replayHistoryEvents}=require('../mobile/src/realtime');
 const journal=createHistoryJournal(3);
 const a=journal.begin(),b=journal.begin();
 const original=[{id:8,sender_id:1,body:'old',reactions:[],read_at:0}];
 const reaction={kind:'reaction',id:8,userId:2,emoji:'❤',active:true};
 journal.record(reaction);
 const first=replayHistoryEvents(original,journal.finish(a),1);
 assert.equal(first[0].reactions.length,1);
 assert.equal(applyHistoryEvent(first,reaction,1),first,'duplicate reaction must preserve row identity');
 journal.record({kind:'edit',id:8,body:'edited',deletedAt:null,editedAt:10});
 journal.record({kind:'receipt',type:'read',upTo:8,at:12});
 const second=replayHistoryEvents(original,journal.finish(b),1);
 assert.equal(second[0].body,'edited');assert.equal(second[0].read_at,12);assert.equal(second[0].reactions.length,1);
 const removed=applyHistoryEvent(second,{kind:'edit',id:8,body:'',deletedAt:15,editedAt:10},1);
 assert.equal(removed[0].attachment,null);assert.equal(removed[0].reactions.length,0);
 assert.equal(applyHistoryEvent(removed,reaction,1),removed,'reactions cannot resurrect deleted content');
 const stale=journal.begin();journal.reset();assert.equal(journal.finish(stale),null);
 const flood=journal.begin();for(let i=0;i<4;i++)journal.record(reaction);assert.equal(journal.finish(flood),null);
 console.log('Concurrent history/event journal, duplicate reaction, receipt, deletion and room reset: PASS');
}
