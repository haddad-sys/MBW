import express from 'express';
import config from '../config.js';
import { getDb } from '../db/index.js';
import {
  hashPassword, verifyPassword, signToken, publicUser, findByLogin, loadUser, uid,
  setSessionCookie, clearSessionCookie, requireAuth,
} from '../lib/auth.js';
import { raise, adminAudience, adminEmails } from '../services/notify.js';
import { audit } from '../services/audit.js';

const router = express.Router();

const clean = (v) => String(v === undefined || v === null ? '' : v).trim();

function domainAllowed(email) {
  if (config.allowedDomains.length === 0) return true;
  const domain = String(email).split('@')[1];
  return !!domain && config.allowedDomains.includes(domain.toLowerCase());
}

/* -------------------------------------------------------------- register -- */
/* Anyone may apply; nobody gets in until an administrator says so. The reply is
   deliberately the same shape whether or not the address is already known, so
   the endpoint cannot be used to enumerate accounts. */
router.post('/register', (req, res) => {
  if (!config.registrationOpen) return res.status(403).json({ error: 'registration_closed' });

  const username = clean(req.body?.username).toLowerCase();
  const email = clean(req.body?.email).toLowerCase();
  const name = clean(req.body?.name);
  const password = String(req.body?.password || '');
  const phone = clean(req.body?.phone);
  const note = clean(req.body?.note).slice(0, 500);
  const entityId = clean(req.body?.entityId) || null;

  if (!username || !email || !name || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
  if (!domainAllowed(email)) return res.status(400).json({ error: 'domain_not_allowed', allowed: config.allowedDomains });

  const db = getDb();
  const taken = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(username, email);
  if (taken) {
    return res.status(202).json({ status: 'pending', message: 'تم استلام الطلب. ستصلك رسالة عند اعتماد الحساب.' });
  }
  if (entityId && !db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)) {
    return res.status(400).json({ error: 'invalid_entity' });
  }

  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, username, email, name, label, password_hash, role, status, entity_id, phone, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'branch', 'pending', ?, ?, ?, ?)`,
  ).run(id, username, email, name, name, hashPassword(password), entityId, phone, note, Date.now());

  audit({ userId: null, action: 'user.register', target: id, detail: email });

  const entity = entityId ? db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) : null;
  raise({
    event: 'registration',
    title: `طلب تسجيل: ${name}`,
    text: note || 'طلب حساب جديد بانتظار الاعتماد.',
    rows: [['المستخدم', username], ['البريد', email], ['الهاتف', phone], ['الفرع', entity ? entity.name : '—']],
    audience: adminAudience(),
    extraEmails: adminEmails(),
  });

  return res.status(202).json({ status: 'pending', message: 'تم استلام الطلب. ستصلك رسالة عند اعتماد الحساب.' });
});

/* Branch list for the registration form — the only thing an anonymous caller
   may read, and only names, so an applicant can say where they work. */
router.get('/entities', (req, res) => {
  const rows = getDb().prepare('SELECT id, name FROM entities ORDER BY name').all();
  res.json({ entities: rows, registrationOpen: config.registrationOpen });
});

/* ----------------------------------------------------------------- login -- */
router.post('/login', (req, res) => {
  const login = clean(req.body?.username || req.body?.login);
  const password = String(req.body?.password || '');
  if (!login || !password) return res.status(400).json({ error: 'missing_fields' });

  const row = findByLogin(login);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  /* The account exists and the password is right — but it still has to be
     approved, and the person deserves to know which of the three it is. */
  if (row.status === 'pending') return res.status(403).json({ error: 'account_pending' });
  if (row.status === 'rejected') return res.status(403).json({ error: 'account_rejected', reason: row.decision_note || '' });
  if (row.status !== 'active') return res.status(403).json({ error: 'account_disabled' });

  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), row.id);
  const token = signToken(row);
  setSessionCookie(res, token);
  audit({ userId: row.id, action: 'auth.login' });
  return res.json({ user: publicUser(loadUser(row.id)), token });
});

router.post('/logout', (req, res) => {
  if (req.userRow) audit({ userId: req.userRow.id, action: 'auth.logout' });
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (!verifyPassword(current, req.userRow.password_hash)) {
    return res.status(400).json({ error: 'current_password_incorrect' });
  }
  if (next.length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.userRow.id);
  audit({ userId: req.userRow.id, action: 'auth.password_change' });
  return res.json({ ok: true });
});

export default router;
