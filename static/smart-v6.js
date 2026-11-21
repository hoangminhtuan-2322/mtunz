/* mtunz V6 smart conversations — private expiration, search and safer WebRTC controls. */
'use strict';
let v6FeatureFlags={};
async function v6RefreshFlags(){
 if(!state.user||state.user.is_admin)return;
 try{const r=await api('/api/features');v6FeatureFlags=r.features||{};}
 catch{/* Server-side flags always enforce permission even if UI is stale. */}
}
function v6Stamp(ts){
 return new Date(Number(ts)*1000).toLocaleString('vi-VN',{
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function v6DateEpoch(ymd,end=false){
 if(!ymd)return 0;
 const date=new Date(ymd+'T'+(end?'23:59:59':'00:00:00'));
 return Number.isFinite(date.getTime())?Math.floor(date.getTime()/1000):0;
}
async function v6SetDisappear(peerId){
 const friend=state.friends.find(f=>Number(f.other_id)===peerId);
 if(!friend||friend.state!=='accepted')throw Error('Hội thoại không còn khả dụng.');
 const current=await api('/api/chat/disappear/'+peerId);
 modal({title:'Tự biến mất tin nhắn riêng',
 description:'Chỉ áp dụng cho những tin mới do bạn gửi. Tin đã gửi trước đó không thay đổi. Các tin tự xóa có thể được người nhận sao chép trước khi hết hạn.',
 confirm:'Áp dụng thời hạn',
 content:'<div class="v6-setting-panel"><label for="v6-vanish-seconds">Thời hạn tính từ lúc máy chủ gửi thành công</label>'+
 '<select id="v6-vanish-seconds" class="select">'+
 [[0,'Tắt (lưu tin như bình thường)'],[3600,'1 giờ'],[86400,'1 ngày'],[604800,'7 ngày']].map(([v,t])=>
 '<option value="'+v+'" '+(Number(current.seconds)===v?'selected':'')+'>'+esc(t)+'</option>').join('')+
 '</select><p class="hint">Ảnh và tệp đính kèm của tin sẽ không còn truy cập qua hội thoại sau khi hết hạn. Không áp dụng cho tin hẹn giờ chưa gửi.</p></div>',
 handler:async host=>{
   const seconds=Number(host.querySelector('#v6-vanish-seconds')?.value);
   await api('/api/chat/disappear/'+peerId,{method:'PATCH',data:{seconds}});
   friend.vanish_seconds=seconds;
   updateChatHeader();
   toast(seconds?'Tin mới bạn gửi sẽ tự biến mất khi hết thời hạn.':'Đã tắt tự biến mất cho tin mới.','ok');
 }});
}
async function v6ShowAdvancedSearch(){
 const group=state.tab==='groups'&&state.groupSelected;
 const chat=group?state.groupSelected:state.selected,owner=state.user.id;
 const key=(group?'group-':'dm-')+chat;
 const current=()=>state.user?.id===owner&&document.querySelector('#chat-messages')?.dataset.chatKey===key;
 if(!chat)throw Error('Hãy mở một cuộc trò chuyện để tìm kiếm.');
 const content='<div class="v6-search-filters">'+
 '<div class="field"><label for="v6-query">Từ khóa (có thể bỏ trống để lọc theo thời gian)</label>'+
 '<input class="input" id="v6-query" maxlength="120" placeholder="Tên file, nội dung, từ khóa…"></div>'+
 '<div class="v6-search-row"><div class="field"><label for="v6-from">Từ ngày</label><input class="input" type="date" id="v6-from"></div>'+
 '<div class="field"><label for="v6-to">Đến ngày</label><input class="input" type="date" id="v6-to"></div></div>'+
 '<div class="v6-search-row"><div class="field"><label for="v6-search-author">Người gửi</label><select class="select" id="v6-search-author">'+
 '<option value="0">Tất cả</option><option value="me">Chỉ tôi</option>'+
 (!group?'<option value="other">Người bạn đang trò chuyện</option>':'')+'</select></div>'+
 '<div class="field"><label for="v6-search-media">Loại nội dung</label><select class="select" id="v6-search-media">'+
 '<option value="all">Tất cả</option><option value="files">Ảnh / tệp / tin thoại</option><option value="text">Chỉ tin văn bản</option>'+
 '</select></div></div><div id="v6-search-results" class="v6-search-results" role="status" aria-live="polite">'+
 '<p class="hint">Tìm trong lịch sử mà bạn vẫn có quyền truy cập. Tin đã biến mất không xuất hiện.</p></div></div>';
 modal({title:'Tìm tin nhắn',description:'Lọc theo thời gian, người gửi và loại tin; không tìm qua các cuộc trò chuyện khác.',
 content,confirm:'Tìm kiếm',handler:async host=>{
  const q=host.querySelector('#v6-query')?.value.trim()||'';
  const since=v6DateEpoch(host.querySelector('#v6-from').value);
  const until=v6DateEpoch(host.querySelector('#v6-to').value,true);
  if(since&&until&&since>until)throw Error('Ngày bắt đầu lớn hơn ngày kết thúc.');
  const author=host.querySelector('#v6-search-author').value;
  const fromUser=author==='me'?state.user.id:author==='other'?state.selected:0;
  const media=host.querySelector('#v6-search-media').value;
  const params=new URLSearchParams({
   scope:group?'group':'dm',chat_id:String(chat),q,since:String(since),until:String(until),
   from_user:String(fromUser),media,limit:'40'
  });
  const container=host.querySelector('#v6-search-results');
  const result=await api('/api/chat/search/v6?'+params.toString());
  if(container?.isConnected&&current()){
   container.innerHTML=result.results.length?
    result.results.map(item=>'<button type="button" class="v6-search-result" data-found-message="'+Number(item.id)+'"><span>'+
     v6Stamp(item.created_at)+(item.sender_id===owner?' · Bạn':' · Thành viên')+'</span>'+
     '<p>'+esc(item.body||item.attachment_name||'Tệp đính kèm')+'</p></button>').join(''):
     '<p class="hint">Không tìm thấy tin nhắn phù hợp.</p>';
  }
  return false;
 }});
 const query=document.querySelector('#v6-query');
 query?.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.isComposing){
   event.preventDefault();document.querySelector('#modal-confirm')?.click();
  }
 });
 query?.focus({preventScroll:true});
 document.querySelector('#v6-search-results')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-found-message]');
  if(!button||!current()||button.disabled)return;
  const id=Number(button.dataset.foundMessage);
  const thread=document.querySelector('#chat-messages');
  const row=document.getElementById('msg-'+(group?'group':'dm')+'-'+id);
  if(row&&thread.contains(row)){
   document.querySelector('#modal-root').replaceChildren();
   thread.dataset.followChatEnd='false';
   row.scrollIntoView({block:'center',behavior:'instant'});
   row.tabIndex=-1;row.focus({preventScroll:true});
   row.classList.add('search-target');
   setTimeout(()=>row.classList.remove('search-target'),1600);
   return;
  }
  button.disabled=true;
  try{
   const url=group?'/api/groups/'+chat+'/messages':'/api/messages/'+chat;
   const data=await api(url+'?before='+(id+1)+'&limit=1');
   if(!current()||!button.isConnected)return;
   const message=data.messages.find(item=>item.id===id&&!item.deleted_at);
   if(!message){toast('Tin nhắn này không còn khả dụng.','info');return;}
   modal({title:'Tin nhắn trong lịch sử',description:v6Stamp(message.created_at),
    content:'<div class="original-message">'+esc(message.body||message.attachment?.name||'Tệp đính kèm')+'</div>',
    confirm:'Đóng',cancel:null});
  }catch(error){if(button.isConnected)toast(error.message,'error');}
  finally{button.disabled=false;}
 });
}
async function v6MessageVersions(btn){
 const group=btn.dataset.v6Scope==='group',chat=group?state.groupSelected:state.selected;
 const id=Number(btn.dataset.v6Id);
 if(!chat||!id)return;
 const result=await api('/api/chat/message/'+(group?'group':'dm')+'/'+id+'/versions?chat_id='+chat);
 const entries=(result.versions||[]).map((r,i)=>
   '<article class="v6-history-row"><strong>Lần sửa '+(result.versions.length-i)+'</strong>'+
   '<span class="hint">'+v6Stamp(r.changed_at)+'</span><p>'+esc(r.previous_body||'(tin không có văn bản)')+'</p></article>').join('');
 modal({title:'Lịch sử sửa tin nhắn',
 description:'Chỉ người gửi có thể đọc các phiên bản của tin nhắn mình đã sửa. Lịch sử bị xóa khi thu hồi hoặc tin tự hết hạn.',
 content:'<div class="v6-history-list">'+
 '<article class="v6-history-row"><strong>Phiên bản hiện tại</strong><p>'+esc(result.current_body||'(không có văn bản)')+'</p></article>'+
 (entries||'<p class="hint">Chưa có lịch sử chỉnh sửa.</p>')+'</div>',confirm:'Đóng'});
}
async function v6CallControl(action){
 const call=state.call;
 if(!call||!call.pc||call.pc.connectionState==='closed')return;
 if(action==='mic'){
  const tracks=call.local.getAudioTracks();
  for(const t of tracks)t.enabled=!t.enabled;
  const off=tracks.length>0&&tracks.every(t=>!t.enabled);
  const el=document.querySelector('[data-v6-call="mic"]');
  if(el){el.textContent=off?'🔇 Bật micro':'🎤 Tắt micro';el.setAttribute('aria-pressed',String(off));}
  return;
 }
 if(action==='camera'){
  if(!call.video)return;
  const tracks=call.local.getVideoTracks();
  for(const t of tracks)t.enabled=!t.enabled;
  const off=tracks.length>0&&tracks.every(t=>!t.enabled);
  const el=document.querySelector('[data-v6-call="camera"]');
  if(el){el.textContent=off?'📷 Bật camera':'📷 Tắt camera';el.setAttribute('aria-pressed',String(off));}
  return;
 }
 if(action==='screen'){
  if(!call.video)throw Error('Chia sẻ màn hình chỉ hỗ trợ khi đang gọi video.');
  if(call.screenStream){
   call.screenStream.getTracks().forEach(t=>t.stop());
   return;
  }
  if(!navigator.mediaDevices?.getDisplayMedia)
   throw Error('Trình duyệt này chưa hỗ trợ chia sẻ màn hình qua HTTPS.');
  const sender=call.pc.getSenders().find(x=>x.track?.kind==='video');
  if(!sender)throw Error('Cuộc gọi không có kênh truyền video.');
  const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
  if(state.call!==call){stream.getTracks().forEach(t=>t.stop());return;}
  const screen=stream.getVideoTracks()[0],original=sender.track;
  try{await sender.replaceTrack(screen);}
  catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  call.screenStream=stream;
  const local=document.getElementById('local-video');
  if(local)local.srcObject=stream;
  const btn=document.querySelector('[data-v6-call="screen"]');
  if(btn)btn.textContent='⏹ Ngừng chia sẻ';
  screen.onended=async()=>{
   if(state.call!==call)return;
   try{await sender.replaceTrack(original);}catch{/* Call may be closing. */}
   stream.getTracks().forEach(t=>t.stop());call.screenStream=null;
   const own=document.getElementById('local-video');if(own)own.srcObject=call.local;
   const toggle=document.querySelector('[data-v6-call="screen"]');
   if(toggle)toggle.textContent='🖥️ Chia sẻ';
  };
 }
}
document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-v6-act],[data-v6-call]');
 if(!target)return;
 try{
  if(target.dataset.v6Call)return await v6CallControl(target.dataset.v6Call);
  if(target.dataset.v6Act==='disappear')return await v6SetDisappear(Number(target.dataset.v6Peer));
  if(target.dataset.v6Act==='message-versions')return await v6MessageVersions(target);
 }catch(err){toast(err.message||'Không thể thực hiện thao tác.','error');}
});
setInterval(()=>{
 if(!state.user||state.user.is_admin||state.tab!=='messages'||!state.selected)return;
 const at=Math.floor(Date.now()/1000);
 const old=state.messages||[];
 if(old.some(m=>m.expires_at&&Number(m.expires_at)<=at)){
  state.messages=old.filter(m=>!m.expires_at||Number(m.expires_at)>at);
  renderMessageThread(false);
 }
},3000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&state.user&&!state.user.is_admin)v6RefreshFlags().catch(()=>{});
});
