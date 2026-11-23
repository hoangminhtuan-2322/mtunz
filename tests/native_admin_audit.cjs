'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'mobile/src/AdminDashboard.js'),'utf8');
const backend=fs.readFileSync(path.join(root,'app.py'),'utf8');
assert(backend.includes("@app.get('/api/admin/audit')")&&backend.includes("@app.get('/api/admin/audit/{event_id}')"),
  'The existing FastAPI audit endpoints must support native history/details');
assert(admin.includes("'/api/admin/audit?limit=30&offset='"),
  'Admin audit must use paginated authenticated API');
assert(admin.includes("'/api/admin/audit/'+item.id"),
  'Native admin must support real audit event details');
assert(admin.includes("['audit','Nhật ký','receipt-outline']"),
  'Audit must be accessible through native Admin tabs');
assert(admin.includes('auditOffset+30>=auditTotal'),
  'Audit paging must have a safe end condition');
assert(admin.includes('setAuditQuery(v.slice(0,90))'),
  'Audit search must enforce backend input limit');
assert(admin.includes('selectable>{auditDetail.detail'),
  'Audit details should be readable/copyable without browser');
console.log('Native Admin audit list/search/pagination/detail parity: PASS');
