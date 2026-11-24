'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const src=fs.readFileSync('static/app.js','utf8');
const start=src.indexOf('async function showAndroidDownload(){');
const end=src.indexOf('// ==== Centralized interactions',start);
assert(start>=0&&end>start);
const preview='https://github.com/hoangminhtuan-2322/mtunz/releases/download/android-preview-v1.1.0-code11-run45333101932/mtunz-android-preview-v1.1.0-code11.apk';
async function check(value,expectPreview){
 let shown,download;
 const ctx={api:async()=>{if(value instanceof Error)throw value;return value;},modal:v=>{shown=v;},esc:String,window:{location:{assign:u=>{download=u;}}}};
 vm.createContext(ctx);
 await vm.runInContext(src.slice(start,end)+'\nshowAndroidDownload()',ctx);
 assert(shown);
 assert.equal(shown.confirm,expectPreview?'Tải APK Preview':'Tải APK');
 shown.handler();
 assert.equal(download,expectPreview?preview:value.download_url);
 if(expectPreview)assert(shown.content.includes('BẢN THỬ NGHIỆM'));
}
(async()=>{
 await check(new Error('offline'),true);
 await check({available:false},true);
 await check({available:true,platform:'android',package:'com.mtunz.web',version:'1.2.0',version_code:12,download_url:'https://example.com/invalid.apk'},true);
 await check({available:true,platform:'android',package:'com.mtunz.web',version:'1.2.0',version_code:12,download_url:'https://github.com/hoangminhtuan-2322/mtunz/releases/download/android-v1.2.0-code12/mtunz-android-v1.2.0-code12.apk'},false);
 console.log('Preview fallback and stable APK priority: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
