'use strict';
// Fixed local presets: no remote URLs, account data, or media permissions.
const CHAT_BACKGROUNDS=Object.freeze([
  {id:'midnight',label:'Mặc định',color:'#071320'},
  {id:'ocean',label:'Đại dương',color:'#10334b'},
  {id:'forest',label:'Rừng xanh',color:'#16362d'},
  {id:'plum',label:'Tím đêm',color:'#33213f'},
  {id:'sand',label:'Cát sáng',color:'#e8decc'},
  {id:'mist',label:'Sương sáng',color:'#e3edf5'},
].map(Object.freeze));
function chatBackground(id){return CHAT_BACKGROUNDS.find(option=>option.id===id)||CHAT_BACKGROUNDS[0];}
const validRoomKey=key=>typeof key==='string'&&/^(dm|group|world):[1-9]\d{0,15}$/.test(key);
const validBackground=id=>CHAT_BACKGROUNDS.some(option=>option.id===id);
const MAX_ROOM_BACKGROUNDS=48;
function sanitizeRoomBackgrounds(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  return Object.fromEntries(Object.entries(raw).filter(([key,id])=>validRoomKey(key)&&validBackground(id)).slice(-MAX_ROOM_BACKGROUNDS));
}
function roomBackgroundId(preferences,key,fallback){
  return validRoomKey(key)&&Object.prototype.hasOwnProperty.call(preferences,key)&&validBackground(preferences[key])?preferences[key]:chatBackground(fallback).id;
}
function changeRoomBackground(preferences,key,id){
  const next=sanitizeRoomBackgrounds(preferences);
  if(!validRoomKey(key)||(id!==null&&!validBackground(id)))throw Error('Invalid chat appearance');
  delete next[key];
  if(id!==null){
    if(Object.keys(next).length>=MAX_ROOM_BACKGROUNDS)throw Error('Wallpaper limit reached');
    next[key]=id;
  }
  return next;
}
module.exports={CHAT_BACKGROUNDS,chatBackground,validRoomKey,sanitizeRoomBackgrounds,roomBackgroundId,changeRoomBackground,MAX_ROOM_BACKGROUNDS};
