const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const workflow=fs.readFileSync('static/chat-workflow.js','utf8');
const start=workflow.indexOf('function finishChatHistory('),end=workflow.indexOf('async function bringChatLatest()',start);
const ctx={};vm.createContext(ctx);vm.runInContext(workflow.slice(start,end),ctx);
const box={dataset:{}};let painted=[];
ctx.finishChatHistory(box,{first_unread_id:1,more_after:false},true,false,value=>painted.push(value));
assert.deepEqual(painted,[true]);assert.equal(box.dataset.firstUnread,'1');
ctx.finishChatHistory(box,{first_unread_id:1,more_after:false},false,false,value=>painted.push(value));
assert.deepEqual(painted,[true,false]);
for(const [path,anchor] of [['static/app.js','async function loadMessages('],['static/extras.js','async function loadGroupMessages(']]){
 const src=fs.readFileSync(path,'utf8'),i=src.indexOf(anchor),next=src.indexOf('\nfunction ',i+anchor.length);
 assert(i>=0);assert(!src.slice(i,next<0?undefined:next).includes('unread_window=1'));
}
console.log('DM/group latest landing, unread marker and no forced scroll on background refresh: PASS');
