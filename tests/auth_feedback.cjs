'use strict';
/* Regression: auth errors are inline, accessible, deduplicated, and do not expose secrets. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/auth-feedback.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const start=app.indexOf('function authFailureText(');
const end=app.indexOf('function inputField(',start);
assert(start>=0&&end>start,'Auth contextual error functions are extractable');
const attrs=()=>{const d={};return {setAttribute(k,v){d[k]=String(v)},getAttribute(k){return d[k]||''},all:d}};
const items=[];
const context={
 document:{createElement(tag){const v={tagName:tag.toUpperCase(),className:'',textContent:'',id:'',...attrs()};items.push(v);return v}},
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context,{timeout:1000});
const map=[
 ['login-username',404,'Không tìm thấy tài khoản này. Vui lòng kiểm tra tên đăng nhập.'],
 ['login-password',401,'Mật khẩu không chính xác. Vui lòng thử lại.'],
 ['login-pin',401,'Mã PIN không chính xác. Vui lòng thử lại.'],
 ['login-remembered',401,'Mã PIN không chính xác. Vui lòng thử lại.'],
];
for(const [form,status,expected] of map){
 const error=new Error('Tên tài khoản hoặc mật khẩu không đúng.');error.status=status;
 assert.equal(context.authFailureText(form,error),expected,'Correct text for '+form);
 const field={children:[],classList:{classes:new Set(),add(x){this.classes.add(x)}},querySelector(x){
  assert.equal(x,'.field-error');return this.children.find(node=>node.className.includes('field-error'))||null;
 },append(x){this.children.push(x)}};
 const input={id:form==='login-username'?'username':form==='login-password'?'password':'pin',
  value:'SENSITIVE_DEMO',attrs:attrs(),focusCalls:0,
  setAttribute(k,v){this.attrs.setAttribute(k,v)},getAttribute(k){return this.attrs.getAttribute(k)},
  closest(x){assert.equal(x,'.field');return field},focus(){this.focusCalls++}};
 const fakeForm={isConnected:true,querySelector(x){assert.equal(x,'[name="'+input.id+'"]');return input}};
 assert.equal(context.showAuthFieldError(fakeForm,input.id,expected),true);
 assert.equal(field.children.length,1,'Only one inline error appears');
 assert.equal(field.children[0].textContent,expected);
 assert.equal(field.children[0].getAttribute('role'),'alert');
 assert.equal(input.getAttribute('aria-invalid'),'true');
 assert.equal(input.getAttribute('aria-describedby'),input.id+'-error');
 assert.equal(input.value,form==='login-username'?'SENSITIVE_DEMO':'','Only secret fields clear');
 context.showAuthFieldError(fakeForm,input.id,expected);
 assert.equal(field.children.length,1,'Retry does not stack error boxes');
 assert(field.classList.classes.has('has-error'));
 assert.equal(input.focusCalls,2);
}
assert.equal(context.authFailureText('login-pin',{status:429,message:'Thiết bị tạm khóa.'}),'Thiết bị tạm khóa.');
assert.equal(context.authFailureText('login-pin',{status:401,message:'Phiên xác minh PIN hết hạn, vui lòng đăng nhập lại.'}),'Phiên xác minh PIN hết hạn, vui lòng đăng nhập lại.');
assert(app.includes("if(!authField||!showAuthFieldError(form,authField,authFailureText(key,e)))"),'Login auth failure bypasses toast');
assert(app.includes("item.dataset.kind===kind&&item.dataset.message===messageText"),'Other toasts deduplicated');
assert(css.includes('.auth-panel .auth-input-field .field-error'),'Contextual styling is scoped');
assert(css.includes('#toast-root .notify-toast'),'Other toasts use redesigned style');
assert(html.includes('auth-feedback.css?v=13.1'));
assert(html.includes('app.js?v=15.3'));
console.log('Auth error UI OK: account, password, PIN and remembered PIN inline; safe clearing and dedup.');
