import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { subscribe, connectionCount } from '../services/realtime.js';
import { unreadCount } from '../services/notify.js';

const router = express.Router();

/* The live channel: one long-lived response per open tab. */
router.get('/', requireAuth, (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ user: req.userRow.id, unread: unreadCount(req.userRow.id), at: Date.now() })}\n\n`);

  const unsubscribe = subscribe(req.userRow.id, res);
  req.on('close', () => { unsubscribe(); res.end(); });
});

router.get('/status', requireAuth, (req, res) => {
  res.json({ connections: connectionCount(req.userRow.id), total: connectionCount() });
});

export default router;
