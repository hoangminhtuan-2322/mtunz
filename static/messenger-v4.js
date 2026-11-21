/* mtunz Messenger V4 — voice notes, scheduled sending, drafts and retry UX.
   Audio player is mounted outside #app so playback continues across chats.
   Session drafts are limited to this tab; no password, PIN or cookie storage. */
'use strict';
const v4FailedSends=new Map();
const v4DraftTimers=new Map();
let v4Recording=null,v4VoicePreview=null,v4VoiceURL=null,v4Audio=null,v4AudioPanel=null,v4PlayingUrl='';
let v4VoiceAudioContext=null,v4VoiceSignal=[],v4VoiceRecordingTimer=null;
const v4MaxRecordingMs=120000;
const v4WaveDefault='57789abbccddcba9876556789abcb987';

function v4Nonce(){
 const bytes=new Uint8Array(16);
 crypto.getRandomValues(bytes);
 return 'c_'+Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
}
function v4ChatKey(){
 if(!state.user||state.user.is_admin)return '';
 if(state.tab==='messages'&&state.selected)return 'dm:'+state.selected;
 if(state.tab==='groups'&&state.groupSelected)return 'group:'+state.groupSelected;
 return '';
}
function v4DraftStorageKey(){return 'mtunz.v4.drafts.'+Number(state.user?.id||0);}
function v4ReadAllDrafts(){
 if(!state.user||state.user.is_admin)return {};
 try{const data=JSON.parse(sessionStorage.getItem(v4DraftStorageKey())||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}
}
function v4ReadDraft(scope,id){
 const k=scope+':'+id;
 const value=v4ReadAllDrafts()[k];
 return typeof value==='string'?value.slice(0,2000):'';
}
function v4WriteDraft(chat,value){
 if(!chat||!state.user||state.user.is_admin)return;
 clearTimeout(v4DraftTimers.get(chat));v4DraftTimers.delete(chat);
 try{
  const data=v4ReadAllDrafts();
  if(value)data[chat]=String(value).slice(0,2000);else delete data[chat];
  const keys=Object.keys(data);
  if(keys.length>25)keys.slice(0,keys.length-25).forEach(k=>delete data[k]);
  sessionStorage.setItem(v4DraftStorageKey(),JSON.stringify(data));
  if(state.inboxFilter==='drafts')renderSideItems();
 }catch{/* Private browsing or disabled storage must not break sending. */}
}
function v4WaveformHtml(waveform){
 const values=typeof waveform==='string'&&/^[0-9a-f]{8,80}$/.test(waveform)?waveform:v4WaveDefault;
 return '<span class="v4-waveform" aria-hidden="true">'+Array.from(values.slice(0,40),digit=>
    '<i style="--v4-level:'+(5+parseInt(digit,16)*2)+'px"></i>').join('')+'</span>';
}
function v4DurationText(ms){
 const secs=Math.ceil(Math.max(0,Number(ms)||0)/1000);
 return String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
}
function v4AudioMarkup(file){
 if(!file||!String(file.mime||'').startsWith('audio/'))return '';
 // The URL is always an authenticated attachment endpoint, never user-supplied.
 const url='/api/attachments/'+Number(file.id);
 return '<div class="v4-audio-bubble" data-v4-audio-id="'+Number(file.id)+'">'+
  '<button class="v4-play-circle" type="button" data-v4-act="audio-play" data-v4-url="'+url+'" data-v4-title="'+esc(file.name||'Tin nhắn thoại')+'" aria-label="Phát tin nhắn thoại">▶</button>'+
  '<div class="v4-audio-wave-wrap">'+v4WaveformHtml(file.waveform)+
   '<small>🎙️ '+v4DurationText(file.duration_ms||0)+' · Chạm để nghe</small></div>'+
  '<button class="v4-speed" type="button" data-v4-act="audio-speed" title="Đổi tốc độ phát">1×</button>'+
 '</div>';
}
function v4VoiceComposer(){
 const ctx=v4ChatKey();
 if(v4Recording&&v4Recording.chat===ctx)
  return '<div class="v4-record-widget"><span class="v4-record-dot"></span><strong>Đang thu âm</strong><span id="v4-record-clock">00:00</span>'+
    '<button type="button" class="btn ghost sm" data-v4-act="record-stop">Dừng & nghe thử</button>'+
    '<button type="button" class="btn ghost sm" data-v4-act="record-cancel">Hủy</button></div>';
 if(v4VoicePreview&&v4VoicePreview.chat===ctx)
  return '<div class="v4-record-widget v4-record-preview"><div class="v4-record-preview-head">'+
    '<strong>🎤 Nghe thử trước khi gửi</strong><small>'+v4DurationText(v4VoicePreview.duration_ms)+'</small></div>'+
    v4WaveformHtml(v4VoicePreview.waveform)+
    '<div class="v4-record-buttons">'+
      '<button type="button" class="btn ghost sm" data-v4-act="preview-play">▶ Nghe thử</button>'+
      '<button type="button" class="btn primary sm" data-v4-act="voice-send">Gửi thoại</button>'+
      '<button type="button" class="btn ghost sm" data-v4-act="record-cancel">Xóa bản ghi</button></div></div>';
 return '';
}
function v4RecorderMime(){
 if(!window.MediaRecorder)return '';
 const options=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm','audio/ogg'];
 return options.find(x=>MediaRecorder.isTypeSupported(x))||'';
}
async function v4WaveFromBlob(blob){
 try{
  const buffer=await blob.arrayBuffer();
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  let decoded;
  try{decoded=await ctx.decodeAudioData(buffer);}finally{ctx.close().catch(()=>{});}
  const samples=decoded.getChannelData(0),slots=32,step=Math.max(1,Math.floor(samples.length/slots));
  const raw=[];
  for(let i=0;i<slots;i++){
   const start=i*step,end=Math.min(samples.length,start+step);
   let amplitude=0,count=0;
   for(let k=start;k<end;k+=Math.max(1,Math.floor(step/80))){
    amplitude+=Math.abs(samples[k]);count++;
   }
   raw.push(count?amplitude/count:0);
  }
  const peak=Math.max(0.015,...raw);
  return raw.map(x=>Math.min(15,Math.max(1,Math.round(Math.sqrt(x/peak)*15))).toString(16)).join('');
 }catch{return v4WaveDefault;}
}
function v4RenderRecorder(){
 const box=document.getElementById('compose-extra');
 if(box)box.innerHTML=composerExtras();
}
async function v4StartRecording(){
 if(v4Recording)return v4StopRecording();
 const chat=v4ChatKey();
 if(!chat)throw Error('Hãy mở một cuộc trò chuyện để ghi âm.');
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)
  throw Error('Trình duyệt chưa hỗ trợ ghi âm. Hãy sử dụng Chrome hoặc Safari phiên bản mới trên HTTPS.');
 const mime=v4RecorderMime();
 if(!mime)throw Error('Thiết bị không hỗ trợ định dạng ghi âm tương thích.');
 v4CancelVoice();
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
  if(chat!==v4ChatKey()){stream.getTracks().forEach(x=>x.stop());return;}
  const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:24000});
  const chunks=[],started=Date.now();
  const active={chat,stream,recorder,chunks,started,mime:recorder.mimeType||mime};
  v4Recording=active;
  recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
  recorder.onstop=async()=>{
   stream.getTracks().forEach(t=>t.stop());
   clearInterval(v4VoiceRecordingTimer);v4VoiceRecordingTimer=null;
   if(v4Recording!==active)return;
   v4Recording=null;
   if(!chunks.length){toast('Không ghi được âm thanh, vui lòng thử lại.','error');v4RenderRecorder();return;}
   const type=active.mime.split(';')[0].toLowerCase();
   const duration=Math.min(v4MaxRecordingMs,Date.now()-started);
   const blob=new Blob(chunks,{type});
   if(blob.size>1900000){toast('Bản ghi quá lớn. Hãy ghi ngắn hơn.','error');v4RenderRecorder();return;}
   const ext=type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm';
   const waveform=await v4WaveFromBlob(blob);
   if(v4ChatKey()!==chat)return;
   if(v4VoiceURL)URL.revokeObjectURL(v4VoiceURL);
   v4VoiceURL=URL.createObjectURL(blob);
   v4VoicePreview={chat,blob,file:new File([blob],'voice-'+Date.now()+'.'+ext,{type}),
                  waveform,duration_ms:duration};
   v4RenderRecorder();
  };
  recorder.start(250);
  v4VoiceRecordingTimer=setInterval(()=>{
   if(!v4Recording)return;
   const el=document.getElementById('v4-record-clock');
   if(el)el.textContent=v4DurationText(Date.now()-started);
   if(Date.now()-started>=v4MaxRecordingMs&&recorder.state==='recording')recorder.stop();
  },250);
  v4RenderRecorder();
 }catch(err){
  stream?.getTracks().forEach(t=>t.stop());
  throw Error(err?.name==='NotAllowedError'?'Cần cấp quyền micro để thu âm.':err.message||'Không thể mở micro.');
 }
}
function v4StopRecording(){
 const recorder=v4Recording?.recorder;
 if(recorder&&recorder.state==='recording')recorder.stop();
}
function v4CancelVoice(){
 if(v4Recording){
  const active=v4Recording;v4Recording=null;
  if(active.recorder.state!=='inactive')active.recorder.stop();
  active.stream.getTracks().forEach(t=>t.stop());
 }
 if(v4VoiceRecordingTimer){clearInterval(v4VoiceRecordingTimer);v4VoiceRecordingTimer=null;}
 v4VoicePreview=null;
 if(v4VoiceURL){if(v4PlayingUrl===v4VoiceURL)v4CloseAudio();URL.revokeObjectURL(v4VoiceURL);v4VoiceURL=null;}
 v4RenderRecorder();
}
async function v4SendVoice(){
 const item=v4VoicePreview,ctx=v4ChatKey();
 if(!item||item.chat!==ctx)return;
 const form=document.querySelector('form[data-form="send-message"],form[data-form="send-group-message"]');
 if(!form)throw Error('Không tìm thấy khung gửi tin.');
 if(state.uploading)throw Error('Đang tải lên tệp khác.');
 state.uploading=true;
 const btn=document.querySelector('[data-v4-act="voice-send"]');
 if(btn){btn.disabled=true;btn.textContent='Đang tải...';}
 try{
  const fd=new FormData();
  fd.append('file',item.file,item.file.name);
  fd.append('waveform',item.waveform);
  fd.append('duration_ms',String(item.duration_ms));
  const response=await fetch('/api/uploads',{method:'POST',body:fd,credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Không thể tải bản ghi âm.');
  if(ctx!==v4ChatKey())throw Error('Bạn đã chuyển cuộc trò chuyện. Bản ghi âm đã tải lên nhưng chưa gửi.');
  state.pendingAttachment=data.attachment;
  v4CancelVoice();state.uploading=false;
  v4RenderRecorder();
  form.requestSubmit();
 }catch(err){state.uploading=false;v4RenderRecorder();throw err;}
}
function v4AudioPlayer(){
 if(v4Audio)return v4Audio;
 v4Audio=new Audio();v4Audio.preload='metadata';
 v4AudioPanel=document.createElement('aside');
 v4AudioPanel.className='v4-floating-audio';v4AudioPanel.hidden=true;
 v4AudioPanel.innerHTML='<div class="v4-floating-head"><strong>🎙️ Tin nhắn thoại</strong>'+
 '<button type="button" data-v4-act="audio-close" aria-label="Đóng trình phát">×</button></div>'+
 '<div class="v4-floating-row"><button type="button" data-v4-act="audio-toggle">❚❚</button>'+
 '<div class="v4-floating-info"><span id="v4-audio-title">Đang phát</span>'+
 '<input type="range" min="0" max="1000" step="1" value="0" id="v4-audio-seek" aria-label="Tua âm thanh">'+
 '<small id="v4-audio-time">00:00 / 00:00</small></div>'+
 '<button type="button" class="v4-speed" data-v4-act="audio-speed">1×</button></div>';
 document.body.append(v4AudioPanel);
 v4Audio.addEventListener('timeupdate',v4UpdateAudioPanel);
 v4Audio.addEventListener('loadedmetadata',v4UpdateAudioPanel);
 v4Audio.addEventListener('play',v4UpdateAudioPanel);
 v4Audio.addEventListener('pause',v4UpdateAudioPanel);
 v4Audio.addEventListener('ended',v4UpdateAudioPanel);
 return v4Audio;
}
function v4UpdateAudioPanel(){
 if(!v4Audio||!v4AudioPanel)return;
 const duration=Number.isFinite(v4Audio.duration)?v4Audio.duration:0;
 const seek=v4AudioPanel.querySelector('#v4-audio-seek');
 if(seek&&!seek.matches(':active'))seek.value=String(duration?Math.round(v4Audio.currentTime/duration*1000):0);
 v4AudioPanel.querySelector('#v4-audio-time').textContent=
  v4DurationText(v4Audio.currentTime*1000)+' / '+v4DurationText(duration*1000);
 v4AudioPanel.querySelector('[data-v4-act="audio-toggle"]').textContent=v4Audio.paused?'▶':'❚❚';
 for(const button of document.querySelectorAll('.v4-speed'))
  button.textContent=v4Audio.playbackRate+'×';
}
async function v4PlayAudio(url,title){
 const player=v4AudioPlayer();
 if(v4PlayingUrl!==url){
  player.pause();player.src=url;v4PlayingUrl=url;
  player.playbackRate=1;
 }
 if(title)v4AudioPanel.querySelector('#v4-audio-title').textContent=title.slice(0,90);
 v4AudioPanel.hidden=false;
 if(player.paused){try{await player.play();}catch{toast('Không phát được tệp này. Kiểm tra kết nối và quyền xem.','error');}}
 else player.pause();
 v4UpdateAudioPanel();
}
function v4CloseAudio(){
 if(!v4Audio)return;
 v4Audio.pause();v4Audio.removeAttribute('src');v4Audio.load();v4PlayingUrl='';
 if(v4AudioPanel)v4AudioPanel.hidden=true;
}
function v4ChangeAudioSpeed(){
 const player=v4AudioPlayer();
 const speeds=[1,1.25,1.5,2],current=speeds.indexOf(player.playbackRate);
 player.playbackRate=speeds[(current+1)%speeds.length];
 v4UpdateAudioPanel();
}

function v4LocalDateTime(input){
 const dt=new Date(input);
 if(!Number.isFinite(dt.getTime()))throw Error('Ngày giờ hẹn gửi không hợp lệ.');
 return Math.floor(dt.getTime()/1000);
}
function v4DateInput(timestamp){
 const d=new Date(timestamp);
 const p=n=>String(n).padStart(2,'0');
 return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
}
async function v4ShowScheduleList(recipient){
 const out=await api('/api/scheduled-messages?recipient_id='+Number(recipient));
 const items=out.messages||[];
 const body=items.map(m=>'<div class="v4-schedule-item"><div class="v4-schedule-copy">'+
 '<strong>'+esc(m.body||'Tệp đính kèm')+'</strong>'+
 '<span class="hint">'+new Date(m.send_at*1000).toLocaleString('vi-VN',
 {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+
 (m.state==='failed'?' · Không gửi được: '+esc(m.failure_reason||'Kiểm tra quyền gửi'):' · Đang chờ')+
 '</span></div>'+ (m.state==='pending'?'<div class="v4-schedule-actions">'+
 '<button type="button" class="btn ghost sm" data-v4-act="schedule-edit" data-v4-id="'+m.id+'">Sửa</button>'+
 '<button type="button" class="btn ghost sm" data-v4-act="schedule-cancel" data-v4-id="'+m.id+'">Hủy</button></div>':'')+
 '</div>').join('')||'<p class="hint">Không có tin nhắn đang chờ hẹn giờ.</p>';
 state.v4ScheduledMessages=items;
 modal({title:'Tin nhắn đã hẹn giờ',description:'Bạn có thể chỉnh sửa hoặc hủy trước khi gửi. Nếu máy chủ đang ngủ, tin có thể được gửi trễ khi hoạt động trở lại.',
 content:'<div class="v4-schedule-list">'+body+'</div>',confirm:'Đóng',cancel:null});
}
function v4ShowScheduleDialog(item=null){
 const recipient=item?.recipient_id||state.selected;
 if(!recipient)throw Error('Hãy chọn bạn bè trước khi hẹn giờ.');
 const body=item?.body??document.getElementById('chat-text')?.value??'';
 const stamp=item?.send_at||Math.floor(Date.now()/1000)+300;
 modal({title:item?'Sửa tin nhắn hẹn giờ':'Hẹn giờ gửi tin nhắn',
 description:'Thời gian tính theo múi giờ thiết bị của bạn. Chỉ gửi khi hai người còn được phép nhắn tin.',
 confirm:item?'Lưu lịch gửi':'Lên lịch gửi',
 content:'<div class="v4-schedule-form"><div class="field"><label>Nội dung sẽ gửi</label>'+
 '<textarea id="v4-schedule-body" class="input" maxlength="2000" rows="3">'+esc(body)+'</textarea></div>'+
 '<div class="field"><label>Thời gian tự động gửi</label>'+
 '<input id="v4-schedule-at" class="input" type="datetime-local" value="'+v4DateInput(stamp)+'" required></div>'+
 '<p class="hint">Tối thiểu 20 giây, tối đa 366 ngày. Bạn có thể sửa hoặc hủy trước khi phát.</p></div>',
 handler:async host=>{
  const text=host.querySelector('#v4-schedule-body').value.trim();
  const send_at=v4LocalDateTime(host.querySelector('#v4-schedule-at').value);
  if(send_at<Math.floor(Date.now()/1000)+20)throw Error('Giờ gửi phải muộn hơn hiện tại ít nhất 20 giây.');
  if(!text&&!item?.attachment_id&&!state.pendingAttachment)throw Error('Hãy nhập nội dung để hẹn giờ.');
  if(item)await api('/api/scheduled-messages/'+item.id,{method:'PATCH',data:{body:text,send_at}});
  else{
   await post('/api/scheduled-messages',{recipient_id:recipient,body:text,send_at,
         attachment_id:state.pendingAttachment?.id||null,
         reply_to:state.replyTo?.scope==='dm'?state.replyTo.id:null});
   if(state.selected===recipient){
    const input=document.getElementById('chat-text');
    if(input)input.value='';
    v4WriteDraft('dm:'+recipient,'');
    state.pendingAttachment=null;state.replyTo=null;
    const extra=document.getElementById('compose-extra');if(extra)extra.innerHTML=composerExtras();
   }
  }
  toast(item?'Đã chỉnh sửa thời gian gửi.':'Đã lên lịch gửi tin nhắn.','ok');
 }
 });
}

function v4PaintStatuses(){
 if(!state.user)return;
 for(const m of state.messages||[]){
  if(m.sender_id!==state.user.id)continue;
  const node=document.querySelector('[data-v4-status-id="'+m.id+'"]');
  if(node){
   let label=m.failed?'⚠ Chưa gửi':m.pending?'◌ Đang gửi':m.read_at?'✓✓ Đã xem':m.delivered_at?'✓✓ Đã nhận':'✓ Đã gửi';
   node.textContent=label;
   node.title=label;
  }
 }
}
async function v4AckIncoming(message){
 if(!state.user||!message||message.sender_id===state.user.id||!Number.isSafeInteger(message.id)||message.id<=0)return;
 try{await post('/api/messages/delivered/'+message.sender_id,{up_to:message.id});}
 catch{/* A later chat-history load will retry the ACK when connectivity returns. */}
}
async function v4RetryFailed(tempId){
 const entry=v4FailedSends.get(tempId);
 if(!entry||entry.inFlight)return;
 entry.inFlight=true;
 const m=state.messages.find(x=>x.id===tempId);
 if(m){m.failed=false;m.pending=true;v4PaintStatuses();}
 try{
  const result=await post('/api/messages',entry.payload);
  v4FailedSends.delete(tempId);
  if(state.selected===entry.recipient&&state.tab==='messages'){
   state.messages=state.messages.filter(x=>x.id!==tempId);
   document.getElementById('msg-dm-'+tempId)?.remove();
   appendDirectMessage(result.message);
  }
  scheduleFriendsRefresh();
  toast(result.replayed?'Tin đã được máy chủ ghi nhận trước đó.':'Đã gửi lại thành công.','ok');
 }catch(err){
  if(m){m.failed=true;m.pending=false;v4PaintStatuses();}
  toast(err.message||'Chưa gửi lại được, vui lòng kiểm tra kết nối.','error');
 }finally{entry.inFlight=false;}
}
document.addEventListener('input',event=>{
 if(event.target.id!=='chat-text'||!state.user||state.user.is_admin)return;
 const ctx=v4ChatKey();
 if(!ctx)return;
 clearTimeout(v4DraftTimers.get(ctx));
 const owner=state.user.id,value=event.target.value;
 v4DraftTimers.set(ctx,setTimeout(()=>{if(state.user?.id===owner)v4WriteDraft(ctx,value);},250));
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-v4-act]');
 if(!button||button.disabled)return;
 try{
  const action=button.dataset.v4Act;
  if(action==='record'){await v4StartRecording();return;}
  if(action==='record-stop'){v4StopRecording();return;}
  if(action==='record-cancel'){v4CancelVoice();return;}
  if(action==='voice-send'){await v4SendVoice();return;}
  if(action==='preview-play'){
   if(!v4VoiceURL)return;
   await v4PlayAudio(v4VoiceURL,'Nghe thử bản ghi');return;
  }
  if(action==='audio-play'){await v4PlayAudio(button.dataset.v4Url,button.dataset.v4Title||'Tin nhắn thoại');return;}
  if(action==='audio-speed'){v4ChangeAudioSpeed();return;}
  if(action==='audio-close'){v4CloseAudio();return;}
  if(action==='audio-toggle'){
   if(v4Audio?.paused)await v4Audio.play();else v4Audio?.pause();return;
  }
  if(action==='schedule-new'){v4ShowScheduleDialog();return;}
  if(action==='schedule-list'){await v4ShowScheduleList(state.selected);return;}
  if(action==='schedule-edit'){
   const item=(state.v4ScheduledMessages||[]).find(x=>x.id===Number(button.dataset.v4Id));
   if(!item)return;v4ShowScheduleDialog(item);return;
  }
  if(action==='schedule-cancel'){
   const id=Number(button.dataset.v4Id);
   ask('Hủy lịch gửi','Tin nhắn sẽ không được gửi; nội dung đã lên lịch sẽ bị bỏ.',async()=>{
    await del('/api/scheduled-messages/'+id);
    toast('Đã hủy lịch gửi.','ok');await v4ShowScheduleList(state.selected);
   },'Hủy lịch',true);return;
  }
  if(action==='retry-message'){await v4RetryFailed(Number(button.dataset.v4Id));return;}
 }catch(err){toast(err.message||'Không thể thực hiện thao tác.','error');}
});
document.addEventListener('input',event=>{
 if(event.target.id==='v4-audio-seek'&&v4Audio&&Number.isFinite(v4Audio.duration)){
  v4Audio.currentTime=Number(event.target.value)/1000*v4Audio.duration;
 }
});
// Never keep microphone open when leaving its conversation.
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-act="app-tab"],[data-act="open-chat"],[data-act="open-group"],[data-act="logout"]');
 if(!target||!v4Recording)return;
 const chat=v4ChatKey();
 if(target.dataset.act==='app-tab'&&target.dataset.tab===state.tab)return;
 if(chat)v4CancelVoice();
},true);
window.addEventListener('beforeunload',()=>{if(v4Recording)v4CancelVoice();});
