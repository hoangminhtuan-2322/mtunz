'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const esc = (v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = t=>t?new Date(t*1000).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const clock = t=>t?new Date(t*1000).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'';
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
const avatar=(name,online=false,size='')=>`<div class="avatar ${size} ${online?'online':''}">${esc(initials(name))}</div>`;
const state={user:null,ws:null,mode:'login',step:'username',username:'',challenge:'',pinLength:4,
 regName:'',regStatus:'',supportKind:'username',supportTicket:null,tickets:[],ticketMessages:[],
 tab:'messages',friends:[],blocks:[],selected:null,messages:[],adminTab:'overview',adminData:null,
 adminTicket:null,adminTicketMessages:[],adminQuery:'',typing:false};
let toastTimer=0,typingTimer=0,socketRetry=null;

async function api(url,{method='GET',data}={}){
  let response, payload;
  try{
    response=await fetch(url,{method,credentials:'same-origin',headers:data!==undefined?{'Content-Type':'application/json'}:{},body:data!==undefined?JSON.stringify(data):undefined});
    payload=await response.json();
  }catch(e){throw Error('Không kết nối được máy chủ. Vui lòng thử lại.');}
  if(!response.ok){
    const detail=payload?.detail;
    if(detail&&typeof detail==='object'&&detail.code==='sanction')showSanction(detail);
    throw Error(typeof detail==='string'?detail:detail?.reason||'Yêu cầu không thành công.');
  }
  return payload;
}
const post=(url,data={})=>api(url,{method:'POST',data});
const del=url=>api(url,{method:'DELETE'});
const root=()=>$('#app');
function toast(message,type='info'){
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;
  $('#toast-root').append(el);setTimeout(()=>{el.style.opacity=0;el.style.transform='translateX(30px)';setTimeout(()=>el.remove(),200)},4200);
}
function modal({title,description='',content='',danger=false,confirm='Đồng ý',cancel='Hủy',closable=true,handler=()=>{}}){
  const host=$('#modal-root');
  host.innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}${content}
    <div class="modal-actions">${closable?`<button class="btn ghost" id="modal-cancel">${esc(cancel)}</button>`:''}
    <button class="btn ${danger?'danger':'primary'}" id="modal-confirm">${esc(confirm)}</button></div></div></div>`;
  if(closable)$('#modal-cancel').onclick=()=>host.replaceChildren();
  $('#modal-confirm').onclick=async()=>{
    const btn=$('#modal-confirm');btn.disabled=true;
    try{const res=await handler(host);if(res!==false)host.replaceChildren();}
    catch(e){toast(e.message,'error');btn.disabled=false;}
  };
}
function ask(title,description,handler,confirm='Xác nhận',danger=false){modal({title,description,handler,confirm,danger});}
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
 try{
   const res=await api('/api/me');state.user=res.user;
   if(state.user){await enterApp();}
   else{
      const r=await api('/api/registration/status');
      const active=r.requests.find(v=>['pending','approved'].includes(v.status));
      if(active){state.mode='register';state.regName=active.username;state.regStatus=active.status;}
      renderAuth();connectSocket();
   }
 }catch(e){toast(e.message,'error');renderAuth();connectSocket();}
}
function connectSocket(){
 if(socketRetry){clearTimeout(socketRetry);socketRetry=null;}
 if(state.ws){state.ws.onclose=null;state.ws.close();}
 const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 state.ws=socket;
 socket.onmessage=async ev=>{
   let data;try{data=JSON.parse(ev.data)}catch{return;}
   const t=data.type;
   if(t==='account-sanction'){showSanction(data);return;}
   if(t==='session-ended'){toast(data.reason||'Phiên đã kết thúc','error');state.user=null;await post('/api/auth/logout').catch(()=>{});renderAuth();return;}
   if(t==='registration-updated'){
     if(state.mode==='register'&&data.username===state.regName){state.regStatus=data.status;renderAuth();toast(data.status==='approved'?'Admin đã duyệt. Bạn có thể hoàn tất tạo tài khoản.':'Yêu cầu được cập nhật.','ok');}
     if(state.user?.is_admin)loadAdmin();
   }
   if(t==='friends-updated'){if(state.user&&!state.user.is_admin)await refreshFriends();}
   if(t==='message'){
     if(state.user&&!state.user.is_admin){
       const m=data.message;
       if(state.selected && (m.sender_id===state.selected||m.recipient_id===state.selected))await loadMessages(false);
       await refreshFriends();
       if(m.sender_id!==state.user.id && state.selected!==m.sender_id)toast('Bạn có tin nhắn mới','info');
     }
   }
   if(t==='read' && state.selected===data.by)await loadMessages(false);
   if(t==='typing' && state.selected===data.from_id){const el=$('#typing-text');if(el){el.textContent=data.on?'Đang nhập tin nhắn…':'';}}
   if(t==='presence' && state.user && !state.user.is_admin){const friend=state.friends.find(x=>x.other_id===data.user_id);if(friend){friend.online=data.online;renderSideItems();updateChatHeader();}}
   if(t==='announcement'){toast('📢 '+data.body,'info');notifyBrowser('Thông báo admin: '+data.body);}
   if(t==='message'&&data.message.sender_id!==state.user?.id)notifyBrowser('Có tin nhắn từ bạn bè');
   if(state.user&&!state.user.is_admin)await extraSocket(data);
   if(t==='support-updated'||t==='support-message'){
     if(state.user?.is_admin){await loadAdmin();}
     else if(state.supportTicket && (!data.ticket_id||data.ticket_id===state.supportTicket)){await loadTicketMessages();}
   }
 };
 socket.onclose=()=>{if(state.ws===socket)socketRetry=setTimeout(()=>connectSocket(),2500);};
}
async function enterApp(){
 if(!state.user)return;
 state.selected=null;state.tab='messages';
 if(state.user.is_admin){await loadAdmin();}
 else{await refreshFriends(false);await refreshGroups(false);renderApp();}
 connectSocket();
}
async function logout(){try{await post('/api/auth/logout');}catch{}state.user=null;state.selected=null;state.ws?.close();state.mode='login';state.step='username';renderAuth();connectSocket();}

// ==== Onboarding and anonymous support ====
function authArt(){return `<aside class="auth-art"><div class="logo"><span class="logo-mark">m</span> mtunz<span style="color:#8984fc">.</span></div>
<div class="art-content"><span class="eyebrow">A new way to stay connected</span>
<h1>Nơi mọi kết nối<br>trở nên <span class="gradient-text">gần gũi.</span></h1>
<p>Trò chuyện theo thời gian thực, giữ liên lạc với bạn bè, và tận hưởng một không gian riêng tư, tinh giản.</p>
<div class="mock-chat"><div class="mock-head">${avatar('Linh',true,'sm')}<div><b>Linh Nguyễn</b><div class="small muted"><span class="dot"></span>Đang hoạt động</div></div></div>
<div class="mock-msg">Cuối tuần mình có hẹn nhé! ✨</div><div class="mock-msg me">Okii, gặp nhau thứ Bảy nha! 💜</div>
<div class="mock-foot">✓✓ Đã xem · 08:42</div></div></div>
<div class="auth-art-footer"><span>✦ Realtime messaging</span><span>✦ Secure login</span><span>✦ Friends first</span></div></aside>`;}
function inputField(label,name,type='text',placeholder='',attr=''){return `<div class="field"><label for="${name}">${label}</label><input class="input" id="${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" ${attr} required></div>`;}
function authTabs(){return `<div class="auth-nav"><button class="${state.mode==='login'?'active':''}" data-act="mode-login">Đăng nhập</button>
<button class="${state.mode==='register'?'active':''}" data-act="mode-register">Tạo tài khoản</button>
<button class="${state.mode==='support'?'active':''}" data-act="mode-support">Hỗ trợ</button></div>`;}
function authLogin(){
 const step=state.step;
 const forms={
 username:`<span class="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h1>Tiếp tục cuộc trò chuyện.</h1>
 <p class="hint">Nhập tên tài khoản duy nhất để bắt đầu.</p><div class="auth-step"><span class="active"></span><span></span><span></span></div>
 <form data-form="login-username">${inputField('Tên tài khoản','username','text','Ví dụ: minh_anh','autocomplete="username" value="'+esc(state.username)+'"')}
 <button class="btn primary full" type="submit">Tiếp tục ${icon('chevron',17)}</button></form>`,
 password:`<span class="eyebrow">BƯỚC ${state.username==='admin'?'1/1':'2/3'}</span><h1>Chào ${esc(state.username)} 👋</h1>
 <p class="hint">Nhập mật khẩu để ${state.username==='admin'?'mở trang quản trị.':'chuyển sang lớp xác minh PIN.'}</p>
 <div class="auth-step"><span class="active"></span><span class="active"></span><span></span></div>
 <form data-form="login-password">${inputField('Mật khẩu','password','password','Nhập mật khẩu','autocomplete="current-password"')}
 <button type="submit" class="btn primary full">${state.username==='admin'?'Vào trang quản trị':'Xác nhận mật khẩu'} ${icon('chevron',17)}</button></form>
 <button class="linkbtn" data-act="back-login">${icon('back',13)} Đổi tên tài khoản</button>`,
 pin:`<span class="eyebrow">BƯỚC 3/3 · XÁC MINH</span><h1>Thêm một lớp an toàn.</h1>
 <p class="hint">Nhập mã PIN ${state.pinLength} chữ số đã thiết lập khi tạo tài khoản.</p>
 <div class="auth-step"><span class="active"></span><span class="active"></span><span class="active"></span></div>
 <form data-form="login-pin">${inputField('Mã PIN','pin','password','•'.repeat(state.pinLength),`inputmode="numeric" pattern="[0-9]{${state.pinLength}}" minlength="${state.pinLength}" maxlength="${state.pinLength}" autocomplete="one-time-code"`)}
 <button type="submit" class="btn primary full">Đăng nhập ${icon('check',17)}</button></form>
 <button class="linkbtn" data-act="back-login">${icon('back',13)} Đăng nhập lại</button>`
 };
 return forms[step]+`<div class="sep"></div><div class="row between"><span class="small muted">Bạn gặp khó khăn?</span><div class="row" style="gap:9px;flex-wrap:wrap;justify-content:flex-end">
 <button class="linkbtn small" data-act="forgot-username">Quên tên</button><button class="linkbtn small" data-act="forgot-password">Quên mật khẩu</button><button class="linkbtn small" data-act="forgot-pin">Quên PIN</button></div></div>`;
}
function authRegister(){
 if(state.regStatus==='pending')return `<div class="onboard-center"><div class="wait-orbit"></div><span class="eyebrow">ĐANG CHỜ PHÊ DUYỆT</span>
 <h1>Yêu cầu đã được gửi!</h1><p class="hint" style="margin-top:15px">Tài khoản <b>${esc(state.regName)}</b> đang chờ quản trị viên xét duyệt. Khi được duyệt, bạn mới thiết lập mật khẩu và mã PIN.</p>
 <div class="info-strip">Màn hình sẽ tự cập nhật khi admin duyệt. Bạn cũng có thể kiểm tra lại thủ công.</div>
 <button class="btn ghost full" data-act="refresh-registration">${icon('refresh')} Kiểm tra trạng thái</button></div>`;
 if(state.regStatus==='denied')return `<span class="eyebrow">YÊU CẦU BỊ TỪ CHỐI</span><h1>Chưa thể đăng ký.</h1><p class="hint">Admin đã từ chối yêu cầu <b>${esc(state.regName)}</b>. Bạn có thể gửi yêu cầu mới với tên khác.</p><button class="btn primary full" data-act="retry-registration">Gửi yêu cầu khác</button>`;
 if(state.regStatus==='approved')return `<span class="eyebrow">ĐÃ ĐƯỢC ADMIN DUYỆT</span><h1>Hoàn tất tài khoản.</h1>
 <p class="hint">Tên <b>${esc(state.regName)}</b> đã được giữ chỗ. Thiết lập mật khẩu và chọn PIN 4–6 số.</p>
 <div class="info-strip">✓ Được phép tạo tài khoản · Mật khẩu và PIN được lưu bằng mã băm, không hiển thị cho admin.</div>
 <form data-form="register-complete">${inputField('Mật khẩu (tối thiểu 8 ký tự)','new-password','password','Tạo mật khẩu mạnh','minlength="8" autocomplete="new-password"')}
 ${inputField('Nhập lại mật khẩu','repeat-password','password','Nhập lại mật khẩu','minlength="8"')}
 <div class="field"><label>Độ dài mã PIN</label><select class="select" id="pin-length" name="pin_length"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6">6 chữ số</option></select></div>
 ${inputField('Mã PIN','new-pin','password','Chỉ dùng chữ số','inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6"')}
 ${inputField('Nhập lại PIN','repeat-pin','password','Nhập lại PIN','inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6"')}
 <label class="row" style="align-items:flex-start;margin:15px 0 19px;font-size:11px;color:var(--muted)"><input type="checkbox" required style="margin-top:3px"> <span>Tôi hiểu quản trị viên được phép kiểm duyệt dữ liệu tài khoản và lịch sử tin nhắn; không ai được xem mật khẩu/PIN gốc.</span></label>
 <button class="btn primary full">Tạo tài khoản ${icon('check',17)}</button></form>`;
 return `<span class="eyebrow">THAM GIA MTUNZ</span><h1>Bắt đầu một kết nối mới.</h1>
 <p class="hint">Bước đầu tiên là đăng ký tên tài khoản riêng và chờ admin chấp thuận trước khi tạo mật khẩu.</p>
 <div class="auth-step"><span class="active"></span><span></span><span></span></div>
 <form data-form="register-request">${inputField('Tên tài khoản muốn dùng','username','text','Ví dụ: hanh_uyen','minlength="3" maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"')}
 <div class="hint" style="margin:0 0 16px">Từ 3–24 ký tự; bắt đầu bằng chữ, chỉ dùng a-z, 0-9, dấu gạch dưới. Không phân biệt hoa/thường.</div>
 <button class="btn primary full">Yêu cầu admin phê duyệt ${icon('chevron',17)}</button></form>
 <div class="info-strip">Tối đa tài khoản do admin quy định. Một tên đăng nhập chỉ thuộc về một người dùng.</div>`;
}
function authSupport(){
 if(!state.supportTicket)return `<span class="eyebrow">TRUNG TÂM HỖ TRỢ</span><h1>Admin ở đây để hỗ trợ.</h1>
 <p class="hint">Tạo cuộc trò chuyện riêng với quản trị viên. Trường hợp khôi phục tài khoản, bạn cần chứng minh quyền sở hữu.</p>
 <form data-form="support-new"><div class="field"><label>Vấn đề bạn gặp phải</label><select class="select" name="kind">
 <option value="username" ${state.supportKind==='username'?'selected':''}>Quên tên đăng nhập</option>
 <option value="password" ${state.supportKind==='password'?'selected':''}>Quên mật khẩu</option>
 <option value="pin" ${state.supportKind==='pin'?'selected':''}>Quên mã PIN</option>
 <option value="other" ${state.supportKind==='other'?'selected':''}>Vấn đề khác</option></select></div>
 ${inputField('Thông tin gợi nhớ (không bắt buộc)','claim','text','Tên tài khoản dự đoán, thời điểm đăng ký...','maxlength="160"')}
 <button class="btn primary full">Bắt đầu trò chuyện ${icon('chat',17)}</button></form>
 ${state.tickets.length?`<div class="sep"></div><span class="eyebrow">CUỘC TRÒ CHUYỆN GẦN ĐÂY</span><div class="stack" style="margin-top:12px">${state.tickets.slice(0,5).map(t=>`<button class="btn ghost full" style="justify-content:space-between" data-act="support-open" data-id="${t.id}">#${t.id} · ${esc(t.kind)} <span class="pill">${esc(t.status)}</span></button>`).join('')}</div>`:''}`;
 return `<div class="row between" style="margin-bottom:17px"><button class="linkbtn" data-act="support-back">${icon('back',15)} Các yêu cầu</button><span class="pill">Phiếu hỗ trợ #${state.supportTicket}</span></div>
 <h1>Trò chuyện với admin</h1><p class="hint">Đối thoại này chỉ hiển thị cho trình duyệt đã mở yêu cầu và quản trị viên. Không chia sẻ mã khôi phục với người khác.</p>
 <div class="support-list" id="support-list" style="min-height:200px;margin-top:19px">${renderTicketBubbles(state.ticketMessages)}</div>
 <form data-form="support-reply" style="margin-top:12px"><div class="row"><input name="body" class="input" maxlength="1500" placeholder="Nhắn cho admin..." required><button class="btn primary circle" title="Gửi">${icon('send')}</button></div></form>
 <div class="sep"></div><h3>Đặt lại mật khẩu hoặc PIN</h3><p class="hint">Sau khi xác minh, admin sẽ cấp mã dùng một lần trong cuộc trò chuyện trên.</p>
 <form data-form="support-reset">${inputField('Mã khôi phục từ admin','code','text','Dán mã được cấp','autocomplete="off"')}
 <div class="field"><label>Đặt lại loại thông tin</label><select name="kind" class="select" id="reset-kind"><option value="password">Mật khẩu</option><option value="pin">Mã PIN</option></select></div>
 <div class="field"><label>Độ dài PIN mới (nếu khôi phục PIN)</label><select name="pin_length" class="select"><option value="4">4 chữ số</option><option value="5">5 chữ số</option><option value="6">6 chữ số</option></select></div>
 ${inputField('Mật khẩu/PIN mới','new_value','password','Nhập giá trị mới','autocomplete="new-password"')}
 <button class="btn ghost full">Xác nhận đặt lại</button></form>`;
}
function renderTicketBubbles(list){return list.length?list.map(m=>`<div class="support-message ${m.from_admin?'admin':'mine'}"><b>${m.from_admin?'Admin':'Bạn'}</b><div>${esc(m.body)}</div><div class="message-meta">${date(m.created_at)}</div></div>`).join(''):'<div class="empty">Chưa có tin nhắn. Bạn có thể mô tả vấn đề của mình.</div>';}
function renderAuth(){
 root().innerHTML=`<div class="auth">${authArt()}<main class="auth-main"><div class="auth-mobile-logo logo"><span class="logo-mark">m</span> mtunz<span style="color:#8984fc">.</span></div><div class="auth-panel">${authTabs()}${state.mode==='login'?authLogin():state.mode==='register'?authRegister():authSupport()}
 <div class="auth-footer">© 2026 mtunz · Kết nối gọn gàng, bảo mật rõ ràng</div></div></main></div>`;
 const panel=$('.auth-panel');panel?.scrollIntoView({block:'nearest'});
}
async function loadTickets(){const r=await api('/api/support/tickets');state.tickets=r.tickets;}
async function loadTicketMessages(){if(!state.supportTicket)return;const r=await api(`/api/support/tickets/${state.supportTicket}/messages`);state.ticketMessages=r.messages;
 if(state.mode==='support'&&!state.user)renderAuth();
 else if(state.tab==='support')renderApp();
 const box=$('#support-list');if(box)box.scrollTop=box.scrollHeight;
}
async function refreshRegistration(){const r=await api('/api/registration/status');const item=r.requests.find(x=>x.username===state.regName);if(item){state.regStatus=item.status;renderAuth();if(item.status==='approved')toast('Yêu cầu đã được phê duyệt!','ok');}else toast('Chưa tìm thấy yêu cầu.','error');}

