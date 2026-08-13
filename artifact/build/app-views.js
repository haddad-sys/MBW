/* ===========================================================================
   متابِع — view layer.
   Every screen from the delivered build, rendered without a framework: the
   page is rebuilt from state on each structural change, while typing writes
   straight to the frame's local state so an input never loses focus.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT;
  var toAr = M.toAr, uid = M.uid, sg = M.sg, ss = M.ss, sd = M.sd, fmtDate = M.fmtDate;
  var isDone = M.isDone, isParked = M.isParked, isActive = M.isActive, isOD = M.isOD, dueLabel = M.dueLabel;
  var resolvePerms = M.resolvePerms, buildC = M.buildC;
  var CHIP = M.CHIP, TINT = M.TINT, DOT = M.DOT, HEX = M.HEX, COLORS = M.COLORS;

  /* ── DOM ──────────────────────────────────────── */
  function h(tag, attrs, kids) {
    var n = document.createElement(tag), a = attrs || {}, k;
    for (k in a) {
      var v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, String(v));
    }
    var list = Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids]);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c === null || c === undefined || c === false || c === '') continue;
      /* Text is set as text, never parsed — a title or comment cannot become markup. */
      n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function mount(node, kids) {
    while (node.firstChild) node.removeChild(node.firstChild);
    var list = Array.isArray(kids) ? kids : [kids];
    for (var i = 0; i < list.length; i++) if (list[i]) node.appendChild(list[i]);
    return node;
  }

  /* Same icon set as the delivered build, drawn inline. */
  var ICONS = {
    home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    baby: '<path d="M9 12h.01M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
    food: '<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v8a3 3 0 0 1-3 3"/><path d="M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9"/>',
    boxes: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    shopping: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4l9-9z"/><path d="M14.7 6.3 18 3l3 3-3.3 3.3"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-1L3 20l1-3.8A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    fileDown: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v5M10 15l2 2 2-2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    checkSquare: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    barChart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5M12 4v12"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'
  };
  function ic(name, size, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 18);
    s.setAttribute('height', size || 18);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name] || ICONS.list;
    s.style.flexShrink = '0';
    return s;
  }

  /* ── charts: the recharts views, drawn directly ── */
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) n.setAttribute(k, String(attrs[k]));
    return n;
  }
  function donut(data, height) {
    height = height || 190;
    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    var box = h('div', { style: { width: '100%', height: height + 'px' } });
    if (!total) return box;
    var size = height, cx = size / 2, cy = size / 2, rOut = size * 0.38, rIn = size * 0.22;
    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: '100%', height: '100%' });
    var angle = -Math.PI / 2;
    data.forEach(function (d) {
      var frac = d.value / total;
      var sweep = frac * Math.PI * 2;
      var end = angle + sweep;
      if (frac >= 0.9999) {
        var ring = svgEl('circle', { cx: cx, cy: cy, r: (rOut + rIn) / 2, fill: 'none', stroke: d.color, 'stroke-width': rOut - rIn });
        svg.appendChild(ring);
      } else {
        var large = sweep > Math.PI ? 1 : 0;
        var x1 = cx + rOut * Math.cos(angle), y1 = cy + rOut * Math.sin(angle);
        var x2 = cx + rOut * Math.cos(end), y2 = cy + rOut * Math.sin(end);
        var x3 = cx + rIn * Math.cos(end), y3 = cy + rIn * Math.sin(end);
        var x4 = cx + rIn * Math.cos(angle), y4 = cy + rIn * Math.sin(angle);
        var dPath = 'M' + x1 + ' ' + y1 + ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2
          + ' L' + x3 + ' ' + y3 + ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 + ' Z';
        var p = svgEl('path', { d: dPath, fill: d.color, stroke: '#fff', 'stroke-width': 2 });
        p.appendChild(svgEl('title', {})).textContent = d.name + ': ' + toAr(d.value);
        svg.appendChild(p);
      }
      angle = end;
    });
    var label = svgEl('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': size * 0.16, 'font-weight': '700', fill: '#334155' });
    label.textContent = toAr(total);
    svg.appendChild(label);
    box.appendChild(svg);
    return box;
  }
  function hbars(data) {
    var max = data.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    return h('div', { class: 'space-y-2' }, data.map(function (d) {
      return h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'text-xs text-slate-600 flex-shrink-0 truncate', style: { width: '62px' } }, d.name),
        h('div', { class: 'flex-1 bg-slate-100 rounded-full', style: { height: '10px' } }, [
          h('div', { class: 'rounded-full', style: { height: '10px', width: Math.round(d.value / max * 100) + '%', background: d.color || '#0ea5e9', minWidth: d.value ? '6px' : '0' } })
        ]),
        h('div', { class: 'text-xs text-slate-400', style: { width: '20px' } }, toAr(d.value))
      ]);
    }));
  }
  function vbars(data, height) {
    height = height || 150;
    var max = data.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    return h('div', { class: 'flex items-end justify-center gap-3', style: { height: height + 'px' } },
      data.map(function (d) {
        var barH = Math.max(4, Math.round(d.value / max * (height - 42)));
        return h('div', { class: 'flex flex-col items-center gap-1', style: { flex: '1', maxWidth: '68px' } }, [
          h('div', { class: 'text-xs text-slate-600 font-semibold' }, toAr(d.value)),
          h('div', { class: 'w-full rounded', style: { height: barH + 'px', background: d.color || '#0ea5e9', borderRadius: '6px 6px 0 0' } }),
          h('div', { class: 'text-xs text-slate-500 truncate w-full text-center' }, d.name)
        ]);
      }));
  }

  /* ── application state ────────────────────────── */
  var S = {
    auth: null, ents: [], issues: [], team: [], notif: M.DEF_NOTIF, ejs: M.DEF_EJS,
    accounts: M.ACCOUNTS, cfg: M.DEF_CFG, stack: [{ view: 'home' }], ready: false, panel: false
  };
  var root = document.getElementById('root');
  var toastTimer = null;

  function toast(msg) {
    var host = document.getElementById('toastHost');
    if (!host) return;
    mount(host, h('div', { class: 'bg-slate-900 text-white text-sm rounded-xl px-4 py-2 shadow-lg max-w-xs text-center' }, msg));
    host.className = 'fixed bottom-24 left-0 right-0 flex justify-center z-50 pointer-events-none px-4';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { mount(host, []); }, 2400);
  }
  window.__mutabeaToast = toast;

  var C = function () { return buildC(S.cfg); };
  var P = function () { return resolvePerms(S.auth); };
  var vE = function () { return P().scope === 'all' ? S.ents : S.ents.filter(function (e) { return e.id === (S.auth && S.auth.entityId); }); };
  var vI = function () { return P().scope === 'all' ? S.issues : S.issues.filter(function (i) { return i.entityId === (S.auth && S.auth.entityId); }); };

  function go(view, param) { S.stack.push({ view: view, param: param }); window.scrollTo(0, 0); render(); }
  function back() { if (S.stack.length > 1) S.stack.pop(); window.scrollTo(0, 0); render(); }
  function goTab(view, param) { S.stack = [{ view: view, param: param }]; window.scrollTo(0, 0); render(); }
  function replace(view, param) { S.stack[S.stack.length - 1] = { view: view, param: param }; window.scrollTo(0, 0); render(); }
  function cur() { return S.stack[S.stack.length - 1]; }
  function local(defaults) {
    var f = cur();
    if (!f.local) f.local = Object.assign({}, defaults);
    return f.local;
  }
  /* A settings sub-panel lives inside the settings frame, so it needs its own
     slot — otherwise every panel would share one bag of state. */
  function sub(name, defaults) {
    var f = cur();
    if (!f.locals) f.locals = {};
    if (!f.locals[name]) f.locals[name] = Object.assign({}, defaults);
    return f.locals[name];
  }

  /* Every notification the system raises passes through here, so the email
     rule, the bell and the chime can never disagree about what happened. */
  function notify(eventType, issue) {
    var cfgC = buildC(S.cfg);
    var ent = S.ents.find(function (e) { return e.id === (issue && issue.entityId); });
    var allowed = S.notif && S.notif.enabled && S.notif.types && S.notif.types[eventType];
    if (allowed) {
      M.pushAlert(eventType, issue, ent && ent.name);
      if (S.notif.sound !== false) M.Ring.play(!!M.URGENT_EVENTS[eventType]);
      ringBell();
    }
    return M.sendEmailNotif(S.notif, S.ejs, cfgC, eventType, issue, S.ents, S.auth && S.auth.name);
  }
  function ringBell() {
    var b = document.getElementById('bellBtn');
    if (!b) return;
    b.classList.remove('ringing');
    void b.offsetWidth;
    b.classList.add('ringing');
    setTimeout(function () { b.classList.remove('ringing'); }, 1000);
  }

  /* ── persistence helpers ──────────────────────── */
  function pI(v) { S.issues = v; return ss('issues', v); }
  function pE(v) { S.ents = v; return ss('entities', v); }
  function pT(v) { S.team = v; return ss('team', v); }
  function pN(v) { S.notif = v; return ss('notif', v); }
  function pEjs(v) { S.ejs = v; return ss('emailjs', v); }
  function pAcc(v) { S.accounts = v; return ss('accounts', v); }
  function pCfg(v) { S.cfg = v; M.setCfgCats(v.defaultCats || M.DEF_CATS); return ss('cfg', v); }

  /* ── issue operations ─────────────────────────── */
  function createIssue(data, bFiles) {
    var now = Date.now();
    var openK = (S.cfg.statuses.find(function (s) { return !s.done && !s.parked && !s.gate; }) || S.cfg.statuses[0]).key;
    var ni = Object.assign({ id: uid() }, data, {
      status: openK, reporter: S.auth && S.auth.name, createdAt: now, updatedAt: now,
      beforeCount: bFiles.length, afterCount: 0, comments: [], checklist: [],
      tags: data.tags || [], repeat: data.repeat || 'none',
      activity: [{ id: uid(), at: now, by: S.auth && S.auth.name, note: 'تم إنشاء الملاحظة' }]
    });
    return pI(S.issues.concat([ni])).then(function () {
      return bFiles.length ? Promise.all(bFiles.map(function (f) { return M.compress(f); })) : [];
    }).then(function (imgs) {
      return ss('photos:' + ni.id, { before: (imgs || []).filter(Boolean), after: [] });
    }).then(function () {
      notify('taskAdded', ni);
      if (ni.assignee) notify('assignment', ni);
      return ni.id;
    });
  }
  function updIssue(id, patch, note) {
    var now = Date.now();
    var list = S.issues.map(function (i) {
      if (i.id !== id) return i;
      var u = Object.assign({}, i, patch, { updatedAt: now });
      if (note) u.activity = i.activity.concat([{ id: uid(), at: now, by: S.auth && S.auth.name, note: note }]);
      return u;
    });
    return pI(list).then(function () { return list.find(function (i) { return i.id === id; }); });
  }
  function delIssue(id) {
    return sd('photos:' + id).then(function () {
      return pI(S.issues.filter(function (i) { return i.id !== id; }));
    });
  }
  function addComment(id, text) {
    var issue = S.issues.find(function (i) { return i.id === id; });
    if (!issue) return Promise.resolve();
    var c = { id: uid(), author: S.auth && S.auth.name, mgr: !!resolvePerms(S.auth).approve, text: text, at: Date.now() };
    return updIssue(id, { comments: issue.comments.concat([c]) }, null).then(function (u) { notify('newComment', u); });
  }
  function addChk(id, text) {
    var i = S.issues.find(function (x) { return x.id === id; });
    if (!i) return Promise.resolve();
    return updIssue(id, { checklist: i.checklist.concat([{ id: uid(), text: text, done: false }]) }, null);
  }
  function togChk(id, cid) {
    var i = S.issues.find(function (x) { return x.id === id; });
    if (!i) return Promise.resolve();
    return updIssue(id, {
      checklist: i.checklist.map(function (c) { return c.id === cid ? Object.assign({}, c, { done: !c.done }) : c; })
    }, null);
  }
  function delChk(id, cid) {
    var i = S.issues.find(function (x) { return x.id === id; });
    if (!i) return Promise.resolve();
    return updIssue(id, { checklist: i.checklist.filter(function (c) { return c.id !== cid; }) }, null);
  }

  /* Closing a repeating task both closes it and lays down the next one. */
  function moveStatus(id, toKey, note) {
    var issue = S.issues.find(function (i) { return i.id === id; });
    if (!issue || !toKey) return Promise.resolve();
    var now = Date.now();
    var target = S.cfg.statuses.find(function (s) { return s.key === toKey; });
    if (target && target.done && issue.repeat !== 'none') {
      var shift = issue.repeat === 'weekly' ? 7 : 30;
      var openK = (S.cfg.statuses.find(function (s) { return !s.done && !s.parked; }) || target).key;
      var spawn = Object.assign({}, issue, {
        id: uid(), status: openK, dueDate: (issue.dueDate || now) + shift * 86400000,
        comments: [], checklist: issue.checklist.map(function (c) { return Object.assign({}, c, { done: false }); }),
        beforeCount: 0, afterCount: 0, createdAt: now, updatedAt: now,
        activity: [{ id: uid(), at: now, by: 'النظام', note: 'أُنشئت تلقائياً (مهمة متكررة)' }]
      });
      var closed = Object.assign({}, issue, {
        status: toKey, updatedAt: now,
        activity: issue.activity.concat([{ id: uid(), at: now, by: S.auth && S.auth.name, note: note }])
      });
      return pI(S.issues.filter(function (i) { return i.id !== id; }).concat([closed, spawn]))
        .then(function () { return ss('photos:' + spawn.id, { before: [], after: [] }); })
        .then(function () {
          notify('approvedClosed', closed);
          notify('recurringSpawned', spawn);
          toast('تم وإنشاء نسخة متكررة ✓');
          back();
        });
    }
    return updIssue(id, { status: toKey }, note).then(function (u) {
      notify(target && target.done ? 'approvedClosed' : (target && target.gate ? 'pendingApproval' : 'statusChanged'), u);
      toast('تم التحديث ✓');
      render();
    });
  }
  function delEntity(eid) {
    var its = S.issues.filter(function (i) { return i.entityId === eid; });
    var chain = Promise.resolve();
    its.forEach(function (it) { chain = chain.then(function () { return sd('photos:' + it.id); }); });
    return chain.then(function () { return sd('docs:' + eid); })
      .then(function () { return pI(S.issues.filter(function (i) { return i.entityId !== eid; })); })
      .then(function () { return pE(S.ents.filter(function (e) { return e.id !== eid; })); });
  }
  function resetDemo() {
    M.listKeys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    S.cfg = M.DEF_CFG; M.setCfgCats(M.DEF_CFG.defaultCats);
    var se = M.SEED_DEFS.map(function (d) { return Object.assign({}, d, { categories: M.makeCats() }); });
    var si = M.seedIssues(se);
    S.ents = se; S.issues = si; S.team = M.DEF_TEAM.slice();
    S.notif = JSON.parse(JSON.stringify(M.DEF_NOTIF)); S.ejs = Object.assign({}, M.DEF_EJS);
    S.accounts = M.ACCOUNTS; M.setOutbox([]); M.setAlerts([]);
    return Promise.all([
      ss('entities', se), ss('issues', si), ss('team', S.team), ss('notif', S.notif),
      ss('emailjs', S.ejs), ss('accounts', S.accounts), ss('outbox', []), ss('alerts', []),
      ss('session', S.auth && S.auth.username)
    ]).then(function () { S.stack = [{ view: 'home' }]; toast('تم إعادة الضبط ✓'); render(); });
  }
  function login(u, p) {
    var a = S.accounts.find(function (x) { return x.username === u && x.password === p; });
    if (!a) return Promise.resolve(false);
    S.auth = a;
    return ss('session', u).then(function () { S.stack = [{ view: 'home' }]; render(); return true; });
  }
  function logout() {
    return sd('session').then(function () { S.auth = null; S.stack = [{ view: 'home' }]; render(); });
  }

  /* ── shared UI ────────────────────────────────── */
  function TopBar(opts) {
    return h('div', { class: 'sticky top-0 z-20 bg-gradient-to-l from-sky-500 to-blue-600 text-white px-4 pt-4 pb-3 shadow-md' }, [
      h('div', { class: 'flex items-center gap-2' }, [
        opts.onBack ? h('button', { class: 'p-1.5 rounded-xl bg-white/20 flex-shrink-0', onclick: opts.onBack, 'aria-label': 'رجوع' }, [ic('arrowRight', 18)]) : null,
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'font-bold text-lg leading-tight truncate' }, opts.title),
          opts.subtitle ? h('div', { class: 'text-xs text-sky-200' }, opts.subtitle) : null
        ]),
        opts.right ? h('div', { class: 'flex-shrink-0 flex items-center gap-1' }, opts.right) : null,
        S.auth ? bellButton() : null,
        opts.label ? h('span', { class: 'text-xs bg-white/20 px-2 py-1 rounded-lg flex-shrink-0' }, opts.label) : null
      ])
    ]);
  }
  function bellButton() {
    var n = M.unreadAlerts();
    var btn = h('button', {
      class: 'p-1.5 rounded-xl bg-white/20 flex-shrink-0 relative', id: 'bellBtn', 'aria-label': 'الإشعارات',
      onclick: function (e) { e.stopPropagation(); M.Ring.unlock(); go('alerts'); }
    }, [
      ic('bell', 18),
      n > 0 ? h('span', {
        class: 'absolute bg-rose-500 text-white rounded-full text-center',
        style: { top: '-3px', insetInlineEnd: '-3px', minWidth: '17px', height: '17px', fontSize: '10px', lineHeight: '17px', fontWeight: '700', padding: '0 3px' }
      }, toAr(n > 99 ? 99 : n)) : null
    ]);
    return btn;
  }
  function Toggle(on, onChange) {
    var knob = h('div', { class: 'bg-white rounded-full shadow mx-0.5 transition-transform' + (on ? ' translate-x-5' : ''), style: { width: '1.25rem', height: '1.25rem' } });
    return h('button', {
      class: 'rounded-full flex-shrink-0 transition-colors ' + (on ? 'bg-sky-500' : 'bg-slate-200'),
      style: { width: '2.75rem', height: '1.5rem', display: 'flex', alignItems: 'center' },
      'aria-pressed': on ? 'true' : 'false',
      onclick: function () { onChange(!on); }
    }, [knob]);
  }
  function Modal(title, body, onClose) {
    var card = h('div', {
      class: 'relative w-full max-w-md mx-auto bg-white rounded-t-3xl p-6 sUp overflow-y-auto ns',
      style: { maxHeight: '88vh' },
      onclick: function (e) { e.stopPropagation(); }
    }, [h('h3', { class: 'font-bold text-slate-800 mb-4' }, title)].concat(Array.isArray(body) ? body : [body]));
    return h('div', { class: 'fixed inset-0 z-40 flex items-end mut-overlay', onclick: onClose }, [
      h('div', { class: 'absolute inset-0 bg-black/40' }), card
    ]);
  }
  function openModal(title, body) {
    var node = Modal(title, body, close);
    function close() { node.remove(); }
    document.body.appendChild(node);
    return close;
  }
  var INP = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';
  function inputRow(labelText, node) {
    return h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, labelText), node]);
  }
  function textInput(value, onInput, attrs) {
    var n = h('input', Object.assign({ class: INP, value: value === undefined || value === null ? '' : value }, attrs || {}));
    n.addEventListener('input', function () { onInput(n.value); });
    return n;
  }

  function IssueCard(cfgC, issue, ents, onClick) {
    var ent = ents.find(function (e) { return e.id === issue.entityId; });
    var cat = ent && ent.categories.find(function (c) { return c.id === issue.categoryId; });
    var dl = dueLabel(cfgC, issue), ov = isOD(cfgC, issue);
    var p = cfgC.P[issue.priority] || { bar: 'bg-slate-300' };
    var s = cfgC.S[issue.status] || { chip: CHIP.slate, label: issue.status };
    var cd = issue.checklist.filter(function (c) { return c.done; }).length, ct = issue.checklist.length;
    var photos = (issue.beforeCount || 0) + (issue.afterCount || 0);
    return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-3 text-right flex overflow-hidden', onclick: onClick }, [
      h('div', { class: 'w-1 rounded-full flex-shrink-0 ml-2.5 self-stretch ' + p.bar }),
      h('div', { class: 'flex-1 min-w-0' }, [
        h('div', { class: 'flex items-center justify-between gap-2 mb-0.5' }, [
          h('div', { class: 'text-xs text-slate-400 truncate flex-1 min-w-0' }, ((ent && ent.name) || '') + (cat ? ' · ' + cat.name : '')),
          h('span', { class: 'text-xs border rounded-lg px-1.5 py-0.5 flex-shrink-0 ' + s.chip }, s.label)
        ]),
        h('div', { class: 'font-medium text-slate-800 text-sm leading-snug lc2 mb-1' }, [
          issue.repeat !== 'none' ? ic('refresh', 10, 'inline ml-1 text-blue-500') : null,
          issue.title
        ]),
        h('div', { class: 'flex items-center justify-between' }, [
          h('span', { class: 'text-xs ' + (ov ? 'text-rose-600' : dl.cls) }, dl.text),
          h('div', { class: 'flex gap-2 text-slate-400', style: { fontSize: '11px' } }, [
            ct > 0 ? h('span', { class: 'flex items-center gap-1' }, [ic('checkSquare', 10), toAr(cd) + '/' + toAr(ct)]) : null,
            photos > 0 ? h('span', { class: 'flex items-center gap-1' }, [ic('image', 10), toAr(photos)]) : null,
            issue.comments.length > 0 ? h('span', { class: 'flex items-center gap-1' }, [ic('message', 10), toAr(issue.comments.length)]) : null
          ])
        ])
      ])
    ]);
  }

  function BottomNav() {
    var perms = P();
    var all = [
      { k: 'home', l: 'الرئيسية', i: 'home' }, { k: 'tasks', l: 'المهام', i: 'clipboard' },
      { k: 'entities', l: 'الجهات', i: 'building' }, { k: 'library', l: 'المكتبة', i: 'library' },
      { k: 'more', l: 'المزيد', i: 'grid' }
    ];
    var tabRoot = S.stack[0] && S.stack[0].view;
    return h('div', { class: 'fixed bottom-0 z-20 max-w-md mx-auto inset-x-0 bg-white border-t border-slate-200 h-16 flex items-center' },
      all.filter(function (t) { return t.k === 'more' || (perms.tabs && perms.tabs[t.k]); }).map(function (t) {
        var a = tabRoot === t.k;
        return h('button', {
          class: 'flex-1 flex flex-col items-center justify-center gap-0.5 h-full ' + (a ? 'text-sky-600' : 'text-slate-400'),
          onclick: function () { goTab(t.k); }
        }, [ic(t.i, 20), h('span', { class: 'text-xs' }, t.l)]);
      }));
  }

  /* ── LOGIN ────────────────────────────────────── */
  function LoginPage() {
    var st = { u: '', p: '', err: '', demo: false };
    var errBox = h('div', { class: 'mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm text-center' });
    errBox.style.display = 'none';
    var demoBox = h('div', { class: 'mt-3 space-y-1.5' });
    demoBox.style.display = 'none';

    var uIn = h('input', { class: INP, value: '', autocomplete: 'username' });
    var pIn = h('input', { class: INP, type: 'password', autocomplete: 'current-password' });
    uIn.addEventListener('input', function () { st.u = uIn.value; errBox.style.display = 'none'; });
    pIn.addEventListener('input', function () { st.p = pIn.value; errBox.style.display = 'none'; });
    var submit = function () {
      login(uIn.value.trim(), pIn.value).then(function (ok) {
        if (!ok) { errBox.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة'; errBox.style.display = ''; }
      });
    };
    pIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

    M.ACCOUNTS.forEach(function (a) {
      demoBox.appendChild(h('button', {
        class: 'w-full text-right p-2.5 rounded-xl border border-slate-100 bg-slate-50',
        onclick: function () { uIn.value = a.username; pIn.value = a.password; errBox.style.display = 'none'; }
      }, [
        h('div', { class: 'font-medium text-slate-700 text-sm' }, a.name),
        h('div', { class: 'text-slate-400 text-xs', dir: 'ltr' }, a.username + ' / ' + a.password)
      ]));
    });

    return h('div', { class: 'min-h-screen bg-gradient-to-b from-sky-500 to-blue-700 flex items-center justify-center px-4' }, [
      h('div', { class: 'w-full max-w-sm' }, [
        h('div', { class: 'text-center mb-8' }, [
          h('div', { class: 'w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4' }, [ic('clipboard', 40)]),
          h('h1', { class: 'text-4xl font-extrabold text-white' }, 'متابِع'),
          h('p', { class: 'text-sky-200 mt-1 text-sm' }, 'نظام متابعة المهام والملاحظات')
        ]),
        h('div', { class: 'bg-white rounded-3xl p-6 shadow-2xl' }, [
          errBox,
          h('div', { class: 'mb-4' }, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'اسم المستخدم'), uIn]),
          h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'كلمة المرور'), pIn]),
          h('button', { class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 active:bg-sky-600', onclick: submit }, [ic('lock', 17), 'تسجيل الدخول']),
          h('button', {
            class: 'w-full mt-4 text-sm text-slate-400 flex items-center justify-center gap-1',
            onclick: function () { st.demo = !st.demo; demoBox.style.display = st.demo ? '' : 'none'; }
          }, [ic('chevronDown', 14), 'بيانات الدخول التجريبية']),
          demoBox
        ])
      ])
    ]);
  }

  /* ── HOME ─────────────────────────────────────── */
  function HomePage() {
    var cfgC = C(), week = Date.now() - 7 * 86400000;
    var list = vI(), ents = vE();
    var active = list.filter(function (i) { return isActive(cfgC, i); });
    var overdue = list.filter(function (i) { return isOD(cfgC, i); });
    var gate = list.filter(function (i) { return cfgC.S[i.status] && cfgC.S[i.status].gate; });
    var doneW = list.filter(function (i) { return isDone(cfgC, i.status) && i.updatedAt >= week; });
    var kpis = [
      { l: 'مهام نشطة', v: active.length, cls: 'bg-blue-50 text-blue-700 border-blue-100', f: 'active' },
      { l: 'متأخرة', v: overdue.length, cls: 'bg-rose-50 text-rose-700 border-rose-100', f: 'overdue' },
      { l: 'بانتظار الاعتماد', v: gate.length, cls: 'bg-amber-50 text-amber-700 border-amber-100', f: 'gate' },
      { l: 'أُنجزت هذا الأسبوع', v: doneW.length, cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', f: 'done' }
    ];
    var attn = overdue.concat(gate.filter(function (i) { return !isOD(cfgC, i); })).slice(0, 4);
    var pieData = cfgC.statuses.map(function (s) {
      return { name: s.label, value: list.filter(function (i) { return i.status === s.key; }).length, color: HEX[s.color] || '#94a3b8' };
    }).filter(function (d) { return d.value > 0; });
    var barData = ents.map(function (e) {
      return { name: e.name.length > 7 ? e.name.slice(0, 7) : e.name, value: list.filter(function (i) { return i.entityId === e.id && isActive(cfgC, i); }).length, color: '#0ea5e9' };
    });
    var priData = cfgC.priorities.map(function (p) {
      return { name: p.label, value: active.filter(function (i) { return i.priority === p.key; }).length, color: HEX[p.color] || '#94a3b8' };
    }).filter(function (d) { return d.value > 0; });

    return h('div', {}, [
      TopBar({ title: 'متابِع', subtitle: 'نظام متابعة المهام والملاحظات', label: S.auth.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', {}, [
          h('div', { class: 'text-lg font-bold text-slate-800' }, 'مرحباً 👋 ' + S.auth.name),
          h('div', { class: 'text-sm text-slate-500 mt-0.5' }, 'إليك ملخّص متابعاتك اليوم')
        ]),
        h('div', { class: 'grid grid-cols-2 gap-3' }, kpis.map(function (k) {
          return h('button', { class: 'p-3 rounded-2xl border text-right ' + k.cls, onclick: function () { goTab('tasks', k.f); } }, [
            h('div', { class: 'text-3xl font-extrabold' }, toAr(k.v)),
            h('div', { class: 'text-xs mt-0.5' }, k.l)
          ]);
        })),
        pieData.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'التوزيع حسب الحالة'),
          donut(pieData, 190),
          h('div', { class: 'flex flex-wrap gap-2 justify-center' }, pieData.map(function (d) {
            return h('span', { class: 'text-xs text-slate-500 flex items-center gap-1' }, [
              h('span', { class: 'rounded-full inline-block', style: { width: '10px', height: '10px', background: d.color } }),
              d.name + ' (' + toAr(d.value) + ')'
            ]);
          }))
        ]) : null,
        barData.some(function (d) { return d.value > 0; }) ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'المهام النشطة حسب الفرع'),
          hbars(barData)
        ]) : null,
        priData.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'المهام النشطة حسب الأولوية'),
          vbars(priData, 150)
        ]) : null,
        h('div', {}, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'إحصاءات الفروع'),
          h('div', { class: 'space-y-2' }, ents.map(function (e) {
            var ei = list.filter(function (i) { return i.entityId === e.id; });
            var tc = cfgC.E[e.type] || { icon: 'boxes', tint: TINT.slate, label: e.type };
            var aC = ei.filter(function (i) { return isActive(cfgC, i); }).length;
            var oC = ei.filter(function (i) { return isOD(cfgC, i); }).length;
            return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 text-right', onclick: function () { go('entity', e.id); } }, [
              h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + tc.tint }, [ic(tc.icon, 19)]),
              h('div', { class: 'flex-1 min-w-0' }, [
                h('div', { class: 'font-semibold text-slate-800 text-sm truncate' }, e.name),
                h('div', { class: 'text-xs text-slate-400' }, tc.label)
              ]),
              h('div', { class: 'flex flex-col items-end gap-1' }, [
                h('span', { class: 'text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg' }, toAr(aC) + ' نشطة'),
                oC > 0 ? h('span', { class: 'text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg' }, toAr(oC) + ' متأخرة') : null
              ])
            ]);
          }))
        ]),
        attn.length ? h('div', {}, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'تحتاج انتباهك'),
          h('div', { class: 'space-y-2' }, attn.map(function (i) {
            return IssueCard(cfgC, i, ents, function () { go('issue', i.id); });
          }))
        ]) : null
      ])
    ]);
  }

  /* ── TASKS ────────────────────────────────────── */
  function TasksPage() {
    var f = cur();
    var st = local({ search: '', sf: f.param || 'all', ef: 'all', pf: 'all', mode: 'list' });
    var cfgC = C(), ents = vE();
    var chips = [{ k: 'all', l: 'الكل' }, { k: 'active', l: 'نشطة' }, { k: 'overdue', l: 'متأخرة' },
      { k: 'gate', l: 'انتظار' }, { k: 'done', l: 'منجزة' }].concat(cfgC.statuses.map(function (s) { return { k: s.key, l: s.label }; }));

    var results = h('div', {});
    function match(i) {
      if (st.search) {
        var s = st.search.toLowerCase();
        if (i.title.toLowerCase().indexOf(s) === -1 &&
          (i.description || '').toLowerCase().indexOf(s) === -1 &&
          (i.assignee || '').toLowerCase().indexOf(s) === -1 &&
          !i.tags.some(function (t) { return t.indexOf(st.search) !== -1; })) return false;
      }
      if (st.ef !== 'all' && i.entityId !== st.ef) return false;
      if (st.pf !== 'all' && i.priority !== st.pf) return false;
      if (st.sf === 'overdue') return isOD(cfgC, i);
      if (st.sf === 'active') return isActive(cfgC, i);
      if (st.sf === 'gate') return !!(cfgC.S[i.status] && cfgC.S[i.status].gate);
      if (st.sf === 'done') return isDone(cfgC, i.status);
      if (st.sf !== 'all') return i.status === st.sf;
      return true;
    }
    function drawResults() {
      var sorted = vI().filter(match).sort(function (a, b) {
        var ad = isDone(cfgC, a.status) ? 1 : 0, bd = isDone(cfgC, b.status) ? 1 : 0;
        if (ad !== bd) return ad - bd;
        var ao = isOD(cfgC, a) ? -1 : 0, bo = isOD(cfgC, b) ? -1 : 0;
        if (ao !== bo) return ao - bo;
        return (a.dueDate || 0) - (b.dueDate || 0);
      });
      if (st.mode === 'list') {
        mount(results, [
          h('div', { class: 'text-xs text-slate-400 mb-2' }, toAr(sorted.length) + ' ملاحظة'),
          h('div', { class: 'space-y-2' }, sorted.length
            ? sorted.map(function (i) { return IssueCard(cfgC, i, ents, function () { go('issue', i.id); }); })
            : [h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد ملاحظات')])
        ]);
      } else {
        mount(results, h('div', { class: 'flex gap-3 overflow-x-auto ns pb-4' }, cfgC.statuses.map(function (s) {
          var col = sorted.filter(function (i) { return i.status === s.key; }).sort(function (a, b) { return (a.dueDate || 0) - (b.dueDate || 0); });
          return h('div', { class: 'flex-shrink-0 w-60' }, [
            h('div', { class: 'flex items-center gap-2 mb-2' }, [
              h('div', { class: 'w-2.5 h-2.5 rounded-full ' + cfgC.S[s.key].dot }),
              h('span', { class: 'text-sm font-medium text-slate-700' }, s.label),
              h('span', { class: 'text-xs text-slate-400' }, toAr(col.length))
            ]),
            h('div', { class: 'space-y-2' }, col.length
              ? col.map(function (i) { return IssueCard(cfgC, i, ents, function () { go('issue', i.id); }); })
              : [h('div', { class: 'border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-300' }, 'لا توجد')])
          ]);
        })));
      }
    }

    var searchIn = h('input', { class: 'w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'بحث…', value: st.search });
    searchIn.addEventListener('input', function () { st.search = searchIn.value; drawResults(); });

    function chipRow(items, selected, onPick, small) {
      var row = h('div', { class: 'flex gap-2 overflow-x-auto ns' + (small ? '' : ' pb-0.5') });
      items.forEach(function (it) {
        var b = h('button', {
          class: 'flex-shrink-0 text-xs px-3 py-' + (small ? '1' : '1.5') + ' rounded-full border ' +
            (selected() === it.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
          onclick: function () { onPick(it.k); render(); }
        }, it.l);
        row.appendChild(b);
      });
      return row;
    }

    var body = h('div', { class: 'p-3 space-y-3' }, [
      h('div', { class: 'relative' }, [
        h('div', { class: 'absolute text-slate-400', style: { insetInlineEnd: '12px', top: '50%', transform: 'translateY(-50%)' } }, [ic('search', 15)]),
        searchIn
      ]),
      st.mode === 'list' ? chipRow(chips, function () { return st.sf; }, function (k) { st.sf = k; }) : null,
      ents.length > 1 ? chipRow([{ k: 'all', l: 'كل الفروع' }].concat(ents.map(function (e) { return { k: e.id, l: e.name }; })), function () { return st.ef; }, function (k) { st.ef = k; }, true) : null,
      chipRow([{ k: 'all', l: 'كل الأولويات' }].concat(cfgC.priorities.map(function (p) { return { k: p.key, l: p.label }; })), function () { return st.pf; }, function (k) { st.pf = k; }, true),
      results
    ]);
    drawResults();

    return h('div', {}, [
      TopBar({
        title: 'المهام', label: S.auth.label,
        right: [h('div', { class: 'flex gap-1' }, [
          h('button', { class: 'p-1.5 rounded-lg ' + (st.mode === 'list' ? 'bg-white/30' : 'bg-white/10'), 'aria-label': 'قائمة', onclick: function () { st.mode = 'list'; render(); } }, [ic('list', 15)]),
          h('button', { class: 'p-1.5 rounded-lg ' + (st.mode === 'board' ? 'bg-white/30' : 'bg-white/10'), 'aria-label': 'لوحة', onclick: function () { st.mode = 'board'; render(); } }, [ic('grid', 15)])
        ])]
      }),
      body
    ]);
  }

  /* ── ENTITIES ─────────────────────────────────── */
  function EntitiesPage() {
    var cfgC = C(), perms = P(), ents = vE(), list = vI();
    return h('div', {}, [
      TopBar({
        title: 'الجهات', label: S.auth.label,
        right: perms.manageEntities ? [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1',
          onclick: function () { addEntityModal(cfgC); }
        }, [ic('plus', 13), 'إضافة'])] : null
      }),
      h('div', { class: 'p-4 space-y-3' }, ents.map(function (e) {
        var tc = cfgC.E[e.type] || { icon: 'boxes', tint: TINT.slate, label: e.type };
        var aC = list.filter(function (i) { return i.entityId === e.id && isActive(cfgC, i); }).length;
        return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 text-right', onclick: function () { go('entity', e.id); } }, [
          h('div', { class: 'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ' + tc.tint }, [ic(tc.icon, 24)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'font-semibold text-slate-800' }, e.name),
            h('div', { class: 'text-xs text-slate-400' }, tc.label + ' · ' + toAr(e.categories.length) + ' تصنيفات')
          ]),
          aC > 0 ? h('span', { class: 'bg-sky-50 text-sky-700 text-xs px-2 py-1 rounded-lg' }, toAr(aC) + ' نشطة')
            : h('span', { class: 'text-xs text-slate-300' }, 'لا جديد')
        ]);
      }))
    ]);
  }

  function addEntityModal(cfgC) {
    var form = { name: '', type: (cfgC.types[0] && cfgC.types[0].key) || 'other' };
    var typeGrid = h('div', { class: 'grid grid-cols-2 gap-2' });
    function drawTypes() {
      mount(typeGrid, cfgC.types.map(function (t) {
        return h('button', {
          class: 'p-3 rounded-xl border flex items-center gap-2 text-sm ' + (form.type === t.key ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'),
          onclick: function () { form.type = t.key; drawTypes(); }
        }, [ic(cfgC.E[t.key].icon, 15), t.label]);
      }));
    }
    drawTypes();
    var close = openModal('إضافة جهة جديدة', [
      h('div', { class: 'mb-4' }, [
        h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'اسم الجهة'),
        textInput('', function (v) { form.name = v; }, { placeholder: 'مثال: فرع السالمية' })
      ]),
      h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm text-slate-700 mb-2' }, 'النوع'), typeGrid]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
          onclick: function () {
            if (!form.name.trim()) return;
            pE(S.ents.concat([{ id: uid(), name: form.name.trim(), type: form.type, categories: M.makeCats() }]))
              .then(function () { close(); toast('تمت إضافة الجهة ✓'); render(); });
          }
        }, 'إضافة')
      ])
    ]);
  }

  /* ── ENTITY DETAIL ────────────────────────────── */
  function EntityPage() {
    var eid = cur().param;
    var cfgC = C(), perms = P(), ents = vE();
    var ent = ents.find(function (e) { return e.id === eid; });
    if (!ent) return h('div', { class: 'p-8 text-center text-slate-400' }, 'الجهة غير موجودة');
    var ei = vI().filter(function (i) { return i.entityId === eid; });
    var aC = ei.filter(function (i) { return isActive(cfgC, i); }).length;
    var tc = cfgC.E[ent.type] || { icon: 'boxes', tint: TINT.slate, label: ent.type };

    return h('div', {}, [
      TopBar({
        title: ent.name, subtitle: tc.label, onBack: back,
        right: perms.manageEntities ? [h('button', { class: 'bg-white/20 p-2 rounded-xl', 'aria-label': 'تعديل', onclick: function () { editEntityModal(ent, cfgC); } }, [ic('edit', 14)])] : null
      }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: tc.tint + ' rounded-2xl p-4 flex items-center gap-3' }, [
          h('div', { class: 'w-14 h-14 bg-white/60 rounded-xl flex items-center justify-center' }, [ic(tc.icon, 28)]),
          h('div', {}, [
            h('div', { class: 'font-bold text-lg' }, ent.name),
            h('div', { class: 'text-sm opacity-80' }, tc.label + ' · ' + toAr(aC) + ' نشطة')
          ])
        ]),
        h('div', { class: 'flex gap-3' }, [
          h('button', { class: 'flex-1 bg-white border border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-sm text-slate-700', onclick: function () { go('library', { entityId: eid }); } }, [ic('library', 14), 'مكتبة الفرع']),
          perms.create ? h('button', { class: 'flex-1 bg-sky-500 text-white rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold', onclick: function () { go('addIssue', { entityId: eid }); } }, [ic('plus', 14), 'ملاحظة جديدة']) : null
        ])
      ].concat(ent.categories.map(function (c) {
        var items = ei.filter(function (i) { return i.categoryId === c.id; });
        return h('div', {}, [
          h('div', { class: 'flex items-center justify-between mb-2' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700' }, c.name),
            h('span', { class: 'text-xs text-slate-400' }, toAr(items.length))
          ]),
          items.length === 0
            ? h('div', { class: 'border-2 border-dashed border-slate-200 rounded-xl p-3 text-center text-xs text-slate-300' }, 'لا توجد ملاحظات')
            : h('div', { class: 'space-y-2' }, items.map(function (i) { return IssueCard(cfgC, i, ents, function () { go('issue', i.id); }); }))
        ]);
      })))
    ]);
  }

  function editEntityModal(ent, cfgC) {
    var form = { name: ent.name, type: ent.type };
    var typeGrid = h('div', { class: 'grid grid-cols-2 gap-2' });
    function drawTypes() {
      mount(typeGrid, cfgC.types.map(function (t) {
        return h('button', {
          class: 'p-2.5 rounded-xl border flex items-center gap-2 text-sm ' + (form.type === t.key ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'),
          onclick: function () { form.type = t.key; drawTypes(); }
        }, [ic(cfgC.E[t.key].icon, 13), t.label]);
      }));
    }
    drawTypes();
    var close = openModal('تعديل الجهة', [
      h('div', { class: 'mb-4' }, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'الاسم'), textInput(ent.name, function (v) { form.name = v; })]),
      h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm text-slate-700 mb-2' }, 'النوع'), typeGrid]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
          onclick: function () {
            pE(S.ents.map(function (e) { return e.id === ent.id ? Object.assign({}, e, { name: form.name.trim() || e.name, type: form.type }) : e; }))
              .then(function () { close(); toast('تم التحديث ✓'); render(); });
          }
        }, 'حفظ')
      ])
    ]);
  }

  window.MUTV = {
    h: h, mount: mount, ic: ic, ICONS: ICONS, donut: donut, hbars: hbars, vbars: vbars,
    S: S, C: C, P: P, vE: vE, vI: vI, go: go, back: back, goTab: goTab, replace: replace,
    cur: cur, local: local, sub: sub, toast: toast, notify: notify, render: null,
    pI: pI, pE: pE, pT: pT, pN: pN, pEjs: pEjs, pAcc: pAcc, pCfg: pCfg,
    createIssue: createIssue, updIssue: updIssue, delIssue: delIssue, addComment: addComment,
    addChk: addChk, togChk: togChk, delChk: delChk, moveStatus: moveStatus, delEntity: delEntity,
    resetDemo: resetDemo, login: login, logout: logout,
    TopBar: TopBar, Toggle: Toggle, Modal: Modal, openModal: openModal, IssueCard: IssueCard,
    BottomNav: BottomNav, INP: INP, inputRow: inputRow, textInput: textInput,
    LoginPage: LoginPage, HomePage: HomePage, TasksPage: TasksPage,
    EntitiesPage: EntitiesPage, EntityPage: EntityPage
  };

  /* render is assigned by the second view module, which owns the router. */
  function render() { window.MUTV.render(); }
}());
