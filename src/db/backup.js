/* A consistent copy of the database, taken while the server is running.
 *
 *   npm run backup                       → data/backups/mutabea-YYYY-MM-DD.db
 *   npm run backup -- /path/to/file.db   → wherever you say
 *
 * SQLite's own backup API is used rather than a file copy, so a write landing
 * mid-backup cannot produce a torn file. Restoring is the reverse: stop the
 * server, put the file where DB_FILE points, start it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../config.js';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const source = config.dbFile;
  if (!fs.existsSync(source)) {
    console.error(`لا توجد قاعدة بيانات في ${source}`);
    console.error(`No database at ${source} — nothing to back up.`);
    process.exit(1);
  }

  const target = process.argv[2]
    || path.join(path.dirname(source), 'backups', `mutabea-${stamp()}.db`);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const db = new Database(source, { readonly: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  /* Read it back before claiming success — a backup nobody opened is a guess. */
  const check = new Database(target, { readonly: true });
  const users = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const issues = check.prepare('SELECT COUNT(*) AS n FROM issues').get().n;
  check.close();

  const size = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`تم النسخ الاحتياطي → ${target}`);
  console.log(`  ${size} KB · ${users} مستخدم · ${issues} ملاحظة`);
}

main().catch((err) => {
  console.error('فشل النسخ الاحتياطي:', err.message);
  process.exit(1);
});
