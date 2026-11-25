'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mtunz-push-config-'));
const file=path.join(folder,'google-services.json');
const config={
  project_info:{project_number:'123456789012',project_id:'mtunz-push-test'},
  client:[{client_info:{
    mobilesdk_app_id:'1:123456789012:android:abcdef',
    android_client_info:{package_name:'com.mtunz.web'}},
    api_key:[{current_key:'test-public-api-key'}]}],
};
const validProject='db3027fd-fd0a-4a71-a4f9-14e21b59c0bc';
function check(env,ok){
  const result=cp.spawnSync(process.execPath,['mobile/tools/verify_push_release.cjs'],{
    cwd:root,encoding:'utf8',env:{...process.env,EXPO_PROJECT_ID:validProject,
      GOOGLE_SERVICES_FILE:file,EXPO_FCM_V1_READY:'true',...env}});
  assert.equal(result.status,ok?0:1,
    'Expected push release validation '+(ok?'success':'failure')+': '+result.stderr);
}
try{
  fs.writeFileSync(file,JSON.stringify(config));
  check({},true);
  check({EXPO_PROJECT_ID:''},false);
  check({EXPO_FCM_V1_READY:''},false);
  check({GOOGLE_SERVICES_FILE:''},false);
  config.client[0].client_info.android_client_info.package_name='com.mtunz.web.preview';
  fs.writeFileSync(file,JSON.stringify(config));
  check({},false);
  config.client[0].client_info.android_client_info.package_name='com.mtunz.web';
  delete config.project_info.project_number;
  fs.writeFileSync(file,JSON.stringify(config));
  check({},false);
}finally{fs.rmSync(folder,{recursive:true,force:true});}
const mobile=fs.readFileSync(path.join(root,'mobile/src/Messenger.js'),'utf8');
const backend=fs.readFileSync(path.join(root,'mobile_push.py'),'utf8');
assert(mobile.includes("data.kind==='support_reply'"),'Tap native support push must open ticket');
assert(backend.includes("kind=='support_reply'"),'Backend must enforce ticket owner for push');
assert(backend.includes("'support_reply':'Quản trị viên"));
const pushPanel=fs.readFileSync(path.join(root,'mobile/src/DevicePushSettings.js'),'utf8');
assert(pushPanel.includes('const readyForPush=isPushConfigured()'), 'Native push must check EAS identity');
assert(pushPanel.includes('const actions=!readyForPush?[]:'), 'No push enable button in NO-FCM builds');
assert(pushPanel.includes('chưa kết nối Firebase/Expo Push'), 'Explicit warning for NO-FCM RC');
assert(backend.includes('EXPO_RECEIPTS_GATEWAY'), 'Must request delivery receipts from Expo');
assert(backend.includes('mobile_push_receipts'), 'Persist push receipts across backend restarts');
assert(backend.includes("code=='DeviceNotRegistered'"), 'Prune invalid tokens after receipts');
assert(backend.includes('RECEIPT_MIN_AGE_SECONDS = 15 * 60'), 'Allow Expo enough receipt time');
console.log('FCM/Expo signing, native push readiness and receipt checks passed');

const {MESSAGE_CATEGORY,QUICK_REPLY,OPEN_CHAT,parsePushResponse,combineReplyDraft}=require('../mobile/src/notificationActions');
const binding='a'.repeat(64),response={actionIdentifier:QUICK_REPLY,userText:'  Xin chào  ',notification:{request:{content:{data:{kind:'dm',chat_id:42,session_binding:binding}}}}};
assert.deepEqual(parsePushResponse(response,binding,'default'),{kind:'dm',scope:'dm',chatId:42,text:'Xin chào'});
assert.equal(parsePushResponse(response,'b'.repeat(64),'default'),null);
assert.equal(parsePushResponse({...response,userText:' '.repeat(5)},binding,'default'),null);
assert.equal(parsePushResponse({...response,userText:'a'.repeat(2001)},binding,'default'),null);
assert.equal(parsePushResponse({...response,actionIdentifier:'untrusted'},binding,'default'),null);
assert.equal(combineReplyDraft('old','new'),'old\nnew');assert.equal(combineReplyDraft('x'.repeat(2000),'new'),null);
assert(pushPanel.includes('setNotificationCategoryAsync(MESSAGE_CATEGORY'));
assert(pushPanel.includes('opensAppToForeground:true'));
assert(backend.includes(MESSAGE_CATEGORY)&&backend.includes('session_binding'));
assert(mobile.includes('clearLastNotificationResponseAsync')&&mobile.includes('combineReplyDraft'));
console.log('Notification actions, session binding, draft-only quick reply: PASS');

const {MESSAGE_CHANNEL,summarizeNotificationChannel}=require('../mobile/src/notificationPreferences');
assert.equal(MESSAGE_CHANNEL,'messages');
assert.deepEqual(summarizeNotificationChannel(false,null),{permission:'denied',channel:'missing',sound:'unknown',vibration:'unknown'});
assert.deepEqual(summarizeNotificationChannel(true,{importance:0,sound:null,enableVibrate:false}),{permission:'allowed',channel:'blocked',sound:'silent',vibration:'off'});
assert.deepEqual(summarizeNotificationChannel(true,{importance:4,sound:'custom',enableVibrate:true}),{permission:'allowed',channel:'configured',sound:'custom',vibration:'on'});
assert.equal(summarizeNotificationChannel(null,{}).sound,'unknown');
assert(pushPanel.includes('getNotificationChannelAsync(MESSAGE_CHANNEL)')&&!pushPanel.includes('deleteNotificationChannelAsync'));
assert(pushPanel.includes('enablePush(token,{prompt:false,split:result.split_channels===true})')&&pushPanel.includes('operationBusy.current'));
assert(backend.includes("'channelId':'messages'"));
console.log('Android notification diagnostics, retained channel preferences and no background permission prompt: PASS');

const {SPLIT_CHANNELS}=require('../mobile/src/notificationPreferences');
assert.deepEqual(SPLIT_CHANNELS.map(x=>x.id),['mtunz-support-v1','mtunz-admin-v1']);
assert(pushPanel.includes('split_channels:useSplit')&&pushPanel.includes('Bật phân loại')&&pushPanel.includes('getNotificationChannelAsync(channel.id)'));
for(const id of SPLIT_CHANNELS.map(x=>x.id))assert(backend.includes(id));
assert(backend.includes('split_channels: bool = False')&&backend.includes('sc.session_hash=p.session_hash'));
console.log('Opt-in separate Android notification channels, backward compatibility: PASS');

const {parseAdminPushResponse}=require('../mobile/src/notificationActions');
const adminNotice={actionIdentifier:'default',notification:{request:{content:{data:{kind:'registration',session_binding:binding}}}}};
assert.equal(parseAdminPushResponse(adminNotice,binding,'default'),'registrations');
assert.equal(parseAdminPushResponse(adminNotice,'b'.repeat(64),'default'),null);
assert.equal(parseAdminPushResponse({...adminNotice,actionIdentifier:QUICK_REPLY},binding,'default'),null);
assert.equal(parseAdminPushResponse(null,binding,'default'),null);
const adminPanel=fs.readFileSync(path.join(root,'mobile/src/AdminDashboard.js'),'utf8');
assert(adminPanel.includes('parseAdminPushResponse(response,await binding')&&adminPanel.includes("else {setPin('');stop();}"));
console.log('Admin push session binding and background PIN clearing: PASS');
