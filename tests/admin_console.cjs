'use strict';
/* Admin Console regression: availability, content security and privileged UI wiring. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('static/index.html','utf8');
const admin=fs.readFileSync('static/admin-console.js','utf8');
const css=fs.readFileSync('static/admin-console.css','utf8');
const app=fs.readFileSync('static/app.js','utf8');
const server=fs.readFileSync('app.py','utf8');

new vm.Script(admin,{filename:'admin-console.js'});
new vm.Script(app,{filename:'app.js'});
assert.match(html,/admin-console\.css\?v=12\.0/);
assert.match(html,/admin-console\.js\?v=12\.0/);
assert(html.indexOf('admin-console.js')>html.indexOf('app.js'),'Admin script loads after app state');
assert(css.includes('.admin-shell .admin-workspace-top'));
assert(css.includes('@media(max-width:950px)'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(admin.includes('function refreshList('),'List filtering and paging are implemented');
assert(admin.includes('function showCommands('),'Command palette available');
assert(admin.includes('function exportAudit('),'Audit CSV export available');
assert(admin.includes('data-admin-ui'),'Actions wired to delegated listeners');
assert(admin.includes('aria-label'),'Accessible names supplied');
assert(admin.includes('CSV'),'Audit export identified');
assert(admin.includes('replace(/\\r?\\n/g'),'CSV values prevent line injection');
assert(admin.includes("s=\"'\"+s"),'CSV formulas neutralized');
assert(app.includes('function adminProofFields('),'Privileged confirmation is rendered');
assert(app.includes('function adminProofValue('),'Privileged confirmation reads password/PIN');
for(const url of ['/api/admin/capacity','/api/admin/broadcast','/api/admin/tickets/']){
 assert(app.includes(url),'Existing admin flow preserved '+url);
}
assert(server.includes('def verify_admin_stepup('),'Server performs independent proof checks');
assert(server.includes("'admin_stepup_denied'"),'Failed privileged reauth is audited');
assert(server.includes('verify_secret(admin[\'password_hash\'], password)'));
assert(server.includes('verify_secret(admin[\'pin_hash\'], pin)'));
assert(!admin.includes('localStorage.setItem('),'Never cache sensitive admin data');
console.log('Admin workspace OK: assets, navigation, filters, a11y, safe CSV and server reauthentication.');
