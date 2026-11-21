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
   '<strong class="v5-action-state">'+(s?(maintenance?'Đang bảo trì':'Đang hoạt động'):'Đang tải')+'</strong>'+
   '<button type="button" class="btn '+(maintenance?'ghost':'danger')+'" data-admin-v5="maintenance" data-v5-enable="'+(maintenance?'0':'1')+'" '+(s?'':'disabled')+'>'+
    (maintenance?'Kết thúc bảo trì':'Bật bảo trì')+'</button></article>'+
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
