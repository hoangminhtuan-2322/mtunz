'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const api=fs.readFileSync('app.py','utf8');
const html=fs.readFileSync('static/index.html','utf8');

assert(app.includes("if(t==='admin-member-activity'&&state.user?.is_admin)"),
       'Only the Admin client consumes the privileged activity feed');
assert(api.includes("await hub.admins('admin-member-activity'"),
       'Admin events are not broadcast to members');
assert(api.includes("if uid is not None and msg.get('type')=='member-activity'"),
       'Server authenticates the member socket');
assert(api.includes("is_admin=0"),'Only members are considered for tracked activity');
assert(app.includes("document.addEventListener('pointerdown',sendMemberActivity"),
       'Foreground interactions update member last activity');
assert(app.includes("document.visibilityState!=='visible'"),
       'Background tabs do not send activity events');
assert(app.includes("const stamp=Date.now()"), 'Client applies a timestamp-based throttle');
assert(app.includes('data-admin-last-seen='),'Admin table and detail have live timestamp');
assert(app.includes('data-admin-presence='),'Admin table and detail have live presence');
assert(app.includes('function adminPatchUserActivity('),'Admin patches fields without rerender');
assert(!app.includes('window.localStorage.setItem("admin-user-details"'),
       'Sensitive details must not persist to browser storage');
assert(html.includes('/static/app.js?v=20.4'),'V14 cache bust');

const begin=app.indexOf('function adminPatchUserActivity(');
const end=app.indexOf('function adminUsers(){',begin);
assert(begin>=0&&end>begin);
const code=app.slice(begin,end);
const timeEl={dataset:{lastSeenAt:'0'},tagName:'TIME',textContent:'',dateTime:''};
const liveEl={textContent:''};
const state={adminTab:'users',adminData:[{id:7,last_seen:10,online:false}]};
const ctx={
 state,
 document:{querySelectorAll(selector){
   if(selector==='[data-admin-last-seen="7"]')return [timeEl];
   if(selector==='[data-admin-presence="7"]')return [liveEl];
   return [];
 }},
 deadlineDate:t=>'date:'+t,
 Date
};
vm.runInNewContext(code,ctx);
ctx.adminPatchUserActivity({user_id:7,last_seen:1234,online:true});
assert.equal(timeEl.textContent,'date:1234');
assert.equal(timeEl.dataset.lastSeenAt,'1234');
assert.equal(liveEl.textContent,'Đang kết nối');
assert.equal(state.adminData[0].last_seen,1234);
assert.equal(state.adminData[0].online,true);
ctx.adminPatchUserActivity({user_id:7,last_seen:1233,online:false});
assert.equal(timeEl.textContent,'date:1234','Old packets cannot undo newer last seen');
ctx.adminPatchUserActivity({user_id:7,last_seen:1235,online:false});
assert.equal(liveEl.textContent,'Ngoại tuyến');
assert.equal(state.adminData[0].online,false);
console.log('Admin realtime activity and private review UI verified');
