'use strict';

Ipaths.link='<path d="M10 13a4 4 0 0 0 6 0l4-4a4 4 0 1 0-6-6l-2 2M14 11a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2"/>';
Ipaths.download='<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>';
const chatLibraryKinds={media:'Ảnh & video',files:'Tệp',links:'Liên kết'};

function chatLibraryItem(item,kind){
 const stamp=`${esc(item.display_name||'Thành viên')} · ${date(item.created_at)}`;
 if(kind==='links')return item.links.map(link=>`
  <a class="chat-library-row" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">
   <span class="chat-library-icon">${icon('link',19)}</span><span><strong>${esc(link.host)}</strong>
   <span class="chat-library-url">${esc(link.url)}</span><small>${stamp}</small></span></a>`).join('');
 const url='/api/attachments/'+Number(item.attachment_id);
 if(kind==='media'){
  const video=item.mime.startsWith('video/'),label=video?'Tải video':'Tải ảnh';
  return `<article class="chat-library-media">
   ${video?`<video src="${url}" controls playsinline preload="none" aria-label="${esc(item.name)}"></video>`:
    `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${esc(item.name)}" loading="lazy" decoding="async"></a>`}
   <small>${stamp}</small>
   <a class="chat-library-save" href="${url}?download=1" download="${esc(item.name)}" aria-label="${label} ${esc(item.name)}">${icon('download',15)} ${label}</a>
  </article>`;
 }
 return `<a class="chat-library-row" href="${url}?download=1" download="${esc(item.name)}">
  <span class="chat-library-icon">${icon('file',19)}</span><span><strong>${esc(item.name)}</strong>
  <small>${fmtSize(item.size)} · ${stamp}</small></span></a>`;
}

function openChatLibrary(){
 const group=state.tab==='groups',id=group?state.groupSelected:state.selected;
 if(!id||!state.user)return;
 const owner=state.user.id,scope=group?'group':'dm';
 const friend=group?null:state.friends.find(f=>f.other_id===id&&f.state==='accepted');
 const title=friend?chatContactName(friend):state.groups.find(g=>g.id===id)?.title;
 modal({title:'Nội dung đã chia sẻ',description:title||'Cuộc trò chuyện',confirm:'Đóng',cancel:null,
  content:`<div class="chat-library">
  <div class="chat-library-picker" role="group" aria-label="Loại nội dung">${Object.entries(chatLibraryKinds)
    .map(([kind,label])=>`<button type="button" class="btn ghost sm" data-library-kind="${kind}" aria-pressed="false">${label}</button>`).join('')}</div>
  <div class="chat-library-list" tabindex="0" role="region" aria-label="Nội dung đã chia sẻ"></div>
  <p class="hint chat-library-status" role="status"></p>
  <button class="btn ghost sm" type="button" data-library-more hidden>Xem thêm</button></div>`});
 const panel=$('.chat-library'),items=panel.querySelector('.chat-library-list');
 const status=panel.querySelector('.chat-library-status'),more=panel.querySelector('[data-library-more]');
 let kind='media',before=null,controller;
 const current=()=>panel.isConnected&&state.user?.id===owner&&state.tab===(group?'groups':'messages')&&
  (group?state.groupSelected:state.selected)===id;
 async function load(nextKind,append=false){
  if(!current())return;
  controller?.abort();
  const pending=new AbortController();
  controller=pending;
  kind=nextKind;
  if(!append){
   before=null;
   items.replaceChildren();
   items.dataset.kind=kind;
   items.setAttribute('aria-label',chatLibraryKinds[kind]+' đã chia sẻ');
   for(const button of panel.querySelectorAll('[data-library-kind]'))button.setAttribute('aria-pressed',String(button.dataset.libraryKind===kind));
  }
  more.hidden=true;
  status.textContent='Đang tải…';
  items.setAttribute('aria-busy','true');
  try{
   const params=new URLSearchParams({kind});
   if(before!==null)params.set('before',before);
   const data=await api(`/api/chats/${scope}/${id}/shared?${params}`,{signal:pending.signal});
   if(!current()||pending.signal.aborted)return;
   const top=items.scrollTop;
   items.insertAdjacentHTML('beforeend',data.items.map(item=>chatLibraryItem(item,kind)).join(''));
   items.scrollTop=top;
   before=data.next_before;
   more.textContent='Xem thêm';
   more.hidden=before===null;
   status.textContent=items.childElementCount?'':before!==null?
    'Chưa tìm thấy liên kết trong trang này. Có thể xem các tin cũ hơn.':'Chưa có nội dung thuộc mục này.';
  }catch(error){
   if(!current()||pending.signal.aborted)return;
   status.textContent=error.message;
   more.textContent='Thử lại';
   more.hidden=false;
  }finally{
   if(current()&&!pending.signal.aborted)items.removeAttribute('aria-busy');
  }
 }
 panel.addEventListener('click',event=>{
  const button=event.target.closest('[data-library-kind],[data-library-more]');
  if(button?.dataset.libraryKind)void load(button.dataset.libraryKind);
  else if(button)void load(kind,before!==null);
 });
 void load(kind);
}

function editChatNickname(peer){
 const friend=state.friends.find(f=>f.other_id===peer&&f.state==='accepted');
 if(!friend)return;
 const owner=state.user.id;
 modal({title:'Biệt danh của '+(friend.display_name||friend.username),
  description:'Chỉ bạn nhìn thấy biệt danh này trong danh sách hội thoại và tiêu đề chat. Xóa nội dung để dùng lại tên hiển thị.',
  content:`<form id="chat-nickname-form" class="field"><label for="chat-nickname">Biệt danh</label>
   <input id="chat-nickname" class="input" name="nickname" value="${esc(friend.nickname||'')}" maxlength="40" autocomplete="off"></form>`,
  confirm:'Lưu biệt danh',handler:async host=>{
   const nickname=host.querySelector('#chat-nickname').value;
   const result=await api('/api/chats/'+peer+'/nickname',{method:'PUT',data:{nickname}});
   if(state.user?.id!==owner)return;
   const row=state.friends.find(f=>f.other_id===peer);
   if(row)row.nickname=result.nickname;
   renderSideItems();updateChatHeader();
   if(['archive','friends'].includes(state.tab))renderApp();
   toast(result.nickname?'Đã lưu biệt danh.':'Đã dùng lại tên hiển thị.','ok');
  }});
 $('#chat-nickname-form').addEventListener('submit',event=>{
  event.preventDefault();$('#modal-confirm')?.click();
 });
}

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-chat-library],[data-chat-nickname]');
 if(!button||!state.user||state.user.is_admin)return;
 button.closest('.chat-header-more')?.removeAttribute('open');
 if(button.hasAttribute('data-chat-library'))openChatLibrary();
 else editChatNickname(Number(button.dataset.chatNickname));
});
