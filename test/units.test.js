import test from 'node:test';
import assert from 'node:assert/strict';
import { dueInstant, inQuietHours, quietWindowEnd, isOverdue, addDays, isoDate, isValidClock, isValidDate, DAY } from '../src/lib/time.js';
import { normalizePrefs, eventForKind, MANDATORY_KINDS } from '../src/lib/prefs.js';
import { can, taskAccess, ROLES, PERMS } from '../src/lib/permissions.js';
import { renderEmail, notifTitle, escapeHtml } from '../src/services/templates.js';
import { uid } from '../src/lib/ids.js';

/* ------------------------------------------------------------------ time --- */

test('a due date without a time means the end of that day', () => {
  const inst = dueInstant('2026-08-12', null);
  const d = new Date(inst);
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
});

test('a due time makes the deadline an instant', () => {
  const d = new Date(dueInstant('2026-08-12', '09:30'));
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
});

test('a malformed due date yields no instant rather than an invalid one', () => {
  assert.equal(dueInstant('not-a-date', null), null);
  assert.equal(dueInstant(null, '09:00'), null);
});

test('overdue is a function of the deadline and closure, nothing else', () => {
  const closed = new Set(['done', 'cancelled']);
  const past = { due_date: '2000-01-01', due_time: null, status: 'progress' };
  const future = { due_date: '2099-01-01', due_time: null, status: 'progress' };
  assert.equal(isOverdue(past, closed), true);
  assert.equal(isOverdue(future, closed), false);
  assert.equal(isOverdue({ ...past, status: 'done' }, closed), false);
  assert.equal(isOverdue({ due_date: null, status: 'progress' }, closed), false);
});

test('quiet hours handle a window that crosses midnight', () => {
  const quiet = { from: '21:00', to: '07:00' };
  const at = (h, m = 0) => new Date(2026, 0, 15, h, m);
  assert.equal(inQuietHours(quiet, at(22)), true);
  assert.equal(inQuietHours(quiet, at(3)), true);
  assert.equal(inQuietHours(quiet, at(6, 59)), true);
  assert.equal(inQuietHours(quiet, at(7)), false);
  assert.equal(inQuietHours(quiet, at(12)), false);
  assert.equal(inQuietHours(quiet, at(20, 59)), false);
});

test('quiet hours also handle a window inside one day', () => {
  const quiet = { from: '13:00', to: '14:00' };
  assert.equal(inQuietHours(quiet, new Date(2026, 0, 15, 13, 30)), true);
  assert.equal(inQuietHours(quiet, new Date(2026, 0, 15, 15, 0)), false);
});

test('an empty or equal window is never quiet', () => {
  assert.equal(inQuietHours(null, new Date()), false);
  assert.equal(inQuietHours({ from: '09:00', to: '09:00' }, new Date(2026, 0, 15, 9, 0)), false);
});

test('the held-email release time is always in the future', () => {
  const at = new Date(2026, 0, 15, 22, 30);
  const end = quietWindowEnd({ from: '21:00', to: '07:00' }, at);
  assert.ok(end > at.getTime());
  const d = new Date(end);
  assert.equal(d.getHours(), 7);
  assert.equal(d.getDate(), 16, 'a window that crosses midnight releases the next morning');
});

test('a clock value is range-checked, not just pattern-matched', () => {
  assert.equal(isValidClock('09:30'), true);
  assert.equal(isValidClock('23:59'), true);
  assert.equal(isValidClock('0:00'), true);
  assert.equal(isValidClock('24:00'), false);
  assert.equal(isValidClock('25:99'), false);
  assert.equal(isValidClock('12:60'), false);
  assert.equal(isValidClock(''), false);
  assert.equal(isValidClock(null), false);
});

test('a date value must be a day that exists', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2024-02-29'), true, '2024 is a leap year');
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-1'), false);
  assert.equal(isValidDate('yesterday'), false);
});

test('date helpers stay on the calendar', () => {
  assert.equal(isoDate(new Date(2026, 1, 3)), '2026-02-03');
  assert.equal(isoDate(addDays(new Date(2026, 0, 31), 1)), '2026-02-01');
  assert.equal(DAY, 86400000);
});

/* ----------------------------------------------------------------- prefs --- */

test('preferences fill in every gap rather than silencing somebody', () => {
  const prefs = normalizePrefs({});
  assert.equal(prefs.email.mode, 'all');
  assert.equal(prefs.inApp.enabled, true);
  assert.equal(prefs.inApp.sound, true);
  assert.equal(prefs.inApp.desktop, false);
  for (const key of Object.keys(prefs.email.events)) assert.equal(prefs.email.events[key], true);
});

test('a half-written preference blob keeps its explicit values', () => {
  const prefs = normalizePrefs({ inApp: { sound: false }, email: { events: { overdue: false } } });
  assert.equal(prefs.inApp.sound, false);
  assert.equal(prefs.inApp.enabled, true);
  assert.equal(prefs.email.events.overdue, false);
  assert.equal(prefs.email.events.assign, true);
});

test('a corrupt preference string does not throw', () => {
  const prefs = normalizePrefs('{not json');
  assert.equal(prefs.email.mode, 'all');
});

