import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, login } from './helpers.js';

/* What happens when the mail server is not there. A notification must never be
   lost because SMTP was down, and it must never fail the action that raised it. */

let ctx;
let admin;
let mailer;
let db;
let config;

test.before(async () => {
  ctx = await startTestServer();
  admin = await login(ctx.base, 'admin@mutabi.local');
  mailer = await import('../src/services/mailer.js');
  db = (await import('../src/db/index.js')).getDb();
  config = (await import('../src/config.js')).default;
});

test.after(async () => {
  config.mail.transport = 'json';
  config.mail.host = '';
  mailer.resetTransport();
  await ctx.close();
});

function useBrokenTransport() {
  config.mail.transport = 'smtp';
  config.mail.host = '127.0.0.1';
  /* Nothing listens here; the connection is refused immediately. */
  config.mail.port = 1;
  config.mail.secure = false;
  config.mail.user = '';
  mailer.resetTransport();
}

function useLocalTransport() {
  config.mail.transport = 'json';
  config.mail.host = '';
  mailer.resetTransport();
}

test('a raised notification survives a mail server that is down', async () => {
  useBrokenTransport();
  config.mail.maxAttempts = 3;
  config.mail.retrySeconds = 0;

  const created = await admin.post('/api/tasks', { title: 'Mail is down', assignee: 'u_sara' });
  assert.equal(created.status, 201, 'the action must succeed even though mail cannot be sent');

  const inbox = db.prepare("SELECT * FROM notifications WHERE task = ? AND kind = 'assign'").all(created.body.task.id);
  assert.equal(inbox.length, 1, 'the in-app notification is unaffected by the mail transport');

  const first = await mailer.flushEmails();
  assert.equal(first.sent, 0);
  assert.ok(first.failed >= 1);

  const row = db.prepare('SELECT * FROM emails WHERE task = ? ORDER BY created_at DESC LIMIT 1').get(created.body.task.id);
  assert.equal(row.state, 'queued', 'a failure leaves the message queued for another attempt');
  assert.equal(row.attempts, 1);
  assert.ok(row.error, 'the reason is recorded');
  assert.ok(row.next_try_at !== null);

  useLocalTransport();
});

test('a message that keeps failing lands in the log as failed, not lost', async () => {
  useBrokenTransport();
  config.mail.maxAttempts = 2;
  config.mail.retrySeconds = 0;

  const created = await admin.post('/api/tasks', { title: 'Permanently undeliverable', assignee: 'u_omar' });
  const id = created.body.task.id;

  await mailer.flushEmails();
  await mailer.flushEmails();

  const row = db.prepare('SELECT * FROM emails WHERE task = ? ORDER BY created_at DESC LIMIT 1').get(id);
  assert.equal(row.state, 'failed');
  assert.equal(row.attempts, 2);
  assert.equal(row.next_try_at, null, 'a dead message stops asking to be retried');
  assert.ok(row.error);

  /* A failed message is visible to an administrator rather than silently gone. */
  const log = await admin.get('/api/admin/emails?state=failed');
  assert.ok(log.body.emails.some((m) => m.task === id));

  useLocalTransport();
  config.mail.maxAttempts = 3;
});

test('a recovered transport sends the messages still queued', async () => {
  useBrokenTransport();
  config.mail.maxAttempts = 5;
  config.mail.retrySeconds = 0;
  const created = await admin.post('/api/tasks', { title: 'Deliver after recovery', assignee: 'u_sara' });
  await mailer.flushEmails();
  const queued = db.prepare('SELECT * FROM emails WHERE task = ? ORDER BY created_at DESC LIMIT 1').get(created.body.task.id);
  assert.equal(queued.state, 'queued');

  useLocalTransport();
  const result = await mailer.flushEmails();
  assert.ok(result.sent >= 1);
  const sent = db.prepare('SELECT * FROM emails WHERE id = ?').get(queued.id);
  assert.equal(sent.state, 'sent');
  assert.equal(sent.error, null, 'a successful retry clears the earlier failure');
  assert.ok(sent.attempts >= 2);
});

test('verification reports a broken server instead of throwing', async () => {
  useBrokenTransport();
  const res = await mailer.verifyTransport();
  assert.equal(res.ok, false);
  assert.equal(res.transport, 'smtp');
  assert.ok(res.error);

  /* The same check through the API answers cleanly rather than a 500. */
  const api = await admin.get('/api/admin/mail/verify');
  assert.equal(api.status, 200);
  assert.equal(api.body.ok, false);
  useLocalTransport();
});

test('the staging guard rail rewrites every recipient', async () => {
  config.mail.redirectAll = 'catchall@example.test';
  const created = await admin.post('/api/tasks', { title: 'Redirected mail', assignee: 'u_sara' });
  const row = db.prepare('SELECT * FROM emails WHERE task = ? ORDER BY created_at DESC LIMIT 1').get(created.body.task.id);
  assert.equal(row.to_email, 'catchall@example.test', 'no real address is used when the guard rail is on');
  assert.equal(row.to_user, 'u_sara', 'the intended recipient is still recorded');
  config.mail.redirectAll = '';
});

test('an empty queue flush is cheap and honest', async () => {
  await mailer.flushEmails();
  const res = await mailer.flushEmails();
  assert.deepEqual(res, { sent: 0, failed: 0, pending: 0 });
});
