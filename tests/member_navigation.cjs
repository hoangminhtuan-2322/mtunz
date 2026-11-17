'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/rail-navigation.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const a=js.indexOf('function appRail(){'),b=js.indexOf('\nfunction sideBar()',a);
assert(a>=0&&b>a,'Navigation function can be located');
const state={tab:'messages',user:{username:'test_member'},railMoreOpen:false};
const ctx={state,brandGlyph:()=>'<img>',avatar:()=>'<avatar>',icon:n=>'<svg data-icon="'+n+'"></svg>',esc:v=>String(v)};
vm.createContext(ctx);vm.runInContext(js.slice(a,b),ctx);
const initial=ctx.appRail();
const primaryMarkup=initial.split('<nav class="rail-nav" aria-label="Điều hướng chính">')[1].split('<div class="rail-secondary">')[0];
assert.equal((primaryMarkup.match(/class="rail-btn /g)||[]).length,5,'Five primary destinations');
for(const tab of ['messages','groups','friends','notices','settings'])
  assert(initial.includes('data-tab="'+tab+'"'),'Primary menu: '+tab);
assert(initial.includes('aria-current="page" data-act="app-tab" data-tab="messages"'));
assert(initial.includes('data-act="rail-more"'));
assert(initial.includes('aria-expanded="false"'));
assert(initial.includes('id="rail-more-items" class="rail-extra " hidden'));
state.railMoreOpen=true;
assert(ctx.appRail().includes('id="rail-more-items" class="rail-extra is-open"'),'Secondary menu expands');
state.railMoreOpen=false;state.tab='support';
assert(ctx.appRail().includes('class="rail-extra is-open"'),'Secondary active page remains discoverable');
assert(js.includes('class="card rail-settings-shortcuts"'),'Settings provides fallback shortcuts');
assert(js.includes('data-tab="restricted"')&&js.includes('data-tab="support"'),'Secondary features preserved');
assert(css.includes('@media(max-width:800px)')&&css.includes('position:fixed'),'Bottom mobile tab bar');
assert(css.includes('aria-label')===false); // ARIA is owned by HTML not CSS

// Laptop widths must not silently turn the entire sidebar into icon-only mode.
const laptopStart=css.indexOf('@media (min-width:801px) and (max-width:1279px)');
const laptopEnd=css.indexOf('@media (min-width:801px) and (max-width:940px)',laptopStart);
assert(laptopStart>=0 && laptopEnd>laptopStart,'Laptop-specific expanded menu breakpoint exists');
const laptop=css.slice(laptopStart,laptopEnd);
assert(laptop.includes('grid-template-columns:clamp(168px,16.5vw,194px)'),
       'Laptop rail must be wide enough for navigation labels');
assert(!laptop.includes('.rail-brand,.rail-btn .rail-text'),
       'Laptop rail must never hide the logo, labels or account name');
assert(laptop.includes('justify-content:flex-start'),
       'Laptop menu items must align icons with their text');
assert(css.includes('@media (min-width:801px) and (max-width:940px)'),
       'Narrow laptops must still have a readable menu');
assert(html.includes('/static/rail-navigation.css?v=2.0'));
console.log('Member navigation: 5 primary actions, accessible secondary actions, bottom navigation, fallback shortcuts OK');
