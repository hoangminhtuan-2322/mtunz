import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {sanitizeDrafts} from './inboxTools';

const retired=new Set();
let queue=Promise.resolve();
async function vaultKey(token){
  if(!token)throw Error('Missing session');
  return 'mtunz-drafts-v1-'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,token);
}
function serialize(work){
  const next=queue.catch(()=>{}).then(work);
  queue=next.catch(()=>{});
  return next;
}
export function readDraftVault(token){
  return serialize(async()=>{
    const key=await vaultKey(token);
    if(retired.has(key))return {};
    const raw=await SecureStore.getItemAsync(key);
    try{return sanitizeDrafts(JSON.parse(raw||'{}'));}catch{return {};}
  });
}
export function writeDraftVault(token,drafts){
  const safe=sanitizeDrafts(drafts);
  return serialize(async()=>{
    const key=await vaultKey(token);
    if(retired.has(key))return;
    if(!Object.keys(safe).length){await SecureStore.deleteItemAsync(key);return;}
    await SecureStore.setItemAsync(key,JSON.stringify(safe),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  });
}
export function clearDraftVault(token){
  if(!token)return Promise.resolve();
  return serialize(async()=>{const key=await vaultKey(token);retired.add(key);await SecureStore.deleteItemAsync(key);});
}
