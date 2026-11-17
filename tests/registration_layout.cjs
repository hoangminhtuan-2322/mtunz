'use strict';
// Guard the approved registration screen against the reported footer/CTA overlap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('static/app.js','utf8');
const html = fs.readFileSync('static/index.html','utf8');
const css = fs.readFileSync('static/registration-layout.css','utf8');
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
assert(html.includes('/static/registration-layout.css?v=11.0'), 'Final stylesheet is loaded with cache busting');
assert(html.indexOf('registration-layout.css') > html.indexOf('form-layout.css'), 'Registration geometry overrides previous form themes');
assert(css.includes('.auth-main > .auth-panel'), 'The auth card must never shrink');
assert(css.includes('flex-shrink:0'), 'Auth card shrink guard is required');
assert(css.includes('.auth-panel:has(.registration-complete) .auth-screen'), 'Registration screen grows with content');
assert(css.includes('flex:0 0 auto'), 'Long registration content does not compress');
assert(css.includes('.registration-consent input[type="checkbox"]'), 'Consent checkbox has an explicit aligned layout');
assert(css.includes('overflow-y:auto'), 'Mobile visitors can reach content below the fold');
assert(css.includes('@media (min-width:801px)'), 'Desktop scrolling and centering remain supported');
assert(css.includes('@media (max-width:800px)'), 'Mobile page flow remains supported');
console.log('Approved registration layout integrity checks passed.');
