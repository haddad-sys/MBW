import config from '../config.js';
import { getDb } from '../db/index.js';
import { statusIndex } from './tasks.js';
import { notify, taskAudience } from './notify.js';
import { flushEmails } from './mailer.js';
import { dueInstant, DAY } from '../lib/time.js';
import { record } from './audit.js';

/* The background engine. One pass does four things, each of them idempotent so
   a crash mid-tick cannot double-notify:
     1. fire reminders whose time has come
     2. announce tasks that have just gone overdue        (flagged once)
     3. escalate tasks that have been overdue too long    (stamped once)
     4. hand queued mail to the transport
   Every notification goes through notify(), so preferences and quiet hours are
   honoured here exactly as they are on an interactive action. */

let timer = null;
let running = false;

export async function runTick(at = Date.now()) {
  if (running) return { skipped: true };
  running = true;
  try {
    const reminders = fireReminders(at);
    const overdue = flagOverdue(at);
    const escalated = escalate(at);
    const mail = await flushEmails();
    return { at, reminders, overdue, escalated, mail };
  } finally {
    running = false;
  }
}

export function fireReminders(at = Date.now()) {
  const db = getDb();
  const due = db.prepare('SELECT * FROM reminders WHERE fired = 0 AND fire_at <= ? ORDER BY fire_at LIMIT 200').all(at);
  let fired = 0;
  const sIndex = statusIndex();

  for (const rem of due) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(rem.task);
    /* Mark first: a reminder for a task that closed in the meantime is
       consumed, not left to fire forever. */
    db.prepare('UPDATE reminders SET fired = 1, fired_at = ? WHERE id = ?').run(at, rem.id);
    if (!task || sIndex.closed.has(task.status)) continue;

    const targets = rem.user ? [rem.user] : taskAudience(rem.task);
    const when = task.due_date ? `${task.due_date}${task.due_time ? ` ${task.due_time}` : ''}` : '';
    for (const userId of targets) {
      notify({
        userId,
        kind: 'reminder',
        taskId: task.id,
        text: rem.note || `Reminder: "${task.title}" is due ${when || 'soon'}.`,
        textAr: rem.note || `تذكير: المهمة «${task.title_ar || task.title}» مستحقة ${when || 'قريبًا'}.`,
      });
    }
    fired += 1;
  }
  return fired;
}

export function flagOverdue(at = Date.now()) {
  const db = getDb();
  const sIndex = statusIndex();
  const closed = [...sIndex.closed];
  const placeholders = closed.map(() => '?').join(',') || "''";
  const candidates = db
    .prepare(
      `SELECT * FROM tasks
        WHERE overdue_flagged = 0 AND due_date IS NOT NULL AND status NOT IN (${placeholders})`,
    )
    .all(...closed);

  let flagged = 0;
  for (const task of candidates) {
    const inst = dueInstant(task.due_date, task.due_time);
    if (inst === null || inst >= at) continue;
    db.prepare('UPDATE tasks SET overdue_flagged = 1 WHERE id = ?').run(task.id);
    record({ action: 'task.overdue', task: task.id, to: task.due_date, src: 'scheduler' });
    for (const userId of taskAudience(task.id)) {
      notify({
        userId,
        kind: 'overdue',
        taskId: task.id,
        text: `"${task.title}" passed its due date (${task.due_date}).`,
        textAr: `تجاوزت المهمة «${task.title_ar || task.title}» تاريخ استحقاقها (${task.due_date}).`,
      });
    }
    flagged += 1;
  }
  return flagged;
}

export function escalate(at = Date.now()) {
  const db = getDb();
  const sIndex = statusIndex();
  const closed = [...sIndex.closed];
  const placeholders = closed.map(() => '?').join(',') || "''";
  const candidates = db
    .prepare(
      `SELECT * FROM tasks
        WHERE escalated_at IS NULL AND due_date IS NOT NULL AND status NOT IN (${placeholders})`,
    )
    .all(...closed);

  let escalated = 0;
  for (const task of candidates) {
    const inst = dueInstant(task.due_date, task.due_time);
    if (inst === null) continue;
    const days = task.escalation_days === null || task.escalation_days === undefined
      ? config.defaults.escalationDays
      : task.escalation_days;
    if (days <= 0) continue;
    if (at - inst < days * DAY) continue;

    /* Escalate to the assignee's manager; fall back to the owner's manager, and
       finally to any administrator, so an escalation never lands nowhere. */
    const target = managerOf(db, task.assignee) || managerOf(db, task.owner) || anyAdmin(db, task);
    if (!target) continue;

    db.prepare('UPDATE tasks SET escalated_at = ?, escalated_to = ? WHERE id = ?').run(at, target, task.id);
    record({ action: 'task.escalate', task: task.id, to: target, src: 'scheduler' });
    const overdueDays = Math.floor((at - inst) / DAY);
    notify({
      userId: target,
      kind: 'escalation',
      taskId: task.id,
      text: `"${task.title}" is ${overdueDays} day(s) overdue and has been escalated to you.`,
      textAr: `المهمة «${task.title_ar || task.title}» متأخرة ${overdueDays} يوم/أيام وقد صُعِّدت إليك.`,
    });
    escalated += 1;
  }
  return escalated;
}

function managerOf(db, userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT manager FROM users WHERE id = ?').get(userId);
  if (!row?.manager) return null;
  const mgr = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(row.manager);
  return mgr ? mgr.id : null;
}

function anyAdmin(db, task) {
  const row = db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 AND id != COALESCE(?, '') ORDER BY created_at LIMIT 1")
    .get(task.assignee || null);
  return row ? row.id : null;
}

export function startScheduler() {
  if (timer || !config.schedulerEnabled) return null;
  timer = setInterval(() => {
    runTick().catch((err) => console.error('[mutabi] tick failed:', err.message));
  }, Math.max(5, config.tickSeconds) * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  /* One pass at boot so a restart catches up on anything missed while down. */
  runTick().catch((err) => console.error('[mutabi] first tick failed:', err.message));
  return timer;
}

export function stopScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
