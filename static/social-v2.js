/* mtunz Social V2 — privacy controls, photo profiles and consensual message requests. */
'use strict';
state.messageRequests=[];
function socialSettingsPanel(){
 const u=state.user||{};
 return `<section class="card social-settings-card" aria-label="Tùy chỉnh hồ sơ nâng cao">
  <div class="social-section-heading"><h3>${icon('users',17)} Hồ sơ nâng cao</h3><span class="pill">Bạn kiểm soát thông tin</span></div>
  <p class="hint">Ảnh và thông tin này chỉ hiển thị với những người được bạn cho phép. Ảnh được lưu trên hệ thống, không tải từ trang bên ngoài.</p>
  <div class="social-photo-actions">
    <label class="social-photo-action">📷 Ảnh đại diện <input type="file" data-social-upload="avatar" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>
    <label class="social-photo-action">🖼️ Ảnh bìa <input type="file" data-social-upload="cover" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>
    ${u.avatar_url?'<button class="btn ghost sm" type="button" data-social-clear="avatar">Gỡ ảnh đại diện</button>':''}
    ${u.cover_url?'<button class="btn ghost sm" type="button" data-social-clear="cover">Gỡ ảnh bìa</button>':''}
  </div>
  <form data-social-form="profile" class="social-profile-form">
   <div class="field"><label for="social-headline">Dòng giới thiệu ngắn</label>
    <input class="input" id="social-headline" name="headline" maxlength="90" value="${esc(u.headline||'')}" placeholder="Ví dụ: Thích công nghệ, âm nhạc và những kết nối mới"></div>
   <div class="field"><label for="social-website">Trang web (nếu có)</label>
    <input class="input" id="social-website" name="website" type="url" maxlength="180" value="${esc(u.website||'')}" placeholder="https://..." inputmode="url"></div>
   <label class="social-toggle social-private-control"><input type="checkbox" id="social-private-switch" ${u.profile_visibility!=='everyone'?'checked':''}>
     <span><strong>🔒 Tài khoản riêng tư</strong><small>Khi bật, người chưa kết bạn không thể xem ảnh, giới thiệu hoặc liên kết hồ sơ. Họ vẫn có thể tìm bằng tên/ID để gửi lời mời kết bạn.</small></span></label>
   <div class="field"><label for="social-visibility">Ai được xem nội dung hồ sơ?</label>
    <select class="select" id="social-visibility" name="profile_visibility">
     <option value="everyone" ${u.profile_visibility==='everyone'?'selected':''}>Thành viên mtunz</option>
     <option value="friends" ${u.profile_visibility==='friends'?'selected':''}>Chỉ bạn bè</option>
     <option value="only_me" ${u.profile_visibility==='only_me'?'selected':''}>Chỉ mình tôi</option>
    </select><small class="hint">Riêng tư = chỉ bạn bè. Chế độ “Chỉ mình tôi” ẩn cả với bạn bè. Tin gửi trong Chat thế giới vẫn công khai nếu không bật ẩn danh.</small></div>
   <label class="social-toggle"><input type="checkbox" name="allow_message_requests" ${u.allow_message_requests?'checked':''}>
     <span><strong>Nhận tin nhắn chờ</strong><small>Người chưa kết bạn có thể gửi một lời nhắn. Chỉ khi bạn chấp nhận mới mở hội thoại.</small></span></label>
   <label class="social-toggle"><input type="checkbox" name="world_anonymous" ${u.world_anonymous?'checked':''}>
     <span><strong>Ẩn danh khi gửi tin trong Chat thế giới</strong><small>Ẩn tên, ID và ảnh công khai cho các tin gửi mới. Quản trị viên vẫn có thể xác minh để xử lý vi phạm.</small></span></label>
   <button class="btn primary" type="submit">Lưu quyền riêng tư & hồ sơ</button>
  </form>
 </section>`;
}
function messageRequestsPanel(){
 const req=state.messageRequests||[];
 const enabled=!!state.user?.allow_message_requests;
 return `<section class="card social-requests" aria-label="Tin nhắn chờ">
   <div class="social-section-heading"><h3>${icon('inbox',18)} Tin nhắn chờ <span class="pill">${req.length}</span></h3>
   <button class="btn ghost sm" type="button" data-act="app-tab" data-tab="profile">Cài đặt quyền nhận</button></div>
   <p class="hint">${enabled?'Người lạ chỉ gửi được một lời nhắn; chỉ bạn quyết định có kết bạn và trò chuyện hay không.':'Bạn đã tắt nhận tin nhắn chờ. Người chưa kết bạn không thể gửi lời nhắn.'}</p>
   ${enabled?(req.length?req.map(m=>`<article class="social-request">
    ${avatar(m.display_name||'Thành viên',false,'sm',m.avatar_url)}
    <div class="social-request-copy"><b>${esc(m.display_name||'Thành viên')}</b><span class="hint">ID #${Number(m.public_id)} · ${date(m.created_at)}</span>
    <p>${esc(m.intro)}</p><div class="social-request-actions"><button class="btn primary sm" data-social-decision="${Number(m.id)}" data-social-accept="1">Chấp nhận & kết bạn</button>
    <button class="btn ghost sm" data-social-decision="${Number(m.id)}" data-social-accept="0">Từ chối</button></div></div>
   </article>`).join(''):'<div class="hint">Không có tin nhắn nào đang chờ.</div>'):'<div class="hint">Bạn có thể bật lại trong Hồ sơ cá nhân.</div>'}
  </section>`;
}
async function loadMessageRequests(redraw=false){
 if(!state.user||state.user.is_admin)return;
 const account=state.user.id;
 const r=await api('/api/message-requests');
 if(state.user?.id!==account)return;
 state.messageRequests=r.requests||[];
 if(redraw&&state.tab==='friends')renderApp();
}
async function uploadSocialImage(file,kind){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Chỉ hỗ trợ JPG, PNG, WebP hoặc GIF.');
 let chosen=file;
 if(file.size>1_750_000){
  if(!('createImageBitmap' in window))throw Error('Ảnh vượt 1,7 MB. Vui lòng chọn ảnh nhỏ hơn.');
  const bitmap=await createImageBitmap(file);
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.floor(bitmap.width*scale));
  canvas.height=Math.max(1,Math.floor(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.78));
  if(!blob)throw Error('Không thể tối ưu ảnh. Vui lòng thử ảnh khác.');
  chosen=new File([blob],kind+'.webp',{type:'image/webp'});
 }
 if(chosen.size>1_750_000)throw Error('Ảnh vẫn quá lớn. Vui lòng sử dụng ảnh tối đa 1,7 MB.');
 const fd=new FormData();fd.append('file',chosen,chosen.name);
 const response=await fetch('/api/uploads',{method:'POST',body:fd,credentials:'same-origin'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Không tải được ảnh.');
 const field=kind==='avatar'?'avatar_attachment_id':'cover_attachment_id';
 await api('/api/me/social',{method:'PATCH',data:{[field]:result.attachment.id}});
 state.user=(await api('/api/me')).user;
 renderApp();
 toast('Đã cập nhật '+(kind==='avatar'?'ảnh đại diện':'ảnh bìa')+'.','ok');
}
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-social-form="profile"]');
 if(!form)return;
 event.preventDefault();
 const btn=form.querySelector('button[type="submit"]');
 if(btn?.disabled)return;
 if(btn)btn.disabled=true;
 try{
  const fd=new FormData(form);
  await api('/api/me/social',{method:'PATCH',data:{
   headline:String(fd.get('headline')||'').trim(),website:String(fd.get('website')||'').trim(),
   profile_visibility:String(fd.get('profile_visibility')||'everyone'),
   allow_message_requests:fd.has('allow_message_requests'),
   world_anonymous:fd.has('world_anonymous')
  }});
  state.user=(await api('/api/me')).user;
  await loadMessageRequests(false);
  renderApp();toast('Đã lưu hồ sơ và quyền riêng tư.','ok');
 }catch(err){toast(err.message||'Không lưu được cài đặt.','error');}
 finally{if(btn?.isConnected)btn.disabled=false;}
});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.matches('input[data-social-world-anon]')){
  el.disabled=true;
  try{
   await api('/api/me/social',{method:'PATCH',data:{world_anonymous:el.checked}});
   state.user.world_anonymous=el.checked;
   toast(el.checked?'Tin nhắn thế giới mới sẽ hiển thị ẩn danh.':'Tin nhắn mới sẽ hiển thị tên của bạn.','ok');
  }catch(err){el.checked=!el.checked;toast(err.message||'Không thể cập nhật.','error');}
  finally{el.disabled=false;}
 }
 if(el.matches('input[data-social-upload]')){
  const kind=el.dataset.socialUpload;
  el.disabled=true;
  try{await uploadSocialImage(el.files?.[0],kind);}
  catch(err){toast(err.message||'Không thể cập nhật ảnh.','error');}
  finally{if(el.isConnected){el.disabled=false;el.value='';}}
 }
});
document.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-social-request],[data-social-decision],[data-social-clear]');
 if(!btn||btn.disabled)return;
 if(btn.hasAttribute('data-social-request')){
  const id=Number(btn.dataset.socialRequest),name=btn.dataset.socialName||'thành viên';
  modal({title:'Gửi tin nhắn chờ',description:'Bạn chỉ được gửi một lời nhắn ngắn cho '+name+'. Họ có thể từ chối hoặc tắt nhận tin. Hội thoại riêng chỉ mở khi họ chấp nhận kết bạn.',
   content:'<div class="field"><label for="social-request-intro">Lời nhắn giới thiệu</label><textarea class="input" id="social-request-intro" rows="4" maxlength="500" placeholder="Chào bạn, mình muốn làm quen..."></textarea></div>',
   confirm:'Gửi tin nhắn chờ',
   handler:async host=>{
    const intro=host.querySelector('#social-request-intro')?.value.trim();
    if(!intro)throw Error('Vui lòng nhập lời nhắn.');
    await post('/api/message-requests',{recipient_id:id,intro});
    toast('Đã gửi tin nhắn chờ.','ok');
   }});
  return;
 }
 if(btn.hasAttribute('data-social-clear')){
  const kind=btn.dataset.socialClear;
  btn.disabled=true;
  try{
   await api('/api/me/social',{method:'PATCH',data:{[kind==='avatar'?'avatar_attachment_id':'cover_attachment_id']:0}});
   state.user=(await api('/api/me')).user;renderApp();
   toast('Đã gỡ ảnh.','ok');
  }catch(err){toast(err.message||'Không gỡ được ảnh.','error');btn.disabled=false;}
  return;
 }
 if(btn.hasAttribute('data-social-decision')){
  const id=Number(btn.dataset.socialDecision),accept=btn.dataset.socialAccept==='1';
  btn.disabled=true;
  try{
   await post('/api/message-requests/'+id+'/decision',{accept});
   await Promise.all([refreshFriends(false),loadMessageRequests(false)]);
   renderApp();
   toast(accept?'Đã chấp nhận: hội thoại riêng đã được mở.':'Đã từ chối tin nhắn chờ.','ok');
  }catch(err){btn.disabled=false;toast(err.message||'Không thể xử lý tin nhắn chờ.','error');}
 }
});
