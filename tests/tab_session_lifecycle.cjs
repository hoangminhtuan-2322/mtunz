'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('static/app.js','utf8');

const get=(start,end)=>{
 const a=code.indexOf(start),b=code.indexOf(end,a);
 assert(a>=0&&b>a,'Cannot locate source: '+start);
 return code.slice(a,b);
};
const helpers=get("const ACTIVE_TAB_KEY=","\nasync function api(");
const boot=get("async function setup(){","\nfunction connectSocket(){");
const enter=get("async function enterApp(resume=false){","\nfunction resetAuthAfterLogout(){");
const storage=new Map();
const calls=[];
let failNetwork=false;
let current=null;
let remember={remembered:false};
const state={
 user:null,mode:'login',step:'username',username:'',pinLength:4,
 savedDevice:false,rememberedDevice:false,
 regName:'',regStatus:'',regPhone:'',regEmail:'',
 tab:'messages',selected:null,adminTab:'overview',adminTicket:null,
 groupSelected:null,friends:[],groups:[],
};
const sessionStorage={
 getItem:key=>storage.get(key)??null,
 setItem:(k,v)=>storage.set(k,String(v)),
 removeItem:key=>storage.delete(key),
};
const context={sessionStorage,JSON,Number,state,calls,setTimeout,clearTimeout,
 api:async path=>{
  calls.push('GET '+path);
  if(failNetwork)throw Error('network unavailable');
  if(path==='/api/me')return {user:current};
  if(path==='/api/auth/remembered/status')return {remembered:false};
  if(path==='/api/registration/status')return {requests:[]};
  if(path==='/api/me/deletion')return {pending:false};
  if(path==='/api/friends')return {friends:[]};
  if(path==='/api/blocks')return {users:[]};
  throw Error('Unexpected GET '+path);
 },
 post:async path=>{
  calls.push('POST '+path);
  if(path==='/api/auth/remembered')return remember;
  if(path==='/api/auth/lock')return {ok:true};
  throw Error('Unexpected POST '+path);
 },
 renderAuth:()=>calls.push('renderAuth'),
 connectSocket:()=>calls.push('connectSocket'),
 toast:()=>calls.push('toast'),
 renderReconnect:()=>calls.push('reconnect'),
 renderApp:()=>calls.push('renderApp'),
 loadAdmin:async()=>calls.push('loadAdmin'),
 refreshFriends:async()=>calls.push('friends'),
 refreshGroups:async()=>calls.push('groups'),
 loadNotices:async()=>calls.push('notices'),
 loadTickets:async()=>calls.push('tickets'),
 loadTicketMessages:async()=>calls.push('ticket messages'),
 loadMessages:async()=>calls.push('messages'),
 loadGroupMessages:async()=>calls.push('group messages'),
 adminTabs:[['overview','grid','Dashboard'],['users','users','Users']],
};
vm.createContext(context);
vm.runInContext(helpers.replace(/function renderReconnect\(\)\{[\s\S]*$/, ''),context);
vm.runInContext(enter+boot,context);

(async()=>{
 // Initial login in a tab: no tab key means no auto-login.
 await context.setup();
 assert.deepEqual(calls.slice(0,3),[
  'POST /api/auth/lock','POST /api/auth/remembered','GET /api/registration/status'
 ]);
 assert(!calls.includes('GET /api/me'),'Fresh tab must not auto-enter old account');
 calls.length=0;
 // Opening a second tab cannot kick out an already-open tab.
 vm.runInContext(`tabPresenceChannel={
  onmessage:null,
  postMessage(message){
   if(message.kind==='probe')setTimeout(()=>this.onmessage?.({
    data:{kind:'alive',nonce:message.nonce}
   }),8);
  }
 }`,context);
 await context.setup();
 assert(!calls.includes('POST /api/auth/lock'),'New tab must not revoke an active sibling tab');
 assert(!calls.includes('POST /api/auth/remembered'),'New tab must not revoke sibling through remembered endpoint');
 assert(!calls.includes('GET /api/me'),'New tab still requires authentication');
 vm.runInContext('tabPresenceChannel=null',context);
 calls.length=0;
 // Successful login writes a tab-only marker and last screen ID.
 state.user={id:17,is_admin:false};
 context.activateCurrentTab();
 state.tab='messages';state.selected=42;context.saveCurrentView();
 state.user=null;
 current={id:17,is_admin:false};
 await context.setup();
 assert.deepEqual(calls.slice(0,2),['GET /api/me','GET /api/auth/remembered/status']);
 assert(calls.includes('renderApp'),'Authenticated tab must restore the app');
 assert(!calls.includes('POST /api/auth/lock'),'Reload must never revoke session');
 assert(!calls.includes('POST /api/auth/remembered'),'Reload must not request PIN');
 assert.equal(state.selected,null,'Only valid/accepted chat IDs should restore');
 calls.length=0;
 // An accepted conversation returns to exactly that conversation after refresh.
 context.refreshFriends=async()=>{
  calls.push('friends');
  state.friends=[{other_id:42,state:'accepted'}];
 };
 storage.set('mtunz.active-view.v1',JSON.stringify({uid:17,tab:'messages',selected:42}));
 state.user=null;
 await context.setup();
 assert.equal(state.tab,'messages');
 assert.equal(state.selected,42,'The active conversation must survive reload');
 assert(calls.includes('messages'),'Messages for the selected chat are fetched again');
 assert(!calls.includes('POST /api/auth/lock'));
 calls.length=0;
 // Administrator dashboard section is also restored without fresh credentials.
 storage.set('mtunz.active-tab.v1',JSON.stringify({uid:1}));
 storage.set('mtunz.active-view.v1',JSON.stringify({uid:1,adminTab:'users'}));
 state.user=null;current={id:1,is_admin:true};
 await context.setup();
 assert.equal(state.adminTab,'users','Admin should remain on current section');
 assert(calls.includes('loadAdmin'));
 assert(!calls.includes('POST /api/auth/remembered'));
 calls.length=0;
 // Restore the member tab for the network-recovery case.
 storage.set('mtunz.active-tab.v1',JSON.stringify({uid:17}));
 state.user=null;current={id:17,is_admin:false};
 // A later transient network fault shows retry instead of logging out.
 state.user=null;failNetwork=true;
 await context.setup();
 assert(calls.includes('reconnect'),'Network errors preserve tab session');
 assert(storage.has('mtunz.active-tab.v1'));
 calls.length=0;failNetwork=false;
 // A new tab has no marker. Never recover cookies into authenticated UI.
 storage.clear();state.user=null;current={id:17,is_admin:false};
 await context.setup();
 assert(!calls.includes('GET /api/me'));
 assert(calls.includes('POST /api/auth/lock'));
 assert.equal(state.user,null);
 console.log('Tab session lifecycle OK: refresh retains session; closed/new tab requires auth; network failures do not log out.');
})().catch(e=>{console.error(e);process.exitCode=1;});
