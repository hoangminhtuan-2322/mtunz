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

const {validApiOrigin,validApiPath,validSessionToken,validResponseObject}=require('../mobile/src/apiSecurity');
assert(validApiOrigin('https://mtunz.onrender.com'));assert(validApiOrigin('http://localhost:8000',true));
for(const origin of ['http://mtunz.onrender.com','https://user@evil.test','https://mtunz.onrender.com?x','https://mtunz.onrender.com#x','https://mtunz.onrender.com:99999','https://a..b'])assert(!validApiOrigin(origin),origin);
for(const route of ['/api/me','/api/search/messages?q=hello%20world','/api/groups/42/messages?after=1'])assert(validApiPath(route),route);
for(const route of ['https://evil.test/api/me','//evil.test','/api/../admin','/api/%2e%2e/admin','/api/a%2fb','/api/a\\b','/api/me#frag','/api/me\n'])assert(!validApiPath(route),route);
assert(validSessionToken('a'.repeat(64)));assert(!validSessionToken(undefined));assert(!validSessionToken('x'.repeat(129)));
assert(validResponseObject({}));assert(!validResponseObject([]));assert(!validResponseObject(null));
assert(net.includes('validApiPath(path)')&&net.includes('validResponseObject(payload)')&&net.indexOf('payload=await res.json()')<net.indexOf('clearTimeout(timer)'));
console.log('API route/origin/token guards and fail-closed JSON response handling: PASS');
