'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('static/extras.js','utf8');
const css=fs.readFileSync('static/member-experience.css','utf8');
const backend=fs.readFileSync('features.py','utf8');
const start=source.indexOf('function bubblesFor(');
const end=source.indexOf('\nfunction composerExtras()',start);
assert(start>=0&&end>start);
const user={id:7,username:'u7',display_name:'Người gửi'};
const state={
 user,tab:'messages',selected:8,groupSelected:2,messages:[],
 groupMessages:[],friends:[],replyTo:null
};
const ctx={state,Date,Map,Set,Number,
 icon:name=>'<svg>'+name+'</svg>',
 esc:v=>String(v||''),short:v=>v,clock:()=> '09:30',
 uploadMarkup:()=>'',composerExtras:()=>'<div></div>',toast:()=>{},
 scheduleFriendsRefresh:()=>{},scheduleGroupsRefresh:()=>{},
 loadMessages:async()=>{},loadGroupMessages:async()=>{},
 post:async()=>({ok:true})};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const now=Math.floor(Date.now()/1000);
const mine={id:41,sender_id:7,recipient_id:8,body:'Tin của tôi',created_at:now,reactions:[]};
const peer={id:42,sender_id:8,recipient_id:7,body:'Tin của bạn',created_at:now,reactions:[]};
const revoked={id:43,sender_id:7,recipient_id:8,body:'',created_at:now,deleted_at:now,reactions:[]};
state.messages=[mine,peer,revoked];
for(const type of ['dm','group']){
 const markup=ctx.bubblesFor([mine,peer,revoked],type==='group');
 assert.equal((markup.match(/data-act="message-options"/g)||[]).length,3,
  'Each message has an obvious delete control, including recalled placeholders');
 assert(markup.includes('message-delete-menu-trigger'),'Readable delete button is included');
 assert(markup.includes('data-act="message-delete" data-id="41"'),
  'Sender still gets original recall control');
 assert(!markup.includes('data-act="message-delete" data-id="42"'),
  'Receiver cannot recall a sender message');
}
const a=source.indexOf('async function actOnMessage(');
const b=source.indexOf('\nasync function extraAction(',a);
assert(a>=0&&b>a);
vm.runInContext(source.slice(a,b),ctx);
let dialog=null,confirmation=null,hideRequest=null;
ctx.modal=options=>{dialog=options};
ctx.ask=(title,description,handler)=>{confirmation={title,description,handler}};
ctx.post=async url=>{hideRequest=url;return {ok:true}};
state.messages=[mine,peer,revoked];
(async()=>{
 await ctx.actOnMessage({dataset:{act:'message-options',id:'42',scope:'dm'}});
 assert(dialog.content.includes('data-act="message-hide"'));
 assert(!dialog.content.includes('Thu hồi với mọi người'));
 await ctx.actOnMessage({dataset:{act:'message-options',id:'41',scope:'dm'}});
 assert(dialog.content.includes('Thu hồi với mọi người'));
 await ctx.actOnMessage({dataset:{act:'message-options',id:'43',scope:'dm'}});
 assert(!dialog.content.includes('Thu hồi với mọi người'));
 await ctx.actOnMessage({dataset:{act:'message-hide',id:'42',scope:'dm'}});
 assert(confirmation.title.includes('Xóa ở phía tôi'));
 await confirmation.handler();
 assert.equal(hideRequest,'/api/messages/42/hide');
 assert.deepEqual(state.messages.map(m=>m.id),[41,43]);
 state.groupMessages=[mine,peer];
 await ctx.actOnMessage({dataset:{act:'message-hide',id:'42',scope:'group'}});
 await confirmation.handler();
 assert.equal(hideRequest,'/api/groups/2/messages/42/hide');
 assert.deepEqual(state.groupMessages.map(m=>m.id),[41]);
 assert(css.includes('.message-delete-menu-trigger')&&css.includes('.message-delete-choice'));
 assert(source.includes("'message-options','message-hide'"),'New actions are delegated');
 assert(source.includes("t==='message-hidden'"),'Hide events sync across user sessions');
 assert(backend.includes("@app.post('/api/messages/{mid}/hide')"));
 assert(backend.includes("@app.post('/api/groups/{gid}/messages/{mid}/hide')"));
 console.log('Chat message deletion UI: sender recall, personal deletion and group/DM options OK');
})().catch(error=>{console.error(error);process.exitCode=1});
