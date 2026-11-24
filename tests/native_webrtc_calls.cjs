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
