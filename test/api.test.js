import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, login, client, PASSWORD } from './helpers.js';

let ctx;
let admin;
let layla;
let sara;
let omar;
let faris;

test.before(async () => {
  ctx = await startTestServer();
  admin = await login(ctx.base, 'admin@mutabi.local');
  layla = await login(ctx.base, 'layla@mutabi.local');
  sara = await login(ctx.base, 'sara@mutabi.local');
  omar = await login(ctx.base, 'omar@mutabi.local');
  faris = await login(ctx.base, 'faris@mutabi.local');
});

test.after(async () => { await ctx.close(); });

test('health reports a working process', async () => {
  const res = await client(ctx.base).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mailTransport, 'json');
});

test('bad credentials are rejected', async () => {
  const res = await client(ctx.base).post('/api/auth/login', { email: 'admin@mutabi.local', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'invalid_credentials');
});

test('an unknown account is rejected the same way', async () => {
  const res = await client(ctx.base).post('/api/auth/login', { email: 'nobody@mutabi.local', password: PASSWORD });
  assert.equal(res.status, 401);
});

test('protected endpoints require a token', async () => {
  const anon = client(ctx.base);
  assert.equal((await anon.get('/api/tasks')).status, 401);
  assert.equal((await anon.get('/api/notifications')).status, 401);
  assert.equal((await anon.get('/api/meta/bootstrap')).status, 401);
});

test('a tampered token is refused', async () => {
  const bad = client(ctx.base, 'not.a.jwt');
  assert.equal((await bad.get('/api/tasks')).status, 401);
});

test('bootstrap carries the reference data the client needs', async () => {
  const res = await admin.get('/api/meta/bootstrap');
  assert.equal(res.status, 200);
  assert.equal(res.body.users.length, 7);
  assert.equal(res.body.statuses.length, 11);
  assert.deepEqual(res.body.priorities, ['Critical', 'High', 'Medium', 'Low']);
  assert.ok(res.body.notifyEvents.includes('escalation'));
  /* Statuses are workflow states a person chose — never derived conditions. */
  const ids = res.body.statuses.map((s) => s.id);
  assert.ok(!ids.includes('overdue'));
  assert.ok(!ids.includes('duesoon'));
});

test('an administrator sees every task; a member sees only their reach', async () => {
  const all = await admin.get('/api/tasks');
  const mine = await sara.get('/api/tasks');
  assert.equal(all.status, 200);
  assert.ok(all.body.count >= 8);
  assert.ok(mine.body.count < all.body.count, 'a member must not see the whole organisation');
  for (const task of mine.body.tasks) {
    const attached = task.assignee === 'u_sara' || task.owner === 'u_sara' || task.watchers.includes('u_sara');
    assert.ok(attached || task.team === 't_field', `unexpected row for a member: ${task.id}`);
  }
});

test('a task outside a member reach is a 404, not a 403', async () => {
  /* Existence itself is privileged: a member must not learn the id is real. */
  const res = await omar.get('/api/tasks/T-1002');
  assert.equal(res.status, 404);
});

test('a viewer cannot create a task', async () => {
  const res = await faris.post('/api/tasks', { title: 'Should not exist' });
  assert.equal(res.status, 403);
});

test('a task requires a title', async () => {
  const res = await admin.post('/api/tasks', { title: '   ' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'title_required');
});

test('invalid enumerations are rejected with the allowed set', async () => {
  const prio = await admin.post('/api/tasks', { title: 'x', priority: 'Urgent' });
  assert.equal(prio.status, 400);
  assert.deepEqual(prio.body.allowed, ['Critical', 'High', 'Medium', 'Low']);

  const status = await admin.post('/api/tasks', { title: 'x', status: 'nope' });
  assert.equal(status.status, 400);
  assert.equal(status.body.error, 'invalid_status');

  const due = await admin.post('/api/tasks', { title: 'x', dueDate: '20-08-2026' });
  assert.equal(due.status, 400);
  assert.equal(due.body.error, 'invalid_due_date');
});

test('creating a task makes the creator and assignee followers', async () => {
  const res = await admin.post('/api/tasks', {
    title: 'Prepare the quarterly follow-up pack',
    titleAr: 'إعداد حزمة المتابعة الفصلية',
    assignee: 'u_sara',
    priority: 'High',
    dueDate: '2099-01-01',
  });
  assert.equal(res.status, 201);
  const task = res.body.task;
  assert.ok(task.id.startsWith('T-'));
  assert.deepEqual([...task.watchers].sort(), ['u_admin', 'u_sara']);
  assert.equal(task.status, 'assigned');
  assert.equal(task.overdue, false);
});

test('a member cannot assign work to somebody else', async () => {
  const res = await sara.post('/api/tasks', { title: 'Delegating upward', assignee: 'u_omar' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'forbidden_assign');
});

test('a read-only row cannot be written through any route', async () => {
  /* Faris is a viewer: reports.view gives him reach over project rows, but
     task.edit is not in his role, so every write must be refused. */
  const list = await faris.get('/api/tasks');
  const readable = list.body.tasks.find((x) => x.access === 'view');
  if (!readable) return; // nothing in view-only reach for this fixture
  assert.equal((await faris.patch(`/api/tasks/${readable.id}`, { title: 'nope' })).status, 403);
  assert.equal((await faris.post(`/api/tasks/${readable.id}/comments`, { text: 'nope' })).status, 403);
  assert.equal((await faris.post(`/api/tasks/${readable.id}/checklist`, { text: 'nope' })).status, 403);
});

test('updating a task records history', async () => {
  const created = await admin.post('/api/tasks', { title: 'History check' });
  const id = created.body.task.id;
  await admin.patch(`/api/tasks/${id}`, { priority: 'Critical', progress: 40 });
  const res = await admin.get(`/api/tasks/${id}/history`);
  assert.equal(res.status, 200);
  const fields = res.body.history.map((h) => h.field);
  assert.ok(fields.includes('priority'));
  assert.ok(fields.includes('progress'));
});

test('progress is clamped rather than trusted', async () => {
  const created = await admin.post('/api/tasks', { title: 'Clamp check' });
  const id = created.body.task.id;
  assert.equal((await admin.patch(`/api/tasks/${id}`, { progress: 5000 })).body.task.progress, 100);
  assert.equal((await admin.patch(`/api/tasks/${id}`, { progress: -20 })).body.task.progress, 0);
});

test('completing a task stamps the closure time and derives closed', async () => {
  const created = await admin.post('/api/tasks', { title: 'Closure check' });
  const id = created.body.task.id;
  const res = await admin.patch(`/api/tasks/${id}`, { status: 'done' });
  assert.equal(res.body.task.closed, true);
  assert.ok(res.body.task.completedAt > 0);
  const reopened = await admin.patch(`/api/tasks/${id}`, { status: 'progress' });
  assert.equal(reopened.body.task.closed, false);
  assert.equal(reopened.body.task.completedAt, null);
});

test('overdue is derived, never stored, and a closed task is never overdue', async () => {
  const created = await admin.post('/api/tasks', { title: 'Derived overdue', dueDate: '2000-01-01' });
  const id = created.body.task.id;
  assert.equal((await admin.get(`/api/tasks/${id}`)).body.task.overdue, true);
  await admin.patch(`/api/tasks/${id}`, { status: 'done' });
  assert.equal((await admin.get(`/api/tasks/${id}`)).body.task.overdue, false);
});

test('following and unfollowing a task works for the person themselves', async () => {
  const created = await layla.post('/api/tasks', { title: 'Follow me', dept: 'ops', team: 't_field' });
  const id = created.body.task.id;

  const before = await sara.get(`/api/tasks/${id}/watchers`);
  assert.ok(!before.body.watchers.some((w) => w.id === 'u_sara'));

  const followed = await sara.post(`/api/tasks/${id}/watchers`, {});
  assert.equal(followed.status, 201);
  assert.ok(followed.body.watchers.some((w) => w.id === 'u_sara'));

  const unfollowed = await sara.del(`/api/tasks/${id}/watchers/u_sara`);
  assert.equal(unfollowed.body.removed, true);
  assert.ok(!unfollowed.body.watchers.some((w) => w.id === 'u_sara'));
});

test('the following filter returns exactly what a person follows', async () => {
  const created = await admin.post('/api/tasks', { title: 'Filter following' });
  const id = created.body.task.id;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });
  const res = await omar.get('/api/tasks?following=1');
  assert.ok(res.body.tasks.every((x) => x.watchers.includes('u_omar')));
  assert.ok(res.body.tasks.some((x) => x.id === id));
});

test('checklist items are added, toggled and removed', async () => {
  const created = await admin.post('/api/tasks', { title: 'Checklist host' });
  const id = created.body.task.id;
  const item = await admin.post(`/api/tasks/${id}/checklist`, { text: 'First step' });
  assert.equal(item.status, 201);
  const toggled = await admin.patch(`/api/tasks/${id}/checklist/${item.body.item.id}`, { done: true });
  assert.equal(toggled.body.item.done, 1);
  assert.equal((await admin.del(`/api/tasks/${id}/checklist/${item.body.item.id}`)).body.ok, true);
});

test('a reminder needs a real time', async () => {
  const created = await admin.post('/api/tasks', { title: 'Reminder host' });
  const res = await admin.post(`/api/tasks/${created.body.task.id}/reminders`, { at: 'sometime' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_time');
});

test('deleting a task requires the permission', async () => {
  const created = await admin.post('/api/tasks', { title: 'Delete me', assignee: 'u_sara' });
  const id = created.body.task.id;
  assert.equal((await sara.del(`/api/tasks/${id}`)).status, 403);
  assert.equal((await admin.del(`/api/tasks/${id}`)).status, 200);
  assert.equal((await admin.get(`/api/tasks/${id}`)).status, 404);
});

test('an unknown API path answers with JSON, not the SPA shell', async () => {
  const res = await admin.get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'unknown_endpoint');
});

test('the SPA shell is served for a deep link', async () => {
  const res = await fetch(`${ctx.base}/some/deep/link`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<div id="root">/);
});

test('a person can change their own password and then sign in with it', async () => {
  const target = await login(ctx.base, 'huda@mutabi.local');
  assert.equal((await target.post('/api/auth/me/password', { current: 'wrong', next: 'LongEnough#1' })).status, 400);
  assert.equal((await target.post('/api/auth/me/password', { current: PASSWORD, next: 'short' })).status, 400);
  assert.equal((await target.post('/api/auth/me/password', { current: PASSWORD, next: 'NewPassword#2026' })).status, 200);
  const again = await login(ctx.base, 'huda@mutabi.local', 'NewPassword#2026');
  assert.equal((await again.get('/api/auth/me')).status, 200);
});

test('only an administrator may manage people', async () => {
  assert.equal((await layla.get('/api/admin/users')).status, 403);
  assert.equal((await admin.get('/api/admin/users')).status, 200);
  const created = await admin.post('/api/admin/users', {
    email: 'new.person@mutabi.local', name: 'New Person', password: 'Another#2026', role: 'member',
  });
  assert.equal(created.status, 201);
  assert.equal((await admin.post('/api/admin/users', {
    email: 'new.person@mutabi.local', name: 'Duplicate', password: 'Another#2026',
  })).status, 409);
});
