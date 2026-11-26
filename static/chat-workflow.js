'use strict';

const groupSendRetries=new Map();
let workflowUpload=null;
let searchReturn=null;

function activeWorkflowChat(){
 const scope=state.tab==='groups'?'group':state.tab==='messages'?'dm':null;
 const id=scope==='group'?state.groupSelected:state.selected;
 return scope&&id&&state.user?{scope,id,owner:state.user.id,key:scope+'-'+id}:null;
}
function workflowCurrent(ctx){
 const chat=activeWorkflowChat();
 return !!ctx&&chat?.owner===ctx.owner&&chat.key===ctx.key;
}
function workflowCanonicalPath(ctx){
 return ctx.scope==='group'?'/api/groups/'+ctx.id+'/messages':'/api/messages/'+ctx.id;
}
function chatRow(ctx,id){return document.getElementById('msg-'+ctx.scope+'-'+id);}

async function revealConversationMessage(ctx,id,opener){
 const box=$('#chat-messages');
 if(!workflowCurrent(ctx)||box?.dataset.chatKey!==ctx.key)return;
 const row=chatRow(ctx,id);
 if(row&&box.contains(row)){
  if(!searchReturn||searchReturn.box!==box)searchReturn={box,position:captureMutationPosition(box)};
  $('#modal-root').replaceChildren();
  pauseChatFollow(box);
  row.scrollIntoView({block:'center',behavior:'instant'});
  row.tabIndex=-1;
  row.focus({preventScroll:true});
  row.classList.add('search-target');
  setTimeout(()=>row.classList.remove('search-target'),1600);
  let back=box.parentElement.querySelector('.chat-return-position');
  if(!back){
   back=document.createElement('button');
   back.type='button';
   back.className='btn ghost sm chat-return-position';
   back.textContent='Về vị trí đang đọc';
   box.parentElement.querySelector('.composer')?.prepend(back);
   back.addEventListener('click',()=>{
    if(searchReturn?.box===box)restoreThreadPosition(box,searchReturn.position);
    searchReturn=null;
    back.remove();
    $('#chat-text')?.focus({preventScroll:true});
   });
  }
  return;
 }
 const result=await api(`/api/chats/${ctx.scope}/${ctx.id}/context/${id}`);
 if(!workflowCurrent(ctx)||!opener.isConnected)return;
 if(!result.messages.some(item=>item.id===id))return;
 modal({title:'Đoạn hội thoại',description:'Tin tìm thấy được đánh dấu. Đóng để trở về vị trí đang đọc.',
  content:`<div class="chat-context-list">${result.messages.map(item=>`
  <article ${item.id===id?'class="chat-context-hit" tabindex="-1"':''}>
   <strong>${esc(item.sender_id===ctx.owner?'Bạn':item.username||'Thành viên')}</strong>
   <small>${date(item.created_at)}</small><p>${esc(item.body||item.attachment?.name||'Tệp đính kèm')}</p>
   ${item.attachment?uploadMarkup(item):''}
  </article>`).join('')}</div>`,confirm:'Về hội thoại',cancel:null});
 const target=$('.chat-context-hit');
 requestAnimationFrame(()=>{target?.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});});
}

function paintChatMarkers(box){
 box.querySelector('.chat-unread-marker')?.remove();
 box.querySelector('.chat-next-page')?.remove();
 if(box.dataset.firstUnread){
  const row=document.getElementById('msg-'+box.dataset.chatKey.split('-')[0]+'-'+box.dataset.firstUnread);
  if(row&&box.contains(row))row.insertAdjacentHTML('beforebegin','<div class="chat-unread-marker" role="separator" aria-label="Tin chưa đọc">Tin chưa đọc</div>');
 }
 if(box.dataset.moreAfter==='true'){
  box.insertAdjacentHTML('beforeend','<button type="button" class="btn ghost sm chat-next-page" data-workflow-next>Tin mới hơn</button>');
 }
}
function finishChatHistory(box,result,opening,scroll,paint){
 if(!box)return;
 if(opening){
  if(result.first_unread_id)box.dataset.firstUnread=String(result.first_unread_id);
  box.dataset.moreAfter=String(!!result.more_after);
  if(result.more_after)box.dataset.expandedHistory='true';
 }
 // Unread markers remain available while browsing older history, but must not
 // override the requested latest-message landing position.
 paint(scroll||opening);
}
async function bringChatLatest(){
 const box=$('#chat-messages'),ctx=activeWorkflowChat();
 if(!box||!ctx)return;
 if(box.dataset.moreAfter!=='true'){followChatEnd(box);return;}
 const result=await api(workflowCanonicalPath(ctx)+'?latest=1');
 if(!workflowCurrent(ctx)||!box.isConnected)return;
 delete box.dataset.moreAfter;
 delete box.dataset.firstUnread;
 delete box.dataset.expandedHistory;
 delete box.dataset.historyDone;
 if(ctx.scope==='group'){state.groupMessages=result.messages;paintGroupThread(true);}
 else{state.messages=[...result.messages,...queuedDirectMessages(ctx.owner,ctx.id)];renderMessageThread(true);}
}
async function nextChatPage(button){
 const ctx=activeWorkflowChat(),box=$('#chat-messages');
 const group=ctx?.scope==='group',previous=group?state.groupMessages:state.messages;
 const last=previous.filter(item=>item.id>0).at(-1);
 if(!last||button.disabled||box?.dataset.moreAfter!=='true')return;
 button.disabled=true;
 try{
  const result=await api(workflowCanonicalPath(ctx)+'?after='+last.id);
  if(!workflowCurrent(ctx)||!button.isConnected)return;
  box.dataset.moreAfter=String(!!result.more_after);
  const merged=[...previous,...result.messages.filter(m=>m.id>last.id)];
  pauseChatFollow(box);
  const position=captureThreadPosition(box,false);
  if(group){state.groupMessages=merged;paintGroupThread(false);}
  else{state.messages=merged;renderMessageThread(false);}
  restoreThreadPosition(box,position);
 }finally{button.disabled=false;}
}

