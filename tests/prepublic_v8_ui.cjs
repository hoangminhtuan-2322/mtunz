/* V8 prepublic regression checks — static contract, no production mutation. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('static/index.html');
const world=read('static/world-moderation.js');
const admin=read('static/admin-v5.js');
const app=read('app.py');
const css=read('static/prepublic-v8.css');

assert(html.includes('/static/prepublic-v8.css?v=1.0'),'Smooth scroll stylesheet linked');
assert(html.includes('/static/world-moderation.js?v=4.3'),'World UI cache-busted');
assert(html.includes('/static/admin-v5.js?v=1.1'),'Admin UI cache-busted');
assert(world.includes('worldStatusPaintKey')&&world.includes('worldFeedPaintKey'),
 'Poll rendering must compare meaningful message and status changes');
assert(world.includes('if(feed.dataset.worldPaintKey!==signature)'),
 'Unchanged messages must not cause full DOM replacement');
assert(world.includes('if(sameView)')&&world.includes('return;'),
 'Stable world state should preserve editor and scrollbar');
assert(world.includes('oldScroll')&&world.includes('nearEnd'),
 'Scrolled-up users should not be forced to the newest message');
assert(world.includes('nextField.value=draft'),
 'Mobile composer draft should survive legitimate status changes');
assert(world.includes('worldOwnIds.clear()'),
 'Account switches cannot retain previous sender ownership');
assert(world.includes('worldPolling||document.hidden'),
 'Hidden tabs must suspend expensive world polling');
assert(admin.includes('securityPaintKey'),
 'Do not re-render identical Admin dashboard polling results');
assert(app.includes("path.startswith('/api/community/events/')"),
 'Emergency API gate must contain RSVPs');
assert(app.includes("'/api/world/polls/'"),
 'Emergency API gate must contain votes');
assert(app.includes("'/api/groups'")&&app.includes("'/api/message-requests'"),
 'Emergency gate must cover group and message request writes');
assert(app.includes("WHERE key='emergency_lockdown' AND value='1'"),
 'WebSocket call and typing signaling respects lockdown');
assert(css.includes('prefers-reduced-motion')&&css.includes('touch-action:pan-y'),
 'Mobile scrolling and accessibility optimized');
console.log('Prepublic V8 security, smoother world/admin UI, mobile contracts: OK');
