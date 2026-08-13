import { getDb, getSetting } from '../db/index.js';
import { uid } from '../lib/auth.js';
import { DEF_CFG, resolvePerms, canReachEntity } from '../lib/domain.js';
import { raise, branchAudience } from './notify.js';
import { audit } from './audit.js';

const DAY = 86400000;

export class ApiError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

export function cfg() {
  return getSetting('cfg', DEF_CFG);
}
export function statusOf(key) {
  return cfg().statuses.find((s) => s.key === key) || null;
}
export function isDone(key) {
  const s = statusOf(key);
  return !!(s && s.done);
}
export function isParked(key) {
  const s = statusOf(key);
  return !!(s && s.parked);
}
export function isActive(issue) {
  return !isDone(issue.status) && !isParked(issue.status);
}
export function daysUntil(ms) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(ms); d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / DAY);
}
export function isOverdue(issue) {
  return isActive(issue) && !!issue.due_date && daysUntil(issue.due_date) < 0;
}

/* ------------------------------------------------------------- shaping ---- */

export function shape(row, { checklist = [], comments = [], activity = [], photos = null } = {}) {
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    entityId: row.entity_id,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    reporter: row.reporter,
    dueDate: row.due_date,
    repeat: row.repeat,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    beforeCount: row.before_count ?? 0,
    afterCount: row.after_count ?? 0,
    checklist: checklist.map((c) => ({ id: c.id, text: c.text, done: !!c.done })),
    comments: comments.map((c) => ({ id: c.id, author: c.author, mgr: !!c.mgr, text: c.text, at: c.created_at })),
    activity: activity.map((a) => ({ id: a.id, by: a.by, note: a.note, at: a.at })),
    photos,
  };
}

/** Issue rows the caller may see, with photo counts folded in by one query. */
export function listIssues(user) {
  const db = getDb();
  const perms = resolvePerms(user);
  const rows = perms.scope === 'all'
    ? db.prepare(`SELECT i.*,
          (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='before') AS before_count,
          (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='after')  AS after_count
        FROM issues i ORDER BY i.created_at DESC`).all()
    : db.prepare(`SELECT i.*,
          (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='before') AS before_count,
          (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='after')  AS after_count
        FROM issues i WHERE i.entity_id = ? ORDER BY i.created_at DESC`).all(user.entity_id || '');

  const ids = rows.map((r) => r.id);
  const byIssue = (table, column) => {
    if (!ids.length) return new Map();
    const marks = ids.map(() => '?').join(',');
    const out = new Map(ids.map((id) => [id, []]));
    for (const r of getDb().prepare(`SELECT * FROM ${table} WHERE issue_id IN (${marks}) ORDER BY ${column}`).all(...ids)) {
      out.get(r.issue_id)?.push(r);
    }
    return out;
  };
  const checklists = byIssue('checklist', 'sort_order');
  const comments = byIssue('comments', 'created_at');
  return rows.map((r) => shape(r, {
    checklist: checklists.get(r.id) || [],
    comments: comments.get(r.id) || [],
  }));
}

export function getIssue(user, id, { withPhotos = false } = {}) {
  const db = getDb();
  const row = db.prepare(`SELECT i.*,
      (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='before') AS before_count,
      (SELECT COUNT(*) FROM photos p WHERE p.issue_id = i.id AND p.kind='after')  AS after_count
    FROM issues i WHERE i.id = ?`).get(id);
  if (!row) return null;
  /* Out of reach means it does not exist, not that it is forbidden. */
  if (!canReachEntity(user, row.entity_id)) return null;
  const photos = withPhotos ? {
    before: db.prepare("SELECT id, data FROM photos WHERE issue_id = ? AND kind='before' ORDER BY at").all(id),
    after: db.prepare("SELECT id, data FROM photos WHERE issue_id = ? AND kind='after' ORDER BY at").all(id),
  } : null;
  return shape(row, {
    checklist: db.prepare('SELECT * FROM checklist WHERE issue_id = ? ORDER BY sort_order').all(id),
    comments: db.prepare('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at').all(id),
    activity: db.prepare('SELECT * FROM activity WHERE issue_id = ? ORDER BY at').all(id),
    photos,
  });
}

