'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const esc = (v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateFormatter=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const clockFormatter=new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit'});
const dayFormatter=new Intl.DateTimeFormat('vi-VN');
const date=t=>t&&Number.isFinite(Number(t))?dateFormatter.format(t*1000):'—';
const clock=t=>t&&Number.isFinite(Number(t))?clockFormatter.format(t*1000):'';
const deadlineDate = t=>t?new Date(t*1000).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const daysUntil = t=>Math.max(0,Math.ceil((Number(t)*1000-Date.now())/(86400*1000)));
const short = (s,n=34)=>String(s??'').length>n?String(s).slice(0,n-1)+'…':String(s??'');
const initials = s=>(s||'?').slice(0,2).toUpperCase();
const Ipaths = {
  chat:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.9 1.9-.06-.06A1.65 1.65 0 0 0 16 18.4a1.65 1.65 0 0 0-1 1.5V20h-6v-.1A1.65 1.65 0 0 0 8 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06-1.9-1.9.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.5-1H3v-4h.1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 1.9-1.9.06.06A1.65 1.65 0 0 0 8 5.6a1.65 1.65 0 0 0 1-1.5V4h6v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.82-.33l.06-.06 1.9 1.9-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.5 1h.1v4h-.1a1.65 1.65 0 0 0-1.5 1Z"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
  lock:'<rect width="14" height="11" x="5" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  eye:'<path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  announce:'<path d="m3 11 18-5v12L3 13v-2Z"/><path d="M7 14v6h4v-5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>',
  inbox:'<path d="M4 4h16v16H4z"/><path d="M4 14h5l2 3h2l2-3h5"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>'
};
const icon=(name,size=19)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Ipaths[name]||Ipaths.chat}</svg>`;
const brandGlyph=()=>`<img class="brand-glyph" src="/static/favicon.svg?v=8.0" alt="" draggable="false" decoding="async">`;

const avatar=(name,online=false,size='',photo=null)=>`<div class="avatar ${size} ${online?'online':''}">${photo?`<img class="avatar-photo" src="${esc(photo)}" alt="" loading="lazy" decoding="async">`:esc(initials(name))}</div>`;
const state={user:null,ws:null,mode:'login',step:'username',username:'',challenge:'',pinLength:4,
 savedDevice:false,rememberedDevice:false,loginIsAdmin:false,
 regName:'',regStatus:'',regPhone:'',regEmail:'',supportKind:'username',supportTicket:null,tickets:[],ticketMessages:[],
 tab:'messages',friends:[],blocks:[],selected:null,messages:[],adminTab:'overview',adminData:null,
 adminTicket:null,adminTicketMessages:[],adminShowSpam:false,adminQuery:'',adminAuditMeta:null,adminAuditFilter:{q:'',action:'',since:0,until:0},accountDeletion:null,typing:false,adminApprovalToken:null,adminApprovalData:null};
let toastTimer=0,typingTimer=0,socketRetry=null,socketRetryDelay=2500,typingLastSent=0,typingContext='';

// A tab-scoped marker survives a normal reload, but not a new ordinary tab.
// Only screen IDs are kept here; never store passwords, PINs or cookies.
const ACTIVE_TAB_KEY='mtunz.active-tab.v1';
// A fresh second tab must not revoke an already-open tab's cookie session.
// BroadcastChannel only shares a boolean presence signal, never account secrets.
let tabPresenceChannel=null;
try{
 if(typeof BroadcastChannel!=='undefined'){
  tabPresenceChannel=new BroadcastChannel('mtunz.active-presence.v1');
  tabPresenceChannel.onmessage=event=>{
   const item=event.data;
   if(item?.kind==='probe'&&state.user&&readActiveTab()){
    tabPresenceChannel.postMessage({kind:'alive',nonce:item.nonce});
   }
  };
 }
}catch{}
function otherTabIsActive(){
 if(!tabPresenceChannel)return Promise.resolve(false);
 return new Promise(resolve=>{
  const nonce=Math.random().toString(36).slice(2);
  let finished=false;
  const previous=tabPresenceChannel.onmessage;
  const respond=event=>{
   if(previous)previous(event);
   if(!finished&&event.data?.kind==='alive'&&event.data.nonce===nonce){
    finished=true;clearTimeout(timeout);tabPresenceChannel.onmessage=previous;resolve(true);
   }
  };
  tabPresenceChannel.onmessage=respond;
  const timeout=setTimeout(()=>{
   if(!finished){finished=true;tabPresenceChannel.onmessage=previous;resolve(false);}
  },220);
  tabPresenceChannel.postMessage({kind:'probe',nonce});
 });
}

const VIEW_TAB_KEY='mtunz.active-view.v1';
function readActiveTab(){
 try {
  const value=JSON.parse(sessionStorage.getItem(ACTIVE_TAB_KEY)||'null');
  return Number.isSafeInteger(value?.uid)&&value.uid>0?value:null;
 }catch{return null;}
}
function clearActiveTab(){
 try{sessionStorage.removeItem(ACTIVE_TAB_KEY);sessionStorage.removeItem(VIEW_TAB_KEY);}catch{}
}
function activateCurrentTab(){
 if(!state.user)return;
 try{sessionStorage.setItem(ACTIVE_TAB_KEY,JSON.stringify({uid:state.user.id}));}catch{}
}
function readSavedView(){
 try{
  const data=JSON.parse(sessionStorage.getItem(VIEW_TAB_KEY)||'null');
  return data&&data.uid===state.user?.id?data:null;
 }catch{return null;}
}
function saveCurrentView(){
 if(!state.user||!readActiveTab())return;
 const view={
  uid:state.user.id,tab:state.tab,
  selected:state.selected,groupSelected:state.groupSelected||null,
  supportTicket:state.supportTicket||null,
  adminTab:state.adminTab,adminTicket:state.adminTicket||null
 };
 try{sessionStorage.setItem(VIEW_TAB_KEY,JSON.stringify(view));}catch{}
}
function renderReconnect(){
 const host=root();
 if(!host)return;
 host.innerHTML=`<div class="boot-screen" role="status" aria-live="polite">
  <div class="loading-logo">m</div>
  <div class="boot-title">Tạm mất kết nối với mtunz</div>
  <div class="boot-subtitle">Phiên của tab vẫn được giữ. Hãy kiểm tra kết nối mạng rồi thử lại.</div>
  <button class="btn primary" type="button" data-act="retry-startup">Thử kết nối lại</button></div>`;
}


async function api(url,{method='GET',data,signal}={}){
  let response, payload;
  try{
    response=await fetch(url,{method,signal,credentials:'same-origin',headers:data!==undefined?{'Content-Type':'application/json'}:{},body:data!==undefined?JSON.stringify(data):undefined});
    payload=await response.json();
  }catch(e){throw Error('Không kết nối được máy chủ. Vui lòng thử lại.');}
  if(!response.ok){
    const detail=payload?.detail;
    if(detail?.code==='sanction')showSanction(detail);
    if(detail?.code==='maintenance')showMaintenance(detail.message);
    if(detail?.code==='account_deletion_pending')showDeletionHold(detail.purge_at);
    const error=new Error(typeof detail==='string'?detail:detail?.message||detail?.reason||'Yêu cầu không thành công.');
    error.status=response.status;
    error.code=detail?.code;
    error.maintenance=detail?.code==='maintenance'||detail?.code==='account_deletion_pending';
    throw error;
  }
  return payload;
}
const post=(url,data={})=>api(url,{method:'POST',data});
const del=url=>api(url,{method:'DELETE'});
const root=()=>$('#app');
function toast(message,type='info'){
  const host=$('#toast-root');
  if(!host)return;
  const kind=type==='ok'||type==='success'?'ok':type==='error'?'error':type==='warning'?'warning':'info';
  const symbols={ok:'check',error:'ban',warning:'shield',info:'bell'};
  const names={ok:'Thành công',error:'Có lỗi xảy ra',warning:'Lưu ý',info:'Thông báo'};
  const messageText=String(message??'');
  const duplicate=[...host.querySelectorAll('.notify-toast')].some(item=>
    item.dataset.kind===kind&&item.dataset.message===messageText);
  if(duplicate)return;
  const el=document.createElement('div');
  el.className='toast notify-toast '+kind;
  el.dataset.kind=kind;
  el.dataset.message=messageText;
  el.setAttribute('role',kind==='error'?'alert':'status');
  const accent=document.createElement('span');
  accent.className='notify-icon';accent.innerHTML=icon(symbols[kind],19);
  const content=document.createElement('span');
  content.className='notify-content';
  const title=document.createElement('strong');title.textContent=names[kind];
  const body=document.createElement('span');body.textContent=messageText;
  content.append(title,body);
  const close=document.createElement('button');
  close.className='notify-close';close.type='button';close.setAttribute('aria-label','Đóng thông báo');
  close.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const track=document.createElement('span');track.className='notify-progress';
  el.append(accent,content,close,track);
  const visible=[...host.querySelectorAll('.notify-toast')];
  if(visible.length>=2)visible[0].remove();
  host.append(el);
  let timer,started=0,remaining=kind==='error'?6500:4400,done=false;
  function dismiss(){
    if(done)return;done=true;clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(()=>el.remove(),230);
  }
  function pause(){
    if(done)return;clearTimeout(timer);
    remaining=Math.max(0,remaining-(performance.now()-started));
    track.style.animationPlayState='paused';
  }
  function resume(){
    if(done)return;
    started=performance.now();
    track.style.animationPlayState='running';
    timer=setTimeout(dismiss,remaining);
  }
  close.addEventListener('click',dismiss);
  el.addEventListener('mouseenter',pause);
  el.addEventListener('mouseleave',resume);
  el.addEventListener('focusin',pause);
  el.addEventListener('focusout',resume);
  track.style.setProperty('--notify-duration', (kind==='error'?6500:4400)+'ms');
  resume();
}
function modal({title,description='',content='',danger=false,confirm='Đồng ý',cancel='Hủy',closable=true,handler=()=>{}}){
  const host=$('#modal-root');
  if(!host)return;
  const previouslyFocused=document.activeElement;
  const identity='mtunz-dialog-'+Math.random().toString(36).slice(2,9);
  const accent=danger?'danger':'normal';
  host.innerHTML=`<div class="modal-backdrop">
    <div class="modal premium-dialog ${accent}" role="dialog" aria-modal="true" aria-labelledby="${identity}-title" aria-describedby="${identity}-desc" tabindex="-1">
      <div class="dialog-top">
        <div class="dialog-symbol" aria-hidden="true">${icon(danger?'shield':'chat',23)}</div>
        <div class="dialog-headlines"><span class="dialog-eyebrow">${danger?'XÁC NHẬN HÀNH ĐỘNG':'MTUNZ · XÁC NHẬN'}</span>
          <h2 id="${identity}-title">${esc(title)}</h2></div>
        ${closable?`<button type="button" class="dialog-x" id="dialog-close" aria-label="Đóng cửa sổ">${icon('add',20)}</button>`:''}
      </div>
      <p class="dialog-description" id="${identity}-desc">${esc(description||'Vui lòng kiểm tra thông tin trước khi tiếp tục.')}</p>
      ${content?`<div class="dialog-content">${content}</div>`:''}
      <div class="modal-actions">
        ${closable&&cancel!==null?`<button class="btn ghost" id="modal-cancel" type="button">${esc(cancel)}</button>`:''}
        <button class="btn ${danger?'danger':'primary'}" id="modal-confirm" type="button">${icon(danger?'shield':'check',16)}<span>${esc(confirm)}</span></button>
      </div>
    </div>
  </div>`;
  const panel=host.querySelector('.premium-dialog');
  const backdrop=host.querySelector('.modal-backdrop');
  const closeDialog=()=>{
    host.replaceChildren();
    if(previouslyFocused instanceof HTMLElement&&previouslyFocused.isConnected)previouslyFocused.focus({preventScroll:true});
  };
  if(closable){
    host.querySelector('#modal-cancel')?.addEventListener('click',closeDialog);
    host.querySelector('#dialog-close')?.addEventListener('click',closeDialog);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop&&!danger)closeDialog();});
  }
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&closable){e.preventDefault();closeDialog();return;}
    if(e.key!=='Tab')return;
    const focusable=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')].filter(x=>x.getClientRects().length);
    if(!focusable.length){e.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  const action=host.querySelector('#modal-confirm');
  action.addEventListener('click',async()=>{
    if(action.disabled)return;
    action.disabled=true;
    action.classList.add('is-loading');
    action.setAttribute('aria-busy','true');
    try{
      const result=await handler(host);
      if(result!==false)closeDialog();
    }catch(e){toast(e.message||'Thao tác không thành công.','error');}
    finally{
      if(action.isConnected){
        action.disabled=false;action.classList.remove('is-loading');action.removeAttribute('aria-busy');
      }
    }
  });
  requestAnimationFrame(()=>{if(panel.isConnected)panel.focus({preventScroll:true});});
}
function ask(title,description,handler,confirm='Xác nhận',danger=false){modal({title,description,handler,confirm,danger});}
function showDeletionHold(deadline){
 if($('#delete-hold-exit'))return;
 state.mode='login';state.step='username';state.challenge='';
 renderAuth();
 const expired=deadline*1000<=Date.now();
 modal({title:expired?'Tài khoản đã đến hạn xóa':'Tài khoản đang chờ xóa',
  description:expired?'Yêu cầu đã đến hạn xử lý. Bạn có thể trở về màn hình đăng nhập.':
   'Hạn xóa: '+deadlineDate(deadline)+'. Hãy chọn giữ tài khoản để hủy yêu cầu và vào lại ứng dụng.',
  confirm:expired?'Về đăng nhập':'Hủy xóa và vào tài khoản',closable:false,
  content:'<button id="delete-hold-exit" class="btn ghost" type="button">Tiếp tục chờ xóa</button>',
  handler:async host=>{
   if(expired){await logout();return;}
   try{await post('/api/me/delete/keep',{confirm:true});}
   catch(error){if(error.status!==409)throw error;}
   state.user=(await api('/api/me')).user;
   if(state.user?.deletion_purge_at)throw Error('Yêu cầu đã hết hạn để hủy.');
   host.replaceChildren();
   await enterApp();
   toast('Đã hủy yêu cầu xóa tài khoản.','ok');
   return false;
  }});
 $('#delete-hold-exit')?.addEventListener('click',async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{await logout();$('#modal-root')?.replaceChildren();}
  catch(error){button.disabled=false;toast(error.message,'error');}
 });
}
function showMaintenance(message='Hệ thống đang bảo trì. Vui lòng đăng nhập lại sau.'){
 if(state.user?.is_admin||$('#maintenance-notice'))return;
 const endingSession=Boolean(state.user||readActiveTab());
 modal({title:'Hệ thống đang bảo trì',description:message,confirm:'Đã hiểu',closable:false,
  content:'<span id="maintenance-notice" hidden></span>',
  handler:async()=>{
   if(endingSession){
    await post('/api/auth/logout').catch(()=>{});
    resetAuthAfterLogout();
   }else if(state.mode==='login'&&state.step!=='username'){
    state.step='username';state.challenge='';renderAuth();
   }
  }});
}
function showSanction(d){
  if($('#modal-root .sanction-only'))return;
  $('#modal-root').innerHTML=`<div class="modal-backdrop sanction-only"><div class="modal" role="alertdialog" aria-modal="true">
    <div class="toast-icon">${icon('shield',34)}</div><h2>${d.kind==='ban'?'Tài khoản đã bị cấm':'Tài khoản đã bị khóa'}</h2>
    <p>Quản trị viên đã áp dụng thay đổi ngay lập tức.${d.reason?' Lý do: '+esc(d.reason):''}
    ${d.until?' Thời hạn: '+esc(date(d.until))+'.':' Thời hạn: không xác định / vĩnh viễn.'}</p>
    <div class="modal-actions"><button class="btn primary" id="sanction-ack">Đã hiểu</button></div></div></div>`;
  $('#sanction-ack').onclick=async()=>{try{await post('/api/auth/logout')}catch{}location.reload();};
}
async function setup(){
 const previous=readActiveTab();
 try{
  // A normal refresh keeps sessionStorage and the HttpOnly session cookie.
  // Read the existing session FIRST: /api/auth/remembered used to revoke it.
  if(previous){
   const current=await api('/api/me');
   if(current.user&&current.user.id===previous.uid){
    state.user=current.user;
    // Read-only metadata keeps the "remember device" UI accurate after F5.
    // A status-check failure must not invalidate an otherwise healthy session.
    try {
     const saved=await api('/api/auth/remembered/status');
     state.savedDevice=!!saved.remembered;
     state.rememberedDevice=state.savedDevice;
    }catch{}
    await enterApp(true);
    return;
   }
   clearActiveTab();
  }

  // New tab / previously closed tab: do not silently re-enter old messages.
  // This revokes the stale cookie access while retaining the optional saved
  // device credential, which still requires a PIN on a fresh visit.
  const activeInOtherTab=await otherTabIsActive();
  // A second tab starts on the login screen without closing the first tab.
  // Once the original tab is closed, a new visit revokes its old cookie.
  if(!activeInOtherTab)await post('/api/auth/lock');
  const remembered=activeInOtherTab?{remembered:false}:await post('/api/auth/remembered');
  state.user=null;
  state.savedDevice=!!remembered.remembered;
  state.rememberedDevice=state.savedDevice;
  state.mode='login';
  state.step=remembered.remembered?'remembered':'username';
  if(remembered.remembered){
   state.username=remembered.username;
   state.pinLength=remembered.pin_length;
  }else{
   const r=await api('/api/registration/status');
   const active=r.requests.find(v=>['pending','approved'].includes(v.status));
   if(active){
    state.mode='register';
    state.regName=active.username;state.regStatus=active.status;
    state.regPhone=active.phone||'';state.regEmail=active.email||'';
   }
  }
  renderAuth();
  connectSocket();
 }catch(e){
  if(e.maintenance){clearActiveTab();state.user=null;renderAuth();return;}
  if(previous&&readActiveTab()){
   // A temporary network failure must never look like a forced logout.
   renderReconnect();
  }else{
   toast(e.message,'error');renderAuth();connectSocket();
  }
 }
}
function reportAlertVisibility(socket=state.ws,visible=!document.hidden){
 if(state.user&&socket?.readyState===WebSocket.OPEN){
  socket.send(JSON.stringify({type:'alert-visibility',visible}));
 }
}

let presenceHeartbeatTimer=0,pageIsUnloading=false;
function connectSocket(retry=false){
 if(socketRetry){clearTimeout(socketRetry);socketRetry=null;}
 clearInterval(presenceHeartbeatTimer);presenceHeartbeatTimer=0;
 if(state.ws){state.ws.onclose=null;state.ws.close();}
 const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 state.ws=socket;
 if(!retry)socketRetryDelay=2500;
 const handshakeTimeout=setTimeout(()=>{
  if(state.ws===socket&&socket.readyState===WebSocket.CONNECTING)socket.close();
 },15000);
 socket.onopen=()=>{
  clearTimeout(handshakeTimeout);
  if(state.ws!==socket)return;
  if(document.hidden){socket.close(1000,'App backgrounded');return;}
  socketRetryDelay=2500;
  v9ConnectionBanner(true);
  reportAlertVisibility(socket);
  // Foreground activity heartbeat: sleeping app tabs expire on the server.
  const beat=()=>{
   if(state.ws===socket&&socket.readyState===WebSocket.OPEN&&!document.hidden)
    socket.send(JSON.stringify({type:'presence-heartbeat'}));
  };
  beat();
  presenceHeartbeatTimer=setInterval(beat,6000);
  if(!retry)return;
  if(state.user?.is_admin)v9ScheduleAdminRefresh(350);
  if(state.user&&!state.user.is_admin){
   scheduleFriendsRefresh(0);
   scheduleGroupsRefresh(0);
   if(state.tab==='messages'&&state.selected)void loadMessages(false);
   if(state.tab==='groups'&&state.groupSelected)void loadGroupMessages(false);
  }
 };
 socket.onmessage=async ev=>{
   if(state.ws!==socket)return;
   socketRetryDelay=2500;
   let data;try{data=JSON.parse(ev.data)}catch{return;}
   const t=data.type;
   if(t==='chat-alert-settings'&&state.user&&!state.user.is_admin){
    applyWorkflowAlerts(data.scope,data.chat_id,data.mode,data.until);
    return;
   }
   if(t==='identity-updated'&&state.user&&!state.user.is_admin){
     const owner=state.user.id;
     const fresh=(await api('/api/me').catch(()=>null))?.user;
     if(fresh&&state.user?.id===owner){
       applyMemberIdentity(owner,fresh);
     }
     return;
   }
   if(t==='maintenance-status'){applyMaintenanceBanner(data.status);return;}
   if(t==='maintenance-mode'){
     showMaintenance(data.reason?'Hệ thống đang bảo trì. '+data.reason:undefined);return;
   }
   if(t==='account-sanction'){showSanction(data);return;}
   if(t==='world-penalty'&&state.tab==='settings'&&state.user&&!state.user.is_admin){
     await loadWorldStatus().then(()=>renderApp()).catch(()=>{});return;
   }
   if(t==='world-message'&&state.user&&!state.user.is_admin){
     if(typeof appendWorldSocket==='function')appendWorldSocket(data.message);
     return;
   }
   if((t==='world-status'||t==='world-penalty'||t==='world-message-removed')&&state.tab==='world'&&state.user&&!state.user.is_admin){
     await loadWorld(true).catch(()=>{});return;
   }
   if(t==='world-report-new'&&state.user?.is_admin&&state.adminTab==='reports'){
     v9ScheduleAdminRefresh();return;
   }
   if(t==='session-ended'){toast(data.reason||'Phiên đã kết thúc','error');await post('/api/auth/logout').catch(()=>{});resetAuthAfterLogout();return;}
   if(t==='account-deletion-updated'&&state.user){
     if(state.user.is_admin)await loadAdmin();
     else{
      const owner=state.user.id;
      const result=await api('/api/me/deletion').catch(()=>null);
      if(result&&state.user?.id===owner){
       state.accountDeletion=result;
       if(state.tab==='settings')renderApp();
      }
     }
     return;
   }
   if(t==='admin-approval-request'&&state.user?.is_admin){
     toast('🔐 Có thiết bị đang yêu cầu phê duyệt đăng nhập Admin.','info');
     if(state.adminTab==='security'){
       state.adminApprovalData=await api('/api/admin/login-approvals').catch(()=>null);
       renderAdmin();
     }
     return;
   }
   if(t==='world-status'&&state.user&&!state.user.is_admin){
     await loadWorldStatus().catch(()=>{});
     if(state.tab==='world')await loadWorld(true).catch(()=>{});
     else renderApp();
     return;
   }
   if(t==='registration-updated'){
     if(state.mode==='register'&&data.username===state.regName){state.regStatus=data.status;renderAuth();toast(data.status==='approved'?'Admin đã duyệt. Bạn có thể hoàn tất tạo tài khoản.':'Yêu cầu được cập nhật.','ok');}
     if(state.user?.is_admin){
       if(data.new_request)v9AdminNotice('Có tài khoản mới chờ duyệt.','registration');
       if(['registrations','overview'].includes(state.adminTab))v9ScheduleAdminRefresh();
     }
   }
   if(t==='friends-updated'){if(state.user&&!state.user.is_admin)scheduleFriendsRefresh(60);}
   if(t==='message-requests-updated'&&state.user&&!state.user.is_admin&&typeof loadMessageRequests==='function')loadMessageRequests(state.tab==='friends').catch(()=>{});
   if(t==='delivered'&&state.selected===data.by&&state.user&&!state.user.is_admin){
     for(const message of state.messages){
       if(message.sender_id===state.user.id&&message.id>0&&message.id<=Number(data.up_to)&&!message.delivered_at)
         message.delivered_at=data.at;
     }
     if(typeof v4PaintStatuses==='function')v4PaintStatuses();
     return;
   }
   if(t==='feature-flags-updated'&&state.user&&!state.user.is_admin){
     if(typeof v6RefreshFlags==='function')v6RefreshFlags().catch(()=>{});
     return;
   }
   if((t==='world-rooms-updated'||t==='world-poll-updated')&&state.user&&!state.user.is_admin){
     if(typeof v6RefreshCommunity==='function')v6RefreshCommunity(true).catch(()=>{});
     return;
   }
   if(t==='scheduled-updated'&&state.user&&!state.user.is_admin){
     if(state.tab==='messages'&&state.selected)toast('Tin nhắn hẹn giờ đã được xử lý.','info');
     return;
   }
   if(t==='message'){
     if(state.user&&!state.user.is_admin){
       const m=data.message;
       if(state.selected && (m.sender_id===state.selected||m.recipient_id===state.selected))appendDirectMessage(m);
       if(m.sender_id!==state.user.id&&typeof v4AckIncoming==='function')v4AckIncoming(m);
       scheduleFriendsRefresh();
       if(m.sender_id!==state.user.id)alertChatMessage('dm',m.sender_id,m);
     }
   }
   if(t==='read' && state.selected===data.by){
     let changed=false;
     for(const message of state.messages){
       if(message.sender_id===state.user?.id&&message.id>0&&message.id<=(data.up_to??Infinity)&&!message.read_at){
        message.read_at=data.at;changed=true;
       }
     }
     if(changed){
       for(const m of state.messages){if(m.read_at&&!m.delivered_at)m.delivered_at=m.read_at;}
       if(typeof v4PaintStatuses==='function')v4PaintStatuses();else renderMessageThread(false);
     }
   }
   if(t==='typing' && state.selected===data.from_id){const el=$('#typing-text');if(el){el.textContent=data.on?'Đang nhập tin nhắn…':'';}}
   if(t==='presence' && state.user && !state.user.is_admin){
     const friend=state.friends.find(x=>x.other_id===Number(data.user_id));
     if(friend){
       friend.online=!!data.online;
       if(Number.isFinite(Number(data.last_seen))&&Number(data.last_seen)>0)
         friend.last_seen=Number(data.last_seen);
       renderSideItems();
       updateChatHeader();
       if(state.tab==='friends')renderApp();
     }
     // Also reconcile events missed during connection loss.
     scheduleFriendsRefresh(700);
   }
   if(t==='announcement'){toast('📢 '+data.body,'info');notifyBrowser('Thông báo admin: '+data.body);}
   if(state.user&&!state.user.is_admin)await extraSocket(data);
   if(t==='support-deleted'&&!state.user?.is_admin){
     state.tickets=state.tickets.filter(ticket=>ticket.id!==data.ticket_id);
     if(state.supportTicket===data.ticket_id){
       state.supportTicket=null;state.ticketMessages=[];
       renderSupportPage();
     }else if(!state.supportTicket)renderSupportPage();
     return;
   }
   if(t==='support-updated'||t==='support-message'){
     if(state.user?.is_admin){
       if(data.new_request)v9AdminNotice('Có phiếu hỗ trợ mới.','support-request');
       else if(t==='support-message'&&!data.message?.from_admin)
         v9AdminNotice('Có tin nhắn hỗ trợ mới.','support-message');
       if(['tickets','overview'].includes(state.adminTab))v9ScheduleAdminRefresh();
     }
     else if(state.supportTicket&&(!data.ticket_id||data.ticket_id===state.supportTicket)){
       if(data.message&&data.ticket_id===state.supportTicket)appendSupportMessage(data.ticket_id,data.message);
       else await loadTicketMessages().catch(error=>toast(error.message,'error'));
     }
   }
 };
 socket.onclose=()=>{
  clearTimeout(handshakeTimeout);
  if(state.ws!==socket)return;
  clearInterval(presenceHeartbeatTimer);presenceHeartbeatTimer=0;
  if(pageIsUnloading||!state.user)return;
  v9ConnectionBanner(false);
  // Reconnect only while visible; foreground event resumes background tabs.
  if(document.hidden)return;
  const delay=navigator.onLine===false?Math.max(10000,socketRetryDelay):socketRetryDelay;
  socketRetry=setTimeout(()=>connectSocket(true),delay);
  socketRetryDelay=Math.min(30000,socketRetryDelay*2);
 };
}
// Web V9: resilient realtime status and coalesced Admin refresh without
// replacing an active chat or an administrative form on every socket event.
function v9ConnectionBanner(connected){
 const old=document.getElementById('mt-realtime-status');
 if(connected||!state.user){old?.remove();return;}
 const banner=old||document.createElement('aside');
 if(!old){
  banner.id='mt-realtime-status';
  banner.className='mt-realtime-status';
  banner.setAttribute('role','status');
  banner.setAttribute('aria-live','polite');
  banner.innerHTML='<span class="mt-realtime-indicator" aria-hidden="true"></span>'+
    '<span class="mt-realtime-copy"></span>'+
    '<button type="button" class="mt-realtime-retry" data-act="retry-socket">Thử lại</button>';
  document.body.append(banner);
 }
 banner.querySelector('.mt-realtime-copy').textContent=
  navigator.onLine===false?'Thiết bị đang ngoại tuyến. Tin nhắn sẽ đồng bộ khi có mạng.':
  'Đang kết nối lại với mtunz…';
}
let v9AdminTimer=0,v9AdminPending=false;
const v9AdminAlertTimes=new Map();
function v9AdminNotice(message,tag){
 if(!state.user?.is_admin||document.hidden)return;
 const now=Date.now(),last=v9AdminAlertTimes.get(tag)||0;
 if(now-last<3500)return;
 v9AdminAlertTimes.set(tag,now);
 if(v9AdminAlertTimes.size>15)v9AdminAlertTimes.delete(v9AdminAlertTimes.keys().next().value);
 toast(message,'info');
 if(typeof playChatSound==='function'&&typeof chatSoundEnabled==='function'&&chatSoundEnabled())
  playChatSound();
}
function v9ScheduleAdminRefresh(delay=240){
 if(!state.user?.is_admin)return;
 clearTimeout(v9AdminTimer);
 v9AdminTimer=setTimeout(()=>{
  v9AdminTimer=0;
  if(!state.user?.is_admin)return;
  if(document.visibilityState==='hidden'||
     document.activeElement?.matches?.('.admin-page input,.admin-page textarea,.admin-page select')){
    v9AdminPending=true;return;
  }
  v9AdminPending=false;
  void loadAdmin().catch(()=>{});
 },delay);
}
document.addEventListener('focusout',event=>{
 if(!v9AdminPending||!event.target?.closest?.('.admin-page'))return;
 setTimeout(()=>{
  if(v9AdminPending&&document.visibilityState==='visible')v9ScheduleAdminRefresh(160);
 },220);
},true);
window.addEventListener('online',()=>{
 v9ConnectionBanner(state.ws?.readyState===WebSocket.OPEN);
 if(state.user&&!document.hidden&&(!state.ws||state.ws.readyState===WebSocket.CLOSED))connectSocket(true);
});
window.addEventListener('offline',()=>v9ConnectionBanner(false));
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible'||!state.user)return;
 if(!state.ws||state.ws.readyState===WebSocket.CLOSED){connectSocket(true);return;}
 if(state.user.is_admin){v9ScheduleAdminRefresh(350);return;}
 scheduleFriendsRefresh(350);
 if(state.tab==='messages'&&state.selected)void loadMessages(false);
 if(state.tab==='groups'&&state.groupSelected)void loadGroupMessages(false);
});


function showRequiredDisplayName(){
 // Newly approved accounts must choose a public display name once.
 // Without it, the API blocks chats, contacts and account settings.
 modal({
  title:'Đặt tên hiển thị để bắt đầu',
  description:'Tên này sẽ xuất hiện khi kết bạn và nhắn tin. Tên đăng nhập chỉ dùng riêng để đăng nhập.',
  content:'<div class="onboarding-name-box">'+
   '<label for="onboarding-display-name">Tên mọi người sẽ nhìn thấy</label>'+
   '<input id="onboarding-display-name" class="input" type="text" minlength="2" maxlength="50" autocomplete="nickname" placeholder="Ví dụ: Minh Anh" aria-describedby="onboarding-name-hint">'+
   '<p id="onboarding-name-hint" class="hint">Nhập 2–50 ký tự và chọn tên khác tên đăng nhập. Bạn có thể đổi sau trong Cài đặt.</p>'+
   '<div class="onboarding-name-security">'+icon('shield',16)+
   '<span>Tên hiển thị dùng khi trò chuyện. Tên đăng nhập và số điện thoại không xuất hiện trong hồ sơ công khai.</span></div>'+
   '<button type="button" class="linkbtn onboarding-relogin" id="onboarding-relogin">'+icon('logout',15)+' Đăng xuất và đăng nhập lại</button>'+
   '</div>',
  confirm:'Lưu tên và bắt đầu',
  cancel:null,
  closable:false,
  handler:async host=>{
   const input=host.querySelector('#onboarding-display-name');
   const name=String(input?.value||'').trim();
   if(name.length<2||name.length>50){
    input?.focus();throw Error('Tên hiển thị cần từ 2 đến 50 ký tự.');
   }
   await post('/api/me/display-name',{display_name:name});
   state.user=(await api('/api/me')).user;
   await enterApp();
   toast('Đã lưu tên hiển thị. Chào mừng bạn đến mtunz!','ok');
  }
 });
 const root=$('#modal-root');
 root.querySelector('#onboarding-relogin')?.addEventListener('click',async(event)=>{
  const button=event.currentTarget;
  if(button.disabled)return;
  button.disabled=true;
  try{
   await logout();
   root.replaceChildren();
   toast('Đã đăng xuất. Bạn chỉ cần đăng nhập lại, không phải xin admin duyệt lần nữa.','info');
  }catch(error){button.disabled=false;toast(error.message||'Không thể đăng xuất.','error');}
 });
 root.querySelector('#onboarding-display-name')?.addEventListener('keydown',(event)=>{
  if(event.key==='Enter'){
   event.preventDefault();
   root.querySelector('#modal-confirm')?.click();
  }
 });
 requestAnimationFrame(()=>root.querySelector('#onboarding-display-name')?.focus({preventScroll:true}));
}
async function enterApp(resume=false){
 if(!state.user)return;
 if(state.user.deletion_purge_at){
  showDeletionHold(state.user.deletion_purge_at);
  return;
 }
 if(!state.user.is_admin&&state.user.onboarding_required){
  showRequiredDisplayName();return;
 }
 const previous=resume?readSavedView():null;
 activateCurrentTab();
 if(typeof refreshPushStatus==='function')void refreshPushStatus();
 state.selected=null;state.groupSelected=null;state.tab='messages';
 if(state.user.is_admin){
  state.adminTab=previous&&adminTabs.some(([tab])=>tab===previous.adminTab)?
   previous.adminTab:'overview';
  state.adminTicket=Number.isSafeInteger(previous?.adminTicket)?previous.adminTicket:null;
  await loadAdmin();
 }else{
  const [deletion]=await Promise.all([
   api('/api/me/deletion'),refreshFriends(false),refreshGroups(false),
   typeof loadWorldStatus==='function'?loadWorldStatus().catch(()=>{}):null,
   typeof loadMessageRequests==='function'?loadMessageRequests(false).catch(()=>{}):null
  ]);
  state.accountDeletion=deletion;
  const allowed=['messages','groups','friends','notices','settings','profile','world','restricted','archive','support'];
  if(previous&&allowed.includes(previous.tab))state.tab=previous.tab;
  if(state.tab==='messages'&&Number.isSafeInteger(previous?.selected)&&
   state.friends.some(f=>f.other_id===previous.selected&&f.state==='accepted')){
   state.selected=previous.selected;
  }
  if(state.tab==='groups'&&Number.isSafeInteger(previous?.groupSelected)&&
   state.groups.some(g=>g.id===previous.groupSelected)){
   state.groupSelected=previous.groupSelected;
  }
  if(state.tab==='notices')await loadNotices();
  if(state.tab==='world'){try{await loadWorld(false);}catch{state.worldData=null;}}
  if(state.tab==='support'){
   state.mode='support';
   state.supportTicket=Number.isSafeInteger(previous?.supportTicket)?previous.supportTicket:null;
   await loadTickets();
   if(state.supportTicket)await loadTicketMessages();
  }
  if((state.tab==='messages'&&state.selected)||(state.tab==='groups'&&state.groupSelected)){
   renderChatOpening();
   if(state.tab==='messages')await loadMessages();
   else await loadGroupMessages();
  }else renderApp();
 }
 saveCurrentView();
 connectSocket();
}
function resetAuthAfterLogout(){
 // Remove typed or autofilled secrets from live DOM before switching screens.
 maskVisiblePasswords();
 document.querySelectorAll('input[type="password"], input[data-manual-password]').forEach(input=>{input.value='';});
 v4FailedSends.clear();directSendQueues.clear();clearChatReads();v4ClearDraftTimers();
 state.user=null;state.selected=null;state.groupSelected=null;state.savedDevice=false;state.rememberedDevice=false;
 state.supportTicket=null;state.tickets=[];state.ticketMessages=[];state.adminTicket=null;state.adminTicketMessages=[];
 state.username='';state.challenge='';state.pinLength=4;state.accountDeletion=null;state.loginIsAdmin=false;
 clearActiveTab();
 state.ws?.close();v9ConnectionBanner(true);
 v9AdminPending=false;clearTimeout(v9AdminTimer);
 state.mode='login';state.step='username';renderAuth();connectSocket();
}
async function logout(){
 // Never claim that the user is logged out before server-side revocation succeeds.
 await post('/api/auth/logout');
 resetAuthAfterLogout();
}

// ==== Onboarding and anonymous support ====
function authArt(){return `<aside class="auth-art art-v3 art-v4 art-v5" aria-label="Giới thiệu mtunz">
  <div class="art-aurora art-aurora-a" aria-hidden="true"></div>
  <div class="art-aurora art-aurora-b" aria-hidden="true"></div>
  <div class="art-stars" aria-hidden="true"></div>
  <div class="nova-mesh" aria-hidden="true"></div>
  <div class="nova-ambient-light" aria-hidden="true"></div>
  <div class="nova-fine-line" aria-hidden="true"></div>

  <div class="logo brand-lockup nova-brand">
    <span class="logo-mark nova-brand-mark" aria-hidden="true">${brandGlyph()}</span>
    <span class="nova-brand-name">mtunz<span class="brand-dot">.</span></span>
    <span class="brand-byline nova-brand-byline"><span class="nova-byline-dot"></span>PRIVATE CONNECTIONS</span>
  </div>

  <div class="art-content nova-content">
    <div class="nova-section-meta" aria-hidden="true"><span>MTUNZ / 01</span><span>YOUR SPACE TO CONNECT</span></div>
    <div class="art-kicker nova-kicker"><span class="live-spark"></span> MỘT KHÔNG GIAN, NHIỀU KẾT NỐI <span class="nova-kicker-line"></span></div>
    <h1 class="auth-headline-copy nova-headline">Kết nối không giới hạn.<br><span class="gradient-text">Trò chuyện theo cách bạn.</span></h1>
    <p class="nova-description">Gửi đi cảm xúc. Giữ lại kết nối. Tạo nên những câu chuyện của riêng bạn.</p>
    <div class="nova-proof-row" aria-label="Điểm nổi bật">
      <span><i class="nova-proof-dot"></i> Nhắn tin thời gian thực</span>
      <span class="nova-proof-separator" aria-hidden="true"></span>
      <span>${icon('shield',14)} Không gian riêng tư</span>
    </div>

    <div class="signal-stage nova-stage" aria-label="Ba tính năng: nhắn tin tức thì, quyền riêng tư, kết nối nhóm">
      <div class="signal-grid" aria-hidden="true"></div>
      <div class="nova-stage-sheen" aria-hidden="true"></div>
      <div class="nova-stage-head">
        <div class="nova-stage-identifier"><span class="nova-head-led"></span> MTUNZ <span>/</span> CONNECTION SYSTEM</div>
        <div class="nova-stage-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="nova-stage-field" aria-hidden="true"></div>
      <div class="signal-halo halo-one" aria-hidden="true"></div>
      <div class="signal-halo halo-two" aria-hidden="true"></div>
      <div class="nova-halo halo-three" aria-hidden="true"></div>
      <div class="nova-orbit nova-orbit-one" aria-hidden="true"><i></i></div>
      <div class="nova-orbit nova-orbit-two" aria-hidden="true"><i></i></div>
      <div class="nova-connect-line nova-connect-line-one" aria-hidden="true"></div>
      <div class="nova-connect-line nova-connect-line-two" aria-hidden="true"></div>
      <div class="nova-connect-line nova-connect-line-three" aria-hidden="true"></div>
      <div class="signal-nucleus nova-nucleus" aria-hidden="true">
        <span class="nova-nucleus-inner">${brandGlyph()}</span>
        <span class="signal-nucleus-glow"></span>
      </div>
      <article class="signal-feature feature-realtime nova-feature">
        <span class="signal-feature-icon">${icon('chat',20)}</span>
        <span class="nova-feature-content"><strong>Nhắn tin tức thì</strong><small>Gần nhau trong từng khoảnh khắc</small></span>
        <i class="signal-feature-pulse" aria-hidden="true"></i>
      </article>
      <article class="signal-feature feature-privacy nova-feature">
        <span class="signal-feature-icon">${icon('shield',20)}</span>
        <span class="nova-feature-content"><strong>Quyền riêng tư</strong><small>Chủ động kiểm soát kết nối</small></span>
        <span class="feature-check" aria-hidden="true">${icon('check',15)}</span>
      </article>
      <article class="signal-feature feature-members nova-feature">
        <span class="signal-feature-icon">${icon('users',20)}</span>
        <span class="nova-feature-content"><strong>Cộng đồng của bạn</strong><small>Trò chuyện theo cách riêng</small></span>
        <span class="feature-check" aria-hidden="true">${icon('check',15)}</span>
      </article>
      <div class="nova-stage-base">
        <span>DESIGNED FOR CONNECTION</span>
        <span class="nova-stage-base-icon" aria-hidden="true">${icon('shield',12)} PRIVATE BY DESIGN</span>
      </div>
    </div>
  </div>
  <div class="auth-art-footer nova-footer" aria-label="Các đặc điểm của mtunz">
    <span>${icon('chat',15)} Nhắn tin tức thì</span>
    <span>${icon('lock',15)} Đăng nhập nhiều lớp</span>
    <span>${icon('shield',15)} Đăng ký có xét duyệt</span>
  </div>
