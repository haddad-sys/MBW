import { api, setToken, getToken, ApiError } from './api.js';
import { el, ic, mount, clear, initials } from './dom.js';
import { t, setLang, state as lang, priorityLabel } from './i18n.js';
import * as live from './live.js';
import * as ring from './ring.js';
import { createNotificationCenter, when } from './notifications.js';
import { taskListView, taskDrawer, settingsView, emailLogView, userName } from './views.js';

const root = document.getElementById('root');

const store = {
  user: null,
  boot: null,
  tasks: [],
  view: 'today',
  query: '',
  filter: {},
  drawer: null,
};

let center = null;

/* ------------------------------------------------------------- theming --- */

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('mutabi.theme', theme || 'system');
}
applyTheme(localStorage.getItem('mutabi.theme') || 'system');
setLang(localStorage.getItem('mutabi.lang') || 'ar');

/* -------------------------------------------------------------- sign in --- */

function renderLogin(message) {
  const emailInput = el('input', { type: 'email', value: 'admin@mutabi.local', autocomplete: 'username' });
  const pwInput = el('input', { type: 'password', value: '', autocomplete: 'current-password' });
  const errorBox = el('div', { class: 'error hidden' });
  if (message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); }

  const submit = async (e) => {
    e?.preventDefault();
    errorBox.classList.add('hidden');
    try {
      const res = await api.login(emailInput.value.trim(), pwInput.value);
      setToken(res.token);
      /* The sign-in click is a user gesture — the best moment to earn the right
         to make a sound later. */
      ring.unlock();
      await start();
    } catch (err) {
      errorBox.textContent = err instanceof ApiError && err.code === 'invalid_credentials' ? t('invalidCredentials') : String(err.message);
      errorBox.classList.remove('hidden');
    }
  };

  const form = el('form', { onsubmit: submit }, [
    errorBox,
    el('div', { class: 'field' }, [el('label', {}, [t('email')]), emailInput]),
    el('div', { class: 'field' }, [el('label', {}, [t('password')]), pwInput]),
    el('button', { class: 'btn primary', type: 'submit', style: { width: '100%', justifyContent: 'center' } }, [t('signIn')]),
    el('div', { class: 'hint' }, [t('demoHint')]),
  ]);

  mount(root, el('div', { class: 'auth' }, [
    el('div', { class: 'auth-card' }, [
      el('div', { class: 'auth-brand' }, [
        el('div', { class: 'brand-mark' }, ['م']),
        el('div', {}, [
          el('div', { class: 'brand-name' }, [t('app')]),
          el('div', { class: 'brand-sub' }, [t('signInSub')]),
        ]),
        el('div', { class: 'spacer', style: { flex: '1' } }),
        el('button', {
          class: 'icon-btn',
          type: 'button',
          title: t('language'),
          onclick: () => { setLang(lang.lang === 'ar' ? 'en' : 'ar'); renderLogin(); },
        }, [ic('globe')]),
      ]),
      form,
    ]),
  ]));
  pwInput.focus();
}

/* ---------------------------------------------------------------- shell --- */

function ctx() {
  return {
    user: store.user,
    users: store.boot.users,
    usersById: new Map(store.boot.users.map((u) => [u.id, u])),
    statuses: store.boot.statuses,
    statusById: new Map(store.boot.statuses.map((s) => [s.id, s])),
    priorities: store.boot.priorities,
    notifyEvents: store.boot.notifyEvents,
    openTask,
    reload: () => loadTasks().then(render),
    setFilter: (f) => { store.filter = f; render(); },
    toast: (message) => center?.receive({ id: `local_${Date.now()}`, kind: 'update', text: message, textAr: message, sound: false, at: Date.now() }),
    notifyError: (err) => {
      const code = err?.body?.error || err?.message || 'error';
      center?.receive({ id: `err_${Date.now()}`, kind: 'alert', text: code, textAr: code, sound: false, at: Date.now() });
      console.error('[mutabi]', err);
    },
    onUserUpdated: (user) => {
      store.user = { ...store.user, ...user };
      setLang(user.lang);
      render();
    },
  };
}

const NAV = [
  { id: 'today', icon: 'focus', label: 'today', group: 'work' },
  { id: 'mine', icon: 'mine', label: 'myTasks', group: 'work' },
  { id: 'following', icon: 'eye', label: 'following', group: 'work' },
  { id: 'all', icon: 'list', label: 'allTasks', group: 'work' },
  { id: 'notifications', icon: 'bell', label: 'notifications', group: 'system' },
  { id: 'emails', icon: 'mail', label: 'emailLog', group: 'system', perm: 'manage.settings' },
  { id: 'settings', icon: 'gear', label: 'settings', group: 'system' },
];

