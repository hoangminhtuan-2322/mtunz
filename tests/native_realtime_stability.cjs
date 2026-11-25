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
