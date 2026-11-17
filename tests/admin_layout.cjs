'use strict';
/* Prevent chat layout rules from accidentally converting the two-panel Admin
   dashboard into a three-column grid with an empty rightmost column. */
const assert=require('node:assert/strict');
const fs=require('node:fs');

const premium=fs.readFileSync('static/premium.css','utf8');
const style=fs.readFileSync('static/style.css','utf8');
const app=fs.readFileSync('static/app.js','utf8');
const html=fs.readFileSync('static/index.html','utf8');

assert.match(html,/href="\/static\/premium\.css\?v=2\.2"/,'Corrected CSS must bypass browser caches');
assert.match(app,/class="shell admin-shell">\$\{adminNav\(\)\}<main class="admin-page">/,'Admin renders nav + main, not a chat sidebar');
assert(style.includes('.shell{height:100%;display:grid;'),'The shell stays a grid');
assert(style.includes('.admin-shell{grid-template-columns:256px minmax(0,1fr)}'),'Base Admin has exactly two columns');

const chat=[...premium.matchAll(/\.shell:not\(\.admin-shell\)\{grid-template-columns:([^}]+)\}/g)];
const admin=[...premium.matchAll(/\.shell\.admin-shell\{grid-template-columns:([^}]+)\}/g)];
assert.equal(chat.length,3,'Chat layout must be scoped on desktop, tablet and mobile');
assert.equal(admin.length,2,'Mobile and small-screen Admin must have dedicated grids');
assert(premium.includes('grid-template-columns:256px minmax(0,1fr);'),'Desktop admin main column expands to available width');
assert(premium.includes('.shell.admin-shell > .admin-nav'),'Admin nav must be grid-width constrained');
assert(premium.includes('.shell.admin-shell > .admin-page'),'Admin page must be grid-width constrained');
assert(!/\.shell\{grid-template-columns:/.test(premium),'Unscoped chat grid would override Admin again');
assert(chat[0][1].startsWith('76px 314px'),'Desktop chat keeps its existing three-column grid');
assert(chat[1][1].startsWith('65px'),'Tablet chat remains responsive');
assert(chat[2][1].startsWith('56px'),'Mobile chat remains responsive');
assert(admin[0][1].startsWith('66px'),'Tablet Admin nav remains compact');
assert(admin[1][1].startsWith('56px'),'Mobile Admin nav remains compact');
console.log('Admin layout OK: desktop two-column grid fills screen; chat grid stays isolated; responsive Admin preserved.');
