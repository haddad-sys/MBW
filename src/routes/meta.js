import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { roleSummary, PRIORITIES, PERMS } from '../lib/permissions.js';
import { NOTIFY_EVENTS } from '../lib/prefs.js';
import config from '../config.js';

const router = express.Router();
router.use(requireAuth);

/* Everything a freshly loaded client needs to render labels without guessing. */
router.get('/bootstrap', (req, res) => {
  const db = getDb();
  res.json({
    org: { name: config.orgName, nameAr: config.orgNameAr },
    user: req.user,
    statuses: db.prepare('SELECT * FROM statuses WHERE active = 1 ORDER BY sort_order').all(),
    priorities: PRIORITIES,
    roles: roleSummary(),
    permissions: PERMS,
    notifyEvents: NOTIFY_EVENTS.map((e) => e.key),
    users: db
      .prepare('SELECT id, name, name_ar, email, role, dept, team, active FROM users WHERE active = 1 ORDER BY name')
      .all(),
    departments: db.prepare('SELECT * FROM departments ORDER BY name').all(),
    teams: db.prepare('SELECT * FROM teams ORDER BY name').all(),
    categories: db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY name').all(),
    projects: db.prepare('SELECT * FROM projects ORDER BY name').all(),
  });
});

router.get('/users', (req, res) => {
  res.json({
    users: getDb()
      .prepare('SELECT id, name, name_ar, email, role, dept, team, active FROM users WHERE active = 1 ORDER BY name')
      .all(),
  });
});

router.get('/statuses', (req, res) => {
  res.json({ statuses: getDb().prepare('SELECT * FROM statuses WHERE active = 1 ORDER BY sort_order').all() });
});

export default router;
