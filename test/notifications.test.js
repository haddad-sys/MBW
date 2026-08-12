import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, login, client } from './helpers.js';

let ctx;
let admin;
let layla;
let sara;
let omar;
let mailer;
let notifySvc;
let db;

test.before(async () => {
  ctx = await startTestServer();
  admin = await login(ctx.base, 'admin@mutabi.local');
  layla = await login(ctx.base, 'layla@mutabi.local');
  sara = await login(ctx.base, 'sara@mutabi.local');
  omar = await login(ctx.base, 'omar@mutabi.local');
  mailer = await import('../src/services/mailer.js');
  notifySvc = await import('../src/services/notify.js');
  db = (await import('../src/db/index.js')).getDb();
});

test.after(async () => { await ctx.close(); });

function mailFor(userId, kind) {
  return db
    .prepare('SELECT * FROM emails WHERE to_user = ? AND kind = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId, kind);
}

test('assigning work notifies the assignee in the app and by email', async () => {
  const res = await admin.post('/api/tasks', {
    title: 'Install the site meter',
    titleAr: 'تركيب عدّاد الموقع',
    assignee: 'u_sara',
    dueDate: '2099-06-01',
  });
  assert.equal(res.status, 201);

  const inbox = await sara.get('/api/notifications');
  const assign = inbox.body.notifications.find((n) => n.kind === 'assign' && n.task === res.body.task.id);
  assert.ok(assign, 'the assignee must have an in-app notification');
  assert.equal(assign.read, 0);
  assert.match(assign.text, /assigned you/);
  assert.ok(assign.text_ar.includes('أسند'), 'the Arabic twin must be stored too');
  assert.ok(inbox.body.unread >= 1);

  const mail = mailFor('u_sara', 'assign');
  assert.ok(mail, 'an email must be queued for the assignee');
  assert.equal(mail.to_email, 'sara@mutabi.local');
  assert.equal(mail.state, 'queued');
  /* Sara reads Arabic, so her copy is Arabic — the language belongs to the
     reader, not the sender. */
  assert.ok(mail.subject.includes('أُسندت إليك مهمة'));
  assert.ok(mail.html.includes('dir="rtl"'));
  assert.ok(mail.html.includes(res.body.task.id));
});

test('a person is not notified about their own action', async () => {
  const before = (await admin.get('/api/notifications/count')).body.unread;
  await admin.post('/api/tasks', { title: 'Self assigned', assignee: 'u_admin' });
  const after = (await admin.get('/api/notifications/count')).body.unread;
  assert.equal(after, before, 'assigning work to yourself must not notify you');
});

test('queued mail is actually delivered by the transport and recorded', async () => {
  const result = await mailer.flushEmails();
  assert.ok(result.sent > 0);
  assert.equal(result.failed, 0);
  const mail = mailFor('u_sara', 'assign');
  assert.equal(mail.state, 'sent');
  assert.ok(mail.sent_at > 0);
  assert.equal(mail.attempts, 1);
  assert.ok(mail.message_id, 'the transport response must be recorded');
});

test('every follower of a task hears about a status change, and the actor does not', async () => {
  const created = await admin.post('/api/tasks', { title: 'Followed work', assignee: 'u_sara' });
  const id = created.body.task.id;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });

  const omarBefore = (await omar.get('/api/notifications/count')).body.unread;
  const saraBefore = (await sara.get('/api/notifications/count')).body.unread;
  const adminBefore = (await admin.get('/api/notifications/count')).body.unread;

  await admin.patch(`/api/tasks/${id}`, { status: 'progress' });

  assert.equal((await omar.get('/api/notifications/count')).body.unread, omarBefore + 1, 'a follower must be told');
  assert.equal((await sara.get('/api/notifications/count')).body.unread, saraBefore + 1, 'the assignee must be told');
  assert.equal((await admin.get('/api/notifications/count')).body.unread, adminBefore, 'the actor must not be told');
});

test('completing a task raises the complete kind, not a bare status change', async () => {
  const created = await admin.post('/api/tasks', { title: 'To be completed', assignee: 'u_sara' });
  await admin.patch(`/api/tasks/${created.body.task.id}`, { status: 'done' });
  const inbox = await sara.get('/api/notifications');
  const item = inbox.body.notifications.find((n) => n.task === created.body.task.id);
  assert.equal(item.kind, 'complete');
});

test('a mention outranks the general comment sweep', async () => {
  const created = await admin.post('/api/tasks', { title: 'Mention host', assignee: 'u_sara' });
  const id = created.body.task.id;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });

  const res = await sara.post(`/api/tasks/${id}/comments`, { text: 'Ready for review @admin — please look' });
  assert.equal(res.status, 201);

  const adminInbox = await admin.get('/api/notifications');
  const mine = adminInbox.body.notifications.filter((n) => n.task === id);
  assert.equal(mine[0].kind, 'mention', 'the mentioned person gets a mention');

  const omarInbox = await omar.get('/api/notifications');
  const omarItem = omarInbox.body.notifications.find((n) => n.task === id);
  assert.equal(omarItem.kind, 'comment', 'other followers get a comment');
});

