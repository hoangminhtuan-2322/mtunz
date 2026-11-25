import * as SecureStore from 'expo-secure-store';
import {chatBackground,sanitizeRoomBackgrounds,changeRoomBackground} from './chatAppearance';
import {normalizeTheme} from './messengerTheme';
const KEY='mtunz-chat-background-v1';
let queue=Promise.resolve();
function serialize(work){const next=queue.catch(()=>{}).then(work);queue=next.catch(()=>{});return next;}
export function readChatBackground(){return serialize(async()=>chatBackground(await SecureStore.getItemAsync(KEY)).id);}
export function saveChatBackground(id){return serialize(()=>SecureStore.setItemAsync(KEY,chatBackground(id).id,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}));}

// Keep overrides isolated by account. The shared global color remains a device preference.
function roomKey(userId){
  const id=String(userId);
  if(!/^[1-9]\d{0,15}$/.test(id))throw Error('Invalid appearance account');
  return 'mtunz-room-background-v1-'+id;
}
async function loadRooms(key){
  const raw=await SecureStore.getItemAsync(key);
  try{return sanitizeRoomBackgrounds(JSON.parse(raw||'{}'));}catch{return {};}
}
export function readRoomBackgrounds(userId){return serialize(()=>loadRooms(roomKey(userId)));}
export function saveRoomBackground(userId,key,id){
  return serialize(async()=>{
    const storageKey=roomKey(userId);
    const next=changeRoomBackground(await loadRooms(storageKey),key,id);
    if(Object.keys(next).length)await SecureStore.setItemAsync(storageKey,JSON.stringify(next),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    else await SecureStore.deleteItemAsync(storageKey);
    return next;
  });
}

const THEME_KEY='mtunz-messenger-theme-v1';
export function readMessengerTheme(){return serialize(async()=>normalizeTheme(await SecureStore.getItemAsync(THEME_KEY)));}
export function saveMessengerTheme(mode){return serialize(()=>SecureStore.setItemAsync(THEME_KEY,normalizeTheme(mode),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}));}
