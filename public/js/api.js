/* The session token lives in an httpOnly cookie set at sign-in; the copy kept
   here is only for EventSource, which cannot send an Authorization header. */

let token = localStorage.getItem('mutabi.token') || '';

export function setToken(value) {
  token = value || '';
  if (token) localStorage.setItem('mutabi.token', token);
  else localStorage.removeItem('mutabi.token');
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
    this.code = body?.error || 'error';
  }
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  }
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  del: (p) => request('DELETE', p),

  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout', {}),
  me: () => request('GET', '/api/auth/me'),
  bootstrap: () => request('GET', '/api/meta/bootstrap'),

  tasks: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== false));
    return request('GET', `/api/tasks${qs.toString() ? `?${qs}` : ''}`);
  },
  task: (id) => request('GET', `/api/tasks/${encodeURIComponent(id)}`),
  createTask: (payload) => request('POST', '/api/tasks', payload),
  updateTask: (id, patch) => request('PATCH', `/api/tasks/${encodeURIComponent(id)}`, patch),
  deleteTask: (id) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}`),

  watchers: (id) => request('GET', `/api/tasks/${encodeURIComponent(id)}/watchers`),
  addWatcher: (id, user) => request('POST', `/api/tasks/${encodeURIComponent(id)}/watchers`, user ? { user } : {}),
  removeWatcher: (id, user) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}/watchers/${encodeURIComponent(user)}`),

  comment: (id, text) => request('POST', `/api/tasks/${encodeURIComponent(id)}/comments`, { text }),
  addChecklist: (id, text) => request('POST', `/api/tasks/${encodeURIComponent(id)}/checklist`, { text }),
  toggleChecklist: (id, item, done) => request('PATCH', `/api/tasks/${encodeURIComponent(id)}/checklist/${encodeURIComponent(item)}`, { done }),
  deleteChecklist: (id, item) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}/checklist/${encodeURIComponent(item)}`),
  addReminder: (id, at, note) => request('POST', `/api/tasks/${encodeURIComponent(id)}/reminders`, { at, note }),
  deleteReminder: (id, rem) => request('DELETE', `/api/tasks/${encodeURIComponent(id)}/reminders/${encodeURIComponent(rem)}`),
  history: (id) => request('GET', `/api/tasks/${encodeURIComponent(id)}/history`),

  notifications: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return request('GET', `/api/notifications${qs.toString() ? `?${qs}` : ''}`);
  },
  unread: () => request('GET', '/api/notifications/count'),
  markRead: (ids) => request('POST', '/api/notifications/read', { ids }),
  markAllRead: () => request('POST', '/api/notifications/read-all', {}),
  testNotification: () => request('POST', '/api/notifications/test', {}),

  savePrefs: (prefs) => request('PUT', '/api/auth/me/prefs', prefs),
  saveProfile: (profile) => request('PUT', '/api/auth/me/profile', profile),
  changePassword: (current, next) => request('POST', '/api/auth/me/password', { current, next }),

  emails: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return request('GET', `/api/admin/emails${qs.toString() ? `?${qs}` : ''}`);
  },
  verifyMail: () => request('GET', '/api/admin/mail/verify'),
  flushMail: () => request('POST', '/api/admin/mail/flush', {}),
  runTick: () => request('POST', '/api/admin/tick', {}),
  adminUsers: () => request('GET', '/api/admin/users'),
};

export default api;
