import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { normalizePrefs } from './prefs.js';
import { can } from './permissions.js';

export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), config.bcryptRounds);
}

export function verifyPassword(plain, hash) {
  if (!hash) return false;
  try { return bcrypt.compareSync(String(plain), hash); } catch { return false; }
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export function verifyToken(token) {
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    nameAr: row.name_ar,
    role: row.role,
    dept: row.dept,
    team: row.team,
    manager: row.manager,
    active: !!row.active,
    lang: row.lang,
    tz: row.tz,
    prefs: normalizePrefs(row.prefs),
  };
}

export function loadUser(id) {
  if (!id) return null;
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

export function loadUserByEmail(email) {
  if (!email) return null;
  return getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim()) || null;
}

function tokenFromRequest(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies[config.cookieName]) return req.cookies[config.cookieName];
  /* EventSource cannot set headers, so the stream endpoint is allowed to carry
     the token in the query string. It is the same signed token either way. */
  if (typeof req.query?.token === 'string' && req.query.token) return req.query.token;
  return null;
}

export function attachUser(req, _res, next) {
  const token = tokenFromRequest(req);
  const claims = token ? verifyToken(token) : null;
  if (claims) {
    const row = loadUser(claims.sub);
    if (row && row.active) {
      req.userRow = row;
      req.user = publicUser(row);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'authentication_required' });
  return next();
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'authentication_required' });
    if (!can(req.user, perm)) return res.status(403).json({ error: 'forbidden', permission: perm });
    return next();
  };
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { path: '/' });
}
