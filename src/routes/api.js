import express from 'express';
import config from '../config.js';
import { getDb, getSetting } from '../db/index.js';
import { requireAuth, requirePerm, publicUser, uid } from '../lib/auth.js';
import {
  DEF_CFG, DEF_CATS, resolvePerms, canReachEntity, PERM_GROUPS, TAB_LABELS, NOTIF_LABELS,
} from '../lib/domain.js';
import {
  ApiError, listIssues, getIssue, createIssue, updateIssue, moveStatus, deleteIssue,
  addComment, addChecklist, toggleChecklist, deleteChecklist, addPhotos, deletePhoto, cfg,
} from '../services/issues.js';
import { raise, branchAudience, listNotifications, unreadCount, markRead, markAllRead } from '../services/notify.js';
import { audit } from '../services/audit.js';

const router = express.Router();
router.use(requireAuth);

const clean = (v) => String(v === undefined || v === null ? '' : v).trim();

function handle(res, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ApiError) {
      const { code, status, message, stack, ...extra } = err;
      return res.status(err.status || 400).json({ error: err.code, ...extra });
    }
    throw err;
  }
}

/* --------------------------------------------------------------- bootstrap */
/* One call gives a freshly loaded client everything it needs to render. */
router.get('/bootstrap', (req, res) => {
  const db = getDb();
  const perms = resolvePerms(req.userRow);
  const entities = perms.scope === 'all'
    ? db.prepare('SELECT * FROM entities ORDER BY name').all()
    : db.prepare('SELECT * FROM entities WHERE id = ?').all(req.userRow.entity_id || '');
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();

  res.json({
    user: req.user,
    perms,
    cfg: getSetting('cfg', DEF_CFG),
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      categories: categories.filter((c) => c.entity_id === e.id).map((c) => ({ id: c.id, name: c.name })),
    })),
    team: db.prepare('SELECT name FROM team ORDER BY name').all().map((r) => r.name),
    labels: { perms: PERM_GROUPS, tabs: TAB_LABELS, events: NOTIF_LABELS },
    pendingRegistrations: perms.manageUsers
      ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get().n
      : 0,
    unread: unreadCount(req.userRow.id),
    org: config.orgName,
  });
});

/* ------------------------------------------------------------------ issues */

router.get('/issues', (req, res) => {
  const issues = listIssues(req.userRow);
  res.json({ issues, count: issues.length });
});

router.get('/issues/:id', (req, res) => {
  const issue = getIssue(req.userRow, req.params.id, { withPhotos: req.query.photos === '1' });
  if (!issue) return res.status(404).json({ error: 'not_found' });
  return res.json({ issue });
});

router.post('/issues', (req, res) => handle(res, () => res.status(201).json({ issue: createIssue(req.userRow, req.body || {}) })));
router.patch('/issues/:id', (req, res) => handle(res, () => res.json({ issue: updateIssue(req.userRow, req.params.id, req.body || {}) })));
router.post('/issues/:id/status', (req, res) => handle(res, () => res.json({ issue: moveStatus(req.userRow, req.params.id, clean(req.body?.status), clean(req.body?.note)) })));
router.delete('/issues/:id', (req, res) => handle(res, () => { deleteIssue(req.userRow, req.params.id); return res.json({ ok: true }); }));

router.post('/issues/:id/comments', (req, res) => handle(res, () => res.status(201).json({ issue: addComment(req.userRow, req.params.id, req.body?.text) })));
router.post('/issues/:id/checklist', (req, res) => handle(res, () => res.status(201).json({ issue: addChecklist(req.userRow, req.params.id, req.body?.text) })));
router.patch('/issues/:id/checklist/:item', (req, res) => handle(res, () => res.json({ issue: toggleChecklist(req.userRow, req.params.id, req.params.item) })));
router.delete('/issues/:id/checklist/:item', (req, res) => handle(res, () => res.json({ issue: deleteChecklist(req.userRow, req.params.id, req.params.item) })));
router.post('/issues/:id/photos', (req, res) => handle(res, () => res.status(201).json({ issue: addPhotos(req.userRow, req.params.id, clean(req.body?.kind), req.body?.images) })));
router.delete('/issues/:id/photos/:photo', (req, res) => handle(res, () => res.json({ issue: deletePhoto(req.userRow, req.params.id, req.params.photo) })));

/* ---------------------------------------------------------------- entities */

router.get('/entities', (req, res) => {
  const db = getDb();
  const perms = resolvePerms(req.userRow);
  const rows = perms.scope === 'all'
    ? db.prepare('SELECT * FROM entities ORDER BY name').all()
    : db.prepare('SELECT * FROM entities WHERE id = ?').all(req.userRow.entity_id || '');
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  res.json({
    entities: rows.map((e) => ({
      id: e.id, name: e.name, type: e.type,
      categories: categories.filter((c) => c.entity_id === e.id).map((c) => ({ id: c.id, name: c.name })),
    })),
  });
});

router.post('/entities', requirePerm('manageEntities'), (req, res) => {
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const type = clean(req.body?.type) || 'other';
  const db = getDb();
  const id = uid('e');
  db.prepare('INSERT INTO entities (id, name, type, created_at) VALUES (?, ?, ?, ?)').run(id, name, type, Date.now());
  const cats = (getSetting('cfg', DEF_CFG).defaultCats || DEF_CATS);
  const stmt = db.prepare('INSERT INTO categories (id, entity_id, name, sort_order) VALUES (?, ?, ?, ?)');
  cats.forEach((c, i) => stmt.run(uid('c'), id, c, i));
  audit({ userId: req.userRow.id, action: 'entity.create', target: id, detail: name });
  return res.status(201).json({ ok: true, id });
});

