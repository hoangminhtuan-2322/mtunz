#!/usr/bin/env node
'use strict';

/**
 * Prevent accidental web/native feature drift at pull-request time.
 * This is a review/build gate, not proof that all phones installed the APK.
 */
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function git(args) {
  return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',
    stdio:['ignore','pipe','pipe']}).trim();
}
function changedFileTypes(files, patch='') {
  const webUI=files.filter(p=>p.startsWith('static/') && /\.(js|html|css)$/.test(p));
  const backend=files.filter(p=>/^(app\.py|features\.py|messaging_v4\.py|mobile_api\.py|chat_library\.py|world_chat\.py|social_profile\.py|community(?:_plus_v7|_v6)?\.py|admin_ops_v6\.py)$/.test(p));
  const newApiRoute=backend.length>0 &&
    patch.split('\n').some(line=>/^\+(?!\+).*(?:@(?:app|router)\.(?:get|post|put|patch|delete|websocket)\s*\()/.test(line));
  const native=files.filter(p=>p==='mobile/App.js'||p==='mobile/package.json'||
    p==='mobile/app.json'||/^mobile\/src\/.*\.(?:js|jsx|ts|tsx)$/.test(p));
  const nativeTests=files.filter(p=>/^tests\/(?:native_.*\.cjs|test_native_mobile\.py)$/.test(p));
  return {webUI,backend,newApiRoute,native,nativeTests};
}
function parsePR(body) {
  const value=(name)=>{const m=body.match(new RegExp('^'+name+':\\s*(.+)$','im'));return m?m[1].trim():'';};
  return {impact:value('Parity-Impact').toLowerCase(),reason:value('Parity-Reason'),
    release:value('Release-Plan').toLowerCase(),releaseReason:value('Release-Reason')};
}
function problems({files,patch='',body='',previousCode,currentCode}) {
  const t=changedFileTypes(files,patch),p=parsePR(body),errors=[];
  const userFacing=t.webUI.length>0||t.newApiRoute;
  const waiver=p.impact==='none'&&p.reason.length>=25;
  if(userFacing&&!t.native.length&&!waiver)
    errors.push('User-facing web/API changed without native implementation. Update mobile/App.js or mobile/src, OR document Parity-Impact: none and Parity-Reason: (25+ chars) in the PR.');
  if(userFacing&&t.native.length&&!t.nativeTests.length)
    errors.push('Web + native change needs a native regression test in tests/native_*.cjs or tests/test_native_mobile.py.');
  if(t.native.length && previousCode!==null && currentCode!==null &&
     currentCode<=previousCode &&
     !(p.release==='batched'&&p.releaseReason.length>=25))
    errors.push('Native code changed without increasing mobile/app.json android.versionCode. Bump versionCode or provide Release-Plan: batched and Release-Reason: (25+ chars) for a coordinated release.');
  return {errors,t,p};
}
function versionCode(input) {
  const n=JSON.parse(input).expo?.android?.versionCode;
  if(!Number.isInteger(n)||n<1)throw Error('Android versionCode must be a positive integer');
  return n;
}
function baseChecks() {
  const mobile=JSON.parse(fs.readFileSync(path.join(root,'mobile/app.json'),'utf8')).expo;
  assert.equal(mobile.android.package,'com.mtunz.web','Keep Android update identity unchanged');
  assert(Number.isInteger(mobile.android.versionCode)&&mobile.android.versionCode>1);
  assert(/^\d+\.\d+\.\d+$/.test(mobile.version));
  const nativeWorkflow=fs.readFileSync(path.join(root,'.github/workflows/android-apk.yml'),'utf8');
  assert(nativeWorkflow.includes('mtunz-NATIVE-'+mobile.version+'-RELEASE-fixed-key'),
    'Signed Android artifact/version drift');
  assert(nativeWorkflow.includes("versionCode='"+mobile.android.versionCode+"'"),
    'Android build verification/versionCode drift');
  const web=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'mobile/src/Messenger.js'),'utf8');
  const admin=fs.readFileSync(path.join(root,'mobile/src/AdminDashboard.js'),'utf8');
  const shared=[
    ['/api/friends',web,app],['/api/groups',web,app],
    ['/api/support/tickets',web,app],['/api/admin/registrations',web,admin],
    ['/api/admin/tickets',web,admin],['new WebSocket',web,app],
  ];
  for(const [feature,a,b] of shared)
    assert(a.includes(feature)&&b.includes(feature),'Missing web/native shared contract: '+feature);
  console.log('Web + Android shared contracts, package and signed release metadata verified.');
}
function selfTest() {
  const common={patch:'',previousCode:4,currentCode:5};
  assert(problems({...common,files:['static/app.js'],body:''}).errors.length===1);
  assert.equal(problems({...common,files:['static/app.js'],
    body:'Parity-Impact: none\nParity-Reason: CSS-only fix, no native behavior changed.'}).errors.length,0);
  assert(problems({...common,files:['static/app.js','mobile/src/Messenger.js'],
    body:''}).errors.some(x=>x.includes('regression test')));
  assert.equal(problems({...common,files:['static/app.js','mobile/src/Messenger.js','tests/native_world_typing_parity.cjs'],
    body:''}).errors.length,0);
  assert(problems({...common,files:['mobile/src/Messenger.js'],previousCode:5,currentCode:5,
    body:''}).errors.some(x=>x.includes('versionCode')));
  assert.equal(problems({...common,files:['mobile/src/Messenger.js'],previousCode:5,currentCode:5,
    body:'Release-Plan: batched\nRelease-Reason: This patch will ship with the upcoming signed APK.'}).errors.length,0);
  assert.equal(problems({...common,files:['app.py'],patch:"+@app.post('/api/new')",
    body:''}).errors.length,1);
  assert.equal(problems({...common,files:['static/colors.css'],
    body:'Parity-Impact: none\nParity-Reason: Web-only theme colors, no functionality.'}).errors.length,0);
  assert(problems({...common,files:['chat_library.py'],
    patch:"+@app.get('/api/chats/{scope}/{room_id}/shared')",body:''}).errors.length===1);
  assert(problems({...common,files:['mobile/package.json'],previousCode:5,currentCode:5,
    body:''}).errors.some(x=>x.includes('versionCode')));

  console.log('Parity change-classifier self-tests passed.');
}
if(require.main===module) {
  baseChecks();
  selfTest();
  const flag=process.argv.indexOf('--base');
  if(flag!==-1) {
    const base=process.argv[flag+1],head=process.argv[process.argv.indexOf('--head')+1];
    if(!/^[a-f0-9]{40}$/i.test(base||'')||!/^[a-f0-9]{40}$/i.test(head||''))
      throw Error('Expected full base/head commit SHAs');
    const files=git(['diff','--name-only',base,head]).split('\n').filter(Boolean);
    const patch=git(['diff','--unified=0',base,head,'--','*.py']);
    const previous=versionCode(git(['show',base+':mobile/app.json']));
    const current=versionCode(git(['show',head+':mobile/app.json']));
    const check=problems({files,patch,body:process.env.PARITY_PR_BODY||'',
      previousCode:previous,currentCode:current});
    console.log('Changed paths:',files.join(', ')||'(none)');
    if(check.errors.length) {
      for(const msg of check.errors)console.error('PARITY GATE FAILED: '+msg);
      process.exitCode=1;
    } else console.log('Web/native change coordination gate passed.');
  }
}
module.exports={changedFileTypes,parsePR,problems,versionCode};
