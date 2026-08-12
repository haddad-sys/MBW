import express from 'express';
import { requireAuth, requirePerm, hashPassword, publicUser } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { uid } from '../lib/ids.js';
import { ROLE_IDS } from '../lib/permissions.js';
import { emailLog, verifyTransport, transportName, flushEmails } from '../services/mailer.js';
import { runTick } from '../services/scheduler.js';
import { record } from '../services/audit.js';
import config from '../config.js';

const router = express.Router();
router.use(requireAuth);

/* Express 4 does not catch a rejected promise from a handler — the request
   would hang until the client gave up. Every async route is wrapped. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------------------------------------- people ----- */

router.get('/users', requirePerm('manage.users'), (req, res) => {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY created_at').all();
  res.json({ users: rows.map(publicUser) });
});

router.post('/users', requirePerm('manage.users'), (req, res) => {
  const db = getDb();
  const { email, name, nameAr = '', role = 'member', password, dept = null, team = null, manager = null, lang = 'ar' } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'email_name_password_required' });
  if (!ROLE_IDS.includes(role)) return res.status(400).json({ error: 'invalid_role', allowed: ROLE_IDS });
  if (String(password).length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
  if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)) {
    return res.status(409).json({ error: 'email_taken' });
  }
  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, email, name, name_ar, password_hash, role, dept, team, manager, active, lang, prefs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '{}', ?)`,
  ).run(id, String(email).trim(), name, nameAr, hashPassword(password), role, dept, team, manager, lang, Date.now());
  record({ user: req.user.id, action: 'user.create', to: email });
  return res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

router.patch('/users/:id', requirePerm('manage.users'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const { name, nameAr, role, dept, team, manager, active, password } = req.body || {};
  const sets = [];
  const values = [];
  if (typeof name === 'string' && name.trim()) { sets.push('name = ?'); values.push(name.trim()); }
  if (typeof nameAr === 'string') { sets.push('name_ar = ?'); values.push(nameAr.trim()); }
  if (role) {
    if (!ROLE_IDS.includes(role)) return res.status(400).json({ error: 'invalid_role', allowed: ROLE_IDS });
    sets.push('role = ?'); values.push(role);
  }
  if (dept !== undefined) { sets.push('dept = ?'); values.push(dept || null); }
  if (team !== undefined) { sets.push('team = ?'); values.push(team || null); }
  if (manager !== undefined) { sets.push('manager = ?'); values.push(manager || null); }
  if (active !== undefined) { sets.push('active = ?'); values.push(active ? 1 : 0); }
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
    sets.push('password_hash = ?'); values.push(hashPassword(password));
  }
  if (sets.length) {
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    record({ user: req.user.id, action: 'user.update', field: req.params.id });
  }
  return res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)) });
});

/* ---------------------------------------------------------- email log ----- */

router.get('/emails', requirePerm('manage.settings'), (req, res) => {
  res.json({
    transport: transportName(),
    from: config.mail.from,
    redirectAll: config.mail.redirectAll || null,
    emails: emailLog({ limit: req.query.limit, state: req.query.state }),
  });
});

router.get('/mail/verify', requirePerm('manage.settings'), wrap(async (req, res) => {
  res.json(await verifyTransport());
}));

router.post('/mail/flush', requirePerm('manage.settings'), wrap(async (req, res) => {
  res.json(await flushEmails());
}));

/* Lets an administrator run the background engine on demand instead of waiting
   for the next tick — the same code path, not a shortcut. */
router.post('/tick', requirePerm('manage.settings'), wrap(async (req, res) => {
  res.json(await runTick());
}));

router.get('/audit', requirePerm('audit.view'), (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user
        ORDER BY a.at DESC LIMIT ?`,
    )
    .all(Math.min(Number(req.query.limit) || 200, 1000));
  res.json({ audit: rows });
});

export default router;
