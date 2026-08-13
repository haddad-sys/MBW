/* ===========================================================================
   متابِع — the router, the boot sequence and the live channel.
   This is the only file that decides what is on screen; everything else
   builds a piece of it.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, U = window.UI, T = window.ST;
  var V = window.VIEWS, V2 = window.VIEWS2, AV = window.ADMINV, AU = window.AUTHV;
  var h = U.h, ic = U.ic, mount = U.mount, api = M.api;
  var S = T.S, P = T.P;

  var TABS = ['home', 'tasks', 'entities', 'library', 'more'];

  /* ── the shell ────────────────────────────────── */
  function splash(line) {
    return h('div', { class: 'min-h-screen bg-gradient-to-b from-sky-500 to-blue-700 flex items-center justify-center', dir: 'rtl' }, [
      h('div', { class: 'text-center text-white' }, [
        h('div', { class: 'text-5xl font-extrabold mb-2' }, 'متابِع'),
        h('div', { class: 'text-sky-200' }, line || 'جارٍ التحميل…')
      ])
    ]);
  }

  function page(view) {
    if (view === 'home') return V.HomePage();
    if (view === 'tasks') return V.TasksPage();
    if (view === 'entities') return V.EntitiesPage();
    if (view === 'entity') return V.EntityPage();
    if (view === 'issue') return V2.IssuePage();
    if (view === 'addIssue' || view === 'editIssue') return V2.IssueForm();
    if (view === 'library') return V2.LibraryPage();
    if (view === 'reports') return V2.ReportsPage();
    if (view === 'alerts') return V2.AlertsPage();
    if (view === 'more') return V2.MorePage();
    if (view === 'settings') return AV.SettingsPage();
    return V.HomePage();
  }

  function render() {
    var root = document.getElementById('root');
    /* Overlays sit outside #root so they can cover the shell; a navigation —
       or a sign-out — has to take them with it. */
    var stale = document.querySelectorAll('.mut-overlay');
    for (var i = 0; i < stale.length; i++) stale[i].remove();

    if (S.booting) { mount(root, splash()); return; }
    if (!S.user) { mount(root, AU.AuthPage(signedIn)); return; }

    var view = V.cur().view;
    var perms = P();
    var body = page(view);

    var shell = h('div', {
      class: 'w-full max-w-md bg-slate-50 min-h-screen relative pb-20 shadow-2xl overflow-hidden', id: 'shell'
    }, [
      h('div', { id: 'toastHost' }),
      body,
      (perms.create && TABS.indexOf(view) !== -1) ? h('button', {
        class: 'fixed bottom-20 z-30 w-14 h-14 rounded-full bg-sky-500 text-white shadow-lg flex items-center justify-center active:bg-sky-600',
        style: { right: '16px' }, 'aria-label': 'ملاحظة جديدة',
        onclick: function () {
          M.Ring.unlock();
          V.go('addIssue', perms.scope === 'own' && S.user.entityId ? { entityId: S.user.entityId } : {});
        }
      }, [ic('plus', 26)]) : null,
      V.BottomNav()
    ]);

    mount(root, h('div', { class: 'min-h-screen bg-slate-200 flex justify-center', dir: 'rtl' }, [
      S.user && S.live === false ? h('div', { class: 'offline-bar' }, 'إعادة الاتصال بالخادم…') : null,
      shell
    ]));
  }

  /* A background update must never yank the caret out of a half-typed field;
     the next navigation redraws from state anyway. */
  function typing() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }
  function safeRender() { if (!typing()) render(); }

  /* ── the live channel ─────────────────────────── */
  var wired = false;
  function wireLive() {
    if (wired) return;
    wired = true;

    M.Live.on('state', function (up) {
      var was = S.live;
      S.live = !!up;
      /* Anything could have happened while the connection was down. */
      if (up && was === false && S.user && !S.booting) softRefresh();
      if (was !== S.live && S.user && !S.booting) safeRender();
    });

    M.Live.on('hello', function (d) {
      if (d && typeof d.unread === 'number') { S.unread = d.unread; if (!S.booting) safeRender(); }
    });

    M.Live.on('badge', function (d) {
      if (!d || typeof d.unread !== 'number') return;
      S.unread = d.unread;
      if (!S.booting) safeRender();
    });

    M.Live.on('notification', function (n) {
      if (!n) return;
      S.unread += 1;
      safeRender();
      V.ringBell();
      M.Ring.play(!!n.urgent);
      V.toast(n.subject || n.title || 'إشعار جديد');
      softRefresh();
    });
  }

  /* A quiet reload of the snapshot — no splash, no lost scroll position. */
  var refreshing = null;
  function softRefresh() {
    if (refreshing) return refreshing;
    refreshing = T.refresh().then(function () {
      refreshing = null;
      if (!S.booting && S.user) safeRender();
    }, function (err) {
      refreshing = null;
      if (err && err.status === 401) signedOut();
    });
    return refreshing;
  }

  /* ── deep links ───────────────────────────────── */
  /* Mail carries #/issue/<id>; open it once the snapshot is in. */
  function openHash() {
    var m = /^#\/issue\/(.+)$/.exec(window.location.hash || '');
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    try { history.replaceState(null, '', window.location.pathname + window.location.search); }
    catch (e) { window.location.hash = ''; }
    if (T.issue(id)) V.go('issue', id);
  }

  /* ── sessions ─────────────────────────────────── */
  function signedIn() {
    S.booting = true;
    render();
    return start();
  }

  function start() {
    return T.refresh().then(function () {
      S.booting = false;
      S.stack = [{ view: firstTab() }];
      wireLive();
      M.Live.connect();
      render();
      openHash();
    }, function (err) {
      S.booting = false;
      S.user = null;
      render();
      if (err && err.status !== 401) console.error('[mutabea]', err);
    });
  }

  function firstTab() {
    var perms = P();
    var tabs = (perms && perms.tabs) || {};
    for (var i = 0; i < TABS.length; i++) if (tabs[TABS[i]]) return TABS[i];
    return 'more';
  }

  function signedOut() {
    M.Live.stop();
    M.setToken('');
    S.user = null; S.perms = null; S.issues = []; S.entities = [];
    S.unread = 0; S.pendingRegistrations = 0; S.live = false;
    S.stack = [{ view: 'home' }];
    S.booting = false;
    render();
  }

  function signOut() {
    api.post('/api/auth/logout').then(signedOut, signedOut);
  }

  window.APP = { render: render, signOut: signOut, refresh: softRefresh };

  /* ── boot ─────────────────────────────────────── */
  render();
  api.get('/api/auth/me').then(function () {
    return start();
  }, function () {
    S.booting = false;
    S.user = null;
    render();
  });

  /* A tab woken from the background reconciles before the person reads it. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.user && !S.booting) softRefresh();
  });
}());
