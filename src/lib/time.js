export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function nowMs() {
  return Date.now();
}

export function isoDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/* A due date is a calendar day; a due time makes it an instant. Without a time
   the deadline is the end of that day, which is what people mean when they say
   "due Thursday". */
export function dueInstant(dueDate, dueTime) {
  if (!dueDate) return null;
  const [y, m, d] = String(dueDate).split('-').map(Number);
  if (!y || !m || !d) return null;
  if (dueTime && /^\d{1,2}:\d{2}$/.test(dueTime)) {
    const [hh, mm] = dueTime.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function isOverdue(task, closedStatusIds, at = Date.now()) {
  if (!task.due_date) return false;
  if (closedStatusIds.has(task.status)) return false;
  const inst = dueInstant(task.due_date, task.due_time);
  return inst !== null && inst < at;
}

export function daysBetween(a, b) {
  return Math.floor((b - a) / DAY);
}

/* "2026-13-45" also matches a naive YYYY-MM-DD pattern and then produces an
   instant nobody meant. The round trip proves the date exists. */
export function isValidDate(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/* "25:99" matches a naive HH:MM pattern and then compares as a real time,
   which is how a nonsense quiet window silences somebody all day. Ranges are
   checked, not just the shape. */
export function isValidClock(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* Quiet hours wrap past midnight more often than not, so the comparison has to
   handle from > to as "either side of the boundary". */
export function inQuietHours(quiet, at = new Date()) {
  if (!quiet || !quiet.from || !quiet.to) return false;
  const mins = at.getHours() * 60 + at.getMinutes();
  const from = toMinutes(quiet.from);
  const to = toMinutes(quiet.to);
  if (from === to) return false;
  return from > to ? mins >= from || mins < to : mins >= from && mins < to;
}

/* When a message arrives inside quiet hours it is held rather than dropped —
   this is the instant the window reopens. */
export function quietWindowEnd(quiet, at = new Date()) {
  const to = toMinutes(quiet?.to || '07:00');
  const end = new Date(at.getFullYear(), at.getMonth(), at.getDate(), Math.floor(to / 60), to % 60, 0, 0);
  if (end.getTime() <= at.getTime()) end.setDate(end.getDate() + 1);
  return end.getTime();
}

export function formatDateTime(ms, lang = 'en') {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return lang === 'ar' ? stamp : stamp;
}
