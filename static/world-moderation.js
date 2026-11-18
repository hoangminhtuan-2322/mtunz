/* mtunz World Chat — public-room UI and admin moderation. No secrets persisted. */
let worldRequestVersion=0,worldLastTick=0,worldPolling=false,worldClockOffset=0;
let worldPendingAttachment=null,worldUploadBusy=false;
const worldReasonNames={
 spam:'Spam / quảng cáo',harassment:'Quấy rối / đe dọa',
 hate:'Nội dung thù ghét',fraud:'Lừa đảo',impersonation:'Giả mạo',
 inappropriate:'Nội dung không phù hợp',other:'Khác'
};
const worldEscape=value=>esc(String(value??''));
const worldOwnIds=new Set();
const worldClock=()=>Math.floor(Date.now()/1000)+worldClockOffset;
function worldTime(value){
 const n=Number(value)||0;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
}
function worldDate(value){
 return value?new Date(Number(value)*1000).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
}
function worldCountdown(value){
 let n=Math.max(0,Math.ceil(Number(value||0)-worldClock()));
 const d=Math.floor(n/86400);n%=86400;
 const h=Math.floor(n/3600);n%=3600;
 const m=Math.floor(n/60),s=n%60;
 return [d,h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}
function worldTimeLabel(status){
 if(!status?.schedule_enabled)return 'Mở liên tục khi được admin bật';
 return 'Giờ Việt Nam · '+worldTime(status.open_minute)+' – '+worldTime(status.close_minute);
}
function worldPenaltyCard(){
 const s=state.worldData?.status;
 if(!s)return '<section class="card world-safety-settings"><h3>'+icon('shield',17)+' Kỷ luật Chat thế giới</h3><p class="hint">Khi truy cập mục này, hệ thống sẽ cập nhật cảnh báo và thời gian hạn chế nếu có.</p></section>';
 const until=Number(s.muted_until)||0;
 return '<section class="card world-safety-settings" aria-label="Thông báo kỷ luật Chat thế giới">'+
  '<div class="row between"><h3>'+icon('shield',17)+' Cảnh báo & giới hạn Chat thế giới</h3>'+
  '<span class="pill '+(until>worldClock()?'warn':'good')+'">'+(until>worldClock()?'Đang hạn chế':'Bình thường')+'</span></div>'+
  '<p class="hint">Quy tắc: gửi 5 tin trong 3 giây sẽ nhận 1 cảnh cáo; đủ 3 cảnh cáo kích hoạt án phạt. Riêng chat cá nhân và nhóm không chịu hạn chế Chat thế giới.</p>'+
  '<div class="world-safety-stats"><span>Cảnh cáo <strong>'+Number(s.warnings||0)+'/3</strong></span>'+
  '<span>Cấp phạt <strong>'+Number(s.strikes||0)+'/5</strong></span>'+
  '<span>Hạn chế gửi <strong>'+(until>worldClock()?'<span data-world-countdown="'+until+'">'+worldCountdown(until)+'</span>':'Không')+'</strong></span></div>'+
  (s.mute_reason?'<p class="world-safety-alert">'+worldEscape(s.mute_reason)+'</p>':'')+
  (s.reset_at?'<p class="hint">Cấp phạt sẽ trở về 0 sau 30 ngày không tái phạm. Mốc dự kiến: '+worldDate(s.reset_at)+'.</p>':'')+
  '</section>';
}
function worldBubble(message){
 const own=!!message.is_mine||Number(message.sender_id)===Number(state.user?.id)||worldOwnIds.has(Number(message.id));
 const name=worldEscape(message.anonymous?'Ẩn danh':message.display_name||'Thành viên');
 return '<article class="world-message '+(own?'mine':'')+'" data-world-message-id="'+Number(message.id)+'">'+
  '<div class="world-message-avatar" aria-hidden="true">'+(message.anonymous?'?':worldEscape((message.display_name||'T').slice(0,1).toUpperCase()))+'</div>'+
  '<div class="world-message-body"><div class="world-message-meta"><b>'+name+'</b><span>· '+worldDate(message.created_at)+'</span></div>'+
  '<p class="world-message-text">'+(message.deleted?'<em>Tin nhắn đã được gỡ.</em>':worldEscape(message.body))+'</p>'+
  (!message.deleted&&message.attachment?(message.attachment.mime?.startsWith('image/')?
   '<a class="world-media-link" target="_blank" rel="noopener noreferrer" href="'+worldEscape(message.attachment.url)+'"><img class="world-media-image" src="'+worldEscape(message.attachment.url)+'" loading="lazy" decoding="async" alt="'+worldEscape(message.attachment.name)+'"></a>':
   '<a class="world-media-file" href="'+worldEscape(message.attachment.url)+'" download>'+icon('file',16)+' '+worldEscape(message.attachment.name)+'</a>'):'')+
  '</div>'+
  (!own&&!message.deleted?'<button type="button" class="world-report-mini" data-world-report-user="'+Number(message.sender_id)+'" data-world-message="'+Number(message.id)+'" aria-label="Báo cáo tin nhắn của '+name+'">Báo cáo</button>':'')+
  '</article>';
}
function worldPage(){
 const data=state.worldData,s=data?.status;
 if(!s)return worldComingSoon();
 const closed=!s.open,until=Number(s.muted_until)||0,muted=until>worldClock(),blocked=closed||muted;
 const items=(data.messages||[]).map(worldBubble).join('')||
  '<div class="world-empty">Chưa có tin nhắn nào. Hãy bắt đầu một cuộc trò chuyện lịch sự!</div>';
 return '<div class="main-body world-live-page"><section class="world-live-shell" aria-label="Chat thế giới">'+
  '<div class="world-live-head"><div><span class="eyebrow">MTUNZ / KHÔNG GIAN CỘNG ĐỒNG</span>'+
  '<h1>Chat thế giới <span class="world-live-spark">✦</span></h1>'+
  '<p>Không gian cộng đồng realtime. Khi phòng đóng, lịch sử và phương tiện vẫn có thể xem lại.</p></div>'+
  '<span class="world-live-state '+(s.open?'online':'offline')+'">'+(s.open?'● Đang mở':'● Tạm đóng')+'</span></div>'+
  '<div class="world-live-toolbar"><span>'+icon('clock',14)+' '+worldEscape(worldTimeLabel(s))+'</span>'+
  '<label class="world-privacy-switch"><input type="checkbox" data-social-world-anon '+(state.user?.world_anonymous?'checked':'')+'> Ẩn danh khi gửi</label>'+ 
  '<button type="button" class="btn ghost sm" data-world-action="refresh">'+icon('refresh',14)+' Làm mới</button></div>'+
  (s.open&&s.schedule_enabled&&s.next_change_at?
   '<div class="world-closing-clock" role="status">'+icon('clock',17)+' Tự động đóng sau <strong id="world-close-countdown" data-world-close-at="'+Number(s.next_change_at)+'">'+worldCountdown(s.next_change_at)+'</strong></div>':'')+
  (closed?'<div class="world-banner warn" role="status">'+icon('clock',18)+' '+worldEscape(s.closed_reason)+
    (s.next_change_at?' · Mở dự kiến '+worldDate(s.next_change_at):'')+'</div>':'')+
  (muted?'<div class="world-banner danger" role="alert">'+icon('shield',18)+
   '<span>Bạn vẫn đọc được tin nhắn nhưng chưa thể gửi tại Chat thế giới. Còn <strong data-world-countdown="'+until+'">'+worldCountdown(until)+'</strong>. '+
   (s.mute_reason?worldEscape(s.mute_reason):'')+'</span></div>':'')+
  '<div class="world-feed" id="world-feed" role="log" aria-live="polite" aria-label="Tin nhắn cộng đồng">'+items+'</div>'+
  (closed?'<div class="world-readonly-note" role="status">'+icon('shield',16)+' Phòng hiện đóng. Bạn vẫn được xem toàn bộ lịch sử và phương tiện; chỉ mở lại tính năng gửi khi Admin cho phép.</div>':
  '<form data-world-form="send" class="world-compose">'+
   '<label class="world-file-pick" title="Đính kèm ảnh hoặc tệp" aria-label="Chọn tệp đính kèm">'+icon('file',17)+
   '<input id="world-upload-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.docx,.xlsx,.zip" hidden '+(blocked?'disabled':'')+'></label>'+
   '<label for="world-compose-text" class="sr-only">Tin nhắn Chat thế giới</label>'+
   '<textarea id="world-compose-text" maxlength="1200" rows="2" class="input" placeholder="'+(blocked?'Đang hạn chế gửi tin...':'Viết điều tích cực đến mọi người...')+'" '+(blocked?'disabled':'')+'></textarea>'+
   '<button type="submit" class="btn primary" '+(blocked?'disabled':'')+'>'+icon('send',16)+' Gửi</button>'+
   '<span class="world-file-preview" id="world-file-preview">'+(worldPendingAttachment?'Tệp: '+worldEscape(worldPendingAttachment.name):'')+'</span></form>')+
  '<div class="world-rule-footer">'+icon('shield',14)+' 5 tin trong 3 giây = 1 cảnh cáo · Đủ 3 cảnh cáo sẽ bị khóa gửi. <strong>'+
  Number(s.warnings||0)+'/3 cảnh cáo · Cấp '+Number(s.strikes||0)+'/5</strong></div>'+
  '</section></div>';
}
async function loadWorld(render=true){
 if(!state.user||state.user.is_admin)return;
 const seq=++worldRequestVersion,uid=state.user.id;
 const data=await api('/api/world/messages');
 if(seq!==worldRequestVersion||state.user?.id!==uid)return;
 worldClockOffset=(Number(data.status?.server_time)||Math.floor(Date.now()/1000))-Math.floor(Date.now()/1000);
 const before=state.worldData?.status;
 state.worldData=data;
 if(state.tab==='world'&&render){
  const focused=document.activeElement?.id==='world-compose-text';
  const typed=document.querySelector('#world-compose-text')?.value||'';
  const sameStatus=before&&['open','enabled','muted_until','warnings','strikes','next_change_at'].every(k=>before[k]===data.status[k]);
  if(focused&&typed&&sameStatus&&document.querySelector('#world-feed')){
   document.querySelector('#world-feed').innerHTML=(data.messages||[]).map(worldBubble).join('');
  }else renderApp();
  const feed=document.querySelector('#world-feed');if(feed)feed.scrollTop=feed.scrollHeight;
 }
}
async function loadWorldStatus(){
 if(!state.user||state.user.is_admin)return;
 const data=await api('/api/world/status');
 worldClockOffset=(Number(data.server_time)||Math.floor(Date.now()/1000))-Math.floor(Date.now()/1000);
 state.worldData={...state.worldData,status:data};
}
function worldWarnPopup(detail){
 const warning=detail.code==='world_spam_warning';
 const final=detail.code==='world_account_locked';
 const level=Number(detail.strikes||0);
 let title=warning?'Cảnh báo spam Chat thế giới':final?'Tài khoản đã bị khóa 15 ngày':'Tạm khóa gửi tin Chat thế giới';
 let description=warning?
  'Bạn đã gửi 5 tin trong 3 giây. Đây là cảnh cáo '+Number(detail.warnings||0)+'/3. Đủ 3 cảnh cáo sẽ bị hạn chế gửi tin.':
  'Đã ghi nhận đủ 3 cảnh cáo. Mức xử phạt '+level+'/5. '+(final?'Toàn bộ tài khoản bị khóa 15 ngày.':'Bạn vẫn xem được tin Chat thế giới, tin nhắn riêng và nhóm vẫn hoạt động.') ;
 const until=Number(detail.muted_until)||0;
 const content=until?'<div class="world-modal-penalty">'+icon('clock',18)+
   '<span>Hạn chế đến '+worldDate(until)+' (giờ Việt Nam).<br>Còn <b data-world-countdown="'+until+'">'+worldCountdown(until)+'</b></span></div>':'';
 modal({title,description,content,confirm:'Tôi đã hiểu',cancel:null,closable:false,danger:!warning});
}
async function worldSend(text,button){
 if(button?.disabled)return;
 if(button)button.disabled=true;
 try{
  const response=await fetch('/api/world/messages',{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({body:text,attachment_id:worldPendingAttachment?.id||null})
  });
  const result=await response.json();
  if(!response.ok){
   if(result.detail&&typeof result.detail==='object'&&result.detail.code?.startsWith('world_')){
    await loadWorld(true).catch(()=>{});
    worldWarnPopup(result.detail);
   }else toast(typeof result.detail==='string'?result.detail:'Không gửi được tin nhắn.','error');
   return;
  }
  worldOwnIds.add(Number(result.message.id));
  appendWorldSocket({...result.message,is_mine:true});
  worldPendingAttachment=null;
  const field=document.querySelector('#world-compose-text');if(field)field.value='';
  const preview=document.querySelector('#world-file-preview');if(preview)preview.textContent='';
 }catch(err){toast('Không kết nối được máy chủ. '+err.message,'error');}
 finally{if(button?.isConnected)button.disabled=false;}
}
function appendWorldSocket(message){
 if(!message||!state.user||state.user.is_admin)return;
 const data=state.worldData;
 if(!data?.status?.enabled)return;
 if(!data.messages)data.messages=[];
 if(data.messages.some(m=>Number(m.id)===Number(message.id)))return;
 data.messages.push(message);
 if(data.messages.length>70)data.messages.splice(0,data.messages.length-70);
 if(state.tab==='world'){
  const feed=document.querySelector('#world-feed');
  if(feed){
   const near=feed.scrollHeight-feed.scrollTop-feed.clientHeight<130;
   const empty=feed.querySelector('.world-empty');if(empty)empty.remove();
   feed.insertAdjacentHTML('beforeend',worldBubble(message));
   while(feed.querySelectorAll('.world-message').length>70)feed.querySelector('.world-message')?.remove();
   if(near)feed.scrollTop=feed.scrollHeight;
  }
 }
}
function openReportDialog(uid,messageId=null,scope=messageId?'world':'profile',groupId=null){
 if(!state.user||state.user.is_admin||!Number.isSafeInteger(uid)||uid<0||uid===state.user.id||(!uid&&!(messageId&&scope==='world')))return;
 const options=Object.entries(worldReasonNames).map(([key,label])=>'<option value="'+key+'">'+worldEscape(label)+'</option>').join('');
 modal({
  title:'Báo cáo người dùng',
  description:'Báo cáo được gửi trực tiếp đến quản trị viên để xem xét. Không tự động xử phạt chỉ vì có người báo cáo.',
  confirm:'Gửi báo cáo',cancel:'Để sau',
  content:'<div class="world-report-form"><label for="world-report-reason">Hành vi vi phạm</label>'+
   '<select class="select" id="world-report-reason">'+options+'</select>'+
   '<label for="world-report-description">Mô tả cụ thể (ít nhất 10 ký tự)</label>'+
   '<textarea class="input" id="world-report-description" maxlength="1000" rows="4" placeholder="Điều gì đã xảy ra? Mô tả đúng sự thật, không gửi dữ liệu nhạy cảm không cần thiết."></textarea>'+
   '<p class="hint">'+(uid?'ID tài khoản được báo cáo: #'+uid:'Người gửi ẩn danh sẽ được hệ thống xác minh riêng')+(messageId?' · Tin nhắn #'+messageId:'')+'.</p></div>',
  handler:async host=>{
   const desc=host.querySelector('#world-report-description').value.trim();
   if(desc.length<10)throw Error('Vui lòng mô tả ít nhất 10 ký tự.');
   const result=await post('/api/reports',{target_id:uid,reason:host.querySelector('#world-report-reason').value,
                                          description:desc,scope,message_id:messageId,group_id:groupId});
   toast('Đã gửi báo cáo #'+result.report_id+'. Admin sẽ xem xét.','ok');
  }
 });
}
function adminWorldContent(){
 const d=state.adminData||{},s=d.config||{};
 const offenders=d.offenders||[],messages=d.recent_messages||[];
 const control='<section class="card world-admin-card"><div class="row between"><div>'+
  '<span class="eyebrow">KIỂM SOÁT PHÒNG CÔNG CỘNG</span><h2>Trạng thái Chat thế giới</h2>'+
  '<p class="hint">Mặc định đóng. Khi bật, hệ thống có hiệu lực tức thì, không cần tạo cron.</p></div>'+
  '<span class="pill '+(s.open?'good':'warn')+'">'+(s.open?'Đang mở':'Đang đóng')+'</span></div>'+
  '<form class="world-admin-form" data-world-form="config">'+
  '<label class="world-check"><input type="checkbox" name="enabled" '+(s.enabled?'checked':'')+'> Cho phép mở Chat thế giới</label>'+
  '<label class="world-check"><input type="checkbox" name="schedule_enabled" '+(s.schedule_enabled?'checked':'')+'> Tự động mở/đóng mỗi ngày theo giờ Việt Nam</label>'+
  '<div class="world-time-grid"><label>Giờ mở<input class="input" type="time" name="open_at" required value="'+worldTime(s.open_minute??540)+'"></label>'+
  '<label>Giờ đóng<input class="input" type="time" name="close_at" required value="'+worldTime(s.close_minute??1320)+'"></label></div>'+
  '<p class="hint">Hỗ trợ khoảng thời gian qua nửa đêm (ví dụ 22:00 đến 06:00). Khi tắt lịch, trạng thái bật sẽ duy trì đến khi admin đóng thủ công.</p>'+
  '<button class="btn primary" type="submit">'+icon('check',15)+' Lưu cấu hình</button></form></section>';
 const muted='<section class="card world-admin-card"><h2>Kiểm soát thành viên</h2><p class="hint">Án phạt chỉ áp dụng Chat thế giới; cấp 5 tự khóa tài khoản 15 ngày.</p>'+
  '<form data-world-form="mute" class="world-admin-mute"><div class="world-time-grid"><label>ID thành viên<input name="user_id" class="input" type="number" min="1" required placeholder="ID"></label>'+
  '<label>Thời hạn<select class="select" name="minutes">'+
  [['15','15 phút'],['60','1 giờ'],['720','12 giờ'],['1440','1 ngày'],['4320','3 ngày'],['10080','7 ngày'],['43200','30 ngày'],['0','Bỏ khóa thủ công']].map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+
  '</select></label></div><label>Lý do<input class="input" name="reason" minlength="5" maxlength="250" required placeholder="Ghi rõ lý do kiểm duyệt"></label>'+
  '<button type="submit" class="btn ghost">Áp dụng / bỏ hạn chế</button></form>'+
  '<h3>Người đang bị cảnh báo hoặc xử phạt</h3>'+
  '<div class="world-admin-offenders">'+(offenders.length?offenders.map(x=>'<div class="world-offender"><div><strong>'+worldEscape(x.display_name||'Thành viên')+'</strong> · #'+Number(x.user_id)+
  '<div class="hint">Cảnh cáo '+Number(x.warnings)+'/3 · Cấp '+Number(x.strikes)+'/5'+
  (Math.max(Number(x.world_muted_until)||0,Number(x.admin_muted_until)||0)>worldClock()?' · Đến '+worldDate(Math.max(Number(x.world_muted_until)||0,Number(x.admin_muted_until)||0)):'')+
  '</div></div><button class="btn ghost sm" data-world-action="admin-reset" data-world-user="'+Number(x.user_id)+'">Đặt lại án spam</button></div>').join(''):
  '<p class="hint">Chưa có cảnh cáo hoặc án phạt.</p>')+'</div></section>';
 const recent='<section class="card world-admin-card"><div class="row between"><h2>30 tin mới nhất</h2><span class="pill">'+Number(d.total_messages||0)+' tin</span></div>'+
 (messages.length?messages.map(m=>'<div class="world-admin-message"><div><strong>'+worldEscape(m.display_name||'Thành viên')+'</strong> · #'+Number(m.sender_id)+' · '+worldDate(m.created_at)+
 '<p>'+worldEscape(m.deleted?'Đã gỡ':m.body)+'</p></div>'+
 (m.deleted?'':'<button class="btn ghost sm" data-world-action="admin-remove" data-world-message="'+Number(m.id)+'">Gỡ tin</button>')+'</div>').join(''):'<p class="hint">Phòng chưa có tin nhắn.</p>')+'</section>';
 return '<div class="world-admin-page"><div class="world-admin-stats"><strong>Báo cáo chờ xử lý: '+Number(d.pending_reports||0)+'</strong>'+
 '<button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="reports">Mở hàng chờ báo cáo</button></div>'+
 '<div class="world-admin-grid">'+control+muted+'</div>'+recent+'</div>';
}
function adminReportsContent(){
 const d=state.adminData||{},items=d.reports||[];
 const cards=items.map(r=>{
  const pending=r.status==='pending';
  return '<article class="world-report-card"><header><strong>#'+Number(r.id)+' · '+worldEscape(worldReasonNames[r.reason]||r.reason)+'</strong>'+
   '<span class="pill '+(pending?'warn':r.status==='reviewed'?'good':'')+'">'+
   (pending?'Chờ xem xét':r.status==='reviewed'?'Đã xem xét':'Đã bác bỏ')+'</span></header>'+
   '<p><b>Người báo cáo:</b> '+worldEscape(r.reporter_name||'Thành viên')+' (#'+Number(r.reporter_id)+
   ') · <b>Tài khoản bị báo cáo:</b> '+worldEscape(r.target_name||'Thành viên')+' (#'+Number(r.target_id)+')</p>'+
   '<div class="world-report-description">'+worldEscape(r.description)+'</div>'+
   (r.evidence?'<details><summary>Đọc nội dung tin nhắn làm bằng chứng</summary><p>'+worldEscape(r.evidence)+'</p></details>':'')+
   '<p class="hint">Nguồn: '+worldEscape(r.scope)+' · '+worldDate(r.created_at)+
   (r.source_message_id?' · Tin #'+Number(r.source_message_id):'')+'</p>'+
   (r.admin_note?'<p class="hint"><b>Ghi chú quản trị:</b> '+worldEscape(r.admin_note)+'</p>':'')+
   (pending?'<div class="world-report-actions"><button type="button" class="btn primary sm" data-world-action="admin-review" data-world-report="'+Number(r.id)+'" data-world-decision="reviewed">Đã xem xét</button>'+
    '<button class="btn ghost sm" data-world-action="admin-review" data-world-report="'+Number(r.id)+'" data-world-decision="dismissed">Bác báo cáo</button>'+
    '<button class="btn danger sm" data-world-action="admin-mute-user" data-world-user="'+Number(r.target_id)+'">Hạn chế Chat thế giới</button></div>':'')+
  '</article>';
 }).join('');
 return '<div class="world-admin-page"><div class="world-admin-stats"><strong>'+Number(d.pending||0)+' báo cáo đang chờ</strong>'+
 '<span class="hint">Chỉ admin có quyền đọc nội dung và quyết định. Các hành động được ghi nhật ký.</span></div>'+
 (cards||'<div class="card"><p class="hint">Chưa có báo cáo nào.</p></div>')+'</div>';
}
function worldAdminMuteDialog(uid){
 modal({title:'Hạn chế gửi tin Chat thế giới',
  description:'Chỉ khóa gửi trong Chat thế giới. Tin nhắn riêng và nhóm không bị ảnh hưởng.',
  confirm:'Áp dụng quyết định',cancel:'Hủy',
  content:'<div class="world-report-form"><label>Thời hạn</label><select id="world-admin-mute-minutes" class="select"><option value="60">1 giờ</option><option value="720">12 giờ</option><option value="1440">1 ngày</option><option value="4320">3 ngày</option><option value="10080">7 ngày</option></select>'+
  '<label>Lý do</label><input id="world-admin-mute-reason" class="input" maxlength="250" placeholder="Vi phạm nội quy cộng đồng" value="Cần kiểm tra báo cáo vi phạm"></div>'+
  adminV3PinFields(),
  handler:async host=>{
   const reason=host.querySelector('#world-admin-mute-reason').value.trim();
   if(reason.length<5)throw Error('Cần nhập lý do từ 5 ký tự.');
   await post('/api/admin/world/mute',{user_id:uid,minutes:Number(host.querySelector('#world-admin-mute-minutes').value),reason,...adminV3PinPayload(host)});
   toast('Đã áp dụng hạn chế Chat thế giới.','ok');await loadAdmin();
  }
 });
}
document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-world-report-user],[data-world-action]');
 if(!target||target.disabled)return;
 const user=Number(target.dataset.worldReportUser);
 if(target.hasAttribute('data-world-report-user')){
  const messageId=target.dataset.worldMessage?Number(target.dataset.worldMessage):null;
  const scope=target.dataset.worldScope||(messageId?'world':'profile');
  const groupId=target.dataset.worldGroup?Number(target.dataset.worldGroup):null;
  openReportDialog(user,messageId,scope,groupId);return;
 }
 const action=target.dataset.worldAction;
 try{
  if(action==='refresh'){await loadWorld(true);return;}
  if(action==='admin-mute-user'){worldAdminMuteDialog(Number(target.dataset.worldUser));return;}
  if(action==='admin-reset'){
   const uid=Number(target.dataset.worldUser);
   modal({title:'Đặt lại án spam Chat thế giới',description:'Chỉ đặt lại 5 cấp phạt tự động, không bỏ các lệnh khóa tài khoản khác.',danger:true,confirm:'Đặt lại',
    content:'<p class="hint">Thành viên #'+uid+'</p>'+adminV3PinFields(),
    handler:async host=>{await post('/api/admin/world/reset',{user_id:uid,reason:'Admin xác minh và đặt lại cảnh cáo',...adminV3PinPayload(host)});toast('Đã đặt lại án spam.','ok');await loadAdmin();}});
   return;
  }
  if(action==='admin-remove'){
   const mid=Number(target.dataset.worldMessage);
   modal({title:'Gỡ tin Chat thế giới',description:'Tin này sẽ bị ẩn khỏi lịch sử công cộng. Lưu bằng chứng báo cáo đã có.',danger:true,confirm:'Gỡ tin',
    content:'<label>Lý do <input id="world-remove-reason" class="input" value="Nội dung không phù hợp"></label>'+adminProofFields(),
    handler:async host=>{await post('/api/admin/world/messages/'+mid+'/remove',{reason:host.querySelector('#world-remove-reason').value,...adminProofValue(host)});toast('Đã gỡ tin.','ok');await loadAdmin();}});
   return;
  }
  if(action==='admin-review'){
   const id=Number(target.dataset.worldReport),decision=target.dataset.worldDecision;
   modal({title:decision==='reviewed'?'Xác nhận xem xét báo cáo':'Bác bỏ báo cáo',
    description:'Quyết định được lưu cùng người thực hiện và thời gian để có thể kiểm toán.',
    confirm:'Lưu quyết định',cancel:'Hủy',
    content:'<label>Ghi chú xử lý<input id="world-review-note" class="input" maxlength="600" value="'+
     (decision==='reviewed'?'Đã kiểm tra và xem xét nội dung báo cáo':'Không đủ bằng chứng để xử lý')+'"></label>'+
     adminProofFields(),
    handler:async host=>{const note=host.querySelector('#world-review-note').value.trim();
      if(note.length<5)throw Error('Ghi chú cần tối thiểu 5 ký tự.');
      await post('/api/admin/reports/'+id+'/review',{decision,note,...adminProofValue(host)});
      toast('Đã lưu quyết định kiểm duyệt.','ok');await loadAdmin();}});
   return;
  }
 }catch(err){toast(err.message||'Không thực hiện được thao tác.','error');}
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-world-form]');if(!form)return;
 event.preventDefault();
 const action=form.dataset.worldForm,button=form.querySelector('button[type="submit"]');
 if(button?.disabled)return;
 if(action==='send'){
  const value=form.querySelector('#world-compose-text')?.value.trim();
  if(value||worldPendingAttachment)await worldSend(value||'',button);
  return;
 }
 try{
  if(action==='config'){
   const fd=new FormData(form);
   const minute=text=>{const parts=String(text||'').split(':').map(Number);return parts[0]*60+parts[1];};
   const cfg={enabled:fd.has('enabled'),schedule_enabled:fd.has('schedule_enabled'),
    open_minute:minute(fd.get('open_at')),close_minute:minute(fd.get('close_at'))};
   if(cfg.schedule_enabled&&cfg.open_minute===cfg.close_minute)throw Error('Giờ mở và giờ đóng phải khác nhau.');
   modal({title:'Cập nhật lịch Chat thế giới',description:'Thiết lập sẽ có hiệu lực ngay trên máy chủ theo giờ Việt Nam.',
    confirm:'Lưu cấu hình',content:adminProofFields(),
    handler:async host=>{await post('/api/admin/world/config',{...cfg,...adminProofValue(host)});toast('Đã lưu cấu hình mở/đóng.','ok');await loadAdmin();}});
  }
  if(action==='mute'){
   const fd=new FormData(form),uid=Number(fd.get('user_id')),minutes=Number(fd.get('minutes')),reason=String(fd.get('reason')||'').trim();
   if(!Number.isSafeInteger(uid)||uid<=0||reason.length<5)throw Error('Kiểm tra ID người dùng và lý do.');
   modal({title:minutes?'Hạn chế Chat thế giới':'Bỏ hạn chế thủ công',
    description:'Không ảnh hưởng hội thoại riêng hoặc nhóm.',confirm:'Xác nhận',
    content:adminV3PinFields(),
    handler:async host=>{await post('/api/admin/world/mute',{user_id:uid,minutes,reason,...adminV3PinPayload(host)});
     toast('Đã cập nhật giới hạn gửi tin.','ok');await loadAdmin();}});
  }
 }catch(err){toast(err.message||'Không thể cập nhật.','error');}
});
setInterval(()=>{
 if(!state.user)return;
 const now=worldClock();
 document.querySelectorAll('[data-world-countdown]').forEach(el=>{
  const until=Number(el.dataset.worldCountdown);
  el.textContent=worldCountdown(until);
  if(until<=now&&worldLastTick!==until){
   worldLastTick=until;
   if(state.tab==='world'&&!worldPolling)loadWorld(true).catch(()=>{});
   if(state.tab==='settings')loadWorldStatus().then(()=>{if(state.tab==='settings')renderApp();}).catch(()=>{});
  }
 });
},1000);
setInterval(async()=>{
 if(!state.user||state.user.is_admin||state.tab!=='world'||worldPolling)return;
 worldPolling=true;
 try{await loadWorld(true);}catch(err){}finally{worldPolling=false;}
},6000);

