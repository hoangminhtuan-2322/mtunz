'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');

const listeners = new Map(), notifications = [], windows = [];
const self = {
  addEventListener: (event, handler) => listeners.set(event, handler),
  registration: {
    async showNotification(title, options) {
      notifications.push({title, ...options});
    },
  },
  clients: {
    async matchAll() { return []; },
    async openWindow(url) { windows.push(url); },
  },
};

async function dispatch(kind, event) {
  let task;
  listeners.get(kind)({...event, waitUntil(promise) { task = promise; }});
  await task;
}

(async () => {
  vm.runInNewContext(readFileSync('static/chat-alert-worker.js', 'utf8'), {self});
  for (const payload of [
    {type: 'dm', chat_id: 7, silent: false},
    {type: 'group', chat_id: 8, silent: true},
    {type: 'support', chat_id: 3, silent: false},
    {type: 'registration', chat_id: 0, silent: false},
    {type: 'test', chat_id: 0, silent: false},
    {type: 'unrecognised'},
  ]) await dispatch('push', {data: {json: () => payload}});

  assert.deepEqual(notifications.map(entry => [entry.tag, entry.silent]), [
    ['chat:dm:7', false], ['chat:group:8', true],
    ['admin:support:3', false], ['admin:registration', false], ['mtunz:push-test', false],
  ]);
  assert(notifications[0].renotify);
  assert.equal(notifications[1].renotify, false);
  assert.match(notifications[2].body, /hỗ trợ/);
  assert.match(notifications[3].body, /chờ duyệt/);
  let closed = false;
  await dispatch('notificationclick', {notification: {close() { closed = true; }}});
  assert(closed);
  assert.deepEqual(windows, ['/']);
  console.log('Background notification worker passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
