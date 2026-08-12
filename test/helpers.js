import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Each test file gets its own database file and its own server on an ephemeral
   port, so the suite can run in any order without sharing state. */

let counter = 0;

export async function startTestServer() {
  counter += 1;
  const dbFile = path.join(os.tmpdir(), `mutabi-test-${process.pid}-${counter}-${Date.now()}.db`);
  process.env.DB_FILE = dbFile;
  process.env.SCHEDULER_ENABLED = 'false';
  process.env.MAIL_TRANSPORT = 'json';
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  process.env.NODE_ENV = 'test';

  /* Imported after the environment is set: config reads it at module load. */
  const config = (await import('../src/config.js')).default;
  config.dbFile = dbFile;
  config.schedulerEnabled = false;

  const { resetDbForTests, closeDb } = await import('../src/db/index.js');
  resetDbForTests(dbFile);

  const { seed } = await import('../src/db/seed.js');
  seed({ quiet: true });

  const { createApp } = await import('../src/app.js');
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    server,
    config,
    async close() {
      const { shutdownRealtime } = await import('../src/services/realtime.js');
      shutdownRealtime();
      await new Promise((resolve) => server.close(resolve));
      closeDb();
      for (const suffix of ['', '-wal', '-shm']) {
        const f = dbFile + suffix;
        if (fs.existsSync(f)) { try { fs.rmSync(f); } catch { /* windows-style lock, ignore */ } }
      }
    },
  };
}

export function client(base, token = '') {
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = { raw: text }; } }
    return { status: res.status, body: payload };
  };
  return {
    token,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    del: (p) => call('DELETE', p),
    withToken: (value) => client(base, value),
  };
}

export const PASSWORD = 'Mutabi#2026';

export async function login(base, email, password = PASSWORD) {
  const res = await client(base).post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return client(base, res.body.token);
}
