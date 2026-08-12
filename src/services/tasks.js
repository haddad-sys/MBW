import config from '../config.js';
import { getDb } from '../db/index.js';
import { uid, nextTaskId } from '../lib/ids.js';
import { can, taskAccess, PRIORITIES } from '../lib/permissions.js';
import { dueInstant, isOverdue, isValidClock, isValidDate, DAY } from '../lib/time.js';
import { notify, notifyTaskAudience, taskAudience } from './notify.js';
import { record } from './audit.js';

export function statusIndex() {
  const rows = getDb().prepare('SELECT * FROM statuses ORDER BY sort_order').all();
  return {
    rows,
    byId: new Map(rows.map((r) => [r.id, r])),
    closed: new Set(rows.filter((r) => r.kind === 'closed').map((r) => r.id)),
    stuck: new Set(rows.filter((r) => r.kind === 'stuck').map((r) => r.id)),
  };
}

export function orgIndexFor(user) {
  if (!user) return { directReports: new Set() };
  const rows = getDb().prepare('SELECT id FROM users WHERE manager = ?').all(user.id);
  return { directReports: new Set(rows.map((r) => r.id)) };
}

export function linksFor(taskId) {
  const db = getDb();
  return {
    watchers: db.prepare('SELECT user FROM task_watchers WHERE task = ?').all(taskId).map((r) => r.user),
    participants: db.prepare('SELECT user FROM task_participants WHERE task = ?').all(taskId).map((r) => r.user),
    tags: db.prepare('SELECT tag FROM task_tags WHERE task = ?').all(taskId).map((r) => r.tag),
  };
}

