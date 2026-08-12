import { api } from './api.js';
import { el, ic, mount, clear } from './dom.js';
import { t, state as lang } from './i18n.js';
import * as ring from './ring.js';
import * as live from './live.js';

/* The notification centre: the bell, its panel, and the toasts that appear with
   the chime. One module owns every surface a notification can reach, so the
   badge, the panel, the toast and the sound can never disagree about what
   arrived. */

const KIND_ICON = {
  assign: 'mine', reassign: 'mine', reminder: 'clock', due: 'clock', overdue: 'alert',
  escalation: 'up', approval: 'check', mention: 'chat', comment: 'chat',
  complete: 'check', status: 'list', update: 'list', watch: 'eye', dependency: 'bolt', rule: 'bolt',
};

export function createNotificationCenter({ onOpenTask, onViewAll }) {
  let unread = 0;
  let items = [];
  let open = false;
  let ringTimer = null;

  const badge = el('span', { class: 'dot hidden' });
  const button = el('button', {
    class: 'icon-btn',
    title: t('notifications'),
    'aria-label': t('notifications'),
    onclick: () => togglePanel(),
  }, [ic('bell'), badge]);

  const list = el('div', { class: 'notif-list' });
  const panel = el('div', { class: 'notif-panel hidden', role: 'dialog', 'aria-label': t('notifications') }, [
    el('div', { class: 'notif-head' }, [
      el('b', { style: { fontSize: '13px' } }, [t('notifications')]),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn ghost sm', onclick: markAll }, [t('markAllRead')]),
      el('button', {
        class: 'btn ghost sm',
        onclick: () => { closePanel(); onViewAll?.(); },
      }, [t('viewAll')]),
    ]),
    list,
  ]);

  const toasts = el('div', { class: 'toasts' });

  document.addEventListener('click', (e) => {
    if (!open) return;
    if (panel.contains(e.target) || button.contains(e.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) closePanel(); });

  function setUnread(n) {
    unread = Math.max(0, Number(n) || 0);
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread === 0);
    const title = unread ? `${t('notifications')} (${unread})` : t('notifications');
    button.title = title;
    button.setAttribute('aria-label', title);
    document.title = unread ? `(${unread}) ${t('app')}` : t('app');
  }

  async function refresh() {
    try {
      const data = await api.notifications({ limit: 40 });
      items = data.notifications || [];
      setUnread(data.unread || 0);
      if (open) renderList();
    } catch { /* an offline poll is not worth surfacing */ }
  }

  function renderList() {
    if (items.length === 0) {
      mount(list, el('div', { class: 'empty' }, [ic('bell'), el('h3', {}, [t('noNotifications')])]));
      return;
    }
    mount(list, items.map(renderItem));
  }

  function renderItem(n) {
    const title = t(`k_${n.kind}`);
    const text = lang.lang === 'ar' ? n.text_ar || n.text : n.text;
    const node = el('div', {
      class: `notif${n.read ? '' : ' unread'}`,
      onclick: async () => {
        if (!n.read) {
          n.read = 1;
          node.classList.remove('unread');
          try {
            const res = await api.markRead([n.id]);
            setUnread(res.unread);
          } catch { /* the badge will resync on the next poll */ }
        }
        if (n.task) { closePanel(); onOpenTask?.(n.task); }
      },
    }, [
      el('div', { class: `notif-kind k-${n.kind}` }, [ic(KIND_ICON[n.kind] || 'bell')]),
      el('div', { class: 'notif-b' }, [
        el('div', { class: 'notif-t' }, [title]),
        el('div', { class: 'notif-x' }, [text || '']),
        el('div', { class: 'notif-w' }, [`${n.task ? `${n.task} · ` : ''}${when(n.created_at || n.at)}`]),
      ]),
    ]);
    return node;
  }

  function togglePanel() {
    if (open) closePanel(); else openPanel();
  }

  function openPanel() {
    open = true;
    panel.classList.remove('hidden');
    button.classList.add('on');
    renderList();
    refresh();
  }

  function closePanel() {
    open = false;
    panel.classList.add('hidden');
    button.classList.remove('on');
  }

  async function markAll() {
    try {
      await api.markAllRead();
      items = items.map((n) => ({ ...n, read: 1 }));
      setUnread(0);
      renderList();
    } catch { /* leave the panel as it is */ }
  }

  /* Everything a new notification does, in one place: badge, list, bell shake,
     chime, toast and — if permitted — a desktop popup. */
  function receive(payload) {
    if (!payload || !payload.id) return;
    items = [{
      id: payload.id,
      kind: payload.kind,
      task: payload.task,
      text: payload.text,
      text_ar: payload.textAr,
      created_at: payload.at,
      read: 0,
    }, ...items].slice(0, 60);
    setUnread(unread + 1);
    if (open) renderList();

    shake();
    if (payload.sound !== false) ring.ring(payload.kind);
    toast(payload);
    if (payload.desktop) {
      ring.showDesktop(`${t('app')} · ${t(`k_${payload.kind}`)}`, lang.lang === 'ar' ? payload.textAr || payload.text : payload.text, payload.task || payload.id);
    }
  }

  function shake() {
    button.classList.remove('ringing');
    /* Restart the animation rather than letting a second arrival be swallowed
       by the one already running. */
    void button.offsetWidth;
    button.classList.add('ringing');
    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => button.classList.remove('ringing'), 1000);
  }

  function toast(payload) {
    const severity = payload.kind === 'overdue' || payload.kind === 'escalation'
      ? 'crit'
      : (payload.kind === 'reminder' || payload.kind === 'due' ? 'warn' : '');
    const node = el('div', {
      class: `toast ${severity}`,
      onclick: () => {
        node.remove();
        if (payload.task) onOpenTask?.(payload.task);
      },
    }, [
      el('div', { class: `notif-kind k-${payload.kind}` }, [ic(KIND_ICON[payload.kind] || 'bell')]),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { class: 'toast-t' }, [t(`k_${payload.kind}`)]),
        el('div', { class: 'toast-x' }, [lang.lang === 'ar' ? payload.textAr || payload.text : payload.text]),
      ]),
    ]);
    toasts.appendChild(node);
    setTimeout(() => node.remove(), payload.kind === 'escalation' ? 15000 : 8000);
    while (toasts.childElementCount > 4) toasts.firstElementChild.remove();
  }

  live.on('notification', receive);
  live.on('badge', (payload) => setUnread(payload?.unread ?? unread));
  live.on('hello', (payload) => setUnread(payload?.unread ?? 0));

  return {
    button,
    panel,
    toasts,
    refresh,
    receive,
    closePanel,
    get unread() { return unread; },
    destroy() { clearTimeout(ringTimer); clear(list); },
  };
}

export function when(ms) {
  if (!ms) return '';
  const diff = Date.now() - Number(ms);
  const mins = Math.round(diff / 60000);
  const ar = lang.lang === 'ar';
  if (mins < 1) return ar ? 'الآن' : 'just now';
  if (mins < 60) return ar ? `قبل ${mins} د` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return ar ? `قبل ${hrs} س` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return ar ? `قبل ${days} ي` : `${days}d ago`;
  return new Date(Number(ms)).toISOString().slice(0, 10);
}