function hasPerm(perm) {
  if (!perm) return true;
  const role = store.boot.roles.find((r) => r.id === store.user.role);
  return !!role?.perms.includes(perm);
}

function buildRail() {
  const rail = el('aside', { class: 'rail', id: 'rail' });
  rail.appendChild(el('div', { class: 'brand' }, [
    el('div', { class: 'brand-mark' }, ['م']),
    el('div', {}, [
      el('div', { class: 'brand-name' }, [t('app')]),
      el('div', { class: 'brand-sub' }, [t('appSub')]),
    ]),
  ]));

  const scroll = el('div', { class: 'rail-scroll' });
  for (const group of ['work', 'system']) {
    const items = NAV.filter((n) => n.group === group && hasPerm(n.perm));
    if (items.length === 0) continue;
    const box = el('div', { class: 'navgroup' }, [el('div', { class: 'eyebrow' }, [t(group === 'work' ? 'navWork' : 'navSystem')])]);
    for (const item of items) {
      const count = navCount(item.id);
      box.appendChild(el('button', {
        class: `nav-item${store.view === item.id ? ' on' : ''}`,
        onclick: () => { store.view = item.id; store.filter = {}; document.getElementById('rail')?.classList.remove('open'); render(); },
      }, [
        ic(item.icon),
        t(item.label),
        count !== null ? el('span', { class: `nav-count${item.id === 'today' && count > 0 ? ' hot' : ''}` }, [String(count)]) : null,
      ]));
    }
    scroll.appendChild(box);
  }
  rail.appendChild(scroll);

  rail.appendChild(el('div', { class: 'rail-foot' }, [
    el('span', { class: 'avatar' }, [initials(store.user.name)]),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontSize: '12.5px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        [lang.lang === 'ar' ? store.user.nameAr || store.user.name : store.user.name]),
      el('div', { class: 'dim', style: { fontSize: '10.5px' } }, [store.user.role]),
    ]),
    el('button', { class: 'icon-btn', title: t('signOut'), onclick: signOut }, [ic('logout')]),
  ]));
  return rail;
}

function navCount(id) {
  const today = new Date().toISOString().slice(0, 10);
  switch (id) {
    case 'today': return store.tasks.filter((x) => !x.closed && (x.overdue || x.dueDate === today)).length;
    case 'mine': return store.tasks.filter((x) => !x.closed && (x.assignee === store.user.id || x.owner === store.user.id)).length;
    case 'following': return store.tasks.filter((x) => x.watchers.includes(store.user.id) && !x.closed).length;
    case 'all': return store.tasks.length;
    case 'notifications': return center?.unread ?? null;
    default: return null;
  }
}

function buildTopbar() {
  const search = el('input', {
    placeholder: t('search'),
    value: store.query,
    oninput: (e) => { store.query = e.target.value; renderStage(); },
  });

  const themeBtn = el('button', {
    class: 'icon-btn',
    title: t('theme'),
    onclick: () => {
      const current = localStorage.getItem('mutabi.theme') || 'system';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      render();
    },
  }, [ic((localStorage.getItem('mutabi.theme') || 'system') === 'dark' ? 'sun' : 'moon')]);

  const connDot = el('span', {
    class: 'pill',
    id: 'connPill',
    title: live.isConnected() ? t('connected') : t('disconnected'),
    style: { fontSize: '10.5px' },
  }, [live.isConnected() ? t('connected') : t('disconnected')]);

  return el('header', { class: 'topbar' }, [
    el('button', {
      class: 'icon-btn menu-btn',
      title: '☰',
      onclick: () => document.getElementById('rail')?.classList.toggle('open'),
    }, [ic('menu')]),
    el('div', { class: 'searchbox' }, [ic('search'), search]),
    el('div', { class: 'top-actions' }, [
      connDot,
      el('button', {
        class: 'btn primary sm',
        title: t('newTask'),
        onclick: openNewTask,
      }, [ic('plus'), el('span', { class: 'btn-label' }, [t('newTask')])]),
      el('button', {
        class: 'icon-btn',
        title: t('language'),
        onclick: () => { setLang(lang.lang === 'ar' ? 'en' : 'ar'); render(); },
      }, [ic('globe')]),
      themeBtn,
      center.button,
    ]),
  ]);
}

