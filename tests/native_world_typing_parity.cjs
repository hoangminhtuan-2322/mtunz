'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..');
const chat=fs.readFileSync(root+'/mobile/src/Messenger.js','utf8');
const server=fs.readFileSync(root+'/world_chat.py','utf8');
const profile=fs.readFileSync(root+'/social_profile.py','utf8');
for(const needle of [
  'world_anonymous:!social.world_anonymous',
  "social.world_anonymous?worldAlias.trim():''",
  'item.display_name||item.username',
  "type:'typing',to:target.id,on",
  "type:'group-typing',group_id:target.id,on",
  "setTimeout(stopTyping,3500)",
  "setTimeout(()=>{",
  "data.type==='world-message-removed'",
  "data.type==='world-status'",
  "data.type==='world-rooms-updated'",
  "if(requested!==listRequestRef.current)return",
  "data.type==='presence'",
  "uploadAttachment(token,file,nonce)"
])assert(chat.includes(needle),'Missing native parity: '+needle);
assert(server.includes("anonymous_name:str=Field(default='',max_length=24)"));
assert(profile.includes("world_anonymous: bool|None=None"));
console.log('native world alias, event refresh and typing lifecycle assertions passed');

const media=fs.readFileSync(root+'/mobile/src/media.js','utf8');
const network=fs.readFileSync(root+'/mobile/src/client.js','utf8');
const push=fs.readFileSync(root+'/mobile/src/DevicePushSettings.js','utf8');
assert(media.includes("data.append('upload_key',uploadKey)"));
assert(network.includes("signal: controller.signal"));
assert(push.includes("Notifications.getPermissionsAsync()"));
console.log('native uploads, request timeout, presence and push refresh assertions passed');

const support=fs.readFileSync(root+'/app.py','utf8');
for(const required of ["'/api/support/tickets'","sendSupportMessage","createSupportTicket",
  "data.type==='support-message'","data.type==='support-deleted'"])
  assert(chat.includes(required),'Missing native in-app support: '+required);
assert(support.includes("owner_id=u['id'] if u else None"),
  'Support must authorize with server-resolved account ownership');
console.log('native authenticated support sync assertions passed');

const pending=fs.readFileSync(root+'/mobile/src/pendingSend.js','utf8');
assert(pending.includes('anonymous_name:item.alias'));
assert(chat.includes('createPendingSend(target,draft,picked,reply?.id,social.world_anonymous?worldAlias.trim():\'\',Crypto.randomUUID())'));
assert(pending.includes('await upload(item.file,item.nonce)'));
