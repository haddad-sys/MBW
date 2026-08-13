import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import config, { ROOT } from './config.js';
import { getDb } from './db/index.js';
import { attachUser } from './lib/auth.js';
import { transportName } from './services/mailer.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import streamRoutes from './routes/stream.js';

export function createApp() {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  /* Photographs and documents arrive inline as data URIs, so the JSON body
     limit is the real upload limit. */
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      app: 'mutabea',
      env: config.env,
      mailTransport: transportName(),
      registrationOpen: config.registrationOpen,
      scheduler: config.schedulerEnabled,
      time: Date.now(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api', apiRoutes);

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'unknown_endpoint', path: req.originalUrl }));
  app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[mutabea] unhandled error:', err);
    if (res.headersSent) return;
    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    res.status(500).json({ error: 'internal_error', message: config.env === 'production' ? undefined : err.message });
  });

  return app;
}

export default createApp;