function visibleTasks() {
  const today = new Date().toISOString().slice(0, 10);
  let list = store.tasks;
  if (store.query) {
    const q = store.query.toLowerCase();
    list = list.filter((x) => `${x.id} ${x.title} ${x.titleAr} ${x.description}`.toLowerCase().includes(q));
  }
  switch (store.view) {
    case 'today': list = list.filter((x) => !x.closed && (x.overdue || x.dueDate === today)); break;
    case 'mine': list = list.filter((x) => x.assignee === store.user.id || x.owner === store.user.id); break;
    case 'following': list = list.filter((x) => x.watchers.includes(store.user.id)); break;
    default: break;
  }
  if (store.filter.open) list = list.filter((x) => !x.closed);
  if (store.filter.overdue) list = list.filter((x) => x.overdue);
  if (store.filter.today) list = list.filter((x) => x.dueDate === today && !x.closed);
  if (store.filter.done) list = list.filter((x) => x.closed);

  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return [...list].sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const r = rank[a.priority] - rank[b.priority];
    if (r) return r;
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
}

function renderStage() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const c = ctx();

  if (store.view === 'settings') { mount(stage, settingsView(c)); return; }

  if (store.view === 'emails') {
    mount(stage, el('div', { class: 'empty' }, [ic('mail')]));
    api.emails({ limit: 100 })
      .then((data) => mount(stage, emailLogView(c, data)))
      .catch((err) => c.notifyError(err));
    return;
  }

  if (store.view === 'notifications') {
    mount(stage, el('div', { class: 'empty' }, [ic('bell')]));
    api.notifications({ limit: 100 })
      .then((data) => mount(stage, notificationsPage(c, data)))
      .catch((err) => c.notifyError(err));
    return;
  }

  const titles = { today: t('today'), mine: t('myTasks'), following: t('following'), all: t('allTasks') };
  const icons = { today: 'focus', mine: 'mine', following: 'eye', all: 'list' };
  mount(stage, taskListView(c, visibleTasks(), {
    title: titles[store.view] || t('allTasks'),
    icon: icons[store.view] || 'list',
    tiles: store.view === 'today' || store.view === 'all',
  }));
}

function notificationsPage(c, data) {
  const rows = data.notifications || [];
  return el('div', { class: 'stack' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        ic('bell'), el('h2', {}, [t('notifications')]),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn sm',
          onclick: async () => { await api.markAllRead(); center.refresh(); renderStage(); },
        }, [t('markAllRead')]),
      ]),
      el('div', { class: 'card-body' }, [
        rows.length === 0
          ? el('div', { class: 'empty' }, [ic('bell'), el('h3', {}, [t('noNotifications')])])
          : el('div', {}, rows.map((n) => el('div', {
            class: `notif${n.read ? '' : ' unread'}`,
            onclick: () => { if (n.task) openTask(n.task); },
          }, [
            el('div', { class: `notif-kind k-${n.kind}` }, [ic('bell')]),
            el('div', { class: 'notif-b' }, [
              el('div', { class: 'notif-t' }, [t(`k_${n.kind}`)]),
              el('div', { class: 'notif-x' }, [lang.lang === 'ar' ? n.text_ar || n.text : n.text]),
              el('div', { class: 'notif-w' }, [`${n.task ? `${n.task} · ` : ''}${when(n.created_at)}`]),
            ]),
          ]))),
      ]),
    ]),
  ]);
}

function render() {
  const shell = el('div', { class: 'shell' }, [
    buildRail(),
    el('div', { class: 'main' }, [
      buildTopbar(),
      el('div', { class: 'viewbar' }, [
        el('h1', {}, [ic('focus'), t(store.view === 'today' ? 'today' : (store.view === 'mine' ? 'myTasks' : (store.view === 'following' ? 'following' : (store.view === 'settings' ? 'settings' : (store.view === 'emails' ? 'emailLog' : (store.view === 'notifications' ? 'notifications' : 'allTasks'))))))]),
        el('div', { class: 'spacer' }),
        Object.keys(store.filter).length
          ? el('button', { class: 'chipbtn on', onclick: () => { store.filter = {}; render(); } }, [ic('close'), t('cancel')])
          : null,
        el('button', { class: 'icon-btn', title: t('refresh'), onclick: () => loadTasks().then(render) }, [ic('refresh')]),
      ]),
      el('div', { class: 'stage', id: 'stage' }),
    ]),
  ]);

  mount(root, [shell, center.panel, center.toasts]);
  renderStage();
  if (store.drawer) openTask(store.drawer, true);
}

/* --------------------------------------------------------------- drawer --- */

async function openTask(id, silent = false) {
  try {
    const { task } = await api.task(id);
    store.drawer = id;
    if (!silent) window.location.hash = `#/task/${id}`;
    const close = () => {
      store.drawer = null;
      scrim.remove();
      drawer.remove();
      if (window.location.hash.startsWith('#/task/')) window.location.hash = '';
    };
    const scrim = el('div', { class: 'scrim', onclick: close });
    const drawer = taskDrawer(ctx(), task, close);
    document.querySelectorAll('.drawer, .scrim').forEach((n) => n.remove());
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
  } catch (err) {
    store.drawer = null;
    ctx().notifyError(err);
  }
}

