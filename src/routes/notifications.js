import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { listNotifications, unreadCount, markRead, markAllRead, notify } from '../services/notify.js';
import { getDb } from '../db/index.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = listNotifications(req.user.id, {
    limit: req.query.limit,
    unreadOnly: req.query.unread === '1' || req.query.unread === 'true',
  });
  res.json({ notifications: items, unread: unreadCount(req.user.id) });
});

router.get('/count', (req, res) => res.json({ unread: unreadCount(req.user.id) }));

router.post('/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'ids_required' });
  const changed = markRead(req.user.id, ids);
  return res.json({ changed, unread: unreadCount(req.user.id) });
});

router.post('/read-all', (req, res) => {
  const changed = markAllRead(req.user.id);
  res.json({ changed, unread: 0 });
});

router.delete('/:id', (req, res) => {
  const changed = getDb().prepare('DELETE FROM notifications WHERE id = ? AND user = ?').run(req.params.id, req.user.id).changes;
  res.json({ deleted: changed > 0, unread: unreadCount(req.user.id) });
});

/* Sends the signed-in person a real notification through the real pipeline —
   bell, ring and email — so "is this wired up?" has a one-click answer. */
router.post('/test', (req, res) => {
  const result = notify({
    userId: req.user.id,
    kind: 'reminder',
    actorId: null,
    force: true,
    text: 'This is a test notification from Mutabi. If you heard a chime and received an email, notifications are working.',
    textAr: 'هذا إشعار تجريبي من متابع. إذا سمعت النغمة ووصلتك رسالة بريد إلكتروني، فالإشعارات تعمل.',
  });
  res.json({ ok: !!result, result });
});

export default router;
