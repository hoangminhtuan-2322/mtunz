'use strict';
// Deliberately recognize only the file names created by the app's media helpers.
// Never traverse or delete a directory, app database, chosen upload, or document.
const SCOPED=/^mtunz-media-v2-([a-f0-9]{64})-([a-f0-9-]{36})-([1-9]\d{0,15})-(.+)$/i;
const LEGACY=/^mtunz-(?:preview-)?[1-9]\d{0,15}-.+$/;
function cacheFileOwner(name){
  if(typeof name!=='string'||/[\/\\\x00-\x1f]/.test(name))return null;
  const m=SCOPED.exec(name);
  return m?m[1].toLowerCase():LEGACY.test(name)?'legacy':null;
}
function summarizeCache(items){
  return items.reduce((out,item)=>({count:out.count+1,bytes:out.bytes+(Number.isFinite(item.size)&&item.size>0?item.size:0)}),{count:0,bytes:0});
}
function cacheCandidates(items,scope,active,legacy=false){
  return items.filter(item=>item.isFile===true&&!active.has(item.uri)&&
    (cacheFileOwner(item.name)===scope||(legacy&&cacheFileOwner(item.name)==='legacy')));
}
function formatCacheBytes(bytes){
  return bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':bytes>=1024?(bytes/1024).toFixed(1)+' KB':bytes+' B';
}
module.exports={cacheFileOwner,cacheCandidates,summarizeCache,formatCacheBytes};
