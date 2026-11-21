'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('static/app.js','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const style=fs.readFileSync('static/member-experience.css','utf8');

assert(app.includes('data-form="support-reply" class="support-chat-composer"'));
assert(app.includes('data-form="admin-ticket-reply" class="support-chat-composer"'));
assert(app.includes('data-ticket-id='));
const guestSend=app.slice(app.indexOf("case 'support-reply':{"),app.indexOf("case 'support-reset':{"));
const adminSend=app.slice(app.indexOf("case 'admin-ticket-reply':{"),app.indexOf("case 'admin-broadcast':{"));
assert(guestSend.includes('finishSupportReply(form,text)'), 'Guest keeps composer after sending');
assert(adminSend.includes('finishSupportReply(form,text)'), 'Admin keeps composer after sending');
assert(!guestSend.includes('loadTicketMessages()'), 'Guest send must not reload thread');
assert(!adminSend.includes('loadAdmin()'), 'Admin send must not rebuild dashboard');
assert(html.includes('/static/app.js?v=20.2'));
assert(html.includes('/static/member-experience.css?v=1.2'));
assert(style.includes('.support-chat-composer .support-chat-entry'));

const first=app.indexOf('function renderTicketBubbles(');
const last=app.indexOf('\nfunction renderAuth()',first);
assert(first>=0&&last>first);
const boxHtml=[];
const fakeBox={
 dataset:{ticketId:'3'},scrollHeight:100,scrollTop:0,clientHeight:100,
 innerHTML:'',replaceChildren(){this.innerHTML=''},
 querySelector(){return null},
 insertAdjacentHTML(_position,html){boxHtml.push(html);this.innerHTML+=html}
};
const ctx={
 state:{user:{id:1,is_admin:true},adminTab:'tickets',adminTicket:3,
 adminTicketMessages:[],supportTicket:null,ticketMessages:[]},
 $:selector=>selector==='#admin-ticket-messages'?fakeBox:null,
 esc:x=>String(x).replace(/</g,'&lt;'),
 date:()=> '12:30',Number
};
vm.createContext(ctx);
vm.runInContext(app.slice(first,last),ctx,{timeout:1000});
const msg={id:22,ticket_id:3,from_admin:0,body:'Xin chào <script>',created_at:5};
assert.equal(ctx.appendSupportMessage(true,3,msg),true);
assert.equal(ctx.state.adminTicketMessages.length,1);
assert.equal(ctx.appendSupportMessage(true,3,msg),true);
assert.equal(ctx.state.adminTicketMessages.length,1,'Do not duplicate socket and response messages');
assert(boxHtml[0].includes('&lt;script>'),'Support content must be escaped');
const second={id:23,ticket_id:3,from_admin:1,body:'Đã nhận được',created_at:6};
ctx.appendSupportMessage(true,3,second,true);
assert.equal(ctx.state.adminTicketMessages.length,2);
const form={querySelector:()=>field};
const field={value:'Vừa gửi',style:{height:'60px'},isConnected:true,focus:()=>{field.focused=true}};
ctx.finishSupportReply(form,'Vừa gửi');
assert.equal(field.value,'');assert.equal(field.style.height,'');assert.equal(field.focused,true);
field.value='Nội dung mới đang gõ';
ctx.finishSupportReply(form,'Vừa gửi');
assert.equal(field.value,'Nội dung mới đang gõ','No message should erase newer drafts');
ctx.state.user=null;ctx.state.supportTicket=4;
assert.equal(ctx.appendSupportMessage(false,4,{id:25,ticket_id:4,from_admin:1,body:'Admin đây',created_at:7}),true);
assert.equal(ctx.state.ticketMessages.length,1);
assert.equal(ctx.appendSupportMessage(true,4,{id:26,ticket_id:4,body:'Sai quyền'}),false);
console.log('Support continuous UI: no rerender, escaped live messages, focus, drafts, dedupe OK');