function openNewTask() {
  const c = ctx();
  const title = el('input', { placeholder: t('title') });
  const titleAr = el('input', { placeholder: t('titleAr'), dir: 'rtl' });
  const desc = el('textarea', {});
  const assignee = el('select', {});
  assignee.appendChild(el('option', { value: '' }, [t('unassigned')]));
  for (const u of c.users) assignee.appendChild(el('option', { value: u.id }, [lang.lang === 'ar' ? u.name_ar || u.name : u.name]));
  const priority = el('select', {});
  for (const p of c.priorities) priority.appendChild(el('option', { value: p, selected: p === 'Medium' }, [priorityLabel(p)]));
  const due = el('input', { type: 'date' });
  const err = el('div', { class: 'error hidden' });

  const close = () => { scrim.remove(); modal.remove(); };
  const scrim = el('div', { class: 'scrim', onclick: close });
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-card' }, [
      el('div', { class: 'modal-head' }, [ic('plus'), el('h2', {}, [t('newTask')])]),
      el('div', { class: 'modal-body' }, [
        err,
        el('div', { class: 'field' }, [el('label', {}, [t('title')]), title]),
        el('div', { class: 'field' }, [el('label', {}, [t('titleAr')]), titleAr]),
        el('div', { class: 'field' }, [el('label', {}, [t('description')]), desc]),
        el('div', { class: 'grid g2' }, [
          el('div', { class: 'field' }, [el('label', {}, [t('assignee')]), assignee]),
          el('div', { class: 'field' }, [el('label', {}, [t('priority')]), priority]),
          el('div', { class: 'field' }, [el('label', {}, [t('due')]), due]),
        ]),
      ]),
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn ghost', onclick: close }, [t('cancel')]),
        el('button', {
          class: 'btn primary',
          onclick: async (e) => {
            if (!title.value.trim()) { err.textContent = t('title'); err.classList.remove('hidden'); return; }
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              const res = await api.createTask({
                title: title.value.trim(),
                titleAr: titleAr.value.trim(),
                description: desc.value,
                assignee: assignee.value || null,
                priority: priority.value,
                dueDate: due.value || null,
              });
              close();
              await loadTasks();
              render();
              openTask(res.task.id);
            } catch (error) {
              err.textContent = error.body?.error || error.message;
              err.classList.remove('hidden');
              btn.disabled = false;
            }
          },
        }, [ic('check'), t('save')]),
      ]),
    ]),
  ]);
  document.body.appendChild(scrim);
  document.body.appendChild(modal);
  title.focus();
}

/* --------------------------------------------------------------- session --- */

async function loadTasks() {
  const data = await api.tasks({});
  store.tasks = data.tasks || [];
  return store.tasks;
}

async function signOut() {
  try { await api.logout(); } catch { /* the cookie is cleared either way */ }
  live.shutdown();
  setToken('');
  store.user = null;
  document.querySelectorAll('.drawer, .scrim, .modal').forEach((n) => n.remove());
  renderLogin();
}

async function start() {
  const boot = await api.bootstrap();
  store.boot = boot;
  store.user = boot.user;
  setLang(boot.user.lang);
  ring.setMuted(!boot.user.prefs.inApp.sound);
  ring.armAutoUnlock();

  center = createNotificationCenter({
    onOpenTask: (id) => openTask(id),
    onViewAll: () => { store.view = 'notifications'; render(); },
  });

  live.connect();
  live.onConnectionChange((connected) => {
    const pill = document.getElementById('connPill');
    if (pill) {
      pill.textContent = connected ? t('connected') : t('disconnected');
      pill.title = pill.textContent;
    }
  });
  /* A notification can change what a list should show, so the board refreshes
     with the bell rather than waiting for the person to hit reload. */
  live.on('notification', () => { loadTasks().then(renderStage).catch(() => {}); });

  await loadTasks();
  await center.refresh();

  const hash = window.location.hash;
  if (hash.startsWith('#/task/')) store.drawer = decodeURIComponent(hash.slice(7));

  render();
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  if (hash.startsWith('#/task/')) {
    const id = decodeURIComponent(hash.slice(7));
    if (id !== store.drawer) openTask(id);
  }
});

/* A tab that comes back into focus may have missed events while suspended. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.user) {
    center?.refresh();
    if (!live.isConnected()) live.connect();
  }
});

(async function boot() {
  if (!getToken()) { renderLogin(); return; }
  try {
    await api.me();
    await start();
  } catch {
    setToken('');
    renderLogin();
  }
}());
