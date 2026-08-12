import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, login } from './helpers.js';

let ctx;
let admin;
let sched;
let db;
let DAY;

test.before(async () => {
  ctx = await startTestServer();
  admin = await login(ctx.base, 'admin@mutabi.local');
  sched = await import('../src/services/scheduler.js');
  db = (await import('../src/db/index.js')).getDb();
  ({ DAY } = await import('../src/lib/time.js'));
});

test.after(async () => { await ctx.close(); });

function unreadFor(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user = ? AND read = 0').get(userId).n;
}

function overdueNoticesFor(taskId, userId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE task = ? AND user = ? AND kind = 'overdue'")
    .get(taskId, userId).n;
}

test('a due date generates exactly one automatic reminder', async () => {
  const created = await admin.post('/api/tasks', {
    title: 'Auto reminder', assignee: 'u_sara', dueDate: '2099-03-10',
  });
  const id = created.body.task.id;
  const autos = db.prepare('SELECT * FROM reminders WHERE task = ? AND auto = 1').all(id);
  assert.equal(autos.length, 1);
  /* One day of lead time by default. */
  assert.ok(autos[0].fire_at < new Date('2099-03-10T23:59:59').getTime());
});

test('moving the deadline replaces the reminder rather than stacking one', async () => {
  const created = await admin.post('/api/tasks', { title: 'Moving target', dueDate: '2099-03-10' });
  const id = created.body.task.id;
  await admin.patch(`/api/tasks/${id}`, { dueDate: '2099-04-20' });
  await admin.patch(`/api/tasks/${id}`, { dueDate: '2099-05-30' });
  const autos = db.prepare('SELECT * FROM reminders WHERE task = ? AND auto = 1 AND fired = 0').all(id);
  assert.equal(autos.length, 1, 'a rescheduled task must not keep its old alarm');
});

test('closing a task removes its pending automatic reminder', async () => {
  const created = await admin.post('/api/tasks', { title: 'Closing early', dueDate: '2099-07-01' });
  const id = created.body.task.id;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE task = ? AND fired = 0').get(id).n, 1);
  await admin.patch(`/api/tasks/${id}`, { status: 'done' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE task = ? AND fired = 0').get(id).n, 0);
});

test('a due reminder fires once and reaches every follower', async () => {
  const created = await admin.post('/api/tasks', { title: 'Ring on time', assignee: 'u_sara' });
  const id = created.body.task.id;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });

  db.prepare(
    `INSERT INTO reminders (id, task, user, fire_at, kind, note, fired, auto, created_at)
     VALUES ('rem_test', ?, NULL, ?, 'reminder', '', 0, 0, ?)`,
  ).run(id, Date.now() - 1000, Date.now());

  const saraBefore = unreadFor('u_sara');
  const omarBefore = unreadFor('u_omar');

  assert.equal(sched.fireReminders(), 1);
  assert.equal(unreadFor('u_sara'), saraBefore + 1);
  assert.equal(unreadFor('u_omar'), omarBefore + 1);

  /* A second pass must be a no-op — this is what stops a restart from
     re-notifying everybody. */
  assert.equal(sched.fireReminders(), 0);
  assert.equal(unreadFor('u_sara'), saraBefore + 1);
});

test('a reminder for a task that closed in the meantime is consumed silently', async () => {
  const created = await admin.post('/api/tasks', { title: 'Closed before firing', assignee: 'u_sara' });
  const id = created.body.task.id;
  await admin.patch(`/api/tasks/${id}`, { status: 'done' });
  db.prepare(
    `INSERT INTO reminders (id, task, user, fire_at, kind, note, fired, auto, created_at)
     VALUES ('rem_closed', ?, 'u_sara', ?, 'reminder', '', 0, 0, ?)`,
  ).run(id, Date.now() - 1000, Date.now());

  const before = unreadFor('u_sara');
  sched.fireReminders();
  assert.equal(unreadFor('u_sara'), before, 'a closed task must not raise a reminder');
  assert.equal(db.prepare("SELECT fired FROM reminders WHERE id = 'rem_closed'").get().fired, 1);
});

