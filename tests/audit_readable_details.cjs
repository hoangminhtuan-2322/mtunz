'use strict';
// Real audit records should be understandable without inspecting raw event codes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/admin-console.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const start=src.indexOf('const auditNames={');
const end=src.indexOf('function auditLevel(log){',start);
const modalStart=src.indexOf('async function adminAuditDetail(eventId){');
const modalEnd=src.indexOf('\nfunction renderAdmin(){',modalStart);
assert(start>0&&end>start&&modalStart>0&&modalEnd>modalStart);
let shown=null;
const sample={
 id:14,admin_id:1,admin_username:'admin',
 action:'maintenance_member_reset',severity:'high',created_at:1794979650,
 detail:'Non-admin accounts and user-generated data reset; administrator and configuration retained'
};
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const context={
 api:async()=>({event:sample}),
 modal:options=>{shown=options},
 adminDetailRow:(name,value)=>'<div><span>'+esc(name)+'</span><strong>'+value+'</strong></div>',
 esc,deadlineDate:()=> '12:27 18/11/2026',auditLevel:e=>[e.severity,e.severity==='high'?'Quan trọng':'Thông thường'],
};
vm.createContext(context);
vm.runInContext(src.slice(start,end)+'\n'+src.slice(modalStart,modalEnd)+'\nthis.inspect=auditMeaning;this.open=adminAuditDetail;',context,{timeout:1000});
const parsed=context.inspect(sample);
assert.equal(parsed.facts.length,2,'Both effects shown only when present in original record');
assert(parsed.description.includes('đặt lại tài khoản thành viên'));
assert(parsed.facts[0][1].includes('không phải quản trị viên'));
assert(parsed.facts[1][1].includes('cấu hình hệ thống'));
assert(parsed.note.includes('không ghi rõ danh sách tài khoản'));
assert.equal(context.inspect({...sample,detail:'Manual maintenance'}).facts.length,0,'Do not invent effects without log proof');
assert.equal(context.inspect({action:'unrecognized_event',detail:'<script>alert(1)</script>'}).facts.length,0);
(async()=>{
 await context.open(14);
 assert(shown,'Modal must open');
 assert.equal(shown.confirm,'Đóng');
 assert.equal(shown.cancel,null,'No redundant Hủy button on read-only detail');
 for(const phrase of ['Ai thực hiện và khi nào?','Phạm vi và thông tin liên quan',
     'Dữ liệu được ghi nhận là đã đặt lại','Dữ liệu được ghi nhận là đã giữ lại',
     'Thông tin kỹ thuật gốc','Mã hành động','Thời gian Unix'])
   assert(shown.content.includes(phrase),'Missing human readable detail: '+phrase);
 assert(shown.content.includes('<details'),'Raw technical fields should be collapsed');
 assert(shown.content.includes('Non-admin accounts and user-generated data reset'),'Raw original remains intact');
 assert(css.includes('.admin-audit-explanation')&&css.includes('.admin-audit-technical'));
 assert(html.includes('app.js?v=20.0')&&html.includes('admin-console.css?v=12.2'));
 console.log('Admin audit details: grounded Vietnamese explanation, intact raw record, responsive UI.');
})().catch(e=>{console.error(e);process.exitCode=1});
