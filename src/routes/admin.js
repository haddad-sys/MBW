import express from 'express';
import config from '../config.js';
import { getDb, getSetting, setSetting } from '../db/index.js';
import { requireAuth, requirePerm, hashPassword, publicUser, loadUser, uid } from '../lib/auth.js';
import {
  DEF_CFG, DEF_CATS, PERM_KEYS, TAB_KEYS, P_MGR, P_BR, P_VIEW, resolvePerms, NOTIF_EVENTS,
} from '../lib/domain.js';
import { raise, notifSettings, adminAudience } from '../services/notify.js';
import { emailLog, verifyTransport, transportName, flushEmails, renderEmail, queueEmail } from '../services/mailer.js';
import { runTick } from '../services/scheduler.js';
import { audit, auditLog } from '../services/audit.js';

const router = express.Router();
router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v) => String(v === undefined || v === null ? '' : v).trim();

/* ------------------------------------------------- registration approvals -- */

router.get('/registrations', requirePerm('manageUsers'), (req, res) => {
  const rows = getDb()
    .prepare(`SELECT u.*, e.name AS entity_name FROM users u LEFT JOIN entities e ON e.id = u.entity_id
              WHERE u.status = 'pending' ORDER BY u.created_at`)
    .all();
  res.json({
    registrations: rows.map((r) => ({ ...publicUser(r), entityName: r.entity_name })),
    count: rows.length,
  });
});

/** Approve: the account becomes usable, with the role, branch and permissions
 *  the administrator chose at this moment — not what the applicant asked for. */
router.post('/registrations/:id/approve', requirePerm('manageUsers'), (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const role = req.body?.role === 'manager' ? 'manager' : 'branch';
  const entityId = clean(req.body?.entityId) || null;
  const label = clean(req.body?.label) || row.name;
  const note = clean(req.body?.note).slice(0, 300);

  let perms = null;
  if (req.body?.perms && typeof req.body.perms === 'object') {
    perms = sanitizePerms(req.body.perms);
  } else {
    perms = role === 'manager' ? { ...P_MGR } : { ...P_BR };
  }
  if (perms.scope === 'own' && !entityId) return res.status(400).json({ error: 'entity_required' });
  if (entityId && !db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)) {
    return res.status(400).json({ error: 'invalid_entity' });
  }

  db.prepare(
    `UPDATE users SET status = 'active', role = ?, entity_id = ?, label = ?, perms = ?,
            decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?`,
  ).run(role, entityId, label, JSON.stringify(perms), req.userRow.id, Date.now(), note, row.id);

  audit({ userId: req.userRow.id, action: 'user.approve', target: row.id, detail: row.email });

  const entity = entityId ? db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) : null;
  raise({
    event: 'accountApproved',
    title: `تم اعتماد حساب ${row.name}`,
    text: note || 'يمكنك الآن تسجيل الدخول إلى متابِع.',
    rows: [['المستخدم', row.username], ['الصلاحية', role === 'manager' ? 'مدير' : 'موظف فرع'], ['الفرع', entity ? entity.name : 'كل الفروع']],
    audience: adminAudience(),
    actorId: req.userRow.id,
    extraEmails: [row.email],
    force: true,
  });

  return res.json({ user: publicUser(loadUser(row.id)) });
});

router.post('/registrations/:id/reject', requirePerm('manageUsers'), (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const note = clean(req.body?.note).slice(0, 300);

  db.prepare(
    `UPDATE users SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?`,
  ).run(req.userRow.id, Date.now(), note, row.id);
  audit({ userId: req.userRow.id, action: 'user.reject', target: row.id, detail: note });

  /* The applicant is told, and told why if a reason was given. */
  const rendered = renderEmail({
    event: 'accountApproved',
    title: 'لم يُعتمد طلب التسجيل',
    body: note || 'نعتذر، لم يُعتمد طلب إنشاء الحساب.',
    rows: [['المستخدم', row.username]],
  });
  queueEmail({
    toEmail: row.email, toUser: row.id, event: 'accountApproved',
    subject: '[متابِع] نتيجة طلب التسجيل', text: rendered.text, html: rendered.html,
  });

  return res.json({ ok: true });
});

/* ---------------------------------------------------------------- users --- */

function sanitizePerms(raw) {
  const out = {};
  out.scope = raw.scope === 'all' ? 'all' : 'own';
  out.tabs = {};
  for (const k of TAB_KEYS) out.tabs[k] = raw.tabs && raw.tabs[k] ? 1 : 0;
  for (const k of PERM_KEYS) out[k] = raw[k] ? 1 : 0;
  return out;
}

