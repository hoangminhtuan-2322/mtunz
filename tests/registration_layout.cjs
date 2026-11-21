'use strict';
// Guard the approved registration screen against the reported footer/CTA overlap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('static/app.js','utf8');
const html = fs.readFileSync('static/index.html','utf8');
const css = fs.readFileSync('static/registration-layout.css','utf8');
const extras = fs.readFileSync('static/extras.js','utf8');
const beginning = app.indexOf("if(state.regStatus==='approved')return");
const ending = app.indexOf('return `<span class="eyebrow">THAM GIA MTUNZ', beginning);
assert(beginning > 0 && ending > beginning, 'Approved registration markup exists');
const approved = app.slice(beginning, ending);
for (const fragment of [
  'class="registration-complete"',
  'data-form="register-complete"',
  'class="registration-section"',
  'id="registration-password-heading"',
  'id="registration-pin-heading"',
  'class="registration-consent"',
  'name="accepted_terms" required',
  'id="pin-length" name="pin_length"',
  'class="registration-security-note"',
  'type="submit">Tạo tài khoản'
]) assert(approved.includes(fragment), 'Missing registration structure: '+fragment);
assert(approved.indexOf('class="registration-consent"') < approved.indexOf('type="submit">Tạo tài khoản'), 'Consent must precede the submit button');
assert(!approved.includes('style="align-items:flex-start'), 'Legacy consent must not float into footer');
assert(html.includes('/static/registration-layout.css?v=11.2'), 'Final stylesheet is loaded with cache busting');
assert(html.indexOf('registration-layout.css') > html.indexOf('form-layout.css'), 'Registration geometry overrides previous form themes');
assert(css.includes('.auth-main > .auth-panel'), 'The auth card must never shrink');
assert(css.includes('flex-shrink:0'), 'Auth card shrink guard is required');
assert(css.includes('.auth-panel:has(.registration-complete) .auth-screen'), 'Registration screen grows with content');
assert(css.includes('flex:0 0 auto'), 'Long registration content does not compress');
assert(css.includes('.registration-consent input[type="checkbox"]'), 'Consent checkbox has an explicit aligned layout');
assert(css.includes('overflow-y:auto'), 'Mobile visitors can reach content below the fold');
assert(css.includes('@media (min-width:801px)'), 'Desktop scrolling and centering remain supported');
assert(css.includes('@media (max-width:800px)'), 'Mobile page flow remains supported');
assert(!app.includes('Bước đầu tiên là đăng ký tên tài khoản riêng'), 'Remove redundant signup instruction paragraph');
// Keep registration compact without persistent format instructions; validation remains active.
assert(!app.includes('3–24 ký tự, bắt đầu bằng chữ; chỉ dùng a-z, 0-9 và dấu gạch dưới.'), 'Remove username hint below registration field');
assert(app.includes('pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"'), 'Keep browser-side username validation');
const premium = fs.readFileSync('static/premium.js','utf8');
assert(!premium.includes('Dùng 3–24 ký tự'), 'Do not resurrect verbose status hint while typing');
assert(premium.includes("Tên đăng nhập không đúng định dạng."), 'Invalid username remains actionable');
assert(html.includes('/static/premium.js?v=2.8'), 'Load updated validation UI');
// Compact the initial registration step only where the viewport can contain it.
assert(css.includes('@media (min-width:650px) and (max-width:1100px) and (min-height:820px)'), 'Adaptive fit only for standard-height viewports');
assert(css.includes('.auth-main:has(form[data-form="register-request"])'), 'Fit is isolated to the initial registration request');
assert(css.includes('.auth-panel:has(form[data-form="register-request"]) .auth-step'), 'Vertical spacing is compacted');
assert(css.includes('.auth-panel:has(form[data-form="register-request"]) .auth-footer'), 'Footer stays inside the card');
assert(css.includes('Never clip controls on short viewports'), 'Short-height fallback remains scrollable');
assert(!css.includes('overflow-y:hidden!important'), 'Do not hide scrolling for clipped controls');
// Public screens must not explain privileged controls or duplicate contact notes.
assert(!app.includes('Số điện thoại chưa được xác minh bằng SMS.'), 'Remove SMS/admin disclaimer beneath signup');
assert(!app.includes('Thông tin liên hệ được giữ riêng tư và không hiện trong hồ sơ công khai.'), 'Remove redundant registration banner');
assert(!extras.includes('Chỉ bạn và quản trị viên được xem số điện thoại'), 'Remove technical access note from profile form');
assert(!app.includes('Bảo vệ Admin: Không hỗ trợ ghi nhớ thiết bị.'), 'Do not reveal privileged session settings on public login screen');
assert(!app.includes('Admin vẫn có thể xóa ngay theo quyền quản trị.'), 'Avoid advertising admin privileges in deletion copy');
assert(approved.includes('Tôi đã đọc và đồng ý với'), 'Consent text must remain explicit');
assert(approved.includes('href="/terms"')&&approved.includes('href="/privacy"'), 'Terms and Privacy must be readable before account creation');
assert(approved.includes('for="accepted-terms"'), 'Consent checkbox has an accessible label');
assert(!approved.includes('Tôi đồng ý cung cấp số điện thoại và email'), 'Remove overly long contact disclaimer from checkbox');
assert(!app.includes('member-privacy-details'), 'Removed settings privacy accordion must not return');
assert(!app.includes('Quyền riêng tư và xử lý dữ liệu'), 'Removed privacy accordion title must not return');
assert(!fs.readFileSync('static/social-upgrade.css','utf8').includes('.member-privacy-details'), 'Do not retain orphaned accordion styling');
assert(extras.includes('Số điện thoại mặc định được ẩn'), 'Contact note is concise');
console.log('Approved registration and member privacy copy checks passed.');
