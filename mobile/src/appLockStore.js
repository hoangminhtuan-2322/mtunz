import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {lockFlag} from './appLockPolicy';

const retired=new Set();
const auth={requireAuthentication:true,authenticationPrompt:'Xác minh sinh trắc học để mở mtunz',keychainService:'mtunz.biometric.gate.v1',keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
const plain={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
async function keys(token){
  if(!token)throw Error('Phiên đăng nhập không hợp lệ.');
  const scope=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'mtunz-app-lock:'+token);
  return {scope,flag:'mtunz-lock-enabled-'+scope,proof:'mtunz-lock-proof-'+scope};
}
export function canUseAppLock(){try{return SecureStore.canUseBiometricAuthentication()===true;}catch{return false;}}
export async function readAppLock(token){
  const k=await keys(token);
  const value=lockFlag(await SecureStore.getItemAsync(k.flag,plain));
  if(value===null)throw Error('Không đọc được trạng thái khóa.');
  return value;
}
export async function verifyAppLock(token){
  const k=await keys(token);
  if(retired.has(k.scope))return false;
  const value=await SecureStore.getItemAsync(k.proof,auth);
  return !retired.has(k.scope)&&value==='mtunz-unlock-v1';
}
export async function enableAppLock(token){
  if(!canUseAppLock())throw Error('Hãy thiết lập vân tay hoặc sinh trắc học đủ mạnh trong cài đặt Android.');
  const k=await keys(token);
  if(retired.has(k.scope))throw Error('Phiên đã kết thúc.');
  // Android SecureStore requires system authentication for protected operations.
  await SecureStore.setItemAsync(k.proof,'mtunz-unlock-v1',auth);
  if(retired.has(k.scope))throw Error('Phiên đã kết thúc.');
  await SecureStore.setItemAsync(k.flag,'enabled',plain);
  if(retired.has(k.scope)){await retireAppLock(token);throw Error('Phiên đã kết thúc.');}
}
export async function disableAppLock(token){
  if(!await verifyAppLock(token))throw Error('Không thể xác minh. Hãy đăng nhập lại nếu đã đổi sinh trắc học.');
  const k=await keys(token);
  await SecureStore.deleteItemAsync(k.flag,plain);
  await SecureStore.deleteItemAsync(k.proof,auth).catch(()=>{});
}
export async function retireAppLock(token){
  const k=await keys(token);retired.add(k.scope);
  await SecureStore.deleteItemAsync(k.flag,plain);
  await SecureStore.deleteItemAsync(k.proof,auth).catch(()=>{});
}
