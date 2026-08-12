import config from './config.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { shutdownRealtime } from './services/realtime.js';
import { transportName } from './services/mailer.js';
import { closeDb, getDb } from './db/index.js';

const app = createApp();

/* A database with no people in it cannot be signed into, and the reason is not
   obvious from a login failure — say so at boot instead. */
const userCount = getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  console.warn('[mutabi] no users exist yet — run `npm run seed` to create the demo organisation.');
}

const server = app.listen(config.port, config.host, () => {
  console.log(`متابع · Mutabi listening on http://localhost:${config.port}`);
  console.log(`  mail transport : ${transportName()}${config.mail.host ? ` (${config.mail.host}:${config.mail.port})` : ''}`);
  console.log(`  scheduler      : ${config.schedulerEnabled ? `every ${config.tickSeconds}s` : 'disabled'}`);
  console.log(`  database       : ${config.dbFile}`);
  startScheduler();
});

function shutdown(signal) {
  console.log(`\n[mutabi] ${signal} — shutting down.`);
  stopScheduler();
  shutdownRealtime();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  /* Long-lived SSE responses can outlive close(); do not wait forever. */
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
