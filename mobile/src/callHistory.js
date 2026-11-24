'use strict';
// Ephemeral session history. Never record media, SDP or private credentials.
function finishCall(call,reason,now){
  if(!call||!Number.isSafeInteger(call.peerId)||!call.startedAt)return null;
  const connected=Number.isFinite(call.connectedAt)&&call.connectedAt>0;
  let status;
  if(connected)status=reason==='network'?'interrupted':'completed';
  else if(reason==='declined')status='declined';
  else if(reason==='failed'||reason==='network')status='failed';
  else if(call.direction==='incoming')status='missed';
  else status=reason==='ended'||reason==='background'?'cancelled':'unanswered';
  return {peerId:call.peerId,title:String(call.title||'Bạn bè'),video:!!call.video,
    direction:call.direction==='incoming'?'incoming':'outgoing',startedAt:call.startedAt,
    duration:connected?Math.max(0,Math.floor((now-call.connectedAt)/1000)):0,status};
}
function appendCallHistory(history,entry){return [entry,...history].slice(0,60);}
function formatCallDuration(seconds){const n=Math.max(0,Math.floor(seconds)||0);const h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;return (h?String(h)+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function callStatusLabel(status){return ({completed:'Đã kết thúc',interrupted:'Mất kết nối',missed:'Cuộc gọi nhỡ',declined:'Đã từ chối',failed:'Kết nối thất bại',cancelled:'Đã hủy',unanswered:'Không trả lời'})[status]||'Đã kết thúc';}
module.exports={finishCall,appendCallHistory,formatCallDuration,callStatusLabel};
