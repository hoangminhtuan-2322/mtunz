'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('static/app.js', 'utf8');
const api = fs.readFileSync('features.py', 'utf8');
const core = fs.readFileSync('app.py', 'utf8');
const schedule = fs.readFileSync('account_deletion.py', 'utf8');

for (const required of [
  'data-act="delete-own-account"',
  'data-act="cancel-own-deletion"',
  "case 'cancel-own-deletion':",
  'function showCancelDeletionDialog()',
  'function adminDeletionQueue()',
  "case 'admin-delete-pending':",
  'XOA SAU 30 NGAY',
  "api('/api/me/deletion')",
  "api('/api/admin/deletions')",
  'deadlineDate(state.accountDeletion.purge_at)',
]) assert(js.includes(required), 'UI missing: ' + required);

for (const required of [
  "@app.get('/api/me/deletion')",
  "@app.post('/api/me/delete')",
  "@app.post('/api/me/delete/cancel')",
  "@app.get('/api/admin/deletions')",
  "@app.post('/api/admin/users/{uid}/delete')",
  "if not admin['pin_hash']:",
  "DELETE FROM account_deletion_requests WHERE user_id=? AND purge_at>?",
  'DELETION_GRACE_SECONDS',
  "CREATE TABLE IF NOT EXISTS account_deletion_requests",
]) assert(api.includes(required), 'API missing: ' + required);

assert(schedule.includes('DELETE FROM account_deletion_requests'));
assert(schedule.includes('RETURNING user_id'));
assert(core.includes('2 * 3600 if is_admin'));
assert(core.includes('body.remember_device and not is_admin'));
assert(js.includes('Phiên quản trị hết hạn sau 2 giờ'));

assert(!js.includes('Mã PIN hiện tại:'), 'Do not show redundant current PIN length in settings');
assert(!js.includes(' · PIN ${u.pin_length} số'), 'Do not expose PIN length in the admin list');
console.log('30-day cancellation, administrator immediate deletion, and security UI wiring: OK');
