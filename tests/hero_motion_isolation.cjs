'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app=fs.readFileSync('static/app.js','utf8');
const perf=fs.readFileSync('static/performance.css','utf8');
const base=fs.readFileSync('static/hero-nova.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const controller=fs.readFileSync('static/motion-lite.js','utf8');
const start=app.indexOf('function renderAuth(){');
const end=app.indexOf('async function loadTickets()',start);
assert(start>=0&&end>start,'Auth view still exists');

assert(!app.includes('function initializeHeroMotion('),'Do not re-introduce pointer tracking');
assert(!app.includes('nova-pointer-x'),'No per-frame pointer-driven CSS changes');
assert(!app.slice(start,end).includes('initializeHeroMotion'),'Hero must not be re-mounted');
assert(html.includes('performance.css?v=8.2'),'New CSS must load');
assert(html.includes('motion-lite.js?v=8.2'),'Visibility controller must load');
assert(html.includes('app.js?v=20.8'),'Auth JS remains unchanged');

for(const important of [
 '.auth-art.art-v5 .nova-orbit.nova-orbit-one',
 '.auth-art.art-v5 .nova-stage-bars i:nth-child(-n+3)',
 'animation:nova-orbit-spin 42s linear infinite!important',
 'animation:nova-wave 3.2s ease-in-out infinite!important',
 '.auth-art.art-v5 .signal-feature.nova-feature',
 'backdrop-filter:none!important',
 'html.mtunz-motion-paused',
 'html.mtunz-save-data',
 '@media (prefers-reduced-motion:reduce)'
]){
 assert(perf.includes(important),'Missing selective animation rule: '+important);
}
assert(perf.includes('min-width:1100px'),'Orbit limited to larger screens');
assert(perf.includes('hover:hover'),'Orbit disabled on touch-first devices');
assert(perf.includes('contain:paint'),'Decorative stage paint isolated');
assert(!controller.includes('requestAnimationFrame'),'No per-frame JS controller');
assert(!controller.includes('setInterval'),'No recurring timer');
assert(!controller.includes('pointermove'),'No pointer listener');
assert(base.includes('.nova-brand')&&base.includes('.nova-stage'),'Visual identity preserved');

const classes = new Set();
const listeners={};
const networkListeners={};
const doc={
 hidden:false,
 documentElement:{classList:{toggle(name,bool){
  if(bool) classes.add(name);
  else classes.delete(name);
 }}},
 addEventListener(name,cb,opts){
  assert.equal(name,'visibilitychange');assert.equal(opts.passive,true);listeners[name]=cb;
 }
};
const network={saveData:false,addEventListener(name,cb){assert.equal(name,'change');networkListeners[name]=cb}};
const navigator={connection:network,deviceMemory:8,hardwareConcurrency:8};
vm.runInNewContext(controller,{document:doc,navigator},{timeout:1500});
assert(!classes.has('mtunz-motion-paused'),'Visible tab animates');
doc.hidden=true;listeners.visibilitychange();
assert(classes.has('mtunz-motion-paused'),'Hidden tab pauses orbit');
doc.hidden=false;listeners.visibilitychange();
assert(!classes.has('mtunz-motion-paused'),'Visible tab may resume');
network.saveData=true;networkListeners.change();
assert(classes.has('mtunz-save-data'),'Data Saver must disable animation');
network.saveData=false;networkListeners.change();
assert(!classes.has('mtunz-save-data'),'Data Saver off resumes normal policy');

const lowPowerClasses = new Set();
vm.runInNewContext(controller,{
 document:{hidden:false,documentElement:{classList:{toggle(k,v){if(v) lowPowerClasses.add(k);else lowPowerClasses.delete(k)}}},addEventListener(){}},
 navigator:{hardwareConcurrency:2,deviceMemory:2}
},{timeout:1500});
assert(lowPowerClasses.has('mtunz-save-data'),'Very low-power devices receive static hero');
console.log('Motion Lite OK: one desktop orbit, tiny signal bars, no pointer loop, pauses on hidden tab and low-power devices.');
