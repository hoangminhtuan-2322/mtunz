'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const src=fs.readFileSync('static/app.js','utf8');
const floor=JSON.parse(fs.readFileSync('static/android-release-floor.json','utf8'));
const start=src.indexOf('function validAndroidRelease(');
const end=src.indexOf('// ==== Centralized interactions',start);
assert(start>=0&&end>start);
assert(!src.slice(start,end).includes('android-preview-v1.1.0'));
function release(code){
 const tag='android-v1.0.0-code'+code,name='mtunz-android-v1.0.0-code'+code+'.apk';
 return {tag_name:tag,draft:false,prerelease:false,published_at:'2026-11-25T00:00:00Z',assets:[{name,state:'uploaded',size:12345,browser_download_url:'https://github.com/hoangminhtuan-2322/mtunz/releases/download/'+tag+'/'+name}]};
}
async function check(server,rows,expected,stale=false){
 let shown,download;
 const ctx={api:async()=>{if(server instanceof Error)throw server;return server;},
  fetch:async()=>{if(rows instanceof Error)throw rows;return {ok:true,json:async()=>rows};},
  AbortController,setTimeout,clearTimeout,modal:v=>{shown=v;},esc:String,window:{location:{assign:u=>{download=u;}}}};
 vm.createContext(ctx);
 await vm.runInContext(src.slice(start,end)+'\nshowAndroidDownload()',ctx);
 assert.equal(shown.confirm,'Tải APK');
 assert(shown.content.includes('Build '+expected.version_code));
 shown.handler();assert.equal(download,expected.download_url);
 if(stale)assert(shown.content.includes('chưa kiểm tra được bản mới hơn'));
}
(async()=>{
 await check(new Error('offline'),new Error('rate limited'),floor,true);
 await check({available:false},[],floor,true);
 await check({...floor,version_code:11},[release(31),release(30)],{version_code:31,download_url:release(31).assets[0].browser_download_url});
 await check(floor,[release(20),release(19)],floor);
 await check(floor,[{...release(99),prerelease:true},{...release(98),draft:true}],floor);
 const invalid=release(100);invalid.assets[0].browser_download_url='https://example.com/evil.apk';
 await check({available:false},[invalid],floor,true);
 console.log('Verified stable fallback, direct public catalog, monotonic build and hostile URL tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