router.patch('/entities/:id', requirePerm('manageEntities'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE entities SET name = ?, type = ? WHERE id = ?')
    .run(clean(req.body?.name) || row.name, clean(req.body?.type) || row.type, row.id);
  audit({ userId: req.userRow.id, action: 'entity.update', target: row.id });
  return res.json({ ok: true });
});

router.delete('/entities/:id', requirePerm('manageEntities'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  /* Cascades through categories, issues, photos, comments and documents. */
  db.prepare('DELETE FROM entities WHERE id = ?').run(row.id);
  audit({ userId: req.userRow.id, action: 'entity.delete', target: row.id, detail: row.name });
  return res.json({ ok: true });
});

router.post('/entities/:id/categories', requirePerm('manageEntities'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM entities WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE entity_id = ?').get(req.params.id).n;
  db.prepare('INSERT INTO categories (id, entity_id, name, sort_order) VALUES (?, ?, ?, ?)').run(uid('c'), req.params.id, name, order);
  return res.status(201).json({ ok: true });
});

router.patch('/entities/:id/categories/:cat', requirePerm('manageEntities'), (req, res) => {
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const changed = getDb().prepare('UPDATE categories SET name = ? WHERE id = ? AND entity_id = ?')
    .run(name, req.params.cat, req.params.id).changes;
  return changed ? res.json({ ok: true }) : res.status(404).json({ error: 'not_found' });
});

router.delete('/entities/:id/categories/:cat', requirePerm('manageEntities'), (req, res) => {
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) AS n FROM issues WHERE category_id = ?').get(req.params.cat).n;
  if (used > 0) return res.status(400).json({ error: 'category_in_use', issues: used });
  db.prepare('DELETE FROM categories WHERE id = ? AND entity_id = ?').run(req.params.cat, req.params.id);
  return res.json({ ok: true });
});

/* --------------------------------------------------------------- library -- */

router.get('/entities/:id/documents', (req, res) => {
  if (!canReachEntity(req.userRow, req.params.id)) return res.status(404).json({ error: 'not_found' });
  const rows = getDb()
    .prepare('SELECT id, name, type, size, by, at FROM documents WHERE entity_id = ? ORDER BY at DESC')
    .all(req.params.id);
  res.json({ documents: rows });
});

router.get('/documents/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!row || !canReachEntity(req.userRow, row.entity_id)) return res.status(404).json({ error: 'not_found' });
  res.json({ document: row });
});

router.post('/entities/:id/documents', requirePerm('uploadDocs'), (req, res) => {
  if (!canReachEntity(req.userRow, req.params.id)) return res.status(404).json({ error: 'not_found' });
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!files.length) return res.status(400).json({ error: 'no_files' });
  const db = getDb();
  const stmt = db.prepare('INSERT INTO documents (id, entity_id, name, type, size, data, by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const at = Date.now();
  let stored = 0;
  for (const f of files) {
    const name = clean(f?.name) || 'ملف';
    const data = typeof f?.data === 'string' ? f.data : null;
    /* Measured here, never taken from the caller: a declared size is a claim,
       and the ceiling has to hold against a client that lies about it. */
    const size = data ? Buffer.byteLength(data, 'utf8') : 0;
    if (!data || size > config.maxUploadBytes) continue;
    stmt.run(uid('d'), req.params.id, name, clean(f?.type) || 'application/octet-stream', size,
      data, req.userRow.name, at);
    stored += 1;
  }
  if (!stored) return res.status(413).json({ error: 'files_too_large', maxBytes: config.maxUploadBytes });
  raise({
    event: 'libraryUpload', title: `رفع ${stored} ملف`, text: `الفرع: ${req.params.id}`,
    audience: branchAudience(req.params.id), actorId: req.userRow.id,
  });
  return res.status(201).json({ ok: true, stored });
});

router.delete('/documents/:id', requirePerm('deleteDocs'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!row || !canReachEntity(req.userRow, row.entity_id)) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM documents WHERE id = ?').run(row.id);
  return res.json({ ok: true });
});

/* --------------------------------------------------------- notifications -- */

router.get('/notifications', (req, res) => {
  res.json({
    notifications: listNotifications(req.userRow.id, req.query.limit),
    unread: unreadCount(req.userRow.id),
  });
});

router.post('/notifications/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids_required' });
  return res.json({ changed: markRead(req.userRow.id, ids), unread: unreadCount(req.userRow.id) });
});

router.post('/notifications/read-all', (req, res) => {
  res.json({ changed: markAllRead(req.userRow.id), unread: 0 });
});

/* ----------------------------------------------------------------- export -- */

router.get('/export.csv', requirePerm('export'), (req, res) => {
  const issues = listIssues(req.userRow);
  const db = getDb();
  const entities = new Map(db.prepare('SELECT id, name FROM entities').all().map((e) => [e.id, e.name]));
  const configuration = cfg();
  const statusLabel = (k) => (configuration.statuses.find((s) => s.key === k) || {}).label || k;
  const prioLabel = (k) => (configuration.priorities.find((p) => p.key === k) || {}).label || k;

  const head = ['ID', 'العنوان', 'الجهة', 'الحالة', 'الأولوية', 'المسؤول', 'الاستحقاق'];
  const rows = issues.map((i) => [
    i.id, i.title, entities.get(i.entityId) || '', statusLabel(i.status), prioLabel(i.priority),
    i.assignee || '', i.dueDate ? new Date(i.dueDate).toLocaleDateString('ar-KW') : '',
  ]);
  const csv = '﻿' + [head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mutabea.csv"');
  res.send(csv);
});

export default router;
