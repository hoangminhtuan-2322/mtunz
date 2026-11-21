'use strict';
/* Non-destructive contracts for World Experience and mobile Profile restoration. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const load=file=>fs.readFileSync(file,'utf8');
const html=load('static/index.html');
const base=load('static/world-moderation.js');
const experience=load('static/world-experience.js');
const css=load('static/world-experience.css');
const railCSS=load('static/rail-navigation.css');
const app=load('static/app.js');
new vm.Script(experience,{filename:'world-experience.js'});
assert(html.includes('/static/world-experience.js?v=9.0'),'V9 World script loaded');
assert(html.includes('/static/world-experience.css?v=9.0'),'V9 World styles loaded');
assert(html.indexOf('world-experience.js')>html.indexOf('world-moderation.js'),'Enhancement after original handlers');
assert(html.indexOf('world-experience.css')>html.indexOf('mobile-polish.css'),'World styles override legacy mobile');
assert(base.includes('function worldPage()')&&base.includes('function worldSend('),'Original World functionality retained');
assert(base.includes("post('/api/reports'"),'Original report API retained');
assert(base.includes("data-world-action=\"older\""),'Original history loader retained');
assert(base.includes("id=\"world-feed\""),'Original realtime feed retained');
assert(css.includes('@media(max-width:800px)'),'Mobile layout provided');
assert(css.includes('prefers-reduced-motion:reduce'),'Reduced motion supported');
assert(railCSS.includes('rail-mobile-profile'),'Mobile Profile CSS is present');
assert(railCSS.includes('display:flex;flex:1 1 0'),'Mobile Profile is visible');
assert(app.includes('data-tab="profile"'),'Profile navigation route exists');
const a=app.indexOf('function appRail(){'),b=app.indexOf('\nfunction sideBar()',a);
assert(a>0&&b>a);
const state={tab:'messages',user:{id:7,username:'person',display_name:'Người dùng'},railMoreOpen:false};
const navCtx={state,brandGlyph:()=>'<img>',avatar:()=>'<avatar>',icon:n=>'<svg>'+n+'</svg>',esc:v=>String(v)};
vm.createContext(navCtx);vm.runInContext(app.slice(a,b),navCtx);
const rail=navCtx.appRail();
assert(rail.includes('class="rail-btn rail-mobile-profile '));
assert(rail.includes('aria-label="Hồ sơ cá nhân"'));
assert(rail.includes('data-tab="profile"'));
assert(rail.includes('rail-profile-button'),'Desktop profile preserved');
assert(rail.includes('data-tab="messages"')&&rail.includes('data-tab="settings"'));
assert.equal((rail.match(/data-tab="profile"/g)||[]).length,2,'Desktop and mobile Profile routes');
state.tab='profile';
assert(navCtx.appRail().includes('rail-mobile-profile active'),'Mobile selected state follows the real page');

const calls=[];
const worldState={
 user:{id:7,display_name:'Tôi',world_anonymous:false},
 worldData:{status:{open:true,enabled:true,warnings:0,strikes:0,schedule_enabled:false,slow_seconds:0},
            messages:[{id:1,sender_id:4,display_name:'Bạn A',body:'Xin chào',created_at:12345}]},
 v6Rooms:[{id:1,title:'Chung',active:true}],v6WorldRoom:1
};
const ctx={
 state:worldState,worldPage:()=>'<div>Legacy World</div>',
 worldClock:()=>0,worldEscape:s=>String(s).replace(/</g,'&lt;'),
 worldTimeLabel:()=> 'Mở liên tục',worldCountdown:()=> '00:00:00:00',
 worldDate:()=> '01/01',worldBubble:()=>'<article class="world-message">Tin nhắn</article>',
 v6WorldRoomsBar:()=>'<nav data-v6-room="1">Chung</nav>',
 communityPlusEvents:()=>'<article data-cv7="rsvp">Sự kiện</article>',
 v6PollCards:()=>'<article data-v6-vote="1">Bình chọn</article>',
 communityPlusAppealsButton:()=>'<button data-cv7="my-appeals">Kháng nghị</button>',
 icon:n=>'<svg>'+n+'</svg>',worldPendingAttachment:null,worldOlderExhausted:false,
 document:{addEventListener:(name,handler)=>calls.push({name,handler}),getElementById:()=>null}
};
vm.createContext(ctx);vm.runInContext(experience,ctx);
const active=ctx.worldPage();
for(const fragment of ['world-discovery','world-chat-pane','data-v6-room="1"',
 'data-v6-vote="1"','data-cv7="rsvp"','data-cv7="my-appeals"',
 'id="world-feed"','data-world-action="refresh"','data-world-form="send"',
 'id="world-upload-file"','data-social-world-anon','data-world-experience="emoji"']){
 assert(active.includes(fragment),'Existing World action and new layout retained: '+fragment);
}
assert(active.includes('Xin chào')===false,'Bubble rendering is delegated to the original function');
assert(active.includes('Tin nhắn'),'Original bubble is embedded');
assert(active.includes('world-rule-footer'),'Spam and moderation notices preserved');
assert.equal(calls.length,1,'Only one delegated new click handler');
worldState.worldData.status.open=false;
const closed=ctx.worldPage();
assert(!closed.includes('data-world-form="send"'),'Closed room is read-only');
assert(closed.includes('world-readonly-note'),'Read-only explanation visible');
worldState.worldData.status.open=true;
worldState.worldData.status.muted_until=60;
const muted=ctx.worldPage();
assert(muted.includes('world-banner danger'),'Muted state explained');
assert(muted.includes('disabled'),'Muted composer disabled');
worldState.worldData.status.muted_until=0;
worldState.worldData.status.announcement='<script>alert(1)</script>';
assert(ctx.worldPage().includes('&lt;script>'),'Announcements are escaped');
console.log('World V9 and mobile Profile: markup, legacy APIs, closed/muted states and responsiveness OK');
