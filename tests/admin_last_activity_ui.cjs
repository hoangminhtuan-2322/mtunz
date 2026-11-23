'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/admin-upgrade.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const consoleJs=fs.readFileSync('static/admin-console.js','utf8');

assert(app.includes('Lần cuối hoạt động</th>'),'Admin members table includes activity column');
assert(app.includes('class="data-table admin-users-table"'),'Admin member table has responsive scope');
assert(app.includes('data-label="Lần cuối hoạt động"'),'Mobile cards have accessible activity label');
assert(app.includes('colspan="7"'),'Empty row spans the additional column');
assert(app.includes("state.adminUserSort='activity'"),'Reset restores activity-first sort');
assert(app.includes("sort:state.adminUserSort||'activity'"),'Admin fetch uses server sorting');
assert(app.includes('adminRefreshLastActivityLabels'),'Relative timestamps refresh without reloading the table');
assert(app.includes('adminLastActivityCell(u)'),'The activity data is actually rendered');
assert(css.includes('.admin-users-table tbody tr[hidden]{display:none!important}'),'Filtering can hide mobile cards');
assert(css.includes('.admin-last-activity.is-online'),'Connection state is visually distinct');
assert(css.includes('td:nth-child(4)'),'Mobile hides secondary table columns');
assert(consoleJs.includes("if(tab==='users')return;"),'Client-only header sorting does not scramble server pagination');
assert(html.includes('app.js?v=21.4'),'New JS bypasses browser cache');
assert(html.includes('admin-upgrade.css?v=1.2'),'New responsive CSS bypasses browser cache');

const start=app.indexOf('function adminLastActivityRelative(');
const end=app.indexOf('function adminLastActivityCell(',start);
assert(start>0&&end>start);
const relative=vm.runInNewContext(app.slice(start,end)+';adminLastActivityRelative;');
const clock=new Date(2026,10,23,12,0,0).getTime();
const sec=ms=>Math.floor(ms/1000);
assert.equal(relative(null,false,clock),'Chưa ghi nhận');
assert.equal(relative(sec(clock-30000),false,clock),'Vừa xong');
assert.equal(relative(sec(clock-2*60000),false,clock),'2 phút trước');
assert.equal(relative(sec(clock-3*3600000),false,clock),'3 giờ trước');
assert.equal(relative(sec(clock-300000),true,clock),'Đang trực tuyến');
assert.match(relative(sec(clock-86400000),false,clock),/Hôm qua/);
console.log('Admin last activity layout, relative dates, and sorting checks passed.');
