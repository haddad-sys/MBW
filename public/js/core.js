/* ===========================================================================
   متابِع — client core: the API client, shared state, icons, charts, the ring.
   The data lives on the server; this file never persists anything but the
   session token and the sound preference.
   =========================================================================== */
(function () {
  'use strict';

  try {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
    if (document.body) document.body.setAttribute('dir', 'rtl');
  } catch (e) { /* nothing to stamp */ }

  /* ── formatting ───────────────────────────────── */
  var ARD = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function toAr(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[0-9]/g, function (d) { return ARD[+d]; });
  }
  function fmtDate(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return new Date(ts).toISOString().slice(0, 10); }
  }
  function fmtWhen(ts) {
    if (!ts) return '';
    var mins = Math.round((Date.now() - Number(ts)) / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return 'قبل ' + toAr(mins) + ' د';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return 'قبل ' + toAr(hrs) + ' س';
    var days = Math.round(hrs / 24);
    if (days < 30) return 'قبل ' + toAr(days) + ' ي';
    return fmtDate(ts);
  }
  function daysUntil(ms) {
    var n = new Date(); n.setHours(0, 0, 0, 0);
    var d = new Date(ms); d.setHours(0, 0, 0, 0);
    return Math.round((d - n) / 86400000);
  }
  function plD(n) {
    var a = Math.abs(n);
    if (a === 1) return 'يوم واحد';
    if (a === 2) return 'يومين';
    if (a >= 3 && a <= 10) return toAr(a) + ' أيام';
    return toAr(a) + ' يوماً';
  }

  /* ── images ───────────────────────────────────── */
  /* Resized in the browser before upload — the server stores what it is sent. */
  function compress(file, maxDim, q) {
    maxDim = maxDim || 900; q = q || 0.55;
    return new Promise(function (res) {
      var rd = new FileReader();
      rd.onload = function (e) {
        var raw = e.target.result, done = false;
        var fin = function (v) { if (!done) { done = true; res(v); } };
        var to = setTimeout(function () { fin(raw); }, 4000);
        try {
          var img = new window.Image();
          img.onload = function () {
            try {
              var w = img.width, h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else { w = Math.round(w * maxDim / h); h = maxDim; }
              }
              var c = document.createElement('canvas'); c.width = w; c.height = h;
              c.getContext('2d').drawImage(img, 0, 0, w, h);
              clearTimeout(to); fin(c.toDataURL('image/jpeg', q));
            } catch (err) { clearTimeout(to); fin(raw); }
          };
          img.onerror = function () { clearTimeout(to); fin(raw); };
          img.src = raw;
        } catch (err) { clearTimeout(to); fin(raw); }
      };
      rd.onerror = function () { res(null); };
      rd.readAsDataURL(file);
    });
  }
  function readDataURL(file) {
    return new Promise(function (r) {
      var rd = new FileReader();
      rd.onload = function (e) { r(e.target.result); };
      rd.onerror = function () { r(null); };
      rd.readAsDataURL(file);
    });
  }

  /* ── palette ──────────────────────────────────── */
  var COLORS = ['rose', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'slate', 'zinc'];
  var CHIP = {}, TINT = {}, DOT = {};
  COLORS.forEach(function (c) {
    var text = (c === 'slate' || c === 'zinc') ? '600' : '700';
    CHIP[c] = 'bg-' + c + '-' + (c === 'zinc' ? '100' : '50') + ' text-' + c + '-' + text + ' border-' + c + '-200';
    TINT[c] = 'bg-' + c + '-' + (c === 'slate' || c === 'zinc' ? '100' : '50') + ' text-' + c + '-600';
    DOT[c] = 'bg-' + c + '-' + (c === 'yellow' ? '400' : (c === 'slate' || c === 'zinc' ? '400' : '500'));
  });
  var HEX = {
    rose: '#f43f5e', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#84cc16', green: '#22c55e',
    emerald: '#10b981', teal: '#14b8a6', sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
    purple: '#a855f7', pink: '#ec4899', slate: '#94a3b8', zinc: '#a1a1aa'
  };
  function pal(c) {
    return { dot: DOT[c] || DOT.slate, bar: DOT[c] || DOT.slate, chip: CHIP[c] || CHIP.slate, tint: TINT[c] || TINT.slate };
  }
  var ICON_KEYS = ['baby', 'food', 'office', 'box', 'store', 'edu', 'health', 'tool'];
  var TYPE_ICON = { baby: 'baby', food: 'food', office: 'building', box: 'boxes', store: 'shopping', edu: 'grad', health: 'heart', tool: 'wrench' };

  /* ── the API ──────────────────────────────────── */
  var token = '';
  try { token = localStorage.getItem('mutabea.token') || ''; } catch (e) { token = ''; }

  function setToken(v) {
    token = v || '';
    try {
      if (token) localStorage.setItem('mutabea.token', token);
      else localStorage.removeItem('mutabea.token');
    } catch (e) { /* private mode; the cookie still carries the session */ }
  }
  function getToken() { return token; }

  function request(method, path, body) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    };
    if (token) opts.headers.authorization = 'Bearer ' + token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (t) {
        var payload = null;
        if (t) { try { payload = JSON.parse(t); } catch (e) { payload = { raw: t }; } }
        if (!r.ok) {
          var err = new Error((payload && payload.error) || ('HTTP ' + r.status));
          err.status = r.status;
          err.code = (payload && payload.error) || 'error';
          err.body = payload || {};
          throw err;
        }
        return payload;
      });
    });
  }

  var api = {
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b === undefined ? {} : b); },
    patch: function (p, b) { return request('PATCH', p, b === undefined ? {} : b); },
    put: function (p, b) { return request('PUT', p, b === undefined ? {} : b); },
    del: function (p) { return request('DELETE', p); }
  };

  /* ── the ring ─────────────────────────────────── */
  var Ring = (function () {
    var ctx = null;
    var muted = false;
    try { muted = localStorage.getItem('mutabea.mute') === '1'; } catch (e) { muted = false; }
    function context() {
      if (ctx) return ctx;
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try { ctx = new Ctor(); } catch (e) { ctx = null; }
      return ctx;
    }
    function unlock() {
      var c = context();
      if (!c) return Promise.resolve(false);
      if (c.state === 'suspended') {
        try { return Promise.resolve(c.resume()).then(function () { return c.state === 'running'; }, function () { return false; }); }
        catch (e) { return Promise.resolve(false); }
      }
      return Promise.resolve(c.state === 'running');
    }
    function tone(c, freq, start, dur, gain) {
      var osc = c.createOscillator(), amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp); amp.connect(c.destination);
      osc.start(start); osc.stop(start + dur + 0.02);
    }
    return {
      unlock: unlock,
      muted: function () { return muted; },
      setMuted: function (v) {
        muted = !!v;
        try { localStorage.setItem('mutabea.mute', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      },
      ready: function () { return !!ctx && ctx.state === 'running'; },
      play: function (urgent) {
        if (muted) return false;
        var c = context();
        if (!c) return false;
        if (c.state !== 'running') { unlock(); return false; }
        var t0 = c.currentTime + 0.01;
        try {
          if (urgent) {
            tone(c, 987.8, t0, 0.2, 0.16); tone(c, 987.8, t0 + 0.17, 0.2, 0.16); tone(c, 1318.5, t0 + 0.34, 0.5, 0.14);
          } else {
            tone(c, 880, t0, 0.28, 0.14); tone(c, 1318.5, t0 + 0.11, 0.42, 0.11);
          }
          return true;
        } catch (e) { return false; }
      }
    };
  }());
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, function () { Ring.unlock(); }, { passive: true });
  });

  /* ── the live channel ─────────────────────────── */
  var Live = (function () {
    var source = null, retry = 0, stopped = false;
    var handlers = {};
    function on(event, fn) { (handlers[event] = handlers[event] || []).push(fn); }
    function emit(event, data) {
      (handlers[event] || []).forEach(function (fn) {
        try { fn(data); } catch (e) { console.error('[mutabea]', e); }
      });
    }
    function connect() {
      disconnect();
      stopped = false;
      var url = '/api/stream' + (token ? '?token=' + encodeURIComponent(token) : '');
      try { source = new EventSource(url, { withCredentials: true }); }
      catch (e) { schedule(); return; }
      source.addEventListener('open', function () { retry = 0; emit('state', true); });
      source.addEventListener('hello', function (e) { retry = 0; emit('state', true); emit('hello', parse(e)); });
      source.addEventListener('notification', function (e) { emit('notification', parse(e)); });
      source.addEventListener('badge', function (e) { emit('badge', parse(e)); });
      source.addEventListener('error', function () {
        emit('state', false);
        if (source && source.readyState === EventSource.CLOSED) schedule();
      });
    }
    function parse(e) { try { return JSON.parse(e.data); } catch (err) { return {}; } }
    function schedule() {
      if (stopped) return;
      disconnect();
      retry = Math.min(retry + 1, 6);
      setTimeout(function () { if (!stopped) connect(); }, Math.min(30000, 1000 * Math.pow(2, retry)));
    }
    function disconnect() {
      if (source) { try { source.close(); } catch (e) { /* already closed */ } source = null; }
    }
    return {
      connect: connect,
      on: on,
      stop: function () { stopped = true; disconnect(); emit('state', false); }
    };
  }());

  window.MUT = {
    toAr: toAr, fmtDate: fmtDate, fmtWhen: fmtWhen, daysUntil: daysUntil, plD: plD,
    compress: compress, readDataURL: readDataURL,
    COLORS: COLORS, CHIP: CHIP, TINT: TINT, DOT: DOT, HEX: HEX, pal: pal,
    ICON_KEYS: ICON_KEYS, TYPE_ICON: TYPE_ICON,
    api: api, setToken: setToken, getToken: getToken,
    Ring: Ring, Live: Live
  };
}());
