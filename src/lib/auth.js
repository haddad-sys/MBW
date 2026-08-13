import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { resolvePerms, can } from './domain.js';

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
export function uid(prefix = '') {
  return `${prefix ? `${prefix}_` : ''}${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    label: row.label || row.name,
    role: row.role,
    status: row.status,
    entityId: row.entity_id,
    phone: row.phone,
    note: row.note,
    perms: resolvePerms(row),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
  };
}

export function loadUser(id) {
  if (!id) return null;
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

export function findByLogin(login) {
  if (!login) return null;
  const value = String(login).trim();
  return getDb()
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
    .get(value, value) || null;
}

function tokenFromRequest(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies[config.cookieName]) return req.cookies[config.cookieName];
  /* EventSource cannot set headers, so the live stream may carry the same
     signed token in the query string. */
  if (typeof req.query?.token === 'string' && req.query.token) return req.query.token;
  return null;
}

export function attachUser(req, _res, next) {
  const token = tokenFromRequest(req);
  const claims = token ? verifyToken(token) : null;
  if (claims) {
    const row = loadUser(claims.sub);
    /* A token stays valid until it expires, but an account that has since been
       disabled or rejected must stop working immediately. */
    if (row && row.status === 'active') {
      req.userRow = row;
      req.user = publicUser(row);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.userRow) return res.status(401).json({ error: 'authentication_required' });
  return next();
}

export function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.userRow) return res.status(401).json({ error: 'authentication_required' });
    if (!can(req.userRow, perm)) return res.status(403).json({ error: 'forbidden', permission: perm });
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
