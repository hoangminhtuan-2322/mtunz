'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('static/admin-v5.js','utf8');
const css=fs.readFileSync('static/admin-v5.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const server=fs.readFileSync('admin_security_v5.py','utf8');
new vm.Script(js,{filename:'static/admin-v5.js'});
assert(html.includes('/static/admin-v5.js?v=1.2'));
assert(html.includes('/static/admin-v5.css?v=1.1'));
assert(css.includes('.v5-maint-dates')&&css.includes('.v5-maint-presets'));
assert(css.includes('@media(max-width:650px)'),'Narrow-viewport layout required');
assert(css.includes('position:sticky'),'Save actions remain available while modal scrolls');
assert(js.includes('adminV3PinPayload(host)'),'Privileged save requires Admin PIN');
assert(server.includes('core.verify_admin_pin_stepup(request,admin,body.admin_pin)'));
assert(server.includes('at+30*86400')&&server.includes('body.starts_at+7*86400'));
assert(js.includes("new Intl.DateTimeFormat('vi-VN'"),'Review times must be in 24h Vietnamese format');
assert(!js.includes('localStorage.setItem(')&&!js.includes('sessionStorage.setItem('),
 'Never persist Admin PIN or maintenance text in local/session storage');

const first=js.indexOf('const adminV5Pad=');
const last=js.indexOf('function adminV5DoRevoke(){',first);
assert(first>0&&last>first);
const fields={};
const ctx={
 Date,Intl,Number,String,Math,JSON,
 esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),
 adminV3PinFields:()=>'<input type="password" id="admin-v3-pin" required>'
};
vm.runInNewContext(js.slice(first,last),ctx,{timeout:1000});
const d=new Date(2026,10,22,19,16,0,0);
const timestamp=Math.floor(d.getTime()/1000);
const parts=ctx.adminV5LocalParts(timestamp);
assert.equal(parts.day,'2026-11-22');
assert.equal(parts.time,'19:16');
assert.equal(ctx.adminV5LocalStamp(parts.day,parts.time),timestamp);
assert.equal(ctx.adminV5LocalStamp('2026-02-30','10:00'),null);
assert.equal(ctx.adminV5LocalStamp('2026-12-01','24:00'),null);
assert.match(ctx.adminV5FormatWhen(timestamp),/19:16/);
assert.equal(ctx.adminV5MaintenanceDuration(5400),'1 giờ 30 phút');
const rendered=ctx.adminV5MaintenanceFormMarkup(null);
for(const id of ['v5-maint-start-date','v5-maint-start-time','v5-maint-end-date',
 'v5-maint-end-time','v5-maint-reason','v5-maint-summary-times','v5-maint-sample-text']){
 assert(rendered.includes(id),'Missing field '+id);
}
assert(rendered.includes('30 phút')&&rendered.includes('4 giờ'));
assert(rendered.includes('không xóa tài khoản'));
assert(rendered.includes('admin-v3-pin'));

function form(start,end,reason){
 const a=ctx.adminV5LocalParts(start),b=ctx.adminV5LocalParts(end);
 const data={
  '#v5-maint-start-date':a.day,'#v5-maint-start-time':a.time,
  '#v5-maint-end-date':b.day,'#v5-maint-end-time':b.time,
  '#v5-maint-reason':reason
 };
 return {querySelector(id){return {value:data[id]||''}}};
}
const now=Math.floor(Date.now()/1000);
const begin=Math.ceil((now+180)/60)*60;
assert.equal(ctx.adminV5ReadMaintenanceForm(form(begin,begin+3600,'Nâng cấp hệ thống')).error,'');
assert.match(ctx.adminV5ReadMaintenanceForm(form(begin,begin+30,'Lý do')).error,/tối thiểu 1 phút/);
assert.match(ctx.adminV5ReadMaintenanceForm(form(begin,begin+8*86400,'Lý do')).error,/7 ngày/);
assert.match(ctx.adminV5ReadMaintenanceForm(form(begin,begin+3600,'')).error,/lý do/);
assert.match(ctx.adminV5ReadMaintenanceForm(form(begin-86400,begin,'Lý do')).error,/hiện tại/);
assert.match(ctx.adminV5ReadMaintenanceForm(form(begin+31*86400,begin+31*86400+60,'Lý do')).error,/30 ngày/);
console.log('Admin maintenance V16: valid 24-hour fields, constraints, preview, PIN and responsive CSS verified.');
