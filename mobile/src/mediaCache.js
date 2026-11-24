import * as Crypto from 'expo-crypto';
import {File,Paths} from 'expo-file-system';
import {cacheCandidates,summarizeCache} from './cacheRules';

const active=new Set(),retired=new Set();
async function scopeOf(token){
  if(typeof token!=='string'||!token)throw Error('Phiên đăng nhập không hợp lệ.');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'mtunz-media-cache-v2:'+token);
}
function safeName(name){
  return String(name||'attachment').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,95)||'attachment';
}
function inventory(){
  return Paths.cache.list().filter(entry=>entry instanceof File).map(file=>({
    name:file.name,uri:file.uri,size:file.size,isFile:true,file
  }));
}
function erase(file){
  if(file.exists)file.delete();
}
export async function withTemporaryMedia(token,id,name,work){
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Mã tệp không hợp lệ.');
  const scope=await scopeOf(token);
  if(retired.has(scope))throw Error('Phiên đăng nhập đã kết thúc.');
  // A fresh path for each authorized request. Never trust a previous cached
  // response after the server has revoked access or the session has changed.
  const file=new File(Paths.cache,'mtunz-media-v2-'+scope+'-'+Crypto.randomUUID()+'-'+id+'-'+safeName(name));
  active.add(file.uri);
  try{
    const result=await work(file);
    if(retired.has(scope))throw Error('Phiên đăng nhập đã kết thúc.');
    return result;
  }catch(error){try{erase(file);}catch{}throw error;}
  finally{
    active.delete(file.uri);
    if(retired.has(scope)){try{erase(file);}catch{}}
  }
}
export async function inspectMediaCache(token){
  const scope=await scopeOf(token);
  return summarizeCache(cacheCandidates(inventory(),scope,active,true));
}
export async function clearMediaCache(token){
  const scope=await scopeOf(token);
  const candidates=cacheCandidates(inventory(),scope,active,true);
  let removed=0,failed=0;
  for(const item of candidates){
    try{erase(item.file);removed++;}catch{failed++;}
  }
  return {removed,failed};
}
export async function retireMediaCache(token){
  const scope=await scopeOf(token);
  retired.add(scope);
  return clearMediaCache(token);
}