</aside>`;}
// Contextual authentication feedback: do not put secrets or credentials in toasts.
function authFailureText(step,error){
 const text=String(error?.message||'Không thể xác minh lúc này. Vui lòng thử lại.');
 if(step==='login-username'&&error?.status===404)
   return 'Không tìm thấy tài khoản. Hãy kiểm tra tên đăng nhập hoặc số điện thoại.';
 if(step==='login-password'&&error?.status===401)
   return 'Mật khẩu không chính xác. Vui lòng thử lại.';
 if((step==='login-pin'||step==='login-remembered')&&error?.status===401){
   if(/hết hạn|đăng nhập lại|thu hồi|chưa được ghi nhớ/i.test(text))return text;
   return 'Mã PIN không chính xác. Vui lòng thử lại.';
 }
 return text;
}
function showAuthFieldError(form,fieldName,message){
 const input=form?.querySelector('[name="'+fieldName+'"]');
 const holder=input?.closest('.field');
 if(!input||!holder||!form.isConnected)return false;
 let error=holder.querySelector('.field-error');
 if(!error){
   error=document.createElement('div');
   error.className='field-error auth-context-error';
   holder.append(error);
 }
 error.setAttribute('role','alert');
 error.textContent=String(message||'Vui lòng kiểm tra lại thông tin.');
 holder.classList.add('has-error');
 input.setAttribute('aria-invalid','true');
 if(input.id){
   error.id=input.id+'-error';
   const described=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
   if(!described.includes(error.id))input.setAttribute('aria-describedby',[...described,error.id].join(' '));
 }
 // Leave the username available for correction, but clear rejected secrets.
 if(fieldName==='password'||fieldName==='pin')input.value='';
 input.focus({preventScroll:true});
 return true;
}
function passwordEye(name){
 return `<button type="button" class="password-eye" data-password-eye aria-controls="${esc(name)}" aria-label="Hiển thị mật khẩu" aria-pressed="false">${icon('eye',19)}</button>`;
}
function inputField(label,name,type='text',placeholder='',attr='',required=true){
 const kind=/(pin|code)/i.test(name)?'shield':/(password|new_value)/i.test(name)?'lock':name==='username'?'users':'chat';
 const reveal=type==='password'&&/password/i.test(name);
 return `<div class="field auth-input-field"><label for="${name}">${esc(label)}</label>
 <div class="auth-input-wrap${reveal?' password-eye-wrap':''}"><span class="auth-input-icon" aria-hidden="true">${icon(kind,18)}</span>
 <input class="input" id="${name}" name="${name}" type="${type}" ${placeholder?`placeholder="${esc(placeholder)}"`:''} ${attr} ${required?'required':''}>${reveal?passwordEye(name):''}</div></div>`;
}
/* Plain form control for account settings/admin: no absolutely positioned icon.
   Do not use the decorative auth-input component outside the sign-in flow. */
function secureSettingsField(label,name,type='text',placeholder='',attr=''){
 const reveal=type==='password'&&/password/i.test(name);
 return `<div class="field secure-settings-field"><label for="${name}">${esc(label)}</label>
 ${reveal?'<div class="password-eye-wrap">':''}<input class="input" id="${name}" name="${name}" type="${type}" ${placeholder?`placeholder="${esc(placeholder)}"`:''} ${attr} required>${reveal?passwordEye(name)+'</div>':''}</div>`;
}
function authTabs(){return `<div class="auth-nav" role="group" aria-label="Điều hướng tài khoản">
 <button type="button" class="${state.mode==='login'?'active':''}" aria-pressed="${state.mode==='login'}" data-act="mode-login">${icon('lock',16)}<span>Đăng nhập</span></button>
 <button type="button" class="${state.mode==='register'?'active':''}" aria-pressed="${state.mode==='register'}" data-act="mode-register">${icon('users',16)}<span>Đăng ký</span></button>
 <button type="button" class="${state.mode==='support'?'active':''}" aria-pressed="${state.mode==='support'}" data-act="mode-support">${icon('inbox',16)}<span>Hỗ trợ</span></button>
 </div>`;}
function authLogin(){
 const step=state.step;
 if(step==='approval')return adminApprovalWaiting();
 if(step==='remembered')return `<span class="eyebrow">THIẾT BỊ ĐƯỢC GHI NHỚ</span>
 <h1>Chào mừng trở lại, ${esc(state.username)}!</h1>
 <div class="auth-remember-summary">${icon('shield',18)}<span>Phiên truy cập đang khóa. Chỉ mở sau khi xác minh PIN.</span></div>
 <form data-form="login-remembered">
 ${inputField('Mã PIN','pin','password','',
 `inputmode="numeric" pattern="[0-9]{${state.pinLength}}" minlength="${state.pinLength}" maxlength="${state.pinLength}" autocomplete="off"`)}
 <button class="btn primary full" type="submit">${icon('lock',17)} Mở khóa bằng PIN</button></form>
 <div class="auth-remember-actions"><button class="linkbtn" type="button" data-act="forget-remembered">Quên thiết bị · Đăng nhập tài khoản khác</button></div>`;

 const forms={
 username:`<span class="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h1>Tiếp tục cuộc trò chuyện.</h1>
 <p class="hint">Dùng tên đăng nhập hoặc số điện thoại đã liên kết với tài khoản.</p><div class="auth-step"><span class="active"></span><span></span><span></span></div>
 <form data-form="login-username">${inputField('Tên đăng nhập hoặc số điện thoại','username','text','','autocomplete="username" maxlength="40" value="'+esc(state.username)+'"')}
 <button class="btn primary full" type="submit">Tiếp tục ${icon('chevron',17)}</button></form>`,
 password:`<span class="eyebrow">XÁC MINH MẬT KHẨU</span><h1>Chào ${state.username.startsWith('+')?'bạn':esc(state.username)} 👋</h1>
 <p class="hint">Nhập mật khẩu để tiếp tục. Tài khoản có PIN sẽ cần xác minh thêm một bước.</p>
 <div class="auth-step"><span class="active"></span><span class="active"></span><span></span></div>
 <form data-form="login-password" autocomplete="off">${inputField('Mật khẩu','password','password','','autocomplete="off" readonly data-manual-password="1"')}
 <button type="submit" class="btn primary full">Xác nhận mật khẩu ${icon('chevron',17)}</button></form>
 <button class="linkbtn" data-act="back-login">${icon('back',13)} Đổi cách đăng nhập</button>`,
 pin:`<span class="eyebrow">BƯỚC 3/3 · XÁC MINH</span><h1>Thêm một lớp an toàn.</h1>
 <p class="hint">Nhập mã PIN ${state.pinLength} chữ số đã thiết lập khi tạo tài khoản.</p>
 <div class="auth-step"><span class="active"></span><span class="active"></span><span class="active"></span></div>
 <form data-form="login-pin">${inputField('Mã PIN','pin','password','',`inputmode="numeric" pattern="[0-9]{${state.pinLength}}" minlength="${state.pinLength}" maxlength="${state.pinLength}" autocomplete="one-time-code"`)}
${state.loginIsAdmin?'':` <label class="auth-remember-choice"><input type="checkbox" name="remember_device" value="on" ${state.rememberedDevice?'checked':''}><span class="auth-remember-choice-icon">${icon('shield',19)}</span><span><strong>Ghi nhớ thiết bị này trong 30 ngày</strong><small>Sau khi đóng tab, lần mở phiên mới có thể dùng PIN. Tải lại tab đang mở không cần xác thực lại.</small></span></label>`}
 <button type="submit" class="btn primary full">Đăng nhập ${icon('check',17)}</button></form>
 <button class="linkbtn" data-act="back-login">${icon('back',13)} Đăng nhập lại</button>`
 };
 return forms[step]+`<div class="sep"></div><div class="row between"><span class="small muted">Bạn gặp khó khăn?</span><div class="row" style="gap:9px;flex-wrap:wrap;justify-content:flex-end">
 <button class="linkbtn small" data-act="forgot-username">Quên tên</button><button class="linkbtn small" data-act="forgot-password">Quên mật khẩu</button><button class="linkbtn small" data-act="forgot-pin">Quên PIN</button></div></div>`;
}
function authRegister(){
 if(state.regStatus==='pending')return `<div class="onboard-center"><div class="wait-orbit"></div><span class="eyebrow">ĐANG CHỜ PHÊ DUYỆT</span>
 <h1>Yêu cầu đã được gửi!</h1><p class="hint" style="margin-top:15px">Tài khoản <b>${esc(state.regName)}</b> đang chờ xét duyệt. Sau khi được chấp thuận, bạn có thể thiết lập mật khẩu và mã PIN.</p>
 <p class="hint">Trạng thái yêu cầu sẽ được cập nhật tự động.</p>
 <button class="btn ghost full" data-act="refresh-registration">${icon('refresh')} Kiểm tra trạng thái</button></div>`;
 if(state.regStatus==='denied')return `<span class="eyebrow">YÊU CẦU BỊ TỪ CHỐI</span><h1>Chưa thể đăng ký.</h1><p class="hint">Yêu cầu đăng ký <b>${esc(state.regName)}</b> chưa được chấp thuận. Bạn có thể gửi yêu cầu mới với tên khác.</p><button class="btn primary full" data-act="retry-registration">Gửi yêu cầu khác</button>`;
 if(state.regStatus==='approved')return `<div class="registration-complete">
 <div class="registration-approved">${icon('check',15)} <span>ĐÃ ĐƯỢC PHÊ DUYỆT</span></div>
 <h1>Hoàn tất tài khoản.</h1>
 <p class="hint registration-lead">Tên tài khoản <strong>${esc(state.regName)}</strong> đã được giữ chỗ. Tạo mật khẩu và PIN bảo mật để bắt đầu sử dụng mtunz.</p>
 <form data-form="register-complete" class="registration-form">
   <section class="registration-section" aria-labelledby="registration-password-heading">
     <div class="registration-section-heading">
       <span class="registration-section-number" aria-hidden="true">01</span>
       <div><h2 id="registration-password-heading">Mật khẩu đăng nhập</h2><p>Sử dụng mật khẩu riêng, tối thiểu 10 ký tự.</p></div>
     </div>
     ${inputField('Mật khẩu','new-password','password','','minlength="10" autocomplete="new-password"')}
     ${inputField('Nhập lại mật khẩu','repeat-password','password','','minlength="10" autocomplete="new-password"')}
   </section>
   <section class="registration-section" aria-labelledby="registration-pin-heading">
     <div class="registration-section-heading">
       <span class="registration-section-number" aria-hidden="true">02</span>
       <div><h2 id="registration-pin-heading">Mã PIN xác minh</h2><p>Lớp bảo vệ bổ sung khi đăng nhập.</p></div>
     </div>
     <div class="field registration-pin-select"><label for="pin-length">Độ dài mã PIN</label><select class="select" id="pin-length" name="pin_length"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6">6 chữ số</option></select></div>
     ${inputField('Mã PIN','new-pin','password','','inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="off"')}
     ${inputField('Nhập lại PIN','repeat-pin','password','','inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="off"')}
   </section>
   ${!state.regPhone?`<section class="registration-section"><h2>Bổ sung số điện thoại liên hệ</h2><p class="hint">Yêu cầu đăng ký được tạo trước đợt cập nhật cần số điện thoại để hoàn tất.</p>
     ${inputField('Số điện thoại (bắt buộc)','phone','tel','','autocomplete="tel" inputmode="tel" maxlength="40"')}
   </section>`:''}
   <div class="registration-consent"><input id="accepted-terms" type="checkbox" name="accepted_terms" required><label for="accepted-terms">Tôi đã đọc và đồng ý với <a href="/terms" target="_blank" rel="noopener noreferrer">Điều khoản sử dụng</a> và <a href="/privacy" target="_blank" rel="noopener noreferrer">Chính sách quyền riêng tư</a> của mtunz.</label></div>
   <p class="registration-security-note">${icon('shield',15)} Mật khẩu và PIN chỉ được lưu dưới dạng mã băm.</p>
   <button class="btn primary full" type="submit">Tạo tài khoản ${icon('check',17)}</button>
 </form></div>`;
 return `<span class="eyebrow">THAM GIA MTUNZ</span><h1>Bắt đầu một kết nối mới.</h1>
 <div class="auth-step"><span class="active"></span><span></span><span></span></div>
 <form data-form="register-request">${inputField('Tên tài khoản muốn dùng','username','text','','minlength="3" maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"')}
 ${inputField('Số điện thoại (bắt buộc)','phone','tel','','autocomplete="tel" inputmode="tel" maxlength="40"')}
 <div class="field auth-input-field"><label for="reg-email">Email / Gmail (không bắt buộc)</label><div class="auth-input-wrap"><span class="auth-input-icon" aria-hidden="true">${icon('inbox',18)}</span><input class="input" id="reg-email" name="email" type="email" autocomplete="email" maxlength="254"></div></div>
  <button class="btn primary full" type="submit">Gửi yêu cầu phê duyệt ${icon('chevron',17)}</button></form>