function addActivity(issueId, by, note) {
  getDb().prepare('INSERT INTO activity (id, issue_id, by, note, at) VALUES (?, ?, ?, ?, ?)')
    .run(uid('a'), issueId, by || '', note, Date.now());
}

function entityName(entityId) {
  const row = getDb().prepare('SELECT name FROM entities WHERE id = ?').get(entityId);
  return row ? row.name : '';
}

function notifyRows(issue) {
  const s = statusOf(issue.status);
  const p = cfg().priorities.find((x) => x.key === issue.priority);
  return [
    ['الجهة', entityName(issue.entity_id)],
    ['الحالة', s ? s.label : issue.status],
    ['الأولوية', p ? p.label : issue.priority],
    ['المسؤول', issue.assignee],
    ['الاستحقاق', issue.due_date ? new Date(issue.due_date).toLocaleDateString('ar-EG') : '—'],
  ];
}

/* ------------------------------------------------------------- writing ---- */

export function createIssue(user, body) {
  const db = getDb();
  const perms = resolvePerms(user);
  if (!perms.create) throw new ApiError('forbidden', 403);

  const entityId = String(body.entityId || (perms.scope === 'own' ? user.entity_id : '') || '');
  if (!entityId) throw new ApiError('entity_required', 400);
  if (!canReachEntity(user, entityId)) throw new ApiError('forbidden_entity', 403);
  if (!db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)) throw new ApiError('invalid_entity', 400);

  const title = String(body.title || '').trim();
  if (!title) throw new ApiError('title_required', 400);

  let categoryId = body.categoryId ? String(body.categoryId) : null;
  /* "أخرى" lets somebody name a category that does not exist yet. */
  const customCat = String(body.customCategory || '').trim();
  if (customCat) {
    const existing = db.prepare('SELECT id FROM categories WHERE entity_id = ? AND name = ?').get(entityId, customCat);
    if (existing) categoryId = existing.id;
    else {
      categoryId = uid('c');
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE entity_id = ?').get(entityId).n;
      db.prepare('INSERT INTO categories (id, entity_id, name, sort_order) VALUES (?, ?, ?, ?)').run(categoryId, entityId, customCat, order);
    }
  }
  if (!categoryId) throw new ApiError('category_required', 400);
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND entity_id = ?').get(categoryId, entityId);
  if (!cat) throw new ApiError('invalid_category', 400);

  const configuration = cfg();
  const openStatus = configuration.statuses.find((s) => !s.done && !s.parked && !s.gate) || configuration.statuses[0];
  const priority = configuration.priorities.some((p) => p.key === body.priority)
    ? body.priority
    : (configuration.priorities[Math.min(2, configuration.priorities.length - 1)] || configuration.priorities[0]).key;

  const id = uid('i');
  const now = Date.now();
  db.prepare(
    `INSERT INTO issues (id, entity_id, category_id, title, description, status, priority, assignee,
                         reporter, reporter_id, due_date, repeat, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, entityId, categoryId, title, String(body.description || '').trim(), openStatus.key, priority,
    String(body.assignee || '').trim(), user.name, user.id,
    body.dueDate ? Number(body.dueDate) : null,
    ['weekly', 'monthly'].includes(body.repeat) ? body.repeat : 'none',
    JSON.stringify(Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : []),
    now, now,
  );
  addActivity(id, user.name, 'تم إنشاء الملاحظة');
  audit({ userId: user.id, action: 'issue.create', target: id, detail: title });

  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  raise({
    event: 'taskAdded', title, text: row.description, issueId: id, rows: notifyRows(row),
    audience: branchAudience(entityId), actorId: user.id,
  });
  if (row.assignee) {
    raise({
      event: 'assignment', title: `تكليف: ${title}`, text: `المسؤول: ${row.assignee}`, issueId: id,
      rows: notifyRows(row), audience: branchAudience(entityId), actorId: user.id,
    });
  }
  return getIssue(user, id);
}

const EDITABLE = {
  title: 'title', description: 'description', priority: 'priority', assignee: 'assignee',
  dueDate: 'due_date', repeat: 'repeat', categoryId: 'category_id',
};

export function updateIssue(user, id, body) {
  const db = getDb();
  const perms = resolvePerms(user);
  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!row || !canReachEntity(user, row.entity_id)) throw new ApiError('not_found', 404);
  if (!perms.edit) throw new ApiError('forbidden', 403);

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (body[key] === undefined) continue;
    let value = body[key];
    if (key === 'dueDate') value = value ? Number(value) : null;
    else if (key === 'repeat') value = ['weekly', 'monthly'].includes(value) ? value : 'none';
    else if (key === 'priority') {
      if (!cfg().priorities.some((p) => p.key === value)) throw new ApiError('invalid_priority', 400);
    } else if (key === 'categoryId') {
      if (value && !db.prepare('SELECT id FROM categories WHERE id = ? AND entity_id = ?').get(value, row.entity_id)) {
        throw new ApiError('invalid_category', 400);
      }
    } else value = String(value).trim();
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (Array.isArray(body.tags)) {
    sets.push('tags = ?');
    values.push(JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean)));
  }
  /* A manual status override is an edit, not a workflow move — the same
     escape hatch the delivered build gave an administrator. */
  if (body.status && body.status !== row.status) {
    if (!statusOf(body.status)) throw new ApiError('invalid_status', 400);
    sets.push('status = ?');
    values.push(body.status);
  }
  if (body.dueDate !== undefined) sets.push('overdue_flagged = 0', 'due_soon_flagged = 0');
  if (!sets.length) return getIssue(user, id);

  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE issues SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  addActivity(id, user.name, 'تم تعديل الملاحظة');
  audit({ userId: user.id, action: 'issue.update', target: id });

  const fresh = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  raise({
    event: 'taskUpdated', title: fresh.title, text: 'تم تعديل الملاحظة', issueId: id,
    rows: notifyRows(fresh), audience: branchAudience(fresh.entity_id), actorId: user.id,
  });
  return getIssue(user, id);
}

/** The workflow move. Honours the approval gate and spawns the next occurrence
 *  of a repeating task when it closes. */
export function moveStatus(user, id, toKey, note) {
  const db = getDb();
  const perms = resolvePerms(user);
  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!row || !canReachEntity(user, row.entity_id)) throw new ApiError('not_found', 404);

  const target = statusOf(toKey);
  if (!target) throw new ApiError('invalid_status', 400);
  const from = statusOf(row.status);

  /* Leaving a gate needs the approval permission; entering one does not. */
  if (from && from.gate && !perms.approve) throw new ApiError('approval_required', 403);
  if (!perms.changeStatus && !perms.approve) throw new ApiError('forbidden', 403);

  const now = Date.now();
  if (target.done && row.repeat !== 'none') {
    const shift = row.repeat === 'weekly' ? 7 : 30;
    const openStatus = cfg().statuses.find((s) => !s.done && !s.parked) || target;
    const spawnId = uid('i');
    db.prepare(
      `INSERT INTO issues (id, entity_id, category_id, title, description, status, priority, assignee,
                           reporter, reporter_id, due_date, repeat, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(spawnId, row.entity_id, row.category_id, row.title, row.description, openStatus.key, row.priority,
      row.assignee, row.reporter, row.reporter_id, (row.due_date || now) + shift * DAY, row.repeat, row.tags, now, now);
    for (const c of db.prepare('SELECT * FROM checklist WHERE issue_id = ? ORDER BY sort_order').all(id)) {
      db.prepare('INSERT INTO checklist (id, issue_id, text, done, sort_order) VALUES (?, ?, ?, 0, ?)')
        .run(uid('k'), spawnId, c.text, c.sort_order);
    }
    addActivity(spawnId, 'النظام', 'أُنشئت تلقائياً (مهمة متكررة)');
    const spawn = db.prepare('SELECT * FROM issues WHERE id = ?').get(spawnId);
    raise({
      event: 'recurringSpawned', title: spawn.title, text: 'أُنشئت نسخة جديدة للمهمة المتكررة',
      issueId: spawnId, rows: notifyRows(spawn), audience: branchAudience(row.entity_id),
    });
  }

  db.prepare('UPDATE issues SET status = ?, updated_at = ?, overdue_flagged = CASE WHEN ? THEN 0 ELSE overdue_flagged END WHERE id = ?')
    .run(toKey, now, target.done ? 1 : 0, id);
  addActivity(id, user.name, note || `الانتقال إلى: ${target.label}`);
  audit({ userId: user.id, action: 'issue.status', target: id, detail: toKey });

  const fresh = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  const event = target.done ? 'approvedClosed' : (target.gate ? 'pendingApproval' : 'statusChanged');
  raise({
    event, title: fresh.title, text: note || `الحالة الآن: ${target.label}`, issueId: id,
    rows: notifyRows(fresh), audience: branchAudience(fresh.entity_id), actorId: user.id,
  });
  return getIssue(user, id);
}

