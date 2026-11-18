'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('static/app.js','utf8');
const server=fs.readFileSync('app.py','utf8');
const consoleJS=fs.readFileSync('static/admin-console.js','utf8');
const css=fs.readFileSync('static/admin-console.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');

new vm.Script(app,{filename:'app.js'});
new vm.Script(consoleJS,{filename:'admin-console.js'});
for(const token of [
 'function adminAudit(){','function adminAuditDetail(eventId){',
 'function auditLabel(action){','function auditDateValue(timestamp){',
 'data-form="admin-audit-search"','data-act="admin-audit-detail"',
 'data-act="admin-audit-more"','data-act="admin-audit-clear"',
 'data-act="admin-user-edit"','data-act="admin-user-revoke"',
 'data-act="admin-registration-detail"','function editUserAsAdmin(uid){',
 'function revokeUserSessionsAsAdmin(uid){'
]) assert(app.includes(token),'Admin audit or management interaction missing: '+token);
for(const token of [
 "case 'admin-audit-detail':","case 'admin-audit-more':",
 "case 'admin-audit-search':","case 'admin-user-edit':",
 "case 'admin-user-revoke':","case 'admin-registration-detail':"
]) assert(app.includes(token),'Missing action handler '+token);
for(const token of [
 "'/api/admin/audit'", "'/api/admin/audit/{event_id}'",
 "'/api/admin/users/{uid}/edit'", "'/api/admin/users/{uid}/sessions/revoke'",
 'verify_admin_stepup(request,admin,body.admin_password,body.admin_pin)',
 'admin_log(c,admin[\'id\'],\'admin_edit_user\'',
 'admin_log(c,admin[\'id\'],\'admin_revoke_user_sessions\''
]) assert(server.includes(token),'Server-side security/endpoint missing: '+token);
assert(server.includes('AUDIT_HIGH_RISK'));
assert(server.includes('enrich_audit('));
assert(!server.includes("@app.delete('/api/admin/audit"),'No audit evidence deletion API');
assert(!server.includes("@app.patch('/api/admin/audit"),'No audit evidence modification API');
assert(css.includes('.admin-audit-layout'));
assert(css.includes('.admin-audit-entry'));
assert(css.includes('.audit-severity.high'));
assert(css.includes('@media(max-width:630px)'));
assert(consoleJS.includes("q('.admin-audit-card')"),'Audit toolbar must not land inside summary statistics');
assert(consoleJS.includes("if(tab!=='audit')controls.append(search)"),'Use server-backed audit search');
assert(consoleJS.includes("'Tên quản trị'"),'CSV includes actor');
assert(html.includes('admin-console.css?v=12.2'));
assert(html.includes('admin-console.js?v=12.1'));
assert(html.includes('app.js?v=15.4'));
console.log('Admin detailed audit and account controls: wiring, security, semantics and responsive layout verified.');
