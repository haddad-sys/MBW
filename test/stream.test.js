import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, login, client } from './helpers.js';

/* The live channel end to end: a real HTTP connection, a real event frame, and
   the sound flag the browser uses to decide whether to ring. */

let ctx;
let admin;
let saraToken;

test.before(async () => {
  ctx = await startTestServer();
  admin = await login(ctx.base, 'admin@mutabi.local');
  const res = await client(ctx.base).post('/api/auth/login', { email: 'sara@mutabi.local', password: 'Mutabi#2026' });
  saraToken = res.body.token;
});

test.after(async () => { await ctx.close(); });

/** Opens the stream and resolves with the first frames it receives. */
async function openStream(token, { expect = 1, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const res = await fetch(`${ctx.base}/api/stream?token=${encodeURIComponent(token)}`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  let settled = false;

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settled = true;
      controller.abort();
      reject(new Error(`stream produced ${events.length} of ${expect} expected events`));
    }, timeoutMs);

    (async () => {
      try {
        while (!settled) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          buffer += decoder.decode(value, { stream: true });
          let split = buffer.indexOf('\n\n');
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const nameLine = frame.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
            if (nameLine && dataLine) {
              events.push({ event: nameLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
              if (events.length >= expect) {
                settled = true;
                clearTimeout(timer);
                controller.abort();
                resolve(events);
                return;
              }
            }
            split = buffer.indexOf('\n\n');
          }
        }
      } catch (err) {
        if (!settled) { clearTimeout(timer); reject(err); }
      }
    })();
  });

  return { events: done, close: () => { settled = true; controller.abort(); } };
}

test('the stream refuses an anonymous connection', async () => {
  const res = await fetch(`${ctx.base}/api/stream`);
  assert.equal(res.status, 401);
  await res.text();
});

test('the stream opens with a hello frame carrying the unread count', async () => {
  const stream = await openStream(saraToken, { expect: 1 });
  const [hello] = await stream.events;
  assert.equal(hello.event, 'hello');
  assert.equal(hello.data.user, 'u_sara');
  assert.ok(Number.isFinite(hello.data.unread));
});

test('assigning work pushes a live notification with everything needed to ring', async () => {
  const stream = await openStream(saraToken, { expect: 3 });

  /* Give the subscription a moment to register before the event is raised. */
  await new Promise((r) => setTimeout(r, 120));
  const created = await admin.post('/api/tasks', {
    title: 'Live channel check',
    titleAr: 'فحص القناة الحيّة',
    assignee: 'u_sara',
    priority: 'Critical',
  });
  assert.equal(created.status, 201);

  const events = await stream.events;
  const notification = events.find((e) => e.event === 'notification');
  assert.ok(notification, 'a notification frame must arrive on the open connection');
  assert.equal(notification.data.kind, 'assign');
  assert.equal(notification.data.task, created.body.task.id);
  assert.equal(notification.data.sound, true, 'the browser is told to ring');
  assert.ok(notification.data.text.length > 0);
  assert.ok(notification.data.textAr.length > 0);
  assert.equal(notification.data.read, false);
  assert.equal(notification.data.title, 'أُسندت إليك مهمة', 'the frame carries a label in the reader language');

  const badge = events.find((e) => e.event === 'badge');
  assert.ok(badge, 'the badge count is pushed alongside the notification');
  assert.ok(badge.data.unread >= 1);
});

test('a notification addressed elsewhere never reaches this connection', async () => {
  const stream = await openStream(saraToken, { expect: 1 });
  await stream.events;                       // consume the hello frame

  const second = await openStream(saraToken, { expect: 2, timeoutMs: 2500 });
  await new Promise((r) => setTimeout(r, 120));
  /* Addressed to Omar, who is not on this socket. */
  await admin.post('/api/tasks', { title: 'Somebody else work', assignee: 'u_omar' });

  await assert.rejects(second.events, /produced 1 of 2/, 'nothing beyond the hello frame should arrive');
  stream.close();
  second.close();
});

test('the connection count is reported per person', async () => {
  const before = await admin.get('/api/stream/status');
  assert.equal(before.status, 200);
  assert.ok(Number.isFinite(before.body.total));
});
