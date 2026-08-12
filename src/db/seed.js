import fs from 'node:fs';
import config from '../config.js';
import { getDb, resetDbForTests } from './index.js';
import { hashPassword } from '../lib/auth.js';
import { isoDate, addDays, DAY } from '../lib/time.js';
import { DEFAULT_PREFS } from '../lib/prefs.js';

/* A demo organisation big enough to exercise every path in the console:
   four roles, a reporting line for escalation, overdue work, work due today,
   and followers who are not the assignee. */

const PASSWORD = process.env.SEED_PASSWORD || 'Mutabi#2026';

const DEPARTMENTS = [
  { id: 'ops', name: 'Operations', name_ar: 'العمليات', head: 'u_layla' },
  { id: 'eng', name: 'Engineering', name_ar: 'الهندسة', head: 'u_khalid' },
  { id: 'qa', name: 'Quality & Compliance', name_ar: 'الجودة والالتزام', head: 'u_layla' },
];

const TEAMS = [
  { id: 't_field', name: 'Field Operations', name_ar: 'عمليات الميدان', dept: 'ops', lead: 'u_layla' },
  { id: 't_platform', name: 'Platform', name_ar: 'المنصة', dept: 'eng', lead: 'u_khalid' },
  { id: 't_audit', name: 'Audit', name_ar: 'التدقيق', dept: 'qa', lead: 'u_layla' },
];

const USERS = [
  { id: 'u_admin', email: 'admin@mutabi.local', name: 'Nadia Al-Haddad', name_ar: 'نادية الحداد', role: 'admin', dept: 'ops', team: 't_field', manager: null, lang: 'ar' },
  { id: 'u_layla', email: 'layla@mutabi.local', name: 'Layla Mansour', name_ar: 'ليلى منصور', role: 'manager', dept: 'ops', team: 't_field', manager: 'u_admin', lang: 'ar' },
  { id: 'u_khalid', email: 'khalid@mutabi.local', name: 'Khalid Rashed', name_ar: 'خالد راشد', role: 'manager', dept: 'eng', team: 't_platform', manager: 'u_admin', lang: 'en' },
  { id: 'u_sara', email: 'sara@mutabi.local', name: 'Sara Youssef', name_ar: 'سارة يوسف', role: 'member', dept: 'ops', team: 't_field', manager: 'u_layla', lang: 'ar' },
  { id: 'u_omar', email: 'omar@mutabi.local', name: 'Omar Fadel', name_ar: 'عمر فاضل', role: 'member', dept: 'eng', team: 't_platform', manager: 'u_khalid', lang: 'en' },
  { id: 'u_huda', email: 'huda@mutabi.local', name: 'Huda Nasser', name_ar: 'هدى ناصر', role: 'member', dept: 'qa', team: 't_audit', manager: 'u_layla', lang: 'ar' },
  { id: 'u_faris', email: 'faris@mutabi.local', name: 'Faris Al-Otaibi', name_ar: 'فارس العتيبي', role: 'viewer', dept: 'qa', team: 't_audit', manager: 'u_layla', lang: 'en' },
];

const CATEGORIES = [
  { id: 'c_client', name: 'Client Work', name_ar: 'أعمال العملاء', color: '#0B6E6E', dept: 'ops', owner: 'u_layla' },
  { id: 'c_internal', name: 'Internal', name_ar: 'داخلي', color: '#1F5FA8', dept: 'eng', owner: 'u_khalid' },
  { id: 'c_compliance', name: 'Compliance', name_ar: 'الالتزام', color: '#96620A', dept: 'qa', owner: 'u_huda' },
];

const PROJECTS = [
  { id: 'p_rollout', name: 'Site Rollout Q3', name_ar: 'إطلاق المواقع - الربع الثالث', category: 'c_client', owner: 'u_layla' },
  { id: 'p_portal', name: 'Partner Portal', name_ar: 'بوابة الشركاء', category: 'c_internal', owner: 'u_khalid' },
  { id: 'p_iso', name: 'ISO 9001 Readiness', name_ar: 'جاهزية آيزو 9001', category: 'c_compliance', owner: 'u_huda' },
];

