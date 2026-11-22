'use strict';
/* Guard the public release basics: policies are readable, consent recorded by server,
   image preview obeys CSP and settings' removed privacy accordion stays absent. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('app.py'),ui=read('static/app.js'),html=read('static/index.html');
const features=read('features.py'),css=read('static/registration-layout.css');
const terms=read('static/terms.html'),privacy=read('static/privacy.html');
const legal=read('static/legal.css');
new vm.Script(ui,{filename:'app.js'});
for(const page of [terms,privacy]){
 assert(page.includes('<html lang="vi">'));
 assert(page.includes('name="viewport"'));
 assert(page.includes('/static/legal.css?v=1.0'));
 assert(page.includes('href="/"'));
 assert(page.includes('18/11/2026'));
}
assert(terms.includes('href="/privacy"')&&privacy.includes('href="/terms"'));
assert(privacy.includes('không có mã hóa đầu-cuối (E2EE)'));
assert(privacy.includes('Quản trị viên có thể xem thông tin tài khoản'));
assert(privacy.includes('Neon PostgreSQL')&&privacy.includes('Render'));
assert(terms.includes('Trung tâm hỗ trợ')&&terms.includes('3 ngày'));
assert(css.includes('.registration-consent a:focus-visible'));
assert(ui.includes('href="/terms"')&&ui.includes('href="/privacy"'));
assert(ui.includes("accepted_terms:fd.get('accepted_terms')==='on'"));
assert(app.includes('if not body.accepted_terms:'),'Consent must be enforced by server');
assert(app.includes('terms_accepted_at=?')&&app.includes('TERMS_VERSION'),'Capture timestamp and policy edition');
assert(features.includes("column('users','terms_accepted_at'")&&features.includes("column('users','terms_accepted_version'"));
assert(app.includes("img-src 'self' data: blob:;"),'CSP must allow browser image previews');
assert(!ui.includes('member-privacy-details'),'Do not recreate removed settings accordion');
assert(!ui.includes('Quyền riêng tư và xử lý dữ liệu'),'Removed settings disclosure stays gone');
assert(html.includes('app.js?v=20.1'));
assert(!/document\.cookie|localStorage/.test(terms+privacy),'Legal documents must not capture data');
assert(legal.includes('prefers-reduced-motion')&&legal.includes('focus-visible'));
console.log('Release legal and privacy UI OK: linked policies, accessible forms, consent enforcement, blob CSP, and no restored accordion.');