test('going overdue is announced once, to everybody following', async () => {
  const created = await admin.post('/api/tasks', {
    title: 'Late work', assignee: 'u_sara', dueDate: '2000-01-01',
  });
  const id = created.body.task.id;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });

  const flagged = sched.flagOverdue();
  assert.ok(flagged >= 1);
  /* Counted per task, not per inbox: the same pass legitimately flags the
     seeded overdue rows too. */
  assert.equal(overdueNoticesFor(id, 'u_sara'), 1, 'the assignee is told');
  assert.equal(overdueNoticesFor(id, 'u_omar'), 1, 'the follower is told');

  sched.flagOverdue();
  assert.equal(overdueNoticesFor(id, 'u_sara'), 1, 'a task goes overdue once, not once per tick');
  assert.equal(overdueNoticesFor(id, 'u_omar'), 1);
});

test('rescheduling an overdue task lets it announce itself again', async () => {
  const created = await admin.post('/api/tasks', { title: 'Rescheduled late', assignee: 'u_sara', dueDate: '2000-01-01' });
  const id = created.body.task.id;
  sched.flagOverdue();
  assert.equal(db.prepare('SELECT overdue_flagged FROM tasks WHERE id = ?').get(id).overdue_flagged, 1);

  await admin.patch(`/api/tasks/${id}`, { dueDate: '2099-01-01' });
  assert.equal(db.prepare('SELECT overdue_flagged FROM tasks WHERE id = ?').get(id).overdue_flagged, 0);
  assert.equal(db.prepare('SELECT escalated_at FROM tasks WHERE id = ?').get(id).escalated_at, null);
});

test('work that stays overdue escalates to the manager, once', async () => {
  const created = await admin.post('/api/tasks', {
    title: 'Escalating item', assignee: 'u_sara', dueDate: '2000-01-01',
  });
  const id = created.body.task.id;

  const laylaBefore = unreadFor('u_layla');   // Sara reports to Layla
  const escalated = sched.escalate();
  assert.ok(escalated >= 1);

  const row = db.prepare('SELECT escalated_to, escalated_at FROM tasks WHERE id = ?').get(id);
  assert.equal(row.escalated_to, 'u_layla');
  assert.ok(row.escalated_at > 0);
  assert.ok(unreadFor('u_layla') > laylaBefore);

  const after = unreadFor('u_layla');
  sched.escalate();
  assert.equal(unreadFor('u_layla'), after, 'an escalation is stamped once');
});

test('an escalation notification is recorded as the escalation kind', async () => {
  const row = db
    .prepare("SELECT * FROM notifications WHERE user = 'u_layla' AND kind = 'escalation' ORDER BY created_at DESC LIMIT 1")
    .get();
  assert.ok(row, 'the manager must have an escalation in their inbox');
  assert.match(row.text, /overdue/);
});

test('a task inside its escalation window is left alone', async () => {
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const created = await admin.post('/api/tasks', {
    title: 'Recently late', assignee: 'u_sara', dueDate: yesterday, escalationDays: 5,
  });
  sched.escalate();
  const row = db.prepare('SELECT escalated_at FROM tasks WHERE id = ?').get(created.body.task.id);
  assert.equal(row.escalated_at, null, 'one day late must not escalate a five-day threshold');
});

test('a full tick runs every engine and flushes the mail queue', async () => {
  const res = await admin.post('/api/admin/tick');
  assert.equal(res.status, 200);
  assert.ok(Number.isFinite(res.body.reminders));
  assert.ok(Number.isFinite(res.body.overdue));
  assert.ok(Number.isFinite(res.body.escalated));
  assert.equal(res.body.mail.failed, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM emails WHERE state = 'queued' AND (next_try_at IS NULL OR next_try_at <= ?)").get(Date.now()).n, 0);
});

test('a tick is safe to run repeatedly', async () => {
  const first = await admin.post('/api/admin/tick');
  const second = await admin.post('/api/admin/tick');
  assert.equal(second.body.overdue, 0, 'a second immediate pass has nothing left to flag');
  assert.equal(second.body.escalated, 0);
  assert.ok(first.status === 200 && second.status === 200);
});
