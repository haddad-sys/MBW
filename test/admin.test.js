/* The administration surface: branches, categories, the library, the
   variables that drive the workflow, the team, and the audit trail. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, makeEntity, member, stop } from './helpers.js';

test.after(stop);

const world = {};
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

test('setup', async () => {
  world.admin = await admin();
  world.entityId = await makeEntity(world.admin, 'فرع الجهراء');
  world.branch = await member(world.admin, {
    username: 'salem', name: 'سالم', email: 'salem@example.com', entityId: world.entityId,
  });
});

/* ------------------------------------------------------------ branches --- */

test('a branch is created with the default categories, renamed and removed', async () => {
  const id = await makeEntity(world.admin, 'فرع مؤقت', 'school');
  const listed = (await world.admin.get('/api/entities')).body.entities.find((e) => e.id === id);
  assert.ok(listed, 'the new branch is listed');
  assert.equal(listed.type, 'school');
  assert.ok(listed.categories.length >= 5, 'it arrives with the default categories');

  const renamed = await world.admin.patch(`/api/entities/${id}`, { name: 'فرع مؤقت — معدّل' });
  assert.equal(renamed.status, 200);
  const after = (await world.admin.get('/api/entities')).body.entities.find((e) => e.id === id);
  assert.equal(after.name, 'فرع مؤقت — معدّل');

  assert.equal((await world.admin.post('/api/entities', { name: '  ' })).code, 'name_required');
  assert.equal((await world.admin.del(`/api/entities/${id}`)).status, 200);
  assert.ok(!(await world.admin.get('/api/entities')).body.entities.some((e) => e.id === id));
});

test('deleting a branch takes its records with it', async () => {
  const id = await makeEntity(world.admin, 'فرع سيُحذف');
  const cats = (await world.admin.get('/api/entities')).body.entities.find((e) => e.id === id).categories;
  const issue = await world.admin.post('/api/issues', {
    entityId: id, categoryId: cats[0].id, title: 'ملاحظة ستُحذف مع الفرع',
  });
  assert.equal(issue.status, 201);
  await world.admin.del(`/api/entities/${id}`);
  assert.equal((await world.admin.get(`/api/issues/${issue.body.issue.id}`)).status, 404);
});

test('categories are added, renamed and removed', async () => {
  const added = await world.admin.post(`/api/entities/${world.entityId}/categories`, { name: 'صيانة المكيفات' });
  assert.equal(added.status, 201);
  const cats = (await world.admin.get('/api/entities')).body.entities
    .find((e) => e.id === world.entityId).categories;
  const mine = cats.find((c) => c.name === 'صيانة المكيفات');
  assert.ok(mine);

  const renamed = await world.admin.patch(`/api/entities/${world.entityId}/categories/${mine.id}`, { name: 'التكييف' });
  assert.equal(renamed.status, 200);
  assert.equal((await world.admin.patch(`/api/entities/${world.entityId}/categories/${mine.id}`, { name: '' })).code, 'name_required');
  assert.equal((await world.admin.del(`/api/entities/${world.entityId}/categories/${mine.id}`)).status, 200);
});

test('a branch account cannot manage branches', async () => {
  assert.equal((await world.branch.post('/api/entities', { name: 'مهرّب' })).status, 403);
  assert.equal((await world.branch.patch(`/api/entities/${world.entityId}`, { name: 'x' })).status, 403);
  assert.equal((await world.branch.del(`/api/entities/${world.entityId}`)).status, 403);
});

/* ------------------------------------------------------------- library --- */

test('a document is uploaded, listed, fetched and deleted', async () => {
  const up = await world.admin.post(`/api/entities/${world.entityId}/documents`, {
    files: [{ name: 'عقد الصيانة.pdf', type: 'application/pdf', data: PIXEL }],
  });
  assert.equal(up.status, 201);

  const list = await world.admin.get(`/api/entities/${world.entityId}/documents`);
  assert.equal(list.status, 200);
  const doc = list.body.documents.find((d) => d.name === 'عقد الصيانة.pdf');
  assert.ok(doc, 'the document is listed');
  assert.ok(doc.size > 0, 'with its size');
  assert.equal(doc.data, undefined, 'but not its payload — the list stays light');

  const full = await world.admin.get(`/api/documents/${doc.id}`);
  assert.equal(full.status, 200);
  assert.equal(full.body.document.data, PIXEL, 'the payload comes back on demand');

  assert.equal((await world.admin.del(`/api/documents/${doc.id}`)).status, 200);
  assert.equal((await world.admin.get(`/api/documents/${doc.id}`)).status, 404);
});

