/* mtunz V6 Admin operations dashboard. Aggregates only; no PII or secrets. */
'use strict';
function v6StatNumber(n){return Math.max(0,Number(n)||0).toLocaleString('vi-VN');}
function v6OpsMetric(label,value,caption,iconName){
 return '<div class="v6-ops-metric"><div class="v6-metric-cap"><span>'+icon(iconName,17)+'</span>'+
 '<span>'+esc(label)+'</span></div><strong>'+esc(String(value))+'</strong>'+
 '<small>'+esc(caption)+'</small></div>';
}
function v6OpsAlert(alert){
 const level=['high','medium','info'].includes(alert.level)?alert.level:'info';
 return '<div class="v6-alert-item v6-alert-'+level+'"><span class="v6-alert-sign">'+
 (level==='high'?'⚠️':level==='medium'?'🔔':'ℹ️')+'</span>'+
 '<p>'+esc(alert.text)+'</p></div>';
}
function adminOpsV6(){
 const d=state.adminData||{},alerts=d.alerts||[],flags=d.flags||[],rooms=d.rooms||[];
 const ms=Number(d.database_response_ms)||0;
 const traffic=[['Tin riêng',Number(d.direct_messages_1h)||0],
  ['Tin nhóm',Number(d.group_messages_1h)||0],
  ['Chat thế giới',Number(d.world_messages_1h)||0]];
 const peak=Math.max(1,...traffic.map(x=>x[1]));
 return '<div class="v6-ops-page"><section class="v6-ops-hero"><div>'+
   '<span class="eyebrow">MTUNZ · OPERATION CENTER V6</span>'+
   '<h2>Điều hành hệ thống theo dữ liệu thực</h2>'+
   '<p>Thống kê tổng hợp, không hiển thị IP, nội dung tin nhắn hoặc thông tin xác thực.</p></div>'+
   '<div class="v6-ops-hero-right"><span class="v6-ops-healthy">'+icon('activity',17)+
   ' Đã kết nối với Neon</span><button type="button" class="btn ghost sm" data-v6-ops="refresh">'+
   icon('refresh',15)+' Làm mới</button></div></section>'+
   '<div class="v6-ops-metrics">'+
    v6OpsMetric('Thành viên online',v6StatNumber(d.online_members||0),'WebSocket kết nối đến instance hiện tại','users')+
    v6OpsMetric('Phiên đang hoạt động',v6StatNumber(d.active_member_sessions||0),'Phiên của thành viên chưa hết hạn','shield')+
    v6OpsMetric('Tin riêng / 24 giờ',v6StatNumber(d.direct_messages_24h||0),'Tin được ghi nhận trên máy chủ','message-circle')+
    v6OpsMetric('Truy vấn báo cáo',ms+' ms','Thời gian lấy các thống kê trong Neon','zap')+
   '</div>'+
   '<div class="v6-ops-grid"><section class="card v6-ops-card"><div class="v6-card-top">'+
   '<h3>⚡ Hoạt động 60 phút gần nhất</h3><span class="pill">Realtime</span></div>'+
   '<div class="v6-traffic-graph">'+traffic.map(([label,count])=>
    '<div class="v6-traffic-row"><div><span>'+esc(label)+'</span><strong>'+v6StatNumber(count)+'</strong></div>'+
    '<div class="v6-traffic-track"><div style="width:'+Math.round(count/peak*100)+'%"></div></div></div>').join('')+'</div>'+
   '<p class="hint">Số liệu lấy từ bản ghi lưu trong cơ sở dữ liệu, không phải thống kê quảng cáo hoặc lượt xem.</p></section>'+
   '<section class="card v6-ops-card"><div class="v6-card-top"><h3>🚨 Cảnh báo cần xử lý</h3>'+
   '<span class="pill '+(alerts.length?'warn':'good')+'">'+alerts.length+' tín hiệu</span></div>'+
   '<div class="v6-alert-stack">'+(alerts.length?alerts.map(v6OpsAlert).join(''):
    '<div class="v6-alert-ok">'+icon('check-circle',18)+' Không có cảnh báo theo các điều kiện đang giám sát.</div>')+'</div>'+
   '<div class="v6-ops-actions"><button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="security">Bảo mật Admin</button>'+
   '<button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="reports">Báo cáo vi phạm</button></div></section>'+
   '<section class="card v6-ops-card"><div class="v6-card-top"><h3>🧩 Công tắc tính năng</h3>'+
   '<span class="pill">Xác minh PIN</span></div>'+
   '<p class="hint">Có thể mở hoặc tạm tắt từng tính năng mà không phải triển khai lại mã nguồn. Máy chủ kiểm tra quyền trước khi thực hiện.</p>'+
   '<div class="v6-feature-list">'+flags.map(f=>
    '<div class="v6-feature-row"><div><strong>'+esc(f.title)+'</strong><small>'+esc(f.description)+'</small></div>'+
    '<button type="button" class="v6-feature-switch '+(f.enabled?'active':'')+'" data-v6-ops="feature-toggle"'+
    ' data-v6-flag="'+esc(f.code)+'" data-v6-enabled="'+(f.enabled?'0':'1')+'"'+
    ' aria-label="'+(f.enabled?'Tắt ':'Bật ')+esc(f.title)+'" aria-pressed="'+(f.enabled?'true':'false')+'">'+
    (f.enabled?'Đang bật':'Đang tắt')+'</button></div>').join('')+'</div></section>'+
   '<section class="card v6-ops-card"><div class="v6-card-top"><h3>🗂️ Cộng đồng và lịch gửi</h3></div>'+
   '<div class="v6-ops-small-stats">'+[
    ['Phòng đang mở',rooms.filter(x=>x.active).length],
    ['Báo cáo chờ',d.pending_reports||0],
    ['Đăng ký chờ',d.pending_registrations||0],
    ['Hỗ trợ chưa đóng',d.open_support_tickets||0],
    ['Tin hẹn giờ lỗi',d.failed_scheduled||0],
    ['Tin hẹn giờ quá hạn',d.overdue_scheduled||0]
   ].map(([label,value])=>
    '<div><span>'+esc(label)+'</span><strong>'+v6StatNumber(value)+'</strong></div>').join('')+'</div>'+
   '<div class="v6-ops-actions"><button type="button" class="btn primary sm" data-act="admin-tab" data-tab="world">Quản lý cộng đồng</button>'+
   '<button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="audit">Nhật ký bảo mật</button></div></section>'+
   '</div><footer class="v6-ops-disclaimer">'+icon('shield',15)+
   ' Số liệu online là ước lượng từ WebSocket của instance Render đang chạy. Bảng này không thay thế công cụ giám sát độc lập, kiểm thử phục hồi backup hoặc bảo vệ nhánh Neon.</footer></div>';
}
document.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-v6-ops]');
 if(!btn||btn.disabled||!state.user?.is_admin)return;
 try{
  if(btn.dataset.v6Ops==='refresh'){
   if(state.adminTab==='ops')await loadAdmin();
   return;
  }
  if(btn.dataset.v6Ops==='feature-toggle'){
   const code=btn.dataset.v6Flag,enabled=btn.dataset.v6Enabled==='1';
   if(!['calls','disappearing_dm','community_polls','world_rooms'].includes(code))return;
   modal({title:(enabled?'Bật':'Tắt')+' tính năng',
    description:'Thay đổi có hiệu lực trên máy chủ. Đang dùng tính năng có thể phải làm mới màn hình để nhận cấu hình.',
    confirm:enabled?'Bật tính năng':'Tạm tắt tính năng',
    danger:!enabled,content:adminV3PinFields(),
    handler:async host=>{
     const proof=adminV3PinPayload(host);
     await post('/api/admin/ops/flags',{code,enabled,admin_pin:proof.admin_pin});
     toast('Đã cập nhật công tắc tính năng.','ok');await loadAdmin();
    }});
  }
 }catch(err){toast(err.message||'Không thể tải thông tin điều hành.','error');}
});
setInterval(()=>{
 if(state.user?.is_admin&&state.adminTab==='ops'&&!document.hidden&&
    !document.querySelector('#modal-root .modal')&&
    !document.activeElement?.closest('input,textarea,select'))loadAdmin().catch(()=>{});
},30000);
