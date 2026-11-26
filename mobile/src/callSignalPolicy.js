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
function validDescription(signal,type){
  return !!signal&&signal.type===type&&typeof signal.sdp==='string'&&signal.sdp.length>0&&signal.sdp.length<14000;
}
// Local ICE can arrive while setLocalDescription is still pending. Send
// description first, then candidates, so the receiver has a matching call.
function createLocalIceGate(send,limit=50){
  let state='pending',queue=[];
  const push=signal=>{
    if(state==='closed'||!validIce(signal))return false;
    if(state==='ready')return send(signal);
    if(queue.length>=limit)return false;
    queue.push(signal);return true;
  };
  const release=()=>{
    if(state!=='pending')return state==='ready';
    state='ready';const items=queue;queue=[];
    for(const signal of items){if(!send(signal)){state='closed';return false;}}
    return true;
  };
  const close=()=>{state='closed';queue=[];};
  return {push,release,close};
}
module.exports={INVITE_TIMEOUT_MS,secondsRemaining,offerDisposition,validIce,freshIce,validDescription,createLocalIceGate};
