import * as SecureStore from 'expo-secure-store';
import {chatBackground} from './chatAppearance';
const KEY='mtunz-chat-background-v1';
let queue=Promise.resolve();
function serialize(work){const next=queue.catch(()=>{}).then(work);queue=next.catch(()=>{});return next;}
export function readChatBackground(){return serialize(async()=>chatBackground(await SecureStore.getItemAsync(KEY)).id);}
export function saveChatBackground(id){return serialize(()=>SecureStore.setItemAsync(KEY,chatBackground(id).id,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}));}
