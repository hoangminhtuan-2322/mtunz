'use strict';

const profileAudiences={everyone:'Thành viên mtunz',friends:'Chỉ bạn bè',only_me:'Chỉ mình tôi'};

function profileCard(person,{own=false,details=true,preview=false}={}){
 const name=person.display_name||'Thành viên';
 let website=null;
 if(details&&person.website){
  try{
   const url=new URL(person.website);
   if(url.protocol==='https:'&&!url.username&&!url.password)website=url;
  }catch{}
 }
 return `<article class="member-profile-card">
   <div class="member-profile-banner">${details&&person.cover_url?`<img src="${esc(person.cover_url)}" alt="Ảnh bìa">`:''}</div>
   <div class="member-profile-identity">
    ${avatar(name,false,'xl',details?person.avatar_url:null)}
    <div class="member-profile-name"><h2>${esc(name)}</h2>
    <p class="hint">#${Number(person.public_id||person.id)} · Thành viên từ ${date(person.created_at)}</p></div>
    ${own?`<button type="button" class="btn ghost sm" data-act="copy-member-id">${icon('check',15)} Sao chép ID</button>
    <button type="button" class="btn primary sm" data-profile-preview>${icon('eye',15)} Xem như người khác</button>`:''}
   </div>
   ${details?`<div class="member-profile-about">
    ${person.headline?`<strong>${esc(person.headline)}</strong>`:''}
    ${person.bio?`<p>${esc(person.bio)}</p>`:'<p class="muted">Chưa có phần giới thiệu.</p>'}
    ${website?`<a href="${esc(website.href)}" target="_blank" rel="noopener noreferrer">${esc(website.hostname)} ↗</a>`:''}
   </div>`:'<p class="member-profile-private">Chi tiết hồ sơ đang được giới hạn theo quyền riêng tư.</p>'}
   ${own?`<p class="member-profile-private">${icon('shield',15)} Ai có thể xem hồ sơ · ${profileAudiences[person.profile_visibility]||profileAudiences.everyone}</p>`:''}
   ${!own&&!preview?`<div class="member-profile-actions">
     ${state.friends.some(f=>f.other_id===person.id&&f.state==='accepted')?`<button type="button" class="btn primary sm" data-profile-chat="${Number(person.id)}">${icon('chat',15)} Nhắn tin</button>`:''}
     <button type="button" class="btn ghost sm" data-world-report-user="${Number(person.id)}">${icon('shield',15)} Báo cáo</button>
   </div>`:''}
 </article>`;
}

function memberProfilePage(){
 return `<div class="section-wrap profile-page member-profile-page">
  <h1 class="section-title">Hồ sơ cá nhân</h1>
  <div id="member-profile-summary">${profileCard(state.user,{own:true})}</div>
  <nav class="member-profile-nav" aria-label="Mục hồ sơ">
   <button type="button" data-profile-section="info">Thông tin</button>
   <button type="button" data-profile-section="privacy">Ảnh & quyền riêng tư</button>
   <button type="button" data-profile-section="contact">Liên hệ</button>
  </nav>
  <div class="member-profile-editor">
   <section id="member-profile-info">${profileSettings()}</section>
   <section id="member-profile-privacy">${socialSettingsPanel()}</section>
   <section id="member-profile-contact">${profileContactSettings()}</section>
  </div>
 </div>`;
}

function updateMemberProfileSummary(){
 const summary=$('#member-profile-summary');
 if(summary)summary.innerHTML=profileCard(state.user,{own:true});
}

function showMemberProfile(person){
 modal({title:'Hồ sơ thành viên',confirm:'Đóng',cancel:null,content:profileCard(person,{details:!person.private})});
}

function previewMemberProfile(){
 modal({title:'Xem trước hồ sơ',description:'Chọn người xem để kiểm tra thông tin họ có thể thấy.',confirm:'Đóng',cancel:null,
  content:`<div class="field"><label for="member-profile-audience">Xem với tư cách</label>
  <select class="select" id="member-profile-audience"><option value="friends">Bạn bè</option>
   <option value="everyone">Thành viên chưa kết bạn</option></select></div><div id="member-profile-preview"></div>`});
 const audience=$('#member-profile-audience'),panel=$('#member-profile-preview');
 const draw=()=>{
  const visibility=state.user.profile_visibility||'everyone';
  panel.innerHTML=profileCard(state.user,{preview:true,details:visibility==='everyone'||visibility==='friends'&&audience.value==='friends'});
 };
 audience.addEventListener('change',draw);
 draw();
}

document.addEventListener('click',event=>{
 if(!state.user||state.user.is_admin)return;
 const section=event.target.closest('[data-profile-section]');
 if(section){document.getElementById('member-profile-'+section.dataset.profileSection)?.scrollIntoView({block:'start'});return;}
 const preview=event.target.closest('[data-profile-preview]');
 if(preview){previewMemberProfile();return;}
 const chat=event.target.closest('[data-profile-chat]');
 if(chat){
  $('#modal-root').replaceChildren();
  if(state.tab!=='messages'||state.selected!==Number(chat.dataset.profileChat))void openChat(Number(chat.dataset.profileChat));
 }
});
