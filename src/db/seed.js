import fs from 'node:fs';
import config from '../config.js';
import { getDb, resetDbForTests, getSetting, setSetting } from './index.js';
import { hashPassword, uid } from '../lib/auth.js';
import { DEF_CFG, DEF_CATS, DEF_TEAM, DEF_NOTIF, P_MGR } from '../lib/domain.js';

const DAY = 86400000;

const SEED_BRANCHES = [
  { id: 'br_mubarak', name: 'مبارك الكبير', type: 'nursery' },
  { id: 'br_qusour', name: 'القصور', type: 'nursery' },
  { id: 'br_adan', name: 'العدان', type: 'nursery' },
  { id: 'br_mishref', name: 'مشرف', type: 'nursery' },
];

const SEED_ISSUES = (cat) => {
  const now = Date.now();
  return [
    { entity: 'br_mubarak', cat: 'شغل داخلي', title: 'تصليح مكيّف الصف الثاني', desc: 'المكيف لا يعمل، الغرفة حارة', status: 'open', priority: 'high', assignee: 'فريق الصيانة', due: now + 2 * DAY, tags: ['مكيف', 'صيانة'], checklist: ['فحص الفلاتر', 'فحص الفريون'] },
    { entity: 'br_qusour', cat: 'شغل مع الحكومة', title: 'تجديد رخصة البلدية', desc: 'انتهت الرخصة، يجب التجديد', status: 'in_progress', priority: 'urgent', assignee: 'السكرتارية', due: now - DAY, tags: ['رخصة'], comment: 'يرجى الإسراع' },
    { entity: 'br_adan', cat: 'شغل خارجي', title: 'طلاء بوابة المدخل الرئيسي', desc: 'البوابة تحتاج دهاناً جديداً', status: 'pending', priority: 'medium', assignee: 'فريق الصيانة', due: now + DAY, tags: ['طلاء'], checklist: ['تحضير الطلاء', 'الطلاء النهائي'], doneAll: true },
    { entity: 'br_mishref', cat: 'شغل مع الوزارة', title: 'تسليم تقرير الوزارة الشهري', desc: 'إعداد التقرير الشهري', status: 'open', priority: 'high', assignee: 'إدارة الفرع', due: now + 5 * DAY, tags: ['تقرير'], repeat: 'monthly' },
    { entity: 'br_mubarak', cat: 'شغل خارجي', title: 'شراء وتركيب ألعاب الساحة', desc: 'تركيب ألعاب جديدة', status: 'closed', priority: 'low', assignee: 'المشتريات', due: now - 2 * DAY, tags: ['ألعاب'], checklist: ['الشراء', 'التركيب'], doneAll: true },
    { entity: 'br_qusour', cat: 'شغل داخلي', title: 'تصليح تسريب مياه الحمام', desc: 'تسريب في الأنابيب', status: 'in_progress', priority: 'high', assignee: 'السباك', due: now + DAY, tags: ['سباكة'], checklist: ['تحديد المصدر', 'الإصلاح'] },
    { entity: 'br_adan', cat: 'الأوراق والمستندات', title: 'تحديث ملفات بيانات الأطفال', desc: 'مراجعة ملفات التسجيل', status: 'open', priority: 'medium', assignee: 'السكرتارية', due: now + 7 * DAY, tags: ['ملفات'] },
  ].map((x) => ({ ...x, categoryId: cat(x.entity, x.cat) }));
};

