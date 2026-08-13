import config from './config.js';
import { createApp } from './app.js';
import { seed } from './db/seed.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { shutdownRealtime } from './services/realtime.js';
import { transportName } from './services/mailer.js';
import { closeDb, getDb } from './db/index.js';

const app = createApp();

/* An empty database cannot be signed into, so the owner account is created on
   first boot rather than left as a setup step somebody has to discover. */
seed({ quiet: true, demo: config.seedDemo });

const pending = getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get().n;

const server = app.listen(config.port, config.host, () => {
  console.log(`متابِع · Mutabea → http://localhost:${config.port}`);
  console.log(`  البريد    : ${transportName()}${config.mail.host ? ` (${config.mail.host}:${config.mail.port})` : ' — لا يُرسل فعلياً'}`);
  console.log(`  التسجيل   : ${config.registrationOpen ? 'مفتوح — بانتظار اعتمادك' : 'مغلق'}`);
  console.log(`  المحرّك   : ${config.schedulerEnabled ? `كل ${config.tickSeconds} ثانية` : 'متوقف'}`);
  console.log(`  قاعدة     : ${config.dbFile}`);
  if (pending) console.log(`  تنبيه     : ${pending} طلب تسجيل بانتظار الاعتماد`);
  startScheduler();
});

function shutdown(signal) {
  console.log(`\n[mutabea] ${signal} — إيقاف.`);
  stopScheduler();
  shutdownRealtime();
  server.close(() => { closeDb(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
