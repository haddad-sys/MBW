import config from '../config.js';
import { getDb } from '../db/index.js';
import { uid } from '../lib/ids.js';
import { normalizePrefs, eventForKind, MANDATORY_KINDS } from '../lib/prefs.js';
import { inQuietHours, quietWindowEnd } from '../lib/time.js';
import { publish } from './realtime.js';
import { queueEmail, suppressEmail } from './mailer.js';
import { renderEmail, notifTitle } from './templates.js';
import { record } from './audit.js';

/* THE choke point.
   Everything that wants to tell somebody something — a route, the scheduler,
   an escalation — calls notify(). Nothing else writes to `notifications` and
   nothing else queues mail. That is what makes a preference honest: there is
   exactly one place where it can be consulted. */

export function notify({
  userId,
  kind,
  taskId = null,
  actorId = null,
  text = '',
  textAr = '',
  emailSubject = null,
  emailBody = null,
  force = false,
}) {
  if (!userId || !kind) return null;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.active) return null;

  /* People do not need to be told what they just did themselves. Mandatory
     kinds are the exception: an escalation addressed to you is still news even
     if your own action triggered it. */
  if (actorId && actorId === userId && !MANDATORY_KINDS.has(kind) && !force) return null;

  const prefs = normalizePrefs(user.prefs);
  const event = eventForKind(kind);
  const mandatory = MANDATORY_KINDS.has(kind) || force;
  const now = new Date();
  const quiet = prefs.quiet.enabled && !mandatory && inQuietHours(prefs.quiet, now);
  const task = taskId ? db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) : null;

  const result = { id: null, inApp: false, sound: false, emailId: null, quiet };

  /* ---------------------------------------------------------- in-app ---- */
  const inAppAllowed = mandatory || (prefs.inApp.enabled && prefs.inApp.events[event] !== false);
  if (inAppAllowed) {
    const id = uid('n');
    db.prepare(
      `INSERT INTO notifications (id, user, kind, task, actor, text, text_ar, created_at, read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(id, userId, kind, taskId, actorId, text, textAr || text, Date.now());
    result.id = id;
    result.inApp = true;

    /* The ring is separate from the record: the notification always lands in
       the bell, the sound only plays when the person asked for it and is not
       inside their quiet window. */
    const sound = mandatory || (prefs.inApp.sound && !quiet);
    const desktop = mandatory || (prefs.inApp.desktop && !quiet);
    result.sound = sound;

    publish(userId, 'notification', {
      id,
      kind,
      task: taskId,
      taskTitle: task ? task.title : null,
      taskTitleAr: task ? task.title_ar : null,
      actor: actorId,
      text,
      textAr: textAr || text,
      at: Date.now(),
      read: false,
      sound,
      desktop,
      title: notifTitle(kind, user.lang),
    });
    publish(userId, 'badge', { unread: unreadCount(userId) });
  }

  /* ----------------------------------------------------------- email ---- */
  const emailEvent = prefs.email.events[event] !== false;
  const mode = prefs.email.mode;
  let emailAllowed = mandatory || (mode !== 'off' && emailEvent);
  if (!mandatory && mode === 'critical' && (!task || task.priority !== 'Critical')) emailAllowed = false;

  if (emailAllowed) {
    const rendered = renderEmail({ kind, user, task, text, textAr, actorId, subject: emailSubject, body: emailBody });
    result.emailId = queueEmail({
      toUser: userId,
      toEmail: user.email,
      kind,
      task: taskId,
      subject: rendered.subject,
      body: rendered.text,
      html: rendered.html,
    });
    /* Held, not dropped: the row waits until the quiet window closes. */
    if (quiet && result.emailId) {
      getDb().prepare('UPDATE emails SET next_try_at = ? WHERE id = ?').run(quietWindowEnd(prefs.quiet, now), result.emailId);
    }
  } else if (mode === 'off' || !emailEvent) {
    suppressEmail({
      toUser: userId,
      toEmail: user.email,
      kind,
      task: taskId,
      subject: notifTitle(kind, user.lang),
      reason: mode === 'off' ? 'recipient disabled email notifications' : `recipient muted the "${event}" event`,
    });
  } else if (mode === 'critical') {
    suppressEmail({
      toUser: userId,
      toEmail: user.email,
      kind,
      task: taskId,
      subject: notifTitle(kind, user.lang),
      reason: 'recipient receives email for critical tasks only',
    });
  }

  record({ user: actorId, action: `notify.${kind}`, task: taskId, field: userId, to: result.inApp ? 'delivered' : 'suppressed', src: 'notify' });
  return result;
}

/** Everyone attached to a task: assignee, accountable owner, participants and
 *  المتابعون (watchers). The actor is dropped unless explicitly kept. */
export function taskAudience(taskId, { exclude = [], includeCreator = false } = {}) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return [];
  const ids = new Set();
  if (task.assignee) ids.add(task.assignee);
  if (task.owner) ids.add(task.owner);
  if (task.escalated_to) ids.add(task.escalated_to);
  if (includeCreator && task.created_by) ids.add(task.created_by);
  for (const r of db.prepare('SELECT user FROM task_watchers WHERE task = ?').all(taskId)) ids.add(r.user);
  for (const r of db.prepare('SELECT user FROM task_participants WHERE task = ?').all(taskId)) ids.add(r.user);
  for (const id of exclude) ids.delete(id);
  return [...ids].filter(Boolean);
}

export function notifyTaskAudience(taskId, payload, options = {}) {
  const audience = taskAudience(taskId, { exclude: options.exclude || (payload.actorId ? [payload.actorId] : []) });
  return audience.map((userId) => notify({ ...payload, userId, taskId })).filter(Boolean);
}

export function unreadCount(userId) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user = ? AND read = 0').get(userId).n;
}

export function listNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
  const db = getDb();
  const where = unreadOnly ? 'AND n.read = 0' : '';
  return db
    .prepare(
      `SELECT n.*, t.title AS task_title, t.title_ar AS task_title_ar, t.priority AS task_priority,
              u.name AS actor_name, u.name_ar AS actor_name_ar
         FROM notifications n
         LEFT JOIN tasks t ON t.id = n.task
         LEFT JOIN users u ON u.id = n.actor
        WHERE n.user = ? ${where}
        ORDER BY n.created_at DESC
        LIMIT ?`,
    )
    .all(userId, Math.min(Number(limit) || 50, 200));
}

export function markRead(userId, ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE notifications SET read = 1, read_at = ? WHERE user = ? AND id = ? AND read = 0');
  const tx = db.transaction((list) => {
    let n = 0;
    for (const id of list) n += stmt.run(Date.now(), userId, id).changes;
    return n;
  });
  const changed = tx(ids);
  publish(userId, 'badge', { unread: unreadCount(userId) });
  return changed;
}

export function markAllRead(userId) {
  const changed = getDb()
    .prepare('UPDATE notifications SET read = 1, read_at = ? WHERE user = ? AND read = 0')
    .run(Date.now(), userId).changes;
  publish(userId, 'badge', { unread: 0 });
  return changed;
}

export const notifierConfig = {
  org: config.orgName,
  orgAr: config.orgNameAr,
};
