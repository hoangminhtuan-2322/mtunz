'use strict';
const assert = require('node:assert/strict');
const {createRefreshQueue, mergeRecentWindow} = require('../mobile/src/realtime');

(async () => {
  const old = [{id: 1, body: 'old'}, {id: 2, body: 'outdated'}, {id: 7, body: 'new via socket'}];
  const incoming = [{id: 2, body: 'canonical'}, {id: 3, body: 'server'}];
  assert.deepEqual(mergeRecentWindow(old, incoming), [
    {id: 1, body: 'old'}, {id: 2, body: 'canonical'},
    {id: 3, body: 'server'}, {id: 7, body: 'new via socket'},
  ]);
  assert.deepEqual(mergeRecentWindow(old, []), old, 'empty response must not wipe socket messages');
  assert.deepEqual(mergeRecentWindow([], incoming), incoming);

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
  console.log('native realtime queue and window merge regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