function allLinks(taskIds) {
  const db = getDb();
  const map = new Map(taskIds.map((id) => [id, { watchers: [], participants: [], tags: [] }]));
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT task, user FROM task_watchers WHERE task IN (${placeholders})`).all(...taskIds)) {
    map.get(r.task)?.watchers.push(r.user);
  }
  for (const r of db.prepare(`SELECT task, user FROM task_participants WHERE task IN (${placeholders})`).all(...taskIds)) {
    map.get(r.task)?.participants.push(r.user);
  }
  for (const r of db.prepare(`SELECT task, tag FROM task_tags WHERE task IN (${placeholders})`).all(...taskIds)) {
    map.get(r.task)?.tags.push(r.tag);
  }
  return map;
}

/* A task row plus everything a client needs to render it without a second
   round trip, including the derived conditions that are never stored. */
export function decorate(task, links, sIndex, at = Date.now()) {
  const overdue = isOverdue(task, sIndex.closed, at);
  const inst = dueInstant(task.due_date, task.due_time);
  const dueSoon = !overdue && inst !== null && !sIndex.closed.has(task.status) && inst - at <= DAY * 2 && inst >= at;
  return {
    id: task.id,
    title: task.title,
    titleAr: task.title_ar,
    description: task.description,
    status: task.status,
    statusKind: sIndex.byId.get(task.status)?.kind || 'open',
    priority: task.priority,
    startDate: task.start_date,
    dueDate: task.due_date,
    dueTime: task.due_time,
    category: task.category,
    project: task.project,
    dept: task.dept,
    team: task.team,
    owner: task.owner,
    assignee: task.assignee,
    progress: task.progress,
    estimate: task.estimate,
    actual: task.actual,
    parent: task.parent,
    source: task.source,
    reminderLead: task.reminder_lead,
    escalationDays: task.escalation_days,
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedBy: task.updated_by,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    cancelledAt: task.cancelled_at,
    statusSince: task.status_since,
    escalatedAt: task.escalated_at,
    escalatedTo: task.escalated_to,
    watchers: links.watchers,
    participants: links.participants,
    tags: links.tags,
    overdue,
    dueSoon,
    dueInstant: inst,
    closed: sIndex.closed.has(task.status),
  };
}

export function listTasks(user, filters = {}) {
  const db = getDb();
  const sIndex = statusIndex();
  const orgIndex = orgIndexFor(user);
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  const links = allLinks(rows.map((r) => r.id));
  const at = Date.now();

  let out = rows.filter((t) => taskAccess(user, t, links.get(t.id), orgIndex) !== 'none');

  if (filters.status) out = out.filter((t) => t.status === filters.status);
  if (filters.priority) out = out.filter((t) => t.priority === filters.priority);
  if (filters.assignee) out = out.filter((t) => t.assignee === filters.assignee);
  if (filters.project) out = out.filter((t) => t.project === filters.project);
  if (filters.category) out = out.filter((t) => t.category === filters.category);
  if (filters.mine) out = out.filter((t) => t.assignee === user.id || t.owner === user.id);
  if (filters.following) {
    out = out.filter((t) => links.get(t.id).watchers.includes(user.id));
  }
  if (filters.open) out = out.filter((t) => !sIndex.closed.has(t.status));
  if (filters.overdue) out = out.filter((t) => isOverdue(t, sIndex.closed, at));
  if (filters.q) {
    const q = String(filters.q).toLowerCase();
    out = out.filter((t) => `${t.id} ${t.title} ${t.title_ar} ${t.description}`.toLowerCase().includes(q));
  }

  return out.map((t) => ({
    ...decorate(t, links.get(t.id), sIndex, at),
    access: taskAccess(user, t, links.get(t.id), orgIndex),
  }));
}

export function getTask(user, id) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;
  const links = linksFor(id);
  const access = taskAccess(user, task, links, orgIndexFor(user));
  if (access === 'none') return null;
  const sIndex = statusIndex();
  return {
    ...decorate(task, links, sIndex),
    access,
    comments: db
      .prepare(
        `SELECT c.*, u.name AS user_name, u.name_ar AS user_name_ar
           FROM comments c LEFT JOIN users u ON u.id = c.user
          WHERE c.task = ? ORDER BY c.created_at`,
      )
      .all(id),
    checklist: db.prepare('SELECT * FROM checklist WHERE task = ? ORDER BY sort_order, rowid').all(id),
    reminders: db.prepare('SELECT * FROM reminders WHERE task = ? ORDER BY fire_at').all(id),
  };
}

const EDITABLE = {
  title: 'title',
  titleAr: 'title_ar',
  description: 'description',
  status: 'status',
  priority: 'priority',
  startDate: 'start_date',
  dueDate: 'due_date',
  dueTime: 'due_time',
  category: 'category',
  project: 'project',
  dept: 'dept',
  team: 'team',
  owner: 'owner',
  assignee: 'assignee',
  progress: 'progress',
  estimate: 'estimate',
  actual: 'actual',
  parent: 'parent',
  reminderLead: 'reminder_lead',
  escalationDays: 'escalation_days',
};

function clean(field, value) {
  if (value === undefined) return undefined;
  if (field === 'progress') {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  if (field === 'estimate' || field === 'actual') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (field === 'reminder_lead' || field === 'escalation_days') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if (value === null || value === '') return field === 'title' ? '' : null;
  return String(value);
}

export class TaskError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

function validate(db, patch) {
  if (patch.priority !== undefined && patch.priority !== null && !PRIORITIES.includes(patch.priority)) {
    throw new TaskError('invalid_priority', 400, { allowed: PRIORITIES });
  }
  if (patch.status) {
    const s = db.prepare('SELECT id FROM statuses WHERE id = ? AND active = 1').get(patch.status);
    if (!s) throw new TaskError('invalid_status', 400);
  }
  for (const key of ['assignee', 'owner']) {
    if (patch[key]) {
      const u = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(patch[key]);
      if (!u) throw new TaskError(`invalid_${key}`, 400);
    }
  }
  if (patch.dueDate && !isValidDate(patch.dueDate)) throw new TaskError('invalid_due_date', 400);
  if (patch.dueTime && !isValidClock(patch.dueTime)) throw new TaskError('invalid_due_time', 400);
}

/* An automatic reminder mirrors the due date. Regenerating it on every change
   keeps exactly one un-fired auto reminder per task, so moving a deadline can
   never leave a stale alarm behind. */
export function syncAutoReminder(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;
  db.prepare('DELETE FROM reminders WHERE task = ? AND auto = 1 AND fired = 0').run(taskId);
  const sIndex = statusIndex();
  if (!task.due_date || sIndex.closed.has(task.status)) return null;
  const inst = dueInstant(task.due_date, task.due_time);
  if (inst === null) return null;
  const lead = task.reminder_lead === null || task.reminder_lead === undefined
    ? config.defaults.reminderLeadDays
    : task.reminder_lead;
  const fireAt = inst - lead * DAY;
  if (fireAt <= Date.now()) return null;
  const id = uid('rem');
  db.prepare(
    `INSERT INTO reminders (id, task, user, fire_at, kind, note, fired, auto, created_at)
     VALUES (?, ?, NULL, ?, 'reminder', '', 0, 1, ?)`,
  ).run(id, taskId, fireAt, Date.now());
  return id;
}

export function createTask(user, payload = {}) {
  const db = getDb();
  if (!can(user, 'task.create')) throw new TaskError('forbidden', 403);
  const title = String(payload.title || '').trim();
  if (!title) throw new TaskError('title_required', 400);
  validate(db, payload);
  if (payload.assignee && payload.assignee !== user.id && !can(user, 'task.assign')) {
    throw new TaskError('forbidden_assign', 403);
  }

  const id = payload.id && /^[\w-]+$/.test(payload.id) ? payload.id : nextTaskId(db);
  const now = Date.now();
  const assignee = payload.assignee || null;
  const owner = payload.owner || user.id;

  db.prepare(
    `INSERT INTO tasks (id, title, title_ar, description, status, priority, start_date, due_date, due_time,
                        category, project, dept, team, owner, assignee, progress, estimate, actual, parent,
                        source, reminder_lead, escalation_days, created_by, created_at, updated_by, updated_at,
                        status_since)
     VALUES (@id, @title, @title_ar, @description, @status, @priority, @start_date, @due_date, @due_time,
             @category, @project, @dept, @team, @owner, @assignee, @progress, @estimate, @actual, @parent,
             @source, @reminder_lead, @escalation_days, @created_by, @created_at, @updated_by, @updated_at,
             @status_since)`,
  ).run({
    id,
    title,
    title_ar: payload.titleAr || '',
    description: payload.description || '',
    status: payload.status || (assignee ? 'assigned' : 'new'),
    priority: payload.priority || 'Medium',
    start_date: payload.startDate || null,
    due_date: payload.dueDate || null,
    due_time: payload.dueTime || null,
    category: payload.category || null,
    project: payload.project || null,
    dept: payload.dept || null,
    team: payload.team || null,
    owner,
    assignee,
    progress: clean('progress', payload.progress ?? 0),
    estimate: clean('estimate', payload.estimate),
    actual: clean('actual', payload.actual),
    parent: payload.parent || null,
    source: payload.source || 'app',
    reminder_lead: clean('reminder_lead', payload.reminderLead),
    escalation_days: clean('escalation_days', payload.escalationDays),
    created_by: user.id,
    created_at: now,
    updated_by: user.id,
    updated_at: now,
    status_since: now,
  });

  setTags(id, payload.tags);
  /* The creator follows their own task by default — that is the whole promise
     of a follow-up console. */
  addWatcher(id, user.id, user.id, { silent: true });
  if (assignee) addWatcher(id, assignee, user.id, { silent: true });
  for (const w of payload.watchers || []) addWatcher(id, w, user.id, { silent: true });

  record({ user: user.id, action: 'task.create', task: id, to: title });
  syncAutoReminder(id);

  if (assignee) {
    notify({
      userId: assignee,
      kind: 'assign',
      taskId: id,
      actorId: user.id,
      text: `${user.name} assigned you "${title}".`,
      textAr: `أسند إليك ${user.name_ar || user.name} المهمة «${payload.titleAr || title}».`,
    });
  }
  return getTask(user, id);
}

export function updateTask(user, id, patch = {}) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) throw new TaskError('not_found', 404);
  const links = linksFor(id);
  const access = taskAccess(user, task, links, orgIndexFor(user));
  if (access === 'none') throw new TaskError('not_found', 404);
  if (access !== 'edit') throw new TaskError('read_only', 403);
  validate(db, patch);

  if (patch.assignee !== undefined && patch.assignee !== task.assignee && !can(user, 'task.assign')) {
    throw new TaskError('forbidden_assign', 403);
  }
  if ((patch.dueDate !== undefined || patch.dueTime !== undefined) && !can(user, 'task.deadline') && task.assignee !== user.id && task.owner !== user.id) {
    throw new TaskError('forbidden_deadline', 403);
  }
  if (patch.priority !== undefined && patch.priority !== task.priority && !can(user, 'task.priority') && task.owner !== user.id) {
    throw new TaskError('forbidden_priority', 403);
  }

  const sIndex = statusIndex();
  const sets = [];
  const values = [];
  const changes = [];

  for (const [apiKey, column] of Object.entries(EDITABLE)) {
    if (patch[apiKey] === undefined) continue;
    const value = clean(column, patch[apiKey]);
    if (value === undefined || value === task[column]) continue;
    sets.push(`${column} = ?`);
    values.push(value);
    changes.push({ field: apiKey, from: task[column], to: value });
  }

  const now = Date.now();
  const statusChange = changes.find((c) => c.field === 'status');
  if (statusChange) {
    sets.push('status_since = ?');
    values.push(now);
    const closing = sIndex.closed.has(statusChange.to);
    if (statusChange.to === 'done') { sets.push('completed_at = ?'); values.push(now); }
    if (statusChange.to === 'cancelled') { sets.push('cancelled_at = ?'); values.push(now); }
    if (!closing) {
      sets.push('completed_at = NULL', 'cancelled_at = NULL');
    }
  }
  /* Moving a deadline clears the "we already told them" flags, otherwise a
     rescheduled task would never announce itself again. */
  if (changes.some((c) => c.field === 'dueDate' || c.field === 'dueTime')) {
    sets.push('overdue_flagged = 0', 'due_soon_flagged = 0', 'escalated_at = NULL', 'escalated_to = NULL');
  }

  if (patch.tags !== undefined) setTags(id, patch.tags);

  if (sets.length === 0 && patch.tags === undefined) return getTask(user, id);

  if (sets.length) {
    sets.push('updated_by = ?', 'updated_at = ?');
    values.push(user.id, now, id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  for (const c of changes) record({ user: user.id, action: 'task.update', task: id, field: c.field, from: c.from, to: c.to });

  const fresh = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  syncAutoReminder(id);
  raiseUpdateNotifications(user, task, fresh, changes, sIndex);
  return getTask(user, id);
}

function raiseUpdateNotifications(actor, before, after, changes, sIndex) {
  const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
  const titleEn = after.title;
  const titleAr = after.title_ar || after.title;

  if (byField.assignee) {
    if (after.assignee) {
      addWatcher(after.id, after.assignee, actor.id, { silent: true });
      notify({
        userId: after.assignee,
        kind: 'assign',
        taskId: after.id,
        actorId: actor.id,
        text: `${actor.name} assigned you "${titleEn}".`,
        textAr: `أسند إليك ${actor.name_ar || actor.name} المهمة «${titleAr}».`,
      });
    }
    if (before.assignee) {
      notify({
        userId: before.assignee,
        kind: 'reassign',
        taskId: after.id,
        actorId: actor.id,
        text: `"${titleEn}" was reassigned away from you.`,
        textAr: `أُعيد إسناد المهمة «${titleAr}» إلى شخص آخر.`,
      });
    }
  }

  if (byField.status) {
    const closed = sIndex.closed.has(after.status);
    const kind = after.status === 'done' ? 'complete' : 'status';
    const name = sIndex.byId.get(after.status)?.name || after.status;
    const nameAr = sIndex.byId.get(after.status)?.name_ar || name;
    notifyTaskAudience(after.id, {
      kind,
      actorId: actor.id,
      text: closed && after.status === 'done'
        ? `${actor.name} completed "${titleEn}".`
        : `${actor.name} moved "${titleEn}" to ${name}.`,
      textAr: closed && after.status === 'done'
        ? `أكمل ${actor.name_ar || actor.name} المهمة «${titleAr}».`
        : `نقل ${actor.name_ar || actor.name} المهمة «${titleAr}» إلى «${nameAr}».`,
    });
  }

  if (byField.dueDate || byField.dueTime) {
    notifyTaskAudience(after.id, {
      kind: 'due',
      actorId: actor.id,
      text: `The due date of "${titleEn}" is now ${after.due_date || 'unset'}.`,
      textAr: `أصبح تاريخ استحقاق المهمة «${titleAr}» ${after.due_date || 'غير محدد'}.`,
    });
  }

  if (byField.priority && after.priority === 'Critical') {
    notifyTaskAudience(after.id, {
      kind: 'update',
      actorId: actor.id,
      text: `"${titleEn}" was raised to Critical priority.`,
      textAr: `رُفعت أولوية المهمة «${titleAr}» إلى حرجة.`,
    });
  }
}

export function deleteTask(user, id) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) throw new TaskError('not_found', 404);
  if (!can(user, 'task.delete')) throw new TaskError('forbidden', 403);
  const access = taskAccess(user, task, linksFor(id), orgIndexFor(user));
  if (access !== 'edit') throw new TaskError('read_only', 403);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  record({ user: user.id, action: 'task.delete', task: id, from: task.title });
  return true;
}

export function setTags(taskId, tags) {
  if (!Array.isArray(tags)) return;
  const db = getDb();
  db.prepare('DELETE FROM task_tags WHERE task = ?').run(taskId);
  const stmt = db.prepare('INSERT OR IGNORE INTO task_tags (task, tag) VALUES (?, ?)');
  for (const tag of tags) {
    const t = String(tag || '').trim();
    if (t) stmt.run(taskId, t);
  }
}

/* ------------------------------------------------------------ المتابعون ---- */

export function addWatcher(taskId, userId, actorId, { silent = false } = {}) {
  const db = getDb();
  if (!db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(userId)) return false;
  const existing = db.prepare('SELECT user FROM task_watchers WHERE task = ? AND user = ?').get(taskId, userId);
  if (existing) return false;
  db.prepare('INSERT INTO task_watchers (task, user, added_at, added_by) VALUES (?, ?, ?, ?)')
    .run(taskId, userId, Date.now(), actorId || null);
  record({ user: actorId, action: 'task.watch.add', task: taskId, to: userId });

  if (!silent && actorId !== userId) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const actor = actorId ? db.prepare('SELECT name, name_ar FROM users WHERE id = ?').get(actorId) : null;
    notify({
      userId,
      kind: 'watch',
      taskId,
      actorId,
      text: `${actor?.name || 'Someone'} added you as a follower of "${task?.title || taskId}".`,
      textAr: `أضافك ${actor?.name_ar || actor?.name || 'أحدهم'} كمتابع للمهمة «${task?.title_ar || task?.title || taskId}».`,
    });
  }
  return true;
}

export function removeWatcher(taskId, userId, actorId) {
  const changes = getDb().prepare('DELETE FROM task_watchers WHERE task = ? AND user = ?').run(taskId, userId).changes;
  if (changes) record({ user: actorId, action: 'task.watch.remove', task: taskId, to: userId });
  return changes > 0;
}

export function watchersOf(taskId) {
  return getDb()
    .prepare(
      `SELECT w.user AS id, w.added_at, w.added_by, u.name, u.name_ar, u.email, u.role
         FROM task_watchers w JOIN users u ON u.id = w.user
        WHERE w.task = ? ORDER BY w.added_at`,
    )
    .all(taskId);
}

/* ------------------------------------------------------------- comments ---- */

const MENTION_RE = /@([A-Za-z0-9._-]+)/g;

export function addComment(user, taskId, text) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  const access = taskAccess(user, task, linksFor(taskId), orgIndexFor(user));
  if (access === 'none') throw new TaskError('not_found', 404);
  if (access !== 'edit') throw new TaskError('read_only', 403);
  const body = String(text || '').trim();
  if (!body) throw new TaskError('text_required', 400);

  const id = uid('c');
  db.prepare('INSERT INTO comments (id, task, user, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, taskId, user.id, body, Date.now());
  record({ user: user.id, action: 'task.comment', task: taskId, to: body.slice(0, 120) });

  /* A mention is a stronger signal than a comment, so the mentioned people get
     the mention and are removed from the general comment sweep. */
  const handles = [...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase());
  const mentioned = new Set();
  if (handles.length) {
    const users = db.prepare('SELECT id, email, name FROM users WHERE active = 1').all();
    for (const u of users) {
      const handle = String(u.email).split('@')[0].toLowerCase();
      if (handles.includes(handle) || handles.includes(String(u.id).toLowerCase())) mentioned.add(u.id);
    }
  }
  mentioned.delete(user.id);
  for (const target of mentioned) {
    addWatcher(taskId, target, user.id, { silent: true });
    notify({
      userId: target,
      kind: 'mention',
      taskId,
      actorId: user.id,
      text: `${user.name} mentioned you on "${task.title}": ${body.slice(0, 140)}`,
      textAr: `أشار إليك ${user.name_ar || user.name} في المهمة «${task.title_ar || task.title}»: ${body.slice(0, 140)}`,
    });
  }

  const audience = taskAudience(taskId, { exclude: [user.id, ...mentioned] });
  for (const target of audience) {
    notify({
      userId: target,
      kind: 'comment',
      taskId,
      actorId: user.id,
      text: `${user.name} commented on "${task.title}": ${body.slice(0, 140)}`,
      textAr: `علّق ${user.name_ar || user.name} على المهمة «${task.title_ar || task.title}»: ${body.slice(0, 140)}`,
    });
  }

  return db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
}

/* ------------------------------------------------------------ checklist ---- */

export function addChecklistItem(user, taskId, text) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  if (taskAccess(user, task, linksFor(taskId), orgIndexFor(user)) !== 'edit') throw new TaskError('read_only', 403);
  const body = String(text || '').trim();
  if (!body) throw new TaskError('text_required', 400);
  const id = uid('ck');
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM checklist WHERE task = ?').get(taskId).n;
  db.prepare('INSERT INTO checklist (id, task, text, done, sort_order) VALUES (?, ?, ?, 0, ?)').run(id, taskId, body, order);
  return db.prepare('SELECT * FROM checklist WHERE id = ?').get(id);
}

export function toggleChecklistItem(user, taskId, itemId, done) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  if (taskAccess(user, task, linksFor(taskId), orgIndexFor(user)) !== 'edit') throw new TaskError('read_only', 403);
  const changes = db.prepare('UPDATE checklist SET done = ? WHERE id = ? AND task = ?').run(done ? 1 : 0, itemId, taskId).changes;
  if (!changes) throw new TaskError('not_found', 404);
  return db.prepare('SELECT * FROM checklist WHERE id = ?').get(itemId);
}

export function deleteChecklistItem(user, taskId, itemId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  if (taskAccess(user, task, linksFor(taskId), orgIndexFor(user)) !== 'edit') throw new TaskError('read_only', 403);
  return db.prepare('DELETE FROM checklist WHERE id = ? AND task = ?').run(itemId, taskId).changes > 0;
}

/* ------------------------------------------------------------ reminders ---- */

export function addReminder(user, taskId, { at, note = '', forUser = null }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  if (taskAccess(user, task, linksFor(taskId), orgIndexFor(user)) === 'none') throw new TaskError('not_found', 404);
  const fireAt = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(fireAt)) throw new TaskError('invalid_time', 400);
  const id = uid('rem');
  db.prepare(
    `INSERT INTO reminders (id, task, user, fire_at, kind, note, fired, auto, created_by, created_at)
     VALUES (?, ?, ?, ?, 'reminder', ?, 0, 0, ?, ?)`,
  ).run(id, taskId, forUser || user.id, fireAt, String(note || ''), user.id, Date.now());
  record({ user: user.id, action: 'task.reminder.add', task: taskId, to: new Date(fireAt).toISOString() });
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
}

export function deleteReminder(user, taskId, reminderId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskError('not_found', 404);
  if (taskAccess(user, task, linksFor(taskId), orgIndexFor(user)) === 'none') throw new TaskError('not_found', 404);
  return db.prepare('DELETE FROM reminders WHERE id = ? AND task = ?').run(reminderId, taskId).changes > 0;
}
