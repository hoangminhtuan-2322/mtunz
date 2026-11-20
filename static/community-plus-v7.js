/* mtunz community V7: upcoming events, attendance and fair sanction appeals. */
'use strict';
let communityPlusCache={events:[],appeals:[],adminEvents:[],adminAppeals:[],room:0,at:0};
const communityPlusDate=ts=>new Date(Number(ts)*1000).toLocaleString('vi-VN',
 {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function communityPlusEvents(){
 const events=communityPlusCache.events.filter(x=>x.room_id===Number(state.v6WorldRoom||1));
 return '<section class="v7-event-wrap" aria-label="Sự kiện cộng đồng"><div class="v7-event-heading">'+
 '<h3>📅 Sự kiện sắp tới</h3><button type="button" class="btn ghost sm" data-cv7="refresh">Làm mới</button></div>'+
 (events.length?events.map(e=>
 '<article class="v7-event-card"><div class="v7-event-main"><strong>'+esc(e.title)+'</strong>'+
 '<small>'+communityPlusDate(e.starts_at)+' – '+communityPlusDate(e.ends_at)+'</small>'+
 (e.details?'<p>'+esc(e.details)+'</p>':'')+
 '<small>👥 '+Number(e.attendees)+' người quan tâm</small></div>'+
 '<button class="btn '+(e.attending?'ghost':'primary')+' sm" type="button" data-cv7="rsvp" data-cv7-id="'+Number(e.id)+'">'+
 (e.attending?'Bỏ tham gia':'Tôi tham gia')+'</button></article>').join(''):
 '<p class="hint">Chưa có sự kiện nào được lên lịch trong phòng này.</p>')+'</section>';
}
function communityPlusAppealsButton(){
 return '<button type="button" class="btn ghost sm" data-cv7="my-appeals">⚖️ Kháng nghị xử phạt</button>';
}
function communityPlusAdminPanel(){
 const rooms=state.adminV6Rooms||[];
 const options=rooms.filter(x=>x.active).map(r=>
   '<option value="'+Number(r.id)+'">'+esc(r.title)+'</option>').join('');
 const events=communityPlusCache.adminEvents||[],appeals=communityPlusCache.adminAppeals||[];
 return '<section class="v7-community-admin"><div class="v7-community-heading">'+
 '<div><span class="eyebrow">TRUNG TÂM CỘNG ĐỒNG</span><h2>Sự kiện & kháng nghị</h2>'+
 '<p class="hint">Sự kiện có thời hạn, quyền tham gia theo từng tài khoản; quyết định kháng nghị yêu cầu PIN.</p></div>'+
 '<button type="button" class="btn ghost sm" data-cv7="refresh-admin">Làm mới</button></div>'+
 '<div class="v7-admin-grid"><article class="card v7-admin-card"><h3>📆 Tạo sự kiện</h3>'+
 '<div class="field"><label>Phòng cộng đồng</label><select class="select" id="v7-event-room">'+options+'</select></div>'+
 '<div class="field"><label>Tên sự kiện</label><input class="input" id="v7-event-title" maxlength="100" placeholder="Ví dụ: Giao lưu công nghệ tối thứ Bảy"></div>'+
 '<div class="field"><label>Giới thiệu</label><textarea class="input" id="v7-event-details" maxlength="600" rows="3" placeholder="Nội dung, cách tham gia..."></textarea></div>'+
 '<div class="v7-date-grid"><div class="field"><label>Bắt đầu</label><input class="input" type="datetime-local" id="v7-event-start"></div>'+
 '<div class="field"><label>Kết thúc</label><input class="input" type="datetime-local" id="v7-event-end"></div></div>'+
 '<button type="button" class="btn primary" data-cv7="create-event">Tạo sự kiện (PIN)</button></article>'+
 '<article class="card v7-admin-card"><h3>🗓️ Quản lý sự kiện</h3>'+
 (events.length?events.slice(0,12).map(e=>
 '<div class="v7-admin-item"><div><b>'+esc(e.title)+'</b><small>'+
 communityPlusDate(e.starts_at)+' · '+Number(e.attendees)+' người · '+
 (e.canceled?'Đã hủy':'Đang lên lịch')+'</small></div>'+
 (e.canceled?'':'<button type="button" class="btn ghost sm" data-cv7="cancel-event" data-cv7-id="'+Number(e.id)+'">Hủy</button>')+
 '</div>').join(''):'<p class="hint">Chưa có sự kiện.</p>')+'</article>'+
 '<article class="card v7-admin-card v7-appeal-panel"><h3>⚖️ Kháng nghị xử phạt</h3>'+
 (appeals.length?appeals.slice(0,30).map(a=>
 '<div class="v7-admin-item"><div><b>#'+Number(a.public_id||a.user_id)+' · '+esc(a.display_name||'Thành viên')+'</b>'+
 '<small>'+esc(a.kind==='world'?'Chat thế giới':'Tài khoản')+' · '+communityPlusDate(a.created_at)+' · '+esc(a.status)+'</small>'+
 '<p>'+esc(a.reason)+'</p>'+(a.review_note?'<small>Phản hồi: '+esc(a.review_note)+'</small>':'')+'</div>'+
 (a.status==='pending'?'<button type="button" class="btn ghost sm" data-cv7="appeal-decision" data-cv7-id="'+Number(a.id)+'">Xử lý</button>':'')+
 '</div>').join(''):'<p class="hint">Chưa có kháng nghị.</p>')+'</article></div></section>';
}
async function communityPlusRefresh(redraw=false,admin=false){
 if(!state.user)return;
 if(admin&&!state.user.is_admin||!admin&&state.user.is_admin)return;
 const uid=state.user.id;
 if(admin){
  const [e,a]=await Promise.all([api('/api/admin/community/events'),api('/api/admin/appeals')]);
  if(state.user?.id!==uid)return;
  communityPlusCache.adminEvents=e.events||[];
  communityPlusCache.adminAppeals=a.appeals||[];
  if(redraw&&state.adminTab==='world'){
   const root=document.getElementById('v7-community-admin');
   if(root)root.innerHTML=communityPlusAdminPanel();
  }
 }else{
  const room=Number(state.v6WorldRoom||1);
  const r=await api('/api/community/events?room_id='+room);
  if(state.user?.id!==uid||room!==Number(state.v6WorldRoom||1))return;
  communityPlusCache.room=room;communityPlusCache.events=r.events||[];communityPlusCache.at=Date.now();
  const root=document.getElementById('v7-community-events');
  if(redraw&&root)root.innerHTML=communityPlusEvents();
 }
}
function communityPlusMyAppeals(){
 return api('/api/me/appeals').then(r=>{
  const rows=r.appeals||[];
  const status={pending:'Đang chờ',accepted:'Đã chấp nhận',rejected:'Không chấp nhận'};
  modal({title:'Kháng nghị xử phạt',description:'Mỗi tài khoản chỉ có một kháng nghị đang chờ, tối đa 3 lần trong 30 ngày. Admin sẽ xem xét nội dung.',
   content:'<div class="v7-appeals">'+
    '<div class="field"><label for="v7-appeal-reason">Trình bày lý do (15–900 ký tự)</label>'+
    '<textarea class="input" id="v7-appeal-reason" rows="4" minlength="15" maxlength="900" placeholder="Mô tả cụ thể lý do đề nghị xem xét..."></textarea></div>'+
    (rows.length?rows.map(a=>'<div class="v7-appeal-entry"><b>'+esc(status[a.status]||a.status)+'</b> · '+
     communityPlusDate(a.created_at)+'<p>'+esc(a.reason)+'</p>'+
     (a.review_note?'<small>Admin phản hồi: '+esc(a.review_note)+'</small>':'')+'</div>').join(''):
     '<p class="hint">Bạn chưa gửi kháng nghị nào.</p>')+'</div>',
   confirm:'Gửi kháng nghị',handler:async host=>{
    const reason=host.querySelector('#v7-appeal-reason')?.value.trim()||'';
    if(reason.length<15)throw Error('Cần trình bày lý do ít nhất 15 ký tự.');
    await post('/api/me/appeals',{reason});
    toast('Đã gửi kháng nghị.','ok');
   }});
 });
}
function communityPlusProof(title,description,confirm,callback){
 modal({title,description,confirm,danger:confirm==='Hủy sự kiện',content:adminV3PinFields(),
  handler:async host=>{
   const proof=adminV3PinPayload(host);
   if(!proof.admin_pin)throw Error('Yêu cầu PIN Admin.');
   await callback(proof.admin_pin);
   toast('Đã cập nhật cộng đồng.','ok');
   await communityPlusRefresh(true,true);
  }});
}
function communityPlusParseTime(id){
 const raw=document.getElementById(id)?.value;
 if(!raw)throw Error('Vui lòng nhập thời gian.');
 const ms=new Date(raw).getTime();
 if(!Number.isFinite(ms))throw Error('Ngày giờ không hợp lệ.');
 return Math.floor(ms/1000);
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-cv7]');
 if(!button||button.disabled)return;
 try{
  const action=button.dataset.cv7,id=Number(button.dataset.cv7Id);
  if(action==='refresh')return await communityPlusRefresh(true,false);
  if(action==='refresh-admin')return await communityPlusRefresh(true,true);
  if(action==='my-appeals')return await communityPlusMyAppeals();
  if(action==='rsvp'){
   button.disabled=true;
   await post('/api/community/events/'+id+'/rsvp',{});
   await communityPlusRefresh(true,false);
   return;
  }
  if(action==='create-event'){
   const room_id=Number(document.getElementById('v7-event-room')?.value);
   const title=document.getElementById('v7-event-title')?.value.trim()||'';
   const details=document.getElementById('v7-event-details')?.value.trim()||'';
   const starts_at=communityPlusParseTime('v7-event-start'),
         ends_at=communityPlusParseTime('v7-event-end');
   if(!room_id||title.length<5||ends_at<=starts_at)throw Error('Hãy chọn phòng, tên và khoảng thời gian hợp lệ.');
   return communityPlusProof('Tạo sự kiện','Sự kiện hiển thị cho thành viên phòng đang mở.',
     'Tạo sự kiện',async admin_pin=>{
      await post('/api/admin/community/events',{room_id,title,details,starts_at,ends_at,admin_pin});
     });
  }
  if(action==='cancel-event'){
   return communityPlusProof('Hủy sự kiện','Người tham gia sẽ không còn thấy sự kiện trong lịch sắp tới.',
    'Hủy sự kiện',async admin_pin=>{
      await post('/api/admin/community/events/'+id+'/cancel',{canceled:true,admin_pin});
    });
  }
  if(action==='appeal-decision'){
   modal({title:'Xem xét kháng nghị',description:'Chọn chấp nhận để gỡ xử phạt tương ứng, hoặc từ chối và nêu lý do.',
    confirm:'Lưu quyết định bằng PIN',
    content:'<div class="field"><label>Quyết định</label><select id="v7-appeal-outcome" class="select">'+
      '<option value="rejected">Từ chối kháng nghị</option><option value="accepted">Chấp nhận và gỡ xử phạt</option></select></div>'+
      '<div class="field"><label>Phản hồi (ít nhất 10 ký tự)</label><textarea class="input" id="v7-appeal-note" rows="3" maxlength="500"></textarea></div>'+
      adminV3PinFields(),
    handler:async host=>{
      const outcome=host.querySelector('#v7-appeal-outcome').value,
            note=host.querySelector('#v7-appeal-note').value.trim(),
            admin_pin=adminV3PinPayload(host).admin_pin;
      if(note.length<10)throw Error('Vui lòng ghi rõ lý do tối thiểu 10 ký tự.');
      await post('/api/admin/appeals/'+id+'/decision',{outcome,note,admin_pin});
      toast('Đã giải quyết kháng nghị.','ok');await communityPlusRefresh(true,true);
    }});
  }
 }catch(err){toast(err.message||'Không thực hiện được thao tác.','error');}
 finally{if(button.isConnected)button.disabled=false;}
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden||!state.user)return;
 if(state.user.is_admin&&state.adminTab==='world')communityPlusRefresh(true,true).catch(()=>{});
 if(!state.user.is_admin&&state.tab==='world')communityPlusRefresh(true,false).catch(()=>{});
});
