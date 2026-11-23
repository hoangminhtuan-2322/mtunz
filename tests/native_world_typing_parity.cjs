'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const chat=fs.readFileSync('mobile/src/Messenger.js','utf8');
const server=fs.readFileSync('world_chat.py','utf8');
const profile=fs.readFileSync('social_profile.py','utf8');
for(const needle of [
  'world_anonymous:!social.world_anonymous',
  "anonymous_name:social.world_anonymous?worldAlias.trim():''",
  'item.display_name||item.username',
  "type:'typing',to:target.id,on",
  "type:'group-typing',group_id:target.id,on",
  "setTimeout(stopTyping,3500)",
  "setTimeout(()=>{",
  "data.type==='world-message-removed'",
  "data.type==='world-status'",
  "data.type==='world-rooms-updated'",
  "if(requested!==listRequestRef.current)return"
])assert(chat.includes(needle),'Missing native parity: '+needle);
assert(server.includes("anonymous_name:str=Field(default='',max_length=24)"));
assert(profile.includes("world_anonymous: bool|None=None"));
console.log('native world alias, event refresh and typing lifecycle assertions passed');
