import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

/* A .env file is optional. Anything already in process.env wins, so a real
   deployment can inject secrets without a file on disk. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv(process.env.MUTABI_ENV_FILE || path.join(ROOT, '.env'));

const env = process.env;
const bool = (v, fallback) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, fallback) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : fallback);

/* Without an explicit secret the process still runs — it just cannot survive a
   restart, which is the correct trade-off for a development box and a loud
   enough failure mode in production that the warning below is worth printing. */
let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  if (env.NODE_ENV === 'production') {
    console.warn('[mutabi] JWT_SECRET is not set — sessions will not survive a restart.');
  }
}

export const config = {
  env: env.NODE_ENV || 'development',
  port: int(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  appUrl: (env.APP_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, ''),
  orgName: env.ORG_NAME || 'Mutabi',
  orgNameAr: env.ORG_NAME_AR || 'متابع',
  dbFile: env.DB_FILE || path.join(ROOT, 'data', 'mutabi.db'),
  jwtSecret,
  jwtTtl: env.JWT_TTL || '12h',
  cookieName: 'mutabi_session',
  secureCookies: bool(env.SECURE_COOKIES, env.NODE_ENV === 'production'),
  bcryptRounds: int(env.BCRYPT_ROUNDS, 10),

  /* Scheduler. The tick drives reminders, overdue detection and escalation.
     A short interval is fine — every pass is a handful of indexed queries. */
  tickSeconds: int(env.TICK_SECONDS, 60),
  schedulerEnabled: bool(env.SCHEDULER_ENABLED, true),

  mail: {
    /* transport: smtp | json | stream
       json  — nothing leaves the process; every message is still written to the
               email log, which is what the test suite and a dev box want.
       smtp  — a real server, configured below. */
    transport: (env.MAIL_TRANSPORT || (env.SMTP_HOST ? 'smtp' : 'json')).toLowerCase(),
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 587) === 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Mutabi <no-reply@mutabi.local>',
    replyTo: env.MAIL_REPLY_TO || '',
    maxAttempts: int(env.MAIL_MAX_ATTEMPTS, 3),
    retrySeconds: int(env.MAIL_RETRY_SECONDS, 120),
    /* Guard rail for staging: when set, every recipient is rewritten to this
       address so a copy of production data cannot mail real people. */
    redirectAll: env.MAIL_REDIRECT_ALL || '',
  },

  defaults: {
    reminderLeadDays: int(env.REMINDER_LEAD_DAYS, 1),
    escalationDays: int(env.ESCALATION_DAYS, 3),
    quietHours: { from: env.QUIET_FROM || '21:00', to: env.QUIET_TO || '07:00' },
  },
};

export default config;
