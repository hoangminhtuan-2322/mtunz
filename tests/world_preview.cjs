'use strict';
/* World Chat remains Coming Soon while switched off; admin can launch it. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const app=read('static/app.js');
const html=read('static/index.html');
const css=read('static/world-preview.css');
new vm.Script(app,{filename:'static/app.js'});
assert(html.includes('world-preview.css?v=1.0'),'Dedicated stylesheet must load');
assert(html.indexOf('world-preview.css')>html.indexOf('social-upgrade.css'),'World styles should be applied after social UI');
assert(html.includes('/static/app.js?v=21.2'),'Fresh markup must bypass stale browser cache');
const from=app.indexOf('function worldComingSoon(){');
const end=app.indexOf('\nfunction renderApp(){',from);
assert(from>0&&end>from,'World page renderer must exist');
const fragment=app.slice(from,end);
const fn=vm.runInNewContext(fragment+';worldComingSoon',{icon:(name)=>'<svg data-icon="'+name+'"></svg>'});
const rendered=fn();
for(const cls of [
 'world-preview-shell','world-preview-topline','world-preview-status',
 'world-preview-hero','world-preview-copy','world-preview-visual',
 'world-preview-announcement','world-preview-actions',
 'world-preview-features','world-preview-disclaimer'
])assert(rendered.includes('class="'+cls+'"')||rendered.includes('class="'+cls+' '),'Missing world UI '+cls);
assert(rendered.includes('id="world-preview-title"'),'Accessible page heading');
assert(rendered.includes('aria-labelledby="world-preview-title"'));
assert(rendered.includes('aria-hidden="true"'),'Decorative orbital graphic must be hidden from screen readers');
for(const dest of ['messages','groups']){
 const count=rendered.split('data-tab="'+dest+'"').length-1;
 assert(count===1, 'Navigation to '+dest+' must be a real app tab action');
}
assert.equal((rendered.match(/data-act="app-tab"/g)||[]).length,2,'Only existing navigation actions may be interactive');
assert(rendered.includes('Chưa mở truy cập'));
assert(rendered.includes('Quản trị viên sẽ thông báo khi Chat thế giới chính thức được mở.'));
assert(rendered.includes('Quyền kích hoạt và thời gian hoạt động do quản trị viên quyết định.'));
assert(app.includes('worldPage()'),'World Chat becomes functional only when enabled.');
assert(!/data-form=|data-act="(world|send|join)|api\/world|WebSocket|chat-world/.test(rendered),
 'World preview must not pretend that public chat is enabled');
assert(!/đã ra mắt|đang hoạt động|online|tham gia ngay|đăng ký ngay/i.test(rendered),
 'Concept must not suggest live users or a usable public room');
assert(css.includes('container:world-stage/inline-size'),'Layout must adapt to available chat-pane width');
assert(css.includes('@container world-stage (max-width:850px)'));
assert(css.includes('@container world-stage (max-width:610px)'));
assert(css.includes('@container world-stage (max-width:390px)'));
assert(css.includes('@media(max-width:600px)'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(css.includes(':focus-visible'),'Keyboard navigation requires a visible focus state');
assert(css.includes('pointer-events:none'),'Decorative network should not capture interactions');
assert(!/https?:\/\/|@import|url\(/.test(css),'World preview must not depend on remote image assets');
console.log('World Preview OK: closed-by-default landing, responsive UI, admin-controlled launch.');
