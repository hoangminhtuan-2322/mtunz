/* mtunz Social Workspace v1 — friend requests, pins, forwarding and settings.
   Pure progressive enhancement: no privileged endpoints or sensitive storage. */
(function(){
'use strict';
const $=(sel,root=document)=>root.querySelector(sel);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const el=(tag,cls,text)=>{
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(text!==undefined)x.textContent=String(text);return x;
};
const inApp=()=>typeof state!=='undefined'&&!!state.user&&!state.user.is_admin;
const chat=()=>{
 if(!inApp())return null;
 if(state.tab==='messages'&&state.selected)return {scope:'dm',chat_id:state.selected};
 if(state.tab==='groups'&&state.groupSelected)return {scope:'group',chat_id:state.groupSelected};
 return null;
};
const chatKey=ctx=>ctx?ctx.scope+':'+ctx.chat_id:'';
const sameChat=ctx=>chatKey(chat())===chatKey(ctx);
let shownFriendIds=new Set(),showingFriend=null,lastFriendUserId=null;
let currentPinKey='',pinList=[],pinRequestVersion=0,visiblePinKey='',renderScheduled=false;
let forwardDialog=null,friendPopup=null;
function closeFriendPopup(){
 if(friendPopup){friendPopup.remove();friendPopup=null;}
 showingFriend=null;
}
function drawFriendPopup(friend){
 closeFriendPopup();
 if(!inApp())return;
 showingFriend=friend.other_id;
 const card=el('section','mt-friend-request-pop');
 card.setAttribute('role','dialog');card.setAttribute('aria-label','Lời mời kết bạn từ '+friend.username);
 const header=el('div','mt-friend-request-top');
 const icon=el('span','mt-friend-request-icon','👋');
 const title=el('div','mt-friend-request-title');
 title.append(el('small','', 'LỜI MỜI KẾT BẠN'),el('strong','',friend.display_name||friend.username));
 const close=el('button','mt-close-pop','×');close.type='button';close.title='Để sau';close.setAttribute('aria-label','Để sau');
 header.append(icon,title,close);card.append(header);
 card.append(el('p','mt-friend-request-copy','@'+friend.username+' muốn kết nối với bạn trên mtunz.'));
 const info=el('div','mt-friend-request-profile');info.hidden=true;card.append(info);
 const actions=el('div','mt-friend-request-actions');
 const profile=el('button','mt-friend-btn','Xem hồ sơ');profile.type='button';
 const accept=el('button','mt-friend-btn primary','Chấp nhận');accept.type='button';
 const deny=el('button','mt-friend-btn reject','Từ chối');deny.type='button';
 actions.append(profile,accept,deny);card.append(actions);
 document.body.append(card);friendPopup=card;
 close.addEventListener('click',()=>{closeFriendPopup();checkInvites();});
 profile.addEventListener('click',async()=>{
   profile.disabled=true;info.hidden=false;info.replaceChildren(el('p','', 'Đang tải hồ sơ…'));
   try{
     const data=(await api('/api/profile/'+Number(friend.other_id))).profile;
     if(friendPopup!==card)return;
     info.replaceChildren();
     info.append(el('strong','',data.display_name||data.username));
     info.append(el('p','',data.bio||'Người dùng chưa thêm giới thiệu.'));
     info.append(el('small','','Tài khoản #'+data.id+' · Tham gia '+date(data.created_at)));
   }catch(err){info.replaceChildren(el('p','',err.message||'Không thể tải hồ sơ.'));}
   finally{profile.disabled=false;}
 });
 async function respond(allow){
  for(const b of [accept,deny,profile])b.disabled=true;
  try{
   await post('/api/friends/'+(allow?'accept':'remove')+'/'+Number(friend.other_id));
   shownFriendIds.add(friend.other_id);
   closeFriendPopup();
   await refreshFriends(true);
   toast(allow?'Đã chấp nhận lời mời kết bạn.':'Đã từ chối lời mời kết bạn.','ok');
  }catch(err){toast(err.message||'Không thể cập nhật lời mời.','error');for(const b of [accept,deny,profile])b.disabled=false;}
 }
 accept.addEventListener('click',()=>respond(true));
 deny.addEventListener('click',()=>respond(false));
}
function checkInvites(){
 if(!inApp()){closeFriendPopup();shownFriendIds.clear();lastFriendUserId=null;return;}
 if(lastFriendUserId!==state.user.id){
  closeFriendPopup();shownFriendIds.clear();lastFriendUserId=state.user.id;
 }
 const incoming=(state.friends||[]).filter(f=>f.state==='pending'&&f.requested_by!==state.user.id);
 const valid=new Set(incoming.map(f=>f.other_id));
 if(showingFriend&&!valid.has(showingFriend))closeFriendPopup();
 for(const f of incoming){
  if(!shownFriendIds.has(f.other_id)){
   if(friendPopup)break;
   shownFriendIds.add(f.other_id);
   drawFriendPopup(f);break;
  }
 }
}
function wrapFriends(){
 if(typeof refreshFriends!=='function'||refreshFriends.__mtunzSocialWrapped)return;
 const original=refreshFriends;
 refreshFriends=async function(...args){
  const result=await original(...args);
  checkInvites();
  return result;
 };
 refreshFriends.__mtunzSocialWrapped=true;
}
function currentMessages(){
 if(state.tab==='groups')return state.groupMessages||[];
 return state.messages||[];
}
function addMessageActions(){
 const ctx=chat();if(!ctx)return;
 for(const msg of currentMessages()){
  if(msg.deleted_at)continue;
  const scope=ctx.scope,wrap=$('#msg-'+scope+'-'+Number(msg.id));
  const tools=wrap?.querySelector('.bubble-actions');
  if(!tools||tools.querySelector('[data-social-action="pin"]'))continue;
  const pin=el('button','','📌');pin.type='button';
  pin.dataset.socialAction='pin';pin.dataset.messageId=msg.id;
  pin.title='Ghim hoặc bỏ ghim tin này';pin.setAttribute('aria-label','Ghim hoặc bỏ ghim tin nhắn');
  const forward=el('button','','↗');forward.type='button';
  forward.dataset.socialAction='forward';forward.dataset.messageId=msg.id;
  forward.title='Chuyển tiếp tin nhắn';forward.setAttribute('aria-label','Chuyển tiếp tin nhắn');
  tools.prepend(forward);tools.prepend(pin);
  if(msg.forwarded){
   const bubble=wrap.querySelector('.bubble');
   if(bubble&&!bubble.querySelector('.mt-forwarded-label')){
    bubble.prepend(el('small','mt-forwarded-label','↪ Đã chuyển tiếp'));
   }
  }
 }
}
function openForward(id){
 const ctx=chat();if(!ctx)return;
 const msg=currentMessages().find(x=>Number(x.id)===id);
 if(!msg||msg.deleted_at)return;
 closeForward();
 const overlay=el('div','mt-social-overlay'),dialog=el('section','mt-forward-dialog');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Chuyển tiếp tin nhắn');
 const head=el('div','mt-dialog-head');
 head.append(el('h2','','Chuyển tiếp tin nhắn'));
 const exit=el('button','mt-close-pop','×');exit.type='button';exit.setAttribute('aria-label','Đóng');
 head.append(exit);dialog.append(head);
 dialog.append(el('p','mt-forward-description',msg.attachment?'Tin nhắn kèm tệp sẽ được chia sẻ tới người nhận bạn chọn.':'Chọn người hoặc nhóm nhận tin nhắn này.'));
 const search=el('input','mt-forward-search');search.type='search';search.placeholder='Tìm người hoặc nhóm…';search.setAttribute('aria-label','Tìm nơi chuyển tiếp');
 dialog.append(search);
 const list=el('div','mt-forward-list');dialog.append(list);
 const friends=(state.friends||[]).filter(f=>f.state==='accepted'&&!f.restricted).map(f=>({
  scope:'dm',id:f.other_id,name:f.display_name||f.username,detail:'Bạn bè'
 }));
 const groups=(state.groups||[]).map(g=>({scope:'group',id:g.id,name:g.title,detail:'Nhóm · '+g.member_count+' thành viên'}));
 const choices=[...friends,...groups];
 async function send(target,button){
  button.disabled=true;
  try{
   await post('/api/chat/forward',{
    source_scope:ctx.scope,source_chat_id:Number(ctx.chat_id),message_id:id,
    target_scope:target.scope,target_id:Number(target.id)
   });
   closeForward();toast('Đã chuyển tiếp tin nhắn đến '+target.name+'.','ok');
  }catch(err){toast(err.message||'Không thể chuyển tiếp.','error');button.disabled=false;}
 }
 function draw(){
  list.replaceChildren();
  const keyword=search.value.trim().toLocaleLowerCase('vi');
  const results=choices.filter(item=>item.name.toLocaleLowerCase('vi').includes(keyword));
  for(const item of results){
   const b=el('button','mt-forward-destination');b.type='button';
   b.append(el('span','mt-forward-destination-icon',item.scope==='group'?'👥':'💬'));
   const copy=el('span','mt-forward-destination-copy');
   copy.append(el('strong','',item.name),el('small','',item.detail));
   b.append(copy,el('span','','Gửi ↗'));list.append(b);
   b.addEventListener('click',()=>send(item,b));
  }
  if(!results.length)list.append(el('p','mt-empty-note','Không tìm thấy người hoặc nhóm phù hợp.'));
 }
 search.addEventListener('input',draw);
 exit.addEventListener('click',closeForward);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeForward();});
 overlay.append(dialog);document.body.append(overlay);forwardDialog=overlay;draw();search.focus();
}
function closeForward(){if(forwardDialog){forwardDialog.remove();forwardDialog=null;}}
async function loadPins(ctx){
 if(!ctx)return;
 const requestId=++pinRequestVersion;
 try{
  const params=new URLSearchParams({scope:ctx.scope,chat_id:String(ctx.chat_id)});
  const result=await api('/api/chat/pins?'+params);
  if(requestId===pinRequestVersion&&sameChat(ctx)){pinList=result.pins||[];visiblePinKey='';renderPins();}
 }catch(err){if(sameChat(ctx))console.warn('Không thể tải tin đã ghim:',err.message);}
 finally{}
}
function renderPins(){
 const ctx=chat();if(!ctx)return;
 const shell=$('.shell:not(.admin-shell) .conversation');if(!shell)return;
 let bar=shell.querySelector('.mt-pins-bar');
 if(!pinList.length){bar?.remove();return;}
 if(!bar){
  bar=el('aside','mt-pins-bar');bar.setAttribute('aria-label','Tin nhắn đã ghim');
  const thread=shell.querySelector('.thread');thread?.before(bar);
 }
 if(!bar||visiblePinKey===chatKey(ctx)+':'+pinList.map(x=>x.message_id).join(','))return;
 const stamp=chatKey(ctx)+':'+pinList.map(x=>x.message_id).join(',');
 bar.replaceChildren();
 const head=el('strong','mt-pins-heading','📌 Đã ghim · '+pinList.length+'/5');
 const chips=el('div','mt-pin-chips');
 for(const item of pinList){
  const text=(item.body||'Tin nhắn có đính kèm').replace(/\s+/g,' ').slice(0,75);
  const jump=el('button','mt-pin-jump',text);jump.type='button';
  jump.title='Chuyển đến tin nhắn được ghim';
  jump.addEventListener('click',()=>{
   const target=$('#msg-'+ctx.scope+'-'+item.message_id);
   if(target){target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('mt-highlight-message');setTimeout(()=>target.classList.remove('mt-highlight-message'),1700);}
   else toast('Tin đã ghim nằm ngoài 70 tin mới nhất. Tìm trong lịch sử để xem.','info');
  });
  const remove=el('button','mt-pin-remove','×');remove.type='button';remove.title='Bỏ ghim tin nhắn';
  remove.setAttribute('aria-label','Bỏ ghim tin nhắn');
  remove.addEventListener('click',()=>togglePin(Number(item.message_id),ctx));
  const container=el('span','mt-pin-chip');container.append(jump,remove);chips.append(container);
 }
 bar.append(head,chips);visiblePinKey=stamp;
}
async function togglePin(id,ctx){
 if(!ctx||!sameChat(ctx))return;
 try{
  const result=await post('/api/chat/pins',{scope:ctx.scope,chat_id:Number(ctx.chat_id),message_id:id});
  await loadPins(ctx);
  toast(result.pinned?'Đã ghim tin nhắn.':'Đã bỏ ghim tin nhắn.','ok');
 }catch(err){toast(err.message||'Không thể ghim tin nhắn.','error');}
}
function upgradeSettings(){
 if(!inApp()||state.tab!=='settings')return;
 const page=$('.shell:not(.admin-shell) .main .section-wrap');
 if(!page||page.classList.contains('mt-settings-upgraded'))return;
 page.classList.add('mt-settings-upgraded');
 const map=[
  ['Hồ sơ','settings-profile'],['Liên hệ','settings-contact'],
  ['Mã PIN','settings-pin'],['Mật khẩu','settings-password']
 ];
 const jump=el('nav','mt-settings-jump');jump.setAttribute('aria-label','Điều hướng cài đặt');
 for(const [label,key] of map){
  const form=$('form[data-form="'+key+'"]',page),section=form?.closest('.card');
  if(!section)continue;
  section.id='mt-settings-'+key;
  const b=el('button','mt-settings-jump-btn',label);b.type='button';
  b.addEventListener('click',()=>section.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
  jump.append(b);
 }
 const accountDelete=$('.account-delete-zone',page);
 if(accountDelete){accountDelete.id='mt-settings-danger';const b=el('button','mt-settings-jump-btn danger','Xóa tài khoản');b.type='button';
  b.addEventListener('click',()=>accountDelete.scrollIntoView({block:'start',behavior:'smooth'}));jump.append(b);}
 const hero=el('section','mt-settings-health');
 hero.append(el('div','mt-settings-health-icon','✦'));
 const copy=el('div','mt-settings-health-copy');
 copy.append(el('strong','','Trung tâm tài khoản'));
 copy.append(el('p','','Quản lý hồ sơ, bảo mật và quyền riêng tư tại một nơi.'));
 const stats=el('div','mt-settings-health-pills');
 stats.append(el('span','','🔒 PIN '+(state.user.pin_length||'chưa bật')));
 stats.append(el('span','',state.user.show_online?'● Hiển thị online':'◌ Ẩn trạng thái online'));
 stats.append(el('span','',state.user.show_receipts?'✓ Cho phép báo đã xem':'◌ Ẩn báo đã xem'));
 copy.append(stats);hero.append(copy);
 const sessions=el('button','mt-settings-sessions','Thiết bị đăng nhập');sessions.type='button';sessions.dataset.act='list-sessions';hero.append(sessions);
 const title=$('.section-lead',page);
 if(title){title.after(hero);hero.after(jump);}
 const cards=$$('.setting-grid .card',page);
 cards.forEach((c,i)=>{c.classList.add('mt-settings-card');if(i<2)c.classList.add('mt-security-card');});
}
function mount(){
 if(!inApp()){closeFriendPopup();closeForward();return;}
 checkInvites();
 upgradeSettings();
 const ctx=chat();
 if(!ctx){currentPinKey='';pinList=[];visiblePinKey='';pinRequestVersion++;closeForward();return;}
 addMessageActions();
 const key=chatKey(ctx);
 if(key!==currentPinKey){currentPinKey=key;pinList=[];visiblePinKey='';loadPins(ctx);}
 else renderPins();
}
const observer=new MutationObserver(()=>{
 if(renderScheduled)return;renderScheduled=true;
 requestAnimationFrame(()=>{renderScheduled=false;mount();});
});
function bootstrap(){
 wrapFriends();
 const root=$('#app');if(root)observer.observe(root,{childList:true,subtree:true});
 mount();
}
document.addEventListener('DOMContentLoaded',bootstrap);
if(document.readyState!=='loading')bootstrap();
document.addEventListener('click',event=>{
 const btn=event.target.closest('[data-social-action]');
 if(!btn)return;
 const ctx=chat(),id=Number(btn.dataset.messageId);
 if(!ctx||!id)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(btn.dataset.socialAction==='pin')togglePin(id,ctx);
 if(btn.dataset.socialAction==='forward')openForward(id);
},true);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){closeForward();closeFriendPopup();}
});
})();