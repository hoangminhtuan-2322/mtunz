/* mtunz Admin V3 — consent-first session security, PIN-only moderation UI. */
'use strict';
let adminV3ApprovalTimer=null,adminV3ApprovalBusy=false;

function adminV3PinFields(){
 if(!state.user?.pin_length)return adminProofFields();
 return `<div class="admin-v3-proof"><div class="row between"><b>🔐 Xác minh Admin</b><span class="pill">Chỉ PIN</span></div>
 <p class="hint">Yêu cầu nhập PIN để thực hiện hành động. Mã chỉ được gửi qua kết nối bảo mật, không lưu trên trình duyệt.</p>
 <div class="field"><label for="admin-v3-pin">PIN Admin (${Number(state.user.pin_length)} chữ số)</label>
 <input class="input" type="password" id="admin-v3-pin" inputmode="numeric" autocomplete="off"
 pattern="[0-9]{${Number(state.user.pin_length)}}" minlength="${Number(state.user.pin_length)}"
 maxlength="${Number(state.user.pin_length)}" required placeholder="Nhập PIN để xác nhận"></div></div>`;
}
function adminV3PinPayload(host){
 if(!state.user?.pin_length)return adminProofValue(host);
 const pin=host.querySelector('#admin-v3-pin')?.value||'';
 if(!new RegExp('^[0-9]{'+Number(state.user.pin_length)+'}$').test(pin))
  throw Error('Hãy nhập chính xác PIN Admin '+Number(state.user.pin_length)+' chữ số.');
 return {admin_pin:pin};
}
function adminV3ReasonOptions(){
 return [
 ['','— Chọn lý do mẫu hoặc nhập thủ công —'],
 ['Gửi tin nhắn rác, quảng cáo hoặc làm phiền nhiều người.','Spam / quảng cáo'],
 ['Quấy rối, đe dọa hoặc xúc phạm thành viên khác.','Quấy rối / đe dọa'],
 ['Có dấu hiệu lừa đảo, giả danh hoặc chiếm đoạt thông tin.','Lừa đảo / giả mạo'],
 ['Phát tán nội dung độc hại hoặc không phù hợp với cộng đồng.','Nội dung vi phạm'],
 ['Lạm dụng chức năng, tạo tài khoản ảo hoặc thao túng hệ thống.','Lạm dụng hệ thống'],
 ['Vi phạm quy định bảo mật, dò quét hoặc cố ý phá hoại dịch vụ.','Vi phạm bảo mật'],
 ['Tái phạm sau nhiều lần nhắc nhở và cảnh báo.','Tái phạm nhiều lần']
 ].map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
}
function adminV3DurationValue(host){
 const num=id=>Number(host.querySelector('#sanction-'+id)?.value||0);
 const d=num('days'),h=num('hours'),m=num('minutes'),s=num('seconds');
 if(![d,h,m,s].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('Thời gian phải là số nguyên không âm.');
 if(h>23||m>59||s>59)throw Error('Giờ tối đa 23, phút/giây tối đa 59.');
 const total=d*86400+h*3600+m*60+s;
 if(total>157680000)throw Error('Thời hạn tối đa 5 năm.');
 return total;
}
function adminV3FormatSeconds(n){
 if(!n)return 'Không giới hạn (cấm vĩnh viễn)';
 const d=Math.floor(n/86400),h=Math.floor(n%86400/3600),
  m=Math.floor(n%3600/60),sec=n%60;
 return [d&&d+' ngày',h&&h+' giờ',m&&m+' phút',sec&&sec+' giây'].filter(Boolean).join(' ');
}
function sanctionDialog(uid,kind){
 const u=(state.adminData||[]).find(x=>x.id===uid);
 const who=u?.username||'#'+uid;
 if(kind==='unban')return modal({
  title:'Gỡ khóa / bỏ cấm',description:'Khôi phục quyền đăng nhập cho '+who+'.',
  confirm:'Xác nhận mở khóa',content:adminV3PinFields(),
  handler:async host=>{
   await post('/api/admin/users/'+uid+'/sanction',{kind:'unban',reason:'',...adminV3PinPayload(host)});
   toast('Đã khôi phục tài khoản.','ok');await loadAdmin();
  }
 });
 const ban=kind==='ban';
 const preset=ban?0:3600;
 const content=`<div class="admin-v3-sanction">
  <section class="admin-v3-duration">
   <div class="row between"><strong>Thời hạn áp dụng</strong><span class="pill" id="sanction-preview">Đang tính...</span></div>
   <label for="sanction-preset">Chọn nhanh</label>
   <select class="select" id="sanction-preset">
     <option value="${preset}">Mặc định · ${ban?'Vĩnh viễn':'1 giờ'}</option>
     <option value="60">1 phút</option><option value="3600">1 giờ</option>
     <option value="43200">12 giờ</option><option value="86400">1 ngày</option>
     <option value="604800">7 ngày</option><option value="2592000">30 ngày</option>
     ${ban?'<option value="0">Cấm vĩnh viễn</option>':''}
     <option value="custom">Tùy chỉnh</option>
   </select>
   <div class="admin-v3-time-grid">
    <label>Ngày<input class="input" id="sanction-days" type="number" value="0" min="0" max="1825" step="1"></label>
    <label>Giờ<input class="input" id="sanction-hours" type="number" value="${ban?0:1}" min="0" max="23" step="1"></label>
    <label>Phút<input class="input" id="sanction-minutes" type="number" value="0" min="0" max="59" step="1"></label>
    <label>Giây<input class="input" id="sanction-seconds" type="number" value="0" min="0" max="59" step="1"></label>
   </div>
   <p class="hint" id="sanction-end-time">Tính giờ kết thúc theo thời gian hiện tại.</p>
   ${ban?'<p class="hint">Để tất cả bằng 0 để cấm vĩnh viễn. Khóa tạm thời luôn phải có thời hạn.</p>':
          '<p class="hint">Khóa tạm thời tối thiểu 1 giây, tối đa 5 năm.</p>'}
  </section>
  <div class="field"><label for="sanction-reason-template">Mẫu lý do thường dùng</label>
  <select class="select" id="sanction-reason-template">${adminV3ReasonOptions()}</select></div>
  <div class="field"><label for="sanction-reason">Lý do gửi tới người dùng</label>
  <textarea class="textarea" id="sanction-reason" rows="3" maxlength="250" minlength="5"
  placeholder="Mô tả rõ hành vi và lý do xử lý. Shift+Enter để xuống dòng." required></textarea></div>
  ${adminV3PinFields()}
  <p class="hint">Sau khi nhập đủ thông tin, nhấn Enter để xác nhận; Shift+Enter xuống dòng.</p>
 </div>`;
 modal({title:ban?'Cấm tài khoản':'Khóa tài khoản',
  description:'Áp dụng ngay cho '+who+'. Các phiên hiện tại của thành viên sẽ bị thu hồi.',
  danger:true,confirm:ban?'Cấm tài khoản':'Khóa ngay',content,
  handler:async host=>{
   const seconds=adminV3DurationValue(host);
   if(!ban&&!seconds)throw Error('Khóa tài khoản phải có thời hạn lớn hơn 0 giây.');
   const reason=host.querySelector('#sanction-reason')?.value.trim()||'';
   if(reason.length<5)throw Error('Vui lòng nhập lý do rõ ràng ít nhất 5 ký tự.');
   await post('/api/admin/users/'+uid+'/sanction',{
    kind,seconds:seconds||null,reason,...adminV3PinPayload(host)
   });
   toast('Đã '+(ban?'cấm':'khóa')+' tài khoản '+who+'.','ok');
   await loadAdmin();
  }
 });
 const host=$('#modal-root');
 const update=()=>{
  const preview=host?.querySelector('#sanction-preview');
  const end=host?.querySelector('#sanction-end-time');
  if(!preview||!end)return;
  try{
   const secs=adminV3DurationValue(host);
   preview.textContent=adminV3FormatSeconds(secs);
   end.textContent=secs?'Kết thúc dự kiến: '+new Date(Date.now()+secs*1000).toLocaleString('vi-VN',
       {hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):
       'Quyết định cấm vĩnh viễn, chỉ Admin mới có thể gỡ.';
  }catch(err){preview.textContent='Thời hạn chưa hợp lệ';end.textContent=err.message;}
 };
 host.querySelector('#sanction-preset')?.addEventListener('change',event=>{
  const value=event.target.value;if(value==='custom')return;
  const sec=Number(value);
  for(const [part,n] of [['days',Math.floor(sec/86400)],['hours',Math.floor(sec%86400/3600)],
    ['minutes',Math.floor(sec%3600/60)],['seconds',sec%60]]){
   const input=host.querySelector('#sanction-'+part);if(input)input.value=String(n);
  }
  update();
 });
 for(const input of host.querySelectorAll('.admin-v3-time-grid input')){
  input.addEventListener('input',()=>{host.querySelector('#sanction-preset').value='custom';update();});
 }
 host.querySelector('#sanction-reason-template')?.addEventListener('change',event=>{
  const area=host.querySelector('#sanction-reason');
  if(area&&event.target.value){area.value=event.target.value;area.focus();}
 });
 host.querySelector('.premium-dialog')?.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.shiftKey||event.isComposing)return;
  if(event.target.tagName==='BUTTON'||event.target.tagName==='SELECT')return;
  const area=host.querySelector('#sanction-reason');
  const pin=host.querySelector('#admin-v3-pin');
  if(area?.value.trim().length<5||state.user?.pin_length&&pin?.value.length!==state.user.pin_length)return;
  event.preventDefault();host.querySelector('#modal-confirm')?.click();
 });
 update();
}
function adminApprovalWaiting(){
 return `<span class="eyebrow">BẢO MẬT ĐĂNG NHẬP ADMIN</span><h1>Đang chờ phê duyệt thiết bị.</h1>
 <p class="hint">Phiên Admin đang hoạt động phải cho phép lần đăng nhập thứ hai bằng mã PIN. Chúng tôi không tự đăng xuất phiên cũ.</p>
 <div class="admin-v3-await"><span class="dot"></span><strong>Yêu cầu chỉ có hiệu lực 5 phút</strong><p>Trên thiết bị đang quản trị, mở <b>Bảo mật Admin → Thiết bị chờ phê duyệt</b>.</p></div>
 <button type="button" class="btn primary full" data-admin-v3-action="poll-approval">Kiểm tra phê duyệt</button>
 <button type="button" class="btn ghost full" data-admin-v3-action="cancel-approval">Hủy yêu cầu</button>`;
}
async function adminV3PollApproval(){
 if(adminV3ApprovalBusy||!state.adminApprovalToken||state.step!=='approval')return;
 adminV3ApprovalBusy=true;
 try{
  const result=await post('/api/auth/admin/approval/status',{approval_token:state.adminApprovalToken});
  if(result.status==='active'){
   clearInterval(adminV3ApprovalTimer);adminV3ApprovalTimer=null;
   state.adminApprovalToken=null;
   state.user=(await api('/api/me')).user;
   toast('Thiết bị đã được phê duyệt. Đăng nhập an toàn thành công.','ok');
   await enterApp();return;
  }
  if(['denied','expired','full'].includes(result.status)){
   clearInterval(adminV3ApprovalTimer);adminV3ApprovalTimer=null;
   state.adminApprovalToken=null;state.step='username';renderAuth();
   toast(result.status==='denied'?'Thiết bị hiện tại đã từ chối yêu cầu.':
      result.status==='full'?'Đã đủ 2 phiên Admin.':'Yêu cầu phê duyệt hết hạn.','error');
  }
 }catch(err){if(err?.status===401||err?.status===404)console.warn('Approval pending status:',err.message);}
 finally{adminV3ApprovalBusy=false;}
}
function startAdminApprovalPolling(){
 if(adminV3ApprovalTimer)clearInterval(adminV3ApprovalTimer);
 adminV3ApprovalTimer=setInterval(()=>{
  if(state.step==='approval'&&!document.hidden)adminV3PollApproval().catch(()=>{});
 },4500);
}
function adminV3SecurityPanel(){
 const d=state.adminApprovalData||{},pending=d.pending||[];
 return `<section class="card admin-v3-security-card" aria-label="Phê duyệt phiên đăng nhập Admin">
  <div class="row between"><h3>🛡️ Phiên Admin & thiết bị chờ</h3><span class="pill">${Number(d.active_sessions||1)}/2 phiên</span></div>
  <p class="hint">Mặc định một phiên hoạt động. Thiết bị thứ hai dù đã nhập đúng mật khẩu và PIN vẫn cần thiết bị đang đăng nhập phê duyệt bằng PIN. Tối đa hai phiên cùng lúc.</p>
  <div class="row"><button class="btn ghost sm" type="button" data-admin-v3-action="refresh-approvals">Làm mới</button>
  <button class="btn ghost sm" type="button" data-act="list-sessions">Xem / thu hồi phiên</button></div>
  <div class="admin-v3-pending-list">
   ${pending.length?pending.map(item=>`<div class="admin-v3-request"><div><b>${esc(item.device_name||'Thiết bị mới')}</b>
    <p class="hint">${esc(item.browser||'Trình duyệt')} · ${esc(item.os_name||'Hệ điều hành')} · Hết hạn ${deadlineDate(item.expires_at)}</p></div>
    <div class="row"><button class="btn primary sm" type="button" data-admin-v3-approval="${esc(item.request_id)}" data-admin-v3-decision="1">Phê duyệt</button>
    <button class="btn ghost sm" type="button" data-admin-v3-approval="${esc(item.request_id)}" data-admin-v3-decision="0">Từ chối</button></div></div>`).join(''):
    '<p class="hint">Không có yêu cầu đăng nhập đang chờ.</p>'}
  </div></section>
  <section class="card admin-v3-reset-card">
   <h3>🧹 Đặt lại dữ liệu thành viên</h3>
   <p class="hint">Xóa toàn bộ dữ liệu thành viên, lịch sử tin nhắn, tệp và dữ liệu liên quan trong cơ sở dữ liệu hiện tại. Giữ nguyên tài khoản, mật khẩu, PIN và phiên hiện tại của Admin. Bản sao lưu/nhánh dữ liệu khác không tự xóa.</p>
   <button class="btn danger" type="button" data-admin-v3-action="preview-reset">Xem thống kê & xác nhận xóa</button>
  </section>`;
}
function adminV3AuditControls(){
 return `<div class="admin-v3-audit-actions">
 <span class="hint">Chọn các nhật ký không cần giữ hoặc xóa toàn bộ. Mỗi thao tác đều yêu cầu PIN và ghi lại dấu xác nhận tối thiểu.</span>
 <div class="row"><button class="btn ghost sm" type="button" data-admin-v3-action="prune-selected">Xóa các mục đã chọn</button>
 <button class="btn danger sm" type="button" data-admin-v3-action="prune-all">Xóa toàn bộ nhật ký</button></div></div>`;
}
async function adminV3RequestDecision(requestId,approve){
 modal({title:approve?'Phê duyệt đăng nhập Admin':'Từ chối đăng nhập',
  description:approve?'Thiết bị mới sẽ được phép mở phiên thứ hai sau khi nhập lại PIN tại phiên này.':'Ngăn thiết bị này đăng nhập. Yêu cầu phải xác minh lại từ đầu.',
  confirm:approve?'Cho phép thiết bị':'Từ chối',danger:!approve,content:adminV3PinFields(),
  handler:async host=>{
   await post('/api/admin/login-approvals/'+requestId+'/decision',{
    approve,admin_pin:adminV3PinPayload(host).admin_pin
   });
   toast(approve?'Đã phê duyệt thiết bị.':'Đã từ chối thiết bị.','ok');
   state.adminApprovalData=await api('/api/admin/login-approvals');renderAdmin();
  }});
}
async function adminV3ResetPreview(){
 const preview=await api('/api/admin/data-reset/preview');
 modal({title:'Xóa sạch dữ liệu thành viên',
  description:'Hành động không thể hoàn tác trong database hiện tại. Tài khoản Admin vẫn được giữ nguyên.',
  danger:true,confirm:'Xóa toàn bộ dữ liệu thành viên',
  content:`<div class="admin-v3-reset-preview">
    <strong>Các dữ liệu sẽ bị xóa</strong>
    <div class="admin-v3-reset-numbers"><span>Thành viên: <b>${preview.members}</b></span>
    <span>Đơn đăng ký: <b>${preview.registrations}</b></span>
    <span>Tin riêng: <b>${preview.direct_messages}</b></span>
    <span>Tin nhóm: <b>${preview.group_messages}</b></span>
    <span>Chat thế giới: <b>${preview.world_messages}</b></span>
    <span>Tệp: <b>${preview.files}</b></span>
    <span>Báo cáo: <b>${preview.reports}</b></span>
    <span>Nhật ký: <b>${preview.audit_logs}</b></span></div>
    <p class="hint">Chỉ database production hiện tại được xử lý. Snapshot, nhánh Neon và bản sao lưu ngoài hệ thống vẫn tồn tại. Hãy kiểm tra phạm vi này trước khi tiếp tục.</p>
    <div class="field"><label for="admin-v3-erase-confirm">Nhập chính xác: XOA TOAN BO NGUOI DUNG</label>
    <input class="input" id="admin-v3-erase-confirm" autocomplete="off" spellcheck="false" placeholder="Nhập cụm từ xác nhận"></div>
    ${adminV3PinFields()}
   </div>`,
  handler:async host=>{
   const confirm=host.querySelector('#admin-v3-erase-confirm').value.trim();
   if(confirm!=='XOA TOAN BO NGUOI DUNG')throw Error('Cụm từ xác nhận chưa chính xác.');
   const proof=adminV3PinPayload(host);
   if(!proof.admin_pin)throw Error('Phải bật PIN Admin trước khi xóa dữ liệu.');
   const result=await post('/api/admin/data-reset',{
    confirm,expected_members:preview.members,admin_pin:proof.admin_pin
   });
   toast('Đã xóa dữ liệu của '+result.erased_members+' thành viên; giữ nguyên Admin.','ok');
   state.adminTab='overview';await loadAdmin();
  }
 });
}
function adminV3Prune(mode){
 const ids=[...document.querySelectorAll('input[data-admin-audit-select]:checked')]
  .map(el=>Number(el.value)).filter(Number.isSafeInteger);
 if(mode==='selected'&&!ids.length){toast('Chọn tối thiểu một nhật ký để xóa.','error');return;}
 modal({title:mode==='all'?'Xóa toàn bộ nhật ký':'Xóa nhật ký đã chọn',
  description:'Thao tác sẽ xóa '+(mode==='all'?'tất cả sự kiện trong bảng nhật ký':ids.length+' sự kiện đã chọn')+'. Sẽ giữ lại một dấu xác nhận bảo mật tối thiểu.',
  confirm:'Xác nhận xóa nhật ký',danger:true,
  content:`<div class="field"><label>Nhập XOA NHAT KY</label>
   <input class="input" id="admin-v3-audit-confirm" autocomplete="off" spellcheck="false"></div>${adminV3PinFields()}`,
  handler:async host=>{
   const confirm=host.querySelector('#admin-v3-audit-confirm').value.trim();
   if(confirm!=='XOA NHAT KY')throw Error('Cụm từ xác nhận chưa chính xác.');
   const proof=adminV3PinPayload(host);
   if(!proof.admin_pin)throw Error('Phải bật PIN Admin để xóa nhật ký.');
   const result=await post('/api/admin/audit/prune',{mode,ids,confirm,admin_pin:proof.admin_pin});
   toast('Đã xóa '+result.erased+' nhật ký.','ok');await loadAdmin();
  }
 });
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-admin-v3-action],[data-admin-v3-approval]');
 if(!button||button.disabled)return;
 try{
  if(button.hasAttribute('data-admin-v3-approval'))
    return adminV3RequestDecision(button.dataset.adminV3Approval,button.dataset.adminV3Decision==='1');
  const action=button.dataset.adminV3Action;
  if(action==='poll-approval')return await adminV3PollApproval();
  if(action==='cancel-approval'){
   if(adminV3ApprovalTimer)clearInterval(adminV3ApprovalTimer);
   adminV3ApprovalTimer=null;state.adminApprovalToken=null;state.step='username';renderAuth();return;
  }
  if(action==='refresh-approvals'){
   state.adminApprovalData=await api('/api/admin/login-approvals');renderAdmin();return;
  }
  if(action==='preview-reset')return await adminV3ResetPreview();
  if(action==='prune-selected'||action==='prune-all')return adminV3Prune(action==='prune-all'?'all':'selected');
 }catch(err){toast(err.message||'Hành động Admin không thực hiện được.','error');}
});