test('every notification kind maps to a preference the person can find', () => {
  for (const kind of ['assign', 'reminder', 'overdue', 'comment', 'mention', 'escalation', 'approval', 'complete', 'watch']) {
    assert.ok(eventForKind(kind), `${kind} must map to an event`);
  }
  assert.ok(MANDATORY_KINDS.has('escalation'));
  assert.ok(MANDATORY_KINDS.has('approval'));
  assert.ok(!MANDATORY_KINDS.has('comment'));
});

/* ----------------------------------------------------------- permissions --- */

test('the role matrix matches the delivered definition', () => {
  assert.equal(ROLES.admin.perms.length, PERMS.length);
  assert.ok(can({ role: 'admin' }, 'manage.users'));
  assert.ok(!can({ role: 'manager' }, 'manage.users'));
  assert.ok(!can({ role: 'manager' }, 'view.org'));
  assert.ok(can({ role: 'member' }, 'task.create'));
  assert.ok(!can({ role: 'member' }, 'task.delete'));
  assert.ok(!can({ role: 'viewer' }, 'task.create'));
  assert.ok(can({ role: 'viewer' }, 'reports.view'));
  assert.equal(can(null, 'task.view'), false);
  assert.equal(can({ role: 'ghost' }, 'task.view'), false);
});

test('personal attachment always beats structural reach', () => {
  const viewer = { id: 'u1', role: 'viewer', dept: 'd9', team: 't9' };
  const task = { id: 'T-1', assignee: 'u1', owner: 'u2', dept: 'other', team: 'other' };
  /* A viewer cannot edit, but the record must still exist for them. */
  assert.equal(taskAccess(viewer, task, {}, {}), 'view');

  const member = { id: 'u1', role: 'member', dept: 'd9', team: 't9' };
  assert.equal(taskAccess(member, task, {}, {}), 'edit');
});

test('a follower can reach a task nothing else would give them', () => {
  const member = { id: 'u5', role: 'member', dept: 'x', team: 'x' };
  const task = { id: 'T-2', assignee: 'u9', owner: 'u9', dept: 'y', team: 'y' };
  assert.equal(taskAccess(member, task, { watchers: [], participants: [] }, {}), 'none');
  assert.equal(taskAccess(member, task, { watchers: ['u5'], participants: [] }, {}), 'edit');
});

test('an unrelated record does not exist for an unrelated person', () => {
  const member = { id: 'u5', role: 'member', dept: 'x', team: 'x' };
  const task = { id: 'T-3', assignee: 'u9', owner: 'u9', dept: 'y', team: 'y' };
  assert.equal(taskAccess(member, task, {}, {}), 'none');
});

test('a manager reaches the work of a direct report', () => {
  const manager = { id: 'm1', role: 'manager', dept: 'x', team: 'x' };
  const task = { id: 'T-4', assignee: 'r1', owner: 'r1', dept: null, team: null };
  assert.equal(taskAccess(manager, task, {}, { directReports: new Set() }), 'none');
  assert.equal(taskAccess(manager, task, {}, { directReports: new Set(['r1']) }), 'edit');
});

/* ------------------------------------------------------------- templates --- */

test('an email is rendered in the reader own language', () => {
  const task = { id: 'T-9', title: 'Ship it', title_ar: 'أطلقها', priority: 'High', due_date: '2026-09-01', due_time: null, status: 'progress' };
  const ar = renderEmail({ kind: 'assign', user: { name: 'Sara', name_ar: 'سارة', lang: 'ar' }, task, text: 'hello', textAr: 'مرحبا' });
  assert.ok(ar.subject.includes('أُسندت إليك مهمة'));
  assert.ok(ar.html.includes('dir="rtl"'));
  assert.ok(ar.text.includes('مرحبا'));

  const en = renderEmail({ kind: 'assign', user: { name: 'Omar', lang: 'en' }, task, text: 'hello', textAr: 'مرحبا' });
  assert.ok(en.subject.includes('Task assigned to you'));
  assert.ok(en.html.includes('dir="ltr"'));
  assert.ok(en.text.includes('hello'));
});

test('a message without a task still renders', () => {
  const out = renderEmail({ kind: 'reminder', user: { name: 'X', lang: 'en' }, task: null, text: 'Standalone' });
  assert.ok(out.subject.includes('Reminder'));
  assert.ok(out.text.includes('Standalone'));
  assert.ok(!out.html.includes('undefined'));
});

test('content is escaped, so a task title cannot inject markup', () => {
  const task = { id: 'T-x', title: '<img src=x onerror=alert(1)>', title_ar: '', priority: 'Low', due_date: null, status: 'new' };
  const out = renderEmail({ kind: 'assign', user: { name: '<b>me</b>', lang: 'en' }, task, text: '<script>bad()</script>' });
  assert.ok(!out.html.includes('<img src=x'));
  assert.ok(!out.html.includes('<script>'));
  assert.ok(out.html.includes('&lt;img'));
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('an unknown kind falls back to its own name rather than an empty subject', () => {
  assert.equal(notifTitle('nonexistent', 'en'), 'nonexistent');
  assert.equal(notifTitle('overdue', 'ar'), 'مهمة متأخرة');
});

/* -------------------------------------------------------------------- ids --- */

test('identifiers are unique and carry their prefix', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) seen.add(uid('n'));
  assert.equal(seen.size, 5000);
  assert.ok([...seen][0].startsWith('n_'));
});
