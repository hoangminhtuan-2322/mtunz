/* Live operational readiness; read-only, redacted, Admin authenticated. */
'use strict';
let v7Readiness=null,v7ReadinessFetched=0,v7ReadinessBusy=false;
function v7ReadinessPanel(){
 const d=v7Readiness;
 if(!d)return '<section class="card v7-readiness"><div class="row between"><h3>🛡️ Đánh giá bảo mật và vận hành</h3>'+
  '<button type="button" class="btn ghost sm" data-v7-readiness="refresh">Kiểm tra ngay</button></div>'+
  '<p class="hint">Chưa tải chỉ số. Không hiển thị thông tin xác thực hoặc dữ liệu cá nhân.</p></section>';
 const status=d.status==='emergency'?'Đang khóa khẩn cấp':d.status==='attention'?'Cần xử lý':'Đang giám sát';
 return '<section class="card v7-readiness"><div class="row between"><div><h3>🛡️ Kiểm tra bảo mật và vận hành</h3>'+
 '<p class="hint">Neon '+Number(d.db_query_ms)+' ms · '+new Date(d.generated_at*1000).toLocaleString('vi-VN')+'</p></div>'+
 '<span class="pill '+(d.status==='monitoring'?'good':'warn')+'">'+esc(status)+'</span></div>'+
 '<div class="v7-readiness-checks">'+d.checks.map(i=>
 '<div class="v7-readiness-check"><span>'+(i.ok?'✓':'!')+'</span><strong>'+esc(i.label)+'</strong>'+
 '<small>'+(i.ok?'Đạt điều kiện giám sát':'Cần kiểm tra')+'</small></div>').join('')+'</div>'+
 (d.alerts.length?'<div class="v7-readiness-alerts">'+d.alerts.map(a=>
 '<div><b>'+esc(a.severity==='high'?'⚠️':'ℹ️')+'</b> '+esc(a.summary)+'</div>').join('')+'</div>':
 '<p class="hint">Không có cảnh báo từ các tiêu chí đang theo dõi.</p>')+
 '<details><summary>Giới hạn của phép kiểm tra</summary>'+
 d.notes.map(x=>'<p class="hint">'+esc(x)+'</p>').join('')+'</details>'+
 '<div class="row"><button type="button" class="btn ghost sm" data-v7-readiness="refresh">Làm mới kiểm tra</button>'+
 '<button type="button" class="btn ghost sm" data-act="admin-tab" data-tab="world">Quản lý sự kiện & kháng nghị</button></div></section>';
}
async function v7RefreshReadiness(force=false){
 if(!state.user?.is_admin||state.adminTab!=='ops'||v7ReadinessBusy)return;
 if(!force&&Date.now()-v7ReadinessFetched<30000)return;
 v7ReadinessBusy=true;
 try{
  const data=await api('/api/admin/ops/security-readiness');
  v7Readiness=data;v7ReadinessFetched=Date.now();
  const root=document.getElementById('v7-readiness-panel');
  if(root)root.innerHTML=v7ReadinessPanel();
 }catch(err){if(force)toast(err.message||'Không thể kiểm tra bảo mật.','error');}
 finally{v7ReadinessBusy=false;}
}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-v7-readiness]');
 if(!el||!state.user?.is_admin)return;
 if(el.dataset.v7Readiness==='refresh')v7RefreshReadiness(true).catch(()=>{});
});
setInterval(()=>{
 if(state.user?.is_admin&&state.adminTab==='ops'&&!document.hidden)v7RefreshReadiness(false).catch(()=>{});
},12000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&state.user?.is_admin&&state.adminTab==='ops')v7RefreshReadiness(false).catch(()=>{});
});
