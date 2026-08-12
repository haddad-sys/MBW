/* The ring.
   Synthesised with the Web Audio API rather than shipped as a file: no asset to
   load, no format to negotiate, and the tone can change with the severity of
   what arrived.

   Browsers refuse to start an AudioContext until the person has interacted with
   the page, so the context is created lazily and unlocked on the first gesture.
   Everything below degrades to silence rather than throwing — a blocked chime
   must never break the notification that carried it. */

let ctx = null;
let unlocked = false;
let muted = localStorage.getItem('mutabi.mute') === '1';
const listeners = new Set();

function context() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

export function isSupported() {
  return !!(window.AudioContext || window.webkitAudioContext);
}

export function isUnlocked() {
  return unlocked && ctx?.state === 'running';
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  localStorage.setItem('mutabi.mute', muted ? '1' : '0');
  notify();
}

function notify() {
  for (const fn of listeners) {
    try { fn({ unlocked: isUnlocked(), muted, supported: isSupported() }); } catch { /* a bad listener is not our problem */ }
  }
}

export function onRingState(fn) {
  listeners.add(fn);
  fn({ unlocked: isUnlocked(), muted, supported: isSupported() });
  return () => listeners.delete(fn);
}

/** Resumes the audio context. Must be called from inside a user gesture. */
export async function unlock() {
  const c = context();
  if (!c) return false;
  try {
    if (c.state === 'suspended') await c.resume();
    unlocked = c.state === 'running';
  } catch {
    unlocked = false;
  }
  notify();
  return unlocked;
}

/* Any real click counts as the unlocking gesture, so by the time the first
   notification arrives the chime is usually already permitted. */
export function armAutoUnlock() {
  const handler = () => { unlock(); };
  for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(evt, handler, { once: false, passive: true });
  }
  return handler;
}

function tone(c, { freq, start, duration, gain = 0.16, type = 'sine' }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  /* A short attack and an exponential tail: a bell, not a beep. */
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const PATTERNS = {
  /* Two rising notes — pleasant, hard to mistake for a system sound. */
  default: [
    { freq: 880.0, offset: 0, duration: 0.28, gain: 0.14 },
    { freq: 1318.5, offset: 0.11, duration: 0.42, gain: 0.11 },
  ],
  /* Three insistent notes for work that is already late. */
  urgent: [
    { freq: 987.8, offset: 0, duration: 0.2, gain: 0.16 },
    { freq: 987.8, offset: 0.17, duration: 0.2, gain: 0.16 },
    { freq: 1318.5, offset: 0.34, duration: 0.5, gain: 0.14 },
  ],
  /* A low, single note for routine updates. */
  soft: [
    { freq: 659.3, offset: 0, duration: 0.32, gain: 0.1 },
  ],
};

const URGENT_KINDS = new Set(['overdue', 'escalation', 'approval']);
const SOFT_KINDS = new Set(['comment', 'status', 'update', 'watch', 'complete']);

export function patternForKind(kind) {
  if (URGENT_KINDS.has(kind)) return 'urgent';
  if (SOFT_KINDS.has(kind)) return 'soft';
  return 'default';
}

/**
 * Plays the chime. Returns true when a sound was actually produced, so the
 * caller can fall back to a purely visual cue.
 */
export function ring(kind = 'default') {
  if (muted) return false;
  const c = context();
  if (!c) return false;
  if (c.state !== 'running') {
    /* Not unlocked yet: ask, and let this one arrive silently. */
    unlock();
    return false;
  }
  const pattern = PATTERNS[patternForKind(kind)] || PATTERNS.default;
  const start = c.currentTime + 0.01;
  try {
    for (const note of pattern) {
      tone(c, { freq: note.freq, start: start + note.offset, duration: note.duration, gain: note.gain });
    }
    return true;
  } catch {
    return false;
  }
}

/* Desktop notifications sit next to the ring: same trigger, different surface,
   and the same rule that a refusal is not an error. */
export function desktopSupported() {
  return typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function';
}

export function desktopPermission() {
  try { return desktopSupported() ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
}

export async function requestDesktopPermission() {
  if (!desktopSupported()) return 'unsupported';
  try {
    const result = Notification.requestPermission();
    return result && typeof result.then === 'function' ? await result : result;
  } catch {
    return 'unsupported';
  }
}

export function showDesktop(title, body, tag) {
  if (desktopPermission() !== 'granted') return false;
  try {
    const n = new Notification(title, { body: String(body || '').slice(0, 180), tag: tag || 'mutabi', renotify: false });
    n.onclick = () => { try { window.focus(); n.close(); } catch { /* closed already */ } };
    return true;
  } catch {
    return false;
  }
}
