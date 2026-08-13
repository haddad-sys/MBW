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

export function auditLog(limit = 200) {
  return getDb()
    .prepare(
      `SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.at DESC LIMIT ?`,
    )
    .all(Math.min(Number(limit) || 200, 1000));
}

export default audit;
