'use strict';
/* No user-facing IP/GeoIP in session management; Admin has audited on-demand access. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const extras=fs.readFileSync('static/extras.js','utf8');
const core=fs.readFileSync('static/app.js','utf8');
const backend=fs.readFileSync('app.py','utf8');
const features=fs.readFileSync('features.py','utf8');
const css=fs.readFileSync('static/device-sessions.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
new vm.Script(extras,{filename:'static/extras.js'});
new vm.Script(core,{filename:'static/app.js'});
assert(!features.includes("columns='token_hash,expires_at,created_at,last_seen,device_label,device_name,device_type,browser,os_name,location_hint"));
assert(features.includes("columns='token_hash,expires_at,created_at,last_seen,device_label,device_name,device_type,browser,os_name'"));
assert(!features.includes("entry['location_hint']=entry['location_hint']"));
assert(!features.includes("entry['network_hint']=entry['network_hint']"));
assert(extras.includes('function deviceTitle(entry)'));
assert(extras.includes('function deviceTypeName(entry)'));
assert(extras.includes('async function showSessionsDialog()'));
assert(extras.includes('data-act="device-revoke"')&&extras.includes('data-act="device-rename"'));
assert(core.includes("case 'admin-device-security':await showAdminSessionSecurity(id);break;"));
assert(core.includes('async function showAdminSessionSecurity(uid)'));
assert(core.includes('data-act="admin-device-security"'));
assert(backend.includes("@app.get('/api/admin/users/{uid}/session-security')"));
assert(backend.includes("admin=require_admin(request)"));
assert(backend.includes("admin_log(c,admin['id'],'admin_view_session_security'"));
assert(!backend.includes('SELECT token_hash,network_hint,location_hint FROM sessions WHERE user_id=?'));
assert(css.includes('overflow-y:auto')&&css.includes('overflow:hidden'));
assert(css.includes('max-height:none')&&css.includes('.dialog-content'));
assert(css.includes('@media(max-width:540px)'));
assert(html.includes('device-sessions.css?v=11.0'));
assert(html.includes('extras.js?v=15.5')&&html.includes('app.js?v=17.2'));
const begin=extras.indexOf('function deviceTitle(entry){');
const end=extras.indexOf('function groupManageDialog(){',begin);
assert(begin>0&&end>begin);
const chunk=extras.slice(begin,end);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fixture={id:'0123456789abcdef01234567',label:'Máy tính Windows',device_name:'Máy tính Windows',
 device_type:'desktop',os_name:'Windows',browser:'Opera',network_hint:'42.117.29.*',
 location_hint:'Ho Chi Minh City',created_at:1763480000,last_seen:1763480000,
 expires_at:1763560000,current:true};
const testContext={esc,deviceDate:()=> '18/11/2026',icon:()=>'<svg></svg>',
 api:async()=>({sessions:[],remembered_devices:[]}),modal:()=>{},state:{}};
const funcs=vm.runInNewContext(chunk+'\n({deviceTitle,deviceTypeName,deviceSessionCard,showSessionsDialog});',testContext);
assert.equal(funcs.deviceTitle(fixture),'Máy tính Windows · Opera');
assert.equal(funcs.deviceTypeName(fixture),'Máy tính');
let markup=funcs.deviceSessionCard(fixture,'session');
assert(markup.includes('Máy tính Windows · Opera'));
assert(markup.includes('Thiết bị này'));
assert(markup.includes('Hệ điều hành')&&markup.includes('Hoạt động gần nhất'));
assert(!markup.includes('42.117.29.*')&&!markup.includes('Ho Chi Minh City'));
assert(!markup.includes('Vị trí gần đúng')&&!markup.includes('Mạng (IP'));
assert.equal((markup.match(/<dt>/g)||[]).length,6,'Six organized device/session fields');
assert(markup.includes('data-label="Máy tính Windows"'),'Manual rename uses original label');
assert.equal(funcs.deviceTitle({...fixture,label:'Laptop cá nhân'}),'Laptop cá nhân');
assert.equal(funcs.deviceTitle({...fixture,device_name:'Máy tính Windows',browser:'Không xác định'}),'Máy tính Windows');
assert(!chunk.includes('entry.location_hint')&&!chunk.includes('entry.network_hint'),
 'Member UI must not have any reference to security metadata');
console.log('Session UX/security OK: accurate labels, six facts, no member IP/GeoIP, Admin-only audited details, single scroll.');