function taskSeed(today) {
  const d = (n) => isoDate(addDays(today, n));
  return [
    {
      id: 'T-1001', title: 'Submit weekly site progress report', title_ar: 'تسليم تقرير تقدم الموقع الأسبوعي',
      description: 'Consolidate field readings and submit to the client PMO before the weekly review.',
      status: 'progress', priority: 'High', due_date: d(-4), category: 'c_client', project: 'p_rollout',
      dept: 'ops', team: 't_field', owner: 'u_layla', assignee: 'u_sara', progress: 60,
      watchers: ['u_layla', 'u_sara', 'u_faris'],
    },
    {
      id: 'T-1002', title: 'Close out safety observation SO-241', title_ar: 'إغلاق ملاحظة السلامة SO-241',
      description: 'Corrective action pending verification by the audit team.',
      status: 'blocked', priority: 'Critical', due_date: d(-1), category: 'c_compliance', project: 'p_iso',
      dept: 'qa', team: 't_audit', owner: 'u_huda', assignee: 'u_huda', progress: 30,
      watchers: ['u_huda', 'u_layla', 'u_admin'],
    },
    {
      id: 'T-1003', title: 'Partner portal — single sign-on cutover', title_ar: 'بوابة الشركاء — تحويل الدخول الموحّد',
      description: 'Coordinate the SSO cutover window with the identity provider.',
      status: 'assigned', priority: 'High', due_date: d(0), due_time: '16:00', category: 'c_internal',
      project: 'p_portal', dept: 'eng', team: 't_platform', owner: 'u_khalid', assignee: 'u_omar', progress: 15,
      watchers: ['u_khalid', 'u_omar'],
    },
    {
      id: 'T-1004', title: 'Update the document register for July', title_ar: 'تحديث سجل الوثائق لشهر يوليو',
      status: 'new', priority: 'Medium', due_date: d(2), category: 'c_compliance', project: 'p_iso',
      dept: 'qa', team: 't_audit', owner: 'u_huda', assignee: 'u_huda', progress: 0,
      watchers: ['u_huda'],
    },
    {
      id: 'T-1005', title: 'Vendor invoice reconciliation', title_ar: 'تسوية فواتير الموردين',
      status: 'waiting', priority: 'Medium', due_date: d(5), category: 'c_client', project: 'p_rollout',
      dept: 'ops', team: 't_field', owner: 'u_layla', assignee: 'u_sara', progress: 40,
      watchers: ['u_sara', 'u_layla'],
    },
    {
      id: 'T-1006', title: 'Publish the Q2 operations dashboard', title_ar: 'نشر لوحة متابعة عمليات الربع الثاني',
      status: 'done', priority: 'Low', due_date: d(-8), category: 'c_internal', project: 'p_portal',
      dept: 'eng', team: 't_platform', owner: 'u_khalid', assignee: 'u_omar', progress: 100,
      watchers: ['u_khalid', 'u_omar'], completed_at: Date.now() - 6 * DAY,
    },
    {
      id: 'T-1007', title: 'Draft the follow-up procedure (MBW-PR-004)', title_ar: 'إعداد إجراء المتابعة (MBW-PR-004)',
      description: 'Document how follow-up items are raised, tracked and escalated.',
      status: 'review', priority: 'High', due_date: d(3), category: 'c_compliance', project: 'p_iso',
      dept: 'qa', team: 't_audit', owner: 'u_admin', assignee: 'u_huda', progress: 70,
      watchers: ['u_admin', 'u_huda', 'u_faris'],
    },
    {
      id: 'T-1008', title: 'Field tablet firmware upgrade', title_ar: 'ترقية البرنامج الثابت للأجهزة اللوحية',
      status: 'notstart', priority: 'Low', due_date: d(9), category: 'c_internal', project: 'p_portal',
      dept: 'eng', team: 't_platform', owner: 'u_khalid', assignee: 'u_omar', progress: 0,
      watchers: ['u_omar'],
    },
  ];
}

