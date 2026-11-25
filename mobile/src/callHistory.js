'use strict';
// Session-scoped call metadata. Never record media, SDP or private credentials.
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
const STATUSES=['completed','interrupted','missed','declined','failed','cancelled','unanswered'];
// Compact numeric tuples omit names, recordings, SDP, tokens, phone numbers.
// A conservative 1800 ASCII-byte budget keeps each SecureStore value small.
function encodeCallHistory(rows){
  const tuples=[];
  for(const item of rows.slice(0,60)){
    const status=STATUSES.indexOf(item.status);
    if(!Number.isSafeInteger(item.peerId)||item.peerId<=0||!Number.isSafeInteger(item.startedAt)||item.startedAt<=0||status<0)continue;
    const duration=Number.isSafeInteger(item.duration)?Math.max(0,Math.min(item.duration,604800)):0;
    const tuple=[item.peerId,item.startedAt,item.direction==='incoming'?1:0,item.video?1:0,status,duration];
    if(JSON.stringify([...tuples,tuple]).length>1800)break;
    tuples.push(tuple);
  }
  return JSON.stringify(tuples);
}
function decodeCallHistory(raw){
  if(!raw)return [];
  if(typeof raw!=='string'||raw.length>1800)throw Error('Invalid history vault');
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows))throw Error('Invalid history vault');
  return rows.slice(0,60).filter(row=>Array.isArray(row)&&row.length===6&&row.every(Number.isSafeInteger)&&row[0]>0&&row[1]>0&&[0,1].includes(row[2])&&[0,1].includes(row[3])&&row[4]>=0&&row[4]<STATUSES.length&&row[5]>=0&&row[5]<=604800)
    .map(([peerId,startedAt,direction,video,status,duration])=>({peerId,startedAt,direction:direction?'incoming':'outgoing',video:!!video,status:STATUSES[status],duration,title:'Liên hệ #'+peerId}));
}
module.exports={finishCall,appendCallHistory,formatCallDuration,callStatusLabel,encodeCallHistory,decodeCallHistory};
