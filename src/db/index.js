import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config, { ROOT } from '../config.js';

const schemaFile = path.join(ROOT, 'src', 'db', 'schema.sql');
let db = null;

export function getDb() {
  if (db) return db;
  const file = config.dbFile;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(schemaFile, 'utf8'));
  return db;
}

export function resetDbForTests(file) {
  if (db) { try { db.close(); } catch { /* already closed */ } db = null; }
  if (file) config.dbFile = file;
  return getDb();
}

export function closeDb() {
  if (!db) return;
  try { db.close(); } catch { /* already closed */ }
  db = null;
}

/* Configuration the administrator edits at runtime — priorities, statuses,
   entity types, default categories, notification preferences — lives here so a
   deployment never needs a migration to change a label. */
export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
  return value;
}

export default getDb;
