'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('static/extras.js');
const css=read('static/group-lobby.css');
const html=read('static/index.html');
const app=read('static/app.js');
new vm.Script(js,{filename:'extras.js'});
assert(html.includes('group-lobby.css?v=1.0'),'Group lobby CSS must be loaded');
assert(html.includes('extras.js?v=16.0'),'Group lobby markup must bypass stale browser cache');
assert(html.indexOf('group-lobby.css')>html.indexOf('social-upgrade.css'),'Dedicated group styles override general styles');
const start=js.indexOf('function groupLobby(){');
const end=js.indexOf('\nfunction groupHeader(){',start);
assert(start>=0&&end>start,'Group lobby renderer exists');
const ctx={
 state:{friends:[],groups:[]},
 icon:()=>'<svg aria-hidden="true"></svg>',
 inputField:()=>'<input name="title" minlength="2" maxlength="70">',
};
const lobby=vm.runInNewContext(js.slice(start,end)+'\n;groupLobby()',ctx);
assert(lobby.includes('class="section-wrap group-lobby"'));
assert(lobby.includes('class="group-lobby-panels"'));
assert(lobby.includes('class="group-lobby-teaser" role="note"'));
assert(lobby.includes('class="group-lobby-teaser-badge">Coming soon</span>'));
assert(lobby.includes('class="card group-create-card"'));
assert(lobby.indexOf('group-lobby-teaser')<lobby.indexOf('group-create-card'));
assert(!lobby.includes('class="card world-teaser"'),'Old teaser must not remain');
assert(!lobby.includes('Xem trước'),'No excessive CTA in simple Coming soon banner');
assert(!lobby.includes('Chúng ta sẽ thiết kế không gian cộng đồng sau'),'Remove lengthy teaser subtitle');
assert(lobby.includes('data-form="create-group"')&&lobby.includes('name="title"'));
assert(lobby.includes('Chọn bạn bè tham gia')&&lobby.includes('Tạo nhóm'));
assert(lobby.includes('disabled'),'Create group remains blocked until friend is selected');
assert(css.includes('.group-lobby-panels')&&css.includes('gap:24px'),'Desktop blocks must be visibly separated');
assert(css.includes('@media(max-width:600px)')&&css.includes('gap:18px'),'Mobile gap must be deliberate');
assert(css.includes('.group-create-card')&&css.includes('.group-lobby-teaser'));
assert(app.includes("['world','group','Chat thế giới']"),'World page remains accessible from app navigation');
console.log('Group lobby OK: concise Coming soon, separated cards, working group form and mobile spacing.');