test('the library obeys scope as strictly as the records do', async () => {
  const other = await makeEntity(world.admin, 'فرع بعيد');
  await world.admin.post(`/api/entities/${other}/documents`, {
    files: [{ name: 'سرّي.pdf', type: 'application/pdf', data: PIXEL }],
  });
  const theirs = (await world.admin.get(`/api/entities/${other}/documents`)).body.documents[0];

  assert.equal((await world.branch.get(`/api/entities/${other}/documents`)).status, 404);
  assert.equal((await world.branch.get(`/api/documents/${theirs.id}`)).status, 404);
  /* The delete is refused for want of the permission before reach is even
     considered — the same 403 it would get for its own branch, so nothing
     about the other branch is disclosed either way. */
  assert.equal((await world.branch.del(`/api/documents/${theirs.id}`)).status, 403);
  assert.equal((await world.branch.post(`/api/entities/${other}/documents`, {
    files: [{ name: 'x.pdf', type: 'application/pdf', data: PIXEL }],
  })).status, 404);
});

test('an account without the delete permission cannot delete a document', async () => {
  const up = await world.branch.post(`/api/entities/${world.entityId}/documents`, {
    files: [{ name: 'رفعه الفرع.pdf', type: 'application/pdf', data: PIXEL }],
  });
  assert.equal(up.status, 201, 'the branch preset may upload');
  const doc = (await world.branch.get(`/api/entities/${world.entityId}/documents`)).body.documents
    .find((d) => d.name === 'رفعه الفرع.pdf');
  assert.equal((await world.branch.del(`/api/documents/${doc.id}`)).status, 403);
  assert.equal((await world.admin.del(`/api/documents/${doc.id}`)).status, 200);
});

test('the upload ceiling is measured, not taken from the caller', async () => {
  /* A payload over the ceiling, declaring itself tiny. The server must weigh
     the bytes it was actually handed. */
  const huge = 'data:application/pdf;base64,' + 'A'.repeat(4 * 1024 * 1024);
  const res = await world.admin.post(`/api/entities/${world.entityId}/documents`, {
    files: [{ name: 'ضخم.pdf', type: 'application/pdf', size: 12, data: huge }],
  });
  assert.equal(res.status, 413);
  assert.equal(res.code, 'files_too_large');
  assert.ok(!(await world.admin.get(`/api/entities/${world.entityId}/documents`)).body.documents
    .some((d) => d.name === 'ضخم.pdf'), 'nothing was stored');

  const ok = await world.admin.post(`/api/entities/${world.entityId}/documents`, {
    files: [{ name: 'صغير.pdf', type: 'application/pdf', size: 99999999, data: PIXEL }],
  });
  assert.equal(ok.status, 201, 'and an inflated claim does not condemn a small file');
  const stored = (await world.admin.get(`/api/entities/${world.entityId}/documents`)).body.documents
    .find((d) => d.name === 'صغير.pdf');
  assert.equal(stored.size, Buffer.byteLength(PIXEL, 'utf8'), 'the recorded size is the real one');
});

test('a photograph over the ceiling is refused rather than stored', async () => {
  const cats = (await world.admin.get('/api/entities')).body.entities
    .find((e) => e.id === world.entityId).categories;
  const issue = await world.admin.post('/api/issues', {
    entityId: world.entityId, categoryId: cats[0].id, title: 'صورة ضخمة',
  });
  const id = issue.body.issue.id;
  const huge = 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024);

  const res = await world.admin.post(`/api/issues/${id}/photos`, { kind: 'before', images: [huge] });
  assert.equal(res.status, 413);
  assert.equal(res.code, 'files_too_large');
  const after = await world.admin.get(`/api/issues/${id}?photos=1`);
  assert.equal(after.body.issue.photos.before.length, 0, 'nothing was stored');

  const mixed = await world.admin.post(`/api/issues/${id}/photos`, { kind: 'before', images: [huge, PIXEL] });
  assert.equal(mixed.status, 201);
  assert.equal(mixed.body.issue.photos.before.length, 1, 'the small one survives, the huge one does not');
});

/* ----------------------------------------------------------- variables --- */

