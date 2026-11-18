'use strict';
/* Regression: Admin and signed-in Settings use native inputs with NO
   overlapping decorative icons. Check rendered markup, not just CSS strings. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/form-layout.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const authCss=fs.readFileSync('static/auth-refined.css','utf8');
function section(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a);
 assert(a>=0&&b>a,'Missing function section '+start);
 return app.slice(a,b);
}
const inputSrc=section('function inputField(', '\nfunction authTabs(){');
const settingsSrc=section('function settingsContent(){','\nfunction supportInApp(){');
const securitySrc=section('function adminSecurity(){','\nfunction adminAudit(){');
assert(inputSrc.includes('function secureSettingsField('),'Plain secure field builder exists');
assert(inputSrc.includes('function inputField('),'Original login field builder preserved');
assert(settingsSrc.includes('secureSettingsField('),'Settings now use native controls');
assert(securitySrc.includes('secureSettingsField('),'Admin security now uses native controls');
assert(!settingsSrc.includes('inputField('),'Settings must not reintroduce overlay icons');
assert(!securitySrc.includes('inputField('),'Admin must not reintroduce overlay icons');
const context={
 state:{user:{username:'member_one',created_at:0,pin_length:null},savedDevice:false,blocks:[]},
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'),
 icon:(type,size)=>'<svg data-icon="'+type+'" width="'+size+'"></svg>',
 avatar:()=>'<span class="avatar"></span>',date:()=> 'now',profileSettings:()=>'<div>profile</div>'
};
vm.createContext(context);
vm.runInContext(inputSrc+'\n'+securitySrc+'\n'+settingsSrc,context,{timeout:1500});

function inspectMarkup(markup, count) {
 assert(!markup.includes('class="auth-input-icon"'),'No overlay icons may exist inside sensitive forms');
 assert(!markup.includes('class="auth-input-wrap"'),'No absolute wrapper may surround sensitive inputs');
 const fields=[...markup.matchAll(/class="field secure-settings-field"/g)];
 const inputs=[...markup.matchAll(/class="input" id="([^"]+)" name="([^"]+)" type="([^"]+)"/g)];
 assert.equal(fields.length,count,'Expected one plain field for each input');
 assert.equal(inputs.length,count,'Every secure input has correct markup');
 for(const match of inputs){
  assert.equal(match[1],match[2],'Label id and form name refer to same field');
  assert.equal(match[3],'password','Secret fields must remain masked');
 }
}
for(const length of [null,6]) {
 context.state.user.pin_length=length;
 const markup=context.adminSecurity();
 inspectMarkup(markup,5);
 assert(markup.includes('data-form="admin-password"'),'Password form preserved');
 assert(markup.includes(length?'data-form="admin-pin-change"':'data-form="admin-pin-setup"'),'PIN form preserved');
}
context.state.user.pin_length=6;
inspectMarkup(context.settingsContent(),4);
const authInput=context.inputField('Password','password','password','Your password');
assert(authInput.includes('class="auth-input-icon"'),'Only login flow retains input icon');
assert(html.includes('form-layout.css?v=8.4'),'New geometry CSS is loaded');
assert(html.includes('app.js?v=16.2'),'New JS bypasses old browser cache');
assert(html.indexOf('form-layout.css?v=8.4')>html.indexOf('auth-refined.css?v=5.1'),'Fix takes precedence');
assert(css.includes('.secure-settings-field > .input'),'Native input sizing must exist');
assert(css.includes('padding:13px 16px !important'),'Native inputs have explicit left/right padding');
assert(css.includes('box-sizing:border-box'),'Fields have bounded widths');
assert(css.includes('.admin-security > .card'),'Admin cards remain responsive');
assert(authCss.includes('.auth-panel .auth-input-wrap .input'),'Login appearance preserved');
console.log('Admin + Settings native fields OK: no icon/placeholder overlap, PIN flows, responsive widths and login preserved.');
