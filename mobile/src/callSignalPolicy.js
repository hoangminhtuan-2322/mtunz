'use strict';
const INVITE_TIMEOUT_MS=45000;
function secondsRemaining(startedAt,now){return Math.max(0,Math.min(45,Math.ceil((startedAt+INVITE_TIMEOUT_MS-now)/1000)));}
function offerDisposition({friend,active,invite,starting,peerId,signal}){
  if(!signal||signal.type!=='offer'||typeof signal.sdp!=='string'||!signal.sdp||signal.sdp.length>=14000)return 'ignore';
  if(active?.peerId===peerId||invite?.peerId===peerId)return 'ignore';
  if(!friend||active||invite||starting)return 'decline';
  return 'invite';
}
function validIce(signal){return !!signal&&typeof signal.candidate==='string'&&signal.candidate.length<=8192&&(signal.sdpMid==null||typeof signal.sdpMid==='string'&&signal.sdpMid.length<=128)&&(signal.sdpMLineIndex==null||Number.isInteger(signal.sdpMLineIndex)&&signal.sdpMLineIndex>=0&&signal.sdpMLineIndex<=128);}
function freshIce(items,now){return (items||[]).filter(item=>item&&now-item.at>=0&&now-item.at<=INVITE_TIMEOUT_MS&&validIce(item.signal));}
module.exports={INVITE_TIMEOUT_MS,secondsRemaining,offerDisposition,validIce,freshIce};