`;
}
function authSupport(){
 if(!state.supportTicket)return `<span class="eyebrow">TRUNG TÂM HỖ TRỢ</span><h1>Admin ở đây để hỗ trợ.</h1>
 <p class="hint">Tạo cuộc trò chuyện riêng với quản trị viên. Trường hợp khôi phục tài khoản, bạn cần chứng minh quyền sở hữu.</p>
 ${state.supportPaused?`<div class="support-intake-banner" role="status"><div><strong>Tạm ngừng nhận phiếu mới</strong>
 <p class="hint">Bạn vẫn có thể mở các cuộc trò chuyện hiện có.</p></div>
 <button class="btn ghost sm" type="button" data-act="support-refresh">${icon('refresh',15)} Kiểm tra lại</button></div>`:
 `<form data-form="support-new"><div class="field"><label>Vấn đề bạn gặp phải</label><select class="select" name="kind">
 <option value="username" ${state.supportKind==='username'?'selected':''}>Quên tên đăng nhập</option>
 <option value="password" ${state.supportKind==='password'?'selected':''}>Quên mật khẩu</option>
 <option value="pin" ${state.supportKind==='pin'?'selected':''}>Quên mã PIN</option>
 <option value="other" ${state.supportKind==='other'?'selected':''}>Vấn đề khác</option></select></div>
 ${inputField('Thông tin gợi nhớ (không bắt buộc)','claim','text','','maxlength="160"',false)}
 <button class="btn primary full">Bắt đầu trò chuyện ${icon('chat',17)}</button></form>`}
 ${state.tickets.length?`<div class="sep"></div><span class="eyebrow">CUỘC TRÒ CHUYỆN GẦN ĐÂY</span><div class="stack" style="margin-top:12px">${state.tickets.slice(0,5).map(t=>`<button class="btn ghost full" style="justify-content:space-between" data-act="support-open" data-id="${t.id}">#${t.id} · ${esc(t.kind)} <span class="pill">${esc(t.status)}</span></button>`).join('')}</div>`:''}`;
 const status=state.tickets.find(ticket=>ticket.id===state.supportTicket)?.status||'open';
 return `<div class="row between" style="margin-bottom:17px"><button class="linkbtn" data-act="support-back">${icon('back',15)} Các yêu cầu</button><span class="pill">Phiếu hỗ trợ #${state.supportTicket}</span></div>
 <h1>Trò chuyện với admin</h1><p class="hint">Đối thoại này chỉ hiển thị cho trình duyệt đã mở yêu cầu và quản trị viên. Không chia sẻ mã khôi phục với người khác.</p>
 <div class="support-list" id="support-list" data-ticket-id="${state.supportTicket}" style="min-height:200px;margin-top:19px">${renderTicketBubbles(state.ticketMessages)}</div>
 ${status==='open'?`<form data-form="support-reply" style="margin-top:12px"><div class="row"><input name="body" class="input" maxlength="1500" placeholder="Nhắn cho admin..." required><button class="btn primary circle" title="Gửi">${icon('send')}</button></div></form>`:'<p class="hint">Phiếu này đã đóng.</p>'}
 <div class="sep"></div><h3>Đặt lại mật khẩu hoặc PIN</h3><p class="hint">Sau khi xác minh, admin sẽ cấp mã dùng một lần trong cuộc trò chuyện trên.</p>
 <form data-form="support-reset">${inputField('Mã khôi phục từ admin','code','text','','autocomplete="off"')}
 <div class="field"><label>Đặt lại loại thông tin</label><select name="kind" class="select" id="reset-kind"><option value="password">Mật khẩu</option><option value="pin">Mã PIN</option></select></div>
 <div class="field"><label>Độ dài PIN mới (nếu khôi phục PIN)</label><select name="pin_length" class="select"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6">6 chữ số</option></select></div>
 ${inputField('Mật khẩu/PIN mới','new_value','password','','autocomplete="new-password"')}
 <button class="btn ghost full">Xác nhận đặt lại</button></form>`;
}
function renderTicketBubbles(list){return list.length?list.map(m=>`<div class="support-message ${m.from_admin?'admin':'mine'}"><b>${m.from_admin?'Admin':'Bạn'}</b><div>${esc(m.body)}</div><div class="message-meta">${date(m.created_at)}</div></div>`).join(''):'<div class="empty">Chưa có tin nhắn. Bạn có thể mô tả vấn đề của mình.</div>';}
function renderAuth(){
 // Keep the left-side hero DOM mounted across login/register/support transitions.
 // Rebuilding #app here restarted every decorative animation in the opposite column.
 const host=root();
 const view=state.mode==='login'?authLogin():state.mode==='register'?authRegister():authSupport();
 const screenMarkup=`<div class="auth-screen-content">${view}</div>`;
 const existing=host.querySelector(':scope > .auth');
 if(!existing){
   host.innerHTML=`<div class="auth">${authArt()}<main class="auth-main">
     <div class="auth-mobile-logo logo"><span class="logo-mark" aria-hidden="true">${brandGlyph()}</span> mtunz<span class="brand-dot">.</span></div>
     <div class="auth-panel">
       <svg class="auth-neon-perimeter" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
         <defs><linearGradient id="auth-neon-glow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
           <stop offset="0%" stop-color="#b79aff"/>
           <stop offset="52%" stop-color="#7bdaf5"/>
           <stop offset="100%" stop-color="#ad9fff"/>
         </linearGradient></defs>
         <rect class="auth-neon-track" pathLength="100"></rect>
         <rect class="auth-neon-halo" pathLength="100"></rect>
         <rect class="auth-neon-runner" pathLength="100"></rect>
       </svg>
       ${authTabs()}
       <section class="auth-screen" aria-live="polite">${screenMarkup}</section>
       <div class="auth-footer">© 2026 mtunz · Kết nối gọn gàng, bảo mật rõ ràng</div>
     </div>
   </main></div>`;
   // Brand artwork stays static; no pointer tracking or background motion.
   return;
 }
 const nav=existing.querySelector('.auth-nav');
 if(nav){
   for(const button of nav.querySelectorAll('button[data-act^="mode-"]')){
     const selected=button.dataset.act===`mode-${state.mode}`;
     button.classList.toggle('active',selected);
     button.setAttribute('aria-pressed',String(selected));
   }
 }
 const screen=existing.querySelector('.auth-screen');
 if(screen){
   screen.innerHTML=screenMarkup;
   // Never scroll the entire page: only the form's own scroll pane may move.
   const main=existing.querySelector('.auth-main');
   if(main && main.scrollTop>0 && screen.getBoundingClientRect().top<main.getBoundingClientRect().top){
     main.scrollTo({top:0,behavior:'instant'});
   }
 }
}
async function loadTickets(){
 const result=await api('/api/support/tickets');
 state.tickets=result.tickets;
 state.supportPaused=!!result.paused;
}
function renderSupportPage(){
 if(state.user&&!state.user.is_admin&&state.tab==='support')renderApp();
 else if(!state.user&&state.mode==='support')renderAuth();
}
let supportHistoryRequest=0;
function paintSupportMessages(ticket,follow=false){
 const box=$('#support-list');
 if(Number(box?.dataset.ticketId)!==ticket)return false;
 const markup=renderTicketBubbles(state.ticketMessages);
 if(box.supportMarkup!==markup){
  const near=box.scrollHeight-box.clientHeight-box.scrollTop<100;
  box.supportMarkup=markup;
  box.innerHTML=markup;
  if(follow||near)box.scrollTop=box.scrollHeight;
 }
 return true;
}
function appendSupportMessage(ticket,message){
 if(state.supportTicket!==ticket||!message||state.ticketMessages.some(m=>m.id===message.id))return;
 state.ticketMessages.push(message);
 paintSupportMessages(ticket,!message.from_admin);
}
async function loadTicketMessages(){
 const ticket=state.supportTicket,id=state.user?.id;
 if(!ticket)return;
 const request=++supportHistoryRequest;
 const baseline=new Set(state.ticketMessages.map(m=>m.id));
 let result;
 try{result=await api(`/api/support/tickets/${ticket}/messages`);}
 catch(error){
  if(error.status!==404)throw error;
  if(request===supportHistoryRequest&&state.supportTicket===ticket&&state.user?.id===id){
   state.tickets=state.tickets.filter(item=>item.id!==ticket);
   state.supportTicket=null;state.ticketMessages=[];
   renderSupportPage();
  }
  return;
 }
 if(request!==supportHistoryRequest||state.supportTicket!==ticket||state.user?.id!==id)return;
 const merged=new Map(result.messages.map(m=>[m.id,m]));
 for(const message of state.ticketMessages){
  if(!baseline.has(message.id))merged.set(message.id,message);
 }
 state.ticketMessages=[...merged.values()].sort((a,b)=>a.id-b.id);
 const entry=state.tickets.find(item=>item.id===ticket);
 if(entry&&result.status&&entry.status!==result.status){
  entry.status=result.status;
  renderSupportPage();
  return;
 }
 if(paintSupportMessages(ticket))return;
 if(state.mode==='support'&&!state.user)renderAuth();
 else if(state.tab==='support')renderApp();
 const box=$('#support-list');if(box)box.scrollTop=box.scrollHeight;
}
async function refreshRegistration(){const r=await api('/api/registration/status');const item=r.requests.find(x=>x.username===state.regName);if(item){state.regStatus=item.status;state.regPhone=item.phone||'';state.regEmail=item.email||'';renderAuth();if(item.status==='approved')toast('Yêu cầu đã được phê duyệt!','ok');}else toast('Chưa tìm thấy yêu cầu.','error');}

// ==== Friends, messages and the member experience ====
let friendsRefreshTimer=0;
function scheduleFriendsRefresh(delay=500){
 clearTimeout(friendsRefreshTimer);
 friendsRefreshTimer=setTimeout(()=>refreshFriends(true).catch(()=>{}),delay);
}
async function refreshFriends(redraw=true){
  if(!state.user||state.user.is_admin)return;
  const owner=state.user.id;
  const [fr,bl]=await Promise.all([api('/api/friends'),api('/api/blocks')]);
  if(state.user?.id!==owner)return;
  state.friends=fr.friends;state.blocks=bl.users;
  const lostChat=state.selected && !state.friends.some(f=>f.other_id===state.selected&&f.state==='accepted');
  if(lostChat)state.selected=null;
  if(redraw){renderSideItems();if(lostChat||state.tab==='friends'||state.tab==='restricted'||state.tab==='settings'||state.tab==='archive')renderApp();else updateChatHeader();}
}
function chatContactName(f){return f.nickname||f.display_name||f.username;}
function friendItem(f){
  const active=state.selected===f.other_id&&state.tab==='messages';
  return `<button type="button" class="side-item ${active?'active':''}" data-act="open-chat"
    data-id="${f.other_id}" aria-current="${active?'true':'false'}"
    aria-label="Mở trò chuyện với ${esc(chatContactName(f))}">
   ${avatar(f.username,f.online,'',f.avatar_url)}<div class="grow"><span class="chat-pin-mini">${f.pinned?'📌 ':''}</span><div class="row between"><span class="name truncate">${esc(chatContactName(f))}</span>${f.unread?`<span class="badge-count">${f.unread}</span>`:''}</div>
   <div class="sub">${f.last_message?`${f.last_message.sender_id===state.user.id?'Bạn: ':''}${esc(short(f.last_message.body,30))}`:f.online?'Đang hoạt động':'Bắt đầu nhắn tin'}</div></div></button>`;
}
function sideBody(){
  const accepted=state.friends.filter(f=>f.state==='accepted'&&!f.restricted&&!f.archived);
  const pending=state.friends.filter(f=>f.state==='pending'&&f.requested_by!==state.user.id);
  const q=state.sideFilter||'';
  const normalized=q.toLocaleLowerCase('vi');
  const filtered=accepted.filter(x=>[chatContactName(x),x.display_name||x.username].some(name=>String(name||'').toLocaleLowerCase('vi').includes(normalized)));
  const visibleLimit=Math.max(60,Number(state.sidebarVisibleCount)||60);
  const visible=filtered.slice(0,visibleLimit);
  return `${pending.length?`<div class="side-label">Lời mời chờ · ${pending.length}</div>${pending.slice(0,3).map(f=>`<div class="side-item" data-act="app-tab" data-tab="friends">${avatar(f.username,false,'sm')}<div class="grow"><b>${esc(f.username)}</b><div class="sub">Muốn kết bạn với bạn</div></div></div>`).join('')}`:''}
  <div class="side-label">Cuộc trò chuyện · ${filtered.length}</div>
  ${filtered.length?visible.map(friendItem).join(''):`<div class="empty" style="padding:35px 12px;font-size:12px">${q?'Không tìm thấy hội thoại.':'Chưa có bạn bè nào. Hãy tìm và kết bạn!'}</div>`}
  ${visible.length<filtered.length?`<button class="side-more" type="button" data-act="sidebar-more">Xem thêm hội thoại · ${filtered.length-visible.length} còn lại</button>`:''}
  ${state.friends.some(f=>f.archived&&f.state==='accepted')?`<button class="side-archive-link" type="button" data-act="app-tab" data-tab="archive">${icon('archive',14)} Đã lưu trữ · ${state.friends.filter(f=>f.archived&&f.state==='accepted').length}</button>`:''}
  ${groupSideItems()}`;
}
function renderSideItems(){
 const box=$('#side-items');
 if(!box)return;
 const markup=sideBody();
 if(box.sidebarMarkup===markup)return;
 const top=box.scrollTop;
 box.sidebarMarkup=markup;
 box.innerHTML=markup;
 if(top)box.scrollTop=top;
}
function appRail(){
  const primary=[['messages','chat','Tin nhắn'],['groups','group','Nhóm chat'],['friends','users','Bạn bè'],['notices','bell','Thông báo'],['settings','settings','Cài đặt']];
  const secondary=[['restricted','shield','Danh sách hạn chế'],
    ['archive','archive','Đã lưu trữ'],['support','inbox','Hỗ trợ'],
    ...(state.worldData?.status?.open?[['world','group','Chat thế giới']]:[])];
  const moreOpen=!!state.railMoreOpen || secondary.some(([tab])=>state.tab===tab);
  const item=([tab,ic,label])=>`<button type="button" class="rail-btn ${state.tab===tab?'active':''}" title="${label}" aria-label="${label}" aria-current="${state.tab===tab?'page':'false'}" data-act="app-tab" data-tab="${tab}">
    <span class="rail-icon" aria-hidden="true">${icon(ic,20)}</span><span class="rail-text">${label}</span></button>`;
  return `<aside class="rail" aria-label="Thanh điều hướng mtunz">
    <button type="button" class="rail-home" data-act="app-tab" data-tab="messages" title="Về tin nhắn" aria-label="mtunz – về tin nhắn">
      <span class="logo-mark" aria-hidden="true">${brandGlyph()}</span><span class="rail-brand">mtunz<span class="brand-dot">.</span></span></button>
    <nav class="rail-nav" aria-label="Điều hướng chính">
      ${primary.map(item).join('')}
      <div class="rail-secondary">
        <button type="button" class="rail-btn rail-more ${moreOpen?'is-open':''}" data-act="rail-more" aria-controls="rail-more-items" aria-expanded="${moreOpen}" title="Các mục khác" aria-label="Các mục khác">
          <span class="rail-icon" aria-hidden="true">${icon('dots',20)}</span><span class="rail-text">Thêm</span><span class="rail-more-chevron" aria-hidden="true">${icon('chevron',14)}</span></button>
        <div id="rail-more-items" class="rail-extra ${moreOpen?'is-open':''}" ${moreOpen?'':'hidden'}>
          ${secondary.map(item).join('')}
          <button type="button" class="rail-btn rail-android-download" data-act="android-download" title="Tải ứng dụng Android" aria-label="Tải ứng dụng Android">
            <span class="rail-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v8m-3-3 3 3 3-3M10 19h4"/></svg></span><span class="rail-text">Tải Android</span></button>
        </div>
      </div>
    </nav>
    <div class="rail-foot">
      <button type="button" class="rail-account rail-profile-button ${state.tab==='profile'?'active':''}" data-act="app-tab" data-tab="profile" aria-label="Hồ sơ cá nhân">
        ${avatar(state.user.display_name||state.user.username,false,'sm',state.user.avatar_url)}<span class="rail-account-name"><strong>${esc(state.user.display_name||'Tài khoản của bạn')}</strong><small>Hồ sơ cá nhân</small></span>${icon('chevron',15)}
      </button>
      <button type="button" class="rail-btn rail-logout" data-act="logout" title="Đăng xuất tài khoản" aria-label="Đăng xuất tài khoản">
        <span class="rail-icon" aria-hidden="true">${icon('logout',19)}</span><span class="rail-text">Đăng xuất</span></button>
    </div>
  </aside>`;
}
function sideBar(){return `<aside class="side"><div class="side-top"><div class="row between"><h2>Tin nhắn <span style="color:var(--brand)">.</span></h2><button class="btn circle ghost" title="Tìm bạn bè" data-act="app-tab" data-tab="friends">${icon('add',19)}</button></div>
  <div class="field" style="margin-top:23px;margin-bottom:0"><input class="input" id="side-filter" placeholder="Tìm cuộc trò chuyện..." value="${esc(state.sideFilter||'')}" autocomplete="off"></div></div>
  <div class="side-scroll" id="side-items">${sideBody()}</div>
  <div class="side-bottom"><div class="row" style="font-size:11px;color:var(--muted)"><span class="dot"></span> Nhắn tin trực tiếp, không cần tải lại</div></div></aside>`;}
function memberHeader(title,subtitle,actions=''){
 return `<header class="main-head"><div class="grow"><h3>${title}</h3><div class="small muted">${subtitle}</div></div>${actions}</header>`;
}
function welcomeEmpty(){return `<div class="hero-empty"><div><div class="illustration">✦</div><h1>Đã kết nối, sẵn sàng trò chuyện.</h1>
 <p>Chọn một người bạn ở bên trái hoặc gửi lời mời kết bạn để bắt đầu cuộc trò chuyện đầu tiên.</p>
 <button class="btn primary" data-act="app-tab" data-tab="friends">${icon('add')} Tìm bạn bè</button></div></div>`;}
function friendLastActiveText(seconds,clock=Date.now()){
 const stamp=Number(seconds);
 if(!Number.isFinite(stamp)||stamp<=0)return '';
 const elapsed=Math.max(0,Math.floor(clock/1000-stamp));
 const exact=date(stamp);
 if(elapsed<60)return 'Vừa hoạt động · '+exact;
 if(elapsed<3600)return 'Hoạt động '+Math.floor(elapsed/60)+' phút trước · '+exact;
 if(elapsed<86400)return 'Hoạt động '+Math.floor(elapsed/3600)+' giờ trước · '+exact;
 return 'Hoạt động gần nhất: '+exact;
}
function convoHeader(f){if(!f)return '';
 return `<header class="main-head"><button class="btn circle ghost" data-act="back-to-list" title="Quay lại danh sách">${icon('back')}</button>
 ${avatar(f.username,f.online,'sm',f.avatar_url)}<div class="grow"><h3>${esc(chatContactName(f))}</h3><div class="small muted">${f.online?'<span class="dot"></span>Đang hoạt động':f.last_seen?`<span class="friend-last-active" data-last-seen="${Number(f.last_seen)}">${esc(friendLastActiveText(f.last_seen))}</span>`: ''}</div></div>
 <button type="button" class="btn ghost sm" data-chat-library aria-label="Nội dung đã chia sẻ" title="Nội dung đã chia sẻ">${icon('file',16)}</button>
 <button type="button" class="btn ghost sm" data-chat-nickname="${f.other_id}" title="Đặt biệt danh">${icon('edit',15)} <span class="button-word">Biệt danh</span></button>
 <button class="btn ghost sm" data-act="profile-view" data-id="${f.other_id}" title="Xem hồ sơ">${icon('users',15)}</button>
 <button class="btn ghost sm" data-act="search-chat" title="Tìm tin">${icon('search',15)}</button>
 <button type="button" class="btn ghost sm v6-disappear-control" data-v6-act="disappear"
   data-v6-peer="${f.other_id}" title="Cài đặt tự biến mất cho tin nhắn mới">⌛ <span class="button-word">${f.vanish_seconds?'Tự xóa '+(f.vanish_seconds===3600?'1 giờ':f.vanish_seconds===86400?'1 ngày':'7 ngày'):'Tự biến mất'}</span></button>
 <button type="button" class="btn ghost sm" data-v4-act="schedule-list" title="Tin nhắn hẹn giờ">⏰ <span class="button-word">Đã hẹn</span></button>
 <button class="btn ghost sm" data-act="call-audio" data-id="${f.other_id}" title="Gọi thoại">${icon('phone',15)}</button>
 <button class="btn ghost sm" data-act="call-video" data-id="${f.other_id}" title="Gọi video">${icon('video',15)}</button>
 <button class="btn ghost sm" data-act="mute-chat" data-id="${f.other_id}" title="${f.muted?'Bật':'Tắt'} thông báo">${icon('mute',15)}</button>
 <button class="btn ghost sm" data-act="pin-chat" data-id="${f.other_id}" title="${f.pinned?'Bỏ ghim':'Ghim'} hội thoại">${icon('check',15)} <span class="button-word">${f.pinned?'Bỏ ghim':'Ghim'}</span></button>
 <button class="btn ghost sm" data-act="archive-chat" data-id="${f.other_id}" title="${f.archived?'Bỏ lưu trữ':'Lưu trữ'} hội thoại">${icon('archive',15)}</button>
 <button class="btn ghost sm" data-act="chat-restrict" data-id="${f.other_id}" title="Hạn chế / bỏ hạn chế">${icon('shield',15)} <span class="button-word">${f.restricted?'Bỏ hạn chế':'Hạn chế'}</span></button>
 <button class="btn danger sm" data-act="chat-block" data-id="${f.other_id}" title="Chặn tài khoản">${icon('ban',15)} <span class="button-word">Chặn</span></button></header>`;}
function refreshFriendLastActiveLabel(){
 const node=document.querySelector('#chat-header .friend-last-active');
 if(!node||document.hidden)return;
 const label=friendLastActiveText(Number(node.dataset.lastSeen));
 if(label&&node.textContent!==label)node.textContent=label;
}
setInterval(refreshFriendLastActiveLabel,30000);
function updateChatHeader(){
 const f=state.friends.find(x=>x.other_id===state.selected);
 const chat=$('#chat-header');
 if(f&&state.tab==='messages'&&chat){
   const markup=convoHeader(f);
   if(chat.headerMarkup!==markup){
    const expanded=chat.querySelector('.chat-header-more')?.open;
    chat.headerMarkup=markup;
    chat.innerHTML=markup;
    if(expanded)chat.querySelector('.main-head').dataset.restoreMenu='true';
   }
 }
}
function renderBubbles(){return chatHistoryMarkup(state.messages,false);}
function conversation(){
 const f=state.friends.find(x=>x.other_id===state.selected&&x.state==='accepted');
 if(!f)return welcomeEmpty();
 return `<div class="conversation"><div id="chat-header">${convoHeader(f)}</div>
 <div class="thread" id="chat-messages" data-chat-key="dm-${f.other_id}">${renderBubbles()}</div>
 <div class="composer">${latestChatButton()}<div class="typing" id="typing-text"></div>${composerExtras()}<form class="compose-row" data-form="send-message">
 <label class="btn ghost attachment-button" title="Đính kèm ảnh, video hoặc tệp">${icon('paperclip',19)}<input class="upload-input" type="file" accept="image/*,video/mp4,video/webm,.pdf,.txt,.docx,.xlsx,.zip" hidden></label>
 <textarea class="input" name="body" id="chat-text" placeholder="Nhập tin nhắn của bạn..." maxlength="2000" rows="1">${typeof v4ReadDraft==='function'?esc(v4ReadDraft('dm',f.other_id)):''}</textarea>
 <button type="button" class="btn ghost v4-microphone" data-v4-act="record" title="Ghi tin nhắn thoại" aria-label="Ghi âm giọng nói">🎙️</button>
 <button type="button" class="btn ghost v4-schedule-button" data-v4-act="schedule-new" title="Hẹn giờ gửi tin nhắn" aria-label="Hẹn giờ gửi">⏰</button>
 <button type="submit" class="btn primary send" title="Gửi tin nhắn">${icon('send',20)}</button></form>
 <div class="hint" style="margin-top:7px;font-size:10px">Enter để gửi · Shift + Enter để xuống dòng</div></div></div>`;
}
async function openChat(uid){
 const f=state.friends.find(x=>x.other_id===uid&&x.state==='accepted');
 if(!f){toast('Chưa kết bạn hoặc tài khoản đã bị chặn.','error');return;}
 const thread=$('#chat-messages');
 if(state.selected===uid&&thread?.dataset.chatKey==='dm-'+uid&&thread.dataset.historyReady==='true'){
  settleChatEnd(thread);
  return;
 }
 state.selected=uid;state.groupSelected=null;state.tab='messages';
 state.messages=queuedDirectMessages(state.user.id,uid);
 state.replyTo=null;state.pendingAttachment=null;renderChatOpening();await loadMessages();
}
let dmLoadGeneration=0;
const directSendQueues=new Map();
let nextPendingMessageId=0;
function queuedDirectMessages(owner,recipient){
 return (directSendQueues.get(owner+':'+recipient)||[]).map(entry=>entry.message);
}
async function sendQueuedDirectMessages(key,queue){
 try{
  while(directSendQueues.get(key)===queue&&queue.length){
   const {payload,message,attachment}=queue[0];
   const {recipient_id:recipient}=payload,owner=message.sender_id;
   const active=()=>directSendQueues.get(key)===queue&&state.user?.id===owner;
   const inChat=()=>active()&&state.tab==='messages'&&state.selected===recipient;
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),20000);
   try{
    const result=await api('/api/messages',{method:'POST',data:payload,signal:controller.signal});
    if(inChat())appendDirectMessage({...result.message,client_message_id:payload.client_message_id});
    if(active())scheduleFriendsRefresh();
   }catch{
    if(!active())return;
    if(inChat()&&state.messages.some(m=>m.id>0&&m.client_message_id===payload.client_message_id))continue;
    v4FailedSends.set(message.id,{owner,recipient,payload,attachment,created_at:message.created_at,inFlight:false});
    if(inChat())appendDirectMessage({...message,pending:false,failed:true});
    else toast('Có tin nhắn chưa gửi được. Mở cuộc trò chuyện để gửi lại.','warning');
   }finally{
    clearTimeout(timeout);
    queue.shift();
   }
  }
 }finally{
  if(directSendQueues.get(key)===queue)directSendQueues.delete(key);
 }
}
function clearSentComposer(form,key){
 const field=form.querySelector('#chat-text');
 field.value='';
 field.dispatchEvent(new Event('input',{bubbles:true}));
 state.replyTo=null;state.pendingAttachment=null;
 v4WriteDraft(key,'');
 const extra=$('#compose-extra');
 if(extra)extra.innerHTML=composerExtras();
}
function chatNearEnd(box){return box.scrollHeight-box.clientHeight-box.scrollTop<145;}
let chatReadTimer=0;
const chatReadThrough=new Map();
function clearChatReads(){
 clearTimeout(chatReadTimer);chatReadTimer=0;chatReadThrough.clear();
}
function queueChatRead(box){
 if(!box?.isConnected||!state.user||document.visibilityState!=='visible'||!chatNearEnd(box))return;
 if(chatReadTimer)return;
 chatReadTimer=setTimeout(()=>{
  chatReadTimer=0;
  const owner=state.user?.id,group=state.tab==='groups',id=group?state.groupSelected:state.selected;
  const key=(group?'group-':'dm-')+id;
  if(!owner||!id||!box.isConnected||box.dataset.chatKey!==key||
     document.visibilityState!=='visible'||!chatNearEnd(box)){
   const next=$('#chat-messages');
   if(next!==box)queueChatRead(next);
   return;
  }
  const partial=box.dataset.moreAfter==='true';
  if(partial&&box.scrollHeight-box.clientHeight-box.scrollTop>2)return;
  const rows=group?state.groupMessages:state.messages;
  const latest=rows.reduce((max,m)=>m.sender_id!==owner&&!m.deleted_at?Math.max(max,m.id):max,0);
  const accountKey=owner+':'+key;
  if(latest<=(chatReadThrough.get(accountKey)||0))return;
  if(chatReadThrough.size>=256&&!chatReadThrough.has(accountKey))chatReadThrough.delete(chatReadThrough.keys().next().value);
  chatReadThrough.set(accountKey,latest);
  const path=group?'/api/groups/'+id+'/read':'/api/messages/read/'+id;
  post(path+'?up_to='+latest).then(()=>{
   if(state.user?.id!==owner||chatReadThrough.get(accountKey)!==latest||!box.isConnected)return;
   const current=group?state.groupMessages:state.messages;
   if(current.some(m=>m.sender_id!==owner&&m.id>latest))return;
   const item=group?state.groups.find(g=>g.id===id):state.friends.find(f=>f.other_id===id);
   if(partial){if(group)scheduleGroupsRefresh(0);else scheduleFriendsRefresh(0);}
   else if(item?.unread){item.unread=0;renderSideItems();}
  }).catch(()=>{
   if(chatReadThrough.get(accountKey)===latest)chatReadThrough.delete(accountKey);
  });
 },160);
}
function updateLatestButton(box){
 const button=box.parentElement.querySelector('.chat-latest');
 if(button)button.hidden=box.dataset.moreAfter!=='true'&&chatNearEnd(box);
}
function latestChatButton(){
 return '<button type="button" class="chat-latest" data-act="chat-latest" aria-label="Về tin nhắn mới nhất" hidden>'+icon('chevron',15)+' Tin mới nhất</button>';
}

