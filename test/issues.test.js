/* The records themselves: scope, the workflow gate, sub-resources and export. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, client, makeEntity, member, stop } from './helpers.js';

test.after(stop);

const world = {};

test('setup: two branches and a branch account on one of them', async () => {
  world.admin = await admin();
  world.mine = await makeEntity(world.admin, 'فرع القصور');
  world.theirs = await makeEntity(world.admin, 'فرع سلوى');
  world.branch = await member(world.admin, {
    username: 'noura', name: 'نورة', email: 'noura@example.com', entityId: world.mine,
  });
  const boot = await world.admin.get('/api/bootstrap');
  world.cats = boot.body.entities.find((e) => e.id === world.mine).categories;
  world.otherCats = boot.body.entities.find((e) => e.id === world.theirs).categories;
  assert.ok(world.cats.length, 'a new branch comes with the default categories');
});

test('a record is created, read back and edited', async () => {
  const created = await world.admin.post('/api/issues', {
    entityId: world.mine, categoryId: world.cats[0].id,
    title: 'تصليح مكيف الصف الأول', description: 'لا يبرّد', priority: 'high',
  });
  assert.equal(created.status, 201);
  world.issueId = created.body.issue.id;

  const read = await world.admin.get(`/api/issues/${world.issueId}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.issue.title, 'تصليح مكيف الصف الأول');

  const edited = await world.admin.patch(`/api/issues/${world.issueId}`, { title: 'تصليح مكيف الصف الأول — عاجل' });
  assert.equal(edited.status, 200);
  assert.match(edited.body.issue.title, /عاجل$/);
});

test('a record without a title or a category is refused', async () => {
  const noTitle = await world.admin.post('/api/issues', { entityId: world.mine, categoryId: world.cats[0].id, title: '  ' });
  assert.equal(noTitle.code, 'title_required');
  const noCat = await world.admin.post('/api/issues', { entityId: world.mine, title: 'بلا تصنيف' });
  assert.equal(noCat.code, 'category_required');
});

test('a branch account sees only its own branch', async () => {
  await world.admin.post('/api/issues', {
    entityId: world.theirs, categoryId: world.otherCats[0].id, title: 'ملاحظة فرع آخر',
  });
  const mine = await world.branch.get('/api/issues');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.issues.length >= 1);
  assert.ok(mine.body.issues.every((i) => i.entityId === world.mine), 'nothing from another branch leaks');

  const all = await world.admin.get('/api/issues');
  assert.ok(all.body.issues.length > mine.body.issues.length);
});

test('a record out of reach reads as missing, not as forbidden', async () => {
  const all = await world.admin.get('/api/issues');
  const other = all.body.issues.find((i) => i.entityId === world.theirs);
  const res = await world.branch.get(`/api/issues/${other.id}`);
  assert.equal(res.status, 404, 'existence itself is not disclosed');
  assert.equal((await world.branch.patch(`/api/issues/${other.id}`, { title: 'ه' })).status, 404);
  assert.equal((await world.branch.del(`/api/issues/${other.id}`)).status, 404);
});

test('a branch account cannot write outside its branch', async () => {
  const res = await world.branch.post('/api/issues', {
    entityId: world.theirs, categoryId: world.otherCats[0].id, title: 'محاولة',
  });
  assert.equal(res.status, 403);
  assert.equal(res.code, 'forbidden_entity');
});

test('a branch account cannot reach the administration', async () => {
  for (const path of ['/api/admin/users', '/api/admin/registrations', '/api/admin/emails', '/api/admin/audit']) {
    assert.equal((await world.branch.get(path)).status, 403, path);
  }
  assert.equal((await world.branch.post('/api/entities', { name: 'فرع مهرّب' })).status, 403);
});

test('the workflow gate holds against an account without approval rights', async () => {
  const cfg = (await world.admin.get('/api/bootstrap')).body.cfg;
  const gate = cfg.statuses.find((s) => s.gate);
  assert.ok(gate, 'the default workflow has an approval gate');
  const after = cfg.statuses[cfg.statuses.findIndex((s) => s.key === gate.key) + 1];

  const created = await world.branch.post('/api/issues', {
    entityId: world.mine, categoryId: world.cats[0].id, title: 'يحتاج اعتماداً',
  });
  const id = created.body.issue.id;
  await world.branch.post(`/api/issues/${id}/status`, { status: gate.key });

  const blocked = await world.branch.post(`/api/issues/${id}/status`, { status: after.key });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.code, 'approval_required');

  const allowed = await world.admin.post(`/api/issues/${id}/status`, { status: after.key });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.issue.status, after.key);
});

test('closing a recurring record spawns the next one', async () => {
  const cfg = (await world.admin.get('/api/bootstrap')).body.cfg;
  const closed = cfg.statuses.find((s) => s.done);
  const created = await world.admin.post('/api/issues', {
    entityId: world.mine, categoryId: world.cats[0].id, title: 'جرد المخزون', repeat: 'weekly',
    dueDate: Date.now(),
  });
  const before = (await world.admin.get('/api/issues')).body.issues.length;
  const done = await world.admin.post(`/api/issues/${created.body.issue.id}/status`, { status: closed.key });
  assert.equal(done.status, 200);
  const after = (await world.admin.get('/api/issues')).body.issues;
  assert.equal(after.length, before + 1, 'the next occurrence exists');
  const next = after.find((i) => i.title === 'جرد المخزون' && i.id !== created.body.issue.id);
  assert.ok(next, 'the copy carries the same title');
  assert.ok(next.dueDate > created.body.issue.dueDate, 'and a later due date');
});

test('comments, checklists and photographs attach and detach', async () => {
  const id = world.issueId;
  assert.equal((await world.admin.post(`/api/issues/${id}/comments`, { text: '   ' })).code, 'text_required');

  const comment = await world.admin.post(`/api/issues/${id}/comments`, { text: 'تم التواصل مع الفني' });
  assert.equal(comment.status, 201);

  const item = await world.admin.post(`/api/issues/${id}/checklist`, { text: 'شراء قطعة الغيار' });
  assert.equal(item.status, 201);
  const entry = item.body.issue.checklist.at(-1);
  assert.equal(entry.text, 'شراء قطعة الغيار');
  assert.ok(!entry.done);

  const toggled = await world.admin.patch(`/api/issues/${id}/checklist/${entry.id}`);
  assert.equal(toggled.status, 200);
  assert.ok(toggled.body.issue.checklist.find((c) => c.id === entry.id).done, 'the item is ticked');
  const removed = await world.admin.del(`/api/issues/${id}/checklist/${entry.id}`);
  assert.equal(removed.status, 200);
  assert.ok(!removed.body.issue.checklist.some((c) => c.id === entry.id));

  const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const added = await world.admin.post(`/api/issues/${id}/photos`, { kind: 'before', images: [pixel] });
  assert.equal(added.status, 201);
  const lean = await world.admin.get(`/api/issues/${id}`);
  assert.equal(lean.body.issue.photos, null, 'the heavy data is not sent unasked');

  const withPhotos = await world.admin.get(`/api/issues/${id}?photos=1`);
  assert.equal(withPhotos.body.issue.photos.before.length, 1);
  assert.equal(withPhotos.body.issue.photos.after.length, 0);
  const photoId = withPhotos.body.issue.photos.before[0].id;
  assert.equal((await world.admin.del(`/api/issues/${id}/photos/${photoId}`)).status, 200);

  const full = await world.admin.get(`/api/issues/${id}`);
  assert.ok(full.body.issue.comments.length >= 1);
  assert.ok(full.body.issue.activity.length >= 1, 'the trail records what happened');
});

test('a category still holding records cannot be deleted', async () => {
  const used = world.cats[0].id;
  const res = await world.admin.del(`/api/entities/${world.mine}/categories/${used}`);
  assert.equal(res.status, 400);
  assert.equal(res.code, 'category_in_use');
});

test('the export carries a byte-order mark and Arabic headings', async () => {
  const res = await fetch(`${(await import('./helpers.js')).base}/api/export.csv`, {
    headers: { authorization: `Bearer ${world.admin.token}` },
  });
  assert.equal(res.status, 200);
  /* Read the bytes: decoding to text would swallow the mark. */
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'Excel needs the mark to read UTF-8');
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /العنوان/);
  assert.match(res.headers.get('content-type') || '', /text\/csv/);
});

test('a session is required for every record route', async () => {
  const anon = client();
  assert.equal((await anon.get('/api/issues')).status, 401);
  assert.equal((await anon.post('/api/issues', { title: 'x' })).status, 401);
  assert.equal((await anon.get('/api/export.csv')).status, 401);
});
