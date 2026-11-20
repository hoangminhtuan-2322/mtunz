/* Admin V5 UI boundary smoke checks: no server secret in frontend; review is mandatory. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const get=name=>fs.readFileSync(name,'utf8');
const html=get('static/index.html'),
 ui=get('static/admin-v5.js'),reset=get('static/admin-v3.js'),
 style=get('static/admin-v5.css'),server=get('admin_security_v5.py'),guards=get('admin_hardening.py');

assert(html.includes('/static/admin-v5.js?v=1.1'),'V5 security UI included');
assert(html.includes('/static/admin-v5.css?v=1.0'),'V5 security theme included');
assert(html.includes('/static/admin-v3.js?v=2.0'),'Reset dialog revision cache busted');
assert(ui.includes('/api/admin/security/overview'),'Current, authenticated server-side risk status');
assert(ui.includes('/api/admin/security/revoke-others'),'Dedicated security session revocation');
assert(ui.includes('/api/admin/security/lockdown'),'Dedicated emergency containment');
assert(ui.includes('adminV3PinPayload(host)'),'Sensitive actions require Admin PIN');
assert(ui.includes("adminV5DoRevoke")&&ui.includes("adminV5DoLockdown"));
assert(ui.includes("adminV5SecurityHtml")&&ui.includes("adminV5OverviewHtml"));
assert(ui.includes("document.hidden"),'Background polling pauses');
assert(ui.includes("if(!adminV5Ready())"),'UI refuses unauthenticated display');
assert(style.includes('@media(max-width:540px)')&&style.includes('.v5-security-metrics'),'Responsive monitors');
assert(style.includes('.v5-reset-major'),'Confirmation dialog styled outside admin shell');
assert(reset.includes('preview.all_scopes'),'Full data scope displayed');
assert(reset.includes('revision:preview.revision'),'Prevent stale reset requests');
assert(reset.includes('v5-reset-understand'),'Explicit irreversible-action acknowledgement');
assert(reset.includes('adminV3PinPayload(host)'),'PIN cannot be skipped');
assert(server.includes("core.verify_admin_pin_stepup(request,admin,body.admin_pin)"));
assert(server.includes('revoke_other_admin_sessions')&&server.includes('current_hash'));
assert(guards.includes('admin_pin_attempts')&&guards.includes('locked_until'));
assert(guards.includes('fingerprint!=body.revision'));
assert(guards.includes("saved[k] for k in ('username','password_hash','pin_hash','pin_length')"));
assert(guards.includes("remaining['member_accounts']")&&guards.includes('if remaining'));
assert(guards.includes('c.execute(\'DELETE FROM audit\')'));
console.log('Admin V5 UI & security boundary assertions OK');
