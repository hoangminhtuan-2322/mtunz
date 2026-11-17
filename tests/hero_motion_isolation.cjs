'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('static/app.js','utf8');
const perf=fs.readFileSync('static/performance.css','utf8');
const base=fs.readFileSync('static/hero-nova.css','utf8');
const html=fs.readFileSync('static/index.html','utf8');
const start=app.indexOf('function renderAuth(){');
const end=app.indexOf('async function loadTickets()',start);
assert(start>=0&&end>start,'Auth view still exists');

assert(!app.includes('function initializeHeroMotion('),'High-frequency pointer animator was removed');
assert(!app.includes('nova-pointer-x'),'No per-frame CSS variable writes');
assert(!app.slice(start,end).includes('initializeHeroMotion'),'Auth mounting must not register pointer listeners');
assert(html.includes('performance.css?v=8.1'),'Performance overrides load');
assert(html.includes('app.js?v=8.1'),'New lightweight JavaScript must load');

const essential=[
 '.auth-art.art-v5 .nova-orbit',
 '.auth-art.art-v5 .nova-ambient-light',
 '.auth-art.art-v5 .art-aurora',
 '.auth-art.art-v5 .signal-feature.nova-feature',
 '.auth-art.art-v5 .signal-stage.nova-stage',
 'backdrop-filter:none!important',
 'animation: none !important',
 'scroll-behavior:auto!important',
 '@media(prefers-reduced-motion:reduce)'
];
for(const selector of essential)assert(perf.includes(selector),'Missing performance rule: '+selector);
assert(perf.includes('display:none !important'),'Hidden expensive decoration');
assert(base.includes('.nova-brand')&&base.includes('.nova-stage'),'Keep Orbit identity, content and layout');
assert(app.includes('Kết nối không giới hạn.')&&app.includes('Trò chuyện theo cách bạn.'),'Approved landing text retained');
console.log('Performance smoke OK: no pointer RAF, disabled continuous orbit, removed blurs, retained Orbit brand and auth.');