test('the workflow variables are saved and take effect', async () => {
  const cfg = (await world.admin.get('/api/admin/config')).body.cfg;
  const next = {
    ...cfg,
    priorities: [...cfg.priorities, { key: 'later', label: 'لاحقاً', color: 'zinc' }],
    statuses: [...cfg.statuses, { key: 'onhold', label: 'معلّقة', color: 'slate', parked: true }],
  };
  assert.equal((await world.admin.put('/api/admin/config', next)).status, 200);

  const boot = (await world.admin.get('/api/bootstrap')).body.cfg;
  assert.ok(boot.priorities.some((p) => p.key === 'later'), 'the new priority is live');
  assert.ok(boot.statuses.some((s) => s.key === 'onhold' && s.parked));

  const cats = (await world.admin.get('/api/entities')).body.entities
    .find((e) => e.id === world.entityId).categories;
  const issue = await world.admin.post('/api/issues', {
    entityId: world.entityId, categoryId: cats[0].id, title: 'تستخدم الحالة الجديدة', priority: 'later',
  });
  assert.equal(issue.status, 201);
  const moved = await world.admin.post(`/api/issues/${issue.body.issue.id}/status`, { status: 'onhold' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.issue.status, 'onhold');
});

test('a branch account cannot rewrite the workflow', async () => {
  const cfg = (await world.admin.get('/api/admin/config')).body.cfg;
  assert.equal((await world.branch.put('/api/admin/config', cfg)).status, 403);
  assert.equal((await world.branch.get('/api/admin/config')).status, 200, 'but it may read what it works within');
});

/* ---------------------------------------------------------------- team --- */

test('a team member is added and removed', async () => {
  const added = await world.admin.post('/api/admin/team', { name: 'فني التكييف' });
  assert.equal(added.status, 201);
  assert.ok(added.body.team.includes('فني التكييف'), 'the answer carries the new list');
  assert.ok((await world.admin.get('/api/admin/team')).body.team.includes('فني التكييف'));
  assert.ok((await world.admin.get('/api/bootstrap')).body.team.includes('فني التكييف'));

  const removed = await world.admin.del(`/api/admin/team/${encodeURIComponent('فني التكييف')}`);
  assert.equal(removed.status, 200);
  assert.ok(!(await world.admin.get('/api/admin/team')).body.team.includes('فني التكييف'));
  assert.equal((await world.branch.post('/api/admin/team', { name: 'مهرّب' })).status, 403);
});

/* -------------------------------------------------------------- people --- */

test('an administrator can create an account outright', async () => {
  const created = await world.admin.post('/api/admin/users', {
    username: 'lulwa', name: 'لولوة', email: 'lulwa@example.com', password: 'Lulwa@2026',
    entityId: world.entityId,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.status, 'active', 'a hand-made account needs no approval');

  const { client } = await import('./helpers.js');
  assert.equal((await client().signIn('lulwa', 'Lulwa@2026')).status, 200);
});

test('a hand-made account is refused the same way an application is', async () => {
  const bad = await world.admin.post('/api/admin/users', {
    username: 'lulwa', name: 'مكررة', email: 'other@example.com', password: 'Passw0rd!',
    entityId: world.entityId,
  });
  assert.equal(bad.code, 'already_exists');
  const short = await world.admin.post('/api/admin/users', {
    username: 'zzz', name: 'ز', email: 'zzz@example.com', password: 'x', entityId: world.entityId,
  });
  assert.equal(short.code, 'password_too_short');
});

test('permissions granted by an administrator take effect at once', async () => {
  const users = (await world.admin.get('/api/admin/users')).body.users;
  const salem = users.find((u) => u.username === 'salem');

  const cats = (await world.admin.get('/api/entities')).body.entities
    .find((e) => e.id === world.entityId).categories;
  const issue = await world.admin.post('/api/issues', {
    entityId: world.entityId, categoryId: cats[0].id, title: 'قابلة للحذف',
  });
  assert.equal((await world.branch.del(`/api/issues/${issue.body.issue.id}`)).status, 403);

  await world.admin.patch(`/api/admin/users/${salem.id}`, {
    perms: { scope: 'own', view: 1, create: 1, del: 1, tabs: { home: 1, tasks: 1 } },
  });
  assert.equal((await world.branch.del(`/api/issues/${issue.body.issue.id}`)).status, 200,
    'the new permission applies to the session already open');

  const boot = (await world.branch.get('/api/bootstrap')).body;
  assert.equal(boot.perms.del, 1);
  assert.ok(!boot.perms.tabs.library, 'and the hidden tabs are hidden');
});

test('the presets are readable so the interface can offer them', async () => {
  const res = await world.admin.get('/api/admin/presets');
  assert.equal(res.status, 200);
  assert.equal(res.body.manager.scope, 'all');
  assert.equal(res.body.branch.scope, 'own');
  assert.equal(res.body.viewer.create, 0);
  assert.equal((await world.branch.get('/api/admin/presets')).status, 403);
});

/* --------------------------------------------------------------- audit --- */

test('the trail records who did what', async () => {
  const res = await world.admin.get('/api/admin/audit');
  assert.equal(res.status, 200);
  const actions = res.body.audit.map((a) => a.action);
  for (const expected of ['auth.login', 'user.approve', 'entity.create', 'user.update']) {
    assert.ok(actions.includes(expected), `the trail records ${expected}`);
  }
  assert.equal((await world.branch.get('/api/admin/audit')).status, 403);
});
