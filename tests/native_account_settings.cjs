'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const messenger=fs.readFileSync(path.join(root,'mobile/src/Messenger.js'),'utf8');
const push=fs.readFileSync(path.join(root,'mobile/src/DevicePushSettings.js'),'utf8');
const features=fs.readFileSync(path.join(root,'features.py'),'utf8');
const cfg=require('../mobile/app.json').expo;
const settings=messenger.slice(messenger.indexOf("{tab==='settings'&&<ScrollView"),
  messenger.indexOf("<View style={css.tabs}>",messenger.indexOf("{tab==='settings'&&<ScrollView")));
assert(settings.length>1000,'Account tab should render real settings and actions');
for(const token of ['contentContainerStyle={css.accountPage}','<AccountGroup title="Tài khoản và riêng tư">',
  '<AccountGroup title="Thông báo">','<AccountGroup title="Hỗ trợ">',
  'Hồ sơ và quyền riêng tư','Bảo mật và thiết bị','Thông báo trong ứng dụng',
  'Trung tâm hỗ trợ','Đăng xuất','<DevicePushSettings token={token} compact/>',
  "onPress={()=>{setDialog('security');loadDevices();}}",
  "onPress={()=>{setDialog('notifications');refreshLists();}}",
  'onPress:onLogout',
])assert(settings.includes(token),'Missing real account-setting action: '+token);
assert(!settings.includes('<Section title="Hồ sơ & riêng tư">'),
  'Old oversized profile cards must be removed');
assert(!settings.includes('Thông báo mới ({noticesUnread})'),
  'Avoid a giant button for large unread counts');
assert(settings.includes("noticesUnread>99?'99+':noticesUnread"),
  'Cap badge display at 99+ without changing actual unread count');
assert(messenger.includes('n.filter(x=>!x.read_at).length'),
  'Unread must come from server read_at, not fabricated');
const notices=messenger.slice(messenger.indexOf("dialog==='notifications'"),
  messenger.indexOf("dialog==='security'"));
assert(notices.includes("noticesUnread>0&&<Btn small quiet"),
  'Mark read must only appear if unread notifications exist');
assert(notices.includes("!n.read_at&&css.notificationUnread"),
  'Unread notifications need a visible distinction');
assert(notices.includes("'/api/notifications/read'"),
  'Keep the server notification read endpoint');
const security=messenger.slice(messenger.indexOf("dialog==='security'"),
  messenger.indexOf("dialog==='support'"));
for(const token of ['deviceSessions.map(item','rememberedDevices.map(item',
  "onPress={()=>revokeDevice('session',item)}",
  "onPress={()=>revokeDevice('remembered',item)}",
  "'/api/me/sessions/revoke-others'"])
  assert(security.includes(token),'Security must render authorized device actions: '+token);
assert(messenger.includes("await invoke('/api/me/sessions')") &&
  messenger.includes("setDeviceSessions(result.sessions||[])"),
  'Device list must use the authorized session endpoint');
assert(messenger.includes("if(item.current&&kind==='session')return"),
  'Never offer to revoke the current active session');
for(const token of ["@app.get('/api/me/sessions')","@app.delete('/api/me/sessions/{kind}/{device_id}')",
  "@app.post('/api/me/sessions/revoke-others')"])
  assert(features.includes(token),'Existing backend session contract missing: '+token);
assert(push.includes("export default function DevicePushSettings({token,compact=false})"),
  'Allow the push status to be embedded in compact settings');
assert(push.includes('accessibilityState={{expanded}}'),'Push detail must be expandable');
assert(push.includes("if(!readyForPush)return;"),'Do not query inactive push credentials');
assert(push.includes("const actions=!readyForPush?[]:"),'Never show unusable push enable control');
assert(push.includes('chưa kết nối Firebase/Expo Push'),
  'Do not falsely state FCM is connected');
assert(push.includes("Thông báo trong ứng dụng vẫn có thể xem ở mục phía trên"),
  'Distinguish in-app notices from unavailable background push');
assert.equal(cfg.version,'1.0.0');
assert.equal(cfg.android.versionCode,10);
assert.equal(cfg.android.package,'com.mtunz.web');
console.log('Compact account page, secure device management, true push readiness and versionCode 10: PASS');
