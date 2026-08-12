import config from '../config.js';
import { isValidClock } from './time.js';

/* One shape for notification preferences, used by the API, the notifier, the
   mailer and the browser. Anything missing falls back to the default rather
   than disabling delivery, so a half-written preference blob never silences a
   person by accident. */
export const NOTIFY_EVENTS = [
  { key: 'assign', kinds: ['assign', 'reassign'] },
  { key: 'due', kinds: ['reminder', 'due', 'dependency'] },
  { key: 'overdue', kinds: ['overdue'] },
  { key: 'mention', kinds: ['mention', 'comment'] },
  { key: 'approval', kinds: ['approval'] },
  { key: 'escalation', kinds: ['escalation', 'rule'] },
  { key: 'watch', kinds: ['watch', 'status', 'complete', 'update'] },
];

export const NOTIFY_KINDS = NOTIFY_EVENTS.flatMap((e) => e.kinds);

export const KIND_EVENT = Object.fromEntries(
  NOTIFY_EVENTS.flatMap((e) => e.kinds.map((k) => [k, e.key])),
);

/* Escalations and approvals are not negotiable: they ignore quiet hours and the
   "critical only" email mode, because the whole point of an escalation is that
   somebody stopped reading their notifications. */
export const MANDATORY_KINDS = new Set(['escalation', 'approval']);

export const DEFAULT_PREFS = {
  email: { mode: 'all', events: eventMap(true) },       // all | critical | off
  inApp: { enabled: true, sound: true, desktop: false, events: eventMap(true) },
  quiet: { enabled: true, from: config.defaults.quietHours.from, to: config.defaults.quietHours.to },
  digest: false,
};

function eventMap(value) {
  return Object.fromEntries(NOTIFY_EVENTS.map((e) => [e.key, value]));
}

function mergeEvents(base, override) {
  const out = { ...base };
  for (const e of NOTIFY_EVENTS) {
    const v = override?.[e.key];
    if (typeof v === 'boolean') out[e.key] = v;
  }
  return out;
}

export function normalizePrefs(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  obj = obj && typeof obj === 'object' ? obj : {};
  const email = obj.email && typeof obj.email === 'object' ? obj.email : {};
  const inApp = obj.inApp && typeof obj.inApp === 'object' ? obj.inApp : {};
  const quiet = obj.quiet && typeof obj.quiet === 'object' ? obj.quiet : {};
  const mode = ['all', 'critical', 'off'].includes(email.mode) ? email.mode : DEFAULT_PREFS.email.mode;

  return {
    email: { mode, events: mergeEvents(DEFAULT_PREFS.email.events, email.events) },
    inApp: {
      enabled: typeof inApp.enabled === 'boolean' ? inApp.enabled : DEFAULT_PREFS.inApp.enabled,
      sound: typeof inApp.sound === 'boolean' ? inApp.sound : DEFAULT_PREFS.inApp.sound,
      desktop: typeof inApp.desktop === 'boolean' ? inApp.desktop : DEFAULT_PREFS.inApp.desktop,
      events: mergeEvents(DEFAULT_PREFS.inApp.events, inApp.events),
    },
    quiet: {
      enabled: typeof quiet.enabled === 'boolean' ? quiet.enabled : DEFAULT_PREFS.quiet.enabled,
      from: isValidClock(quiet.from) ? quiet.from : DEFAULT_PREFS.quiet.from,
      to: isValidClock(quiet.to) ? quiet.to : DEFAULT_PREFS.quiet.to,
    },
    digest: typeof obj.digest === 'boolean' ? obj.digest : DEFAULT_PREFS.digest,
  };
}

export function eventForKind(kind) {
  return KIND_EVENT[kind] || 'watch';
}
