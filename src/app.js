import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import config, { ROOT } from './config.js';
import { getDb } from './db/index.js';
import { attachUser } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';
import streamRoutes from './routes/stream.js';
import metaRoutes from './routes/meta.js';
import adminRoutes from './routes/admin.js';
import { transportName } from './services/mailer.js';

export function createApp() {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      app: 'mutabi',
      env: config.env,
      mailTransport: transportName(),
      scheduler: config.schedulerEnabled,
      time: Date.now(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/meta', metaRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'unknown_endpoint', path: req.originalUrl }));

  /* The client is a single page with hash routing, so any non-API path that
     survives the static handler is a deep link into it. */
  app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[mutabi] unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error', message: config.env === 'production' ? undefined : err.message });
  });

  return app;
}

export default createApp;