/** Creates the owner account if the database has none. Always safe to call. */
export function ensureOwner() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return null;
  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, username, email, name, label, password_hash, role, status, perms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'manager', 'active', ?, ?)`,
  ).run(id, config.owner.username, config.owner.email, config.owner.name, 'المدير',
    hashPassword(config.owner.password), JSON.stringify(P_MGR), Date.now());
  return id;
}

export function ensureDefaults() {
  if (!getSetting('cfg')) setSetting('cfg', DEF_CFG);
  if (!getSetting('notif')) {
    setSetting('notif', { ...DEF_NOTIF, recipients: [config.owner.email].filter(Boolean) });
  }
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS n FROM team').get().n === 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO team (name) VALUES (?)');
    for (const n of DEF_TEAM) stmt.run(n);
  }
}

export function seed({ reset = false, quiet = false, demo = true } = {}) {
  if (reset && config.dbFile !== ':memory:' && fs.existsSync(config.dbFile)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const f = config.dbFile + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    resetDbForTests(config.dbFile);
  }

  const db = getDb();
  const ownerId = ensureOwner();
  ensureDefaults();

  if (!demo || db.prepare('SELECT COUNT(*) AS n FROM entities').get().n > 0) {
    if (!quiet) console.log('Owner ready. Demo data left untouched.');
    return { ownerId };
  }

  const now = Date.now();
  const owner = db.prepare("SELECT * FROM users WHERE role = 'manager' ORDER BY created_at LIMIT 1").get();

  const tx = db.transaction(() => {
    const ent = db.prepare('INSERT OR IGNORE INTO entities (id, name, type, created_at) VALUES (?, ?, ?, ?)');
    const cat = db.prepare('INSERT INTO categories (id, entity_id, name, sort_order) VALUES (?, ?, ?, ?)');
    for (const b of SEED_BRANCHES) {
      ent.run(b.id, b.name, b.type, now);
      DEF_CATS.forEach((name, i) => cat.run(uid('c'), b.id, name, i));
    }

    const catId = (entity, name) => {
      const row = db.prepare('SELECT id FROM categories WHERE entity_id = ? AND name = ?').get(entity, name);
      return row ? row.id : null;
    };

    const issue = db.prepare(
      `INSERT INTO issues (id, entity_id, category_id, title, description, status, priority, assignee,
                           reporter, reporter_id, due_date, repeat, tags, created_at, updated_at)
       VALUES (@id, @entity, @category, @title, @description, @status, @priority, @assignee,
               @reporter, @reporterId, @due, @repeat, @tags, @createdAt, @updatedAt)`,
    );
    const chk = db.prepare('INSERT INTO checklist (id, issue_id, text, done, sort_order) VALUES (?, ?, ?, ?, ?)');
    const act = db.prepare('INSERT INTO activity (id, issue_id, by, note, at) VALUES (?, ?, ?, ?, ?)');
    const cmt = db.prepare('INSERT INTO comments (id, issue_id, user_id, author, mgr, text, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)');

    for (const x of SEED_ISSUES(catId)) {
      const id = uid('i');
      issue.run({
        id,
        entity: x.entity,
        category: x.categoryId,
        title: x.title,
        description: x.desc || '',
        status: x.status,
        priority: x.priority,
        assignee: x.assignee || '',
        reporter: owner ? owner.name : '',
        reporterId: owner ? owner.id : null,
        due: x.due || null,
        repeat: x.repeat || 'none',
        tags: JSON.stringify(x.tags || []),
        createdAt: now - 6 * DAY,
        updatedAt: now - DAY,
      });
      (x.checklist || []).forEach((text, i) => chk.run(uid('k'), id, text, x.doneAll ? 1 : (i === 0 && x.status === 'in_progress' ? 1 : 0), i));
      act.run(uid('a'), id, owner ? owner.name : '', 'تم إنشاء الملاحظة', now - 6 * DAY);
      if (x.comment) cmt.run(uid('cm'), id, owner ? owner.id : null, owner ? owner.name : '', x.comment, now - 3 * DAY);
    }
  });
  tx();

  if (!quiet) {
    console.log('تم تجهيز البيانات التجريبية.');
    console.log(`  المدير    : ${config.owner.username} / ${config.owner.password}`);
    console.log(`  البريد    : ${config.owner.email}`);
    console.log(`  الفروع    : ${SEED_BRANCHES.length}`);
  }
  return { ownerId };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed.js');
if (invokedDirectly) seed({ reset: process.argv.includes('--reset') });

export default seed;
