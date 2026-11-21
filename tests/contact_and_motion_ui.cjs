'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('static/app.js','utf8');
const extras = fs.readFileSync('static/extras.js','utf8');
const html = fs.readFileSync('static/index.html','utf8');
const css = fs.readFileSync('static/ui-interactions.css','utf8');
const core = fs.readFileSync('app.py','utf8');
const features = fs.readFileSync('features.py','utf8');

for (const phrase of [
  "case 'logout':{",
  "ask('Xác nhận đăng xuất'",
  "'Đăng xuất',true",
  "case 'admin-user-detail':await userDetails(id)",
  "api(`/api/admin/users/${uid}/details`)",
  "adminDetailRow('Số điện thoại'",
  "adminDetailRow('Email / Gmail'",
  "adminDetailRow('Tên hiển thị'",
  "adminDetailRow('Phiên đăng nhập còn hiệu lực'",
  "ui-skeleton-line",
  "if(busy){btn.disabled=true;",
  "phone:val('phone'),email:val('email')",
  "Số điện thoại (bắt buộc)"
]) assert(app.includes(phrase), 'Missing UI: '+phrase);
assert(!app.includes("case 'logout':await logout()"), 'Logout must be confirmed');
assert(extras.includes('data-form="settings-contact"'), 'Settings need private contact editing');
assert(extras.includes("if(key==='settings-contact')"), 'Contact form must save via API');
assert(core.includes("class RegistrationRequest(BaseModel)"));
assert(core.includes("phone: str = Field(min_length=0,max_length=40)"));
assert(core.includes("admin_view_user_details"), 'Admin detail lookup must be audited');
assert(features.includes("column('registrations',col,typ)"), 'Existing database must migrate');
assert(html.includes('ui-interactions.css?v=1.0'), 'New motion stylesheet must load');
assert(html.includes('app.js?v=20.2'));
assert(html.includes('extras.js?v=18.0'));
assert(css.includes('prefers-reduced-motion:reduce'), 'Reduced motion is mandatory');
assert(css.includes('.ui-skeleton-line'), 'Admin data loading must be visible');
assert(!css.includes('backdrop-filter:'), 'Motion should not introduce costly blur effects');
console.log('Private contacts, signup, logout dialog and accessible loading UI: OK');
