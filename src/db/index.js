import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config, { ROOT } from '../config.js';

const schemaFile = path.join(ROOT, 'src', 'db', 'schema.sql');

let db = null;

export const DEFAULT_STATUSES = [
  { id: 'new', name: 'New', name_ar: 'جديدة', kind: 'open', sort_order: 1 },
  { id: 'notstart', name: 'Not Started', name_ar: 'لم تبدأ', kind: 'open', sort_order: 2 },
  { id: 'assigned', name: 'Assigned', name_ar: 'مُسندة', kind: 'open', sort_order: 3 },
  { id: 'progress', name: 'In Progress', name_ar: 'قيد التنفيذ', kind: 'active', sort_order: 4 },
  { id: 'blocked', name: 'Blocked', name_ar: 'معطَّلة', kind: 'stuck', sort_order: 5 },
  { id: 'waiting', name: 'Waiting for Information', name_ar: 'بانتظار معلومات', kind: 'stuck', sort_order: 6 },
  { id: 'approval', name: 'Pending Approval', name_ar: 'بانتظار الاعتماد', kind: 'stuck', sort_order: 7 },
  { id: 'review', name: 'Under Review', name_ar: 'قيد المراجعة', kind: 'active', sort_order: 8 },
  { id: 'hold', name: 'On Hold', name_ar: 'معلّقة', kind: 'stuck', sort_order: 9 },
  { id: 'done', name: 'Completed', name_ar: 'مكتملة', kind: 'closed', sort_order: 10 },
  { id: 'cancelled', name: 'Cancelled', name_ar: 'ملغاة', kind: 'closed', sort_order: 11 },
];

export function getDb() {
  if (db) return db;
  const file = config.dbFile;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(schemaFile, 'utf8'));
  seedStatuses(db);
  return db;
}

/* Statuses are reference data, not user content: the set must exist before the
   first task can be written, and re-running must not clobber renames. */
function seedStatuses(handle) {
  const insert = handle.prepare(
    `INSERT OR IGNORE INTO statuses (id, name, name_ar, kind, sort_order, active)
     VALUES (@id, @name, @name_ar, @kind, @sort_order, 1)`,
  );
  const tx = handle.transaction((rows) => rows.forEach((r) => insert.run(r)));
  tx(DEFAULT_STATUSES);
}

/* Tests spin up throwaway databases; this lets them point the module at one
   without reaching into module internals. */
export function resetDbForTests(file) {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
    db = null;
  }
  if (file) config.dbFile = file;
  return getDb();
}

export function closeDb() {
  if (!db) return;
  try { db.close(); } catch { /* already closed */ }
  db = null;
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
  return value;
}

export default getDb;