// ==== Friends, messages and the member experience ====
async function refreshFriends(redraw=true){
  if(!state.user||state.user.is_admin)return;
  const [fr,bl]=await Promise.all([api('/api/friends'),api('/api/blocks')]);
  state.friends=fr.friends;state.blocks=bl.users;
  if(state.selected && !state.friends.some(f=>f.other_id===state.selected&&f.state==='accepted')){
    state.selected=null;
  }
  if(redraw){renderSideItems();if(state.tab==='friends'||state.tab==='restricted'||state.tab==='settings')renderApp();else updateChatHeader();}
}
function friendItem(f){
  const active=state.selected===f.other_id&&state.tab==='messages';
  return `<div class="side-item ${active?'active':''}" data-act="open-chat" data-id="${f.other_id}">
   ${avatar(f.username,f.online,'')}<div class="grow"><div class="row between"><span class="name truncate">${esc(f.display_name||f.username)}</span>${f.unread?`<span class="badge-count">${f.unread}</span>`:''}</div>
   <div class="sub">${f.last_message?`${f.last_message.sender_id===state.user.id?'Bạn: ':''}${esc(short(f.last_message.body,30))}`:f.online?'Đang hoạt động':'Bắt đầu nhắn tin'}</div></div></div>`;
}
function sideBody(){
  const accepted=state.friends.filter(f=>f.state==='accepted'&&!f.restricted&&!f.archived);
  const pending=state.friends.filter(f=>f.state==='pending'&&f.requested_by!==state.user.id);
  const q=state.sideFilter||'';
  const filtered=accepted.filter(x=>x.username.includes(q.toLowerCase()));
  return `${pending.length?`<div class="side-label">Lời mời chờ · ${pending.length}</div>${pending.slice(0,3).map(f=>`<div class="side-item" data-act="app-tab" data-tab="friends">${avatar(f.username,false,'sm')}<div class="grow"><b>${esc(f.username)}</b><div class="sub">Muốn kết bạn với bạn</div></div></div>`).join('')}`:''}
  <div class="side-label">Cuộc trò chuyện · ${filtered.length}</div>
  ${filtered.length?filtered.map(friendItem).join(''):`<div class="empty" style="padding:35px 12px;font-size:12px">${q?'Không tìm thấy hội thoại.':'Chưa có bạn bè nào. Hãy tìm và kết bạn!'}</div>`}
  ${groupSideItems()}`;
}
function renderSideItems(){const box=$('#side-items');if(box){box.innerHTML=sideBody();}}
function appRail(){
  const buttons=[['messages','chat','Tin nhắn'],['groups','group','Nhóm'],['friends','users','Bạn bè'],['notices','bell','Thông báo'],['restricted','shield','Hạn chế'],['settings','settings','Cài đặt'],['support','inbox','Hỗ trợ']];
  return `<aside class="rail"><span class="logo-mark" title="mtunz">m</span>
    ${buttons.map(([tab,ic,label])=>`<button class="rail-btn ${state.tab===tab?'active':''}" title="${label}" aria-label="${label}" data-act="app-tab" data-tab="${tab}">${icon(ic,21)}</button>`).join('')}
    <div class="rail-foot"><button class="rail-btn" title="Đăng xuất" data-act="logout">${icon('logout',20)}</button>
    ${avatar(state.user.username,false,'sm')}</div></aside>`;
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
function convoHeader(f){if(!f)return '';
 return `<header class="main-head"><button class="btn circle ghost" data-act="back-to-list" title="Quay lại danh sách">${icon('back')}</button>
 ${avatar(f.username,f.online,'sm')}<div class="grow"><h3>${esc(f.display_name||f.username)}</h3><div class="small muted">${f.online?'<span class="dot"></span>Đang hoạt động':`Hoạt động gần nhất: ${date(f.last_seen)}`}</div></div>
 <button class="btn ghost sm" data-act="profile-view" data-id="${f.other_id}" title="Xem hồ sơ">${icon('users',15)}</button>
 <button class="btn ghost sm" data-act="search-chat" title="Tìm tin">${icon('search',15)}</button>
 <button class="btn ghost sm" data-act="call-audio" data-id="${f.other_id}" title="Gọi thoại">${icon('phone',15)}</button>
 <button class="btn ghost sm" data-act="call-video" data-id="${f.other_id}" title="Gọi video">${icon('video',15)}</button>
 <button class="btn ghost sm" data-act="mute-chat" data-id="${f.other_id}" title="${f.muted?'Bật':'Tắt'} thông báo">${icon('mute',15)}</button>
 <button class="btn ghost sm" data-act="archive-chat" data-id="${f.other_id}" title="Lưu trữ hội thoại">${icon('archive',15)}</button>
 <button class="btn ghost sm" data-act="chat-restrict" data-id="${f.other_id}" title="Hạn chế / bỏ hạn chế">${icon('shield',15)} <span class="button-word">${f.restricted?'Bỏ hạn chế':'Hạn chế'}</span></button>
 <button class="btn danger sm" data-act="chat-block" data-id="${f.other_id}" title="Chặn tài khoản">${icon('ban',15)} <span class="button-word">Chặn</span></button></header>`;}
function updateChatHeader(){
 const f=state.friends.find(x=>x.other_id===state.selected);
 if(f&&state.tab==='messages'){
   const chat=$('#chat-header');if(chat)chat.innerHTML=convoHeader(f);
 }
}
function renderBubbles(){return bubblesFor(state.messages,false);}
function conversation(){
 const f=state.friends.find(x=>x.other_id===state.selected&&x.state==='accepted');
 if(!f)return welcomeEmpty();
 return `<div class="conversation"><div id="chat-header">${convoHeader(f)}</div>
 <div class="thread" id="chat-messages">${renderBubbles()}</div>
 <div class="composer"><div class="typing" id="typing-text"></div>${composerExtras()}<form class="compose-row" data-form="send-message">
 <label class="btn ghost attachment-button" title="Đính kèm ảnh hoặc tệp">${icon('paperclip',19)}<input class="upload-input" type="file" accept="image/*,.pdf,.txt,.docx,.xlsx,.zip" hidden></label>
 <textarea class="input" name="body" id="chat-text" placeholder="Nhập tin nhắn của bạn..." maxlength="2000" rows="1"></textarea>
 <button type="submit" class="btn primary send" title="Gửi tin nhắn">${icon('send',20)}</button></form>
 <div class="hint" style="margin-top:7px;font-size:10px">Enter để gửi · Shift + Enter để xuống dòng</div></div></div>`;
}
async function openChat(uid){
 const f=state.friends.find(x=>x.other_id===uid&&x.state==='accepted');
 if(!f){toast('Chưa kết bạn hoặc tài khoản đã bị chặn.','error');return;}
 state.selected=uid;state.groupSelected=null;state.tab='messages';state.messages=[];state.replyTo=null;state.pendingAttachment=null;renderApp();await loadMessages();
}
async function loadMessages(scroll=true){
 if(!state.selected)return;
 try{
  const friend=state.selected;
  const r=await api(`/api/messages/${friend}`);
  if(state.selected!==friend)return;
  state.messages=r.messages;
  const box=$('#chat-messages');if(box){const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;box.innerHTML=renderBubbles();if(scroll||nearBottom)box.scrollTop=box.scrollHeight;}
  await post(`/api/messages/read/${friend}`);
  const item=state.friends.find(x=>x.other_id===friend);if(item){item.unread=0;renderSideItems();}
 }catch(e){toast(e.message,'error');}
}
function personResult(r){return `<div class="people-row">${avatar(r.username)}<div class="grow"><b>${esc(r.username)}</b><div class="small muted">${r.friend_state==='accepted'?'Đã là bạn bè':r.friend_state==='pending'?r.requested_by_me?'Đã gửi lời mời':'Đã nhận lời mời':'Có thể gửi lời mời kết bạn'}</div></div>
 ${r.friend_state==='none'?`<button class="btn primary sm" data-act="friend-request" data-id="${r.id}">${icon('add',15)} Kết bạn</button>`:
 r.friend_state==='pending'&&!r.requested_by_me?`<button class="btn success sm" data-act="friend-accept" data-id="${r.id}">${icon('check',15)} Chấp nhận</button>`:
 r.friend_state==='accepted'?`<button class="btn ghost sm" data-act="open-chat" data-id="${r.id}">Nhắn tin</button>`:'<span class="pill">Chờ duyệt</span>'}</div>`;}
function friendsContent(){
 const pending=state.friends.filter(f=>f.state==='pending'&&f.requested_by!==state.user.id);
 const sent=state.friends.filter(f=>f.state==='pending'&&f.requested_by===state.user.id);
 const accepted=state.friends.filter(f=>f.state==='accepted');
 return `<div class="section-wrap"><span class="eyebrow">CỘNG ĐỒNG CỦA BẠN</span><h1 class="section-title">Bạn bè & kết nối</h1>
 <p class="section-lead">Tìm kiếm tài khoản, quản lý lời mời và bắt đầu nhắn tin.</p>
 <div class="card"><h3>${icon('search',17)} Tìm người dùng</h3><form data-form="search-people" class="row" style="margin-top:15px"><input class="input grow" name="q" id="person-search" value="${esc(state.peopleQuery||'')}" placeholder="Nhập tên tài khoản..." required minlength="1"><button class="btn primary">Tìm kiếm</button></form>
 ${(state.peopleResults||[]).map(personResult).join('')||((state.peopleQuery)?'<div class="hint" style="margin-top:16px">Không có kết quả phù hợp.</div>':'')}</div>
 ${pending.length?`<h3 style="margin:28px 0 12px">Lời mời kết bạn (${pending.length})</h3>${pending.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Đang chờ bạn xác nhận</div></div><button class="btn success sm" data-act="friend-accept" data-id="${f.other_id}">Chấp nhận</button><button class="btn ghost sm" data-act="friend-remove" data-id="${f.other_id}">Từ chối</button></div>`).join('')}`:''}
 ${sent.length?`<h3 style="margin:28px 0 12px">Lời mời đã gửi (${sent.length})</h3>${sent.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Đang chờ phản hồi</div></div><button class="btn ghost sm" data-act="friend-remove" data-id="${f.other_id}">Thu hồi</button></div>`).join('')}`:''}
 <h3 style="margin:28px 0 12px">Bạn bè (${accepted.length})</h3>
 ${accepted.length?accepted.map(f=>`<div class="people-row">${avatar(f.username,f.online)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">${f.restricted?'Đang ở danh sách hạn chế':f.online?'Đang hoạt động':'Ngoại tuyến'}</div></div>
 <button class="btn ghost sm" data-act="open-chat" data-id="${f.other_id}">${icon('chat',15)} Nhắn tin</button><button class="btn danger sm" data-act="friend-remove" data-id="${f.other_id}">Hủy kết bạn</button></div>`).join(''):'<div class="empty">Chưa có bạn bè nào.</div>'}</div>`;
}
function restrictedContent(){const rs=state.friends.filter(f=>f.state==='accepted'&&f.restricted);
 return `<div class="section-wrap"><span class="eyebrow">KHÔNG GIAN RIÊNG</span><h1 class="section-title">Người dùng bị hạn chế</h1>
 <p class="section-lead">Các cuộc trò chuyện bị hạn chế sẽ được ẩn khỏi hộp thư chính; trạng thái trực tuyến và xác nhận đã xem của bạn không hiển thị với họ.</p>
 ${rs.length?rs.map(f=>`<div class="people-row">${avatar(f.username)}<div class="grow"><b>${esc(f.username)}</b><div class="hint">Cuộc trò chuyện đã được ẩn</div></div>
 <button class="btn ghost sm" data-act="open-chat" data-id="${f.other_id}">Xem tin nhắn</button><button class="btn success sm" data-act="chat-restrict" data-id="${f.other_id}">Bỏ hạn chế</button></div>`).join(''):'<div class="empty">Chưa có người dùng nào bị hạn chế.</div>'}</div>`;}
function settingsContent(){
 return `<div class="section-wrap"><span class="eyebrow">TÀI KHOẢN CỦA BẠN</span><h1 class="section-title">Cài đặt & bảo mật</h1>
 <p class="section-lead">Kiểm soát thông tin đăng nhập và cách bạn tương tác trên mtunz.</p>
 <div class="row card" style="margin-bottom:20px">${avatar(state.user.username,false,'xl')}<div class="grow"><h2>${esc(state.user.username)}</h2><div class="hint">Thành viên từ ${date(state.user.created_at)} · Mã PIN hiện tại: ${state.user.pin_length} chữ số</div></div><span class="pill good">Đã xác thực</span></div>
 ${profileSettings()}<div class="setting-grid"><section class="card"><h3>${icon('lock',17)} Đổi mã PIN</h3><p class="hint">Có thể đổi cả độ dài PIN 4, 5 hoặc 6 chữ số.</p>
 <form data-form="settings-pin">${inputField('PIN hiện tại','old_pin','password','PIN cũ','inputmode="numeric" required')}
 <div class="field"><label>Độ dài PIN mới</label><select class="select" name="pin_length"><option value="4" ${state.user.pin_length===4?'selected':''}>4 chữ số</option><option value="5" ${state.user.pin_length===5?'selected':''}>5 chữ số</option><option value="6" ${state.user.pin_length===6?'selected':''}>6 chữ số</option></select></div>
 ${inputField('PIN mới','new_pin','password','PIN 4–6 chữ số','inputmode="numeric" minlength="4" maxlength="6"')}
 <button class="btn primary full">Cập nhật mã PIN</button></form></section>
 <section class="card"><h3>${icon('shield',17)} Đổi mật khẩu</h3><p class="hint">Mật khẩu mới nên khác hoàn toàn mật khẩu cũ.</p>
 <form data-form="settings-password">${inputField('Mật khẩu hiện tại','old_password','password','Mật khẩu cũ')}
 ${inputField('Mật khẩu mới','new_password','password','Ít nhất 8 ký tự','minlength="8"')}
 <button class="btn primary full">Đổi mật khẩu</button></form></section>
 <section class="card"><h3>${icon('ban',17)} Danh sách đã chặn</h3><p class="hint">Người bị chặn không thể kết bạn hoặc nhắn tin với bạn.</p>
 ${state.blocks.length?state.blocks.map(b=>`<div class="row between" style="margin:12px 0"><b>${esc(b.username)}</b><button class="btn ghost sm" data-act="unblock" data-id="${b.id}">Bỏ chặn</button></div>`).join(''):'<div class="hint" style="margin-top:19px">Chưa có tài khoản bị chặn.</div>'}</section>
 <section class="card"><h3>${icon('announce',17)} Thông báo hệ thống</h3><div id="notifications-list"><div class="hint" style="margin-top:15px">Chọn mục này để xem thông báo.</div></div><button class="btn ghost sm" data-act="load-notifications" style="margin-top:15px">Xem thông báo</button></section>
 </div><div class="info-strip" style="margin-top:20px">Minh bạch dữ liệu: admin có thể xem thông tin tài khoản và lịch sử trò chuyện để thực hiện kiểm duyệt. Mật khẩu và PIN chỉ lưu dưới dạng mã băm; không thể xem trực tiếp.</div></div>`;
}
function supportInApp(){return `<div class="section-wrap"><span class="eyebrow">LIÊN HỆ HỖ TRỢ</span><h1 class="section-title">Trò chuyện với admin</h1><p class="section-lead">Gửi câu hỏi và nhận phản hồi realtime từ quản trị viên.</p><div class="card" style="max-width:620px">${authSupport()}</div></div>`;}
function renderApp(){
 const isChat=state.tab==='messages'&&state.selected;
 const screen=state.tab==='messages'?conversation():
  state.tab==='groups'?(state.groupSelected?groupConversation():groupLobby()):
  state.tab==='notices'?`${memberHeader('Thông báo','Hoạt động mới nhất')} ${notificationsContent()}`:
  state.tab==='friends'?`${memberHeader('Bạn bè','Quản lý các kết nối của bạn') }<div class="main-body">${friendsContent()}</div>`:
  state.tab==='restricted'?`${memberHeader('Danh sách hạn chế','Ưu tiên sự riêng tư') }<div class="main-body">${restrictedContent()}</div>`:
  state.tab==='settings'?`${memberHeader('Cài đặt','Tùy chỉnh tài khoản') }<div class="main-body">${settingsContent()}</div>`:
  `${memberHeader('Trung tâm hỗ trợ','Kết nối trực tiếp với quản trị viên')}<div class="main-body">${supportInApp()}</div>`;
 const activeMain=state.tab!=='messages'||Boolean(isChat);
 root().innerHTML=`<div class="shell ${activeMain?'chat-open':''}">${appRail()}${sideBar()}<main class="main">${screen}</main></div>`;
 $('#chat-messages')?.scrollTo(0,1e7);
 if(state.tab==='support'&&state.supportTicket){const el=$('#support-list');if(el)el.scrollTop=el.scrollHeight;}
}
async function goTab(tab){
 state.tab=tab;state.selected=null;state.replyTo=null;state.pendingAttachment=null;
 if(tab==='groups')await refreshGroups(false);
 if(tab==='notices')await loadNotices();
 if(tab==='support'){state.mode='support';await loadTickets();}
 renderApp();
}

// ==== Administrator workspace ====
const adminTabs=[['groups','group','Nhóm chat'],['overview','grid','Tổng quan'],['registrations','check','Duyệt đăng ký'],['users','users','Người dùng'],['tickets','inbox','Hỗ trợ / khôi phục'],['broadcast','announce','Thông báo'],['audit','clock','Nhật ký quản trị'],['security','lock','Bảo mật Admin']];
function adminNav(){
 return `<aside class="admin-nav"><div class="logo"><span class="logo-mark">m</span><span>mtunz<span style="color:#8984fc">.</span></span></div>
 <div class="nav-label">QUẢN LÝ HỆ THỐNG</div>
 ${adminTabs.map(([t,ic,label])=>`<button data-act="admin-tab" data-tab="${t}" title="${label}" class="${state.adminTab===t?'active':''}">${icon(ic,19)} ${label}</button>`).join('')}
 <div class="nav-spacer"></div><div class="nav-label">TÀI KHOẢN</div>
 <div class="row" style="padding:11px 12px">${avatar('admin',true,'sm')}<div class="grow"><b>admin</b><div class="hint">Super administrator</div></div></div>
 <button data-act="logout" style="color:#ff93a0">${icon('logout')} Đăng xuất</button></aside>`;
}
const adminHeading={groups:['Kiểm duyệt nhóm chat','Danh sách nhóm và lịch sử hoạt động khi cần xử lý nội dung vi phạm.'],overview:['Tổng quan hệ thống','Một nơi điều hành mọi hoạt động trên mtunz.'],registrations:['Phê duyệt tài khoản','Mọi tài khoản mới đều cần được bạn chấp thuận trước khi thiết lập mật khẩu và PIN.'],users:['Quản lý người dùng','Quản lý dữ liệu, giới hạn quyền truy cập, khóa và cấm tài khoản.'],tickets:['Trung tâm hỗ trợ','Trao đổi và xác minh yêu cầu khôi phục trực tiếp từ người dùng.'],broadcast:['Thông báo toàn hệ thống','Gửi thông báo tức thời tới tất cả người dùng.'],audit:['Nhật ký quản trị','Dấu vết thao tác quản lý giúp truy cứu khi cần.'],security:['Bảo mật quản trị','Đổi mật khẩu quản trị và bảo vệ quyền truy cập tối cao.']};
async function loadAdmin(){
 if(!state.user?.is_admin)return;
 try{
  switch(state.adminTab){
   case 'groups':state.adminData=(await api('/api/admin/groups')).groups;break;
   case 'overview':{
    const [st,reg]=await Promise.all([api('/api/admin/stats'),api('/api/admin/registrations')]);
    state.adminData={stats:st,registrations:reg.registrations};break;
   }
   case 'registrations':state.adminData=(await api('/api/admin/registrations')).registrations;break;
   case 'users':state.adminData=(await api('/api/admin/users?q='+encodeURIComponent(state.adminQuery))).users;break;
   case 'tickets':{
    state.adminData=(await api('/api/admin/tickets')).tickets;
    if(state.adminTicket&&!state.adminData.some(t=>t.id===state.adminTicket))state.adminTicket=null;
    if(state.adminTicket){state.adminTicketMessages=(await api(`/api/admin/tickets/${state.adminTicket}/messages`)).messages;}
    break;
   }
   case 'audit':state.adminData=(await api('/api/admin/audit')).logs;break;
   default:state.adminData=null;
  }
  renderAdmin();
 }catch(e){toast(e.message,'error');}
}
function statCard(label,value,footer){return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${footer}</div></div>`;}
function adminOverview(){
 const d=state.adminData||{},s=d.stats||{total_users:0,online:0,pending:0,tickets:0,reserved_slots:0,max_users:100,messages:0};
 const regs=(d.registrations||[]).filter(x=>x.status==='pending').slice(0,5);
 return `<div class="stats-grid">${statCard('Tổng tài khoản',s.total_users,'Không tính tài khoản admin')}${statCard('Đang online',s.online,'Theo kết nối realtime')}
 ${statCard('Chờ phê duyệt',s.pending,'Tạo tài khoản mới')}${statCard('Yêu cầu hỗ trợ',s.tickets,'Các cuộc trò chuyện đang mở')}</div>
 <div class="admin-panels"><section class="card"><div class="row between"><h2>Yêu cầu đăng ký mới</h2><button class="btn ghost sm" data-act="admin-tab" data-tab="registrations">Xem tất cả</button></div>
 <div class="sep"></div>${regs.length?regs.map(r=>`<div class="people-row">${avatar(r.username,false,'sm')}<div class="grow"><b>${esc(r.username)}</b><div class="hint">${date(r.created_at)}</div></div><button class="btn success sm" data-act="admin-decision" data-id="${r.id}" data-approve="1">Duyệt</button><button class="btn danger sm" data-act="admin-decision" data-id="${r.id}" data-approve="0">Từ chối</button></div>`).join(''):'<div class="empty">Không có yêu cầu đang chờ.</div>'}</section>
 <section class="card"><h2>Giới hạn người dùng</h2><p class="hint">Kiểm soát số tài khoản tối đa được phép tồn tại. Các chỗ đã duyệt nhưng chưa tạo tài khoản vẫn được tính.</p>
 <div class="row" style="margin:22px 0"><span class="pill good">${s.total_users} đã tạo</span><span class="pill warn">${s.reserved_slots} đã duyệt</span><span class="pill">Giới hạn ${s.max_users}</span></div>
 <form data-form="admin-capacity"><div class="field"><label>Số người dùng tối đa</label><input type="number" class="input" name="max_users" min="1" max="100000" value="${s.max_users}" required></div><button class="btn primary full">Lưu giới hạn mới</button></form>
 <div class="sep"></div><div class="row between"><span class="muted small">Tổng tin nhắn đã gửi</span><b>${s.messages.toLocaleString('vi-VN')}</b></div></section></div>
 <div class="info-strip" style="margin-top:22px">Quyền admin bao gồm duyệt đăng ký, ban/khóa tức thời, xem thông tin người dùng, đọc nhật ký chat phục vụ kiểm duyệt và giải quyết khôi phục. Mật khẩu, PIN không được hiển thị.</div>`;
}
function statusPill(s){return s==='pending'?'<span class="pill warn">Chờ duyệt</span>':s==='approved'?'<span class="pill good">Đã duyệt</span>':s==='denied'?'<span class="pill bad">Từ chối</span>':'<span class="pill">Hoàn tất</span>';}
function adminRegistrations(){const rows=state.adminData||[];
 return `<div class="row between" style="margin-bottom:18px"><span class="hint">${rows.filter(r=>r.status==='pending').length} yêu cầu chưa xử lý</span><button class="btn ghost sm" data-act="admin-refresh">${icon('refresh',15)} Làm mới</button></div>
 <div class="table-scroll"><table class="data-table"><thead><tr><th>#</th><th>Tên đề xuất</th><th>Thời gian</th><th>Trạng thái</th><th>Quyết định</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${r.id}</td><td><b>${esc(r.username)}</b></td><td>${date(r.created_at)}</td><td>${statusPill(r.status)}</td><td><div class="table-actions">${r.status==='pending'?`<button class="btn success sm" data-act="admin-decision" data-id="${r.id}" data-approve="1">Duyệt</button><button class="btn danger sm" data-act="admin-decision" data-id="${r.id}" data-approve="0">Từ chối</button>`:'—'}</div></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Không có yêu cầu.</td></tr>'}</tbody></table></div>`;
}
function userStatus(u){return !u.sanction_kind?'<span class="pill good">Hoạt động</span>':u.sanction_until&&u.sanction_until*1000<Date.now()?'<span class="pill">Đã hết hạn</span>':`<span class="pill bad">${u.sanction_kind==='ban'?'Đã cấm':'Đã khóa'}</span>`;}
function adminUsers(){const data=state.adminData||[];
 return `<form data-form="admin-search-users" class="row" style="max-width:440px;margin-bottom:20px"><input class="input" placeholder="Tìm theo username" name="q" value="${esc(state.adminQuery)}"><button class="btn ghost">${icon('search',16)} Tìm</button></form>
 <div class="table-scroll"><table class="data-table"><thead><tr><th>Người dùng</th><th>Trạng thái</th><th>Ngày tham gia</th><th>Bạn bè</th><th>Tin nhắn</th><th>Hành động</th></tr></thead><tbody>
 ${data.length?data.map(u=>`<tr><td><div class="row">${avatar(u.username,false,'sm')}<div><b>${esc(u.username)}</b><div class="hint">#${u.id} · PIN ${u.pin_length} số</div></div></div></td>
 <td>${userStatus(u)}</td><td>${date(u.created_at)}</td><td>${u.friend_count}</td><td>${u.message_count}</td>
 <td><div class="table-actions"><button class="btn ghost sm" data-act="admin-user-detail" data-id="${u.id}">Chi tiết</button>
 <button class="btn ghost sm" data-act="admin-view-messages" data-id="${u.id}">${icon('eye',14)} Chat</button>
 <button class="btn danger sm" data-act="admin-sanction" data-kind="ban" data-id="${u.id}">Ban</button>
 <button class="btn ghost sm" data-act="admin-sanction" data-kind="lock" data-id="${u.id}">Khóa</button>
 ${u.sanction_kind?`<button class="btn success sm" data-act="admin-sanction" data-kind="unban" data-id="${u.id}">Unban</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Không tìm thấy người dùng.</td></tr>'}</tbody></table></div>`;
}
function adminTickets(){const tickets=state.adminData||[];
 const chosen=tickets.find(t=>t.id===state.adminTicket);
 return `<div class="admin-ticket-layout"><div class="card" style="padding:0;overflow:hidden"><div class="row between" style="padding:17px;border-bottom:1px solid var(--line)"><b>Cuộc trò chuyện (${tickets.length})</b><button class="btn sm ghost" data-act="admin-refresh">${icon('refresh',15)}</button></div>
 <div class="ticket-list">${tickets.length?tickets.map(t=>`<div class="ticket-item ${t.id===state.adminTicket?'selected':''}" data-act="admin-open-ticket" data-id="${t.id}">
 <div class="row between"><b>#${t.id} · ${esc(t.kind)}</b><span class="pill ${t.status==='open'?'good':'bad'}">${t.status==='open'?'Mở':'Đóng'}</span></div>
 <div class="hint truncate" style="margin-top:7px">${esc(t.claim)||'Không có mô tả'}</div><div class="hint">${date(t.created_at)}</div></div>`).join(''):'<div class="empty">Chưa có yêu cầu hỗ trợ.</div>'}</div></div>
 <div class="card" style="display:flex;flex-direction:column;gap:15px;min-height:520px">${chosen?`
 <div class="row between"><div><h2>Phiếu hỗ trợ #${chosen.id}</h2><div class="hint">Loại: ${esc(chosen.kind)} · ${esc(chosen.claim)}</div></div>
 <button class="btn ghost sm" data-act="admin-close-ticket" data-id="${chosen.id}" data-status="${chosen.status==='open'?'closed':'open'}">${chosen.status==='open'?'Đóng':'Mở lại'}</button></div>
 <div class="support-list grow" id="admin-ticket-messages" style="max-height:380px;min-height:240px">${renderTicketBubbles(state.adminTicketMessages)}</div>
 <form data-form="admin-ticket-reply"><div class="row"><input class="input" name="body" placeholder="Trả lời người dùng..." required maxlength="1500"><button class="btn primary circle">${icon('send')}</button></div></form>
 ${['password','pin'].includes(chosen.kind)?`<div class="info-strip" style="margin:0">Chỉ cấp mã đặt lại khi đã <b>xác minh danh tính bằng kênh độc lập</b>. Không dựa đơn thuần vào thông tin mà người lạ tự khai trong chat.</div>
 <button class="btn ghost" data-act="admin-recovery-grant" data-id="${chosen.id}">${icon('lock',16)} Cấp mã khôi phục một lần (15 phút)</button>`:
 '<div class="hint">Nếu người dùng quên tên đăng nhập, xác minh danh tính rồi trả lời tên tài khoản trong chat.</div>'}
 `:`<div class="empty" style="margin:auto"><span class="big-emoji">💬</span>Chọn một phiếu hỗ trợ ở bên trái.</div>`}</div></div>`;
}
function adminBroadcast(){return `<div class="card" style="max-width:690px"><h2>${icon('announce',20)} Gửi thông báo đồng loạt</h2><p class="hint" style="margin:13px 0 20px">Thông báo xuất hiện ngay với người đang online và được lưu lại để người dùng xem sau.</p>
 <form data-form="admin-broadcast"><div class="field"><label>Nội dung thông báo (tối đa 500 ký tự)</label><textarea class="textarea" name="body" rows="5" maxlength="500" placeholder="Ví dụ: Hệ thống sẽ bảo trì lúc 23:00..." required></textarea></div>
 <button class="btn primary">${icon('send',17)} Gửi đến mọi người dùng</button></form></div>`;}
function adminSecurity(){return `<div class="card" style="max-width:650px"><h2>${icon('lock',20)} Đổi mật khẩu admin</h2>
 <p class="hint" style="margin:15px 0">Mật khẩu mặc định chỉ dành cho bản thử nghiệm. Trước khi đưa web lên Internet, hãy thay ngay bằng mật khẩu riêng mạnh, dài tối thiểu 12 ký tự. Sau khi đổi, các phiên đăng nhập ở thiết bị khác sẽ bị thu hồi.</p>
 <form data-form="admin-password">${inputField('Mật khẩu hiện tại','old_password','password','Mật khẩu đang sử dụng')}
 ${inputField('Mật khẩu mới','new_password','password','Tối thiểu 12 ký tự','minlength="12"')}
 ${inputField('Nhập lại mật khẩu mới','repeat_password','password','Nhập lại mật khẩu','minlength="12"')}
 <button class="btn primary full">${icon('shield',17)} Đổi mật khẩu admin</button></form></div>`;}
function adminAudit(){const logs=state.adminData||[];
 return `<div class="card" style="max-width:940px;padding:0"><div style="padding:18px;border-bottom:1px solid var(--line)"><b>100 hoạt động quản trị gần nhất</b></div>
 ${logs.length?logs.map(l=>`<div class="audit-item"><div class="row between"><strong>${esc(l.action)}</strong><span class="hint">${date(l.created_at)}</span></div><div class="muted" style="margin-top:6px;overflow-wrap:anywhere">${esc(l.detail)}</div></div>`).join(''):'<div class="empty">Chưa có hoạt động quản trị nào.</div>'}</div>`;}
function renderAdmin(){
 const [title,lead]=adminHeading[state.adminTab];
 const content=state.adminTab==='groups'?adminGroupsContent():state.adminTab==='overview'?adminOverview():state.adminTab==='registrations'?adminRegistrations():state.adminTab==='users'?adminUsers():state.adminTab==='tickets'?adminTickets():state.adminTab==='broadcast'?adminBroadcast():state.adminTab==='security'?adminSecurity():adminAudit();
 root().innerHTML=`<div class="shell admin-shell">${adminNav()}<main class="admin-page"><div class="admin-header"><div><div class="eyebrow">ADMIN CONSOLE · FULL ACCESS</div><h1 style="margin-top:8px">${title}</h1><p>${lead}</p></div><span class="pill good">${icon('shield',13)} Quản trị viên</span></div>${content}</main></div>`;
 const el=$('#admin-ticket-messages');if(el)el.scrollTop=el.scrollHeight;
}
function sanctionDialog(uid,kind){
 const u=(state.adminData||[]).find(x=>x.id===uid);
 const title=kind==='ban'?'Cấm tài khoản':kind==='lock'?'Khóa tài khoản':'Bỏ hạn chế';
 if(kind==='unban')return ask('Mở khóa / Unban',`Khôi phục quyền truy cập cho ${u?.username||'#'+uid}?`,async()=>{await post(`/api/admin/users/${uid}/sanction`,{kind:'unban',reason:''});toast('Đã mở tài khoản.','ok');await loadAdmin();},'Unban');
 modal({title,description:`Áp dụng tức thì cho ${u?.username||'#'+uid}. Người dùng sẽ nhận thông báo và phải rời khỏi tài khoản.`,danger:true,confirm:kind==='ban'?'Cấm ngay':'Khóa ngay',
 content:`<div class="field"><label>Thời gian (phút)</label><input class="input" type="number" id="sanction-minutes" min="1" value="60" placeholder="Bỏ trống nếu cấm vĩnh viễn"></div>
 <div class="hint">${kind==='ban'?'Để trống để cấm vĩnh viễn.':'Khóa tài khoản cần thời hạn cụ thể.'} Ví dụ: 60 = 1 giờ, 1440 = 1 ngày.</div>
 <div class="field"><label>Lý do</label><textarea id="sanction-reason" class="textarea" maxlength="250" placeholder="Lý do gửi tới người dùng..."></textarea></div>`,
 handler:async()=>{const raw=$('#sanction-minutes').value.trim(),minutes=raw?Number(raw):null;
  if(kind==='lock'&&!minutes)throw Error('Khóa tài khoản cần thời hạn.');
  await post(`/api/admin/users/${uid}/sanction`,{kind,minutes,reason:$('#sanction-reason').value});toast('Quyết định đã có hiệu lực.','ok');await loadAdmin();}});
}
function userDetails(uid){const u=(state.adminData||[]).find(x=>x.id===uid);if(!u)return;
 modal({title:`Thông tin: ${u.username}`,confirm:'Đóng',closable:false,
  content:`<div class="stack" style="margin-top:16px;font-size:12px">
  <div class="row between"><span class="muted">ID</span><b>#${u.id}</b></div>
  <div class="row between"><span class="muted">Tên đăng nhập</span><b>${esc(u.username)}</b></div>
  <div class="row between"><span class="muted">Ngày tạo</span><b>${date(u.created_at)}</b></div>
  <div class="row between"><span class="muted">Hoạt động cuối</span><b>${date(u.last_seen)}</b></div>
  <div class="row between"><span class="muted">Độ dài PIN</span><b>${u.pin_length} số</b></div>
  <div class="row between"><span class="muted">Số bạn bè</span><b>${u.friend_count}</b></div>
  <div class="row between"><span class="muted">Số tin nhắn</span><b>${u.message_count}</b></div>
  <div class="row between"><span class="muted">Trạng thái</span>${userStatus(u)}</div>
  <div><span class="muted">Lý do giới hạn:</span> ${esc(u.sanction_reason||'—')}</div>
  <div class="hint">Mật khẩu và PIN gốc không được lưu; không thể xem.</div></div>`});
}
async function userMessageLog(uid){
 const resp=await api(`/api/admin/users/${uid}/messages`);
 const u=(state.adminData||[]).find(x=>x.id===uid);
 modal({title:`Lịch sử chat · ${u?.username||'#'+uid}`,description:'100 tin nhắn gần nhất liên quan đến người dùng. Truy cập này đã được ghi nhật ký quản trị.',confirm:'Đóng',closable:false,
 content:`<div style="max-height:380px;overflow:auto;display:flex;flex-direction:column;gap:10px;margin:18px 0">${resp.messages.length?resp.messages.map(m=>`<div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:#121b2d">
  <div class="small muted">${esc(m.sender)} → ${esc(m.recipient)} · ${date(m.created_at)}</div>
  <div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:7px;font-size:13px">${esc(m.deleted_at?'[Tin nhắn đã thu hồi]':m.body)}</div>
  ${m.attachment_id&&!m.deleted_at?`<a href="/api/attachments/${m.attachment_id}" target="_blank" rel="noopener" style="font-size:12px">${icon('file',14)} ${esc(m.attachment_name||'Tệp đính kèm')}</a>`:''}</div>`).join(''):'<p>Chưa có tin nhắn.</p>'}</div>`});
}
function grantDialog(tid){
 modal({title:'Cấp mã khôi phục',description:'Xác minh danh tính người yêu cầu bằng kênh độc lập trước khi cấp quyền đặt lại. Mã chỉ hiệu lực 15 phút và được gửi qua cuộc trò chuyện hỗ trợ.',
 confirm:'Cấp mã một lần',content:`<div class="field"><label>Tên tài khoản cần đặt lại</label><input id="grant-username" class="input" placeholder="Tên tài khoản đã xác minh"></div>
 <label class="row" style="align-items:flex-start;margin:16px 0;color:var(--muted);font-size:12px"><input type="checkbox" id="grant-verified" style="margin-top:4px"><span>Tôi xác nhận đã kiểm tra và xác thực người yêu cầu qua bằng chứng độc lập, không chỉ dựa vào lời khai trong chat.</span></label>`,
 handler:async()=>{if(!$('#grant-verified').checked)throw Error('Bạn phải hoàn tất xác minh danh tính.');
  const username=$('#grant-username').value;await post(`/api/admin/tickets/${tid}/grant`,{username,verified:true});
  toast('Đã gửi mã khôi phục tới cuộc trò chuyện.','ok');await loadAdmin();}});
}

// ==== Centralized interactions (no inline event handlers, all user input escaped) ====
async function clickAction(button){
 const act=button.dataset.act,id=Number(button.dataset.id),kind=button.dataset.kind;
 switch(act){
  case 'mode-login':state.mode='login';state.step='username';renderAuth();break;
  case 'mode-register':state.mode='register';renderAuth();break;
  case 'mode-support':state.mode='support';state.supportTicket=null;await loadTickets();renderAuth();break;
  case 'forgot-username':case 'forgot-password':case 'forgot-pin':
   state.supportKind=act.slice(7);state.mode='support';state.supportTicket=null;await loadTickets();renderAuth();break;
  case 'back-login':state.step='username';state.challenge='';renderAuth();break;
  case 'refresh-registration':await refreshRegistration();break;
  case 'retry-registration':state.regStatus='';state.regName='';renderAuth();break;
  case 'support-open':state.supportTicket=id;await loadTicketMessages();break;
  case 'support-back':state.supportTicket=null;state.ticketMessages=[];await loadTickets();state.user?renderApp():renderAuth();break;
  case 'logout':await logout();break;
  case 'app-tab':await goTab(button.dataset.tab);break;
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
  case 'admin-refresh':await loadAdmin();break;
  case 'admin-decision':{
   const approve=button.dataset.approve==='1';
   const op=async()=>{await post(`/api/admin/registrations/${id}/decision`,{approve});toast(approve?'Đã duyệt! Người dùng có thể tạo mật khẩu/PIN.':'Đã từ chối yêu cầu.','ok');await loadAdmin();};
   if(approve)await op();else ask('Từ chối yêu cầu','Người dùng sẽ được thông báo rằng yêu cầu đăng ký chưa được chấp thuận.',op,'Từ chối',true);
   break;
  }
  case 'admin-user-detail':userDetails(id);break;
  case 'admin-view-messages':await userMessageLog(id);break;
  case 'admin-sanction':sanctionDialog(id,button.dataset.kind);break;
  case 'admin-open-ticket':state.adminTicket=id;state.adminTicketMessages=(await api(`/api/admin/tickets/${id}/messages`)).messages;renderAdmin();break;
  case 'admin-recovery-grant':grantDialog(id);break;
  case 'admin-close-ticket':await post(`/api/admin/tickets/${id}/status`,{status:button.dataset.status});toast('Đã cập nhật phiếu hỗ trợ.','ok');await loadAdmin();break;
 }
}
document.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-act]');if(!btn||btn.disabled)return;
 try{await clickAction(btn);}catch(e){toast(e.message,'error');}
});
document.addEventListener('input',event=>{
 if(event.target.id==='side-filter'){state.sideFilter=event.target.value.trim();renderSideItems();}
 if(event.target.id==='chat-text'&&state.ws?.readyState===WebSocket.OPEN){
  const group=state.tab==='groups'&&state.groupSelected;
  if(!state.selected&&!group)return;
  const payload=group?{type:'group-typing',group_id:state.groupSelected,on:true}:{type:'typing',to:state.selected,on:true};
  state.ws.send(JSON.stringify(payload));
  clearTimeout(typingTimer);typingTimer=setTimeout(()=>{if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify({...payload,on:false}));},950);
 }
});
document.addEventListener('change',event=>{
 if(event.target.id==='pin-length'){
  const n=Number(event.target.value);
  for(const name of ['new-pin','repeat-pin']){
   const el=$('#'+name);if(el){el.minLength=n;el.maxLength=n;el.pattern=`[0-9]{${n}}`;el.placeholder='•'.repeat(n);}
  }
 }
});
document.addEventListener('keydown',e=>{
 if(e.target.id==='chat-text'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.closest('form').requestSubmit();}
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
    state.username=r.username;state.step='password';renderAuth();break;
   }
   case 'login-password':{
    const r=await post('/api/auth/password',{username:state.username,password:String(fd.get('password')||'')});
    if(r.admin){state.user=(await api('/api/me')).user;toast('Chào mừng quản trị viên!','ok');await enterApp();}
    else{state.challenge=r.challenge;state.pinLength=r.pin_length;state.step='pin';renderAuth();}
    break;
   }
   case 'login-pin':{
    await post('/api/auth/pin',{challenge:state.challenge,pin:val('pin')});
    state.user=(await api('/api/me')).user;toast('Đăng nhập thành công!','ok');await enterApp();break;
   }
   case 'register-request':{
    const r=await post('/api/registration/request',{username:val('username')});
    state.regName=r.username;state.regStatus=r.status;renderAuth();break;
   }
   case 'register-complete':{
    const pw=String(fd.get('new-password')||''),pw2=String(fd.get('repeat-password')||'');
    const pin=val('new-pin'),pin2=val('repeat-pin'),pinLen=Number(fd.get('pin_length'));
    if(pw!==pw2)throw Error('Hai lần nhập mật khẩu không khớp.');
    if(pin!==pin2)throw Error('Hai lần nhập PIN không khớp.');
    if(pin.length!==pinLen)throw Error(`PIN phải đúng ${pinLen} chữ số.`);
    await post('/api/registration/complete',{username:state.regName,password:pw,pin,pin_length:pinLen});
    state.username=state.regName;state.mode='login';state.step='username';state.regStatus='';renderAuth();
    toast('Tạo tài khoản thành công. Đăng nhập để bắt đầu!','ok');break;
   }
   case 'support-new':{
    state.supportKind=val('kind');const r=await post('/api/support/tickets',{kind:state.supportKind,claim:val('claim')});
    state.supportTicket=r.id;state.ticketMessages=[];state.user?renderApp():renderAuth();
    toast('Đã mở cuộc trò chuyện với admin.','ok');break;
   }
   case 'support-reply':{
    if(!state.supportTicket)throw Error('Chưa mở phiếu hỗ trợ.');
    await post(`/api/support/tickets/${state.supportTicket}/messages`,{body:val('body')});
    await loadTicketMessages();break;
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
    const content=String(fd.get('body')||'').trim();if(!content&&!state.pendingAttachment)return;
    const recipient=state.selected;await post('/api/messages',{recipient_id:recipient,body:content,
     attachment_id:state.pendingAttachment?.id||null,reply_to:state.replyTo?.scope==='dm'?state.replyTo.id:null});
    state.replyTo=null;state.pendingAttachment=null;
    if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify({type:'typing',to:recipient,on:false}));
    const txt=$('#chat-text');if(txt)txt.value='';if($('#compose-extra'))$('#compose-extra').innerHTML=composerExtras();
    await loadMessages();await refreshFriends();break;
   }
   case 'settings-pin':{
    await post('/api/me/pin',{old_pin:val('old_pin'),new_pin:val('new_pin'),pin_length:Number(fd.get('pin_length'))});
    state.user.pin_length=Number(fd.get('pin_length'));toast('Đã thay đổi mã PIN.','ok');renderApp();break;
   }
   case 'settings-password':{
    await post('/api/me/password',{old_password:String(fd.get('old_password')||''),new_password:String(fd.get('new_password')||'')});
    toast('Đã đổi mật khẩu. Các thiết bị khác được đăng xuất.','ok');renderApp();break;
   }
   case 'admin-password':{
    const pw=String(fd.get('new_password')||'');if(pw!==String(fd.get('repeat_password')||''))throw Error('Hai lần nhập mật khẩu mới không khớp.');
    await post('/api/me/password',{old_password:String(fd.get('old_password')||''),new_password:pw});toast('Đã đổi mật khẩu quản trị.','ok');await loadAdmin();break;
   }
   case 'admin-capacity':{
    await post('/api/admin/capacity',{max_users:Number(fd.get('max_users'))});toast('Đã cập nhật số lượng người dùng tối đa.','ok');await loadAdmin();break;
   }
   case 'admin-search-users':state.adminQuery=val('q');await loadAdmin();break;
   case 'admin-ticket-reply':{
    await post(`/api/admin/tickets/${state.adminTicket}/messages`,{body:val('body')});await loadAdmin();break;
   }
   case 'admin-broadcast':{
    const message=val('body');
    ask('Gửi thông báo toàn hệ thống',`Thông báo này sẽ hiển thị ngay cho tất cả người dùng: “${short(message,100)}”`,async()=>{
     const result=await post('/api/admin/broadcast',{body:message});
     toast(`Đã gửi đến ${result.recipients} người dùng.`,'ok');await loadAdmin();},'Gửi thông báo');
    break;
   }
  }
 }catch(e){toast(e.message,'error');}
 finally{if(button&&button.isConnected)button.disabled=false;}
});
document.addEventListener('DOMContentLoaded', setup);
