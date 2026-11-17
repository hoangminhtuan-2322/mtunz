'use strict';
/* Admin password + PIN forms must never overlap leading icons or overflow cards. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/form-layout.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const authCss=fs.readFileSync('static/auth-refined.css','utf8');
const securityStart=app.indexOf('function adminSecurity(){');
const securityEnd=app.indexOf('\nfunction adminAudit(){',securityStart);
const fieldStart=app.indexOf('function inputField(');
const fieldEnd=app.indexOf('\nfunction authTabs(){',fieldStart);
assert(securityStart>=0&&securityEnd>securityStart,'Admin security builder must exist');
assert(fieldStart>=0&&fieldEnd>fieldStart,'Shared input builder must exist');

const context={
 state:{user:{pin_length:null},savedDevice:false},
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'),
 icon:(type,size)=>'<svg data-icon="'+type+'" width="'+size+'"></svg>'
};
vm.createContext(context);
vm.runInContext(app.slice(fieldStart,fieldEnd)+'\n'+app.slice(securityStart,securityEnd),context,{timeout:1000});
for(const pin_length of [null,6]){
 context.state.user.pin_length=pin_length;
 const markup=context.adminSecurity();
 assert(markup.includes('class="admin-security"'),'Forms must have scoped CSS layout guard');
 assert(markup.includes('data-form="admin-password"'),'Must keep password change form');
 assert(markup.includes(pin_length?'data-form="admin-pin-change"':'data-form="admin-pin-setup"'),'Must keep PIN form');
 const wrappers=markup.match(/class="auth-input-wrap"/g)||[];
 const icons=markup.match(/class="auth-input-icon"/g)||[];
 assert(wrappers.length>=5&&wrappers.length===icons.length,'Every text input reserves a leading icon');
 assert(markup.includes('type="password"'),'Password remains password-type');
}
assert(html.includes('/static/form-layout.css?v=8.3'),'Global form fix must load and bust cache');
assert(html.includes('/static/app.js?v=8.3'),'Security wrapper JavaScript must bust cache');
assert(html.indexOf('form-layout.css?v=8.3')>html.indexOf('auth-refined.css?v=5.1'),'Geometry fix loads after original auth styles');
assert(css.includes('.auth-input-wrap > input.input'),'Icon spacing must apply outside auth panels');
assert(css.includes('padding-inline-start:48px'),'Text reserves at least 48px for icon');
assert(css.includes('.admin-security .auth-input-wrap > input.input'),'Admin-specific icon spacing is guaranteed');
assert(css.includes('.admin-security > .card'),'Security cards are responsive');
assert(css.includes('max-width:100%!important'),'Security cards cannot exceed content width');
assert(css.includes('min-width:0'),'Grid items and inputs can shrink');
assert(css.includes('overflow-x:hidden'),'Admin page must not scroll sideways');
assert(css.includes('@media(max-width:520px)'),'Small screens have dedicated security styles');
assert(authCss.includes('.auth-panel .auth-input-wrap .input'),'Existing login field style retained');
console.log('Admin security forms OK: shared icons have padding, password/PIN cards resize without overflow, mobile rules covered.');