export function seed({ reset = false, quiet = false } = {}) {
  if (reset && config.dbFile !== ':memory:' && fs.existsSync(config.dbFile)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const f = config.dbFile + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    resetDbForTests(config.dbFile);
  }

  const db = getDb();
  const now = Date.now();
  const today = new Date();
  const hash = hashPassword(PASSWORD);
  const prefs = JSON.stringify(DEFAULT_PREFS);

  const tx = db.transaction(() => {
    const dept = db.prepare('INSERT OR IGNORE INTO departments (id, name, name_ar) VALUES (?, ?, ?)');
    for (const d of DEPARTMENTS) dept.run(d.id, d.name, d.name_ar);

    const team = db.prepare('INSERT OR IGNORE INTO teams (id, name, name_ar, dept) VALUES (?, ?, ?, ?)');
    for (const t of TEAMS) team.run(t.id, t.name, t.name_ar, t.dept);

    const user = db.prepare(
      `INSERT OR IGNORE INTO users (id, email, name, name_ar, password_hash, role, dept, team, manager, active, lang, prefs, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    );
    for (const u of USERS) {
      user.run(u.id, u.email, u.name, u.name_ar, hash, u.role, u.dept, u.team, u.manager, u.lang, prefs, now);
    }
    /* Heads and leads reference users, so they are set after the people exist. */
    for (const d of DEPARTMENTS) db.prepare('UPDATE departments SET head = ? WHERE id = ?').run(d.head, d.id);
    for (const t of TEAMS) db.prepare('UPDATE teams SET lead = ? WHERE id = ?').run(t.lead, t.id);

    const cat = db.prepare('INSERT OR IGNORE INTO categories (id, name, name_ar, color, dept, owner, active) VALUES (?, ?, ?, ?, ?, ?, 1)');
    for (const c of CATEGORIES) cat.run(c.id, c.name, c.name_ar, c.color, c.dept, c.owner);

    const proj = db.prepare('INSERT OR IGNORE INTO projects (id, name, name_ar, category, owner, status) VALUES (?, ?, ?, ?, ?, ?)');
    for (const p of PROJECTS) proj.run(p.id, p.name, p.name_ar, p.category, p.owner, 'active');

    const taskStmt = db.prepare(
      `INSERT OR IGNORE INTO tasks (id, title, title_ar, description, status, priority, due_date, due_time,
                                    category, project, dept, team, owner, assignee, progress, source,
                                    created_by, created_at, updated_by, updated_at, completed_at, status_since)
       VALUES (@id, @title, @title_ar, @description, @status, @priority, @due_date, @due_time,
               @category, @project, @dept, @team, @owner, @assignee, @progress, 'seed',
               @owner, @created_at, @owner, @created_at, @completed_at, @created_at)`,
    );
    const watchStmt = db.prepare('INSERT OR IGNORE INTO task_watchers (task, user, added_at, added_by) VALUES (?, ?, ?, ?)');

    for (const t of taskSeed(today)) {
      taskStmt.run({
        id: t.id,
        title: t.title,
        title_ar: t.title_ar || '',
        description: t.description || '',
        status: t.status,
        priority: t.priority,
        due_date: t.due_date || null,
        due_time: t.due_time || null,
        category: t.category || null,
        project: t.project || null,
        dept: t.dept || null,
        team: t.team || null,
        owner: t.owner,
        assignee: t.assignee || null,
        progress: t.progress || 0,
        created_at: now - 10 * DAY,
        completed_at: t.completed_at || null,
      });
      for (const w of t.watchers || []) watchStmt.run(t.id, w, now, t.owner);
    }

    const check = db.prepare('INSERT OR IGNORE INTO checklist (id, task, text, done, sort_order) VALUES (?, ?, ?, ?, ?)');
    check.run('ck_seed1', 'T-1007', 'Draft the scope and boundaries section', 1, 1);
    check.run('ck_seed2', 'T-1007', 'Add the escalation matrix', 1, 2);
    check.run('ck_seed3', 'T-1007', 'Circulate for review', 0, 3);

    db.prepare('INSERT OR IGNORE INTO comments (id, task, user, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('c_seed1', 'T-1002', 'u_layla', 'Verification is waiting on the contractor closure evidence.', now - 2 * DAY);
  });

  tx();

  if (!quiet) {
    console.log('Seeded the demo organisation.');
    console.log(`  users    : ${USERS.length}`);
    console.log(`  tasks    : ${taskSeed(today).length}`);
    console.log(`  password : ${PASSWORD}  (every account)`);
    console.log('  sign in  : admin@mutabi.local');
  }
  return { users: USERS.length, password: PASSWORD };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed.js');
if (invokedDirectly) {
  seed({ reset: process.argv.includes('--reset') });
}

export default seed;
