'use strict';
/* Mobile release guards: 320px–800px layouts, iOS keyboard, and full functionality. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const css=read('static/mobile-polish.css'),js=read('static/mobile-polish.js');
const html=read('static/index.html'),rail=read('static/rail-navigation.css');
const app=read('static/app.js'),member=read('static/member-experience.js');
const admin=read('static/admin-console.css'),extras=read('static/extras.js');
new vm.Script(js,{filename:'mobile-polish.js'});
for(const marker of [
 '@media(max-width:800px)','@media(max-width:520px)','@media(max-width:360px)',
 '@media(max-width:800px) and (max-height:600px)',
 'prefers-reduced-motion:reduce','safe-area-inset-bottom','100dvh',
 'min-height:0','--mt-mobile-viewport-height','mt-mobile-editing',
 '.chat-compose-toolbar','.chat-emoji-picker','.bubble-actions button',
 '.chat-shared-location','.side-scroll','.premium-dialog','.modal-actions',
 '.mt-friend-request-pop','.mt-forward-dialog','.chat-location-dialog',
 '.admin-shell .table-scroll','.admin-shell .admin-page',
 '.mt-settings-upgraded .setting-grid'
])assert(css.includes(marker),'Missing mobile safeguard: '+marker);
assert(css.includes('font-size:16px!important'),'Prevent iOS input focus zoom');
assert(css.includes('body.mt-mobile-keyboard .shell:not(.admin-shell)>.rail'),'Keyboard must hide bottom navigation');
assert(css.includes('.shell:not(.admin-shell)>.rail'),'Member navigation must remain available when keyboard closes');
assert(css.includes('.bubble-more')&&extras.includes('data-message-tools'),'Mobile message tools have a compact trigger');
assert(!css.includes('.conversation .main-head [data-act='),'Do not hide chat actions by attribute');
assert(!css.includes('.shell:not(.admin-shell)>.side{display:none'),'Do not hide the chat list unconditionally');
assert(admin.includes('.admin-mobile-toggle'),'Keep Admin drawer available');
assert(rail.includes('position:fixed'),'Mobile bottom navigation is preserved');
assert(member.includes('function mountComposer(')&&member.includes('function openPicker('));
assert(extras.includes('function groupConversation(')&&extras.includes('data-act="message-delete"'));
assert(app.includes("['messages','chat','Tin nhắn']"),'Existing five primary tabs remain');
assert(html.includes('/static/mobile-polish.css?v=1.0'));
assert(html.includes('/static/mobile-polish.js?v=1.0'));
assert(html.indexOf('mobile-polish.css')>html.indexOf('group-lobby.css'),'Mobile CSS must be last for targeted overrides');
assert(html.indexOf('mobile-polish.js')>html.indexOf('world-moderation.js'),'Keyboard handler must load after app scripts');
assert(!/localStorage|sessionStorage|document\.cookie/.test(js),'Mobile handler may not persist user data');
assert(!/geolocation|fetch\(|WebSocket/.test(js),'Mobile handler must not change chat/network security');
function simulate(mobile=true){
 const events={document:{},window:{},viewport:{},media:{}};
 const style={data:{},setProperty(k,v){this.data[k]=v},removeProperty(k){delete this.data[k]}};
 const classes=new Set();
 const body={classList:{
  add(...names){names.forEach(x=>classes.add(x))},
  remove(...names){names.forEach(x=>classes.delete(x))},
  toggle(name,on){if(on)classes.add(name);else classes.delete(name)}
 }};
 const document={body,documentElement:{style},activeElement:null,
  addEventListener(name,fn){events.document[name]=fn}};
 const vv={height:750,addEventListener(name,fn){events.viewport[name]=fn}};
 const mq={matches:mobile,addEventListener(name,fn){events.media[name]=fn}};
 const window={innerHeight:750,visualViewport:vv,matchMedia:()=>mq,
  addEventListener(name,fn){events.window[name]=fn},
  requestAnimationFrame(fn){fn();return 0},setTimeout(fn){fn();return 2},clearTimeout(){}};
 vm.runInNewContext(js,{window,document,console},{timeout:1500});
 return {events,style,classes,document,vv,mq,window};
}
const sim=simulate();
assert(!sim.classes.has('mt-mobile-editing')&&!sim.classes.has('mt-mobile-keyboard'));
assert.equal(sim.style.data['--mt-mobile-viewport-height'],undefined);
sim.document.activeElement={closest(){return {tagName:'TEXTAREA'}}};
sim.events.document.focusin();
assert(sim.classes.has('mt-mobile-editing'),'Typing must hide the bottom rail');
sim.vv.height=435;sim.events.viewport.resize();
assert(sim.classes.has('mt-mobile-keyboard'),'Shrinking visible viewport marks keyboard open');
assert.equal(sim.style.data['--mt-mobile-viewport-height'],'435px');
sim.vv.height=750;sim.events.viewport.resize();
assert(!sim.classes.has('mt-mobile-keyboard')&&sim.classes.has('mt-mobile-editing'),'Restore navigation when the keyboard closes and focus remains');
sim.document.activeElement=null;sim.vv.height=750;sim.events.document.focusout();
assert(!sim.classes.has('mt-mobile-keyboard')&&!sim.classes.has('mt-mobile-editing'));
assert.equal(sim.style.data['--mt-mobile-viewport-height'],undefined,'Restore full height on blur');
const desktop=simulate(false);
assert(!desktop.classes.has('mt-mobile-editing'),'Desktop must be unchanged');
console.log('Mobile polish OK: responsive touch layout, safe area, dialogs, admin, iOS typing and viewport restore.');