import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/* Short, sortable-ish, collision-safe enough for a single-tenant console:
   a millisecond timestamp in base36 plus 6 random characters. */
export function uid(prefix = '') {
  const stamp = Date.now().toString(36);
  const bytes = crypto.randomBytes(6);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix ? `${prefix}_` : ''}${stamp}${rand}`;
}

/* Task keys are read aloud in meetings, so they get a human sequence rather
   than a random string. */
export function nextTaskId(db) {
  const row = db.prepare("SELECT id FROM tasks WHERE id LIKE 'T-%' ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1").get();
  const n = row ? Number(String(row.id).slice(2)) + 1 : 1001;
  return `T-${n}`;
}

export default uid;