function chatHistoryMarkup(rows,group){
 const older=rows.filter(message=>message.id>0).length>=70;
 return (older?'<button class="btn ghost sm chat-older" type="button" data-act="chat-older">Tải tin nhắn cũ hơn</button>':'')+
   bubblesFor(rows,group);
}
async function loadOlderChat(box=$('#chat-messages')){
 if(!box||box.dataset.loadingOlder||box.dataset.historyDone||!box.querySelector('.chat-older'))return;
 const group=state.tab==='groups',id=group?state.groupSelected:state.selected,owner=state.user?.id;
 if(!id||!owner)return;
 const rows=()=>group?state.groupMessages:state.messages;
 const first=rows().find(message=>message.id>0);
 if(!first)return;
 const path=group?'/api/groups/'+id+'/messages':'/api/messages/'+id;
 const button=box.querySelector('.chat-older');
 box.dataset.loadingOlder='true';button.disabled=true;button.textContent='Đang tải…';
 try{
  const page=await api(path+'?before='+first.id);
  if(!box.isConnected||state.user?.id!==owner||box!==$('#chat-messages'))return;
  const current=rows(),ids=new Set(current.map(message=>message.id));
  const older=page.messages.filter(message=>!ids.has(message.id));
  if(page.messages.length<70||!older.length)box.dataset.historyDone='true';
  if(older.length){
   const anchor=document.getElementById('msg-'+(group?'group':'dm')+'-'+first.id);
   const anchorTop=anchor?.getBoundingClientRect().top;
   const top=box.scrollTop,height=box.scrollHeight;
   pauseChatFollow(box);
   box.dataset.expandedHistory='true';
   if(group)state.groupMessages=[...older,...current];
   else state.messages=[...older,...current];
   box.innerHTML=chatHistoryMarkup(rows(),group);
   paintChatMarkers(box);
   if(box.dataset.historyDone)box.querySelector('.chat-older')?.remove();
   const next=document.getElementById('msg-'+(group?'group':'dm')+'-'+first.id);
   box.scrollTop=top+(next&&anchorTop!==undefined?next.getBoundingClientRect().top-anchorTop:box.scrollHeight-height);
   updateLatestButton(box);
  }
 }catch(error){if(box.isConnected)toast(error.message,'error');}
 finally{
  delete box.dataset.loadingOlder;
  const control=box.querySelector('.chat-older');
  if(box.dataset.historyDone)control?.remove();
  else if(control){control.disabled=false;control.textContent='Tải tin nhắn cũ hơn';}
 }
}
const chatEndGeometry=new WeakMap();
const chatEndSettling=new WeakMap();
function followingChatEnd(box){
 return box.dataset.followChatEnd==='true'||chatNearEnd(box);
}
function followChatEnd(box){
 if(!box)return;
 box.dataset.followChatEnd='true';
 const height=box.scrollHeight,viewport=box.clientHeight;
 const end=Math.max(0,height-viewport);
 chatEndGeometry.set(box,{height,viewport,end});
 if(Math.abs(box.scrollTop-end)>1)box.scrollTo({top:end,behavior:'instant'});
 updateLatestButton(box);
 queueChatRead(box);
}
function pauseChatFollow(box){
 if(!box)return;
 box.dataset.followChatEnd='false';
 chatEndSettling.delete(box);
 delete box.dataset.positioningChat;
 delete box.dataset.openingChat;
}
function settleChatEnd(box){
 const settle={};
 chatEndSettling.set(box,settle);
 box.dataset.positioningChat='true';
 followChatEnd(box);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(box.isConnected&&chatEndSettling.get(box)===settle)followChatEnd(box);
 }));
 setTimeout(()=>{
  if(!box.isConnected||chatEndSettling.get(box)!==settle)return;
  followChatEnd(box);
  chatEndSettling.delete(box);
  delete box.dataset.positioningChat;
 },250);
}
function renderChatOpening(){
 renderApp();
 const box=$('#chat-messages');
 if(!box)return;
 box.dataset.openingChat='true';
 settleChatEnd(box);
}
function applyChatHistoryPosition(){
 const box=$('#chat-messages');
 if(!box)return false;
 const opening=box.dataset.openingChat==='true';
 delete box.dataset.openingChat;
 box.dataset.historyReady='true';
 return opening;
}
document.addEventListener('scroll',event=>{
 const box=event.target;
 if(box.id!=='chat-messages')return;
 if(box.dataset.positioningChat){followChatEnd(box);return;}
 const previous=chatEndGeometry.get(box);
 // A queued scroll event at the old bottom can arrive after a layout change.
 // If the position itself moved away from that bottom, leave the reader there.
 const height=box.scrollHeight,viewport=box.clientHeight;
 const oldBottom=previous&&Math.min(previous.end,Math.max(0,height-viewport));
 if(box.dataset.followChatEnd==='true'&&previous&&Math.abs(box.scrollTop-oldBottom)<=2&&
    (previous.height!==height||previous.viewport!==viewport)){
  followChatEnd(box);
  return;
 }
 box.dataset.followChatEnd=String(chatNearEnd(box));
 if(box.scrollTop<65&&box.scrollHeight>box.clientHeight+2)void loadOlderChat(box);
 updateLatestButton(box);
 queueChatRead(box);
},true);
document.addEventListener('visibilitychange',()=>queueChatRead($('#chat-messages')));
for(const eventName of ['wheel','touchmove']){
 document.addEventListener(eventName,event=>{
  pauseChatFollow(event.target.closest?.('#chat-messages'));
 },{capture:true,passive:true});
}
document.addEventListener('pointerdown',event=>{
 const box=event.target;
 if(box.id==='chat-messages'&&event.offsetX>=box.clientWidth)pauseChatFollow(box);
},true);
document.addEventListener('keydown',event=>{
 if(['ArrowUp','PageUp','Home'].includes(event.key))pauseChatFollow(event.target.closest?.('#chat-messages'));
},true);
document.addEventListener('load',event=>{
 const box=event.target.closest?.('#chat-messages');
 if(box?.dataset.followChatEnd==='true')followChatEnd(box);
},true);
function captureThreadPosition(box,follow=followingChatEnd(box),changingRow=null){
 if(follow)return {follow:true};
 const top=box.scrollTop,bounds=box.getBoundingClientRect();
 const rows=box.querySelectorAll('.bubble-wrap');
 let low=0,high=rows.length;
 while(low<high){
  const middle=(low+high)>>1;
  if(rows[middle].getBoundingClientRect().bottom<=bounds.top)low=middle+1;
  else high=middle;
 }
 const first=rows[low];
 const anchor=first&&first===changingRow&&first.getBoundingClientRect().top<bounds.top?rows[low+1]||first:first;
 return {top,id:anchor?.id,offset:anchor?.getBoundingClientRect().top-bounds.top};
}
function captureMutationPosition(box,changingRow=null){
 return captureThreadPosition(box,box.scrollHeight-box.clientHeight-box.scrollTop<=2,changingRow);
}
function restoreThreadPosition(box,position){
 if(position.follow){followChatEnd(box);return;}
 const anchor=position.id&&document.getElementById(position.id);
 const top=anchor&&box.contains(anchor)?
  box.scrollTop+anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-position.offset:position.top;
 box.scrollTo({top,behavior:'instant'});
 updateLatestButton(box);
}
function paintChatThread(box,markup,scroll){
 const position=scroll?null:captureThreadPosition(box);
 box.innerHTML=markup;
 paintChatMarkers(box);
 if(box.dataset.historyDone)box.querySelector('.chat-older')?.remove();
 if(scroll)settleChatEnd(box);
 else restoreThreadPosition(box,position);
}
function renderMessageThread(scroll=false){
 const box=$('#chat-messages');
 if(box)paintChatThread(box,renderBubbles(),scroll);
}
function patchThreadRow(box,message,previous,messages,scope,replaceId,redraw){
 const position=captureThreadPosition(box);
 const template=document.createElement('template');
 template.innerHTML=bubblesFor([message],scope==='group',messages);
 const row=template.content.querySelector('.bubble-wrap');
 if(!row){redraw();return;}
 if(replaceId!==null){
   const existing=document.getElementById('msg-'+scope+'-'+replaceId);
   if(!existing||!box.contains(existing)){redraw();return;}
   existing.replaceWith(row);
 }else{
   box.querySelector('.empty')?.remove();
   if(!previous||dayFormatter.format(previous.created_at*1000)!==dayFormatter.format(message.created_at*1000)){
     box.append(template.content.querySelector('.day-label'));
   }
   box.append(row);
 }
 restoreThreadPosition(box,position);
}
function appendDirectMessage(message,reveal=false){
 if(!message||!state.selected||state.tab!=='messages')return;
 if(![message.sender_id,message.recipient_id].includes(state.selected)||$('#chat-messages')?.dataset.moreAfter==='true')return;
 const nonce=message.client_message_id;
 const currentIndex=state.messages.findIndex(x=>x.id===message.id||
   (nonce&&x.id<0&&x.client_message_id===nonce&&x.sender_id===message.sender_id));
 const replaced=state.messages[currentIndex];
 if(replaced?.id===message.id&&message.id>0)return;
 if(replaced?.id<0&&message.id>0)v4FailedSends.delete(replaced.id);
 const previous=state.messages[state.messages.length-1];
 if(currentIndex>=0)state.messages[currentIndex]=message;
 else state.messages.push(message);
 const box=$('#chat-messages');
 if(box){
   const index=currentIndex<0?state.messages.length-1:currentIndex;
   const before=state.messages[index-1],after=state.messages[index+1];
   if((before&&compareChatMessages(before,message)>0)||(after&&compareChatMessages(message,after)>0)){
    state.messages.sort(compareChatMessages);
    renderMessageThread(false);
   }else patchThreadRow(box,message,previous,state.messages,'dm',replaced?.id??null,renderMessageThread);
 }
 if(state.messages.length>110&&!box?.dataset.expandedHistory){
   state.messages.splice(0,state.messages.length-100);
   renderMessageThread(false);
 }
 // Composer and attachment layout can finish after the new row has been added.
 if(reveal&&box)settleChatEnd(box);
 if(message.sender_id!==state.user?.id)queueChatRead(box);
}
function compareChatMessages(a,b){
 if(a.id>0&&b.id>0)return a.id-b.id;
 return (a.id<0)-(b.id<0)||b.id-a.id;
}
async function loadMessages(scroll=true){
 const friend=state.selected;if(!friend||$('#chat-messages')?.dataset.moreAfter==='true')return;
 const seq=++dmLoadGeneration,userId=state.user?.id;
 const existing=new Map(state.messages.map(m=>[m.id,{message:m,read:m.read_at,delivered:m.delivered_at}]));
 const current=()=>seq===dmLoadGeneration&&state.selected===friend&&state.tab==='messages'&&state.user?.id===userId;
 try{
  const box=$('#chat-messages');
  const path='/api/messages/'+friend;
  let r=await api(path+(box?.dataset.historyReady==='true'?'?latest=1':''));
  if(!current())return;
  if(box?.dataset.openingChat==='true'&&r.first_unread_id&&!r.messages.some(m=>m.id===r.first_unread_id))r=await api(path+'?unread_window=1');
  if(!current())return;
  const known=new Map(state.messages.filter(m=>m.id>0).map(m=>[m.id,m]));
  for(const message of r.messages){
   const realtime=known.get(message.id);
   const prior=existing.get(message.id);
   if(realtime&&!prior)continue;
   if(realtime&&prior)mergeThreadUpdate(message,realtime,prior.message);
   if(realtime&&prior&&(realtime.read_at||0)>(prior.read||0))message.read_at=Math.max(message.read_at||0,realtime.read_at);
   if(realtime&&prior&&(realtime.delivered_at||0)>(prior.delivered||0))
    message.delivered_at=Math.max(message.delivered_at||0,realtime.delivered_at);
   known.set(message.id,message);
  }
  const failed=(typeof v4FailedSends==='object'?[...v4FailedSends.entries()]
    .filter(([,entry])=>entry.owner===userId&&entry.recipient===friend)
    .map(([id,entry])=>({id,sender_id:state.user.id,recipient_id:friend,body:entry.payload.body,
          created_at:entry.created_at,failed:true,pending:false,
          attachment:entry.attachment||null,reactions:[],client_message_id:entry.payload.client_message_id})):[]);
  const confirmed=new Set([...known.values()].map(message=>message.client_message_id).filter(Boolean));
  for(const message of failed)if(confirmed.has(message.client_message_id))v4FailedSends.delete(message.id);
  const pending=queuedDirectMessages(userId,friend).filter(m=>!v4FailedSends.has(m.id));
  const local=[...failed,...pending].filter(m=>!confirmed.has(m.client_message_id));
  const merged=[...known.values(),...local].sort(compareChatMessages);
  state.messages=$('#chat-messages')?.dataset.expandedHistory?merged:merged.slice(-100);
  const opening=applyChatHistoryPosition();
  finishChatHistory($('#chat-messages'),r,opening,scroll,renderMessageThread);
  const inbound=[...r.messages].reverse().find(m=>m.sender_id===friend);
  if(inbound&&typeof v4AckIncoming==='function')v4AckIncoming(inbound);
  queueChatRead($('#chat-messages'));
 }catch(e){if(current())toast(e.message,'error');}
}
function personResult(r){return `<div class="people-row">${avatar(r.username,false,'',r.avatar_url)}<div class="grow"><b>${esc(r.username)} ${r.private_profile?'🔒':''}</b><div class="small muted">ID #${Number(r.public_id||r.id)} · ${r.friend_state==='accepted'?'Đã là bạn bè':r.friend_state==='pending'?r.requested_by_me?'Đã gửi lời mời':'Đã nhận lời mời':'Có thể gửi lời mời kết bạn'}</div></div>
 ${r.friend_state==='none'?`<button class="btn primary sm" data-act="friend-request" data-id="${r.id}">${icon('add',15)} Kết bạn</button>`:
 r.friend_state==='pending'&&!r.requested_by_me?`<button class="btn success sm" data-act="friend-accept" data-id="${r.id}">${icon('check',15)} Chấp nhận</button>`:
 r.friend_state==='accepted'?`<button class="btn ghost sm" data-act="open-chat" data-id="${r.id}">Nhắn tin</button>`:'<span class="pill">Chờ duyệt</span>'}
 ${r.friend_state==='none'?`<button type="button" class="btn ghost sm" data-social-request="${r.id}" data-social-name="${esc(r.username)}">Nhắn tin chờ</button>`:''}
 <button type="button" class="btn ghost sm" data-world-report-user="${Number(r.id)}" title="Báo cáo tài khoản">${icon('shield',14)} Báo cáo</button></div>`;}
