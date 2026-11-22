/* mtunz Admin Console V5 — secure actions, fast scan, readable mobile controls.
 * Progressive enhancement; the backend remains the authority for every action.
 * Never persist credentials, PIN, user data or sensitive logs in browser storage.
 */
'use strict';
let adminV5Security=null,adminV5Fetched=0,adminV5Busy=false;
let adminV5PendingRefresh=null,adminV5RenderQueued=false;
const adminV5Ready=()=>typeof state!=='undefined'&&!!state.user?.is_admin&&!!document.querySelector('.admin-shell');
const adminV5Num=n=>Math.max(0,Number(n)||0).toLocaleString('vi-VN');
const adminV5Clock=stamp=>new Date((Number(stamp)||Date.now()/1000)*1000)
 .toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
function adminV5Summary(s){
 if(!s)return {state:'unknown',label:'Chưa xác minh',caption:'Đang tải chỉ số bảo mật'};
 const alerts=[];
 if(!s.pin_enabled)alerts.push('Chưa kích hoạt PIN quản trị');
 if(s.pending_approvals>0)alerts.push(s.pending_approvals+' thiết bị đang chờ phê duyệt');
 if(s.admin_sessions>1)alerts.push('Có '+s.admin_sessions+' phiên Admin đang hoạt động');
 if(s.pin_lockout_until>Date.now()/1000)alerts.push('PIN Admin đang tạm khóa vì nhập sai');
 if(s.rejected_sensitive_actions_24h>=3)alerts.push('Có nhiều yêu cầu đặc quyền bị từ chối');
 if(s.emergency_lockdown)return {state:'paused',label:'Đang khóa khẩn cấp',
  caption:'Chặn thao tác gửi mới của thành viên và đăng ký, vẫn cho phép xem lịch sử'};
 if(alerts.length)return {state:'attention',label:'Cần kiểm tra',caption:alerts.join(' · ')};
 return {state:'ok',label:'Không có cảnh báo đang mở',
   caption:'Trạng thái dựa trên những tín hiệu ứng dụng đang theo dõi, không bảo đảm tuyệt đối an toàn'};
}
function adminV5Stat(label,value,subtitle,iconText){
 return '<div class="v5-security-metric"><div class="v5-security-metric-top">'+
  '<span>'+esc(label)+'</span><span aria-hidden="true">'+iconText+'</span></div>'+
  '<strong>'+esc(String(value))+'</strong><small>'+esc(subtitle)+'</small></div>';
}
function adminV5OverviewHtml(s){
 const result=adminV5Summary(s);
 return '<section class="v5-command-deck" aria-label="Giám sát bảo mật Admin">'+
  '<div class="v5-deck-head"><div><span class="v5-kicker">SECURITY OPERATIONS</span>'+
  '<h2>Trung tâm giám sát mtunz</h2><p>Ưu tiên các vấn đề cần xử lý. Mọi thao tác quan trọng đều xác minh PIN trên máy chủ.</p></div>'+
  '<div class="v5-deck-status v5-'+result.state+'"><span class="v5-status-dot"></span>'+esc(result.label)+'</div></div>'+
  '<div class="v5-security-metrics">'+
  adminV5Stat('Phiên Admin',s?adminV5Num(s.admin_sessions)+' / '+adminV5Num(s.session_limit):'—','Tối đa 2 phiên, phiên thứ hai phải phê duyệt','🛡️')+
  adminV5Stat('PIN quản trị',s?(s.pin_enabled?'Đang bật':'Cần bật'):'—','Chống đoán PIN và khóa sau 5 lần sai','🔑')+
  adminV5Stat('Đăng nhập chờ duyệt',s?adminV5Num(s.pending_approvals):'—','Từng thiết bị cần duyệt bằng PIN','💻')+
  adminV5Stat('Từ chối đặc quyền / 24h',s?adminV5Num(s.rejected_sensitive_actions_24h):'—','Theo dõi các lần xác minh thất bại','⚠️')+
  '</div><div class="v5-deck-footer"><p>'+esc(result.caption)+'</p>'+
   '<div class="v5-deck-buttons"><button type="button" class="btn ghost sm" data-admin-v5="refresh">↻ Kiểm tra lại</button>'+
    '<button type="button" class="btn primary sm" data-admin-v5="security-tab">Mở Trung tâm bảo mật</button></div></div>'+
  '</section>';
}
function adminV5SecurityHtml(s){
 const result=adminV5Summary(s);
 const locked=!!s?.emergency_lockdown,maintenance=!!s?.maintenance_mode;
 const manual=s?.maintenance?.manual??maintenance,schedule=s?.maintenance?.schedule;
 const scheduleActive=!!schedule&&maintenance&&!manual;
 return '<section class="v5-security-center" aria-label="Lớp bảo vệ hệ thống">'+
 '<div class="v5-deck-head"><div><span class="v5-kicker">DEFENSE IN DEPTH</span>'+
 '<h2>Bảo vệ Admin và dữ liệu</h2>'+
 '<p>Theo dõi phiên đăng nhập, khống chế khẩn cấp và thu hồi quyền truy cập nghi vấn.</p></div>'+
 '<div class="v5-deck-status v5-'+result.state+'"><span class="v5-status-dot"></span>'+esc(result.label)+'</div></div>'+
 '<div class="v5-security-actions">'+
  '<article class="v5-action-card"><div class="v5-action-card-head"><span>🧯</span><h3>Khóa khẩn cấp</h3></div>'+
   '<p>Ngừng nhận đăng ký, gửi tin mới, tải tệp và gửi theo lịch. Các cuộc trò chuyện cũ vẫn xem được; Chat thế giới tự đóng khi bật.</p>'+
   '<strong class="v5-action-state">'+(locked?'Đang bật — hệ thống tạm ngừng ghi nội dung mới':'Đang tắt — hệ thống hoạt động bình thường')+'</strong>'+
   '<button type="button" class="btn '+(locked?'ghost':'danger')+'" data-admin-v5="lockdown" data-v5-enable="'+(locked?'0':'1')+'">'+
    (locked?'Mở lại hệ thống':'Bật chế độ khẩn cấp')+'</button></article>'+
  '<article class="v5-action-card"><div class="v5-action-card-head"><span>🔧</span><h3>Bảo trì hệ thống</h3></div>'+
   '<p>Thông báo cho thành viên đang online, kết thúc phiên thành viên và tạm chặn đăng nhập.</p>'+
   '<strong class="v5-action-state">'+(s?(manual?'Đang bảo trì thủ công':scheduleActive?'Đang bảo trì theo lịch':schedule?'Đã lên lịch · chờ bắt đầu':'Đang hoạt động'):'Đang tải')+'</strong>'+
   '<button type="button" class="btn '+(manual?'ghost':'danger')+'" data-admin-v5="maintenance" data-v5-enable="'+(manual?'0':'1')+'" '+(s&&!scheduleActive?'':'disabled')+'>'+
    (manual?'Kết thúc bảo trì thủ công':'Bật bảo trì ngay')+'</button>'+
   (schedule?'<p class="hint">⏱ Bắt đầu: '+esc(adminV5FormatWhen(schedule.starts_at))+'<br>Kết thúc: '+esc(adminV5FormatWhen(schedule.ends_at))+' · '+esc(adminV5MaintenanceDuration(schedule.ends_at-schedule.starts_at))+'<br>Thông báo: '+esc(schedule.reason)+'</p>':'')+
   '<button type="button" class="btn ghost" data-admin-v5="maintenance-schedule">'+(schedule?'Đổi lịch bảo trì':'Lên lịch bảo trì')+'</button>'+
   (schedule?'<button type="button" class="btn ghost" data-admin-v5="maintenance-cancel">Hủy lịch bảo trì</button>':'')+'</article>'+
  '<article class="v5-action-card"><div class="v5-action-card-head"><span>📱</span><h3>Thu hồi phiên khác</h3></div>'+
   '<p>Đăng xuất ngay mọi phiên Admin khác, hủy các thiết bị chờ phê duyệt và phiên ghi nhớ; giữ chính phiên Admin đang thao tác.</p>'+
   '<strong class="v5-action-state">'+(s?adminV5Num(s.admin_sessions):'—')+' phiên hiện đang hoạt động</strong>'+
   '<button type="button" class="btn ghost" data-admin-v5="revoke-others">Thu hồi các phiên khác bằng PIN</button></article>'+
 '</div>'+
 '<div class="v5-risk-list"><h3>Trạng thái bảo vệ đang áp dụng</h3>'+
  '<div><span>🔐 PIN thao tác quản trị</span><strong>'+(s?(s.pin_enabled?'Đã bật':'Chưa thiết lập'):'Đang tải')+'</strong></div>'+
  '<div><span>🧩 Phiên Admin / quyền phê duyệt</span><strong>'+(s?adminV5Num(s.admin_sessions)+' / 2':'—')+'</strong></div>'+
  '<div><span>⏳ Giới hạn phiên Admin</span><strong>120 phút / phiên</strong></div>'+
  '<div><span>🧱 Khóa PIN sai nhiều lần</span><strong>'+(s?.pin_lockout_until>Date.now()/1000?'Đến '+adminV5Clock(s.pin_lockout_until):'Đã kích hoạt')+'</strong></div>'+
  '<div><span>🌍 Chat thế giới</span><strong>'+(s?(s.world_enabled?'Đang cho phép':'Đang tắt'):'—')+'</strong></div>'+
  '<div><span>🧯 Chế độ khẩn cấp</span><strong>'+(locked?'Đang bật':'Tắt')+'</strong></div>'+
 '</div>'+
 '<p class="v5-security-footnote">Giảm rủi ro không đồng nghĩa loại bỏ mọi cuộc tấn công. Cần tiếp tục cập nhật bản vá, bảo vệ thông tin đăng nhập Neon/Render/GitHub và rà soát quyền truy cập định kỳ.</p>'+
 '</section>';
}
function adminV5DecorateTopbar(){
 const top=document.querySelector('.admin-workspace-top');
 if(!top)return;
 top.classList.add('v5-topbar');
 const title=top.querySelector('.work-label');
 if(title)title.textContent='MTUNZ / TRUNG TÂM ĐIỀU HÀNH';
 const live=top.querySelector('.admin-online');
 if(live)live.textContent=adminV5Security?.emergency_lockdown?'Tạm ngừng gửi':'Admin bảo mật';
 const refresh=top.querySelector('[data-admin-ui="refresh"]');
 if(refresh){refresh.title='Đồng bộ dữ liệu quản trị';refresh.setAttribute('aria-label','Làm mới dữ liệu Admin');}
 const right=top.querySelector('.worktop-right');
 if(!right||right.querySelector('.v5-last-update'))return;
 const timestamp=document.createElement('span');
 timestamp.className='v5-last-update';timestamp.setAttribute('role','status');
 timestamp.textContent='Bảo mật: chưa kiểm tra';
 right.insertBefore(timestamp,right.firstChild);
}
function adminV5Mount(){
 if(!adminV5Ready())return;
 adminV5DecorateTopbar();
 const page=document.querySelector('.admin-page');if(!page)return;
 if(state.adminTab==='overview'&&!page.querySelector('.v5-command-deck')){
  const el=document.createElement('div');el.className='v5-overview-root';
  el.innerHTML=adminV5OverviewHtml(adminV5Security);
  const anchor=page.querySelector('.admin-priority-strip,.admin-quick-links,.stats-grid');
  (anchor||page.firstElementChild)?.before(el);
 }
 if(state.adminTab==='security'&&!page.querySelector('.v5-security-center')){
  const el=document.createElement('div');el.className='v5-security-root';
  el.innerHTML=adminV5SecurityHtml(adminV5Security);
  const anchor=page.querySelector('.admin-v3-security-card,.admin-security');
  if(anchor)anchor.before(el);
  else page.append(el);
 }
 if(Date.now()-adminV5Fetched>15000&&!adminV5Busy)
   adminV5Refresh(false).catch(()=>{});
}
async function adminV5Refresh(force=false){
 if(!adminV5Ready()||adminV5Busy)return;
 if(!force&&Date.now()-adminV5Fetched<15000)return;
 adminV5Busy=true;
 try{
  const result=await api('/api/admin/security/overview');
  if(!adminV5Ready())return;
  adminV5Security=result;adminV5Fetched=Date.now();
  // The request clock changes on every fetch. Repaint cards only when
  // an actual security indicator changes, preserving focus and smooth scrolling.
  const key=JSON.stringify(Object.entries(result).filter(([field])=>field!=='updated_at'));
  document.querySelectorAll('.v5-overview-root').forEach(el=>{
   if(el.dataset.securityPaintKey!==key){
    el.innerHTML=adminV5OverviewHtml(result);
    el.dataset.securityPaintKey=key;
   }
  });
  document.querySelectorAll('.v5-security-root').forEach(el=>{
   if(el.dataset.securityPaintKey!==key){
    el.innerHTML=adminV5SecurityHtml(result);
    el.dataset.securityPaintKey=key;
   }
  });
  adminV5DecorateTopbar();
  const update=document.querySelector('.v5-last-update');
  if(update)update.textContent='Bảo mật · '+adminV5Clock(result.updated_at);
 }catch(err){
  const stamp=document.querySelector('.v5-last-update');
  if(stamp)stamp.textContent='Bảo mật: không kết nối';
  if(force)toast(err.message||'Không thể kiểm tra bảo mật.','error');
 }finally{adminV5Busy=false;}
}
function adminV5ProofModal(title,explanation,action,danger,run){
 modal({title,description:explanation,confirm:action,danger,
  content:adminV3PinFields(),
  handler:async host=>{
    const proof=adminV3PinPayload(host);
    if(!proof.admin_pin)throw Error('Thao tác bảo mật cần PIN Admin.');
    await run(proof.admin_pin);
    await adminV5Refresh(true);
  }});
}
function adminV5DoLockdown(enabled){
 adminV5ProofModal(enabled?'Kích hoạt khóa khẩn cấp':'Gỡ chế độ khẩn cấp',
  enabled?'Tạm dừng các thao tác tạo nội dung mới; Chat thế giới đóng ngay. Lịch sử vẫn có thể xem.':
   'Mở lại đăng ký và nhắn tin. Chat thế giới vẫn ở trạng thái tắt cho đến khi Admin chủ động bật.',
  enabled?'Khóa hệ thống ngay':'Xác nhận mở lại',enabled,
  async admin_pin=>{
   await post('/api/admin/security/lockdown',{enabled,admin_pin});
   toast(enabled?'Đã bật khóa khẩn cấp.':'Đã mở lại các hoạt động; Chat thế giới vẫn đóng.','ok');
   await loadAdmin();
  });
}
function adminV5DoMaintenance(enabled){
 adminV5ProofModal(enabled?'Bật bảo trì hệ thống':'Kết thúc bảo trì',
  enabled?'Thành viên đang online sẽ thấy thông báo. Phiên thành viên sẽ hết hiệu lực và họ sẽ về màn hình đăng nhập sau khi bấm Đã hiểu.':
   'Cho phép thành viên đăng nhập lại.',
  enabled?'Bật bảo trì':'Kết thúc bảo trì',enabled,
  async admin_pin=>{
   await post('/api/admin/security/maintenance',{enabled,admin_pin});
   toast(enabled?'Đã bật bảo trì hệ thống.':'Đã kết thúc bảo trì.','ok');
  });
}
const adminV5Pad=n=>String(n).padStart(2,'0');
function adminV5LocalParts(stamp){
 const d=new Date(Number(stamp)*1000);
 return {day:[d.getFullYear(),adminV5Pad(d.getMonth()+1),adminV5Pad(d.getDate())].join('-'),
         time:adminV5Pad(d.getHours())+':'+adminV5Pad(d.getMinutes())};
}
function adminV5LocalStamp(day,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time))return null;
 const [y,m,d]=day.split('-').map(Number),[hh,mm]=time.split(':').map(Number);
 const v=new Date(y,m-1,d,hh,mm,0,0);
 if(v.getFullYear()!==y||v.getMonth()!==m-1||v.getDate()!==d||v.getHours()!==hh||v.getMinutes()!==mm)return null;
 return Math.floor(v.getTime()/1000);
}
function adminV5FormatWhen(stamp){
 if(!Number.isFinite(Number(stamp))||Number(stamp)<=0)return 'Chưa chọn';
 return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Number(stamp)*1000));
}
function adminV5MaintenanceDuration(seconds){
 const minutes=Math.round(seconds/60);
 if(!Number.isFinite(minutes)||minutes<=0)return '—';
 const d=Math.floor(minutes/1440),h=Math.floor(minutes%1440/60),m=minutes%60;
 return [d?d+' ngày':'',h?h+' giờ':'',m?m+' phút':''].filter(Boolean).join(' ');
}
function adminV5MaintenanceFormMarkup(schedule){
 const nowMillis=Date.now(),rounded=Math.ceil((nowMillis+10*60000)/900000)*900;
 const future=Number(schedule?.starts_at)>nowMillis/1000+60;
 const start=future?Number(schedule.starts_at):rounded;
 const duration=Math.min(7*86400,Math.max(60,Number(schedule?.ends_at)-Number(schedule?.starts_at)||3600));
 const finish=future?Number(schedule.ends_at):start+duration;
 const begin=adminV5LocalParts(start),end=adminV5LocalParts(finish);
 const zone=new Intl.DateTimeFormat('vi-VN',{timeZoneName:'short'}).formatToParts(new Date())
  .find(part=>part.type==='timeZoneName')?.value||'giờ địa phương';
 return `<div class="v5-maintenance-form" id="v5-maintain-form">
  <div class="v5-maint-step"><span class="v5-maint-number">1</span><div><h3>Thời gian bảo trì</h3>
   <p>Hệ thống tự bắt đầu và kết thúc theo <b>giờ thiết bị (${esc(zone)})</b>.</p></div></div>
  <div class="v5-maint-dates">
   <fieldset class="v5-maint-date-group"><legend>Bắt đầu</legend><div class="v5-maint-date-time">
    <label>Ngày bắt đầu<input class="input" id="v5-maint-start-date" type="date" value="${begin.day}" required></label>
    <label>Giờ bắt đầu (24h)<input class="input" id="v5-maint-start-time" type="time" lang="vi-VN" step="60" value="${begin.time}" required></label>
   </div></fieldset>
   <fieldset class="v5-maint-date-group"><legend>Kết thúc</legend><div class="v5-maint-date-time">
    <label>Ngày kết thúc<input class="input" id="v5-maint-end-date" type="date" value="${end.day}" required></label>
    <label>Giờ kết thúc (24h)<input class="input" id="v5-maint-end-time" type="time" lang="vi-VN" step="60" value="${end.time}" required></label>
   </div></fieldset>
  </div>
  <div class="v5-maint-presets"><span>Chọn nhanh thời lượng</span>
   ${[[30,'30 phút'],[60,'1 giờ'],[120,'2 giờ'],[240,'4 giờ']].map(([minutes,label])=>
    `<button type="button" class="v5-maint-preset${!schedule&&minutes===60?' is-selected':''}" data-v5-maint-minutes="${minutes}" aria-pressed="${!schedule&&minutes===60?'true':'false'}">${label}</button>`).join('')}
  </div>
  <div class="v5-maint-summary" aria-live="polite">
   <span>Lịch dự kiến</span><strong id="v5-maint-summary-times">Đang kiểm tra…</strong>
   <small id="v5-maint-duration">—</small>
   <p id="v5-maint-error" class="v5-maint-error" role="status" hidden></p>
  </div>
  <div class="v5-maint-step"><span class="v5-maint-number">2</span><div><h3>Thông báo cho thành viên</h3>
   <p>Nội dung bên dưới sẽ hiển thị cho mọi thành viên, hãy mô tả ngắn gọn.</p></div></div>
  <label class="v5-maint-reason-label" for="v5-maint-reason">Nội dung thông báo</label>
  <textarea id="v5-maint-reason" class="input" rows="2" maxlength="240" required
   placeholder="Ví dụ: Đang nâng cấp hệ thống để cải thiện tốc độ và ổn định.">${esc(schedule?.reason||'')}</textarea>
  <div class="v5-maint-reason-count"><span>Không nhập thông tin nội bộ hoặc dữ liệu cá nhân.</span><span id="v5-maint-count">0/240</span></div>
  <div class="v5-maint-sample"><span>Xem trước thông báo</span><p id="v5-maint-sample-text">Vui lòng nhập nội dung thông báo.</p></div>
  <div class="v5-maint-effects" aria-label="Điều gì xảy ra khi bảo trì?">
   <strong>Điều gì xảy ra khi bảo trì?</strong>
   <p>✓ Trước giờ bắt đầu: thành viên thấy thông báo sắp bảo trì.</p>
   <p>✓ Khi bắt đầu: kết thúc các phiên thành viên và tạm chặn đăng nhập.</p>
   <p>✓ Khi kết thúc: tự cho phép đăng nhập lại. Lên lịch không xóa tài khoản hoặc tin nhắn.</p>
  </div>
  <div class="v5-maint-proof">${adminV3PinFields()}</div>
 </div>`;
}
function adminV5ReadMaintenanceForm(host){
 const value=id=>String(host.querySelector(id)?.value||'').trim();
 const starts_at=adminV5LocalStamp(value('#v5-maint-start-date'),value('#v5-maint-start-time'));
 const ends_at=adminV5LocalStamp(value('#v5-maint-end-date'),value('#v5-maint-end-time'));
 const reason=value('#v5-maint-reason'),at=Math.floor(Date.now()/1000);
 let error='';
 if(starts_at===null||ends_at===null)error='Hãy nhập đủ ngày và giờ hợp lệ cho hai mốc.';
 else if(starts_at<at+30)error='Giờ bắt đầu phải sau thời điểm hiện tại ít nhất 30 giây.';
 else if(starts_at>at+30*86400)error='Chỉ có thể lên lịch trong vòng 30 ngày tới.';
 else if(ends_at<starts_at+60)error='Kết thúc phải sau bắt đầu tối thiểu 1 phút.';
 else if(ends_at>starts_at+7*86400)error='Thời lượng bảo trì tối đa là 7 ngày.';
 else if(!reason)error='Hãy nhập lý do bảo trì để thông báo cho thành viên.';
 return {starts_at,ends_at,reason,error};
}
function adminV5BindMaintenanceForm(host){
 const form=host?.querySelector('#v5-maintain-form');if(!form)return;
 const action=host.querySelector('#modal-confirm');
 let preset=form.querySelector('.v5-maint-preset.is-selected');
 function paint(){
  const v=adminV5ReadMaintenanceForm(host),valid=!v.error;
  const start=v.starts_at&&adminV5FormatWhen(v.starts_at);
  const end=v.ends_at&&adminV5FormatWhen(v.ends_at);
  form.querySelector('#v5-maint-summary-times').textContent=start&&end?
   start+' → '+end:'Chưa chọn đầy đủ ngày và giờ';
  form.querySelector('#v5-maint-duration').textContent=
   'Thời lượng: '+(v.starts_at&&v.ends_at&&v.ends_at>v.starts_at?
    adminV5MaintenanceDuration(v.ends_at-v.starts_at):'chưa xác định');
  const err=form.querySelector('#v5-maint-error');
  err.textContent=v.error;err.hidden=valid;
  form.querySelector('#v5-maint-count').textContent=v.reason.length+'/240';
  form.querySelector('#v5-maint-sample-text').textContent=v.reason||'Vui lòng nhập nội dung thông báo.';
  if(action)action.disabled=!valid;
 }
 function applyDuration(minutes){
  const start=adminV5LocalStamp(form.querySelector('#v5-maint-start-date').value,
                                form.querySelector('#v5-maint-start-time').value);
  if(start===null)return;
  const end=adminV5LocalParts(start+minutes*60);
  form.querySelector('#v5-maint-end-date').value=end.day;
  form.querySelector('#v5-maint-end-time').value=end.time;
 }
 form.addEventListener('click',event=>{
  const btn=event.target.closest('[data-v5-maint-minutes]');
  if(!btn)return;
  preset=btn;
  for(const item of form.querySelectorAll('[data-v5-maint-minutes]')){
   const selected=item===btn;
   item.classList.toggle('is-selected',selected);
   item.setAttribute('aria-pressed',selected?'true':'false');
  }
  applyDuration(Number(btn.dataset.v5MaintMinutes));paint();
 });
 form.addEventListener('input',event=>{
  if(event.target.id==='v5-maint-start-date'||event.target.id==='v5-maint-start-time'){
   if(preset)applyDuration(Number(preset.dataset.v5MaintMinutes));
  }else if(event.target.id==='v5-maint-end-date'||event.target.id==='v5-maint-end-time'){
   preset=null;
   form.querySelectorAll('[data-v5-maint-minutes]').forEach(item=>{
    item.classList.remove('is-selected');item.setAttribute('aria-pressed','false');
   });
  }
  paint();
 });
 form.addEventListener('change',paint);paint();
}
function adminV5ScheduleMaintenance(cancel=false){
 const schedule=adminV5Security?.maintenance?.schedule||null;
 const updating=!!schedule&&!cancel;
 const content=cancel?`<div class="v5-maint-cancel"><strong>Lịch sẽ bị hủy</strong>
  <p>${schedule?esc(adminV5FormatWhen(schedule.starts_at))+' → '+esc(adminV5FormatWhen(schedule.ends_at)):'Không có lịch đang chờ.'}</p>
  <p>${schedule&&Number(schedule.starts_at)<=Date.now()/1000?'Lịch đã bắt đầu: hủy lúc này sẽ cho phép thành viên đăng nhập lại, trừ khi bật bảo trì thủ công.':'Hủy lịch đang chờ không ảnh hưởng đến hoạt động hiện tại.'}</p>
  <p>Việc hủy lịch không tắt bảo trì thủ công đã được bật riêng.</p></div>
  <div class="v5-maint-proof">${adminV3PinFields()}</div>`:adminV5MaintenanceFormMarkup(schedule);
 modal({
  title:cancel?'Hủy lịch bảo trì':updating?'Chỉnh sửa lịch bảo trì':'Đặt lịch bảo trì',
  description:cancel?'Lịch sẽ được gỡ và hệ thống không tự bật bảo trì theo lịch này.':
   updating?'Chọn giờ mới và kiểm tra thông báo trước khi cập nhật.':
   'Chọn thời gian và thông báo; hệ thống sẽ tự bắt đầu và kết thúc.',
  confirm:cancel?'Xác nhận hủy lịch':updating?'Lưu thay đổi':'Xác nhận đặt lịch',
  cancel:'Quay lại',danger:cancel,content,
  handler:async host=>{
   const v=cancel?{starts_at:0,ends_at:0,reason:''}:adminV5ReadMaintenanceForm(host);
   if(v.error)throw Error(v.error);
   const proof=adminV3PinPayload(host);
   await post('/api/admin/security/maintenance/schedule',{
    starts_at:v.starts_at,ends_at:v.ends_at,reason:v.reason,...proof
   });
   toast(cancel?'Đã hủy lịch bảo trì.':'Đã lưu lịch: '+adminV5FormatWhen(v.starts_at)+'.','ok');
   await adminV5Refresh(true);
  }
 });
 if(!cancel)adminV5BindMaintenanceForm(document.querySelector('#modal-root'));
}
function adminV5DoRevoke(){
 adminV5ProofModal('Thu hồi mọi phiên Admin khác',
  'Các thiết bị khác và các yêu cầu đăng nhập đang chờ sẽ bị thu hồi. Chỉ phiên này tiếp tục hoạt động.',
  'Thu hồi bằng PIN',true,
  async admin_pin=>{
   const r=await post('/api/admin/security/revoke-others',{admin_pin});
   toast('Đã thu hồi '+adminV5Num(r.revoked_sessions)+' phiên Admin khác.','ok');
   await loadAdmin();
  });
}
document.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-admin-v5]');
 if(!btn||btn.disabled||!adminV5Ready())return;
 const action=btn.dataset.adminV5;
 try{
  if(action==='refresh')return await adminV5Refresh(true);
  if(action==='security-tab'){
   const nav=document.querySelector('.admin-nav button[data-act="admin-tab"][data-tab="security"]');
   if(nav)nav.click();return;
  }
  if(action==='revoke-others')return adminV5DoRevoke();
  if(action==='maintenance-schedule'||action==='maintenance-cancel')return adminV5ScheduleMaintenance(action==='maintenance-cancel');
  if(action==='maintenance')return adminV5DoMaintenance(btn.dataset.v5Enable==='1');
  if(action==='lockdown')return adminV5DoLockdown(btn.dataset.v5Enable==='1');
 }catch(e){toast(e.message||'Không thể thực hiện thao tác Admin.','error');}
});
const adminV5Observer=new MutationObserver(()=>{
 if(adminV5RenderQueued)return;
 adminV5RenderQueued=true;
 requestAnimationFrame(()=>{adminV5RenderQueued=false;adminV5Mount();});
});
function adminV5Boot(){
 const root=document.querySelector('#app');
 if(root)adminV5Observer.observe(root,{childList:true,subtree:false});
 adminV5Mount();
}
document.addEventListener('DOMContentLoaded',adminV5Boot);
if(document.readyState!=='loading')adminV5Boot();
setInterval(()=>{
 if(!document.hidden&&adminV5Ready()&&!document.activeElement?.closest('input,textarea,select'))
   adminV5Refresh(false).catch(()=>{});
},30000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&adminV5Ready())adminV5Refresh(false).catch(()=>{});
});
