/* ===========================================================================
   متابِع — application state.
   Everything authoritative lives on the server; this holds the last snapshot
   plus the navigation stack, and knows how to refresh itself.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, api = M.api;

  var S = {
    ready: false,
    user: null,
    perms: null,
    cfg: { priorities: [], statuses: [], types: [], defaultCats: [] },
    entities: [],
    team: [],
    issues: [],
    labels: null,
    pendingRegistrations: 0,
    unread: 0,
    org: 'متابِع',
    live: null,   /* null = not connected yet, true = live, false = dropped */
    stack: [{ view: 'home' }],
    booting: true,
  };

  /* Config lookups, rebuilt whenever the configuration changes. */
  function C() {
    var out = { S: {}, P: {}, E: {}, statuses: S.cfg.statuses || [], priorities: S.cfg.priorities || [], types: S.cfg.types || [] };
    out.statuses.forEach(function (s) { out.S[s.key] = Object.assign({}, s, M.pal(s.color)); });
    out.priorities.forEach(function (p) { out.P[p.key] = Object.assign({}, p, M.pal(p.color)); });
    out.types.forEach(function (t) {
      out.E[t.key] = Object.assign({}, t, M.pal(t.color), { icon: M.TYPE_ICON[t.icon] || 'boxes' });
    });
    return out;
  }
  function P() { return S.perms || {}; }
  function isDone(key) { var s = (S.cfg.statuses || []).find(function (x) { return x.key === key; }); return !!(s && s.done); }
  function isParked(key) { var s = (S.cfg.statuses || []).find(function (x) { return x.key === key; }); return !!(s && s.parked); }
  function isActive(i) { return !isDone(i.status) && !isParked(i.status); }
  function isOD(i) { return isActive(i) && !!i.dueDate && M.daysUntil(i.dueDate) < 0; }
  function dueLabel(i) {
    if (isDone(i.status)) return { text: 'تم الإنجاز', cls: 'text-emerald-600' };
    if (!i.dueDate) return { text: 'بدون تاريخ', cls: 'text-slate-400' };
    var d = M.daysUntil(i.dueDate);
    if (d < 0) return { text: 'متأخرة ' + M.plD(d), cls: 'text-rose-600' };
    if (d === 0) return { text: 'تستحق اليوم', cls: 'text-amber-600' };
    if (d === 1) return { text: 'تستحق غداً', cls: 'text-amber-600' };
    return { text: 'خلال ' + M.plD(d), cls: 'text-slate-400' };
  }

  function entity(id) { return S.entities.find(function (e) { return e.id === id; }) || null; }
  function issue(id) { return S.issues.find(function (i) { return i.id === id; }) || null; }
  function categoriesOf(id) { var e = entity(id); return (e && e.categories) || []; }

  /* ── loading ──────────────────────────────────── */
  function bootstrap() {
    return api.get('/api/bootstrap').then(function (data) {
      S.user = data.user;
      S.perms = data.perms;
      S.cfg = data.cfg;
      S.entities = data.entities || [];
      S.team = data.team || [];
      S.labels = data.labels;
      S.pendingRegistrations = data.pendingRegistrations || 0;
      S.unread = data.unread || 0;
      S.org = data.org || 'متابِع';
      return data;
    });
  }
  function loadIssues() {
    return api.get('/api/issues').then(function (data) { S.issues = data.issues || []; return S.issues; });
  }
  function refresh() {
    return Promise.all([bootstrap(), loadIssues()]);
  }
  /* Applies a single issue the server just returned, without a full reload. */
  function mergeIssue(next) {
    if (!next) return;
    var i = S.issues.findIndex(function (x) { return x.id === next.id; });
    if (i === -1) S.issues.unshift(next);
    else S.issues[i] = Object.assign({}, S.issues[i], next);
  }
  function dropIssue(id) {
    S.issues = S.issues.filter(function (x) { return x.id !== id; });
  }

  window.ST = {
    S: S, C: C, P: P,
    isDone: isDone, isParked: isParked, isActive: isActive, isOD: isOD, dueLabel: dueLabel,
    entity: entity, issue: issue, categoriesOf: categoriesOf,
    bootstrap: bootstrap, loadIssues: loadIssues, refresh: refresh,
    mergeIssue: mergeIssue, dropIssue: dropIssue
  };
}());
