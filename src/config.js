import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

/* A .env file is optional. Anything already in the environment wins, so a
   container can inject secrets without writing them to disk. */
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
loadDotEnv(process.env.MUTABEA_ENV_FILE || path.join(ROOT, '.env'));

const env = process.env;
const bool = (v, fallback) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, fallback) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : fallback);

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  if (env.NODE_ENV === 'production') {
    console.warn('[mutabea] JWT_SECRET is not set — sessions will not survive a restart.');
  }
}

export const config = {
  env: env.NODE_ENV || 'development',
  port: int(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  appUrl: (env.APP_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, ''),
  orgName: env.ORG_NAME || 'متابِع',
  dbFile: env.DB_FILE || path.join(ROOT, 'data', 'mutabea.db'),
  jwtSecret,
  jwtTtl: env.JWT_TTL || '12h',
  cookieName: 'mutabea_session',
  secureCookies: bool(env.SECURE_COOKIES, env.NODE_ENV === 'production'),
  bcryptRounds: int(env.BCRYPT_ROUNDS, 10),

  /* Registration. Self-service can be closed entirely, or limited to a list of
     email domains, and every application still waits for an approval. */
  registrationOpen: bool(env.REGISTRATION_OPEN, true),
  allowedDomains: (env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),

  /* The first administrator, created on an empty database so somebody can
     approve the first application. */
  owner: {
    username: env.OWNER_USERNAME || 'manager',
    password: env.OWNER_PASSWORD || 'Manager@2026',
    name: env.OWNER_NAME || 'د. هاني',
    email: env.OWNER_EMAIL || 'hani.alhaddad@gmail.com',
  },
  seedDemo: bool(env.SEED_DEMO, true),

  tickSeconds: int(env.TICK_SECONDS, 300),
  schedulerEnabled: bool(env.SCHEDULER_ENABLED, true),
  dueSoonDays: int(env.DUE_SOON_DAYS, 1),

  /* Uploads are stored inline, so a ceiling matters. */
  maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 3 * 1024 * 1024),
  jsonLimit: env.JSON_LIMIT || '12mb',

  mail: {
    transport: (env.MAIL_TRANSPORT || (env.SMTP_HOST ? 'smtp' : 'json')).toLowerCase(),
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 587) === 465),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'متابِع <no-reply@mutabea.local>',
    replyTo: env.MAIL_REPLY_TO || '',
    maxAttempts: int(env.MAIL_MAX_ATTEMPTS, 3),
    retrySeconds: int(env.MAIL_RETRY_SECONDS, 120),
    /* Staging guard rail: rewrite every recipient to one address. */
    redirectAll: env.MAIL_REDIRECT_ALL || '',
  },
};

export default config;