document.addEventListener('change',async event=>{
 const input=event.target;
 if(input.id!=='world-upload-file'||!input.files?.[0])return;
 const file=input.files[0];
 if(worldUploadBusy)return;
 const allowed=['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'];
 if(!allowed.includes(file.type)){toast('Định dạng tệp chưa được hỗ trợ.','error');return;}
 if(file.size>2*1024*1024){toast('Tệp thế giới tối đa 2 MB. Vui lòng tối ưu ảnh hoặc chọn tệp nhỏ hơn.','error');return;}
 worldUploadBusy=true;input.disabled=true;
 const preview=document.getElementById('world-file-preview');if(preview)preview.textContent='Đang tải tệp...';
 try{
  const body=new FormData();body.append('file',file);
  const response=await fetch('/api/uploads',{method:'POST',body,credentials:'same-origin'});
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Không thể tải tệp.');
  worldPendingAttachment=result.attachment;
  if(preview)preview.textContent='✓ '+file.name+' — tệp sẽ được gửi cùng tin nhắn';
  toast('Đã đính kèm. Nhấn Gửi để chia sẻ.','ok');
 }catch(err){worldPendingAttachment=null;if(preview)preview.textContent='';toast(err.message||'Lỗi tải tệp','error');}
 finally{worldUploadBusy=false;if(input.isConnected){input.disabled=false;input.value='';}}
});