function friendsContent(){
 const pending=state.friends.filter(f=>f.state==='pending'&&f.requested_by!==state.user.id);
 const sent=state.friends.filter(f=>f.state==='pending'&&f.requested_by===state.user.id);
 const accepted=state.friends.filter(f=>f.state==='accepted');
 return `<div class="section-wrap"><span class="eyebrow">CỘNG ĐỒNG CỦA BẠN</span><h1 class="section-title">Bạn bè & kết nối</h1>
 <p class="section-lead">Tìm kiếm tài khoản, quản lý lời mời và bắt đầu nhắn tin.</p>
 ${typeof messageRequestsPanel==='function'?messageRequestsPanel():''}
 <div class="card"><h3>${icon('search',17)} Tìm người dùng</h3><form data-form="search-people" class="row" style="margin-top:15px"><input class="input grow" name="q" id="person-search" value="${esc(state.peopleQuery||'')}" placeholder="Tên tài khoản hoặc UID" required minlength="1"><button class="btn primary">Tìm kiếm</button></form>
 ${(state.peopleResults||[]).map(personResult).join('')||((state.peopleQuery)?'<div class="hint" style="margin-top:16px">Không có kết quả phù hợp.</div>':'')}</div>
 ${pending.length?`<h3 style="margin:28px 0 12px">Lời mời kết bạn (${pending.length})</h3>${pending.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Đang chờ bạn xác nhận</div></div><button class="btn success sm" data-act="friend-accept" data-id="${f.other_id}">Chấp nhận</button><button class="btn ghost sm" data-act="friend-remove" data-id="${f.other_id}">Từ chối</button></div>`).join('')}`:''}
 ${sent.length?`<h3 style="margin:28px 0 12px">Lời mời đã gửi (${sent.length})</h3>${sent.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Đang chờ phản hồi</div></div><button class="btn ghost sm" data-act="friend-remove" data-id="${f.other_id}">Thu hồi</button></div>`).join('')}`:''}
 <h3 style="margin:28px 0 12px">Bạn bè (${accepted.length})</h3>
 ${accepted.length?accepted.map(f=>`<div class="people-row">${avatar(f.username,f.online)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">${f.restricted?'Đang ở danh sách hạn chế':f.online?'Đang hoạt động':'Ngoại tuyến'}</div></div>
 <button class="btn ghost sm" data-act="open-chat" data-id="${f.other_id}">${icon('chat',15)} Nhắn tin</button><button type="button" class="btn ghost sm" data-world-report-user="${f.other_id}">${icon('shield',14)} Báo cáo</button><button class="btn danger sm" data-act="friend-remove" data-id="${f.other_id}">Hủy kết bạn</button></div>`).join(''):'<div class="empty">Chưa có bạn bè nào.</div>'}</div>`;
}
function archiveContent(){
 const archived=state.friends.filter(f=>f.state==='accepted'&&f.archived);
 return `<div class="section-wrap"><span class="eyebrow">TIN NHẮN ĐÃ CẤT GIỮ</span>
 <h1 class="section-title">Hội thoại lưu trữ</h1>
 <p class="section-lead">Ẩn cuộc trò chuyện khỏi hộp thư chính nhưng không xóa tin nhắn. Có thể mở lại bất cứ lúc nào.</p>
 ${archived.length?archived.map(f=>`<div class="people-row">${avatar(f.username,false,'sm',f.avatar_url)}
 <div class="grow"><strong>${esc(chatContactName(f))}</strong>
 <div class="hint">${f.last_message?esc(short(f.last_message.body||'Tin nhắn đính kèm',70)):'Chưa có tin nhắn'} ${f.pinned?'· 📌 Đã ghim':''}</div></div>
 <button class="btn ghost sm" data-act="open-chat" data-id="${f.other_id}">Xem</button>
 <button class="btn ghost sm" data-act="archive-chat" data-id="${f.other_id}">Bỏ lưu trữ</button></div>`).join(''):'<div class="empty">Chưa có hội thoại nào được lưu trữ.</div>'}</div>`;
}
function restrictedContent(){const rs=state.friends.filter(f=>f.state==='accepted'&&f.restricted);
 return `<div class="section-wrap"><span class="eyebrow">KHÔNG GIAN RIÊNG</span><h1 class="section-title">Người dùng bị hạn chế</h1>
 <p class="section-lead">Các cuộc trò chuyện bị hạn chế sẽ được ẩn khỏi hộp thư chính; trạng thái trực tuyến và xác nhận đã xem của bạn không hiển thị với họ.</p>
 ${rs.length?rs.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Cuộc trò chuyện đã được ẩn</div></div>
 <button class="btn ghost sm" data-act="open-chat" data-id="${f.other_id}">Xem tin nhắn</button><button class="btn success sm" data-act="chat-restrict" data-id="${f.other_id}">Bỏ hạn chế</button></div>`).join(''):'<div class="empty">Chưa có người dùng nào bị hạn chế.</div>'}</div>`;}
function profileContent(){return memberProfilePage();}
function settingsContent(){
 return `<div class="section-wrap"><span class="eyebrow">TÀI KHOẢN CỦA BẠN</span><h1 class="section-title">Cài đặt & bảo mật</h1>
 <p class="section-lead">Chỉ quản lý bảo mật, thiết bị và quyền truy cập. Hồ sơ công khai và liên hệ đã được chuyển sang mục riêng.</p>
 <section class="card rail-settings-shortcuts" aria-label="Lối tắt tài khoản">
   <h3>${icon('grid',17)} Tiện ích khác</h3>
   <p class="hint">Các thiết lập và hành động bảo mật được phân nhóm để dễ tìm. Hồ sơ nằm ở lối tắt trên Đăng xuất.</p>
   <div class="rail-settings-actions">
     <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="restricted">${icon('shield',16)} Danh sách hạn chế</button>
     <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="support">${icon('inbox',16)} Trung tâm hỗ trợ</button>
     <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="world">${icon('group',16)} Lịch sử Chat thế giới</button>
     <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="archive">${icon('archive',16)} Hội thoại đã lưu trữ</button>
     <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="world">${icon('group',16)} Chat thế giới</button>
     <button class="btn ghost sm" type="button" data-act="logout">${icon('logout',16)} Đăng xuất</button>
   </div>
 </section>
 ${typeof worldPenaltyCard==='function'?worldPenaltyCard():''}
 ${typeof sessionSecuritySettings==='function'?sessionSecuritySettings():''}
 <div class="setting-grid"><section class="card"><h3>${icon('lock',17)} Đổi mã PIN</h3>
 <form data-form="settings-pin">${secureSettingsField('PIN hiện tại','old_pin','password','','inputmode="numeric" required')}
 <div class="field"><label>Độ dài PIN mới</label><select class="select" name="pin_length"><option value="4" ${state.user.pin_length===4?'selected':''}>4 chữ số</option><option value="5" ${state.user.pin_length===5?'selected':''}>5 chữ số</option><option value="6" ${state.user.pin_length===6?'selected':''}>6 chữ số</option></select></div>
 ${secureSettingsField('PIN mới','new_pin','password','','inputmode="numeric" minlength="4" maxlength="6"')}
 <button class="btn primary full">Cập nhật mã PIN</button></form></section>
 <section class="card"><h3>${icon('shield',17)} Đổi mật khẩu</h3><p class="hint">Mật khẩu mới nên khác hoàn toàn mật khẩu cũ.</p>
 <form data-form="settings-password">${secureSettingsField('Mật khẩu hiện tại','old_password','password','')}
 ${secureSettingsField('Mật khẩu mới','new_password','password','','minlength="10"')}
 <button class="btn primary full">Đổi mật khẩu</button></form></section>
 <section class="card"><h3>${icon('ban',17)} Danh sách đã chặn</h3><p class="hint">Người bị chặn không thể kết bạn hoặc nhắn tin với bạn.</p>
 ${state.blocks.length?state.blocks.map(b=>`<div class="row between" style="margin:12px 0"><b>${esc(b.username)}</b><button class="btn ghost sm" data-act="unblock" data-id="${b.id}">Bỏ chặn</button></div>`).join(''):'<div class="hint" style="margin-top:19px">Chưa có tài khoản bị chặn.</div>'}</section>
 <section class="card"><h3>${icon('announce',17)} Thông báo hệ thống</h3><div id="notifications-list"><div class="hint" style="margin-top:15px">Chọn mục này để xem thông báo.</div></div><button class="btn ghost sm" data-act="load-notifications" style="margin-top:15px">Xem thông báo</button></section>
 </div>
 <section class="card account-delete-zone" aria-label="Lịch xóa tài khoản">
   <div><h3>${icon('ban',18)} Xóa tài khoản và dữ liệu</h3>
   ${state.accountDeletion?.pending?`<p class="hint" style="margin:12px 0">Yêu cầu xóa đã được ghi nhận. Dữ liệu sẽ bị xóa vĩnh viễn sau <b>${deadlineDate(state.accountDeletion.purge_at)}</b> (giờ hiển thị theo máy bạn), còn khoảng <b>${daysUntil(state.accountDeletion.purge_at)} ngày</b>. Bạn có thể hủy trước thời điểm này.</p>
     <span class="pill warn">Đang trong thời gian chờ xóa</span>`:
   `<p class="hint" style="margin:12px 0">Bạn có thể yêu cầu xóa tài khoản và hủy yêu cầu trong vòng <b>3 ngày</b>. Sau thời hạn này, tài khoản, tin nhắn và tệp sẽ bị xóa vĩnh viễn. Một số trường hợp có thể được xử lý xóa sớm hơn.</p>`}</div>
   ${state.accountDeletion?.pending?
     `<button class="btn success" type="button" data-act="cancel-own-deletion">${icon('check',16)} Hủy yêu cầu xóa tài khoản</button>`:
     `<button class="btn danger" type="button" data-act="delete-own-account">${icon('ban',16)} Yêu cầu xóa sau 3 ngày</button>`}
 </section>
 </div>`;
}
function supportInApp(){return `<div class="section-wrap"><span class="eyebrow">LIÊN HỆ HỖ TRỢ</span><h1 class="section-title">Trò chuyện với admin</h1><p class="section-lead">Gửi câu hỏi và nhận phản hồi realtime từ quản trị viên.</p><div class="card" style="max-width:620px">${authSupport()}</div></div>`;}
function worldComingSoon(){
 return `<div class="main-body world-preview-page">
  <section class="world-preview-shell" aria-labelledby="world-preview-title">
   <div class="world-preview-topline">
    <div class="world-preview-crumb">${icon('grid',15)} <span>MTUNZ</span> <span class="world-preview-crumb-separator">/</span> <strong>KHÔNG GIAN CỘNG ĐỒNG</strong></div>
    <span class="world-preview-status"><span class="world-preview-status-dot" aria-hidden="true"></span> ĐANG LÊN Ý TƯỞNG</span>
   </div>
   <div class="world-preview-hero">
    <div class="world-preview-copy">
     <div class="world-preview-eyebrow"><span class="world-preview-eyebrow-line" aria-hidden="true"></span> TƯƠNG LAI CỦA MTUNZ</div>
     <h1 id="world-preview-title">Chat thế giới<span>Không gian mới.<br><em>Kết nối không giới hạn.</em></span></h1>
     <p class="world-preview-description">Không gian cộng đồng của mtunz đang chờ quản trị viên mở truy cập. Hệ thống kiểm duyệt và chống spam đã được chuẩn bị; khi mở, bạn có thể tham gia an toàn.</p>
     <div class="world-preview-announcement" role="status">
      <span class="world-preview-announcement-icon" aria-hidden="true">${icon('clock',20)}</span>
      <div><strong>Coming soon · Chưa mở truy cập</strong><span>Quản trị viên sẽ thông báo khi Chat thế giới chính thức được mở.</span></div>
     </div>
     <div class="world-preview-actions">
      <button type="button" class="world-preview-action-primary" data-act="app-tab" data-tab="messages">${icon('chat',18)} <span>Về tin nhắn</span> ${icon('chevron',16)}</button>
      <button type="button" class="world-preview-action-secondary" data-act="app-tab" data-tab="groups">${icon('users',18)} <span>Khám phá nhóm riêng</span></button>
     </div>
    </div>
    <div class="world-preview-visual" aria-hidden="true">
     <div class="world-preview-visual-grid"></div>
     <div class="world-preview-orbit world-preview-orbit-outside"></div>
     <div class="world-preview-orbit world-preview-orbit-middle"></div>
     <div class="world-preview-orbit world-preview-orbit-inside"></div>
     <div class="world-preview-planet-dot world-preview-planet-dot-one"></div>
     <div class="world-preview-planet-dot world-preview-planet-dot-two"></div>
     <div class="world-preview-planet-dot world-preview-planet-dot-three"></div>
     <div class="world-preview-center">
      <div class="world-preview-center-symbol">${icon('users',39)}</div>
      <strong>mtunz<span>.</span></strong>
      <small>BEYOND YOUR CIRCLE</small>
     </div>
     <div class="world-preview-floating world-preview-floating-top">${icon('chat',15)} <span>MỘT THẾ GIỚI MỞ</span></div>
     <div class="world-preview-floating world-preview-floating-bottom">${icon('shield',15)} <span>KẾT NỐI CÓ TRÁCH NHIỆM</span></div>
     <div class="world-preview-visual-caption">A NEW SPACE FOR CONNECTION</div>
    </div>
   </div>
   <div class="world-preview-lower">
    <div class="world-preview-section-heading"><span>KHÁM PHÁ Ý TƯỞNG</span><div aria-hidden="true"></div><span>01 — 03</span></div>
    <div class="world-preview-features">
     <article class="world-preview-feature">
      <div class="world-preview-feature-icon">${icon('users',19)}</div>
      <h2>Cộng đồng rộng mở</h2>
      <p>Hướng tới trải nghiệm kết nối vượt ra ngoài những cuộc trò chuyện cá nhân.</p>
     </article>
     <article class="world-preview-feature">
      <div class="world-preview-feature-icon">${icon('shield',19)}</div>
      <h2>Ưu tiên an toàn</h2>
      <p>Quyền riêng tư và cách quản lý cộng đồng sẽ được cân nhắc ngay khi thiết kế.</p>
     </article>
     <article class="world-preview-feature">
      <div class="world-preview-feature-icon">${icon('chat',19)}</div>
      <h2>Mang chất riêng mtunz</h2>
      <p>Một không gian được phát triển theo bản sắc mtunz, không sao chép ứng dụng khác.</p>
     </article>
    </div>
    <div class="world-preview-disclaimer">${icon('lock',15)} <span>Đây là trang chờ mở cửa. Quyền kích hoạt và thời gian hoạt động do quản trị viên quyết định.</span></div>
   </div>
  </section>
 </div>`;
}
function renderApp(){
 abortStaleWorkflowUpload();
 const oldThread=$('#chat-messages');
 const previousKey=oldThread?.dataset.chatKey;
 const opening=oldThread?.dataset.openingChat==='true';
 const ready=oldThread?.dataset.historyReady==='true';
 const position=oldThread?captureThreadPosition(oldThread):null;
 const isChat=state.tab==='messages'&&state.selected;
 const screen=state.tab==='messages'?conversation():
  state.tab==='groups'?(state.groupSelected?groupConversation():groupLobby()):
  state.tab==='world'?(typeof worldPage==='function'?worldPage():worldComingSoon()):
  state.tab==='notices'?`${memberHeader('Thông báo','Hoạt động mới nhất')} ${notificationsContent()}`:
  state.tab==='archive'?`${memberHeader('Lưu trữ','Tin nhắn được cất giữ an toàn')}<div class="main-body">${archiveContent()}</div>`:
  state.tab==='friends'?`${memberHeader('Bạn bè','Quản lý các kết nối của bạn') }<div class="main-body">${friendsContent()}</div>`:
  state.tab==='restricted'?`${memberHeader('Danh sách hạn chế','Ưu tiên sự riêng tư') }<div class="main-body">${restrictedContent()}</div>`:
  state.tab==='profile'?`${memberHeader('Hồ sơ cá nhân','Thông tin của bạn') }<div class="main-body">${profileContent()}</div>`:
  state.tab==='settings'?`${memberHeader('Cài đặt','Bảo mật và tùy chọn hệ thống') }<div class="main-body">${settingsContent()}</div>`:
  `${memberHeader('Trung tâm hỗ trợ','Kết nối trực tiếp với quản trị viên')}<div class="main-body">${supportInApp()}</div>`;
 const activeMain=state.tab!=='messages'||Boolean(isChat);
 root().innerHTML=`<div class="shell ${activeMain?'chat-open':''} ${state.tab==='world'?'world-mode':''}">${appRail()}${sideBar()}<main class="main">${screen}</main></div>`;
 const sidebar=$('#side-items');
 if(sidebar)sidebar.sidebarMarkup=sidebar.innerHTML;
 const header=$('#chat-header');
 if(header)header.headerMarkup=convoHeader(state.friends.find(f=>f.other_id===state.selected));
 saveCurrentView();
 const thread=$('#chat-messages');
 if(thread){
  const same=thread.dataset.chatKey===previousKey;
  if(same&&opening)thread.dataset.openingChat='true';
  if(same&&ready)thread.dataset.historyReady='true';
  if(same){
   for(const key of ['firstUnread','moreAfter'])if(oldThread.dataset[key])thread.dataset[key]=oldThread.dataset[key];
   paintChatMarkers(thread);
  }
  if(same&&oldThread.dataset.expandedHistory)thread.dataset.expandedHistory='true';
  if(same&&oldThread.dataset.historyDone){
   thread.dataset.historyDone='true';
   thread.querySelector('.chat-older')?.remove();
  }
  if(same&&!opening&&!position.follow){
   pauseChatFollow(thread);
   restoreThreadPosition(thread,position);
  }else followChatEnd(thread);
 }
 if(state.tab==='support'&&state.supportTicket){const el=$('#support-list');if(el)el.scrollTop=el.scrollHeight;}
}
let memberTabRequest=0;
async function goTab(tab){
 const request=++memberTabRequest,user=state.user?.id;
 const current=()=>request===memberTabRequest&&state.user?.id===user&&state.tab===tab&&!state.selected&&!state.groupSelected;
 state.tab=tab;state.selected=null;state.groupSelected=null;state.replyTo=null;state.pendingAttachment=null;
 if(tab==='support'){state.mode='support';}
 renderApp();
 try{
  switch(tab){
   case 'settings':{
    const [deletion]=await Promise.all([api('/api/me/deletion'),loadWorldStatus().catch(()=>{})]);
    if(current())state.accountDeletion=deletion;
    break;
   }
   case 'world':await loadWorld(false);break;
   case 'friends':await loadMessageRequests(false);break;
   case 'groups':await refreshGroups(false);break;
   case 'notices':await loadNotices();break;
   case 'support':await loadTickets();break;
   default:return;
  }
  if(current()){
   const wasTyping=document.activeElement?.closest?.('.main input,.main textarea,.main select');
   if(!wasTyping)renderApp();
  }
 }catch(error){if(current())toast(error.message,'error');}
}

// ==== Administrator workspace ====
const adminTabs=[['groups','group','Nhóm chat'],['deletions','clock','Chờ xóa'],['overview','grid','Tổng quan'],['ops','shield','Điều hành thông minh'],['registrations','check','Duyệt đăng ký'],['users','users','Người dùng'],['tickets','inbox','Hỗ trợ / khôi phục'],['broadcast','announce','Thông báo'],['audit','clock','Nhật ký quản trị'],['security','lock','Bảo mật Admin'],['world','group','Chat thế giới'],['reports','shield','Báo cáo vi phạm']];
function adminNav(){
 return `<aside class="admin-nav"><div class="logo"><span class="logo-mark" aria-hidden="true">${brandGlyph()}</span><span>mtunz<span style="color:#8984fc">.</span></span></div>
 <div class="nav-label">QUẢN LÝ HỆ THỐNG</div>
 ${adminTabs.map(([t,ic,label])=>`<button data-act="admin-tab" data-tab="${t}" title="${label}" class="${state.adminTab===t?'active':''}">${icon(ic,19)} ${label}</button>`).join('')}
 <div class="nav-spacer"></div><div class="nav-label">TÀI KHOẢN</div>
 <div class="row" style="padding:11px 12px">${avatar('admin',true,'sm')}<div class="grow"><b>admin</b><div class="hint">Super administrator</div></div></div>
 <button data-act="logout" style="color:#ff93a0">${icon('logout')} Đăng xuất</button></aside>`;
}
const adminHeading={ops:['Trung tâm điều hành V6','Giám sát hiệu năng, cảnh báo bảo mật và điều khiển tính năng theo thời gian thực.'],deletions:['Yêu cầu xóa tài khoản','Theo dõi hạn xóa, kiểm tra yêu cầu và xử lý các trường hợp cần xóa ngay.'],groups:['Kiểm duyệt nhóm chat','Danh sách nhóm và lịch sử hoạt động khi cần xử lý nội dung vi phạm.'],overview:['Tổng quan hệ thống','Một nơi điều hành mọi hoạt động trên mtunz.'],registrations:['Phê duyệt tài khoản','Mọi tài khoản mới đều cần được bạn chấp thuận trước khi thiết lập mật khẩu và PIN.'],users:['Quản lý người dùng','Quản lý dữ liệu, giới hạn quyền truy cập, khóa và cấm tài khoản.'],tickets:['Trung tâm hỗ trợ','Trao đổi và xác minh yêu cầu khôi phục trực tiếp từ người dùng.'],broadcast:['Thông báo toàn hệ thống','Gửi thông báo tức thời tới tất cả người dùng.'],audit:['Nhật ký quản trị','Dấu vết thao tác quản lý giúp truy cứu khi cần.'],security:['Bảo mật quản trị','Đổi mật khẩu quản trị và bảo vệ quyền truy cập tối cao.'],
world:['Điều hành Chat thế giới','Bật/tắt, lịch mở cửa và quản lý án phạt spam tại một nơi.'],
reports:['Báo cáo người dùng','Tiếp nhận, đọc bằng chứng và đưa ra quyết định kiểm duyệt.']};
let adminLoadSequence=0;
let adminTicketSequence=0;
async function loadAdmin(){
 if(!state.user?.is_admin)return;
 const owner=state.user.id,tab=state.adminTab,request=++adminLoadSequence;
 const current=()=>state.user?.id===owner&&state.adminTab===tab&&request===adminLoadSequence;
 const update={adminData:null};
 if(state.adminTab==='world'&&typeof communityPlusRefresh==='function')
   communityPlusRefresh(false,true).then(()=>{
     const root=document.getElementById('v7-community-admin');
     if(root&&current())root.innerHTML=communityPlusAdminPanel();
   }).catch(()=>{});

 try{
  switch(tab){
   case 'groups':update.adminData=(await api('/api/admin/groups')).groups;break;
   case 'world':{
    const [config,rooms,polls]=await Promise.all([
      api('/api/admin/world'),api('/api/admin/world/rooms'),api('/api/admin/world/polls')
    ]);
    update.adminData=config;update.adminV6Rooms=rooms.rooms||[];update.adminV6Polls=polls.polls||[];
    break;
   }
   case 'ops':update.adminData=await api('/api/admin/ops/overview');break;
   case 'reports':update.adminData=await api('/api/admin/reports?status='+encodeURIComponent(state.adminReportFilter||'all'));break;
   case 'overview':{
    const [st,reg,aud]=await Promise.all([api('/api/admin/stats'),api('/api/admin/registrations'),api('/api/admin/audit')]);
    update.adminData={stats:st,registrations:reg.registrations,activity:(aud.logs||[]).slice(0,6)};break;
   }
   case 'registrations':update.adminData=(await api('/api/admin/registrations')).registrations;break;
   case 'deletions':update.adminData=(await api('/api/admin/deletions')).requests;break;
   case 'users':{
    const params=new URLSearchParams({q:state.adminQuery,status:state.adminUserStatus||'all',
      sort:state.adminUserSort||'oldest',offset:String(state.adminUserOffset||0)});
    const result=await api('/api/admin/users?'+params);
    if(result.offset>0&&result.total<=result.offset&&current()){
     state.adminUserOffset=Math.max(0,Math.floor((result.total-1)/result.limit)*result.limit);
     return loadAdmin();
    }
    update.adminData=result.users;
    update.adminUserMeta=result;
    break;
   }
   case 'tickets':{
    const ticket=state.adminTicket,sequence=adminTicketSequence;
    const data=await api('/api/admin/tickets');
    update.adminData=data.tickets;update.adminSupportPaused=!!data.paused;
    if(!current())return;
    if(ticket&&update.adminData.some(t=>t.id===ticket)&&sequence===adminTicketSequence){
     const result=await api(`/api/admin/tickets/${ticket}/messages`);
     if(sequence===adminTicketSequence&&state.adminTicket===ticket)update.adminTicketMessages=result.messages;
    }else if(sequence===adminTicketSequence){
     update.adminTicket=null;update.adminTicketMessages=[];
    }
    break;
   }
   case 'security':{
    update.adminApprovalData=await api('/api/admin/login-approvals');
    update.adminData=null;break;
   }
   case 'audit':{
    const f=state.adminAuditFilter;
    const params=new URLSearchParams({limit:'100',q:f.q||'',action:f.action||'',since:String(f.since||0),until:String(f.until||0)});
    const result=await api('/api/admin/audit?'+params.toString());
    update.adminData=result.logs;
    update.adminAuditMeta={total:result.total,has_more:result.has_more,offset:result.logs.length};
    break;
   }
   default:update.adminData=null;
  }
  if(current()){Object.assign(state,update);renderAdmin();}
 }catch(e){if(current())toast(e.message,'error');}
}
function statCard(label,value,footer){return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${footer}</div></div>`;}
function adminOverview(){
 const d=state.adminData||{},s=d.stats||{total_users:0,online:0,pending:0,tickets:0,reserved_slots:0,max_users:100,messages:0};
 const regs=(d.registrations||[]).filter(x=>x.status==='pending').slice(0,5);
 return `<div class="stats-grid">${statCard('Tổng tài khoản',s.total_users,'Không tính tài khoản admin')}<button type="button" class="stat admin-online-card" data-act="admin-online-users">
 <span class="stat-label">Đang online</span><span class="stat-value">${s.online}</span>
 <span class="stat-foot">Xem người đang kết nối ${icon('chevron',14)}</span>
 </button>
 ${statCard('Chờ phê duyệt',s.pending,'Tạo tài khoản mới')}${statCard('Chờ xóa',s.deletion_pending||0,'Có thể hủy trước hạn')}${statCard('Yêu cầu hỗ trợ',s.tickets,'Các cuộc trò chuyện đang mở')}${statCard('Nhóm chat',s.groups||0,'Không gian chung')}${statCard('Tin nhắn',s.messages||0,'Tin nhắn hệ thống')}</div>
 <div class="admin-panels"><section class="card"><div class="row between"><h2>Yêu cầu đăng ký mới</h2><button class="btn ghost sm" data-act="admin-tab" data-tab="registrations">Xem tất cả</button></div>
 <div class="sep"></div>${regs.length?regs.map(r=>`<div class="people-row">${avatar(r.username,false,'sm')}<div class="grow"><b>${esc(r.username)}</b><div class="hint">${date(r.created_at)}</div></div><button class="btn success sm" data-act="admin-decision" data-id="${r.id}" data-approve="1">Duyệt</button><button class="btn danger sm" data-act="admin-decision" data-id="${r.id}" data-approve="0">Từ chối</button></div>`).join(''):'<div class="empty">Không có yêu cầu đang chờ.</div>'}</section>
 <section class="card"><h2>Giới hạn người dùng</h2><p class="hint">Kiểm soát số tài khoản tối đa được phép tồn tại. Các chỗ đã duyệt nhưng chưa tạo tài khoản vẫn được tính.</p>
 <div class="row" style="margin:22px 0"><span class="pill good">${s.total_users} đã tạo</span><span class="pill warn">${s.reserved_slots} đã duyệt</span><span class="pill">Giới hạn ${s.max_users}</span></div>
 <form data-form="admin-capacity"><div class="field"><label>Số người dùng tối đa</label><input type="number" class="input" name="max_users" min="1" max="100000" value="${s.max_users}" required></div><button class="btn primary full">Lưu giới hạn mới</button></form>
 <div class="sep"></div><div class="row between"><span class="muted small">Tổng tin nhắn đã gửi</span><b>${s.messages.toLocaleString('vi-VN')}</b></div></section></div>
 <div class="admin-panels" style="margin-top:20px">
  <section class="card"><div class="row between"><h2>${icon('clock',17)} Hoạt động quản trị gần đây</h2>
    <button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="audit">Xem nhật ký</button></div>
    ${(d.activity||[]).map(log=>`<div class="people-row"><div class="grow"><b>${esc(log.action)}</b>
      <div class="hint" style="overflow-wrap:anywhere">${esc(log.detail||'—')}</div></div><span class="hint">${date(log.created_at)}</span></div>`).join('')||'<p class="hint" style="margin-top:14px">Chưa có thao tác quản trị.</p>'}
  </section>
  <section class="card"><h2>${icon('shield',17)} Trạng thái an toàn</h2>
   <p class="hint" style="margin-top:12px">Phiên Admin tối đa 2 giờ và không có mở khóa nhanh bằng PIN trên thiết bị ghi nhớ.</p>
   <div class="row" style="flex-wrap:wrap;gap:8px;margin:18px 0"><span class="pill ${state.user?.pin_length?'good':'bad'}">${state.user?.pin_length?'Đã bật PIN Admin':'Cần thiết lập PIN Admin'}</span><span class="pill warn">${s.deletion_pending||0} tài khoản chờ xóa</span></div>
   <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn ghost sm" data-act="admin-tab" data-tab="security">Quản lý bảo mật</button>
    <button class="btn ghost sm" data-act="admin-tab" data-tab="deletions">Danh sách chờ xóa</button></div>
  </section></div>
 <div class="info-strip" style="margin-top:22px">Mật khẩu và PIN gốc không hiển thị cho admin; các thao tác xóa ngay được ghi nhật ký quản trị.</div>`;
}
function statusPill(s){return s==='pending'?'<span class="pill warn">Chờ duyệt</span>':s==='approved'?'<span class="pill good">Đã duyệt</span>':s==='denied'?'<span class="pill bad">Từ chối</span>':'<span class="pill">Hoàn tất</span>';}
function adminRegistrations(){const rows=state.adminData||[];
 return `<div class="row between" style="margin-bottom:18px"><span class="hint">${rows.filter(r=>r.status==='pending').length} yêu cầu chưa xử lý</span><button class="btn ghost sm" data-act="admin-refresh">${icon('refresh',15)} Làm mới</button></div>
 <div class="table-scroll"><table class="data-table"><thead><tr><th>#</th><th>Tên đề xuất</th><th>Số điện thoại</th><th>Email</th><th>Thời gian</th><th>Trạng thái</th><th>Quyết định</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${r.id}</td><td><b>${esc(r.username)}</b></td><td>${esc(r.phone||'Chưa cung cấp')}</td><td>${esc(r.email||'—')}</td><td>${date(r.created_at)}</td><td>${statusPill(r.status)}</td><td><div class="table-actions"><button class="btn ghost sm" data-act="admin-registration-detail" data-id="${r.id}">${icon('eye',14)} Chi tiết</button>${r.status==='pending'?`<button class="btn success sm" data-act="admin-decision" data-id="${r.id}" data-approve="1">Duyệt</button><button class="btn danger sm" data-act="admin-decision" data-id="${r.id}" data-approve="0">Từ chối</button>`:'—'}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Không có yêu cầu.</td></tr>'}</tbody></table></div>`;
}
function userStatus(u){return u.deletion_purge_at?'<span class="pill warn">Chờ xóa</span>':!u.sanction_kind?'<span class="pill good">Hoạt động</span>':u.sanction_until&&u.sanction_until*1000<Date.now()?'<span class="pill">Đã hết hạn</span>':`<span class="pill bad">${u.sanction_kind==='ban'?'Đã cấm':'Đã khóa'}</span>`;}
// Admin-only activity, based on persisted authenticated sessions and live sockets.
// A healthy account is not necessarily connected: keep status and presence distinct.
function adminLastActivityRelative(seconds,online=false,clock=Date.now()){
 const ts=Number(seconds);
 if(online)return 'Đang trực tuyến';
 if(!Number.isFinite(ts)||ts<=0)return 'Chưa ghi nhận';
 const age=Math.max(0,Math.floor((clock-ts*1000)/1000));
 if(age<60)return 'Vừa xong';
 if(age<3600)return Math.floor(age/60)+' phút trước';
 if(age<86400)return Math.floor(age/3600)+' giờ trước';
 const day=new Date(clock),seen=new Date(ts*1000);
 const midnight=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
 if(seen.getTime()>=midnight-86400000&&seen.getTime()<midnight)
  return 'Hôm qua '+seen.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
 if(age<7*86400)return Math.floor(age/86400)+' ngày trước';
 return seen.toLocaleDateString('vi-VN');
}
function adminLastActivityCell(u){
 const stamp=Number(u.last_active_at);
 if(!Number.isFinite(stamp)||stamp<=0||stamp>1e11){
  return '<span class="admin-last-activity admin-last-activity-unknown">Chưa ghi nhận</span>';
 }
 const iso=new Date(stamp*1000).toISOString();
 const full=new Date(stamp*1000).toLocaleString('vi-VN',{
  hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});
 return '<time class="admin-last-activity'+(u.online?' is-online':'')+'"'+
  ' datetime="'+iso+'" data-last-seen="'+stamp+'" data-online="'+(u.online?'1':'0')+'"'+
  ' title="'+esc(full)+' (giờ trên thiết bị)">'+
  '<strong class="admin-last-activity-label">'+esc(adminLastActivityRelative(stamp,!!u.online))+'</strong>'+
  '<small class="admin-last-activity-date">'+esc(full)+'</small></time>';
}
function adminRefreshLastActivityLabels(){
 if(!state.user?.is_admin||state.adminTab!=='users'||document.hidden)return;
 document.querySelectorAll('.admin-users-table .admin-last-activity[data-last-seen]').forEach(node=>{
  const label=node.querySelector('.admin-last-activity-label');
  if(label)label.textContent=adminLastActivityRelative(Number(node.dataset.lastSeen),node.dataset.online==='1');
 });
}
setInterval(adminRefreshLastActivityLabels,60000);
function adminUsers(){
 const data=state.adminData||[],meta=state.adminUserMeta||{total:0,offset:0,limit:50};
 const options=(items,selected)=>items.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
 return `<form data-form="admin-search-users" class="card" style="margin-bottom:16px">
 <div class="field"><label for="admin-user-query">Tìm tài khoản</label>
 <input id="admin-user-query" class="input" name="q" placeholder="Tên hiển thị, tên đăng nhập, ID, số điện thoại hoặc email" maxlength="120" value="${esc(state.adminQuery)}"></div>
 <div class="row" style="flex-wrap:wrap;gap:10px">
 <label>Trạng thái <select class="input" name="status">${options([['all','Tất cả'],['active','Hoạt động'],['locked','Đang khóa'],['banned','Đã cấm'],['pending_deletion','Chờ xóa']],state.adminUserStatus||'all')}</select></label>
 <label>Sắp xếp <select class="input" name="sort">${options([['oldest','Ngày tạo: cũ nhất → mới nhất'],['newest','Ngày tạo: mới nhất → cũ nhất'],['activity','Hoạt động gần đây (online trước)'],['name','Theo tên']],state.adminUserSort||'oldest')}</select></label>
 <button type="submit" class="btn primary">${icon('search',16)} Tìm kiếm</button>
 <button type="button" class="btn ghost" data-act="admin-search-clear">Xóa bộ lọc</button></div></form>
 <div class="row between" style="flex-wrap:wrap;gap:8px;margin-bottom:10px">
 <span aria-live="polite">${meta.total?`${meta.offset+1}–${Math.min(meta.offset+meta.limit,meta.total)} / ${meta.total} tài khoản`:'0 tài khoản'}</span>
 <div class="row"><button type="button" class="btn ghost sm" data-act="admin-search-page" data-offset="${Math.max(0,meta.offset-meta.limit)}" ${meta.offset?'':'disabled'}>Trang trước</button>
 <button type="button" class="btn ghost sm" data-act="admin-search-page" data-offset="${meta.offset+meta.limit}" ${meta.offset+meta.limit<meta.total?'':'disabled'}>Trang sau</button></div></div>
 <div class="table-scroll admin-users-scroll"><table class="data-table admin-users-table"><thead><tr><th>Người dùng</th><th title="Trạng thái tài khoản, không phải trạng thái trực tuyến">Trạng thái TK</th><th aria-sort="${(state.adminUserSort||'oldest')==='activity'?'descending':'none'}">Lần cuối hoạt động</th><th aria-sort="${(state.adminUserSort||'oldest')==='oldest'?'ascending':state.adminUserSort==='newest'?'descending':'none'}">Ngày tham gia ${(!state.adminUserSort||state.adminUserSort==='oldest')?'↑':state.adminUserSort==='newest'?'↓':''}</th><th>Bạn bè</th><th>Tin nhắn</th><th>Hành động</th></tr></thead><tbody>
 ${data.length?data.map(u=>`<tr><td><div class="row">${avatar(u.username,false,'sm')}<div><b>${esc(u.display_name||u.username)}</b><div class="hint">@${esc(u.username)} · ID #${u.id}${u.public_id?' · Công khai #'+u.public_id:''}</div>
 <div class="hint">${esc(u.phone||'')}${u.phone&&u.email?' · ':''}${esc(u.email||'')}</div></div></div></td>
 <td data-label="Trạng thái tài khoản">${userStatus(u)}${u.deletion_purge_at?`<div class="hint">Hạn: ${deadlineDate(u.deletion_purge_at)}</div>`:''}</td><td data-label="Lần cuối hoạt động">${adminLastActivityCell(u)}</td><td>${date(u.created_at)}</td><td><button type="button" class="btn ghost sm" data-act="admin-user-friends" data-id="${u.id}" aria-label="Xem bạn bè của ${esc(u.display_name||u.username)}">${u.friend_count} bạn bè</button></td><td>${u.message_count}</td>
 <td data-label="Hành động"><div class="table-actions"><button class="btn ghost sm" data-act="admin-user-detail" data-id="${u.id}">Chi tiết</button>
 <button class="btn ghost sm" data-act="admin-view-messages" data-id="${u.id}">${icon('eye',14)} Chat</button>
 <button class="btn ghost sm" data-act="admin-user-edit" data-id="${u.id}">${icon('settings',14)} Sửa</button>
 <button class="btn ghost sm" data-act="admin-user-revoke" data-id="${u.id}">${icon('lock',14)} Thu hồi phiên</button>
 <button class="btn danger sm" data-act="admin-sanction" data-kind="ban" data-id="${u.id}">Cấm</button>
 <button class="btn ghost sm" data-act="admin-sanction" data-kind="lock" data-id="${u.id}">Khóa</button>
 <button class="btn danger sm" type="button" data-act="admin-delete-user" data-id="${u.id}">${icon('ban',14)} Xóa vĩnh viễn</button>
 ${u.sanction_kind?`<button class="btn success sm" data-act="admin-sanction" data-kind="unban" data-id="${u.id}">Unban</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Không tìm thấy người dùng.</td></tr>'}</tbody></table></div>`;
}
function adminDeletionQueue(){
 const items=state.adminData||[];
 return `<div class="card" style="max-width:1100px">
  <div class="row between"><div><h2>${icon('clock',19)} Tài khoản đang chờ xóa</h2>
  <p class="hint">Người dùng có thể hủy yêu cầu trước hạn. Admin chỉ nên xóa ngay khi có lý do cần thiết; thao tác xóa ngay không thể hoàn tác.</p></div>
  <button class="btn ghost sm" data-act="admin-refresh">${icon('refresh',15)} Làm mới</button></div>
  <div class="table-scroll" style="margin-top:18px"><table class="data-table"><thead><tr><th>Tài khoản</th><th>Ngày yêu cầu</th><th>Hạn xóa</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
  ${items.map(item=>`<tr><td><b>${esc(item.username)}</b><div class="hint">#${item.user_id}</div></td>
  <td>${deadlineDate(item.requested_at)}</td><td>${deadlineDate(item.purge_at)}</td>
  <td><span class="pill ${item.purge_at*1000<=Date.now()?'bad':'warn'}">${item.purge_at*1000<=Date.now()?'Đến hạn xử lý':'Trong thời gian cân nhắc'}</span></td>
  <td><div class="table-actions">${item.purge_at*1000>Date.now()?`<button class="btn success sm" type="button" data-act="admin-cancel-deletion" data-id="${item.user_id}">Hủy yêu cầu xóa</button>`:''}<button class="btn danger sm" type="button" data-act="admin-delete-pending" data-id="${item.user_id}">Xóa ngay (Admin)</button></div></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Không có tài khoản nào đang chờ xóa.</td></tr>'}
  </tbody></table></div></div>`;
}
function adminTickets(){const tickets=state.adminData||[];
 const spamCount=tickets.filter(t=>t.status==='spam').length;
 const visible=tickets.filter(t=>state.adminShowSpam||t.status!=='spam');
 const chosen=visible.find(t=>t.id===state.adminTicket);
 const paused=state.adminSupportPaused;
 return `<div class="support-intake-banner">
 <div><strong>${paused?'Tạm ngừng nhận phiếu mới':'Đang nhận phiếu mới'}</strong>
 <p class="hint">Các phiếu đã mở vẫn có thể tiếp tục trao đổi.</p></div>
 <button type="button" class="btn ${paused?'primary':'ghost'} sm" data-act="admin-support-intake">${paused?'Nhận hỗ trợ trở lại':'Tạm ngừng nhận hỗ trợ'}</button></div>
 <div class="admin-ticket-layout"><div class="card" style="padding:0;overflow:hidden"><div class="row between" style="padding:17px;border-bottom:1px solid var(--line)"><b>Cuộc trò chuyện (${tickets.length})</b><button class="btn sm ghost" data-act="admin-refresh">${icon('refresh',15)}</button></div>
 <div style="padding:9px 14px;border-bottom:1px solid var(--line)"><button class="btn ghost sm" type="button" data-act="admin-show-spam">${state.adminShowSpam?'Ẩn phiếu spam':'Xem phiếu spam'} (${spamCount})</button></div>
 <div class="ticket-list">${visible.length?visible.map(t=>`<div class="ticket-item ${t.id===state.adminTicket?'selected':''}" data-act="admin-open-ticket" data-id="${t.id}">
 <div class="row between"><b>#${t.id} · ${esc(t.kind)}</b><span class="pill ${t.status==='open'?'good':'bad'}">${t.status==='open'?'Mở':t.status==='spam'?'Spam':'Đóng'}</span></div>
 <div class="hint truncate" style="margin-top:7px">${esc(t.claim)||'Không có mô tả'}</div><div class="hint">${date(t.created_at)}</div></div>`).join(''):'<div class="empty">Chưa có yêu cầu hỗ trợ.</div>'}</div></div>
 <div class="card" style="display:flex;flex-direction:column;gap:15px;min-height:520px">${chosen?`
 <div class="row between"><div><h2>Phiếu hỗ trợ #${chosen.id}</h2><div class="hint">Loại: ${esc(chosen.kind)} · ${esc(chosen.claim)}</div></div>
 <div class="row" style="gap:7px;flex-wrap:wrap">
 <button class="btn ghost sm" data-act="admin-close-ticket" data-id="${chosen.id}" data-status="${chosen.status==='open'?'closed':'open'}">${chosen.status==='open'?'Đóng':'Mở lại'}</button>
 ${chosen.status!=='open'?`<button type="button" class="btn danger sm" data-act="admin-delete-ticket" data-id="${chosen.id}">${icon('trash',15)} Xóa cuộc trò chuyện</button>`:''}
 ${chosen.status==='spam'?'':`<button class="btn danger sm" data-act="admin-close-ticket" data-id="${chosen.id}" data-status="spam">${icon('ban',14)} Đánh dấu spam</button>`}
 </div></div>
 <div class="support-list grow" id="admin-ticket-messages" style="max-height:380px;min-height:240px">${renderTicketBubbles(state.adminTicketMessages)}</div>
 ${chosen.status==='open'?`<form data-form="admin-ticket-reply" data-ticket-id="${chosen.id}"><div class="row"><input class="input" name="body" placeholder="Trả lời người dùng..." required maxlength="1500"><button class="btn primary circle">${icon('send')}</button></div></form>`:'<p class="hint">Mở lại phiếu để tiếp tục trao đổi.</p>'}
 ${chosen.status!=='open'?'':['password','pin'].includes(chosen.kind)?`<div class="info-strip" style="margin:0">Chỉ cấp mã đặt lại khi đã <b>xác minh danh tính bằng kênh độc lập</b>. Không dựa đơn thuần vào thông tin mà người lạ tự khai trong chat.</div>
 <button class="btn ghost" data-act="admin-recovery-grant" data-id="${chosen.id}">${icon('lock',16)} Cấp mã khôi phục một lần (15 phút)</button>`:
 '<div class="hint">Nếu người dùng quên tên đăng nhập, xác minh danh tính rồi trả lời tên tài khoản trong chat.</div>'}
 `:`<div class="empty" style="margin:auto"><span class="big-emoji">💬</span>Chọn một phiếu hỗ trợ ở bên trái.</div>`}</div></div>`;
}
function adminBroadcast(){return `<div class="card" style="max-width:690px"><h2>${icon('announce',20)} Gửi thông báo đồng loạt</h2><p class="hint" style="margin:13px 0 20px">Thông báo xuất hiện ngay với người đang online và được lưu lại để người dùng xem sau.</p>
 <form data-form="admin-broadcast"><div class="field"><label>Nội dung thông báo (tối đa 500 ký tự)</label><textarea class="textarea" name="body" rows="5" maxlength="500" required></textarea></div>
 <button class="btn primary">${icon('send',17)} Gửi đến mọi người dùng</button></form></div>`;}
function adminSecurity(){
 const configured=!!state.user?.pin_length;
 const pinCard=configured?`<div class="card" style="max-width:650px;margin-top:17px">
   <h2>${icon('shield',20)} PIN quản trị</h2>
   <p class="hint" style="margin:12px 0">PIN đã được bật. Admin phải dùng mật khẩu và PIN khi đăng nhập; không hỗ trợ ghi nhớ thiết bị. Phiên quản trị hết hạn sau 2 giờ.</p>
   <form data-form="admin-pin-change">
     ${secureSettingsField('PIN hiện tại','old_pin','password','','inputmode="numeric" autocomplete="off"')}
     <div class="field"><label>Độ dài PIN mới</label><select class="select" name="pin_length"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6" selected>6 chữ số</option></select></div>
     ${secureSettingsField('PIN mới','new_pin','password','','inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"')}
     <button class="btn primary full" type="submit">${icon('lock',16)} Đổi PIN quản trị</button>
   </form></div>`:
 `<div class="card" style="max-width:650px;margin-top:17px">
   <h2>${icon('shield',20)} Kích hoạt PIN cho admin</h2>
   <p class="hint" style="margin:12px 0">Thiết lập PIN để bảo vệ tài khoản quản trị. Sau đó, mọi lần đăng nhập đều cần mật khẩu và PIN; tính năng ghi nhớ thiết bị không áp dụng với Admin.</p>
   <form data-form="admin-pin-setup">
     ${secureSettingsField('Mật khẩu admin hiện tại','current_password','password','','autocomplete="current-password"')}
     <div class="field"><label>Độ dài PIN</label><select class="select" name="pin_length"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6" selected>6 chữ số</option></select></div>
     ${secureSettingsField('Mã PIN quản trị','pin','password','','inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="off"')}
     <button class="btn primary full" type="submit">${icon('lock',16)} Kích hoạt PIN quản trị</button>
   </form></div>`;
 return `<div class="admin-security" aria-label="Bảo mật tài khoản quản trị">
   <div class="card" style="max-width:650px"><h2>${icon('lock',20)} Đổi mật khẩu admin</h2>
   <p class="hint" style="margin:15px 0">Dùng mật khẩu riêng mạnh, tối thiểu 12 ký tự. Khi đổi, các phiên khác và thiết bị đã ghi nhớ sẽ bị thu hồi.</p>
   <form data-form="admin-password">
   ${secureSettingsField('Mật khẩu mới','new_password','password','','minlength="12"')}
   ${secureSettingsField('Nhập lại mật khẩu mới','repeat_password','password','','minlength="12"')}
   <button class="btn primary full">${icon('shield',17)} Đổi mật khẩu admin</button></form></div>
   ${pinCard}
   <div class="card" style="max-width:650px;margin-top:17px">
     <h3>${icon('shield',18)} Trung tâm an toàn Admin</h3>
     <p class="hint" style="margin:12px 0">Phiên quản trị hết hạn sau 2 giờ. Không ghi nhớ mật khẩu hay cho phép mở khóa admin chỉ bằng PIN. Xóa vĩnh viễn bắt buộc nhập lại cả mật khẩu và PIN.</p>
     <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:16px">
       <button class="btn ghost sm" type="button" data-act="list-sessions">${icon('lock',16)} Phiên đăng nhập</button>
       <button class="btn danger sm" type="button" data-act="revoke-sessions">${icon('shield',16)} Thu hồi các phiên khác</button>
     </div>
     ${!configured?'<p class="hint" style="margin-top:12px">Cần bật PIN để có quyền xóa vĩnh viễn tức thì.</p>':''}
   </div>
   ${typeof adminV3SecurityPanel==='function'?adminV3SecurityPanel():''}
   ${state.savedDevice?`<div class="card" style="max-width:650px;margin-top:17px"><h3>${icon('lock',18)} Khóa phiên hiện tại</h3><p class="hint" style="margin:11px 0">Quay về màn hình PIN mà không xóa thiết bị được ghi nhớ.</p><button class="btn ghost" type="button" data-act="lock-device">${icon('lock',16)} Khóa ngay</button></div>`:''}
 </div>`;
}
const auditNames={
 admin_cancel_account_deletion:'Hủy yêu cầu xóa tài khoản',
 maintenance_mode:'Thay đổi chế độ bảo trì',
 maintenance_member_reset:'Bảo trì: đặt lại dữ liệu thành viên',
 registration_approved:'Phê duyệt đăng ký',registration_denied:'Từ chối đăng ký',
 permanent_user_delete:'Xóa tài khoản vĩnh viễn',sanction_ban:'Cấm tài khoản',
 sanction_lock:'Khóa tài khoản',sanction_unban:'Gỡ hạn chế',
 admin_view_user_friends:'Xem danh sách bạn bè',moderation_messages:'Kiểm tra tin nhắn',moderation_group:'Kiểm duyệt nhóm',
 moderation_attachment:'Kiểm duyệt tệp đính kèm',
 enable_admin_pin:'Bật PIN quản trị',capacity:'Thay đổi giới hạn tài khoản',
 support_intake:'Thay đổi tiếp nhận hỗ trợ',support_delete:'Xóa cuộc trò chuyện hỗ trợ',
 ticket_status:'Thay đổi trạng thái hỗ trợ',support_mark_spam:'Đánh dấu yêu cầu spam',
 support_reply:'Trả lời yêu cầu hỗ trợ',issue_recovery:'Cấp mã khôi phục',
 broadcast:'Gửi thông báo toàn hệ thống',admin_stepup_denied:'Xác minh quyền thất bại',
 admin_view_user_details:'Xem chi tiết người dùng',admin_edit_user:'Chỉnh sửa hồ sơ người dùng',
 admin_revoke_user_sessions:'Thu hồi phiên đăng nhập người dùng',
 audit_detail_view:'Xem nhật ký quản trị',remove_group_message:'Gỡ tin nhắn nhóm',
 admin_password_change:'Đổi mật khẩu quản trị'
};
const auditDescriptions={
 maintenance_member_reset:'Nhật ký ghi nhận một thao tác bảo trì liên quan đến việc đặt lại dữ liệu thành viên.',
 registration_approved:'Yêu cầu đăng ký tài khoản đã được phê duyệt.',
 registration_denied:'Yêu cầu đăng ký tài khoản đã bị từ chối.',
 permanent_user_delete:'Thao tác xóa vĩnh viễn tài khoản người dùng đã được ghi vào nhật ký.',
 sanction_ban:'Quản trị viên đã áp dụng lệnh cấm tài khoản.',
 sanction_lock:'Quản trị viên đã áp dụng lệnh khóa tài khoản.',
 sanction_unban:'Quản trị viên đã gỡ hạn chế tài khoản.',
 admin_view_user_friends:'Quản trị viên đã truy cập danh sách kết nối của thành viên.',
 moderation_messages:'Quản trị viên đã truy cập lịch sử tin nhắn để kiểm duyệt.',
 moderation_group:'Quản trị viên đã thực hiện thao tác kiểm duyệt nhóm.',
 moderation_attachment:'Đã ghi nhận thao tác kiểm duyệt tệp đính kèm.',
 enable_admin_pin:'Tài khoản quản trị đã kích hoạt bảo vệ bằng mã PIN.',
 capacity:'Giới hạn số tài khoản trong hệ thống đã được thay đổi.',
 support_intake:'Quản trị viên đã thay đổi trạng thái tiếp nhận phiếu mới.',
 support_delete:'Quản trị viên đã xóa nội dung một cuộc hỗ trợ đã đóng.',
 ticket_status:'Trạng thái của một phiếu hỗ trợ đã được thay đổi.',
 support_mark_spam:'Một phiếu hỗ trợ đã được đánh dấu spam để ngăn gửi tin mới.',
 support_reply:'Quản trị viên đã gửi phản hồi trong phiếu hỗ trợ.',
 issue_recovery:'Quản trị viên đã cấp mã khôi phục tài khoản.',
 broadcast:'Quản trị viên đã gửi thông báo toàn hệ thống.',
 admin_stepup_denied:'Một lần xác minh quyền thực hiện thao tác nhạy cảm đã bị từ chối.',
 admin_view_user_details:'Quản trị viên đã mở thông tin chi tiết của người dùng.',
 admin_edit_user:'Quản trị viên đã cập nhật thông tin hồ sơ người dùng.',
 admin_revoke_user_sessions:'Các phiên đăng nhập hoặc thiết bị ghi nhớ của người dùng đã bị thu hồi.',
 audit_detail_view:'Quản trị viên đã mở xem một sự kiện trong nhật ký.',
 remove_group_message:'Quản trị viên đã gỡ một tin nhắn trong nhóm.',
 admin_password_change:'Mật khẩu của tài khoản quản trị đã được thay đổi.'
};
function auditLabel(action){return auditNames[action]||'Hoạt động chưa được phân loại';}
/* Explain only what the original audit record explicitly supports. */
function auditMeaning(log){
 const action=String(log?.action||''),raw=String(log?.detail||'').trim();
 const facts=[],get=pattern=>(raw.match(pattern)||[])[1]||'';
 let description=auditDescriptions[action]||'Nhật ký có ghi nhận hành động này nhưng chưa có mô tả tiếng Việt cụ thể.';
 let note='Thông tin chỉ lấy từ nhật ký. Không suy đoán IP, thiết bị, nguyên nhân hoặc kết quả chưa được ghi.';
 if(action==='maintenance_member_reset'){
   if(/non-admin accounts and user-generated data reset/i.test(raw)){
     description='Theo nội dung lưu trong nhật ký, hệ thống đã đặt lại tài khoản thành viên và dữ liệu do người dùng tạo.';
     facts.push(['Dữ liệu được ghi nhận là đã đặt lại','Tài khoản không phải quản trị viên và dữ liệu do người dùng tạo']);
   }
   if(/administrator and configuration retained/i.test(raw)){
     facts.push(['Dữ liệu được ghi nhận là đã giữ lại','Tài khoản quản trị và cấu hình hệ thống']);
   }
   note='Sự kiện không ghi rõ danh sách tài khoản, các bảng dữ liệu, số lượng bản ghi hoặc khả năng khôi phục. Không thể suy ra các chi tiết đó.';
 }else{
   const uid=get(/(?:^|[;,\s])user_id=(\d+)/i);
   if(uid)facts.push(['Mã người dùng liên quan','#'+uid]);
   const ticket=get(/(?:^|[;,\s])ticket=(\d+)/i);
   if(ticket)facts.push(['Phiếu hỗ trợ','#'+ticket]);
   const eventId=get(/(?:^|[;,\s])event_id=(\d+)/i);
   if(eventId)facts.push(['Sự kiện được xem','#'+eventId]);
   const account=get(/(?:^|[;,\s])account=([a-z0-9_]+)/i);
   if(account)facts.push(['Tài khoản liên quan',account]);
   const sessions=get(/(?:^|[;,\s])sessions=(\d+)/i);
   if(sessions)facts.push(['Phiên đăng nhập đã thu hồi',sessions]);
   const devices=get(/(?:^|[;,\s])devices=(\d+)/i);
   if(devices)facts.push(['Thiết bị ghi nhớ đã thu hồi',devices]);
   const fieldList=get(/(?:^|[;,\s])fields=([a-z_,]+)/i);
   if(fieldList){
     const names={display_name:'Tên hiển thị',bio:'Giới thiệu',phone:'Số điện thoại',email:'Email'};
     facts.push(['Các trường được cập nhật',fieldList.split(',').map(field=>names[field]||field).join(', ')]);
   }
   const type=get(/(?:^|[;,\s])type=(password|pin|username)/i).toLowerCase();
   if(type)facts.push(['Loại khôi phục',({password:'Mật khẩu',pin:'Mã PIN',username:'Tên đăng nhập'})[type]]);
   if(action==='capacity'&&/^\d+$/.test(raw))facts.push(['Giới hạn tài khoản mới',Number(raw).toLocaleString('vi-VN')]);
   if((action==='registration_approved'||action==='registration_denied')&&/^[a-z][a-z0-9_]{2,23}$/i.test(raw))facts.push(['Tên tài khoản đăng ký',raw]);
   if(action==='support_reply'&&/^\d+$/.test(raw))facts.push(['Phiếu hỗ trợ','#'+raw]);
   const ticketStatus=raw.match(/^(\d+):\s*(open|closed|spam)$/);
   if((action==='ticket_status'||action==='support_mark_spam')&&ticketStatus){
     facts.push(['Phiếu hỗ trợ','#'+ticketStatus[1]]);
     facts.push(['Trạng thái sau thao tác',({open:'Đang mở',closed:'Đã đóng',spam:'Đã đánh dấu spam'})[ticketStatus[2]]]);
   }
 }
 return {description,facts,note};
}
function auditLevel(log){return log.severity==='high'?['high','Quan trọng']:log.severity==='medium'?['medium','Cần theo dõi']:['info','Thông thường'];}
function auditDateValue(timestamp){
 if(!timestamp)return '';
 const d=new Date(timestamp*1000);
 const pad=n=>String(n).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function adminAudit(){const logs=state.adminData||[],meta=state.adminAuditMeta||{};
 const f=state.adminAuditFilter;
 const summary=logs.reduce((a,l)=>{a[l.severity||'info']=(a[l.severity||'info']||0)+1;return a;},{});
 return `<div class="admin-audit-layout">
 <section class="admin-audit-summary" aria-label="Tổng hợp nhật ký đã tải">
   <div class="card"><span class="hint">Kết quả tra cứu</span><strong>${Number(meta.total||0).toLocaleString('vi-VN')}</strong><small>Sự kiện được ghi nhận</small></div>
   <div class="card"><span class="hint">Mức quan trọng</span><strong>${summary.high||0}</strong><small>Trong dữ liệu đã tải</small></div>
   <div class="card"><span class="hint">Cần theo dõi</span><strong>${summary.medium||0}</strong><small>Trong dữ liệu đã tải</small></div>
 </section>
 <form class="admin-audit-filters" data-form="admin-audit-search">
  <label>Tìm nhật ký<input class="input" name="q" maxlength="100" value="${esc(f.q||'')}" placeholder="Hành động, tài khoản, ID..." autocomplete="off"></label>
  <label>Hành động<select name="action" class="select">
   <option value="">Tất cả hành động</option>
   ${Object.keys(auditNames).map(action=>`<option value="${esc(action)}" ${f.action===action?'selected':''}>${esc(auditLabel(action))}</option>`).join('')}
  </select></label>
  <label>Từ ngày<input class="input" type="date" name="since" value="${f.since?auditDateValue(f.since):''}"></label>
  <label>Đến ngày<input class="input" type="date" name="until" value="${f.until?auditDateValue(f.until):''}"></label>
  <button class="btn primary" type="submit">${icon('search',16)} Áp dụng bộ lọc</button>
  <button class="btn ghost" type="button" data-act="admin-audit-clear">Xóa bộ lọc</button>
 </form>
 <p class="admin-muted-note">Nhật ký có thể được chọn xóa sau khi Admin nhập PIN. Hệ thống lưu lại dấu xác nhận tối thiểu.</p>
 ${typeof adminV3AuditControls==='function'?adminV3AuditControls():''}
 <section class="card admin-audit-card" aria-label="Danh sách sự kiện quản trị">
 <div class="admin-audit-header"><b>${logs.length.toLocaleString('vi-VN')} sự kiện đã tải / ${Number(meta.total||0).toLocaleString('vi-VN')} kết quả</b><span>Thời gian hiển thị theo thiết bị của bạn</span></div>
 ${logs.length?logs.map(l=>{
  const [level,label]=auditLevel(l);
  return `<div class="audit-item admin-audit-entry" data-level="${level}">
    <label class="admin-v3-audit-select" title="Chọn nhật ký #${l.id}"><input type="checkbox" data-admin-audit-select value="${l.id}" aria-label="Chọn nhật ký #${l.id}"></label>
    <div class="admin-audit-entry-main">
     <div class="admin-audit-heading"><strong>${esc(auditLabel(l.action))}</strong><span class="audit-severity ${level}">${label}</span></div>
     <p class="admin-audit-detail">${esc(auditMeaning(l).description)}</p>
     <div class="admin-audit-meta"><span>${icon('users',13)} ${esc(l.admin_username||'Quản trị viên')} · #${l.admin_id}</span><span>${icon('clock',13)} ${deadlineDate(l.created_at)}</span><span>#${l.id}</span></div>
    </div>
    <button class="btn ghost sm" type="button" data-act="admin-audit-detail" data-id="${l.id}">${icon('eye',15)} Xem chi tiết</button>
  </div>`}).join(''):'<div class="empty">Không có nhật ký phù hợp với bộ lọc.</div>'}
 </section>
 ${meta.has_more?'<button class="btn ghost full admin-audit-load" type="button" data-act="admin-audit-more">Tải thêm 100 sự kiện</button>':''}
 </div>`;
}
async function adminAuditDetail(eventId){
 const r=await api('/api/admin/audit/'+eventId);
 const e=r.event,[level,label]=auditLevel(e),info=auditMeaning(e);
 const who=e.admin_username||'Không có thông tin',whoId=Number(e.admin_id);
 const actor=esc(who)+(Number.isSafeInteger(whoId)?' (#'+whoId+')':'');
 const facts=info.facts.map(([name,value])=>adminDetailRow(name,esc(value))).join('');
 modal({title:'Sự kiện #'+e.id+' · '+auditLabel(e.action),
   description:'Giải thích nội dung được hệ thống ghi lại để dễ kiểm tra và đối soát.',
   confirm:'Đóng',cancel:null,content:`<div class="admin-audit-modal">
   <section class="admin-audit-explanation" aria-label="Ý nghĩa sự kiện">
     <span class="admin-audit-kicker">SỰ KIỆN #${Number(e.id)}</span>
     <h3>${esc(auditLabel(e.action))}</h3>
     <p>${esc(info.description)}</p>
   </section>
   <section class="admin-audit-section" aria-label="Người thực hiện và thời gian">
     <h4>Ai thực hiện và khi nào?</h4>
     ${adminDetailRow('Người thực hiện',actor)}
     ${adminDetailRow('Thời gian',deadlineDate(e.created_at))}
     ${adminDetailRow('Mức độ hệ thống',esc(label))}
     <p class="admin-audit-note">Mức độ do hệ thống phân loại, không có nghĩa mọi tác động đã được đánh giá đầy đủ.</p>
   </section>
   <section class="admin-audit-section" aria-label="Nội dung được ghi nhận">
     <h4>Phạm vi và thông tin liên quan</h4>
     ${facts||'<p class="admin-audit-note">Nhật ký không cung cấp thêm đối tượng hoặc số lượng cụ thể cho sự kiện này.</p>'}
     <p class="admin-audit-note">${esc(info.note)}</p>
   </section>
   <details class="admin-audit-technical">
     <summary>Thông tin kỹ thuật gốc (dành cho đối soát)</summary>
     ${adminDetailRow('Mã sự kiện','#'+Number(e.id))}
     ${adminDetailRow('Mã hành động',esc(e.action||'Không có'))}
     ${adminDetailRow('Thời gian Unix',String(Number(e.created_at)))}
     <div class="admin-audit-raw"><b>Nội dung nguyên bản</b><pre>${esc(e.detail||'Không có nội dung được lưu')}</pre></div>
   </details>
   </div>`});
}

function renderAdmin(){
 const [title,lead]=adminHeading[state.adminTab];
 const content=state.adminTab==='deletions'?adminDeletionQueue():state.adminTab==='groups'?adminGroupsContent():state.adminTab==='overview'?adminOverview():state.adminTab==='ops'&&typeof adminOpsV6==='function'?adminOpsV6():state.adminTab==='registrations'?adminRegistrations():state.adminTab==='users'?adminUsers():state.adminTab==='tickets'?adminTickets():state.adminTab==='broadcast'?adminBroadcast():state.adminTab==='security'?adminSecurity():state.adminTab==='world'?adminWorldContent():state.adminTab==='reports'?adminReportsContent():adminAudit();
 root().innerHTML=`<div class="shell admin-shell">${adminNav()}<main class="admin-page"><div class="admin-header"><div><div class="eyebrow">ADMIN CONSOLE · FULL ACCESS</div><h1 style="margin-top:8px">${title}</h1><p>${lead}</p></div><button type="button" class="btn ghost sm" data-act="notice-settings">${icon('bell',16)} Thông báo</button></div>${content}</main></div>`;
 saveCurrentView();
 const el=$('#admin-ticket-messages');if(el)el.scrollTop=el.scrollHeight;
}
function showCancelDeletionDialog(){
 if(!state.accountDeletion?.pending)return;
 modal({
  title:'Hủy yêu cầu xóa tài khoản',
  description:'Bạn sẽ giữ nguyên tài khoản và dữ liệu. Hãy nhập mật khẩu và PIN hiện tại để xác nhận hủy trước hạn.',
  confirm:'Giữ tài khoản của tôi',
  content:`<div class="field"><label for="cancel-delete-password">Mật khẩu hiện tại</label>
    <input id="cancel-delete-password" class="input" type="password" autocomplete="off" required></div>
    <div class="field"><label for="cancel-delete-pin">PIN hiện tại</label>
    <input id="cancel-delete-pin" class="input" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required></div>`,
  handler:async host=>{
   const password=host.querySelector('#cancel-delete-password')?.value||'';
   const pin=host.querySelector('#cancel-delete-pin')?.value||'';
   if(!password||!pin)throw Error('Vui lòng nhập đủ mật khẩu và mã PIN.');
   await post('/api/me/delete/cancel',{password,pin});
   state.accountDeletion={pending:false,requested_at:null,purge_at:null};
   renderApp();
   toast('Đã hủy yêu cầu xóa. Tài khoản được giữ nguyên.','ok');
  }
 });
}
function showPermanentDeleteDialog(target=null){
 const selfDelete=!target;
 const account=selfDelete?state.user:target;
 if(!account)return;
 if(!selfDelete&&!state.user?.pin_length){
  toast('Hãy bật PIN quản trị trong mục Bảo mật Admin trước khi xóa ngay.','warning');
  return;
 }
 const username=account.username;
 const requirePin=!!state.user?.pin_length;
 const phrase=selfDelete?'XOA SAU 3 NGAY':'XOA VINH VIEN';
 modal({
  title:selfDelete?'Yêu cầu xóa sau 3 ngày':'Xóa vĩnh viễn ngay (Admin)',
  description:selfDelete?
   `Tài khoản ${username} sẽ được lên lịch xóa sau 3 ngày và đăng xuất. Trước hạn, hãy đăng nhập lại và chọn giữ tài khoản nếu đổi ý.`:
   `Toàn bộ dữ liệu và tài khoản ${username} sẽ bị xóa vĩnh viễn ngay sau khi bạn xác nhận.`,
  danger:true,confirm:selfDelete?'Lên lịch xóa 3 ngày':'Xóa vĩnh viễn ngay',
  content:`<div class="delete-confirm-form">
    <p class="hint" style="margin:0 0 14px">Nhập đúng tên tài khoản, ${selfDelete?'mật khẩu và PIN hiện tại':'PIN Admin'} và cụm <b>${phrase}</b>.</p>
    <div class="field"><label for="delete-account-name">Tên tài khoản: <b>${esc(username)}</b></label>
      <input id="delete-account-name" class="input" autocomplete="off" spellcheck="false" maxlength="80"></div>
    ${selfDelete?`<div class="field"><label for="delete-account-password">Mật khẩu hiện tại</label>
      <input id="delete-account-password" class="input" type="password" autocomplete="off" maxlength="128"></div>
    ${requirePin?`<div class="field"><label for="delete-account-pin">PIN hiện tại</label>
      <input id="delete-account-pin" class="input" type="password" inputmode="numeric" autocomplete="off" maxlength="6"></div>`:''}`:adminProofFields()}
    <div class="field"><label for="delete-account-phrase">Nhập <b>${phrase}</b></label>
      <input id="delete-account-phrase" class="input" autocomplete="off" spellcheck="false" maxlength="24"></div>
    <p class="hint" style="margin-top:12px">${selfDelete?'Hãy tải dữ liệu cần giữ trước khi lên lịch xóa.':'Nhóm có thành viên khác sẽ được chuyển quyền chủ nhóm.'}</p>
  </div>`,
  handler:async host=>{
   const val=name=>String(host.querySelector('#delete-account-'+name)?.value||'').trim();
   if(val('name')!==username)throw Error('Tên tài khoản xác nhận không khớp.');
   if(val('phrase')!==phrase)throw Error('Hãy nhập chính xác '+phrase+'.');
   if(selfDelete){
    if(!val('password')||(requirePin&&!val('pin')))throw Error('Nhập mật khẩu và PIN hiện tại.');
    await post('/api/me/delete',{username,password:val('password'),pin:val('pin'),confirm:phrase});
    resetAuthAfterLogout();
    toast('Tài khoản đang chờ xóa. Đăng nhập lại để hủy yêu cầu trước hạn.','ok');
   }else{
    await post(`/api/admin/users/${account.id}/delete`,{username,confirm:phrase,...adminProofValue(host)});
    toast(`Đã xóa vĩnh viễn tài khoản ${username}.`,'ok');
    await loadAdmin();
   }
  }
 });
}
function adminProofFields(){
 if(!state.user?.pin_length)return '<p class="hint">Hãy thiết lập PIN trong Bảo mật Admin trước khi thực hiện.</p>';
 return `<div class="admin-proof-box"><div class="field"><label for="admin-confirm-pin">PIN Admin</label>
 <input class="input" id="admin-confirm-pin" type="password" autocomplete="off" readonly data-admin-proof="1" inputmode="numeric" maxlength="6" required></div></div>`;
}
function unlockAdminProof(input){
 if(!input?.matches?.('input[data-admin-proof]')||!input.readOnly)return;
 input.value='';input.readOnly=false;input.dataset.manuallyUnlocked='1';
}
document.addEventListener('pointerdown',event=>unlockAdminProof(event.target),true);
document.addEventListener('focusin',event=>unlockAdminProof(event.target));
function adminProofValue(host){
 if(!state.user?.pin_length)throw Error('Hãy thiết lập PIN trong Bảo mật Admin trước khi thực hiện.');
 const input=host.querySelector('#admin-confirm-pin');
 const pin=input?.value||'';
 if(!input?.dataset.manuallyUnlocked||!/^\d{4,6}$/.test(pin)||pin.length!==state.user.pin_length)
  throw Error('Hãy chọn ô PIN và nhập đủ mã PIN Admin.');
 return {admin_pin:pin};
}
function sanctionDialog(uid,kind){
 const u=(state.adminData||[]).find(x=>x.id===uid);
 const title=kind==='ban'?'Cấm tài khoản':kind==='lock'?'Khóa tài khoản':'Bỏ hạn chế';
 if(kind==='unban')return modal({title:'Mở khóa / Unban',description:`Khôi phục quyền truy cập cho ${u?.username||'#'+uid}?`,
 confirm:'Xác nhận bỏ hạn chế',content:adminProofFields(),
 handler:async host=>{await post(`/api/admin/users/${uid}/sanction`,{kind:'unban',reason:'',...adminProofValue(host)});toast('Đã mở tài khoản.','ok');await loadAdmin();}});
 modal({title,description:`Áp dụng tức thì cho ${u?.username||'#'+uid}. Người dùng sẽ nhận thông báo và phải rời khỏi tài khoản.`,danger:true,confirm:kind==='ban'?'Cấm ngay':'Khóa ngay',
 content:`<div class="field"><label>Thời gian (phút)</label><input class="input" type="number" id="sanction-minutes" min="1" value="60" placeholder="Bỏ trống nếu cấm vĩnh viễn"></div>
 <div class="hint">${kind==='ban'?'Để trống để cấm vĩnh viễn.':'Khóa tài khoản cần thời hạn cụ thể.'} Ví dụ: 60 = 1 giờ, 1440 = 1 ngày.</div>
 <div class="field"><label>Lý do</label><textarea id="sanction-reason" class="textarea" maxlength="250"></textarea></div>${adminProofFields()}`,
 handler:async host=>{const raw=$('#sanction-minutes').value.trim(),minutes=raw?Number(raw):null;
  if(kind==='lock'&&!minutes)throw Error('Khóa tài khoản cần thời hạn.');
  await post(`/api/admin/users/${uid}/sanction`,{kind,minutes,reason:$('#sanction-reason').value,...adminProofValue(host)});toast('Quyết định đã có hiệu lực.','ok');await loadAdmin();}});
}
function adminDetailRow(label,value){
 return `<div class="admin-detail-row"><span class="muted">${esc(label)}</span><strong>${value}</strong></div>`;
}
async function showAdminOnlineUsers(){
 modal({
  title:'Người dùng đang online',
  description:'Danh sách tài khoản đang có kết nối realtime tại thời điểm kiểm tra.',
  confirm:'Đóng',
  content:`<div id="admin-online-list"><p class="hint" role="status">Đang tải danh sách…</p></div>
  <button type="button" class="btn ghost sm" data-act="admin-online-refresh">${icon('refresh',15)} Làm mới danh sách</button>`
 });
 await refreshAdminOnlineUsers();
}
async function refreshAdminOnlineUsers(){
 const list=$('#admin-online-list');
 if(!list)return;
 try{
  const result=await api('/api/admin/online-users');
  if(!list.isConnected)return;
  const count=document.querySelector('.admin-online-card .stat-value');
  if(count)count.textContent=result.total;
  list.innerHTML=`<p class="hint" role="status">${result.total} người · Cập nhật ${deadlineDate(result.checked_at)}</p>${
   result.users.length?result.users.map(member=>`<div class="people-row admin-online-person">
    ${avatar(member.display_name||member.username,true,'sm')}
    <div class="grow"><b>${esc(member.display_name||member.username)}</b>
    <div class="hint">@${esc(member.username)}${member.public_id?' · #'+esc(member.public_id):''}</div>
    <div class="hint">${member.sessions} phiên · ${member.connections} kết nối</div>
    <div class="hint">Ghi nhận gần nhất ${deadlineDate(member.last_seen)}</div></div>
    <button type="button" class="btn ghost sm" data-act="admin-user-detail" data-id="${member.id}"
     data-username="${esc(member.username)}">Chi tiết</button>
   </div>`).join(''):'<p class="empty">Hiện không có người dùng online.</p>'}`;
 }catch(error){
  if(list.isConnected)list.textContent=error.message;
 }
}
async function userDetails(uid,username){
 const summary=Array.isArray(state.adminData)?state.adminData.find(x=>x.id===uid):null;
 modal({
  title:`Hồ sơ quản trị: ${summary?.username||username||'#'+uid}`,
  description:'Thông tin chỉ dành cho quản trị viên. Lượt xem này được ghi vào nhật ký kiểm toán.',
  confirm:'Đóng',closable:false,
  content:`<div id="admin-user-details-${uid}" class="admin-detail-loading" role="status" aria-live="polite">
   <span class="ui-inline-spinner" aria-hidden="true"></span><span>Đang tải thông tin người dùng...</span>
   <div class="ui-skeleton-line"></div><div class="ui-skeleton-line short"></div><div class="ui-skeleton-line"></div>
  </div>`
 });
 try{
  const result=await api(`/api/admin/users/${uid}/details`);
  const u=result.user;
  const mount=document.getElementById('admin-user-details-'+uid);
  if(!mount)return;
  const contact=value=>esc(value||'Chưa cung cấp');
  const yesno=value=>value?'Bật':'Tắt';
  mount.outerHTML=`<div class="admin-user-detail">
   <div class="admin-detail-section">
     <h3>${icon('users',17)} Thông tin cá nhân</h3>
     ${adminDetailRow('ID tài khoản','#'+u.id)}
     ${adminDetailRow('Tên đăng nhập',esc(u.username))}
     ${adminDetailRow('Tên hiển thị',contact(u.display_name))}
     ${adminDetailRow('Số điện thoại',contact(u.phone))}
     ${adminDetailRow('Email / Gmail',contact(u.email))}
     ${adminDetailRow('Giới thiệu',contact(u.bio))}
     <p class="hint">Số điện thoại và email do người dùng khai báo, chưa xác minh qua SMS/email; không hiển thị trong hồ sơ công khai.</p>
   </div>
   <div class="admin-detail-section">
     <h3>${icon('shield',17)} Tài khoản & quyền riêng tư</h3>
     ${adminDetailRow('Ngày tạo',deadlineDate(u.created_at))}
     ${adminDetailRow('Hoạt động gần nhất',deadlineDate(u.last_seen))}
     ${adminDetailRow('Hiển thị trực tuyến',yesno(u.show_online))}
     ${adminDetailRow('Hiển thị đã đọc',yesno(u.show_receipts))}
     ${adminDetailRow('Trạng thái',u.deletion_purge_at?'<span class="pill warn">Chờ xóa</span>':u.sanction_kind?'<span class="pill bad">'+esc(u.sanction_kind)+'</span>':'<span class="pill good">Hoạt động</span>')}
     ${u.sanction_reason?adminDetailRow('Lý do hạn chế',esc(u.sanction_reason)):''}
     ${u.sanction_until?adminDetailRow('Hạn hạn chế',deadlineDate(u.sanction_until)):''}
     ${u.deletion_requested_at?adminDetailRow('Yêu cầu xóa',deadlineDate(u.deletion_requested_at)):''}
     ${u.deletion_purge_at?adminDetailRow('Dự kiến xóa',deadlineDate(u.deletion_purge_at)):''}
   </div>
   <div class="admin-detail-section">
     <h3>${icon('grid',17)} Hoạt động & tài nguyên</h3>
     ${adminDetailRow('Bạn bè',String(u.friend_count))}
     ${adminDetailRow('Tin nhắn riêng liên quan',String(u.message_count))}
     ${adminDetailRow('Nhóm đã tham gia',String(u.group_count))}
     ${adminDetailRow('Tệp tải lên',String(u.file_count))}
     ${adminDetailRow('Phiên đăng nhập còn hiệu lực',String(u.session_count))}
     ${adminDetailRow('Thiết bị được ghi nhớ',String(u.remembered_count))}
   </div>
   <div class="admin-detail-section">
     <h3>${icon('shield',17)} Kiểm tra bảo mật thiết bị</h3>
     <p class="hint">Địa chỉ IP và vị trí ước tính chỉ dành cho Admin khi xử lý bảo mật. Mọi lần mở được ghi nhật ký.</p>
     <button type="button" class="btn ghost sm" data-act="admin-device-security" data-id="${u.id}">${icon('lock',15)} Xem thông tin bảo mật phiên</button>
   </div>
   <div class="admin-user-actions">
 <button type="button" class="btn ghost sm" data-act="admin-user-edit" data-id="${u.id}">${icon('settings',15)} Chỉnh sửa hồ sơ</button>
 <button type="button" class="btn danger sm" data-act="admin-user-revoke" data-id="${u.id}">${icon('lock',15)} Thu hồi tất cả phiên</button></div>
 <p class="admin-detail-privacy">${icon('lock',16)} Mật khẩu, PIN và thông tin xác thực bí mật không được cung cấp cho Admin.</p>
  </div>`;
 }catch(e){
  const mount=document.getElementById('admin-user-details-'+uid);
  if(mount)mount.textContent='Không thể tải thông tin. '+e.message;
  toast(e.message,'error');
 }
}
async function editUserAsAdmin(uid){
 const response=await api(`/api/admin/users/${uid}/details`);
 const u=response.user;
 modal({title:'Chỉnh sửa tài khoản · '+u.username,
  description:'Chỉnh sửa hồ sơ và thông tin liên hệ. Mọi thay đổi được ghi nhật ký và cần xác minh lại.',
  confirm:'Lưu thay đổi',content:`<div class="admin-edit-form">
   <div class="field"><label for="admin-edit-name">Tên hiển thị</label>
    <input class="input" id="admin-edit-name" maxlength="50" value="${esc(u.display_name||'')}"></div>
   <div class="field"><label for="admin-edit-bio">Giới thiệu</label>
    <textarea class="textarea" id="admin-edit-bio" maxlength="220" rows="3">${esc(u.bio||'')}</textarea></div>
   <div class="field"><label for="admin-edit-phone">Số điện thoại</label>
    <input class="input" id="admin-edit-phone" type="tel" maxlength="40" required value="${esc(u.phone||'')}"></div>
   <div class="field"><label for="admin-edit-email">Email (không bắt buộc)</label>
    <input class="input" id="admin-edit-email" type="email" maxlength="254" value="${esc(u.email||'')}"></div>
   <div class="field"><label for="admin-edit-reason">Lý do thay đổi</label>
    <textarea class="textarea" id="admin-edit-reason" maxlength="250" minlength="5" required></textarea></div>
   ${adminProofFields()}</div>`,
  handler:async host=>{
   const val=id=>host.querySelector('#'+id)?.value||'';
   const payload={display_name:val('admin-edit-name'),bio:val('admin-edit-bio'),
      phone:val('admin-edit-phone'),email:val('admin-edit-email'),
      reason:val('admin-edit-reason').trim(),...adminProofValue(host)};
   if(payload.reason.length<5)throw Error('Vui lòng nhập lý do tối thiểu 5 ký tự.');
   await post(`/api/admin/users/${uid}/edit`,payload);
   toast('Đã cập nhật hồ sơ người dùng.','ok');await loadAdmin();
  }});
}
async function showAdminSessionSecurity(uid){
 const data=await api('/api/admin/users/'+uid+'/session-security');
 const summary=(entries,kind)=>{
  if(!entries?.length)return '<div class="device-session-empty">Không có thiết bị còn hiệu lực.</div>';
  return entries.map(s=>`<article class="admin-device-security-entry">
   <strong>${esc(s.device_label||s.device_name||'Thiết bị chưa đặt tên')}</strong>
   <small>${esc(kind)} · ${esc(s.os_name||'Không rõ hệ điều hành')} · ${esc(s.browser||'Không rõ trình duyệt')}</small>
   ${adminDetailRow(s.ip_address?'Địa chỉ IP':'Mạng (dữ liệu phiên cũ)',esc(s.ip_address||s.network_hint||'Không có dữ liệu'))}
   ${adminDetailRow('Vị trí ước tính',esc(s.location_hint||'Không xác định'))}
   ${adminDetailRow('Hoạt động gần nhất',deadlineDate(s.last_seen))}
   ${adminDetailRow('Hết hạn',deadlineDate(s.expires_at))}
  </article>`).join('');
 };
 modal({
  title:'Bảo mật phiên · '+data.username,
  description:'Chỉ Admin có quyền truy cập. Phiên cũ có thể chỉ có IP rút gọn. Vị trí GeoIP là ước tính. Lượt xem được ghi nhật ký.',
  content:`<div class="admin-device-security-view">
   <h3>Phiên đăng nhập (${data.sessions.length})</h3>
   ${summary(data.sessions,'Phiên đăng nhập')}
   <h3>Thiết bị ghi nhớ (${data.remembered_devices.length})</h3>
   ${summary(data.remembered_devices,'Thiết bị ghi nhớ')}
   <p class="hint">Hệ thống không lưu IP đầy đủ, vị trí GPS hay token đăng nhập trong phần này.</p>
  </div>`,confirm:'Đóng',cancel:null
 });
}
function revokeUserSessionsAsAdmin(uid){
 const u=(state.adminData||[]).find(x=>x.id===uid);
 modal({title:'Thu hồi phiên đăng nhập',danger:true,confirm:'Thu hồi toàn bộ phiên',
  description:`Ngắt toàn bộ phiên và thiết bị đã ghi nhớ của ${u?.username||'#'+uid}. Người dùng sẽ phải đăng nhập lại.`,
  content:`<div class="field"><label for="admin-revoke-reason">Lý do thu hồi</label>
   <textarea class="textarea" id="admin-revoke-reason" minlength="5" maxlength="250" required></textarea></div>
   ${adminProofFields()}`,
  handler:async host=>{
   const reason=host.querySelector('#admin-revoke-reason')?.value.trim()||'';
   if(reason.length<5)throw Error('Nhập lý do tối thiểu 5 ký tự.');
   const result=await post(`/api/admin/users/${uid}/sessions/revoke`,{reason,...adminProofValue(host)});
   toast(`Đã thu hồi ${result.sessions_revoked} phiên và ${result.devices_revoked} thiết bị.`,'ok');
   await loadAdmin();
  }});
}
function registrationDetails(rid){
 const r=(state.adminData||[]).find(x=>x.id===rid);
 if(!r)throw Error('Không tìm thấy yêu cầu.');
 modal({title:'Yêu cầu đăng ký #'+r.id,confirm:'Đóng',
  content:`<div class="admin-user-detail">
    ${adminDetailRow('Tài khoản',esc(r.username))}
    ${adminDetailRow('Số điện thoại',esc(r.phone||'Chưa cung cấp'))}
    ${adminDetailRow('Email',esc(r.email||'Chưa cung cấp'))}
    ${adminDetailRow('Ngày gửi',deadlineDate(r.created_at))}
    ${adminDetailRow('Trạng thái',esc(r.status))}
    <p class="hint">Dữ liệu liên hệ do người đăng ký khai báo, chưa được xác minh độc lập.</p>
   </div>`});
}
function adminInspectionDialog({title,description,summary='',data,list,renderNext}){
 modal({title,description,confirm:'Đóng',cancel:null,content:`${summary}
 <div id="admin-inspection-items" class="admin-inspection-list" tabindex="0" role="region" aria-label="${esc(title)}">
  ${data.length?data.map(list).join(''):'<div class="empty">Chưa có dữ liệu.</div>'}
 </div>
 ${renderNext?'<button id="admin-inspection-more" type="button" class="btn ghost sm">Xem thêm</button>':''}`});
 const items=$('#admin-inspection-items'),more=$('#admin-inspection-more');
 more?.addEventListener('click',async()=>{
  more.disabled=true;
  try{
   const next=await renderNext();
   if(!items.isConnected)return;
   const top=items.scrollTop;
   items.insertAdjacentHTML('beforeend',next.data.map(list).join(''));
   items.scrollTop=top;
   if(!next.hasMore){
    items.focus({preventScroll:true});
    more.remove();
   }
  }catch(error){if(items.isConnected)toast(error.message,'error');}
  finally{more.disabled=false;}
 });
}
async function adminUserFriends(uid,trigger){
 const path=`/api/admin/users/${uid}/friends`;
 const result=await api(path);
 if(!trigger.isConnected||!state.user?.is_admin)return;
 const {user,counts}=result;
 let offset=result.next_offset;
 adminInspectionDialog({
  title:`Bạn bè · ${user.display_name||user.username}`,
  description:'Danh sách kết nối và lời mời kết bạn của tài khoản.',
  summary:`<p class="muted">${counts.accepted} bạn bè · ${counts.total-counts.accepted} lời mời đang chờ</p>`,
  data:result.friends,
  list:friend=>`<article class="admin-inspection-item"><div class="grow">
   <strong>${esc(friend.display_name||friend.username)}</strong>
   <div class="hint">@${esc(friend.username)} · ID #${friend.public_id||friend.id}</div>
   <div class="small">${friend.state==='accepted'?'Đã kết bạn':friend.requested_by===uid?'Lời mời đã gửi':'Lời mời đã nhận'}</div>
   <div class="hint">Ngày gửi lời mời ${deadlineDate(friend.created_at)}</div>
   <div class="hint">Hoạt động gần nhất ${friend.last_seen?deadlineDate(friend.last_seen):'Chưa có dữ liệu'}</div></div>
   <button type="button" class="btn ghost sm" data-act="admin-view-messages" data-id="${uid}" data-peer="${friend.id}">Xem chat</button>
  </article>`,
  renderNext:offset!==null?async()=>{
   const page=await api(path+'?offset='+offset);
   offset=page.next_offset;
   return {data:page.friends,hasMore:offset!==null};
  }:null
 });
}
async function userMessageLog(uid,peer,trigger){
 const path=`/api/admin/users/${uid}/messages`;
 const query=new URLSearchParams({limit:50});
 if(peer)query.set('peer_id',peer);
 const read=()=>api(path+'?'+query);
 const result=await read();
 if(!trigger.isConnected||!state.user?.is_admin)return;
 const {user}=result;
 let before=result.next_before;
 adminInspectionDialog({
  title:result.peer?`Chat · ${user.display_name||user.username} ↔ ${result.peer.display_name||result.peer.username}`:`Lịch sử chat · ${user.display_name||user.username}`,
  description:'Chế độ kiểm duyệt chỉ đọc. Lượt truy cập được ghi vào nhật ký quản trị.',
  summary:`<div class="row"><button type="button" class="btn ghost sm" data-act="admin-user-friends" data-id="${uid}">Xem bạn bè</button>
  ${peer?`<button type="button" class="btn ghost sm" data-act="admin-view-messages" data-id="${uid}">Tất cả chat riêng</button>`:''}</div>`,
  data:result.messages,
  list:m=>`<article class="admin-inspection-item"><div class="grow">
   <div class="small muted">${esc(m.sender)} → ${esc(m.recipient)} · ${date(m.created_at)}</div>
   <div class="admin-inspection-message">${esc(m.body)}</div>
   ${m.attachment_id?`<a href="/api/attachments/${m.attachment_id}" ${m.attachment_mime?.startsWith('image/')?`data-image-viewer data-image-name="${esc(m.attachment_name||'Ảnh đính kèm')}"`:'target="_blank" rel="noopener"'}>${icon('file',14)} ${esc(m.attachment_name||'Tệp đính kèm')}</a>`:''}
   ${peer?'':`<button type="button" class="btn ghost sm" data-act="admin-view-messages" data-id="${uid}" data-peer="${m.sender_id===uid?m.recipient_id:m.sender_id}">Xem cuộc trò chuyện</button>`}
  </div></article>`,
  renderNext:before!==null?async()=>{
   query.set('before',before);
   const page=await read();
   before=page.next_before;
   return {data:page.messages,hasMore:before!==null};
  }:null
 });
}
function grantDialog(tid){
 modal({title:'Cấp mã khôi phục',description:'Xác minh danh tính người yêu cầu bằng kênh độc lập trước khi cấp quyền đặt lại. Mã chỉ hiệu lực 15 phút và được gửi qua cuộc trò chuyện hỗ trợ.',
 confirm:'Cấp mã một lần',content:`<div class="field"><label>Tên tài khoản cần đặt lại</label><input id="grant-username" class="input"></div>
 <label class="row" style="align-items:flex-start;margin:16px 0;color:var(--muted);font-size:12px"><input type="checkbox" id="grant-verified" style="margin-top:4px"><span>Tôi xác nhận đã kiểm tra và xác thực người yêu cầu qua bằng chứng độc lập, không chỉ dựa vào lời khai trong chat.</span></label>${adminProofFields()}`,
 handler:async host=>{if(!$('#grant-verified').checked)throw Error('Bạn phải hoàn tất xác minh danh tính.');
  const username=$('#grant-username').value;await post(`/api/admin/tickets/${tid}/grant`,{username,verified:true,...adminProofValue(host)});
  toast('Đã gửi mã khôi phục tới cuộc trò chuyện.','ok');await loadAdmin();}});
}

async function showAndroidDownload(){
 let release;
 try{release=await api('/api/mobile/release');}
 catch{release={available:false,unavailable_reason:'catalog_unreachable'};}
 const version=release.version,code=release.version_code;
 const valid=release.available&&release.platform==='android'&&release.package==='com.mtunz.web'&&
   /^\d+\.\d+\.\d+$/.test(version)&&Number.isSafeInteger(code)&&code>0&&
   release.download_url==='https://github.com/hoangminhtuan-2322/mtunz/releases/download/android-v'+version+'-code'+code+'/mtunz-android-v'+version+'-code'+code+'.apk';
 if(!valid){
   const previewUrl='https://github.com/hoangminhtuan-2322/mtunz/releases/download/android-preview-v1.1.0-code11-run45333101932/mtunz-android-preview-v1.1.0-code11.apk';
   modal({title:'Tải ứng dụng Android',description:'Bạn có thể tải bản Android thử nghiệm trong khi bản chính thức đang được hoàn thiện.',
     content:'<div class="android-release-panel"><span class="eyebrow">BẢN THỬ NGHIỆM · PREVIEW</span><h3>mtunz 1.1.0</h3><p class="hint">Build 11 · 140,5 MB · Android Native</p><p class="hint">Cài song song với ứng dụng cũ. Chưa hỗ trợ thông báo đẩy khi đóng app; chưa kiểm thử đầy đủ trên điện thoại. Chỉ hỗ trợ Android, chưa hỗ trợ iOS.</p><p class="hint">Bản chính thức sẽ được ưu tiên tự động khi phát hành.</p></div>',
     confirm:'Tải APK Preview',cancel:'Đóng',handler:()=>{window.location.assign(previewUrl);}});
   return;
 }
 const size=Number.isFinite(release.size_bytes)?(release.size_bytes/1048576).toFixed(1)+' MB':'';
 const day=release.published_at?new Date(release.published_at).toLocaleDateString('vi-VN'):'';
 modal({title:'Tải ứng dụng Android',description:'Ứng dụng mtunz native, cùng tài khoản và tin nhắn với website. Chỉ hỗ trợ Android.',
   content:`<div class="android-release-panel"><span class="eyebrow">PHIÊN BẢN CHÍNH THỨC</span><h3>mtunz ${esc(version)}</h3><p class="hint">Build ${code} · ${esc(size)} · ${esc(day)}</p>${release.stale?'<p class="hint">Đang hiển thị thông tin phiên bản đã xác nhận gần nhất.</p>':''}<p class="hint">Tải APK trên điện thoại Android, mở file và xác nhận cài đặt. Hệ thống Android sẽ kiểm tra chữ ký khi cập nhật.</p><p class="hint">iOS chưa được hỗ trợ.</p></div>`,
   confirm:'Tải APK',cancel:'Đóng',handler:()=>{window.location.assign(release.download_url);}});
}
// ==== Centralized interactions (no inline event handlers, all user input escaped) ====
async function clickAction(button){
 const act=button.dataset.act,id=Number(button.dataset.id),kind=button.dataset.kind;
 switch(act){
  case 'android-download':await showAndroidDownload();break;
  case 'copy-member-id':{
    if(!state.user || state.user.is_admin)return;
    const accountId=String(state.user.public_id||state.user.id);
    try{await navigator.clipboard.writeText(accountId);toast('Đã sao chép ID tài khoản: #'+accountId,'ok');}
    catch{toast('ID tài khoản của bạn: #'+accountId,'info');}
    break;
   }
   case 'mode-login':state.mode='login';state.step='username';renderAuth();break;
  case 'mode-register':state.mode='register';renderAuth();break;
  case 'mode-support':state.mode='support';state.supportTicket=null;await loadTickets();renderAuth();break;
  case 'forgot-username':case 'forgot-password':case 'forgot-pin':
   state.supportKind=act.slice(7);state.mode='support';state.supportTicket=null;await loadTickets();renderAuth();break;
  case 'back-login':state.step='username';state.challenge='';renderAuth();break;
  case 'forget-remembered':{
   await post('/api/auth/remembered/forget');
   state.savedDevice=false;state.rememberedDevice=false;
   state.mode='login';state.step='username';state.username='';renderAuth();
   toast('Đã xóa ghi nhớ thiết bị này.','ok');break;
  }
  case 'lock-device':{
   await post('/api/auth/lock');
   clearActiveTab();
   directSendQueues.clear();clearChatReads();v4ClearDraftTimers();v4FailedSends.clear();
   state.user=null;state.ws?.close();state.selected=null;state.groupSelected=null;
   const remembered=await post('/api/auth/remembered');
   state.savedDevice=!!remembered.remembered;
   state.mode='login';state.step=remembered.remembered?'remembered':'username';
   if(remembered.remembered){state.username=remembered.username;state.pinLength=remembered.pin_length;}
   renderAuth();break;
  }
  case 'refresh-registration':await refreshRegistration();break;
  case 'retry-registration':state.regStatus='';state.regName='';state.regPhone='';state.regEmail='';renderAuth();break;
  case 'support-open':state.supportTicket=id;state.ticketMessages=[];await loadTicketMessages();break;
  case 'support-refresh':await loadTickets();renderSupportPage();break;
  case 'support-back':state.supportTicket=null;state.ticketMessages=[];await loadTickets();state.user?renderApp():renderAuth();break;
  case 'delete-own-account':showPermanentDeleteDialog();break;
  case 'cancel-own-deletion':showCancelDeletionDialog();break;
  case 'retry-startup':await setup();break;
  case 'logout':{
   ask('Xác nhận đăng xuất','Bạn muốn kết thúc phiên đăng nhập hiện tại? Mọi thao tác đang thực hiện chưa lưu có thể bị mất.',
    async()=>{await logout();toast('Bạn đã đăng xuất an toàn.','ok');},
    'Đăng xuất',true);
   break;
  }
  case 'chat-older':await loadOlderChat();break;
  case 'chat-latest':await bringChatLatest();break;
  case 'sidebar-more':{
   const current=$('#side-items'),offset=current?.scrollTop||0;
   state.sidebarVisibleCount=Math.max(60,Number(state.sidebarVisibleCount)||60)+60;
   renderSideItems();
   if(current)current.scrollTop=offset;
   current?.querySelector('.side-more')?.focus({preventScroll:true});
   break;
  }
  case 'retry-socket':{
   if(state.ws?.readyState===WebSocket.OPEN){v9ConnectionBanner(true);break;}
   connectSocket(true);break;
  }
  case 'app-tab':await goTab(button.dataset.tab);break;
  case 'rail-more':state.railMoreOpen=!state.railMoreOpen;renderApp();break;
  case 'back-to-list':state.selected=null;state.groupSelected=null;state.tab=state.tab==='groups'?'groups':'messages';renderApp();break;
  case 'open-chat':await openChat(id);break;
  case 'friend-request':await post(`/api/friends/request/${id}`);toast('Đã gửi lời mời kết bạn.','ok');await refreshFriends(false);if(state.peopleQuery){state.peopleResults=(await api(`/api/people/search?q=${encodeURIComponent(state.peopleQuery)}`)).users;}renderApp();break;
  case 'friend-accept':await post(`/api/friends/accept/${id}`);toast('Hai bạn đã trở thành bạn bè!','ok');await refreshFriends(false);if(state.peopleQuery){state.peopleResults=(await api(`/api/people/search?q=${encodeURIComponent(state.peopleQuery)}`)).users;}renderApp();break;
  case 'friend-remove':ask('Xác nhận thay đổi','Hủy kết bạn hoặc từ chối/thu hồi lời mời này?',async()=>{await post(`/api/friends/remove/${id}`);await refreshFriends(false);renderApp();toast('Đã cập nhật danh sách bạn bè.','ok');},'Đồng ý');break;
  case 'chat-restrict':{
   const result=await post(`/api/restrict/${id}`);toast(result.restricted?'Đã ẩn cuộc trò chuyện trong mục Hạn chế.':'Đã bỏ hạn chế.','ok');await refreshFriends(false);renderApp();if(state.selected)await loadMessages();break;
  }
  case 'chat-block':ask('Chặn người dùng','Sau khi chặn, hai bạn không thể nhắn tin hay kết bạn. Lịch sử tin nhắn vẫn tồn tại.',async()=>{
   await post(`/api/blocks/${id}`);await refreshFriends(false);state.selected=null;renderApp();toast('Đã chặn tài khoản.','ok');},'Chặn',true);break;
  case 'unblock':await del(`/api/blocks/${id}`);await refreshFriends(false);renderApp();toast('Đã bỏ chặn.','ok');break;
  case 'load-notifications':{
   const r=await api('/api/notifications');const el=$('#notifications-list');if(el)el.innerHTML=r.notifications.length?r.notifications.map(n=>`<div class="audit-item" style="padding-left:0"><b>${esc(n.body)}</b><div class="hint">${date(n.created_at)}</div></div>`).join(''):'<div class="hint" style="margin-top:12px">Không có thông báo mới.</div>';break;
  }
  case 'admin-tab':state.adminTab=button.dataset.tab;state.adminData=null;await loadAdmin();break;
  case 'admin-audit-detail':await adminAuditDetail(id);break;
  case 'admin-audit-clear':
   state.adminAuditFilter={q:'',action:'',since:0,until:0};await loadAdmin();break;
  case 'admin-audit-more':{
   if(!state.adminAuditMeta?.has_more)return;
   const f=state.adminAuditFilter;
   const params=new URLSearchParams({limit:'100',offset:String(state.adminData?.length||0),
     q:f.q||'',action:f.action||'',since:String(f.since||0),until:String(f.until||0)});
   const result=await api('/api/admin/audit?'+params.toString());
   state.adminData=(state.adminData||[]).concat(result.logs);
   state.adminAuditMeta={total:result.total,has_more:result.has_more,offset:state.adminData.length};
   renderAdmin();break;
  }
  case 'admin-device-security':await showAdminSessionSecurity(id);break;
  case 'admin-user-edit':await editUserAsAdmin(id);break;
  case 'admin-user-revoke':revokeUserSessionsAsAdmin(id);break;
  case 'admin-registration-detail':registrationDetails(id);break;
  case 'admin-refresh':await loadAdmin();break;
  case 'admin-decision':{
   const approve=button.dataset.approve==='1';
   const op=async host=>{await post(`/api/admin/registrations/${id}/decision`,{approve,...adminProofValue(host)});toast(approve?'Đã duyệt! Người dùng có thể tạo mật khẩu/PIN.':'Đã từ chối yêu cầu.','ok');await loadAdmin();};
   modal({title:approve?'Duyệt đăng ký':'Từ chối đăng ký',content:adminProofFields(),
    confirm:approve?'Duyệt':'Từ chối',danger:!approve,handler:op});
   break;
  }
  case 'admin-cancel-deletion':{
   const target=(state.adminData||[]).find(item=>item.user_id===id);
   if(!target)return;
   modal({title:'Hủy yêu cầu xóa tài khoản',description:`Giữ lại tài khoản ${target.username} và toàn bộ dữ liệu.`,
    content:adminProofFields(),confirm:'Hủy lịch xóa',handler:async host=>{
     await post(`/api/admin/users/${id}/delete/cancel`,adminProofValue(host));
     toast('Đã hủy lịch xóa tài khoản.','ok');await loadAdmin();
    }});
   break;
  }
  case 'admin-search-clear':
   state.adminQuery='';state.adminUserStatus='all';state.adminUserSort='oldest';state.adminUserOffset=0;await loadAdmin();break;
  case 'admin-search-page':
   state.adminUserOffset=Number(button.dataset.offset);await loadAdmin();break;
  case 'admin-delete-pending':{
   const candidate=(state.adminData||[]).find(x=>x.user_id===id);
   if(!candidate)throw Error('Không tìm thấy yêu cầu xóa.');
   showPermanentDeleteDialog({id:candidate.user_id,username:candidate.username});break;
  }
  case 'admin-delete-user':{
   const candidate=(state.adminData||[]).find(x=>x.id===id);
   if(!candidate)throw Error('Không tìm thấy người dùng được chọn.');
   showPermanentDeleteDialog(candidate);break;
  }
  case 'admin-online-users':await showAdminOnlineUsers();break;
  case 'admin-online-refresh':await refreshAdminOnlineUsers();break;
  case 'admin-user-detail':await userDetails(id,button.dataset.username);break;
  case 'admin-user-friends':await adminUserFriends(id,button);break;
  case 'admin-view-messages':await userMessageLog(id,Number(button.dataset.peer),button);break;
  case 'admin-sanction':sanctionDialog(id,button.dataset.kind);break;
  case 'admin-show-spam':state.adminShowSpam=!state.adminShowSpam;renderAdmin();break;
  case 'admin-open-ticket':{
   const request=++adminTicketSequence,owner=state.user.id;
   state.adminTicket=id;state.adminTicketMessages=[];
   renderAdmin();
   const result=await api(`/api/admin/tickets/${id}/messages`);
   if(request===adminTicketSequence&&state.user?.id===owner&&state.adminTab==='tickets'&&state.adminTicket===id){
    state.adminTicketMessages=result.messages;renderAdmin();
   }
   break;
  }
  case 'admin-recovery-grant':grantDialog(id);break;
  case 'admin-support-intake':{
   const paused=!state.adminSupportPaused,title=paused?'Tạm ngừng nhận hỗ trợ':'Nhận hỗ trợ trở lại';
   modal({title,description:paused?'Người dùng sẽ thấy thông báo tạm ngừng khi tạo phiếu mới. Phiếu đang mở vẫn trao đổi được.':'Người dùng có thể tạo phiếu hỗ trợ mới.',
    content:adminProofFields(),confirm:title,handler:async host=>{
     await api('/api/admin/support/intake',{method:'PATCH',data:{paused,...adminProofValue(host)}});
     toast(paused?'Đã tạm ngừng nhận phiếu mới.':'Đã mở lại tiếp nhận hỗ trợ.','ok');
     await loadAdmin();
    }});
   break;
  }
  case 'admin-delete-ticket':{
   modal({title:'Xóa cuộc trò chuyện #'+id,danger:true,confirm:'Xóa cuộc trò chuyện',
    description:'Nội dung, tin nhắn và mã khôi phục của phiếu này sẽ bị xóa vĩnh viễn.',
    content:adminProofFields(),handler:async host=>{
     await api('/api/admin/tickets/'+id,{method:'DELETE',data:adminProofValue(host)});
     if(state.adminTicket===id){adminTicketSequence++;state.adminTicket=null;state.adminTicketMessages=[];}
     toast('Đã xóa cuộc trò chuyện hỗ trợ.','ok');
     await loadAdmin();
    }});
   break;
  }
  case 'admin-close-ticket':{
    const status=button.dataset.status;
    const labels={closed:'Đóng phiếu',open:'Mở lại phiếu',spam:'Đánh dấu spam'};
    modal({title:labels[status],content:adminProofFields(),confirm:labels[status],handler:async host=>{
     await post(`/api/admin/tickets/${id}/status`,{status,...adminProofValue(host)});
     if(status==='spam'&&!state.adminShowSpam&&state.adminTicket===id)state.adminTicket=null;
     toast('Đã cập nhật phiếu hỗ trợ.','ok');
     await loadAdmin();
    }});
    break;
   }

 }
}
// A login password field begins read-only to prevent automatic password restoration.
// Only an intentional tap or keyboard focus unlocks a clean, empty field.
function unlockLoginPassword(input){
 if(!input?.matches?.('form[data-form="login-password"] input[data-manual-password]')||!input.readOnly)return;
 input.value='';
 input.readOnly=false;
 input.dataset.manuallyUnlocked='1';
}
document.addEventListener('pointerdown',event=>unlockLoginPassword(event.target),true);
document.addEventListener('focusin',event=>unlockLoginPassword(event.target));
window.addEventListener('pageshow',()=>{
 if(state.user)return;
 const input=$('form[data-form="login-password"] input[data-manual-password]');
 if(input){input.value='';input.readOnly=true;delete input.dataset.manuallyUnlocked;}
});
function setPasswordVisibility(button,visible){
 const field=button.closest('.password-eye-wrap')?.querySelector('input');
 if(!field||!/password/i.test(field.name)||!['password','text'].includes(field.type))return;
 field.type=visible?'text':'password';
 button.setAttribute('aria-pressed',String(visible));
 button.setAttribute('aria-label',visible?'Ẩn mật khẩu':'Hiển thị mật khẩu');
 button.classList.toggle('is-revealed',visible);
}
function maskVisiblePasswords(){
 document.querySelectorAll('[data-password-eye][aria-pressed="true"]').forEach(button=>setPasswordVisibility(button,false));
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)maskVisiblePasswords();});
window.addEventListener('pagehide',maskVisiblePasswords);
window.addEventListener('pageshow',maskVisiblePasswords);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-password-eye]');
 if(!button)return;
 setPasswordVisibility(button,button.getAttribute('aria-pressed')!=='true');
});
document.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-act]');if(!btn||btn.disabled)return;
 // Only potentially slow navigation/actions show a spinner. No continuous animations.
 const busy=btn.tagName==='BUTTON'&&['app-tab','admin-tab','admin-refresh',
   'admin-online-users','admin-online-refresh','admin-user-detail','admin-user-friends','admin-view-messages','refresh-registration','admin-decision'].includes(btn.dataset.act);
 if(busy){btn.disabled=true;btn.classList.add('is-loading');btn.setAttribute('aria-busy','true');}
 try{await clickAction(btn);}catch(e){toast(e.message,'error');}
 finally{if(busy&&btn.isConnected){btn.disabled=false;btn.classList.remove('is-loading');btn.removeAttribute('aria-busy');}}
});
document.addEventListener('input',event=>{
 if(event.target.id==='side-filter'){
  state.sideFilter=event.target.value.trim();
  state.sidebarVisibleCount=60;
  renderSideItems();
}
 if(event.target.id==='chat-text'&&event.target.value&&state.ws?.readyState===WebSocket.OPEN){
  const group=state.tab==='groups'&&state.groupSelected;
  if(!state.selected&&!group)return;
  const payload=group?{type:'group-typing',group_id:state.groupSelected,on:true}:{type:'typing',to:state.selected,on:true};
  const context=group?'group:'+state.groupSelected:'dm:'+state.selected;
  const at=Date.now();
  if(context!==typingContext||at-typingLastSent>1700){
    state.ws.send(JSON.stringify(payload));typingLastSent=at;typingContext=context;
  }
  clearTimeout(typingTimer);
  typingTimer=setTimeout(()=>{
    if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify({...payload,on:false}));
    typingLastSent=0;typingContext='';
  },1200);
 }
});
document.addEventListener('change',event=>{
 if(event.target.id==='pin-length'){
  const n=Number(event.target.value);
  for(const name of ['new-pin','repeat-pin']){
   const el=$('#'+name);if(el){el.minLength=n;el.maxLength=n;el.pattern=`[0-9]{${n}}`;el.removeAttribute('placeholder');}
  }
 }
});
document.addEventListener('keydown',e=>{
 if(e.target.id==='chat-text'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
  e.preventDefault();
  const form=e.target.closest('form'),send=form?.querySelector('.send');
  if(form&&send&&!send.disabled)form.requestSubmit(send);
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;
 event.preventDefault();const key=form.dataset.form,fd=new FormData(form);
 const val=k=>String(fd.get(k)||'').trim();
 const button=form.querySelector('[type=submit],button:not([type])');
 if(button)button.disabled=true;
 try{
  switch(key){
   case 'login-username':{
    const r=await post('/api/auth/start',{username:val('username')});
    state.username=r.username;state.loginIsAdmin=!!r.is_admin;state.step='password';renderAuth();break;
   }
   case 'login-password':{
    const passwordField=form.querySelector('input[data-manual-password]');
     if(!passwordField?.dataset.manuallyUnlocked){
       if(passwordField)passwordField.value='';
       throw Error('Vui lòng chọn ô mật khẩu và nhập lại để đăng nhập.');
     }
     const r=await post('/api/auth/password',{username:state.username,password:String(fd.get('password')||'')});
    if(r.admin){state.user=(await api('/api/me')).user;toast('Chào mừng quản trị viên!','ok');await enterApp();}
    else{state.challenge=r.challenge;state.pinLength=r.pin_length;state.step='pin';renderAuth();}
    break;
   }
   case 'login-pin':{
    const unlocked=await post('/api/auth/pin',{challenge:state.challenge,pin:val('pin'),
      remember_device:fd.get('remember_device')==='on'});
    if(unlocked.next==='admin-approval'){
      state.adminApprovalToken=unlocked.approval_token;state.step='approval';
      renderAuth();startAdminApprovalPolling();
      toast('Thiết bị thứ hai đang chờ phiên Admin hiện tại phê duyệt.','info');
      break;
    }
    state.savedDevice=!!unlocked.remembered;
    state.rememberedDevice=state.savedDevice;
    state.user=(await api('/api/me')).user;
    toast(state.savedDevice?'Đã ghi nhớ thiết bị. Lần sau chỉ cần PIN.':'Đăng nhập thành công!','ok');
    await enterApp();break;
   }
   case 'login-remembered':{
    await post('/api/auth/remembered/unlock',{pin:val('pin')});
    state.savedDevice=true;state.rememberedDevice=true;
    state.user=(await api('/api/me')).user;
    toast('Đã mở khóa bằng mã PIN.','ok');await enterApp();break;
   }
   case 'register-request':{
    const r=await post('/api/registration/request',{username:val('username'),phone:val('phone'),email:val('email')});
    state.regName=r.username;state.regStatus=r.status;state.regPhone=r.phone||'';state.regEmail=r.email||'';renderAuth();break;
   }
   case 'register-complete':{
    const pw=String(fd.get('new-password')||''),pw2=String(fd.get('repeat-password')||'');
    const pin=val('new-pin'),pin2=val('repeat-pin'),pinLen=Number(fd.get('pin_length'));
    if(pw!==pw2)throw Error('Hai lần nhập mật khẩu không khớp.');
    if(pin!==pin2)throw Error('Hai lần nhập PIN không khớp.');
    if(pin.length!==pinLen)throw Error(`PIN phải đúng ${pinLen} chữ số.`);
    await post('/api/registration/complete',{username:state.regName,password:pw,pin,pin_length:pinLen,phone:val('phone')||undefined,accepted_terms:fd.get('accepted_terms')==='on'});
    state.username=state.regName;state.regStatus='';state.savedDevice=false;state.rememberedDevice=false;
    state.user=(await api('/api/me')).user;
    toast('Tạo tài khoản thành công. Hãy đặt tên hiển thị để bắt đầu.','ok');
    await enterApp();break;
   }
   case 'support-new':{
    state.supportKind=val('kind');
    const claim=val('claim');
    let r;
    try{r=await post('/api/support/tickets',{kind:state.supportKind,claim});}
    catch(error){
     if(error.code==='support_paused'){state.supportPaused=true;renderSupportPage();}
     throw error;
    }
    state.tickets.unshift({id:r.id,kind:state.supportKind,claim,status:'open'});
    state.supportPaused=false;
    state.supportTicket=r.id;state.ticketMessages=[];renderSupportPage();
    toast('Đã mở cuộc trò chuyện với admin.','ok');break;
   }
   case 'support-reply':{
    if(!state.supportTicket)throw Error('Chưa mở phiếu hỗ trợ.');
    const ticket=state.supportTicket,owner=state.user?.id,field=form.elements.body;
    const submitted=field.value;
    const {message}=await post(`/api/support/tickets/${ticket}/messages`,{body:val('body')});
    if(state.user?.id===owner&&state.supportTicket===ticket){
     if(field.isConnected&&field.value===submitted)field.value='';
     appendSupportMessage(ticket,message);
    }
    break;
   }
   case 'support-reset':{
    const pinLength=Number(fd.get('pin_length'));
    await post('/api/support/reset',{code:val('code'),new_value:String(fd.get('new_value')||''),pin_length:pinLength});
    toast('Đặt lại thành công. Các phiên đăng nhập cũ đã bị thu hồi.','ok');
    state.supportTicket=null;state.mode='login';state.step='username';state.user?await logout():renderAuth();break;
   }
   case 'search-people':{
    state.peopleQuery=val('q');state.peopleResults=(await api('/api/people/search?q='+encodeURIComponent(state.peopleQuery))).users;
    renderApp();break;
   }
   case 'send-message':{
    if(state.uploading)throw Error('Tệp vẫn đang tải lên.');
    if(workflowUpload?.status==='failed'&&workflowCurrent(workflowUpload.ctx))throw Error('Thử tải tệp lại hoặc bỏ tệp trước khi gửi.');
    const content=String(fd.get('body')||'').trim();
    if(!content&&!state.pendingAttachment)return;
    const recipient=state.selected,attachment=state.pendingAttachment,owner=state.user.id;
    if(!recipient)throw Error('Hãy chọn người nhận.');
    if($('#chat-messages')?.dataset.moreAfter==='true'){
     await bringChatLatest();
     if(!form.isConnected||state.selected!==recipient||state.user?.id!==owner)return;
    }
    const key=owner+':'+recipient;
    const queue=directSendQueues.get(key)||[];
    if(queue.length>=20)throw Error('Đang chờ gửi nhiều tin nhắn. Vui lòng đợi một chút.');
    const reply=state.replyTo?.scope==='dm'?state.replyTo.id:null;
    const payload={recipient_id:recipient,body:content,attachment_id:attachment?.id||null,
      reply_to:reply,client_message_id:v4Nonce()};
    const message={...payload,id:--nextPendingMessageId,sender_id:owner,
      created_at:Math.floor(Date.now()/1000),reactions:[],pending:true,attachment};
    clearSentComposer(form,'dm:'+recipient);
    appendDirectMessage(message,true);
    queue.push({payload,message,attachment});
    if(queue.length===1){
      directSendQueues.set(key,queue);
      void sendQueuedDirectMessages(key,queue);
    }
    break;
   }
   case 'settings-pin':{
    await post('/api/me/pin',{old_pin:val('old_pin'),new_pin:val('new_pin'),pin_length:Number(fd.get('pin_length'))});
    state.user.pin_length=Number(fd.get('pin_length'));state.savedDevice=false;state.rememberedDevice=false;
    toast('Đã đổi PIN. Các thiết bị ghi nhớ trước đó đã bị thu hồi.','ok');renderApp();break;
   }
   case 'settings-password':{
    await post('/api/me/password',{old_password:String(fd.get('old_password')||''),new_password:String(fd.get('new_password')||'')});
    state.savedDevice=false;state.rememberedDevice=false;
    toast('Đã đổi mật khẩu, đăng xuất thiết bị khác và thu hồi ghi nhớ thiết bị.','ok');renderApp();break;
   }
   case 'admin-pin-setup':{
    const pin=val('pin'),n=Number(fd.get('pin_length'));
    if(pin.length!==n)throw Error(`PIN phải có đúng ${n} chữ số.`);
    await post('/api/me/pin/setup',{current_password:String(fd.get('current_password')||''),pin,pin_length:n});
    state.user.pin_length=n;
    toast('Đã bật PIN quản trị. Các lần đăng nhập mới cần mật khẩu và PIN.','ok');await loadAdmin();break;
   }
   case 'admin-pin-change':{
    const n=Number(fd.get('pin_length')),pin=val('new_pin');
    if(pin.length!==n)throw Error(`PIN phải có đúng ${n} chữ số.`);
    await post('/api/me/pin',{old_pin:val('old_pin'),new_pin:pin,pin_length:n});
    state.user.pin_length=n;state.savedDevice=false;
    toast('Đã đổi PIN và thu hồi các thiết bị ghi nhớ.','ok');await loadAdmin();break;
   }
   case 'admin-password':{
    const pw=String(fd.get('new_password')||'');if(pw!==String(fd.get('repeat_password')||''))throw Error('Hai lần nhập mật khẩu mới không khớp.');
    modal({title:'Đổi mật khẩu Admin',content:adminProofFields(),confirm:'Đổi mật khẩu',handler:async host=>{
     await post('/api/me/password',{new_password:pw,...adminProofValue(host)});
     state.savedDevice=false;state.rememberedDevice=false;
     toast('Đã đổi mật khẩu quản trị.','ok');await loadAdmin();
    }});
    break;
   }
   case 'admin-capacity':{
    const max_users=Number(fd.get('max_users'));
     modal({title:'Thay đổi giới hạn tài khoản',description:`Giới hạn mới: ${max_users.toLocaleString('vi-VN')} tài khoản. Xác minh quyền quản trị.`,
       confirm:'Cập nhật giới hạn',content:adminProofFields(),
       handler:async host=>{await post('/api/admin/capacity',{max_users,...adminProofValue(host)});toast('Đã cập nhật giới hạn người dùng.','ok');await loadAdmin();}});
     break;
   }
   case 'admin-search-users':
    state.adminQuery=val('q');state.adminUserStatus=val('status');state.adminUserSort=val('sort');state.adminUserOffset=0;
    await loadAdmin();break;
   case 'admin-audit-search':{
    const since=val('since'),until=val('until');
    const start=since?Math.floor(new Date(since+'T00:00:00').getTime()/1000):0;
    const end=until?Math.floor(new Date(until+'T23:59:59').getTime()/1000):0;
    if(start&&end&&start>end)throw Error('Ngày bắt đầu không thể sau ngày kết thúc.');
    state.adminAuditFilter={q:val('q'),action:val('action'),since:start,until:end};
    await loadAdmin();break;
   }
   case 'admin-ticket-reply':{
    const ticket=Number(form.dataset.ticketId),body=val('body');
    if(!ticket||!body)return;
    modal({title:`Gửi phản hồi cho phiếu #${ticket}`,content:adminProofFields(),confirm:'Gửi phản hồi',handler:async host=>{
     await post(`/api/admin/tickets/${ticket}/messages`,{body,...adminProofValue(host)});
     if(state.adminTab==='tickets'&&state.adminTicket===ticket)await loadAdmin();
    }});
    break;
   }
   case 'admin-broadcast':{
    const message=val('body');
    modal({title:'Gửi thông báo toàn hệ thống',description:`Nội dung gửi tới tất cả người dùng: “${short(message,100)}”`,
      confirm:'Xác nhận gửi',content:adminProofFields(),handler:async host=>{
       const result=await post('/api/admin/broadcast',{body:message,...adminProofValue(host)});
       toast(`Đã gửi đến ${result.recipients} người dùng.`,'ok');await loadAdmin();
      }});
    break;
   }
  }
 }catch(e){
  if(e.maintenance)return;
  const authField={'login-username':'username','login-password':'password',
    'login-pin':'pin','login-remembered':'pin'}[key];
  if(!authField||!showAuthFieldError(form,authField,authFailureText(key,e)))
   toast(e.message,'error');
 }
 finally{
   if(button&&button.isConnected){
    button.disabled=false;button.classList.remove('is-loading');button.removeAttribute('aria-busy');
   }
  }
});
document.addEventListener('visibilitychange',()=>{
 reportAlertVisibility();
 // A hidden tab/app is no longer an active chat session. Closing gracefully
 // broadcasts offline immediately. Short server timeout is a crash fallback.
 if(document.hidden&&state.ws?.readyState===WebSocket.OPEN)
  state.ws.close(1000,'App backgrounded');
});
window.addEventListener('pagehide',()=>{
 pageIsUnloading=true;
 reportAlertVisibility(state.ws,false);
 if(state.ws?.readyState===WebSocket.OPEN)state.ws.close(1000,'Page closed');
});
window.addEventListener('pageshow',()=>{
 pageIsUnloading=false;
 reportAlertVisibility();
 if(state.user&&state.ws?.readyState!==WebSocket.OPEN&&state.ws?.readyState!==WebSocket.CONNECTING)
  connectSocket(true);
});
document.addEventListener('DOMContentLoaded', setup);


