/* Test harness: a throwaway database, a real HTTP server on an ephemeral port,
   and a tiny client that carries a token. Environment variables are set before
   anything imports the configuration, which reads them once. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutabea-test-'));

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.MAIL_TRANSPORT = 'json';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SEED_DEMO = 'false';
process.env.BCRYPT_ROUNDS = '4';
process.env.OWNER_USERNAME = 'manager';
process.env.OWNER_PASSWORD = 'Manager@2026';
process.env.OWNER_EMAIL = 'owner@example.com';
process.env.REGISTRATION_OPEN = 'true';

const { createApp } = await import('../src/app.js');
const { ensureOwner, ensureDefaults } = await import('../src/db/seed.js');
const { getDb } = await import('../src/db/index.js');

ensureDefaults();
ensureOwner();

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
export const base = `http://127.0.0.1:${server.address().port}`;
export const db = getDb();

export function stop() {
  server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
}

/** A client bound to one session token. */
export function client(token = '') {
  const self = {
    token,
    async call(method, urlPath, body) {
      const headers = { 'content-type': 'application/json' };
      if (self.token) headers.authorization = `Bearer ${self.token}`;
      const res = await fetch(base + urlPath, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let payload = null;
      if (text) { try { payload = JSON.parse(text); } catch { payload = { raw: text }; } }
      return { status: res.status, body: payload ?? {}, code: payload?.error || null };
    },
    get: (p) => self.call('GET', p),
    post: (p, b) => self.call('POST', p, b ?? {}),
    patch: (p, b) => self.call('PATCH', p, b ?? {}),
    put: (p, b) => self.call('PUT', p, b ?? {}),
    del: (p) => self.call('DELETE', p),
    async signIn(username, password) {
      const res = await self.post('/api/auth/login', { username, password });
      if (res.status === 200) self.token = res.body.token;
      return res;
    },
  };
  return self;
}

/** Creates a branch and returns its id. */
export async function makeEntity(adminClient, name = 'فرع الاختبار', type = 'nursery') {
  const res = await adminClient.post('/api/entities', { name, type });
  if (res.status !== 201) throw new Error('entity creation failed: ' + JSON.stringify(res.body));
  return res.body.id;
}

/** Signs in as the seeded administrator. */
export async function admin() {
  const c = client();
  const res = await c.signIn('manager', 'Manager@2026');
  if (res.status !== 200) throw new Error('administrator sign-in failed: ' + JSON.stringify(res.body));
  return c;
}

/** Applies, then approves — returns a signed-in client for the new account. */
export async function member(admin_, { username, name, email, entityId, perms, role = 'branch', password = 'Member@2026' }) {
  const anon = client();
  const applied = await anon.post('/api/auth/register', { username, name, email, password, entityId });
  if (applied.status !== 202) throw new Error('application failed: ' + JSON.stringify(applied.body));
  const queue = await admin_.get('/api/admin/registrations');
  const row = queue.body.registrations.find((r) => r.username === username);
  if (!row) throw new Error('application not queued: ' + username);
  const approved = await admin_.post(`/api/admin/registrations/${row.id}/approve`, { role, entityId, perms });
  if (approved.status !== 200) throw new Error('approval failed: ' + JSON.stringify(approved.body));
  const c = client();
  const signed = await c.signIn(username, password);
  if (signed.status !== 200) throw new Error('member sign-in failed: ' + JSON.stringify(signed.body));
  return c;
}

/** Reads the notification stream until `want` events arrive, then closes. */
export async function listen(token, want, timeoutMs = 4000) {
  const controller = new AbortController();
  const events = [];
  const res = await fetch(`${base}/api/stream?token=${encodeURIComponent(token)}`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const done = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (events.length < want && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r({ value: undefined, done: false }), 200)),
      ]);
      if (chunk?.done) break;
      if (!chunk?.value) continue;
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event) events.push({ event, data: data ? JSON.parse(data) : null });
      }
    }
    controller.abort();
    return events;
  })();
  return { events, done: () => done };
}
