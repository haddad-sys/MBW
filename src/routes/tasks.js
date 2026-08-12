import express from 'express';
import { requireAuth } from '../lib/auth.js';
import {
  listTasks, getTask, createTask, updateTask, deleteTask, TaskError,
  addWatcher, removeWatcher, watchersOf, addComment,
  addChecklistItem, toggleChecklistItem, deleteChecklistItem,
  addReminder, deleteReminder, linksFor, orgIndexFor,
} from '../services/tasks.js';
import { taskAccess } from '../lib/permissions.js';
import { getDb } from '../db/index.js';
import { taskHistory } from '../services/audit.js';

const router = express.Router();
router.use(requireAuth);

function handle(res, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof TaskError) {
      const { code, status, ...extra } = err;
      return res.status(err.status || 400).json({ error: err.code, ...extra });
    }
    throw err;
  }
}

const truthy = (v) => v === '1' || v === 'true' || v === true;

router.get('/', (req, res) => {
  const tasks = listTasks(req.user, {
    status: req.query.status,
    priority: req.query.priority,
    assignee: req.query.assignee,
    project: req.query.project,
    category: req.query.category,
    mine: truthy(req.query.mine),
    following: truthy(req.query.following),
    open: truthy(req.query.open),
    overdue: truthy(req.query.overdue),
    q: req.query.q,
  });
  res.json({ tasks, count: tasks.length });
});

router.post('/', (req, res) => handle(res, () => res.status(201).json({ task: createTask(req.user, req.body || {}) })));

router.get('/:id', (req, res) => {
  const task = getTask(req.user, req.params.id);
  if (!task) return res.status(404).json({ error: 'not_found' });
  return res.json({ task });
});

router.patch('/:id', (req, res) => handle(res, () => res.json({ task: updateTask(req.user, req.params.id, req.body || {}) })));

router.delete('/:id', (req, res) => handle(res, () => {
  deleteTask(req.user, req.params.id);
  return res.json({ ok: true });
}));

/* ------------------------------------------------------------ المتابعون ---- */

function requireAccess(req, res, level = 'view') {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) { res.status(404).json({ error: 'not_found' }); return null; }
  const access = taskAccess(req.user, task, linksFor(task.id), orgIndexFor(req.user));
  if (access === 'none') { res.status(404).json({ error: 'not_found' }); return null; }
  if (level === 'edit' && access !== 'edit') { res.status(403).json({ error: 'read_only' }); return null; }
  return task;
}

router.get('/:id/watchers', (req, res) => {
  if (!requireAccess(req, res)) return undefined;
  return res.json({ watchers: watchersOf(req.params.id) });
});

/* Following yourself needs read access only — a person may always choose to
   keep an eye on work they can see. Adding somebody else is an edit. */
router.post('/:id/watchers', (req, res) => {
  const target = req.body?.user || req.user.id;
  const task = requireAccess(req, res, target === req.user.id ? 'view' : 'edit');
  if (!task) return undefined;
  const added = addWatcher(req.params.id, target, req.user.id, { silent: target === req.user.id });
  return res.status(added ? 201 : 200).json({ added, watchers: watchersOf(req.params.id) });
});

router.delete('/:id/watchers/:user', (req, res) => {
  const target = req.params.user;
  const task = requireAccess(req, res, target === req.user.id ? 'view' : 'edit');
  if (!task) return undefined;
  const removed = removeWatcher(req.params.id, target, req.user.id);
  return res.json({ removed, watchers: watchersOf(req.params.id) });
});

/* -------------------------------------------------------------- comments --- */

router.post('/:id/comments', (req, res) => handle(res, () =>
  res.status(201).json({ comment: addComment(req.user, req.params.id, req.body?.text) })));

/* ------------------------------------------------------------- checklist --- */

router.post('/:id/checklist', (req, res) => handle(res, () =>
  res.status(201).json({ item: addChecklistItem(req.user, req.params.id, req.body?.text) })));

router.patch('/:id/checklist/:item', (req, res) => handle(res, () =>
  res.json({ item: toggleChecklistItem(req.user, req.params.id, req.params.item, !!req.body?.done) })));

router.delete('/:id/checklist/:item', (req, res) => handle(res, () =>
  res.json({ ok: deleteChecklistItem(req.user, req.params.id, req.params.item) })));

/* ------------------------------------------------------------- reminders --- */

router.post('/:id/reminders', (req, res) => handle(res, () =>
  res.status(201).json({ reminder: addReminder(req.user, req.params.id, req.body || {}) })));

router.delete('/:id/reminders/:reminder', (req, res) => handle(res, () =>
  res.json({ ok: deleteReminder(req.user, req.params.id, req.params.reminder) })));

/* --------------------------------------------------------------- history --- */

router.get('/:id/history', (req, res) => {
  if (!requireAccess(req, res)) return undefined;
  return res.json({ history: taskHistory(req.params.id) });
});

export default router;
