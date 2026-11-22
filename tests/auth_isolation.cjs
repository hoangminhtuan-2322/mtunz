'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('static/app.js', 'utf8');
const start = code.indexOf('function renderAuth(){');
const end = code.indexOf('\nasync function loadTickets()', start);
assert(start >= 0 && end > start, 'renderAuth source should be extractable');

const navButtons = ['login', 'register', 'support'].map(name => ({
  dataset: {act:'mode-'+name},
  classes:new Set(),
  attrs:{},
  classList:{toggle(name, active){this.owner.classes[active?'add':'delete'](name);}},
  setAttribute(key, value){this.attrs[key]=value}
}));
for(const button of navButtons)button.classList.owner=button;
const nav = {querySelectorAll(selector){assert.equal(selector,'button[data-act^="mode-"]');return navButtons}};
const screen = {
  innerHTML:'',
  getBoundingClientRect(){return {top:90}}
};
const main = {
  scrollTop:0,
  getBoundingClientRect(){return {top:80}},
  scrollTo(){throw new Error('Must not scroll for ordinary tab switches')}
};
const shell={
  querySelector(selector){
    if(selector==='.auth-nav')return nav;
    if(selector==='.auth-screen')return screen;
    if(selector==='.auth-main')return main;
    throw Error('Unknown selector: '+selector)
  }
};
let initialShellWrites=0;
let artRenderCount=0;
let shellExists=false;
const host={
  querySelector(selector){
    assert.equal(selector,':scope > .auth');
    return shellExists?shell:null;
  },
  get innerHTML(){return this.markup},
  set innerHTML(value){
    initialShellWrites++;
    shellExists=true;
    this.markup=value;
  }
};
const state={mode:'login'};
const context={
  state,
  root:()=>host,
  authArt:()=>{artRenderCount++;return '<aside class="auth-art">STATIC BRAND</aside>'},
  authTabs:()=>'<nav class="auth-nav"></nav>',
  authLogin:()=>'<form id="login-form"></form>',
  authRegister:()=>'<form id="registration-form"></form>',
  authSupport:()=>'<form id="support-form"></form>',
  brandGlyph:()=>'<svg></svg>'
};
vm.createContext(context);
vm.runInContext(code.slice(start,end),context,{timeout:1000});
context.renderAuth();
assert.equal(initialShellWrites,1,'Initial mount once');
assert.equal(artRenderCount,1,'Hero rendered once');
assert.match(host.markup,/STATIC BRAND/);
assert(!host.markup.includes('auth-top-glow'), 'Remove top-only glow in favor of full perimeter');
const tabSource=code.slice(code.indexOf('function authTabs(){'),code.indexOf('function authLogin(){'));
assert(!tabSource.includes('auth-nav-perimeter'), 'Tabs have no animated perimeter SVG');
assert(!tabSource.includes('auth-nav-runner'), 'No moving tab runner');
assert.match(host.markup,/class="auth-neon-perimeter" aria-hidden="true"/,'Shared auth panel includes decorative LED perimeter');
assert.equal((host.markup.match(/class="auth-neon-runner"/g)||[]).length,1,'Only one LED trace mounts');
assert.match(host.markup,/pathLength="100"/,'LED trace follows scalable frame perimeter');

for(const [name,form] of [['register','registration-form'],['support','support-form'],['login','login-form']]){
  state.mode=name;
  context.renderAuth();
  assert.equal(initialShellWrites,1,'Switching '+name+' must not replace application root');
  assert.equal(artRenderCount,1,'Switching '+name+' must not remount opposite hero');
  assert(screen.innerHTML.includes(form),'Only requested form content should change');
  for(const btn of navButtons) {
    const selected=btn.dataset.act==='mode-'+name;
    assert.equal(btn.classes.has('active'),selected,'Selection matches mode');
    assert.equal(btn.attrs['aria-pressed'],String(selected),'Accessible tab state matches mode');
  }
}
assert(!code.slice(start,end).includes('scrollIntoView'),'Auth transitions must not scroll full page');
const neon = fs.readFileSync('static/auth-neon.css','utf8');
assert(neon.includes('.auth-panel > .auth-neon-perimeter'), 'Neon is scoped to auth card');
assert(neon.includes('stroke-dasharray:2.4 97.6'), 'Short dim highlight instead of long bright bar');
assert(neon.includes('stroke-dashoffset:-100'), 'LED travels a full continuous lap');
assert(!neon.includes('.auth-nav-perimeter'), 'Nav border never animates');
assert(neon.includes('--auth-neon-speed:17s'), 'Card glow makes a slow lap');
assert(neon.includes('html.mtunz-motion-paused .auth-neon-perimeter .auth-neon-runner'), 'Hidden tab pauses card glow');
assert(neon.includes('html.mtunz-save-data .auth-neon-perimeter .auth-neon-runner'), 'Data saver disables card glow');
assert(neon.includes('linear infinite'), 'LED loops continuously');
assert(neon.includes('prefers-reduced-motion:reduce'), 'Reduced motion is respected');
assert(neon.includes('mtunz-motion-paused')&&neon.includes('mtunz-save-data'), 'Energy-saving mode stops LED movement');
const glow = fs.readFileSync('static/auth-glow.css','utf8');
assert(!glow.includes('auth-soft-sweep')&&!glow.includes('auth-ambient-drift'),'No competing top-only light effects');
assert(glow.includes('.auth-panel::before{display:none}'),'Static top highlight must be hidden');
assert(glow.includes('.auth-step span.active'),'Step indicator is kept but no longer uses bright bars');
assert(neon.includes('mtunz-save-data')&&neon.includes('mtunz-motion-paused'),'Single card glow honors performance settings');
const theme = fs.readFileSync('static/auth-refined.css','utf8');
assert(theme.includes('.auth-screen-content'));
assert(theme.includes('.auth-art.art-v4 .signal-feature'));
assert(theme.includes('animation:none!important'));
assert(theme.includes('prefers-reduced-motion'));
assert(theme.includes('.auth-input-wrap:focus-within'));
const html=fs.readFileSync('static/index.html','utf8');
assert(html.includes('auth-refined.css?v=5.1'));
assert(html.includes('auth-neon.css?v=16.0'));
assert(html.includes('auth-glow.css?v=16.0'));
assert(html.includes('app.js?v=20.4'));
assert(html.includes('orbit-brand.css?v=8.0'));
assert(html.includes('hero-nova.css?v=7.0'));
assert(!code.includes('Thiết bị này đã được ghi nhớ. Nhập PIN'), 'Remove redundant remembered-device PIN paragraph');
console.log('Auth isolation OK: 1 hero mount, 3 isolated form changes, no page-wide scroll, accessible nav and motion controls.');
