import { getDb } from '../db/index.js';
import { uid } from '../lib/ids.js';

/* Append-only. Nothing in the application updates or deletes an audit row. */
export function record({ user = null, action, task = null, field = null, from = null, to = null, src = 'app' }) {
  if (!action) return null;
  const id = uid('a');
  getDb()
    .prepare(
      `INSERT INTO audit (id, at, user, action, task, field, from_value, to_value, src)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, Date.now(), user, action, task, field, stringify(from), stringify(to), src);
  return id;
}

function stringify(v) {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function taskHistory(taskId, limit = 200) {
  return getDb()
    .prepare(
      `SELECT a.*, u.name AS user_name, u.name_ar AS user_name_ar
         FROM audit a LEFT JOIN users u ON u.id = a.user
        WHERE a.task = ? ORDER BY a.at DESC LIMIT ?`,
    )
    .all(taskId, limit);
}

export default record;
