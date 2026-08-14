import { getDb } from '../db/index.js';
import { uid } from '../lib/auth.js';

/* Append-only: nothing in the application updates or deletes an audit row. */
export function audit({ userId = null, action, target = null, detail = null }) {
  if (!action) return null;
  const id = uid('a');
  getDb()
    .prepare('INSERT INTO audit (id, at, user_id, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, Date.now(), userId, action, target, detail === null ? null : String(detail).slice(0, 500));
  return id;
}

/** The families the trail is filtered by, in the order the panel offers them. */
export const AUDIT_FAMILIES = ['user', 'auth', 'issue', 'entity', 'config', 'notif'];

/**
 * A page of the trail, newest first.
 *
 * `family` narrows to one prefix ('user' → user.approve, user.reject, …).
 * `q` searches the detail and the actor's name.
 *
 * Paging is by cursor rather than offset, so entries landing at the top while
 * somebody reads cannot shift the page under them. The cursor is (before,
 * beforeId), not a timestamp alone: several entries routinely share one
 * millisecond — approving an account writes more than one — and a bare
 * `at < cursor` steps straight over every entry tied at the boundary. The id
 * breaks the tie, and the sort names it too so the order is total.
 */
export function auditLog({ limit = 60, family = null, q = '', before = null, beforeId = null } = {}) {
  const where = [];
  const params = [];

  if (family && AUDIT_FAMILIES.includes(family)) {
    where.push('a.action LIKE ?');
    params.push(`${family}.%`);
  }
  const needle = String(q || '').trim();
  if (needle) {
    where.push('(a.detail LIKE ? OR u.name LIKE ? OR a.action LIKE ?)');
    const like = `%${needle}%`;
    params.push(like, like, like);
  }
  if (Number.isFinite(Number(before)) && Number(before) > 0) {
    if (beforeId) {
      where.push('(a.at < ? OR (a.at = ? AND a.id < ?))');
      params.push(Number(before), Number(before), String(beforeId));
    } else {
      where.push('a.at < ?');
      params.push(Number(before));
    }
  }

  const size = Math.min(Math.max(Number(limit) || 60, 1), 500);
  params.push(size + 1);

  const rows = getDb()
    .prepare(
      `SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.at DESC, a.id DESC LIMIT ?`,
    )
    .all(...params);

  /* One row over the page size answers "is there more?" without a second count. */
  const more = rows.length > size;
  return { entries: more ? rows.slice(0, size) : rows, more };
}

/** How many entries the trail holds, for the panel's header. */
export function auditCount() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM audit').get().n;
}

export default audit;
