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
