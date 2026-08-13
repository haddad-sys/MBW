import config from '../config.js';
import { getDb } from '../db/index.js';
import { cfg, daysUntil, statusOf } from './issues.js';
import { raise, branchAudience } from './notify.js';
import { flushEmails } from './mailer.js';
import { audit } from './audit.js';

/* The background engine. Each pass is idempotent — the flag is set before the
   notification is raised — so a restart cannot announce the same thing twice. */

let timer = null;
let running = false;

function openStatusKeys() {
  return cfg().statuses.filter((s) => !s.done && !s.parked).map((s) => s.key);
}

function rowsInFlight() {
  const keys = openStatusKeys();
  if (!keys.length) return [];
  const marks = keys.map(() => '?').join(',');
  return getDb()
    .prepare(`SELECT * FROM issues WHERE due_date IS NOT NULL AND status IN (${marks})`)
    .all(...keys);
}

function notifyRows(issue) {
  const s = statusOf(issue.status);
  const entity = getDb().prepare('SELECT name FROM entities WHERE id = ?').get(issue.entity_id);
  return [
    ['الجهة', entity ? entity.name : ''],
    ['الحالة', s ? s.label : issue.status],
    ['المسؤول', issue.assignee],
    ['الاستحقاق', issue.due_date ? new Date(issue.due_date).toLocaleDateString('ar-EG') : '—'],
  ];
}

export function flagDueSoon() {
  const db = getDb();
  let flagged = 0;
  for (const issue of rowsInFlight()) {
    if (issue.due_soon_flagged) continue;
    const days = daysUntil(issue.due_date);
    if (days < 0 || days > config.dueSoonDays) continue;
    db.prepare('UPDATE issues SET due_soon_flagged = 1 WHERE id = ?').run(issue.id);
    raise({
      event: 'dueSoon',
      title: issue.title,
      text: days === 0 ? 'تستحق اليوم' : 'تستحق غداً',
      issueId: issue.id,
      rows: notifyRows(issue),
      audience: branchAudience(issue.entity_id),
    });
    flagged += 1;
  }
  return flagged;
}

export function flagOverdue() {
  const db = getDb();
  let flagged = 0;
  for (const issue of rowsInFlight()) {
    if (issue.overdue_flagged) continue;
    if (daysUntil(issue.due_date) >= 0) continue;
    db.prepare('UPDATE issues SET overdue_flagged = 1 WHERE id = ?').run(issue.id);
    audit({ action: 'issue.overdue', target: issue.id });
    raise({
      event: 'overdue',
      title: issue.title,
      text: 'تجاوزت الملاحظة تاريخ استحقاقها.',
      issueId: issue.id,
      rows: notifyRows(issue),
      audience: branchAudience(issue.entity_id),
    });
    flagged += 1;
  }
  return flagged;
}

export async function runTick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const dueSoon = flagDueSoon();
    const overdue = flagOverdue();
    const mail = await flushEmails();
    return { at: Date.now(), dueSoon, overdue, mail };
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer || !config.schedulerEnabled) return null;
  timer = setInterval(() => {
    runTick().catch((err) => console.error('[mutabea] tick failed:', err.message));
  }, Math.max(30, config.tickSeconds) * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  runTick().catch((err) => console.error('[mutabea] first tick failed:', err.message));
  return timer;
}

export function stopScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
