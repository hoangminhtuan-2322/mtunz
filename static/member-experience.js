/* mtunz Member Experience v1 — real photo, emoji and consent-based location actions.
   Progressive enhancement: original chat forms, APIs, permissions and admin remain intact. */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s);
const all=(s,r=document)=>Array.from(r.querySelectorAll(s));
const make=(tag,cls,txt)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(txt!==undefined)node.textContent=String(txt);
 return node;
};
const allowedPhotos=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const emojiSet=['😀','😄','😁','😆','😊','🥰','😍','😘','😎','🤩','🥹','😭','😂','🤣','😉','😇','🤔','😴','😮','😢','😡','👍','👎','👏','🙌','🙏','💪','🤝','❤️','🧡','💜','💙','💚','✨','🔥','🎉','💯','🎂','🌷','🌈','⭐','☀️','🎶','📸','👋','💌','💖','🫶'];
const svg={
 photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 18 5.5-6 4 4 3-3 4.5 5"/></svg>',
 emoji:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5"/><path d="M9 9h.01M15 9h.01" stroke-width="3"/></svg>',
 map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};
let picker=null,locationDialog=null,scheduled=false,photoPreparing=false;
function chatReady(){
 return !!q('.shell:not(.admin-shell) .conversation .compose-row')&&
 typeof state!=='undefined'&&!!state.user&&!state.user.is_admin;
}
function tool(name,title,icon){
 const b=make('button','chat-compose-tool');b.type='button';
 b.dataset.chatUi=name;b.setAttribute('aria-label',title);b.title=title;
 b.innerHTML=svg[icon]+'<span>'+title+'</span>';
 return b;
}
function hidePicker(){
 if(!picker)return;
 const trigger=picker.trigger;
 picker.remove();picker=null;
 if(trigger&&trigger.isConnected)trigger.setAttribute('aria-expanded','false');
}
function openPicker(trigger,form){
 if(picker){const same=picker.trigger===trigger;hidePicker();if(same)return;}
 const layer=make('div','chat-emoji-picker');
 layer.id='chat-emoji-picker';layer.setAttribute('role','dialog');
 layer.setAttribute('aria-label','Chọn emoji để chèn vào tin nhắn');
 const top=make('div','chat-emoji-heading');
 top.append(make('strong','','Biểu cảm'));
 top.append(make('span','','Chọn emoji để thêm vào tin nhắn'));
 const grid=make('div','chat-emoji-grid');
 for(const emoji of emojiSet){
  const b=make('button','chat-emoji-choice',emoji);b.type='button';
  b.dataset.chatEmoji=emoji;b.setAttribute('aria-label','Chèn '+emoji);
  grid.append(b);
 }
 layer.append(top,grid);form.querySelector('.chat-compose-toolbar').append(layer);
 layer.trigger=trigger;picker=layer;
 trigger.setAttribute('aria-expanded','true');
 grid.querySelector('button')?.focus();
}
function insertEmoji(text,form){
 const field=q('#chat-text',form);if(!field)return;
 const start=typeof field.selectionStart==='number'?field.selectionStart:field.value.length;
 const end=typeof field.selectionEnd==='number'?field.selectionEnd:start;
 const value=field.value.slice(0,start)+text+field.value.slice(end);
 if(value.length>field.maxLength&&field.maxLength>0){toast('Tin nhắn đã đạt giới hạn ký tự.','warning');return;}
 field.value=value;field.focus();field.setSelectionRange(start+text.length,start+text.length);
 field.dispatchEvent(new Event('input',{bubbles:true}));hidePicker();
}
function chatContext(){
 if(!state.user||state.user.is_admin)return null;
 if(state.tab==='groups'&&state.groupSelected)return {type:'group',id:state.groupSelected,owner:state.user.id};
 if(state.tab==='messages'&&state.selected)return {type:'dm',id:state.selected,owner:state.user.id};
 return null;
}
function sameContext(ctx){
 const active=chatContext();
 return !!ctx&&!!active&&ctx.owner===active.owner&&ctx.type===active.type&&Number(ctx.id)===Number(active.id);
}
function closeLocation(){
 if(!locationDialog)return;
 locationDialog.remove();locationDialog=null;
}
function openLocation(){
 if(locationDialog){closeLocation();return;}
 const ctx=chatContext();
 if(!ctx)return;
 hidePicker();
 const overlay=make('div','chat-location-overlay');
 const dialog=make('section','chat-location-dialog');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','chat-location-title');
 const close=make('button','chat-location-close','×');close.type='button';close.setAttribute('aria-label','Đóng cửa sổ vị trí');
 const heading=make('div','chat-location-heading');
 heading.append(make('span','chat-location-icon','📍'),make('h2','','Chia sẻ vị trí'));
 heading.querySelector('h2').id='chat-location-title';
 dialog.append(close,heading);
 dialog.append(make('p','chat-location-explainer','Chỉ lấy vị trí khi bạn đồng ý. Người nhận có thể mở tọa độ trên bản đồ. Không chia sẻ âm thầm hay theo dõi liên tục.'));
 const permission=make('button','chat-location-detect','Lấy vị trí hiện tại');permission.type='button';
 const feedback=make('p','chat-location-feedback','Chưa truy cập vị trí của bạn.');feedback.setAttribute('role','status');
 const preview=make('div','chat-location-preview');preview.hidden=true;
 const coordinate=make('b','chat-location-coordinate');
 const detail=make('small','', 'Vị trí gần đúng được chọn mặc định.');
 const opt=make('label','chat-location-option');
 const approx=document.createElement('input');approx.type='checkbox';approx.checked=true;
 opt.append(approx,make('span','','Chia sẻ vị trí gần đúng (~100 m)'));
 const map=make('a','chat-location-map','Xem tọa độ trên bản đồ');
 map.target='_blank';map.rel='noopener noreferrer';map.hidden=true;
 preview.append(coordinate,detail,opt,map);
 const actions=make('div','chat-location-actions');
 const cancel=make('button','chat-location-cancel','Hủy');cancel.type='button';
 const send=make('button','chat-location-send','Gửi vị trí');send.type='button';send.disabled=true;
 actions.append(cancel,send);
 dialog.append(permission,feedback,preview,actions);
 overlay.append(dialog);overlay.context=ctx;document.body.append(overlay);locationDialog=overlay;
 let coords=null;
 const mapUrl=(a,b)=>'https://www.google.com/maps?q='+a+','+b;
 const selected=()=>{
  if(!coords)return null;
  const digits=approx.checked?3:5;
  return [Number(coords.latitude.toFixed(digits)),Number(coords.longitude.toFixed(digits))];
 };
 const redraw=()=>{
  const point=selected();if(!point)return;
  coordinate.textContent=point.join(', ');
  detail.textContent=approx.checked?'Vị trí gần đúng (~100 m), tránh chia sẻ địa điểm quá chi tiết.':'Vị trí chi tiết hơn; người nhận sẽ thấy tọa độ bạn gửi.';
  map.href=mapUrl(point[0],point[1]);map.hidden=false;
 };
 permission.addEventListener('click',()=>{
  if(!navigator.geolocation||!window.isSecureContext){
   feedback.textContent='Trình duyệt cần HTTPS và hỗ trợ định vị để chia sẻ vị trí.';return;
  }
  permission.disabled=true;permission.textContent='Đang xác định vị trí…';
  feedback.textContent='Trình duyệt sẽ yêu cầu bạn cho phép truy cập vị trí.';
  navigator.geolocation.getCurrentPosition(
   position=>{
    if(locationDialog!==overlay)return;
    const a=Number(position.coords.latitude),b=Number(position.coords.longitude);
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180){
     feedback.textContent='Tọa độ nhận được không hợp lệ. Vui lòng thử lại.';permission.disabled=false;permission.textContent='Thử lại';return;
    }
    coords={latitude:a,longitude:b};preview.hidden=false;send.disabled=false;
    feedback.textContent='Đã có vị trí. Hãy kiểm tra mức độ chính xác trước khi gửi.';
    permission.disabled=false;permission.textContent='Cập nhật vị trí';redraw();
   },
   error=>{
    if(locationDialog!==overlay)return;
    const msg=error.code===1?'Bạn chưa cấp quyền vị trí cho trang web.':error.code===3?'Hết thời gian xác định vị trí.':'Không lấy được vị trí hiện tại.';
    feedback.textContent=msg;permission.disabled=false;permission.textContent='Thử lại';
   },
   {enableHighAccuracy:false,timeout:12000,maximumAge:60000}
  );
 });
 approx.addEventListener('change',redraw);
 send.addEventListener('click',async()=>{
  const point=selected();if(!point||!sameContext(ctx)){feedback.textContent='Cuộc trò chuyện đã thay đổi. Vui lòng mở lại để gửi.';return;}
  const marker=approx.checked?'📍 Vị trí gần đúng':'📍 Vị trí được chia sẻ';
  const body=marker+'\n'+mapUrl(point[0],point[1]);
  send.disabled=true;send.textContent='Đang gửi…';
  try{
   if(ctx.type==='group'){
    await post('/api/groups/'+ctx.id+'/messages',{body});
    if(sameContext(ctx)){await loadGroupMessages();await refreshGroups();}
   }else{
    await post('/api/messages',{recipient_id:ctx.id,body});
    if(sameContext(ctx)){await loadMessages();await refreshFriends();}
   }
   closeLocation();toast('Đã gửi vị trí cho cuộc trò chuyện.','ok');
  }catch(error){
   feedback.textContent=error.message||'Gửi vị trí thất bại. Vui lòng thử lại.';
   send.disabled=false;send.textContent='Gửi vị trí';
  }
 });
 const onClose=()=>closeLocation();
 close.addEventListener('click',onClose);cancel.addEventListener('click',onClose);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeLocation();});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeLocation();}});
 permission.focus();
}
async function optimizePhoto(file){
 if(!allowedPhotos.has(file.type))throw Error('Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF.');
 if(file.size>30*1024*1024)throw Error('Ảnh gốc quá lớn (tối đa 30 MB trước tối ưu).');
 if(file.size<=1.7*1024*1024)return file;
 if(file.type==='image/gif')throw Error('GIF trên 2 MB chưa được hỗ trợ trên máy chủ hiện tại. Vui lòng chọn GIF nhỏ hơn.');
 const objectUrl=URL.createObjectURL(file);
 let image;
 try{
  image=await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Không đọc được ảnh.'));img.src=objectUrl;
  });
  const maxSide=1600;
  let scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  for(let attempt=0;attempt<5;attempt++){
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Trình duyệt không hỗ trợ tối ưu ảnh.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const quality=Math.max(.5,.85-attempt*.07);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   canvas.width=1;canvas.height=1;
   if(!blob)throw Error('Không nén được ảnh.');
   if(blob.size<=1.7*1024*1024){
    return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'hinh-anh')+'.jpg',{type:'image/jpeg'});
   }
   scale*=.78;
  }
  throw Error('Không thể giảm ảnh xuống dưới giới hạn 2 MB. Vui lòng chọn ảnh nhỏ hơn.');
 }finally{URL.revokeObjectURL(objectUrl);}
}
async function uploadPhoto(file){
 if(!chatReady())return;
 if(state.uploading||photoPreparing){toast('Vui lòng hoàn tất ảnh đang tải trước.','warning');return;}
 const context=chatContext();
 if(!context)return;
 photoPreparing=true;
 const composer=q('.conversation .composer');
 const progress=make('div','chat-photo-preparing','Đang chuẩn bị ảnh…');
 composer?.append(progress);
 try{
  const result=await optimizePhoto(file);
  if(!sameContext(context)){toast('Bạn đã chuyển cuộc trò chuyện, ảnh chưa được gửi.','warning');return;}
  progress.textContent='Đang tải ảnh lên…';
  progress.remove();
  await uploadSelected(result);
 }catch(error){toast(error.message||'Không thể đính kèm ảnh.','error');}
 finally{photoPreparing=false;progress.remove();}
}
function enableFileKeyboard(label){
 // File picker labels are clickable with a mouse but not natively keyboard
 // focusable. Make them usable with Tab, Enter and Space as well.
 label.tabIndex=0;
 label.setAttribute('role','button');
 label.addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  event.preventDefault();
  label.querySelector('input[type="file"]')?.click();
 });
}
function mountComposer(form){
 if(form.classList.contains('chat-compose-enhanced'))return;
 const textarea=q('#chat-text',form),submit=q('button[type="submit"]',form);
 if(!textarea||!submit)return;
 const original=q('.attachment-button',form);
 const toolbar=make('div','chat-compose-toolbar');
 const photo=make('label','chat-compose-tool chat-photo-tool');
 photo.title='Chọn ảnh để gửi';photo.setAttribute('aria-label','Chọn ảnh');
 photo.innerHTML=svg.photo+'<span>Ảnh</span>';
 const photoInput=document.createElement('input');photoInput.type='file';
 photoInput.className='upload-input';photoInput.accept='image/jpeg,image/png,image/webp,image/gif';
 photoInput.hidden=true;photo.append(photoInput);
 enableFileKeyboard(photo);
 const emoji=tool('emoji','Emoji','emoji');emoji.setAttribute('aria-expanded','false');
 emoji.setAttribute('aria-controls','chat-emoji-picker');
 const geo=tool('location','Vị trí','map');
 toolbar.append(photo,emoji,geo);
 if(original){
  original.classList.remove('btn','ghost','attachment-button');
  original.classList.add('chat-compose-tool','chat-file-tool');
  original.title='Gửi tệp đính kèm';
  original.setAttribute('aria-label','Chọn tệp đính kèm');
  original.append(make('span','','Tệp'));toolbar.append(original);
  enableFileKeyboard(original);
 }
 for(const action of ['record','schedule-new']){
  const button=q('[data-v4-act="'+action+'"]',form);
  if(button){
   button.classList.remove('btn','ghost');
   button.classList.add('chat-compose-tool','chat-compose-icon');
   toolbar.append(button);
  }
 }
 const main=make('div','chat-compose-main');
 submit.addEventListener('mousedown',event=>{if(document.activeElement===textarea)event.preventDefault();});
 main.append(textarea,submit);form.replaceChildren(toolbar,main);
 form.classList.add('chat-compose-enhanced');
 textarea.placeholder='Viết tin nhắn…';
 textarea.setAttribute('aria-label','Nội dung tin nhắn');
 if(!window.CSS?.supports('field-sizing','content')){
  let resizeFrame=0;
  const resize=()=>{
   if(resizeFrame)return;
   resizeFrame=requestAnimationFrame(()=>{
    resizeFrame=0;
    if(!textarea.isConnected)return;
    textarea.style.height='auto';
    textarea.style.height=Math.min(130,Math.max(46,textarea.scrollHeight))+'px';
   });
  };
  textarea.addEventListener('input',resize);resize();
 }
 if(typeof ResizeObserver==='function'){
  const thread=q('#chat-messages',form.closest('.conversation'));
  if(thread){
   const adjust=new ResizeObserver(()=>{
    if(!thread.isConnected){adjust.disconnect();return;}
    if(thread.dataset.followChatEnd==='true')followChatEnd(thread);
   });
   adjust.observe(thread);
  }
 }
 const helper=form.nextElementSibling;
 if(helper?.classList.contains('hint'))helper.textContent='Enter để gửi · Shift + Enter để xuống dòng · Ảnh được tối ưu trước khi gửi';
 toolbar.addEventListener('click',event=>{
  const choice=event.target.closest('[data-chat-emoji]');
  if(choice){insertEmoji(choice.dataset.chatEmoji,form);return;}
  const action=event.target.closest('[data-chat-ui]')?.dataset.chatUi;
  if(action==='emoji')openPicker(emoji,form);
  if(action==='location')openLocation();
 });
}
function mountHeader(header){
 if(!header||header.classList.contains('chat-header-refined'))return;
 const group=!!q('button[data-act="group-leave"]',header);
 const actions=group?['group-manage','group-leave']:['profile-view','call-audio','call-video','pin-chat','mute-chat','archive-chat','chat-restrict','chat-block'];
 const buttons=actions.map(action=>q('button[data-act="'+action+'"]',header)).filter(Boolean);
 if(group)buttons.unshift(...all('[data-workflow-alert],[data-workflow-mention]',header));
 const nickname=q('[data-chat-nickname]',header);
 if(nickname)buttons.unshift(nickname);
 if(!group)buttons.unshift(...all('[data-v6-act="disappear"],[data-v4-act="schedule-list"]',header));
 if(!buttons.length)return;
 const details=make('details','chat-header-more');
 const summary=make('summary','','•••');summary.title='Tùy chọn hội thoại';
 summary.setAttribute('aria-label','Mở thêm tùy chọn hội thoại');
 const list=make('div','chat-header-menu');list.setAttribute('role','group');list.setAttribute('aria-label','Tùy chọn hội thoại');
 for(const button of buttons){
  button.setAttribute('aria-label',button.title||button.textContent.trim());
  if(button.title&&!button.textContent.trim())button.append(make('span','',button.title));
  list.append(button);
 }
 details.open=header.dataset.restoreMenu==='true';
 details.append(summary,list);header.append(details);
 header.classList.add('chat-header-refined');
}
function renderLocations(shell){
 const entries=(state.tab==='groups'?state.groupMessages:state.messages)||[];
 const scope=state.tab==='groups'?'group':'dm';
 const pattern=/^📍 Vị trí (gần đúng|được chia sẻ)\nhttps:\/\/www\.google\.com\/maps\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
 for(const message of entries){
  if(message.deleted_at||typeof message.body!=='string')continue;
  const found=pattern.exec(message.body.trim());if(!found)continue;
  const lat=Number(found[2]),lon=Number(found[3]);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
  const wrapper=q('#msg-'+scope+'-'+Number(message.id),shell);
  if(!wrapper)continue;
  const bubble=q('.bubble',wrapper);
  if(!bubble||q('.chat-shared-location',bubble))continue;
  const body=all(':scope > div',bubble).find(node=>!node.classList.contains('stamp')&&!node.classList.contains('reply-inline'));
  if(!body)continue;
  const card=make('a','chat-shared-location');
  card.href='https://www.google.com/maps?q='+lat+','+lon;
  card.target='_blank';card.rel='noopener noreferrer';
  card.setAttribute('aria-label','Mở vị trí được chia sẻ trên Google Maps');
  const symbol=make('span','chat-shared-location-icon','📍');
  const copy=make('span','chat-shared-location-content');
  copy.append(make('strong','',found[1]==='gần đúng'?'Vị trí gần đúng':'Vị trí được chia sẻ'));
  copy.append(make('small','','Tọa độ: '+lat+', '+lon));
  copy.append(make('em','','Mở trong bản đồ ↗'));
  card.append(symbol,copy);body.replaceWith(card);
 }
}
function addImagePreview(shell){
 const meta=state.pendingAttachment;
 if(!meta||!allowedPhotos.has(meta.mime))return;
 const box=q('.conversation #compose-extra .compose-file',shell);
 if(!box||q('.chat-attachment-thumbnail',box))return;
 const image=make('img','chat-attachment-thumbnail');
 image.src=meta.url;image.alt='Ảnh đã đính kèm: '+meta.name;
 image.loading='lazy';image.decoding='async';box.prepend(image);
}
function mount(){
 const shell=q('.shell:not(.admin-shell)');
 if(!shell||!state?.user||state.user.is_admin){hidePicker();closeLocation();return;}
 const form=q('.conversation .compose-row',shell);
 if(form)mountComposer(form);
 const header=q('.conversation .main-head',shell);
 if(header)mountHeader(header);
 if(form){renderLocations(shell);addImagePreview(shell);}
 if(locationDialog&&!sameContext(locationDialog.context))closeLocation();
}
const observer=new MutationObserver(records=>{
 if(!records.some(({target})=>['app','chat-header','chat-messages','compose-extra'].includes(target.id)))return;
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;mount();});
});
function boot(){
 const root=q('#app');if(root)observer.observe(root,{childList:true,subtree:true});mount();
}
document.addEventListener('DOMContentLoaded',boot);
if(document.readyState!=='loading')boot();
function openMessageTools(trigger){
 const source=trigger.closest('.bubble-wrap');
 const actions=all('.bubble-actions button',source);
 if(!actions.length)return;
 modal({title:'Tùy chọn tin nhắn',description:'Chọn thao tác cho tin nhắn này.',confirm:'Đóng',cancel:null,
  content:'<div class="message-tool-list"></div>'});
 const list=q('#modal-root .message-tool-list');
 actions.forEach(action=>{
  const label=action.dataset.emoji?'Thả '+action.dataset.emoji:
   action.getAttribute('aria-label')||action.title||action.textContent.trim();
  const choice=make('button','btn ghost',label);
  choice.type='button';
  choice.onclick=()=>{
   q('#modal-root').replaceChildren();
   if(!source.isConnected){toast('Tin nhắn đã thay đổi. Vui lòng mở lại tùy chọn.');return;}
   trigger.focus({preventScroll:true});
   action.click();
  };
  list.append(choice);
 });
}
document.addEventListener('click',event=>{
 const tools=event.target.closest('[data-message-tools]');
 if(tools)openMessageTools(tools);
 if(picker&&!event.target.closest('.chat-emoji-picker,.chat-compose-tool[data-chat-ui="emoji"]'))hidePicker();
 const menu=event.target.closest('.chat-header-more');
 if(!menu)all('.chat-header-more[open]').forEach(item=>item.open=false);
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){hidePicker();closeLocation();}
});
document.addEventListener('change',event=>{
 const input=event.target;
 if(!input.matches?.('.conversation .upload-input')||!input.files?.length)return;
 const file=input.files[0];
 if(!file.type.startsWith('image/'))return;
 event.stopImmediatePropagation();
 input.value='';
 uploadPhoto(file);
},true);
document.addEventListener('paste',event=>{
 const target=event.target;if(target?.id!=='chat-text')return;
 const files=Array.from(event.clipboardData?.files||[]);
 const photo=files.find(file=>file.type.startsWith('image/'));
 if(!photo)return;
 event.preventDefault();
 uploadPhoto(photo);
});
document.addEventListener('dragover',event=>{
 if(!chatReady()||!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
 const area=event.target.closest?.('.conversation');
 if(!area)return;event.preventDefault();area.classList.add('chat-drop-active');
});
document.addEventListener('dragleave',event=>{
 const area=event.target.closest?.('.conversation');
 if(area&&!area.contains(event.relatedTarget))area.classList.remove('chat-drop-active');
});
document.addEventListener('drop',event=>{
 const area=event.target.closest?.('.conversation');
 if(!area)return;area.classList.remove('chat-drop-active');
 const photo=Array.from(event.dataTransfer?.files||[]).find(file=>file.type.startsWith('image/'));
 if(!photo)return;
 event.preventDefault();uploadPhoto(photo);
});
})();