test('adding somebody else as a follower tells them; following yourself is silent', async () => {
  const created = await admin.post('/api/tasks', { title: 'Watcher notice' });
  const id = created.body.task.id;

  const before = (await omar.get('/api/notifications/count')).body.unread;
  await admin.post(`/api/tasks/${id}/watchers`, { user: 'u_omar' });
  assert.equal((await omar.get('/api/notifications/count')).body.unread, before + 1);

  const laylaBefore = (await layla.get('/api/notifications/count')).body.unread;
  await layla.post(`/api/tasks/${id}/watchers`, {});
  assert.equal((await layla.get('/api/notifications/count')).body.unread, laylaBefore, 'choosing to follow is not news to yourself');
});

test('email mode "off" suppresses the message but keeps the in-app record', async () => {
  const target = await login(ctx.base, 'omar@mutabi.local');
  await target.put('/api/auth/me/prefs', {
    email: { mode: 'off' },
    inApp: { enabled: true, sound: true },
  });

  const created = await admin.post('/api/tasks', { title: 'Silent email', assignee: 'u_omar' });
  const inbox = await target.get('/api/notifications');
  assert.ok(inbox.body.notifications.some((n) => n.task === created.body.task.id), 'the bell still rings');

  const mail = mailFor('u_omar', 'assign');
  assert.equal(mail.state, 'suppressed');
  assert.match(mail.error, /disabled email/);

  await target.put('/api/auth/me/prefs', { email: { mode: 'all' }, inApp: { enabled: true, sound: true } });
});

test('email mode "critical" only mails critical work', async () => {
  const target = await login(ctx.base, 'omar@mutabi.local');
  await target.put('/api/auth/me/prefs', { email: { mode: 'critical' } });

  const low = await admin.post('/api/tasks', { title: 'Routine item', assignee: 'u_omar', priority: 'Low' });
  assert.equal(mailFor('u_omar', 'assign').state, 'suppressed');
  assert.equal(mailFor('u_omar', 'assign').task, low.body.task.id);

  const critical = await admin.post('/api/tasks', { title: 'Burst pipeline', assignee: 'u_omar', priority: 'Critical' });
  const mail = mailFor('u_omar', 'assign');
  assert.equal(mail.task, critical.body.task.id);
  assert.equal(mail.state, 'queued');

  await target.put('/api/auth/me/prefs', { email: { mode: 'all' } });
});

test('muting an event mutes it on both surfaces', async () => {
  const target = await login(ctx.base, 'omar@mutabi.local');
  await target.put('/api/auth/me/prefs', {
    email: { mode: 'all', events: { assign: false } },
    inApp: { enabled: true, sound: true, events: { assign: false } },
  });

  const before = (await target.get('/api/notifications/count')).body.unread;
  const created = await admin.post('/api/tasks', { title: 'Muted assignment', assignee: 'u_omar' });
  assert.equal((await target.get('/api/notifications/count')).body.unread, before, 'a muted event raises nothing');
  const mail = mailFor('u_omar', 'assign');
  assert.equal(mail.task, created.body.task.id);
  assert.equal(mail.state, 'suppressed');

  await target.put('/api/auth/me/prefs', {
    email: { mode: 'all', events: { assign: true } },
    inApp: { enabled: true, sound: true, events: { assign: true } },
  });
});

test('an escalation ignores every mute, because that is the point of one', async () => {
  const target = await login(ctx.base, 'omar@mutabi.local');
  await target.put('/api/auth/me/prefs', {
    email: { mode: 'off' },
    inApp: { enabled: false, sound: false },
    quiet: { enabled: true, from: '00:00', to: '23:59' },
  });

  const before = (await target.get('/api/notifications/count')).body.unread;
  const result = notifySvc.notify({
    userId: 'u_omar',
    kind: 'escalation',
    text: 'This cannot be muted.',
    textAr: 'لا يمكن كتم هذا.',
  });

  assert.equal(result.inApp, true, 'a mandatory kind is recorded whatever the preference says');
  assert.equal(result.sound, true, 'a mandatory kind rings even inside quiet hours');
  assert.ok(result.emailId, 'a mandatory kind is emailed whatever the preference says');
  assert.equal((await target.get('/api/notifications/count')).body.unread, before + 1);

  await target.put('/api/auth/me/prefs', {
    email: { mode: 'all' },
    inApp: { enabled: true, sound: true },
    quiet: { enabled: true, from: '21:00', to: '07:00' },
  });
});

