'use strict';
// Guard Admin native realtime reconnect and background notification lifecycle.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'mobile/src/AdminDashboard.js'),'utf8');
const push=fs.readFileSync(path.join(root,'mobile/src/DevicePushSettings.js'),'utf8');
assert(admin.includes('reconnectTimer=null,retryMs=1000'),'Admin needs a dedicated fast reconnect timer');
assert(admin.includes('Math.min(retryMs*2,16000)'),'Admin reconnect backoff must be bounded');
assert(admin.includes("AppState.currentState==='active'&&!reconnectTimer"),
  'Admin must not reconnect WebSocket while app is backgrounded');
assert(admin.includes('retryMs=1000;stopRetry();fetchNow();'),
  'Successful reconnect must refresh pending Admin notifications promptly');
assert(admin.includes('stopHeartbeat();stopRetry();'),
  'Backgrounding and unmounting Admin must cancel scheduled reconnect');
assert(push.includes('getExpoPushTokenAsync({projectId})'),
  'Background notifications must use native Expo push token and configured project');
assert(push.includes("await api('/api/mobile/push'"),
  'Push registration must be associated with authenticated native account');
console.log('Admin reconnect and native background push lifecycle: PASS');
