'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=target=>fs.readFileSync(path.join(root,target),'utf8');
const presence=require('../mobile/src/presence.js');
const messenger=read('mobile/src/Messenger.js');
const admin=read('mobile/src/AdminDashboard.js');
const web=read('static/app.js');
const backend=read('app.py');
const app=require('../mobile/app.json').expo;

const clock=Date.parse('2026-11-23T13:00:00Z');
const nowSeconds=Math.floor(clock/1000);
assert.equal(presence.validSeconds(0),0);
assert.equal(presence.validSeconds('not-a-date'),0);
assert.equal(presence.validSeconds(999999999999),0); // Milliseconds must not be interpreted as seconds.
assert.equal(presence.friendLastActiveText(null,clock),'');
assert(presence.friendLastActiveText(nowSeconds-25,clock).startsWith('Vừa hoạt động · '));
assert(presence.friendLastActiveText(nowSeconds-61,clock).startsWith('Hoạt động 1 phút trước · '));
assert(presence.friendLastActiveText(nowSeconds-3599,clock).startsWith('Hoạt động 59 phút trước · '));
assert(presence.friendLastActiveText(nowSeconds-3600,clock).startsWith('Hoạt động 1 giờ trước · '));
assert(presence.friendLastActiveText(nowSeconds-86400,clock).startsWith('Hoạt động gần nhất: '));
assert(presence.friendLastActiveText(nowSeconds+3,clock).startsWith('Vừa hoạt động · '));
assert.equal(presence.friendPresence({online:true,last_seen:nowSeconds-70},true,clock).short,'Đang hoạt động');
assert.equal(presence.friendPresence({online:false,last_seen:null},true,clock).kind,'hidden');
assert.equal(presence.friendPresence({online:false,last_seen:null},true,clock).short,'');
assert.equal(presence.friendPresence({online:true,last_seen:nowSeconds},false,clock).kind,'syncing');
assert.equal(presence.friendPresence({online:false,last_seen:nowSeconds-90},true,clock).short,
  'Hoạt động 1 phút trước');
assert.equal(presence.adminLastActivityRelative(nowSeconds-1,false,clock),'Vừa xong');
assert.equal(presence.adminLastActivityRelative(nowSeconds-120,false,clock),'2 phút trước');
assert.equal(presence.adminLastActivityRelative(nowSeconds-3600,false,clock),'1 giờ trước');
assert.equal(presence.adminLastActivityRelative(null,false,clock),'Chưa ghi nhận');
assert.equal(presence.adminLastActivityRelative(null,true,clock),'Đang trực tuyến');
assert.equal(presence.adminPresence({online:false,last_active_at:nowSeconds-125},clock).short,'2 phút trước');
assert.equal(presence.adminPresence({online:true,last_seen:nowSeconds-125},clock).short,'Đang trực tuyến');

for(const fragment of [
  "function friendLastActiveText(seconds,clock=Date.now())",
  "if(elapsed<60)return 'Vừa hoạt động · '+exact;",
  "if(elapsed<3600)return 'Hoạt động '+Math.floor(elapsed/60)+' phút trước · '+exact;",
  "if(elapsed<86400)return 'Hoạt động '+Math.floor(elapsed/3600)+' giờ trước · '+exact;",
  "function adminLastActivityRelative(seconds,online=false,clock=Date.now())",
])assert(web.includes(fragment),'Native status must reflect web semantics: '+fragment);

for(const required of [
  "import {friendPresence} from './presence';",
  "const peerStatus=friendPresence(peer,connection==='online',presenceClock);",
  "setPresenceClock(Date.now())",
  "presenceEventsRef.current.set(data.user_id,event)",
  "event.version<=presenceBefore",
  "friendPresence(friend,connected,clock)",
  "connection==='online'?acceptedFriends.filter(f=>f.online===true):[]",
  "['unread','Chưa đọc'",
  "['online','Hoạt động'",
  "onPress={()=>setInboxFilter(value)}",
  "Không chia sẻ trạng thái hoạt động",
  "show_online:!user.show_online",
  "await onProfile?.();await refreshLists();",
])assert(messenger.includes(required),'Missing native smart presence behavior: '+required);
for(const required of [
  "import {adminPresence} from './presence';",
  "const poll=async()=>",
  "setInterval(poll,15000)",
  "setInterval(poll,30000)",
  "adminPresence(item,presenceClock)",
  "['activity','Hoạt động gần đây']",
  "'&sort='+encodeURIComponent(order)",
])assert(admin.includes(required),'Missing native admin activity behavior: '+required);
for(const required of [
  "r['online']=show_activity and bool(hub.users.get(r['other_id']))",
  "if not show_activity:",
  "r['last_seen']=None",
  "await hub.user(other,'presence',user_id=uid,online=bool(online),last_seen=stamp)",
  "'last_active_at'",
])assert(backend.includes(required),'Backend must govern privacy and live state: '+required);
assert.equal(app.android.package,'com.mtunz.web');
assert.equal(app.version,'1.1.4');
assert.equal(app.android.versionCode,7);
console.log('Web-parity native presence, last activity, privacy, stale-socket, Admin monitoring and signed version: PASS');
