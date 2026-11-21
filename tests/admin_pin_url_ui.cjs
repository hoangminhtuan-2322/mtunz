'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('static/app.js','utf8');
const world=fs.readFileSync('static/world-moderation.js','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const appServer=fs.readFileSync('app.py','utf8');
const worldServer=fs.readFileSync('world_chat.py','utf8');
const clean=fs.readFileSync('static/url-cleanup.js','utf8');
new vm.Script(clean);
new vm.Script(app);
new vm.Script(world);
const a=app.indexOf('function adminProofFields(');
const b=app.indexOf('\nfunction sanctionDialog(',a);
assert(a>0&&b>a,'Admin step-up helpers are found');
const snippet=app.slice(a,b);
const calls=[];
const ctx={
 state:{user:{pin_length:4}},
 adminV3PinFields:()=>'<input id="admin-v3-pin">',
 adminV3PinPayload:host=>({admin_pin:host.pin}),
 document:{addEventListener:(type,listener)=>calls.push(type)}
};
vm.createContext(ctx);
vm.runInContext(snippet,ctx);
assert(ctx.adminProofFields().includes('admin-v3-pin'),'Routine Admin asks only for PIN');
assert(!ctx.adminProofFields().includes('admin-confirm-password'),'Password hidden in routine prompt');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.adminProofValue({pin:'1234'}))),{admin_pin:'1234'});
assert(ctx.adminProofFields(true).includes('admin-confirm-password'),'Sensitive recovery keeps password');
assert(app.includes('$'+'{adminProofFields(true)}')&&app.includes('...adminProofValue(host,true)'),
 'Recovery grant explicitly uses stronger password+PIN step-up');
ctx.state.user.pin_length=null;
assert(ctx.adminProofFields().includes('admin-confirm-password'),
 'Legacy password verification remains for Admin without a configured PIN');
assert(world.includes('content:adminV3PinFields()'),'World confirmations use PIN dialog');
assert(world.includes('...adminV3PinPayload(host)'),'World payload uses PIN');
assert(appServer.includes('def verify_admin_routine('),'Server-side routine guard exists');
assert(worldServer.includes('verify_admin_routine(request,admin,body.admin_password,body.admin_pin)'),
 'World route validates PIN server side');
assert(html.includes('src="/static/url-cleanup.js?v=1"'),'Safe URL cleanup is loaded');
assert(html.indexOf('url-cleanup.js')<html.indexOf('app.js?v=20.2'),
 'Cleanup runs before app initialization');
const cases=[
 {uri:'https://mtunz.onrender.com/?utm_source=chatgpt.com',
  expected:'/',changed:true},
 {uri:'https://mtunz.onrender.com/world?utm_source=chatgpt.com&room=2#latest',
  expected:'/world?room=2#latest',changed:true},
 {uri:'https://mtunz.onrender.com/?room=2&utm_source=chatgpt.com&invite=hello#chat',
  expected:'/?room=2&invite=hello#chat',changed:true},
 {uri:'https://mtunz.onrender.com/?utm_source=chatgpt.com#profile',
  expected:'/#profile',changed:true},
 {uri:'https://mtunz.onrender.com/?utm_source=newsletter&room=3',
  expected:null,changed:false},
 {uri:'https://mtunz.onrender.com/chat?utm_campaign=hello#x',
  expected:null,changed:false},
 {uri:'https://mtunz.onrender.com/',expected:null,changed:false}
];
for(const test of cases){
 const history={state:{id:4},seen:[],replaceState(...args){this.seen.push(args)}};
 const context={window:{location:{href:test.uri},history},URL};
 vm.createContext(context);
 vm.runInContext(clean,context);
 assert.equal(history.seen.length,test.changed?1:0,test.uri);
 if(test.changed){
  assert.strictEqual(history.seen[0][0],history.state,'History state preserved');
  assert.strictEqual(history.seen[0][2],test.expected,'Only ChatGPT UTM removed');
 }
}
console.log('Routine Admin PIN proofs and selective ChatGPT UTM cleanup OK');
