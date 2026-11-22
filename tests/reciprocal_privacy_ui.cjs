'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const extras=fs.readFileSync('static/extras.js','utf8');
const v4=fs.readFileSync('static/messenger-v4.js','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const api=fs.readFileSync('app.py','utf8');
const features=fs.readFileSync('features.py','utf8');
const delivery=fs.readFileSync('messaging_v4.py','utf8');

assert(api.includes('viewer.show_online=1'),'server never sends presence to invisible viewers');
assert(api.includes("not u['show_receipts'] or not peer['show_receipts']"),
       'DM history requires consent from both sides');
assert(api.includes("not u['show_receipts'] or not sender or not sender['show_receipts']"),
       'read events require consent from both sides');
assert(delivery.includes("not u['show_receipts'] or not sender or not sender['show_receipts']"),
       'delivery events require consent from both sides');
assert(features.includes("await hub.user(peer['other_id'],'privacy-updated'"),
       'server notifies peers when privacy preferences change');
assert(features.includes("bool(u['show_online']) and bool(r['show_online'])"),
       'profile last-seen needs mutual consent');
assert(app.includes("if(t==='privacy-updated'"), 'UI refreshes after peer toggles settings');
assert(app.includes("if(t==='privacy-self-updated'"), 'other signed-in devices update immediately');
assert(app.includes("state.user?.show_online"),'client ignores old presence while hidden');
assert(app.includes("state.user?.show_receipts"),'client ignores read events while hidden');
assert(extras.includes("const receiptsVisible=!isGroup&&typeof canViewDmReceipts==='function'&&canViewDmReceipts()"),
       'DM bubble statuses use mutual consent');

const begin=extras.indexOf('function canViewDmReceipts()');
const end=extras.indexOf('function bubblesFor(',begin);
assert(begin>=0&&end>begin);
const flagCode=extras.slice(begin,end);
const values=[
 {own:true,peer:true,want:true},
 {own:false,peer:true,want:false},
 {own:true,peer:false,want:false},
 {own:false,peer:false,want:false},
];
for(const option of values){
 const ctx={state:{user:{show_receipts:option.own},selected:7,
                   friends:[{other_id:7,receipt_visible:option.peer}]}};
 vm.runInNewContext(flagCode,ctx);
 assert.equal(ctx.canViewDmReceipts(),option.want);
}

const paintStart=v4.indexOf('function v4PaintStatuses()');
const paintEnd=v4.indexOf('async function v4AckIncoming(',paintStart);
assert(paintStart>=0&&paintEnd>paintStart);
const paintCode=v4.slice(paintStart,paintEnd);
for(const visible of [false,true]){
 const badge={textContent:'',title:''};
 const context={
   state:{user:{id:1},messages:[{id:21,sender_id:1,read_at:100,delivered_at:99}]},
   document:{querySelector:()=>badge},
   canViewDmReceipts:()=>visible
 };
 vm.runInNewContext(paintCode,context);
 context.v4PaintStatuses();
 assert.equal(badge.textContent,visible?'✓✓ Đã xem':'✓ Đã gửi');
}
assert(html.includes('/static/app.js?v=20.3'));
assert(html.includes('/static/extras.js?v=18.1'));
assert(html.includes('/static/messenger-v4.js?v=1.1'));
console.log('Reciprocal presence and receipts UI contract verified');
