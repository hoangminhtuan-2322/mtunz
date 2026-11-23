'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {shouldRetrySession}=require('../mobile/src/sessionRecovery');
for(const status of [0,408,429,500,502,503,504])
  assert(shouldRetrySession({status}), 'Transient session error should preserve login: '+status);
for(const status of [400,401,403,404,410,422])
  assert(!shouldRetrySession({status}), 'Nontransient session errors should not retry: '+status);
const ui=fs.readFileSync(path.join(root,'mobile/App.js'),'utf8');
for(const expected of ['setRecoverToken(restored)','recoverSession','AppState.addEventListener',
 'Đang tạm mất kết nối','Thử kết nối lại','recoveryRunRef.current','await clear();'])
  assert(ui.includes(expected),'Missing native session recovery: '+expected);
const net=fs.readFileSync(path.join(root,'mobile/src/client.js'),'utf8');
assert(net.includes("const STORE_KEY = 'mtunz-native-session-v1'"),'Session stored securely unchanged');
console.log('Native temporary outage, recovery retry, and invalid-session policies passed');