router.get('/users', requirePerm('manageUsers'), (req, res) => {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY created_at').all();
  res.json({ users: rows.map(publicUser) });
});

router.post('/users', requirePerm('manageUsers'), (req, res) => {
  const db = getDb();
  const username = clean(req.body?.username).toLowerCase();
  const email = clean(req.body?.email).toLowerCase();
  const name = clean(req.body?.name);
  const password = String(req.body?.password || '');
  if (!username || !email || !name || !password) return res.status(400).json({ error: 'missing_fields' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
  if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(username, email)) {
    return res.status(409).json({ error: 'already_exists' });
  }
  const perms = req.body?.perms ? sanitizePerms(req.body.perms) : { ...P_BR };
  const role = perms.scope === 'all' ? 'manager' : 'branch';
  const entityId = perms.scope === 'own' ? (clean(req.body?.entityId) || null) : null;
  if (perms.scope === 'own' && !entityId) return res.status(400).json({ error: 'entity_required' });

  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, username, email, name, label, password_hash, role, status, entity_id, perms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(id, username, email, name, clean(req.body?.label) || name, hashPassword(password), role, entityId, JSON.stringify(perms), Date.now());
  audit({ userId: req.userRow.id, action: 'user.create', target: id, detail: email });
  return res.status(201).json({ user: publicUser(loadUser(id)) });
});

router.patch('/users/:id', requirePerm('manageUsers'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const sets = [];
  const values = [];
  if (req.body?.name !== undefined) { sets.push('name = ?'); values.push(clean(req.body.name) || row.name); }
  if (req.body?.label !== undefined) { sets.push('label = ?'); values.push(clean(req.body.label)); }
  if (req.body?.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: 'password_too_short', minimum: 8 });
    sets.push('password_hash = ?'); values.push(hashPassword(req.body.password));
  }
  let perms = null;
  if (req.body?.perms) {
    perms = sanitizePerms(req.body.perms);
    sets.push('perms = ?', 'role = ?');
    values.push(JSON.stringify(perms), perms.scope === 'all' ? 'manager' : 'branch');
  }
  if (req.body?.entityId !== undefined) {
    const entityId = clean(req.body.entityId) || null;
    sets.push('entity_id = ?'); values.push(entityId);
  }
  if (req.body?.status !== undefined) {
    const status = ['active', 'disabled'].includes(req.body.status) ? req.body.status : row.status;
    if (status !== row.status && row.id === req.userRow.id) return res.status(400).json({ error: 'cannot_disable_self' });
    sets.push('status = ?'); values.push(status);
  }
  if (!sets.length) return res.json({ user: publicUser(row) });

  values.push(row.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  /* The system must never be left without somebody who can manage users. */
  const admins = db.prepare("SELECT * FROM users WHERE status = 'active'").all()
    .filter((u) => resolvePerms(u).manageUsers);
  if (admins.length === 0) {
    db.prepare('UPDATE users SET perms = ?, role = ?, status = ? WHERE id = ?')
      .run(row.perms, row.role, row.status, row.id);
    return res.status(400).json({ error: 'last_administrator' });
  }
  audit({ userId: req.userRow.id, action: 'user.update', target: row.id });
  return res.json({ user: publicUser(loadUser(row.id)) });
});

router.delete('/users/:id', requirePerm('manageUsers'), (req, res) => {
  const db = getDb();
  if (req.params.id === req.userRow.id) return res.status(400).json({ error: 'cannot_delete_self' });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const remaining = db.prepare("SELECT * FROM users WHERE status = 'active' AND id != ?").all(row.id)
    .filter((u) => resolvePerms(u).manageUsers);
  if (remaining.length === 0) return res.status(400).json({ error: 'last_administrator' });
  db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
  audit({ userId: req.userRow.id, action: 'user.delete', target: row.id, detail: row.email });
  return res.json({ ok: true });
});

router.get('/presets', requirePerm('manageUsers'), (req, res) => {
  res.json({ manager: P_MGR, branch: P_BR, viewer: P_VIEW });
});

/* ------------------------------------------------------------ variables --- */

router.get('/config', (req, res) => res.json({ cfg: getSetting('cfg', DEF_CFG) }));

