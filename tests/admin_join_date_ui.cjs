'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/admin-console.css','utf8');
const start=js.indexOf('function adminJoinedAt(');
const end=js.indexOf('\nfunction adminUsers(){',start);
assert(start>=0&&end>start,'Dedicated Admin join-date formatter is present');
const ctx={Intl,Date,Object,Number};
vm.createContext(ctx);
vm.runInContext(js.slice(start,end),ctx);
const stamp=Date.parse('2026-11-21T13:59:07.000Z')/1000;
const result=ctx.adminJoinedAt(stamp);
assert(result.includes('21/11/2026'),'Complete year/month/day visible');
assert(result.includes('20:59:07'),'Hour/minute/second are visible');
assert(result.includes('UTC+7'),'Vietnam timezone is explicit');
assert(result.includes('datetime="2026-11-21T13:59:07.000Z"'),'Semantic machine-readable timestamp');
assert(result.includes('title="20:59:07 21/11/2026 (UTC+7)"'),'Full tooltip is available');
assert.equal(ctx.adminJoinedAt(0),'<span class="hint">Chưa có dữ liệu</span>');
assert.equal(ctx.adminJoinedAt('not-a-date'),'<span class="hint">Chưa có dữ liệu</span>');
assert.equal(ctx.adminJoinedAt(Number.POSITIVE_INFINITY),'<span class="hint">Chưa có dữ liệu</span>');
const summer=Date.parse('2026-05-02T17:03:09Z')/1000;
assert(ctx.adminJoinedAt(summer).includes('00:03:09'));
assert(ctx.adminJoinedAt(summer).includes('03/05/2026'));
const userRenderer=js.slice(end,js.indexOf('\nfunction adminDeletionQueue()',end));
assert(userRenderer.includes('data-sort-value=')&&userRenderer.includes('adminJoinedAt(u.created_at)'),
       'Admin users retain sortable timestamps and use complete formatter');
assert(userRenderer.includes('data-act="admin-user-detail"')&&userRenderer.includes('data-act="admin-user-revoke"'),
       'Admin management actions are unchanged');
assert(js.includes("const date = t=>"),'Compact date helper elsewhere stays untouched');
assert(css.includes('.admin-shell .admin-member-joined-date')&&
       css.includes('.admin-shell .admin-member-joined-clock'),
       'Full timestamps have readable desktop and mobile styles');
console.log('Admin users: full date, seconds, timezone, fallback, original sorting and actions OK');
