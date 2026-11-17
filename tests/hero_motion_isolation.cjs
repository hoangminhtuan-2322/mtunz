'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const code=fs.readFileSync('static/app.js','utf8');
const start=code.indexOf('function initializeHeroMotion(hero){');
const end=code.indexOf('function renderAuth(){',start);
assert(start>=0&&end>start,'Hero-only motion setup must be defined');

function harness(enabled=true){
  let nextFrame=null,cancelled=0,matchCalls=0;
  const handlers={};
  const classes=new Set();
  const styles={};
  const hero={
    dataset:{},isConnected:true,
    addEventListener(type,fn,options){
      assert(options&&options.passive===true,'Pointer listeners must be passive');
      assert(!handlers[type],'Each event should be registered once');
      handlers[type]=fn;
    },
    getBoundingClientRect(){return {left:100,top:50,width:650,height:850};},
    classList:{add(name){classes.add(name)},remove(name){classes.delete(name)}},
    style:{setProperty(k,v){styles[k]=v}}
  };
  const context={
    window:{matchMedia(query){
      matchCalls++;assert(query.includes('prefers-reduced-motion: no-preference'));
      return {matches:enabled};
    }},
    requestAnimationFrame(callback){assert(!nextFrame,'No overlapping RAFs');nextFrame=callback;return 42;},
    cancelAnimationFrame(handle){assert.equal(handle,42);cancelled++;nextFrame=null;}
  };
  vm.createContext(context);vm.runInContext(code.slice(start,end),context,{timeout:1000});
  return {hero,handlers,classes,styles,context,flush(){const frame=nextFrame;nextFrame=null;if(frame)frame();},get cancelled(){return cancelled},get matchCalls(){return matchCalls}};
}
const app=harness();
app.context.initializeHeroMotion(app.hero);
assert.equal(app.hero.dataset.motionReady,'1');
assert.deepEqual(Object.keys(app.handlers).sort(),['pointerenter','pointerleave','pointermove']);
app.handlers.pointerenter();
assert(app.classes.has('nova-pointer-active'));
app.handlers.pointermove({clientX:275,clientY:190});
app.handlers.pointermove({clientX:280,clientY:195}); // coalesce into one RAF
app.flush();
assert.equal(app.styles['--nova-pointer-x'],'180px');
assert.equal(app.styles['--nova-pointer-y'],'145px');
app.context.initializeHeroMotion(app.hero);
assert.equal(app.matchCalls,1,'Repeated forms may not initialize hero twice');
app.handlers.pointerleave();
assert(!app.classes.has('nova-pointer-active'));

const reduced=harness(false);
reduced.context.initializeHeroMotion(reduced.hero);
assert.equal(Object.keys(reduced.handlers).length,0,'Reduced-motion/low-power pointers must not animate');
assert.equal(reduced.hero.dataset.motionReady,undefined);

const css=fs.readFileSync('static/hero-nova.css','utf8');
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('.auth-art.art-v5'));
assert(css.includes('nova-orbit-spin'));
assert(css.includes('.auth-art.art-v5 .signal-feature.nova-feature:hover'));
assert(!code.slice(start,end).includes('document.addEventListener'),'Pointer events must stay on hero only');
console.log('Nova motion OK: hero-only passive listeners, RAF coalescing, reduced-motion, no coupling to login form.');
