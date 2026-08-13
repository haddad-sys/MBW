/* Registration, the approval gate, and what a session is allowed to be. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, client, db, makeEntity, stop } from './helpers.js';

test.after(stop);

test('an unapproved account cannot sign in', async () => {
  const anon = client();
  const applied = await anon.post('/api/auth/register', {
    name: 'مها الشمري', username: 'maha', email: 'maha@example.com', password: 'Maha@2026',
  });
  assert.equal(applied.status, 202);
  assert.equal(applied.body.status, 'pending');

  const attempt = await client().signIn('maha', 'Maha@2026');
  assert.equal(attempt.status, 403);
  assert.equal(attempt.code, 'account_pending');
});

test('a branch account cannot be approved without a branch', async () => {
  const a = await admin();
  const queue = await a.get('/api/admin/registrations');
  const row = queue.body.registrations.find((r) => r.username === 'maha');
  const res = await a.post(`/api/admin/registrations/${row.id}/approve`, { role: 'branch' });
  assert.equal(res.status, 400);
  assert.equal(res.code, 'entity_required');
});

test('the queue shows the application and approval opens the door', async () => {
  const a = await admin();
  const entityId = await makeEntity(a, 'فرع العدان');
  const queue = await a.get('/api/admin/registrations');
  assert.equal(queue.status, 200);
  const row = queue.body.registrations.find((r) => r.username === 'maha');
  assert.ok(row, 'the application is queued');

  const approved = await a.post(`/api/admin/registrations/${row.id}/approve`, { role: 'branch', entityId });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.user.status, 'active');

  const signed = await client().signIn('maha', 'Maha@2026');
  assert.equal(signed.status, 200);
  assert.ok(signed.body.token);
});

test('a rejection is final and carries its reason', async () => {
  const a = await admin();
  await client().post('/api/auth/register', {
    name: 'خالد', username: 'khaled', email: 'khaled@example.com', password: 'Khaled@2026',
  });
  const queue = await a.get('/api/admin/registrations');
  const row = queue.body.registrations.find((r) => r.username === 'khaled');
  const rejected = await a.post(`/api/admin/registrations/${row.id}/reject`, { note: 'خارج النطاق' });
  assert.equal(rejected.status, 200);

  const attempt = await client().signIn('khaled', 'Khaled@2026');
  assert.equal(attempt.status, 403);
  assert.equal(attempt.code, 'account_rejected');
  assert.equal(attempt.body.reason, 'خارج النطاق');
});

test('registration does not disclose whether an address is already known', async () => {
  const first = await client().post('/api/auth/register', {
    name: 'تكرار', username: 'dupe1', email: 'dupe@example.com', password: 'Dupe@2026',
  });
  const second = await client().post('/api/auth/register', {
    name: 'تكرار', username: 'dupe2', email: 'dupe@example.com', password: 'Dupe@2026',
  });
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.deepEqual(Object.keys(second.body).sort(), Object.keys(first.body).sort());
  const rows = db.prepare('SELECT count(*) c FROM users WHERE email = ?').get('dupe@example.com');
  assert.equal(rows.c, 1, 'only the first application became a row');
});

test('a bad application is refused field by field', async () => {
  const cases = [
    [{ name: '', username: 'x', email: 'a@b.c', password: 'Passw0rd!' }, 'missing_fields'],
    [{ name: 'ن', username: 'ab', email: 'a@b.c', password: 'Passw0rd!' }, 'invalid_username'],
    [{ name: 'ن', username: 'valid1', email: 'not-an-email', password: 'Passw0rd!' }, 'invalid_email'],
    [{ name: 'ن', username: 'valid2', email: 'a@b.c', password: 'short' }, 'password_too_short'],
  ];
  for (const [payload, code] of cases) {
    const res = await client().post('/api/auth/register', payload);
    assert.equal(res.status, 400, JSON.stringify(payload));
    assert.equal(res.code, code);
  }
});

test('a disabled account loses its session immediately', async () => {
  const a = await admin();
  const users = await a.get('/api/admin/users');
  const maha = users.body.users.find((u) => u.username === 'maha');
  const c = client();
  await c.signIn('maha', 'Maha@2026');
  assert.equal((await c.get('/api/bootstrap')).status, 200);

  await a.patch(`/api/admin/users/${maha.id}`, { status: 'disabled' });
  assert.equal((await c.get('/api/bootstrap')).status, 401, 'the live token stops working');
  assert.equal((await client().signIn('maha', 'Maha@2026')).code, 'account_disabled');
  await a.patch(`/api/admin/users/${maha.id}`, { status: 'active' });
});

test('the last administrator cannot be removed', async () => {
  const a = await admin();
  const users = await a.get('/api/admin/users');
  const owner = users.body.users.find((u) => u.username === 'manager');
  const demote = await a.patch(`/api/admin/users/${owner.id}`, {
    perms: { scope: 'own', view: 1, create: 1, tabs: { home: 1 } },
  });
  assert.equal(demote.code, 'last_administrator');
  /* The rollback is real: the administrator still works. */
  assert.equal((await a.get('/api/admin/users')).status, 200);
  assert.equal((await a.del(`/api/admin/users/${owner.id}`)).code, 'cannot_delete_self');
});

test('anonymous callers get the branch list and nothing else', async () => {
  const anon = client();
  assert.equal((await anon.get('/api/auth/entities')).status, 200);
  assert.equal((await anon.get('/api/bootstrap')).status, 401);
  assert.equal((await anon.get('/api/issues')).status, 401);
  assert.equal((await anon.get('/api/admin/users')).status, 401);
});

test('a password change invalidates nothing but the old password', async () => {
  const c = client();
  await c.signIn('maha', 'Maha@2026');
  assert.equal((await c.post('/api/auth/password', { current: 'wrong', next: 'Maha@2027' })).status, 400);
  assert.equal((await c.post('/api/auth/password', { current: 'Maha@2026', next: 'short' })).code, 'password_too_short');
  assert.equal((await c.post('/api/auth/password', { current: 'Maha@2026', next: 'Maha@2027' })).status, 200);
  assert.equal((await client().signIn('maha', 'Maha@2026')).status, 401);
  assert.equal((await client().signIn('maha', 'Maha@2027')).status, 200);
});