let maintenanceBannerStatus=null,maintenanceCountdown=0;
function drawMaintenanceBanner(){
 const banner=$('#maintenance-banner'),status=maintenanceBannerStatus;
 if(!banner)return;
 if(!status){banner.hidden=true;return;}
 const schedule=status.schedule;
 const at=Date.now()/1000-status.clientOffset;
 banner.hidden=!(status.manual||schedule&&schedule.ends_at>at);
 if(banner.hidden)return;
 if(status.manual||schedule.starts_at<=at){
  banner.textContent='🔧 Hệ thống đang bảo trì'+(schedule&&schedule.starts_at<=at?' · '+schedule.reason:'');
  return;
 }
 const minutes=Math.max(1,Math.ceil((schedule.starts_at-at)/60));
 const duration=minutes>=60?Math.floor(minutes/60)+' giờ '+minutes%60+' phút':minutes+' phút';
 banner.textContent='🔧 Bảo trì sau '+duration+' · '+schedule.reason;
}
function applyMaintenanceBanner(status){
 if(!status)return;
 maintenanceBannerStatus={...status,clientOffset:Date.now()/1000-status.server_time};
 drawMaintenanceBanner();
 clearInterval(maintenanceCountdown);
 if(status.schedule)maintenanceCountdown=setInterval(drawMaintenanceBanner,15000);
}
async function refreshMaintenanceBanner(){
 try{applyMaintenanceBanner(await api('/api/system/maintenance'));}catch{}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMaintenanceBanner();});
if($('#maintenance-banner')){
 void refreshMaintenanceBanner();
 setInterval(()=>{if(!document.hidden)void refreshMaintenanceBanner();},60000);
}
