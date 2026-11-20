/* mtunz V6 community — topic rooms, one-vote polls, pinned notice and slow mode. */
'use strict';
if(typeof state!=='undefined'){
 state.v6WorldRoom=1;
 state.v6Rooms=[];
 state.v6Polls=[];
 state.adminV6Rooms=[];
 state.adminV6Polls=[];
}
let v6RoomsCacheAt=0,v6PollCacheAt=0;
function v6CurrentRoom(){return Number(state.v6WorldRoom||1);}
async function v6RefreshCommunity(redraw=false,force=false){
 if(!state.user||state.user.is_admin)return;
 const current=v6CurrentRoom(),user=state.user.id;
 const at=Date.now();
 const tasks=[];
 if(force||!state.v6Rooms?.length||at-v6RoomsCacheAt>60000)
  tasks.push(api('/api/world/rooms').then(r=>{
    if(state.user?.id!==user)return;
    state.v6Rooms=r.rooms||[];v6RoomsCacheAt=Date.now();
  }));
 if(force||at-v6PollCacheAt>14000)
  tasks.push(api('/api/world/polls?room_id='+current).then(r=>{
   if(state.user?.id!==user||current!==v6CurrentRoom())return;
   state.v6Polls=r.polls||[];v6PollCacheAt=Date.now();
  }));
 if(tasks.length)await Promise.all(tasks);
 if(redraw&&state.tab==='world'){
  const rooms=document.querySelector('.v6-community-rooms');
  if(rooms)rooms.innerHTML=v6WorldRoomsBar();
  const polls=document.getElementById('v6-polls-root');
  if(polls)polls.innerHTML=v6PollCards();
 }
}
function v6WorldRoomsBar(){
 const items=state.v6Rooms||[];
 return '<nav class="v6-room-list" aria-label="Chọn phòng Chat thế giới">'+
 (items.length?items.map(room=>{
  const selected=Number(room.id)===v6CurrentRoom();
  return '<button type="button" class="v6-room-pill '+(selected?'selected ':'')+(!room.active?'inactive':'')+
   '" data-v6-room="'+Number(room.id)+'" aria-current="'+(selected?'page':'false')+'">'+
   esc(room.title)+(!room.active?' · Lịch sử':'')+'</button>';
 }).join(''):'<span class="hint">Đang tải danh sách phòng...</span>')+
 '</nav>';
}
function v6PollCards(){
 const polls=(state.v6Polls||[]).slice(0,4);
 if(!polls.length)return '';
 const writable=!!state.worldData?.status?.can_send;
 return '<section class="v6-poll-section" aria-label="Bình chọn cộng đồng"><div class="v6-poll-heading">'+
 '<strong>📊 Bình chọn cộng đồng</strong><span class="hint">Một người một phiếu · Kết quả theo thời gian thực</span></div>'+
 polls.map(poll=>{
  const closed=!!poll.closed||!writable,chosen=poll.own_vote!=null,total=Math.max(0,poll.total_votes||0);
  return '<article class="v6-poll-card" data-v6-poll-id="'+Number(poll.id)+'">'+
   '<div class="v6-poll-top"><span class="v6-poll-state '+(closed?'closed':'')+'">'+
   (poll.closed?'Đã kết thúc':!writable?'Tạm dừng':'Đang diễn ra')+'</span>'+
   '<small>Đến '+new Date(Number(poll.closes_at)*1000).toLocaleString('vi-VN')+'</small></div>'+
   '<h3>'+esc(poll.question)+'</h3><div class="v6-poll-options">'+
   (poll.options||[]).map(option=>{
    const percent=total?Math.round(Number(option.votes||0)/total*100):0;
    return '<button type="button" class="v6-poll-option '+(chosen&&option.id===poll.own_vote?'mine':'')+
     '" data-v6-vote="'+Number(poll.id)+'" data-v6-option="'+Number(option.id)+'"'+
     (closed||chosen?' disabled':'')+'>'+
     '<span class="v6-poll-bar" style="width:'+percent+'%"></span>'+
     '<span class="v6-poll-title">'+esc(option.text)+'</span><strong>'+percent+'%</strong></button>';
   }).join('')+'</div>'+
   '<div class="v6-poll-caption">'+total+' phiếu'+
    (chosen?' · Bạn đã bình chọn':closed?' · Phòng hoặc bình chọn đang đóng':' · Chạm một lựa chọn để bỏ phiếu')+
   '</div></article>';
 }).join('')+'</section>';
}
function v6AdminCommunityPanel(){
 const d=state.adminData||{},cfg=d.config||{},rooms=state.adminV6Rooms||[],polls=state.adminV6Polls||[];
 const options=rooms.filter(r=>r.active).map(r=>'<option value="'+Number(r.id)+'">'+esc(r.title)+'</option>').join('');
 const list=rooms.map(room=>'<div class="v6-admin-room"><div><strong>'+esc(room.title)+'</strong>'+
  '<small>#'+Number(room.id)+' · '+esc(room.slug)+' · '+(room.active?'Đang mở':'Đóng')+'</small></div>'+
  (room.slug==='general'?'<span class="hint">Phòng mặc định</span>':
   '<button type="button" class="btn ghost sm" data-v6-admin="room-toggle" data-v6-room="'+Number(room.id)+
   '" data-v6-active="'+(room.active?'0':'1')+'">'+(room.active?'Đóng phòng':'Mở phòng')+'</button>')+'</div>').join('');
 return '<section class="v6-world-ops"><header><span class="eyebrow">COMMUNITY OPERATIONS V6</span>'+
  '<h2>Phòng chủ đề, bình chọn và nội quy</h2>'+
  '<p class="hint">Chỉ Admin được tạo và mở phòng. Thành viên vẫn có thể xem lại lịch sử khi phòng đóng.</p></header>'+
  '<div class="v6-community-admin-grid"><article class="card v6-control-card">'+
   '<h3>🔔 Thông báo ghim và tốc độ chat</h3>'+
   '<div class="field"><label for="v6-admin-notice">Thông báo ghim trên đầu phòng</label>'+
   '<textarea class="textarea" id="v6-admin-notice" maxlength="400" rows="3" placeholder="Nội quy hoặc sự kiện quan trọng...">'+
   esc(cfg.announcement||'')+'</textarea></div>'+
   '<div class="field"><label for="v6-admin-slow">Chế độ chat chậm</label>'+
   '<select class="select" id="v6-admin-slow">'+
    [[0,'Tắt'],[5,'5 giây/tin'],[10,'10 giây/tin'],[30,'30 giây/tin'],[60,'60 giây/tin']].map(([v,label])=>
    '<option value="'+v+'" '+(Number(cfg.slow_seconds||0)===v?'selected':'')+'>'+label+'</option>').join('')+
   '</select></div><button class="btn primary" type="button" data-v6-admin="world-controls">Lưu cài đặt bằng PIN</button></article>'+
  '<article class="card v6-control-card"><h3>🗂️ Quản lý phòng chủ đề</h3>'+
   '<div class="v6-admin-room-list">'+(list||'<span class="hint">Chưa có phòng.</span>')+'</div>'+
   '<div class="v6-admin-new-room"><input class="input" id="v6-room-title" maxlength="40" placeholder="Tên phòng (ví dụ: Lập trình)">'+
    '<input class="input" id="v6-room-slug" maxlength="24" placeholder="Mã ngắn (ví dụ: laptrinh)">'+
    '<button class="btn ghost" type="button" data-v6-admin="room-create">Thêm phòng mới (mặc định đóng)</button></div></article>'+
  '<article class="card v6-control-card"><h3>📊 Tạo bình chọn cộng đồng</h3>'+
   '<div class="field"><label for="v6-poll-room">Phòng mở</label><select class="select" id="v6-poll-room">'+options+'</select></div>'+
   '<div class="field"><label for="v6-poll-question">Câu hỏi</label><input class="input" id="v6-poll-question" maxlength="180" placeholder="Bạn muốn tổ chức sự kiện gì?"></div>'+
   '<div class="field"><label for="v6-poll-choices">Lựa chọn (mỗi dòng một lựa chọn, từ 2 đến 6)</label>'+
   '<textarea class="textarea" id="v6-poll-choices" rows="4" placeholder="Sự kiện A\nSự kiện B"></textarea></div>'+
   '<div class="field"><label for="v6-poll-duration">Thời hạn bình chọn</label>'+
   '<select class="select" id="v6-poll-duration"><option value="60">1 giờ</option>'+
   '<option value="1440" selected>1 ngày</option><option value="10080">7 ngày</option></select></div>'+
   '<button class="btn primary" type="button" data-v6-admin="poll-create">Tạo bình chọn bằng PIN</button></article>'+
  '<article class="card v6-control-card"><h3>📈 Quản lý bình chọn gần đây</h3>'+
   '<div class="v6-admin-polls">'+(polls.length?polls.slice(0,10).map(p=>
    '<div class="v6-admin-poll-row"><div><strong>'+esc(p.question)+'</strong><small>'+
     Number(p.total_votes)+' phiếu · '+(p.closed?'Đã đóng':'Đang mở')+'</small></div>'+
     (p.closed?'':'<button type="button" class="btn ghost sm" data-v6-admin="poll-close" data-v6-poll="'+Number(p.id)+'">Kết thúc</button>')+
     '</div>').join(''):'<p class="hint">Chưa có bình chọn nào.</p>')+'</div></article>'+
 '</div></section>';
}
function v6WorldPinProof(title,description,confirm,callback){
 modal({title,description,confirm,content:adminV3PinFields(),handler:async host=>{
  const proof=adminV3PinPayload(host);
  if(!proof.admin_pin)throw Error('Yêu cầu PIN Admin.');
  await callback(proof.admin_pin);
  toast('Đã cập nhật cộng đồng.','ok');
  await loadAdmin();
 }});
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-v6-room],[data-v6-vote],[data-v6-admin]');
 if(!button||button.disabled)return;
 try{
  if(button.hasAttribute('data-v6-room')&&!button.hasAttribute('data-v6-admin')){
   const next=Number(button.dataset.v6Room);
   if(!Number.isSafeInteger(next)||next<=0||next===v6CurrentRoom())return;
   state.v6WorldRoom=next;state.v6Polls=[];v6PollCacheAt=0;
   state.worldData=null;
   if(typeof worldOlderExhausted!=='undefined')worldOlderExhausted=false;
   await loadWorld(true);return;
  }
  if(button.hasAttribute('data-v6-vote')){
   const pollId=Number(button.dataset.v6Vote),option_id=Number(button.dataset.v6Option);
   button.disabled=true;
   await post('/api/world/polls/'+pollId+'/vote',{option_id});
   await v6RefreshCommunity(true,true);
   toast('Phiếu bình chọn đã được ghi nhận.','ok');
   return;
  }
  const action=button.dataset.v6Admin;
  if(!action)return;
  if(action==='world-controls'){
   const announcement=document.getElementById('v6-admin-notice')?.value.trim()||'';
   const slow_seconds=Number(document.getElementById('v6-admin-slow')?.value||0);
   v6WorldPinProof('Cập nhật nội quy cộng đồng','Thông báo và giới hạn thời gian được áp dụng ngay khi xác nhận.',
    'Áp dụng',async admin_pin=>{
     await post('/api/admin/world/controls',{announcement,slow_seconds,admin_pin});
   });return;
  }
  if(action==='room-toggle'){
   const room=Number(button.dataset.v6Room),active=button.dataset.v6Active==='1';
   v6WorldPinProof(active?'Mở phòng chủ đề':'Tạm đóng phòng',
    'Khi phòng đóng, người dùng vẫn xem lại lịch sử nhưng không gửi được tin mới.',
    active?'Mở phòng':'Đóng phòng',async admin_pin=>{
     await api('/api/admin/world/rooms/'+room,{method:'PATCH',data:{active,admin_pin}});
   });return;
  }
  if(action==='room-create'){
   const title=document.getElementById('v6-room-title')?.value.trim()||'';
   const slug=document.getElementById('v6-room-slug')?.value.trim().toLowerCase()||'';
   if(title.length<3||!/^[a-z][a-z0-9_-]{2,23}$/.test(slug))
    throw Error('Tên phòng từ 3 ký tự, mã chỉ dùng chữ thường, số, gạch nối hoặc gạch dưới.');
   v6WorldPinProof('Tạo phòng chủ đề mới','Phòng mới mặc định đóng; chỉ Admin có thể mở sau.',
    'Tạo phòng',async admin_pin=>{
     await post('/api/admin/world/rooms',{title,slug,active:false,admin_pin});
   });return;
  }
  if(action==='poll-create'){
   const room_id=Number(document.getElementById('v6-poll-room')?.value||0);
   const question=document.getElementById('v6-poll-question')?.value.trim()||'';
   const options=(document.getElementById('v6-poll-choices')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean);
   const duration_minutes=Number(document.getElementById('v6-poll-duration')?.value||1440);
   if(!room_id||question.length<5||options.length<2||options.length>6||new Set(options.map(x=>x.toLowerCase())).size!==options.length)
    throw Error('Cần một phòng đang mở, câu hỏi từ 5 ký tự và 2–6 lựa chọn khác nhau.');
   v6WorldPinProof('Tạo bình chọn cộng đồng','Mỗi tài khoản được một phiếu. Admin có thể kết thúc sớm.',
    'Tạo bình chọn',async admin_pin=>{
     await post('/api/admin/world/polls',{room_id,question,options,duration_minutes,admin_pin});
   });return;
  }
  if(action==='poll-close'){
   const id=Number(button.dataset.v6Poll);
   v6WorldPinProof('Kết thúc bình chọn','Thành viên vẫn xem được kết quả nhưng không thể bỏ phiếu nữa.',
    'Kết thúc',async admin_pin=>{
     await post('/api/admin/world/polls/'+id+'/close',{active:false,admin_pin});
   });
  }
 }catch(err){toast(err.message||'Không thực hiện được thao tác cộng đồng.','error');}
});