router.put('/config', requirePerm('settings'), (req, res) => {
  const body = req.body || {};
  const priorities = Array.isArray(body.priorities) ? body.priorities : null;
  const statuses = Array.isArray(body.statuses) ? body.statuses : null;
  const types = Array.isArray(body.types) ? body.types : null;
  const defaultCats = Array.isArray(body.defaultCats) ? body.defaultCats.map(clean).filter(Boolean) : null;

  if (!priorities || !priorities.length) return res.status(400).json({ error: 'priorities_required' });
  if (!statuses || !statuses.length) return res.status(400).json({ error: 'statuses_required' });
  if (!statuses.some((s) => !s.done && !s.parked)) return res.status(400).json({ error: 'open_status_required' });
  if (!statuses.some((s) => s.done)) return res.status(400).json({ error: 'done_status_required' });
  if (!types || !types.length) return res.status(400).json({ error: 'types_required' });

  const cfg = {
    priorities: priorities.map((p) => ({ key: clean(p.key) || uid('pri'), label: clean(p.label) || '—', color: clean(p.color) || 'slate' })),
    statuses: statuses.map((s) => ({
      key: clean(s.key) || uid('st'), label: clean(s.label) || '—', color: clean(s.color) || 'slate',
      gate: !!s.gate, done: !!s.done, parked: !!s.parked,
    })),
    types: types.map((t) => ({ key: clean(t.key) || uid('ty'), label: clean(t.label) || '—', color: clean(t.color) || 'slate', icon: clean(t.icon) || 'box' })),
    defaultCats: defaultCats && defaultCats.length ? defaultCats : DEF_CATS.slice(),
  };
  setSetting('cfg', cfg);
  audit({ userId: req.userRow.id, action: 'config.update' });
  return res.json({ cfg });
});

/* ----------------------------------------------------------------- team --- */

router.get('/team', (req, res) => {
  res.json({ team: getDb().prepare('SELECT name FROM team ORDER BY name').all().map((r) => r.name) });
});

router.post('/team', requirePerm('manageTeam'), (req, res) => {
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name_required' });
  getDb().prepare('INSERT OR IGNORE INTO team (name) VALUES (?)').run(name);
  return res.status(201).json({ team: getDb().prepare('SELECT name FROM team ORDER BY name').all().map((r) => r.name) });
});

router.delete('/team/:name', requirePerm('manageTeam'), (req, res) => {
  getDb().prepare('DELETE FROM team WHERE name = ?').run(decodeURIComponent(req.params.name));
  return res.json({ team: getDb().prepare('SELECT name FROM team ORDER BY name').all().map((r) => r.name) });
});

/* -------------------------------------------------------- notifications --- */

router.get('/notifications-config', requirePerm('settings'), (req, res) => {
  res.json({ notif: notifSettings(), events: NOTIF_EVENTS, transport: transportName(), from: config.mail.from });
});

router.put('/notifications-config', requirePerm('settings'), (req, res) => {
  const body = req.body || {};
  const current = notifSettings();
  const types = { ...current.types };
  if (body.types && typeof body.types === 'object') {
    for (const k of NOTIF_EVENTS) if (typeof body.types[k] === 'boolean') types[k] = body.types[k];
  }
  const recipients = Array.isArray(body.recipients)
    ? [...new Set(body.recipients.map(clean).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))]
    : current.recipients;
  const next = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    recipients,
    types,
  };
  setSetting('notif', next);
  audit({ userId: req.userRow.id, action: 'notif.update' });
  return res.json({ notif: next });
});

router.post('/notifications-test', requirePerm('settings'), (req, res) => {
  const result = raise({
    event: 'taskAdded',
    title: 'اختبار الإشعارات من متابِع',
    text: 'إذا وصلتك هذه الرسالة وسمعت النغمة، فالإشعارات تعمل.',
    rows: [['بواسطة', req.userRow.name], ['الوقت', new Date().toLocaleString('ar-EG')]],
    audience: [req.userRow.id],
    force: true,
  });
  return res.json({ ok: true, result });
});

/* ------------------------------------------------------------ mail log ---- */

router.get('/emails', requirePerm('settings'), (req, res) => {
  res.json({
    transport: transportName(),
    from: config.mail.from,
    redirectAll: config.mail.redirectAll || null,
    emails: emailLog({ limit: req.query.limit, state: req.query.state }),
  });
});

router.get('/mail/verify', requirePerm('settings'), wrap(async (req, res) => {
  res.json(await verifyTransport());
}));

router.post('/mail/flush', requirePerm('settings'), wrap(async (req, res) => {
  res.json(await flushEmails());
}));

router.post('/tick', requirePerm('settings'), wrap(async (req, res) => {
  res.json(await runTick());
}));

router.get('/audit', requirePerm('settings'), (req, res) => {
  res.json({ audit: auditLog(req.query.limit) });
});

export default router;
