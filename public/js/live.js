import { getToken } from './api.js';

/* The live channel.
   EventSource already reconnects on its own, but it gives up on a hard error
   (a 401 after a session expires, for instance), so a bounded backoff is added
   on top and the connection state is published for the UI to show. */

let source = null;
let retry = 0;
let closedByUs = false;
const handlers = new Map();
const stateListeners = new Set();
let connected = false;

function emit(event, payload) {
  for (const fn of handlers.get(event) || []) {
    try { fn(payload); } catch (err) { console.error('[mutabi] handler failed', event, err); }
  }
}

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  for (const fn of stateListeners) {
    try { fn(connected); } catch { /* ignore */ }
  }
}

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event)?.delete(fn);
}

export function onConnectionChange(fn) {
  stateListeners.add(fn);
  fn(connected);
  return () => stateListeners.delete(fn);
}

export function isConnected() {
  return connected;
}

export function connect() {
  disconnect();
  closedByUs = false;
  const token = getToken();
  const url = `/api/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  try {
    source = new EventSource(url, { withCredentials: true });
  } catch {
    scheduleReconnect();
    return null;
  }

  source.addEventListener('open', () => { retry = 0; setConnected(true); });
  source.addEventListener('hello', (e) => {
    retry = 0;
    setConnected(true);
    emit('hello', parse(e));
  });
  source.addEventListener('notification', (e) => emit('notification', parse(e)));
  source.addEventListener('badge', (e) => emit('badge', parse(e)));
  source.addEventListener('error', () => {
    setConnected(false);
    /* readyState CLOSED means it will not retry by itself. */
    if (source && source.readyState === EventSource.CLOSED) scheduleReconnect();
  });
  return source;
}

function parse(event) {
  try { return JSON.parse(event.data); } catch { return {}; }
}

function scheduleReconnect() {
  if (closedByUs) return;
  disconnect();
  retry = Math.min(retry + 1, 6);
  const delay = Math.min(30000, 1000 * 2 ** retry);
  setTimeout(() => { if (!closedByUs) connect(); }, delay);
}

export function disconnect() {
  if (source) {
    try { source.close(); } catch { /* already closed */ }
    source = null;
  }
  setConnected(false);
}

export function shutdown() {
  closedByUs = true;
  disconnect();
}
