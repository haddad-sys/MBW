import express from 'express';
import { getDb } from '../db/index.js';
import {
  hashPassword, verifyPassword, signToken, publicUser, loadUserByEmail,
  setSessionCookie, clearSessionCookie, requireAuth,
} from '../lib/auth.js';
import { normalizePrefs } from '../lib/prefs.js';
import { record } from '../services/audit.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
  const row = loadUserByEmail(email);
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), row.id);
  const token = signToken(row);
  setSessionCookie(res, token);
  record({ user: row.id, action: 'auth.login' });
  return res.json({ user: publicUser(row), token });
});

router.post('/logout', (req, res) => {
  if (req.user) record({ user: req.user.id, action: 'auth.logout' });
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.put('/me/prefs', requireAuth, (req, res) => {
  const prefs = normalizePrefs(req.body || {});
  getDb().prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id);
  record({ user: req.user.id, action: 'prefs.update', to: prefs });
  return res.json({ prefs });
});

router.put('/me/profile', requireAuth, (req, res) => {
  const { name, nameAr, lang } = req.body || {};
  const db = getDb();
  const sets = [];
  const values = [];
  if (typeof name === 'string' && name.trim()) { sets.push('name = ?'); values.push(name.trim()); }
  if (typeof nameAr === 'string') { sets.push('name_ar = ?'); values.push(nameAr.trim()); }
  if (lang === 'ar' || lang === 'en') { sets.push('lang = ?'); values.push(lang); }
  if (sets.length) {
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({ user: publicUser(row) });
});

router.post('/me/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current || '', row.password_hash)) return res.status(400).json({ error: 'current_password_incorrect' });
  if (!next || String(next).length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  record({ user: req.user.id, action: 'auth.password_change' });
  return res.json({ ok: true });
});

export default router;