export function deleteIssue(user, id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!row || !canReachEntity(user, row.entity_id)) throw new ApiError('not_found', 404);
  if (!resolvePerms(user).del) throw new ApiError('forbidden', 403);
  db.prepare('DELETE FROM issues WHERE id = ?').run(id);
  audit({ userId: user.id, action: 'issue.delete', target: id, detail: row.title });
  return true;
}

/* ---------------------------------------------------------- sub-records --- */

function requireIssue(user, id) {
  const row = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!row || !canReachEntity(user, row.entity_id)) throw new ApiError('not_found', 404);
  return row;
}

export function addComment(user, id, text) {
  const row = requireIssue(user, id);
  const perms = resolvePerms(user);
  if (!perms.comment) throw new ApiError('forbidden', 403);
  const body = String(text || '').trim();
  if (!body) throw new ApiError('text_required', 400);
  getDb().prepare(
    'INSERT INTO comments (id, issue_id, user_id, author, mgr, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(uid('cm'), id, user.id, user.name, perms.approve ? 1 : 0, body, Date.now());
  raise({
    event: 'newComment', title: row.title, text: `${user.name}: ${body.slice(0, 160)}`, issueId: id,
    rows: notifyRows(row), audience: branchAudience(row.entity_id), actorId: user.id,
  });
  return getIssue(user, id);
}

export function addChecklist(user, id, text) {
  requireIssue(user, id);
  const body = String(text || '').trim();
  if (!body) throw new ApiError('text_required', 400);
  const db = getDb();
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM checklist WHERE issue_id = ?').get(id).n;
  db.prepare('INSERT INTO checklist (id, issue_id, text, done, sort_order) VALUES (?, ?, ?, 0, ?)')
    .run(uid('k'), id, body, order);
  return getIssue(user, id);
}

export function toggleChecklist(user, id, itemId) {
  requireIssue(user, id);
  const db = getDb();
  const item = db.prepare('SELECT * FROM checklist WHERE id = ? AND issue_id = ?').get(itemId, id);
  if (!item) throw new ApiError('not_found', 404);
  db.prepare('UPDATE checklist SET done = ? WHERE id = ?').run(item.done ? 0 : 1, itemId);
  return getIssue(user, id);
}

export function deleteChecklist(user, id, itemId) {
  requireIssue(user, id);
  getDb().prepare('DELETE FROM checklist WHERE id = ? AND issue_id = ?').run(itemId, id);
  return getIssue(user, id);
}

export function addPhotos(user, id, kind, images) {
  const row = requireIssue(user, id);
  if (!resolvePerms(user).photos) throw new ApiError('forbidden', 403);
  const list = (Array.isArray(images) ? images : []).filter((s) => typeof s === 'string' && s.startsWith('data:image/'));
  if (!list.length) throw new ApiError('no_images', 400);
  const db = getDb();
  const stmt = db.prepare('INSERT INTO photos (id, issue_id, kind, data, by, at) VALUES (?, ?, ?, ?, ?, ?)');
  const at = Date.now();
  for (const data of list) stmt.run(uid('ph'), id, kind === 'after' ? 'after' : 'before', data, user.name, at);
  db.prepare('UPDATE issues SET updated_at = ? WHERE id = ?').run(at, id);
  raise({
    event: 'photoAdded', title: row.title, text: `أُضيفت ${list.length} صورة`, issueId: id,
    rows: notifyRows(row), audience: branchAudience(row.entity_id), actorId: user.id,
  });
  return getIssue(user, id, { withPhotos: true });
}

export function deletePhoto(user, id, photoId) {
  requireIssue(user, id);
  if (!resolvePerms(user).photos) throw new ApiError('forbidden', 403);
  getDb().prepare('DELETE FROM photos WHERE id = ? AND issue_id = ?').run(photoId, id);
  return getIssue(user, id, { withPhotos: true });
}
