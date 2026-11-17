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
const theme = fs.readFileSync('static/auth-refined.css','utf8');
assert(theme.includes('.auth-screen-content'));
assert(theme.includes('.auth-art.art-v4 .signal-feature'));
assert(theme.includes('animation:none!important'));
assert(theme.includes('prefers-reduced-motion'));
assert(theme.includes('.auth-input-wrap:focus-within'));
const html=fs.readFileSync('static/index.html','utf8');
assert(html.includes('auth-refined.css?v=5.1'));
assert(html.includes('app.js?v=7.0'));
assert(html.includes('hero-nova.css?v=7.0'));
console.log('Auth isolation OK: 1 hero mount, 3 isolated form changes, no page-wide scroll, accessible nav and motion controls.');
