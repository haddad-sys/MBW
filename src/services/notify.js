import config from '../config.js';
import { getDb, getSetting } from '../db/index.js';
import { uid } from '../lib/auth.js';
import { NOTIF_LABELS, DEF_NOTIF, URGENT_EVENTS, resolvePerms } from '../lib/domain.js';
import { publish } from './realtime.js';
import { queueEmail, suppressEmail, renderEmail } from './mailer.js';

/* THE choke point.
   Every notification the system raises passes through raise(). Nothing else
   writes a notification row and nothing else queues mail, so the settings can
   never be honoured on one surface and ignored on the other. */

export function notifSettings() {
  const stored = getSetting('notif', null);
  if (!stored) return { ...DEF_NOTIF, types: { ...DEF_NOTIF.types } };
  return {
    ...DEF_NOTIF,
    ...stored,
    types: { ...DEF_NOTIF.types, ...(stored.types || {}) },
    recipients: Array.isArray(stored.recipients) ? stored.recipients : [],
  };
}

function record(userId, { event, title, text, issueId }) {
  const id = uid('n');
  getDb().prepare(
    `INSERT INTO notifications (id, user_id, event, title, text, issue_id, at, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, userId, event, title, text, issueId || null, Date.now());
  return id;
}

export function unreadCount(userId) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(userId).n;
}

/**
 * Raise an event.
 *   audience — user ids that should see it in the application
 *   extraEmails — addresses that should receive it beyond the audience
 * Returns what actually happened, which the API surfaces for the test button.
 */
export function raise({
  event,
  title,
  text = '',
  issueId = null,
  rows = [],
  audience = [],
  actorId = null,
  extraEmails = [],
  force = false,
}) {
  const settings = notifSettings();
  const enabled = force || (settings.enabled && settings.types[event] !== false);
  const out = { event, inApp: 0, emails: 0, suppressed: 0, enabled };

  if (!enabled) {
    /* Still leave a trace, so "why did nobody hear about this?" is answerable. */
    out.suppressed = 1;
    suppressEmail({
      toEmail: (settings.recipients || []).join(', '),
      event,
      subject: `${NOTIF_LABELS[event] || event} — ${title}`,
      reason: settings.enabled ? 'نوع الإشعار موقوف في الإعدادات' : 'الإشعارات موقوفة',
    });
    return out;
  }

  const db = getDb();
  const urgent = URGENT_EVENTS.has(event);
  const seen = new Set();

  for (const userId of audience) {
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    /* Nobody needs to be told what they just did themselves. */
    if (actorId && userId === actorId && !force) continue;
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').get(userId, 'active');
    if (!user) continue;
    const id = record(userId, { event, title, text, issueId });
    out.inApp += 1;
    publish(userId, 'notification', {
      id, event, title: NOTIF_LABELS[event] || event, subject: title, text,
      issueId, at: Date.now(), urgent, sound: true,
    });
    publish(userId, 'badge', { unread: unreadCount(userId) });
  }

  /* Mail goes to the configured recipients plus anything the caller adds —
     an applicant's own address, for instance, which has no account yet. */
  const recipients = [...new Set([...(settings.recipients || []), ...extraEmails].filter(Boolean))];
  if (recipients.length) {
    const rendered = renderEmail({
      event, title, body: text, rows,
      action: issueId ? { label: 'فتح الملاحظة', href: `${config.appUrl}/#/issue/${encodeURIComponent(issueId)}` } : null,
    });
    for (const to of recipients) {
      const id = queueEmail({
        toEmail: to,
        event,
        subject: `[متابِع] ${NOTIF_LABELS[event] || event} — ${title}`,
        text: rendered.text,
        html: rendered.html,
        issueId,
      });
      if (id) out.emails += 1;
    }
  }
  return out;
}

/** Everyone who should see an event about a branch: administrators with reach
 *  over everything, plus the accounts attached to that branch. */
export function branchAudience(entityId) {
  const rows = getDb().prepare("SELECT * FROM users WHERE status = 'active'").all();
  return rows
    .filter((u) => {
      const perms = resolvePerms(u);
      return perms.scope === 'all' || (entityId && u.entity_id === entityId);
    })
    .map((u) => u.id);
}

export function adminAudience() {
  const rows = getDb().prepare("SELECT * FROM users WHERE status = 'active'").all();
  return rows.filter((u) => resolvePerms(u).manageUsers).map((u) => u.id);
}

export function adminEmails() {
  const rows = getDb().prepare("SELECT email FROM users WHERE status = 'active'").all();
  const admins = getDb().prepare("SELECT * FROM users WHERE status = 'active'").all()
    .filter((u) => resolvePerms(u).manageUsers)
    .map((u) => u.email);
  return admins.length ? admins : rows.map((r) => r.email);
}

export function listNotifications(userId, limit = 60) {
  return getDb()
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY at DESC LIMIT ?')
    .all(userId, Math.min(Number(limit) || 60, 200));
}

export function markRead(userId, ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ? AND read = 0');
  const tx = db.transaction((list) => list.reduce((n, id) => n + stmt.run(userId, id).changes, 0));
  const changed = tx(ids);
  publish(userId, 'badge', { unread: unreadCount(userId) });
  return changed;
}

export function markAllRead(userId) {
  const changed = getDb().prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId).changes;
  publish(userId, 'badge', { unread: 0 });
  return changed;
}
