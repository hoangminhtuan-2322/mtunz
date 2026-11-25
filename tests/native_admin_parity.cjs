'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'mobile/src/AdminDashboard.js'),'utf8');
const server=fs.readFileSync(path.join(root,'app.py'),'utf8');
const world=fs.readFileSync(path.join(root,'world_chat.py'),'utf8');
for(const required of [
  "'/api/admin/support/intake'","'/api/admin/tickets/'+ticket.id,'DELETE'",
  "'/api/admin/users/'+item.id+'/details'","'/api/admin/users/'+user.id+'/sanction'",
  "'/api/admin/world'","'/api/admin/world/config'",
  "Alert.alert('Xác nhận bảo mật'","if(!pin.trim())",
  "ticket.status==='closed'||ticket.status==='spam'",
  "if(ok){setTicket(null);setThread([]);}",
])assert(admin.includes(required),'Missing PIN-gated admin UI: '+required);
for(const api of ["@app.patch('/api/admin/support/intake')","@app.delete('/api/admin/tickets/{tid}')",
"@app.post('/api/admin/users/{uid}/sanction')"])assert(server.includes(api),'Missing backend endpoint: '+api);
assert(world.includes("@app.post('/api/admin/world/config')"));
console.log('Native Admin support intake, deletion, sanctions and world controls validated');

const {maintenanceLabel,canCancelDeletion}=require('../mobile/src/adminSystemPolicy');
assert.equal(maintenanceLabel(null),'Chưa xác định');
assert.equal(maintenanceLabel({active:true,manual:true}),'Đang bảo trì thủ công');
assert.equal(maintenanceLabel({active:true,manual:false}),'Đang bảo trì theo lịch');
assert.equal(maintenanceLabel({active:false,manual:false,schedule:{}}),'Đang hoạt động · Có lịch bảo trì');
assert(canCancelDeletion({user_id:5,purge_at:200},100));
assert(!canCancelDeletion({user_id:5,purge_at:100},100));assert(!canCancelDeletion({user_id:5,purge_at:200},undefined));
for(const endpoint of ["'/api/system/maintenance'","'/api/admin/deletions'","'/api/admin/security/maintenance','POST'","'/api/admin/users/'+row.user_id+'/delete/cancel','POST'"])assert(admin.includes(endpoint),endpoint);
assert(admin.includes("tab==='system'")&&admin.includes('canCancelDeletion(row,maintenance?.server_time)'));
const security=fs.readFileSync(path.join(root,'admin_security_v5.py'),'utf8');
const features=fs.readFileSync(path.join(root,'features.py'),'utf8');
assert(security.includes("@app.post('/api/admin/security/maintenance')")&&security.includes('core.verify_admin_pin_stepup'));
assert(features.includes("@app.post('/api/admin/users/{uid}/delete/cancel')")&&features.includes('purge_at>?'));
console.log('Native Admin system parity, maintenance status and PIN-gated deletion cancellation: PASS');
