'use strict';
// Regression: the guest support memory hint is optional, both visually and semantically.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/app.js', 'utf8');
const html = fs.readFileSync('static/index.html', 'utf8');
const inputStart = source.indexOf('function inputField(');
const inputEnd = source.indexOf('/* Plain form control', inputStart);
const supportStart = source.indexOf('function authSupport(){');
const supportEnd = source.indexOf('function renderTicketBubbles(', supportStart);
assert(inputStart >= 0 && inputEnd > inputStart, 'Shared input builder exists');
assert(supportStart >= 0 && supportEnd > supportStart, 'Support screen is extractable');
const context = {
  state: {supportTicket: null, supportKind: 'other', tickets: []},
  icon: () => '<svg></svg>',
  esc: x => String(x),
};
vm.createContext(context);
vm.runInContext(source.slice(inputStart, inputEnd) + '\n' +
                source.slice(supportStart, supportEnd), context, {timeout: 1000});
const markup = context.authSupport();
const field = markup.match(/<input\b[^>]*\bname="claim"[^>]*>/)?.[0];
assert(field, 'Support memory input must render');
assert(markup.includes('Thông tin gợi nhớ (không bắt buộc)'), 'Keep optional field label');
assert(!/\srequired(?:\s|>)/.test(field), 'Optional support field must not be required');
assert(field.includes('maxlength="160"'), 'Retain server-matched maximum length');
const mandatory = context.inputField('Mã khôi phục', 'code');
assert(/\srequired(?:\s|>)/.test(mandatory), 'Other inputs remain required by default');
assert(source.includes("claim:val('claim')"), 'Empty memory content is still sent as an empty string');
assert(html.includes('/static/app.js?v=17.1'), 'Fresh app script is served instead of cached markup');
console.log('Optional support field: no required flag, no empty-field error, required inputs unchanged.');