test('quiet hours mute the ring and hold the email rather than dropping it', async () => {
  const target = await login(ctx.base, 'omar@mutabi.local');
  /* A window that certainly contains "now", whenever the suite runs. */
  await target.put('/api/auth/me/prefs', {
    email: { mode: 'all' },
    inApp: { enabled: true, sound: true },
    quiet: { enabled: true, from: '00:00', to: '23:59' },
  });

  const result = notifySvc.notify({
    userId: 'u_omar',
    kind: 'comment',
    text: 'Quiet hours check',
    textAr: 'فحص ساعات الهدوء',
  });

  assert.equal(result.quiet, true);
  assert.equal(result.inApp, true, 'the notification is still recorded');
  assert.equal(result.sound, false, 'but it does not make a sound');
  assert.ok(result.emailId, 'and the email is queued');

  const mail = db.prepare('SELECT * FROM emails WHERE id = ?').get(result.emailId);
  assert.equal(mail.state, 'queued');
  assert.ok(mail.next_try_at > Date.now(), 'the email waits for the window to close');

  const flushed = await mailer.flushEmails();
  const stillQueued = db.prepare('SELECT * FROM emails WHERE id = ?').get(result.emailId);
  assert.equal(stillQueued.state, 'queued', 'a held email is not sent early');
  assert.ok(flushed.sent >= 0);

  await target.put('/api/auth/me/prefs', {
    email: { mode: 'all' },
    inApp: { enabled: true, sound: true },
    quiet: { enabled: true, from: '21:00', to: '07:00' },
  });
});

test('preferences round-trip and unknown values fall back to the default', async () => {
  const res = await sara.put('/api/auth/me/prefs', {
    email: { mode: 'nonsense', events: { assign: false } },
    inApp: { sound: false, desktop: true },
    quiet: { enabled: false, from: '25:99', to: '07:30' },
    digest: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.prefs.email.mode, 'all', 'an unknown mode falls back rather than disabling mail');
  assert.equal(res.body.prefs.email.events.assign, false);
  assert.equal(res.body.prefs.inApp.sound, false);
  assert.equal(res.body.prefs.inApp.desktop, true);
  assert.equal(res.body.prefs.quiet.from, '21:00', 'a malformed time falls back');
  assert.equal(res.body.prefs.quiet.to, '07:30');
  assert.equal(res.body.prefs.digest, true);

  const me = await sara.get('/api/auth/me');
  assert.equal(me.body.user.prefs.inApp.sound, false);

  await sara.put('/api/auth/me/prefs', { email: { mode: 'all' }, inApp: { sound: true, desktop: false } });
});

test('marking read moves the badge, and read-all clears it', async () => {
  const inbox = await sara.get('/api/notifications');
  const unread = inbox.body.notifications.filter((n) => !n.read);
  if (unread.length) {
    const res = await sara.post('/api/notifications/read', { ids: [unread[0].id] });
    assert.equal(res.body.changed, 1);
    assert.equal(res.body.unread, inbox.body.unread - 1);
  }
  const all = await sara.post('/api/notifications/read-all');
  assert.equal(all.body.unread, 0);
  assert.equal((await sara.get('/api/notifications/count')).body.unread, 0);
});

test('marking read needs at least one id', async () => {
  const res = await sara.post('/api/notifications/read', { ids: [] });
  assert.equal(res.status, 400);
});

test('one person cannot read or delete another person notifications', async () => {
  const created = await admin.post('/api/tasks', { title: 'Private notice', assignee: 'u_sara' });
  const saraInbox = await sara.get('/api/notifications');
  const target = saraInbox.body.notifications.find((n) => n.task === created.body.task.id);
  assert.ok(target);

  const stolen = await omar.post('/api/notifications/read', { ids: [target.id] });
  assert.equal(stolen.body.changed, 0, 'marking somebody else notification read must do nothing');
  const deleted = await omar.del(`/api/notifications/${target.id}`);
  assert.equal(deleted.body.deleted, false);
  const still = db.prepare('SELECT * FROM notifications WHERE id = ?').get(target.id);
  assert.ok(still, 'the record must survive another person delete attempt');
});

test('the test notification travels the real path', async () => {
  const before = (await layla.get('/api/notifications/count')).body.unread;
  const res = await layla.post('/api/notifications/test');
  assert.equal(res.status, 200);
  assert.equal(res.body.result.inApp, true);
  assert.ok(res.body.result.emailId);
  assert.equal((await layla.get('/api/notifications/count')).body.unread, before + 1);
});

test('the email log is administrator-only and reports the transport', async () => {
  assert.equal((await sara.get('/api/admin/emails')).status, 403);
  const res = await admin.get('/api/admin/emails');
  assert.equal(res.status, 200);
  assert.equal(res.body.transport, 'json');
  assert.ok(res.body.emails.length > 0);
  assert.ok(res.body.emails.every((m) => ['queued', 'sent', 'failed', 'suppressed'].includes(m.state)));
});

test('mail verification answers without a server configured', async () => {
  const res = await admin.get('/api/admin/mail/verify');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.transport, 'json');
});
