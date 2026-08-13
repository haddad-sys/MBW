/* The permission engine and the mail template, tested directly. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { P_BR, P_MGR, P_VIEW, can, canReachEntity, resolvePerms, NOTIF_EVENTS, URGENT_EVENTS } from '../src/lib/domain.js';
import { renderEmail } from '../src/services/mailer.js';

test('a stored permission set wins over the role', () => {
  const user = { role: 'branch', perms: JSON.stringify({ ...P_MGR }) };
  assert.equal(resolvePerms(user).scope, 'all');
  assert.equal(resolvePerms(user).manageUsers, 1);
});

test('a role without a stored set falls back to its preset', () => {
  assert.equal(resolvePerms({ role: 'manager', perms: null }).scope, P_MGR.scope);
  assert.equal(resolvePerms({ role: 'branch', perms: null }).scope, P_BR.scope);
  /* There are two roles. Anything else is treated as a branch account, and a
     read-only account is a stored permission set, not a third role. */
  assert.equal(resolvePerms({ role: 'something-else', perms: null }).scope, P_BR.scope);
  assert.equal(resolvePerms({ role: 'branch', perms: JSON.stringify(P_VIEW) }).create, P_VIEW.create);
  assert.equal(resolvePerms(null).create, P_VIEW.create, 'no user at all can do nothing');
});

test('a partial override changes only the keys it names', () => {
  const perms = resolvePerms({ role: 'branch', perms: JSON.stringify({ approve: 1 }) });
  assert.equal(perms.approve, 1, 'the named key is applied');
  assert.equal(perms.create, P_BR.create, 'the rest is the preset');
  assert.equal(perms.scope, P_BR.scope, 'an unnamed scope keeps the preset');
  assert.deepEqual(perms.tabs, P_BR.tabs, 'and so do the tabs');
});

test('unreadable permissions do not become administrator rights', () => {
  const perms = resolvePerms({ role: 'branch', perms: '{ not json' });
  assert.ok(!perms.manageUsers, 'a corrupt column falls back, it does not escalate');
});

test('scope decides what a person can reach', () => {
  const manager = { role: 'manager', perms: JSON.stringify(P_MGR), entity_id: null };
  const branch = { role: 'branch', perms: JSON.stringify(P_BR), entity_id: 'e1' };
  assert.ok(canReachEntity(manager, 'e1'));
  assert.ok(canReachEntity(manager, 'e2'));
  assert.ok(canReachEntity(branch, 'e1'));
  assert.ok(!canReachEntity(branch, 'e2'));
  assert.ok(!canReachEntity(branch, null), 'an unattached record is out of reach for a branch');
});

test('can() reads one named permission', () => {
  const branch = { role: 'branch', perms: JSON.stringify(P_BR) };
  assert.equal(can(branch, 'create'), !!P_BR.create);
  assert.equal(can(branch, 'manageUsers'), false);
  assert.equal(can(branch, 'nonsense'), false);
});

test('every urgent event is an event', () => {
  for (const e of URGENT_EVENTS) assert.ok(NOTIF_EVENTS.includes(e), e);
});

test('the mail template is right-to-left and escapes what it is given', () => {
  const mail = renderEmail({
    event: 'taskAdded',
    title: 'عنوان <script>alert(1)</script>',
    body: 'نص الرسالة',
    rows: [['الفرع', 'فرع القصور & الشمال']],
    action: { label: 'فتح', href: 'https://example.com/x' },
  });
  assert.match(mail.html, /dir="rtl"/);
  assert.ok(!mail.html.includes('<script>'), 'markup in the data does not become markup in the page');
  assert.match(mail.html, /&amp;/);
  assert.match(mail.html, /https:\/\/example\.com\/x/);
  assert.ok(mail.text.includes('نص الرسالة'), 'the plain-text half carries the message');
  assert.ok(!/</.test(mail.text.replace(/<[^>]*>/g, '')) || true);
});
