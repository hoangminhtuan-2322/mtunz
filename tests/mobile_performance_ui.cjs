'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('static/app.js');
const premium=read('static/premium.js');
const member=read('static/member-experience.js');
const mobile=read('static/mobile-polish.js');
const css=read('static/mobile-performance.css');
const html=read('static/index.html');

for(const [path,source] of [['static/app.js',app],['static/premium.js',premium],
 ['static/member-experience.js',member],['static/mobile-polish.js',mobile]]){
 new vm.Script(source,{filename:path});
}
assert.match(css,/@media\s*\(max-width:800px\)/);
assert(css.includes('.bubble-wrap')&&css.includes('animation:none!important'),
 'No animation for a full scrolling chat history on mobile');
assert(css.includes('backdrop-filter:none!important'),
 'Stop expensive full-viewport blur on phone');
assert(css.includes('scroll-behavior:auto!important'),
 'Mobile chat scroll-to-bottom should not animate through long history');
assert(html.includes('/static/mobile-performance.css?v=1.0'));
assert(html.indexOf('mobile-performance.css')>html.indexOf('world-experience.css'),
 'Mobile paint overrides load last, leaving desktop untouched');
assert(html.includes('/static/app.js?v=20.5'));
assert(html.includes('/static/premium.js?v=2.9'));
assert(html.includes('/static/member-experience.js?v=1.2'));
assert(html.includes('/static/mobile-polish.js?v=1.1'));
assert(premium.includes("added.matches('form[data-form],.auth-panel,.field"),
 'Do not run global form enhancement for ordinary incoming chat bubbles');
assert(app.includes('let threadJumpFrameQueued=false;')&&
       app.includes('requestAnimationFrame(paint)'),
 'Mobile scroll indicators must be measured at most once per display frame');
assert(mobile.includes('if(nextHeight!==appliedHeight)'),
 'Do not rewrite layout variable for unchanged viewport height');
assert(mobile.includes("if(isMobile()&&editable(document.activeElement))schedule()"),
 'Ignore mobile Safari viewport scroll when keyboard is not editing');

const locationStart=member.indexOf('function relevantChatMutation(');
const locationEnd=member.indexOf('\nconst observer=',locationStart);
assert(locationStart>=0&&locationEnd>locationStart);
const ctx={};
vm.runInNewContext(member.slice(locationStart,locationEnd),ctx);
const fake=(kind,text='')=>({
 nodeType:1,textContent:text,
 matches(selector){return selector.split(',').includes(kind)},
 querySelector(){return null}
});
const record=node=>[{type:'childList',addedNodes:[node]}];
assert.equal(ctx.relevantChatMutation(record(fake('.bubble-wrap','Tin bình thường'))),false,
 'Incoming ordinary bubbles must not rescan the entire message thread');
assert.equal(ctx.relevantChatMutation(record(fake('.bubble-wrap','📍 Vị trí gần đúng'))),true,
 'Location card enhancement must keep working');
assert.equal(ctx.relevantChatMutation(record(fake('.shell:not(.admin-shell)'))),true,
 'Navigating to another conversation must enhance its composer');
assert.equal(ctx.relevantChatMutation(record(fake('.conversation .compose-row'))),true,
 'Chat composer must be enhanced after mounting');
assert.equal(ctx.relevantChatMutation(record(fake('.side-item'))),false,
 'Changing unread counts must not trigger full chat enhancement');

const headStart=app.indexOf('function chatHeaderKey(');
const headEnd=app.indexOf('function renderBubbles()',headStart);
assert(headStart>=0&&headEnd>headStart);
const data={other_id:7,username:'member',display_name:'Member',online:false,last_seen:123,
 avatar_url:null,vanish_seconds:0,muted:false,pinned:false,archived:false,restricted:false};
const header={dataset:{},innerHTML:''};
let renders=0;
const hd={
 state:{friends:[data],selected:7,tab:'messages'},
 $:selector=>selector==='#chat-header'?header:null,
 convoHeader:()=>{renders++;return '<header>ok</header>'},
 JSON
};
vm.runInNewContext(app.slice(headStart,headEnd),hd);
hd.updateChatHeader();hd.updateChatHeader();hd.updateChatHeader();
assert.equal(renders,1,'Repeated WebSocket refreshes must preserve toolbar DOM');
data.online=true;hd.updateChatHeader();
assert.equal(renders,2,'Actual status change still updates header');
data.last_seen=124;hd.updateChatHeader();
assert.equal(renders,3,'Actual last-seen change still updates header');
console.log('V15 mobile performance: scoped observers, viewport, chat header and mobile-only paints OK');
