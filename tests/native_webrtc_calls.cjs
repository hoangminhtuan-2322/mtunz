'use strict';
// Static guard for Android-native WebRTC calling; device-to-device integration
// and restrictive-NAT TURN tests are required before general release.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('mobile/package.json'));
const config=JSON.parse(read('mobile/app.json')).expo;
const calls=read('mobile/src/NativeCall.js');
const chat=read('mobile/src/Messenger.js');
const backend=read('app.py');
assert(pkg.dependencies['react-native-webrtc'],'Native WebRTC dependency is required');
assert(pkg.dependencies['@config-plugins/react-native-webrtc'],'Expo prebuild must configure native WebRTC');
assert(config.plugins.some(p=>Array.isArray(p)&&p[0]==='@config-plugins/react-native-webrtc'),
  'Native WebRTC config plugin is missing');
for(const permission of ['RECORD_AUDIO','CAMERA','MODIFY_AUDIO_SETTINGS'])
  assert(config.android.permissions.includes(permission),'Missing Android calling permission '+permission);
for(const type of ['call-offer','call-answer','call-ice','call-hangup','call-decline']){
  assert(calls.includes(type),'Missing native call signal: '+type);
  assert(backend.includes(type),'Signaling must match the existing website/backend');
}
assert(calls.includes('RTCPeerConnection')&&calls.includes('mediaDevices.getUserMedia')&&
  calls.includes('RTCView'),'Calls must use real native camera/mic/RTC components');
assert(calls.includes('MAX_ICE=50')&&calls.includes('setRemoteDescription')&&
  calls.includes('addIceCandidate'),'Remote ICE candidate ordering and limits required');
assert(calls.includes('45000')&&calls.includes('AppState.addEventListener'),
  'Calls must time out and release resources in background');
assert(chat.includes('<NativeCallOverlay call={nativeCall}/>')&&
  chat.includes('nativeCall.startCall(room.id,roomTitle,true)')&&
  chat.includes('nativeCall.startCall(room.id,roomTitle,false)')&&
  chat.includes('onCallSignal(data)'),'Native chat must expose voice/video calls and receive signaling');
assert(calls.includes('generationRef.current!==generation')&&calls.includes('local.getTracks().forEach(track=>track.stop())'),
  'Late media permission results must not restart a cancelled call');
assert(calls.includes('inviteTimerRef.current=setTimeout')&&calls.includes('incomingRef.current===invite'),
  'Unanswered incoming invitations must expire without leaving a stale dialog');
assert(calls.includes('pendingIce.current.size>=16')&&calls.includes('queue.length<MAX_ICE'),
  'Untrusted signaling must not create unbounded candidate storage');
const workflow=read('.github/workflows/android-apk.yml');
assert(workflow.includes('-keep class com.oney.WebRTCModule.**')&&workflow.includes('-keep class org.webrtc.**'),
  'Preserve JNI class names through the Android release shrinker');
assert(workflow.includes('-dontwarn org.webrtc.Dav1dDecoder$Natives'),
  'Only suppress the known missing optional WebRTC decoder interface');
assert(!calls.includes('WebView'),'Calls must not use a browser wrapper');
console.log('Native WebRTC audio/video call source, signaling, permissions: PASS (device QA pending)');

const {finishCall,appendCallHistory,formatCallDuration}=require('../mobile/src/callHistory');
const invite={peerId:7,title:'Friend',direction:'incoming',startedAt:1000,connectedAt:null,signal:{secret:'not stored'}};
assert.equal(finishCall(invite,'timeout',50000).status,'missed');
assert.equal(finishCall(invite,'declined',2000).status,'declined');
assert.equal(finishCall({...invite,direction:'outgoing'},'timeout',50000).status,'unanswered');
const ended=finishCall({...invite,connectedAt:5000},'network',14000);
assert.equal(ended.duration,9);assert.equal(ended.status,'interrupted');assert(!('signal' in ended));
assert.equal(appendCallHistory(Array(60).fill(ended),ended).length,60);
assert.equal(formatCallDuration(3661),'1:01:01');
assert(calls.includes("endCall(true,'network')")&&calls.includes('disconnectTimer'));
assert(chat.includes("dialog==='callHistory'")&&chat.includes('nativeCall.history.filter'));
console.log('Call duration, local history, missed calls and bounded disconnect recovery: PASS');

const {encodeCallHistory,decodeCallHistory}=require('../mobile/src/callHistory');
const encoded=encodeCallHistory(Array.from({length:60},(_,i)=>({...ended,startedAt:1770000000000+i,peerId:9007199254740000-i,title:'Private title',signal:{secret:'never store'}})));
assert(encoded.length<=1800);assert(!encoded.includes('Private title')&&!encoded.includes('secret'));
const decoded=decodeCallHistory(encoded);
assert(decoded.length>0&&decoded.length<=60);assert.equal(decoded[0].peerId,9007199254740000);assert.equal(decoded[0].status,'interrupted');
assert.deepEqual(decodeCallHistory('[[0,1,1,0,0,0]]'),[]);
assert.throws(()=>decodeCallHistory('{bad'));
assert(read('mobile/src/callVault.js').includes('retired.add(key)'));
assert(read('mobile/src/client.js').includes('retireCallVault(token)'));
assert(chat.includes('callFilter')&&calls.includes('appendCallVault(token,record)'));
console.log('Encrypted local call vault, compact metadata, retention, filters and logout cleanup: PASS');

const {parsePushResponse,QUICK_REPLY,OPEN_CHAT}=require('../mobile/src/notificationActions');
const noticeBinding='a'.repeat(64),notice={actionIdentifier:'default',notification:{request:{content:{data:{kind:'call_notice',chat_id:7,session_binding:noticeBinding}}}}};
assert.deepEqual(parsePushResponse(notice,noticeBinding,'default'),{kind:'call_notice',scope:'dm',chatId:7,text:''});
assert.equal(parsePushResponse(notice,'b'.repeat(64),'default'),null);
assert.equal(parsePushResponse({...notice,actionIdentifier:QUICK_REPLY},noticeBinding,'default'),null);
assert.equal(parsePushResponse({...notice,actionIdentifier:OPEN_CHAT},noticeBinding,'default'),null);
assert(backend.includes("throttle(ws,'native-call-notice-sender',5,60")&&backend.includes("enqueue_web_push(target,'call-notice'"));
const pushBackend=read('mobile_push.py');
assert(pushBackend.includes("0<=at-body<=30")&&pushBackend.includes("kind=='call_notice'")&&pushBackend.includes("core.has_block(c,uid,chat_id)"));
assert(chat.includes("parsed.kind==='call_notice'")&&chat.includes("Nhấn nút gọi để gọi lại"));
console.log('Short-lived background call notices, callback-only routing and session binding: PASS');
