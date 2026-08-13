/* Notifications: the badge, the live channel, and the mail queue behind it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, base, db, listen, makeEntity, member, stop } from './helpers.js';

test.after(stop);

const world = {};

test('setup', async () => {
  world.admin = await admin();
  world.entityId = await makeEntity(world.admin, 'فرع الفنطاس');
  world.branch = await member(world.admin, {
    username: 'badr', name: 'بدر', email: 'badr@example.com', entityId: world.entityId,
  });
  world.cats = (await world.admin.get('/api/bootstrap')).body.entities
    .find((e) => e.id === world.entityId).categories;
});

test('an application notifies the administrator, in the app and by mail', async () => {
  const before = (await world.admin.get('/api/bootstrap')).body.unread;
  const mailBefore = (await world.admin.get('/api/admin/emails')).body.emails.length;

  const anon = (await import('./helpers.js')).client();
  await anon.post('/api/auth/register', {
    name: 'ريم', username: 'reem', email: 'reem@example.com', password: 'Reem@2026',
  });

  const after = (await world.admin.get('/api/bootstrap')).body;
  assert.ok(after.unread > before, 'the badge advanced');
  assert.equal(after.pendingRegistrations, 1);

  const list = (await world.admin.get('/api/notifications')).body.notifications;
  assert.equal(list[0].event, 'registration');
  assert.match(list[0].title, /ريم/);

  const mail = (await world.admin.get('/api/admin/emails')).body.emails;
  assert.ok(mail.length > mailBefore, 'a message was queued');
  assert.match(mail[0].subject, /طلب تسجيل/);
});

test('a decision reaches the applicant on the address they applied with', async () => {
  const queue = await world.admin.get('/api/admin/registrations');
  const row = queue.body.registrations.find((r) => r.username === 'reem');
  await world.admin.post(`/api/admin/registrations/${row.id}/approve`, {
    role: 'branch', entityId: world.entityId,
  });
  const mail = (await world.admin.get('/api/admin/emails')).body.emails;
  const toApplicant = mail.find((m) => m.to_email === 'reem@example.com');
  assert.ok(toApplicant, 'the applicant was written to');
  assert.match(toApplicant.subject, /اعتماد الحساب/);
});

test('a rejection says so, to the applicant', async () => {
  const anon = (await import('./helpers.js')).client();
  await anon.post('/api/auth/register', {
    name: 'فهد', username: 'fahad', email: 'fahad@example.com', password: 'Fahad@2026',
  });
  const queue = await world.admin.get('/api/admin/registrations');
  const row = queue.body.registrations.find((r) => r.username === 'fahad');
  await world.admin.post(`/api/admin/registrations/${row.id}/reject`, { note: 'لا يوجد شاغر' });
  const mail = (await world.admin.get('/api/admin/emails')).body.emails;
  const toApplicant = mail.find((m) => m.to_email === 'fahad@example.com');
  assert.ok(toApplicant);
  assert.match(toApplicant.body, /لا يوجد شاغر/);
});

test('a new record wakes the administrator over the live channel', async () => {
  const stream = await listen(world.admin.token, 3);
  await new Promise((r) => setTimeout(r, 150));

  await world.branch.post('/api/issues', {
    entityId: world.entityId, categoryId: world.cats[0].id, title: 'انقطاع الكهرباء عن المطبخ',
    priority: 'urgent',
  });

  const events = await stream.done();
  const kinds = events.map((e) => e.event);
  assert.ok(kinds.includes('hello'), 'the channel opens with a greeting');
  const note = events.find((e) => e.event === 'notification');
  assert.ok(note, 'the notification arrived without polling');
  assert.match(note.data.subject, /انقطاع الكهرباء/);
  assert.equal(typeof note.data.urgent, 'boolean');
  assert.ok(events.some((e) => e.event === 'badge'), 'and the badge count with it');
});

test('nobody is told about their own action', async () => {
  const before = (await world.branch.get('/api/bootstrap')).body.unread;
  await world.branch.post('/api/issues', {
    entityId: world.entityId, categoryId: world.cats[0].id, title: 'ملاحظة صامتة',
  });
  const after = (await world.branch.get('/api/bootstrap')).body.unread;
  assert.equal(after, before, 'the author gets no notification of their own work');
});

test('the badge clears on read, one at a time and all at once', async () => {
  const list = (await world.admin.get('/api/notifications')).body.notifications;
  const unread = list.filter((n) => !n.read);
  assert.ok(unread.length >= 2, 'there is something to clear');

  const one = await world.admin.post('/api/notifications/read', { ids: [unread[0].id] });
  assert.equal(one.status, 200);
  assert.equal(one.body.unread, unread.length - 1);

  const all = await world.admin.post('/api/notifications/read-all');
  assert.equal(all.body.unread, 0);
  assert.equal((await world.admin.get('/api/bootstrap')).body.unread, 0);
});

test('a switched-off event raises nothing at all', async () => {
  const cfg = (await world.admin.get('/api/admin/notifications-config')).body.notif;
  await world.admin.put('/api/admin/notifications-config', {
    ...cfg, types: { ...cfg.types, taskAdded: false },
  });

  const unreadBefore = (await world.admin.get('/api/bootstrap')).body.unread;
  const mailBefore = (await world.admin.get('/api/admin/emails')).body.emails.length;
  await world.branch.post('/api/issues', {
    entityId: world.entityId, categoryId: world.cats[0].id, title: 'لن يُشعر بها أحد',
  });
  assert.equal((await world.admin.get('/api/bootstrap')).body.unread, unreadBefore);
  const mailAfter = (await world.admin.get('/api/admin/emails')).body.emails;
  assert.equal(mailAfter.length, mailBefore + 1, 'the attempt is still logged');
  assert.equal(mailAfter[0].state, 'suppressed', 'as suppressed, not sent');

  await world.admin.put('/api/admin/notifications-config', { ...cfg, types: { ...cfg.types, taskAdded: true } });
});

test('turning notifications off entirely stops everything', async () => {
  const cfg = (await world.admin.get('/api/admin/notifications-config')).body.notif;
  await world.admin.put('/api/admin/notifications-config', { ...cfg, enabled: false });
  const before = (await world.admin.get('/api/bootstrap')).body.unread;
  await world.branch.post('/api/issues', {
    entityId: world.entityId, categoryId: world.cats[0].id, title: 'صمت تام',
  });
  assert.equal((await world.admin.get('/api/bootstrap')).body.unread, before);
  await world.admin.put('/api/admin/notifications-config', { ...cfg, enabled: true });
});

test('the test button reaches the person who pressed it', async () => {
  const before = (await world.admin.get('/api/bootstrap')).body.unread;
  const res = await world.admin.post('/api/admin/notifications-test');
  assert.equal(res.status, 200);
  assert.ok(res.body.result.inApp >= 1);
  assert.ok((await world.admin.get('/api/bootstrap')).body.unread > before);
});

test('the queue drains and each message records its attempt', async () => {
  const queued = db.prepare("SELECT COUNT(*) c FROM emails WHERE state = 'queued'").get().c;
  assert.ok(queued > 0, 'there is mail waiting');
  const flushed = await world.admin.post('/api/admin/mail/flush');
  assert.equal(flushed.status, 200);
  assert.equal(flushed.body.failed, 0);
  assert.ok(flushed.body.sent >= 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM emails WHERE state = 'queued'").get().c, 0);
  assert.ok(db.prepare("SELECT COUNT(*) c FROM emails WHERE state = 'sent' AND attempts > 0").get().c >= 1);
});

test('a message is addressed, subjected and bodied in Arabic', async () => {
  const row = db.prepare("SELECT * FROM emails WHERE state = 'sent' ORDER BY created_at DESC").get();
  assert.match(row.subject, /^\[متابِع\]/);
  assert.match(row.html, /dir="rtl"/);
  assert.ok(row.body && row.body.length > 10, 'a plain-text alternative exists');
});

test('the engine flags what has fallen due', async () => {
  const overdue = await world.admin.post('/api/issues', {
    entityId: world.entityId, categoryId: world.cats[0].id, title: 'متأخرة منذ أسبوع',
    dueDate: Date.now() - 7 * 86400000,
  });
  assert.equal(overdue.status, 201);
  const tick = await world.admin.post('/api/admin/tick');
  assert.equal(tick.status, 200);
  assert.ok(tick.body.overdue >= 1, 'the overdue record was picked up');

  const notes = (await world.admin.get('/api/notifications')).body.notifications;
  assert.ok(notes.some((n) => n.event === 'overdue'), 'and it raised a notification');

  /* A second tick must not repeat itself. */
  const again = await world.admin.post('/api/admin/tick');
  assert.equal(again.body.overdue, 0, 'nothing is flagged twice');
});

test('the live channel refuses a caller without a token', async () => {
  const res = await fetch(`${base}/api/stream`, { headers: { accept: 'text/event-stream' } });
  assert.equal(res.status, 401);
  await res.text();
});

test('the mail transport reports itself', async () => {
  const res = await world.admin.get('/api/admin/mail/verify');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal((await world.admin.get('/api/admin/emails')).body.transport, 'json');
});

test('a branch account cannot touch the notification settings', async () => {
  assert.equal((await world.branch.get('/api/admin/notifications-config')).status, 403);
  assert.equal((await world.branch.post('/api/admin/mail/flush')).status, 403);
  assert.equal((await world.branch.post('/api/admin/tick')).status, 403);
});