function abortStaleWorkflowUpload(){
 const attempt=workflowUpload;
 if(!attempt||workflowCurrent(attempt.ctx))return;
 workflowUpload=null;
 if(attempt.status==='busy'){
  state.uploading=false;
  attempt.xhr.abort();
 }
}
function uploadPanel(){
 const attempt=workflowUpload;
 if(!attempt||!workflowCurrent(attempt.ctx))return '';
 const busy=attempt.status==='busy';
 return `<div class="compose-upload-status">
   <span>${esc(short(attempt.file.name,40))} · <span data-upload-label>${busy?'Đang tải lên…':esc(attempt.error)}</span></span>
   ${busy?'<progress aria-label="Tiến độ tải tệp" max="100" value="0"></progress>':'<button type="button" class="btn ghost sm" data-workflow-upload="retry">Thử lại</button>'}
   <button type="button" class="btn ghost sm" data-workflow-upload="cancel">${busy?'Hủy tải':'Bỏ tệp'}</button></div>`;
}
function repaintUploadPanel(){const extra=$('#compose-extra');if(extra)extra.innerHTML=composerExtras();}
function sendAttachment(file,ctx=activeWorkflowChat(),retry=null){
 if(!workflowCurrent(ctx))return Promise.resolve(false);
 abortStaleWorkflowUpload();
 if(workflowUpload?.status==='busy')return Promise.reject(Error('Đang tải tệp. Bạn có thể hủy lần tải này.'));
 if(file.size>12*1024*1024)return Promise.reject(Error('Tệp vượt giới hạn tải lên.'));
 const attempt=retry||{file,ctx,key:v4Nonce()};
 const xhr=new XMLHttpRequest();
 Object.assign(attempt,{xhr,status:'busy',error:''});
 workflowUpload=attempt;
 state.uploading=true;
 repaintUploadPanel();
 return new Promise(resolve=>{
  const complete=(attachment,error,cancelled=false)=>{
   if(workflowUpload!==attempt){resolve(false);return;}
   state.uploading=false;
   if(attachment||cancelled||!workflowCurrent(ctx))workflowUpload=null;
   else {attempt.status='failed';attempt.error=error;}
   if(attachment&&workflowCurrent(ctx)){state.pendingAttachment=attachment;toast('Tệp đã sẵn sàng để gửi.','ok');}
   repaintUploadPanel();
   resolve(!!attachment&&workflowCurrent(ctx));
  };
  xhr.open('POST','/api/uploads');
  xhr.timeout=60000;
  xhr.upload.addEventListener('progress',event=>{
   const progress=$('.compose-upload-status progress');
   if(!progress||!workflowCurrent(ctx)||!event.lengthComputable)return;
   const percent=Math.round(event.loaded/event.total*100);
   progress.value=percent;
   const label=$('[data-upload-label]');
   if(label)label.textContent=percent===100?'Đang xử lý…':percent+'%';
  });
  xhr.onload=()=>{
   let data={};
   try{data=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status>=200&&xhr.status<300&&data.attachment)complete(data.attachment);
   else complete(null,typeof data.detail==='string'?data.detail:'Tải tệp thất bại. Thử lại.');
  };
  xhr.onerror=()=>complete(null,'Mất kết nối khi tải tệp.');
  xhr.ontimeout=()=>complete(null,'Kết nối quá chậm. Thử lại.');
  xhr.onabort=()=>complete(null,null,true);
  const data=new FormData();
  data.append('file',file);
  data.append('upload_key',attempt.key);
  xhr.send(data);
 });
}

