import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {encodeCallHistory,decodeCallHistory,appendCallHistory} from './callHistory';

const retired=new Set();
let queue=Promise.resolve();
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
async function keyFor(token){
  if(!token)throw Error('Missing session');
  return 'mtunz-call-history-v1-'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'mtunz-call-history:'+token);
}
function serial(work){
  const result=queue.catch(()=>{}).then(work);
  queue=result.catch(()=>{});
  return result;
}
export function readCallVault(token){
  return serial(async()=>{const key=await keyFor(token);return retired.has(key)?[]:decodeCallHistory(await SecureStore.getItemAsync(key,options));});
}
export function appendCallVault(token,record){
  return serial(async()=>{
    const key=await keyFor(token);
    if(retired.has(key))return [];
    const rows=decodeCallHistory(await SecureStore.getItemAsync(key,options));
    const raw=encodeCallHistory(appendCallHistory(rows,record));
    await SecureStore.setItemAsync(key,raw,options);
    return decodeCallHistory(raw);
  });
}
export function clearCallVault(token){
  return serial(async()=>{const key=await keyFor(token);await SecureStore.deleteItemAsync(key,options);});
}
export function retireCallVault(token){
  return serial(async()=>{const key=await keyFor(token);retired.add(key);await SecureStore.deleteItemAsync(key,options);});
}
