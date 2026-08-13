/* Server-sent events. One map of userId -> open responses; a person with three
   tabs open has three entries and every one of them rings. */

const clients = new Map();
let heartbeat = null;
const HEARTBEAT_MS = 25000;

function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const set of clients.values()) {
      for (const res of set) {
        try { res.write(': ping\n\n'); } catch { /* the close handler cleans up */ }
      }
    }
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
}

export function subscribe(userId, res) {
  ensureHeartbeat();
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => unsubscribe(userId, res);
}

export function unsubscribe(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function write(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function publish(userId, event, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const res of [...set]) {
    if (write(res, event, data)) delivered += 1;
    else unsubscribe(userId, res);
  }
  return delivered;
}

export function connectionCount(userId) {
  return userId ? (clients.get(userId)?.size || 0) : [...clients.values()].reduce((a, s) => a + s.size, 0);
}

export function shutdownRealtime() {
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  for (const [, set] of clients) {
    for (const res of set) { try { res.end(); } catch { /* already gone */ } }
  }
  clients.clear();
}