function workflowAllowsAlert(ctx,message){
 const group=ctx.scope==='group';
 const item=group?state.groups.find(x=>x.id===ctx.id):state.friends.find(x=>x.other_id===ctx.id);
 if(!item)return true;
 const until=Number(item.mute_until)||0;
 if(until>Date.now()/1000)return false;
 if(group&&item.alert_mode==='mentions'){
  const id=Number(state.user.public_id);
  return id>0&&new RegExp('(?:^|[^\\p{L}\\p{N}_@])@'+id+'(?![\\p{L}\\p{N}_])','u').test(message.body||'');
 }
 return !(group?item.alert_mode==='muted'&&!until:item.muted);
}
function applyWorkflowAlerts(scope,id,mode,until){
 const group=scope==='group';
 const item=group?state.groups.find(x=>x.id===id):state.friends.find(x=>x.other_id===id);
 if(item)Object.assign(item,group?{alert_mode:mode,mute_until:until}:{muted:mode==='muted'&&!until,mute_until:until});
}
async function populateWorkflowSenders(ctx,select){
 const members=(await api('/api/groups/'+ctx.id)).members||[];
 if(!workflowCurrent(ctx)||!select?.isConnected)return;
 for(const member of members){
  if(member.user_id===ctx.owner)continue;
  const option=document.createElement('option');
  option.value=String(member.user_id);
  option.textContent=member.display_name||member.username||'Thành viên';
  select.append(option);
 }
}
function alertSettingsDialog(){
 const ctx=activeWorkflowChat();
 if(!ctx)return;
 const group=ctx.scope==='group';
 const item=group?state.groups.find(x=>x.id===ctx.id):state.friends.find(x=>x.other_id===ctx.id);
 const until=Number(item?.mute_until)||0;
 const status=until>Date.now()/1000?'Tắt đến '+deadlineDate(until):
  item?.alert_mode==='mentions'?'Chỉ khi được nhắc tên':item?.muted||item?.alert_mode==='muted'&&!until?'Đã tắt':'Đang bật';
 modal({title:'Thông báo hội thoại',description:'Hiện tại · '+status,confirm:'Lưu',
  content:`<label class="field">Nhận thông báo<select class="select" id="workflow-alert-mode">
   <option value="">Chọn cách nhận thông báo</option><option value="all">Tất cả tin nhắn</option><option value="hour">Tắt trong 1 giờ</option>
   <option value="morning">Tắt đến 08:00 sáng mai</option>
   <option value="muted">Tắt đến khi bật lại</option>
   ${group?'<option value="mentions">Chỉ khi được nhắc tên</option>':''}
   </select></label>`,handler:async host=>{
   const value=host.querySelector('#workflow-alert-mode').value;
   if(!value)throw Error('Chọn cách nhận thông báo trước khi lưu.');
   let at=0;
   if(value==='hour')at=Math.floor(Date.now()/1000)+3600;
   if(value==='morning'){
    const tomorrow=new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    tomorrow.setHours(8,0,0,0);
    at=Math.floor(tomorrow.getTime()/1000);
   }
   const mode=at?'muted':value;
   const saved=await api(`/api/chats/${ctx.scope}/${ctx.id}/alerts`,{method:'PUT',data:{mode,until:at}});
   if(state.user?.id!==ctx.owner)return;
   applyWorkflowAlerts(ctx.scope,ctx.id,saved.mode,saved.until);
   toast('Đã lưu thông báo hội thoại.','ok');
  }});
}
async function groupMentionDialog(){
 const ctx=activeWorkflowChat();
 if(ctx?.scope!=='group')return;
 const result=await api('/api/groups/'+ctx.id);
 if(!workflowCurrent(ctx))return;
 const members=result.members.filter(member=>member.user_id!==ctx.owner&&member.public_id);
 if(!members.length){toast('Không có thành viên khác để nhắc.','info');return;}
 modal({title:'Nhắc tên trong nhóm',description:'Thành viên được chọn sẽ nhận thông báo nếu đã bật thông báo nhắc tên.',
  content:`<label class="field">Thành viên<select class="select" id="workflow-mention-user">
   ${members.map(member=>`<option value="${Number(member.public_id)}">${esc(member.display_name||member.username)}</option>`).join('')}</select></label>`,
  confirm:'Chèn nhắc tên',handler:host=>{
   if(!workflowCurrent(ctx))return;
   const input=$('#chat-text'),id=Number(host.querySelector('#workflow-mention-user').value);
   if(!input||!id)return;
   const token=' @'+id+' ';
   if(input.value.length+token.length>input.maxLength)throw Error('Tin nhắn đã đạt giới hạn ký tự.');
   input.setRangeText(token,input.selectionStart,input.selectionEnd,'end');
   input.dispatchEvent(new Event('input',{bubbles:true}));
   requestAnimationFrame(()=>input.focus({preventScroll:true}));
  }});
}

document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-workflow-next],[data-workflow-alert],[data-workflow-mention],[data-workflow-upload]');
 if(!button)return;
 try{
  if(button.hasAttribute('data-workflow-next'))await nextChatPage(button);
  if(button.hasAttribute('data-workflow-alert'))alertSettingsDialog();
  if(button.hasAttribute('data-workflow-mention'))await groupMentionDialog();
  const action=button.dataset.workflowUpload,attempt=workflowUpload;
  if(action&&attempt&&workflowCurrent(attempt.ctx)){
   if(action==='retry')await sendAttachment(attempt.file,attempt.ctx,attempt);
   else if(attempt.status==='busy')attempt.xhr.abort();
   else {workflowUpload=null;repaintUploadPanel();}
  }
 }catch(error){toast(error.message,'error');}
});
