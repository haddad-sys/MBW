import { api } from './api.js';
import { el, ic, mount, initials } from './dom.js';
import { t, state as lang, pick, priorityLabel } from './i18n.js';
import { when } from './notifications.js';
import * as ring from './ring.js';

/* Rendering. Every view is a function of (context) -> element, where context
   carries the bootstrap reference data and the callbacks the shell owns. */

export function userName(ctx, id) {
  const u = ctx.usersById.get(id);
  if (!u) return t('unassigned');
  return lang.lang === 'ar' ? u.name_ar || u.name : u.name;
}

export function statusLabel(ctx, id) {
  const s = ctx.statusById.get(id);
  return s ? pick(s, 'name', 'name_ar') : id;
}

export function taskTitle(task) {
  return lang.lang === 'ar' ? task.titleAr || task.title : task.title;
}

function duePill(task) {
  if (!task.dueDate) return null;
  const cls = task.overdue ? 'pill overdue' : (task.dueSoon ? 'pill duesoon' : 'pill');
  const label = `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`;
  return el('span', { class: cls }, [ic('clock'), label]);
}

export function taskRow(ctx, task) {
  const status = ctx.statusById.get(task.status);
  const done = status?.kind === 'closed';
  const check = el('button', {
    class: `tcheck${done ? ' on' : ''}`,
    title: t('completed'),
    onclick: async (e) => {
      e.stopPropagation();
      if (task.access !== 'edit') return;
      try {
        await api.updateTask(task.id, { status: done ? 'progress' : 'done', progress: done ? task.progress : 100 });
        ctx.reload();
      } catch (err) { ctx.notifyError(err); }
    },
  }, [ic('check')]);

  return el('div', {
    class: `trow p-${task.priority}${done ? ' done' : ''}`,
    onclick: () => ctx.openTask(task.id),
  }, [
    check,
    el('div', { class: 'tmain' }, [
      el('div', { class: 'ttitle' }, [taskTitle(task)]),
      el('div', { class: 'tmeta' }, [
        el('span', { class: 'mono' }, [task.id]),
        el('span', { class: `pill k-${status?.kind || 'open'}` }, [statusLabel(ctx, task.status)]),
        task.priority !== 'Medium' ? el('span', { class: `pill p-${task.priority}` }, [priorityLabel(task.priority)]) : null,
        duePill(task),
        task.assignee ? el('span', {}, [`${t('assignee')}: ${userName(ctx, task.assignee)}`]) : null,
        task.watchers?.includes(ctx.user.id) ? el('span', { class: 'pill', title: t('following_') }, [ic('eye'), String(task.watchers.length)]) : null,
        task.access === 'view' ? el('span', { class: 'pill' }, [t('readOnly')]) : null,
      ]),
    ]),
    el('div', { class: 'tright' }, [
      el('div', { class: 'progress', title: `${task.progress}%` }, [el('i', { style: { width: `${task.progress}%` } })]),
    ]),
  ]);
}

export function taskListView(ctx, tasks, { title, icon = 'list', tiles = false } = {}) {
  const stack = el('div', { class: 'stack' });

  if (tiles) {
    const open = tasks.filter((x) => !x.closed);
    const overdue = tasks.filter((x) => x.overdue);
    const today = tasks.filter((x) => x.dueDate === new Date().toISOString().slice(0, 10) && !x.closed);
    const done = tasks.filter((x) => x.closed);
    stack.appendChild(el('div', { class: 'grid g4' }, [
      tile('acc', open.length, t('open'), () => ctx.setFilter({ open: true })),
      tile('crit', overdue.length, t('overdue'), () => ctx.setFilter({ overdue: true })),
      tile('warn', today.length, t('dueToday'), () => ctx.setFilter({ today: true })),
      tile('ok', done.length, t('completed'), () => ctx.setFilter({ done: true })),
    ]));
  }

  const list = el('div', { class: 'tasklist' });
  if (tasks.length === 0) {
    list.appendChild(el('div', { class: 'empty' }, [
      ic(icon), el('h3', {}, [t('noTasks')]), el('p', {}, [t('noTasksSub')]),
    ]));
  } else {
    for (const task of tasks) list.appendChild(taskRow(ctx, task));
  }

  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      ic(icon), el('h2', {}, [title]),
      el('div', { class: 'spacer' }),
      el('span', { class: 'dim mono', style: { fontSize: '12px' } }, [String(tasks.length)]),
    ]),
    el('div', { class: 'card-body' }, [list]),
  ]));
  return stack;
}

function tile(kind, value, label, onclick) {
  return el('button', { class: `tile ${kind}`, onclick }, [
    el('div', { class: 'tv' }, [String(value)]),
    el('div', { class: 'tl' }, [label]),
  ]);
}

/* ---------------------------------------------------------- task drawer --- */

export function taskDrawer(ctx, task, onClose) {
  const canEdit = task.access === 'edit';
  const body = el('div', { class: 'drawer-body' });

  const drawer = el('div', { class: 'drawer', role: 'dialog', 'aria-label': taskTitle(task) }, [
    el('div', { class: 'drawer-head' }, [
      el('span', { class: 'mono dim', style: { fontSize: '12px' } }, [task.id]),
      el('div', { class: 'spacer' }),
      !canEdit ? el('span', { class: 'pill' }, [t('readOnly')]) : null,
      el('button', { class: 'icon-btn', title: t('close'), onclick: onClose }, [ic('close')]),
    ]),
    body,
  ]);

  /* ---- headline and the fields people change most often ---- */
  const titleInput = el('input', { value: task.title, disabled: !canEdit });
  const titleArInput = el('input', { value: task.titleAr || '', disabled: !canEdit, dir: 'rtl' });
  const descInput = el('textarea', { disabled: !canEdit }, [task.description || '']);
  const statusSel = select(ctx.statuses.map((s) => [s.id, pick(s, 'name', 'name_ar')]), task.status, !canEdit);
  const prioSel = select(ctx.priorities.map((p) => [p, priorityLabel(p)]), task.priority, !canEdit);
  const assigneeSel = select([['', t('unassigned')], ...ctx.users.map((u) => [u.id, lang.lang === 'ar' ? u.name_ar || u.name : u.name])], task.assignee || '', !canEdit);
  const dueInput = el('input', { type: 'date', value: task.dueDate || '', disabled: !canEdit });
  const timeInput = el('input', { type: 'time', value: task.dueTime || '', disabled: !canEdit });
  const progInput = el('input', { type: 'number', min: '0', max: '100', value: String(task.progress), disabled: !canEdit });

  const saveBtn = el('button', {
    class: 'btn primary',
    disabled: !canEdit,
    onclick: async () => {
      saveBtn.disabled = true;
      try {
        await api.updateTask(task.id, {
          title: titleInput.value.trim(),
          titleAr: titleArInput.value.trim(),
          description: descInput.value,
          status: statusSel.value,
          priority: prioSel.value,
          assignee: assigneeSel.value || null,
          dueDate: dueInput.value || null,
          dueTime: timeInput.value || null,
          progress: Number(progInput.value) || 0,
        });
        ctx.toast(t('prefsSaved'));
        ctx.reload();
        ctx.openTask(task.id);
      } catch (err) {
        ctx.notifyError(err);
      } finally {
        saveBtn.disabled = !canEdit;
      }
    },
  }, [ic('check'), t('save')]);

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-body' }, [
      field(t('title'), titleInput),
      field(t('titleAr'), titleArInput),
      field(t('description'), descInput),
      el('div', { class: 'grid g2' }, [
        field(t('status'), statusSel),
        field(t('priority'), prioSel),
        field(t('assignee'), assigneeSel),
        field(t('progress'), progInput),
        field(t('due'), dueInput),
        field(t('time'), timeInput),
      ]),
      el('div', { class: 'row', style: { marginTop: '10px' } }, [saveBtn]),
    ]),
  ]));

  /* ---- المتابعون: the follow-up list this whole console is named for ---- */
  const followState = task.watchers.includes(ctx.user.id);
  const watcherWrap = el('div', { class: 'row' });
  const addSel = select([['', t('addWatcher')], ...ctx.users.map((u) => [u.id, lang.lang === 'ar' ? u.name_ar || u.name : u.name])], '', !canEdit);

  function renderWatchers(watchers) {
    mount(watcherWrap, watchers.map((w) => el('span', { class: 'watcher' }, [
      el('span', { class: 'avatar sm' }, [initials(w.name)]),
      lang.lang === 'ar' ? w.name_ar || w.name : w.name,
      (canEdit || w.id === ctx.user.id) ? el('button', {
        title: t('remove'),
        onclick: async () => {
          try {
            const res = await api.removeWatcher(task.id, w.id);
            renderWatchers(res.watchers);
            ctx.reload();
          } catch (err) { ctx.notifyError(err); }
        },
      }, [ic('close')]) : null,
    ])));
    if (watchers.length === 0) watcherWrap.appendChild(el('span', { class: 'dim', style: { fontSize: '12px' } }, [t('notFollowing')]));
  }

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('eye'), el('h2', {}, [t('watchers')])]),
    el('div', { class: 'card-body', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
      watcherWrap,
      el('div', { class: 'row' }, [
        el('button', {
          class: `chipbtn${followState ? ' on' : ''}`,
          onclick: async (e) => {
            /* currentTarget is only valid while the event is dispatching, so
               the node is captured before the first await. */
            const btn = e.currentTarget;
            try {
              const res = followState
                ? await api.removeWatcher(task.id, ctx.user.id)
                : await api.addWatcher(task.id, null);
              renderWatchers(res.watchers);
              btn.classList.toggle('on');
              ctx.reload();
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('eye'), followState ? t('unfollow') : t('follow')]),
        canEdit ? addSel : null,
        canEdit ? el('button', {
          class: 'btn sm',
          onclick: async () => {
            if (!addSel.value) return;
            try {
              const res = await api.addWatcher(task.id, addSel.value);
              renderWatchers(res.watchers);
              addSel.value = '';
              ctx.reload();
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('plus'), t('add')]) : null,
      ]),
    ]),
  ]));
  api.watchers(task.id).then((r) => renderWatchers(r.watchers)).catch(() => renderWatchers([]));

  /* ---- checklist ---- */
  const checkWrap = el('div', {});
  const checkInput = el('input', { placeholder: t('addItem'), disabled: !canEdit });
  function renderChecklist(list) {
    mount(checkWrap, list.map((item) => el('div', { class: 'switchrow' }, [
      el('button', {
        class: `tcheck${item.done ? ' on' : ''}`,
        disabled: !canEdit,
        onclick: async () => {
          try {
            await api.toggleChecklist(task.id, item.id, !item.done);
            item.done = item.done ? 0 : 1;
            renderChecklist(list);
          } catch (err) { ctx.notifyError(err); }
        },
      }, [ic('check')]),
      el('div', { class: 'sl' }, [el('b', { style: { fontWeight: '500', textDecoration: item.done ? 'line-through' : 'none' } }, [item.text])]),
      canEdit ? el('button', {
        class: 'btn ghost sm',
        onclick: async () => {
          try {
            await api.deleteChecklist(task.id, item.id);
            renderChecklist(list.filter((x) => x.id !== item.id));
          } catch (err) { ctx.notifyError(err); }
        },
      }, [ic('close')]) : null,
    ])));
  }
  renderChecklist(task.checklist || []);
  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('check'), el('h2', {}, [t('checklist')])]),
    el('div', { class: 'card-body' }, [
      checkWrap,
      canEdit ? el('div', { class: 'row', style: { marginTop: '10px' } }, [
        el('div', { class: 'field', style: { flex: '1', margin: '0' } }, [checkInput]),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            const text = checkInput.value.trim();
            if (!text) return;
            try {
              const res = await api.addChecklist(task.id, text);
              checkInput.value = '';
              renderChecklist([...(task.checklist || []), res.item]);
              task.checklist = [...(task.checklist || []), res.item];
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('plus'), t('add')]),
      ]) : null,
    ]),
  ]));

  /* ---- comments ---- */
  const commentWrap = el('div', {});
  const commentInput = el('textarea', { placeholder: t('addComment'), disabled: !canEdit });
  function renderComments(list) {
    mount(commentWrap, list.length === 0
      ? [el('div', { class: 'dim', style: { fontSize: '12.5px' } }, ['—'])]
      : list.map((c) => el('div', { class: 'comment' }, [
        el('span', { class: 'avatar sm' }, [initials(c.user_name || '?')]),
        el('div', { class: 'cb' }, [
          el('div', { class: 'ch' }, [`${lang.lang === 'ar' ? c.user_name_ar || c.user_name : c.user_name || '—'} · ${when(c.created_at)}`]),
          el('div', { class: 'cx' }, [c.text]),
        ]),
      ])));
  }
  renderComments(task.comments || []);
  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('chat'), el('h2', {}, [t('comments')])]),
    el('div', { class: 'card-body' }, [
      commentWrap,
      canEdit ? el('div', { style: { marginTop: '10px' } }, [
        el('div', { class: 'field', style: { margin: '0 0 8px' } }, [commentInput]),
        el('button', {
          class: 'btn primary sm',
          onclick: async () => {
            const text = commentInput.value.trim();
            if (!text) return;
            try {
              const res = await api.comment(task.id, text);
              commentInput.value = '';
              task.comments = [...(task.comments || []), { ...res.comment, user_name: ctx.user.name, user_name_ar: ctx.user.nameAr }];
              renderComments(task.comments);
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('chat'), t('send')]),
      ]) : null,
    ]),
  ]));

  /* ---- reminders ---- */
  const remWrap = el('div', {});
  const remInput = el('input', { type: 'datetime-local' });
  function renderReminders(list) {
    mount(remWrap, list.length === 0
      ? [el('div', { class: 'dim', style: { fontSize: '12.5px' } }, ['—'])]
      : list.map((r) => el('div', { class: 'switchrow' }, [
        el('div', { class: 'sl' }, [
          el('b', {}, [new Date(r.fire_at).toLocaleString(lang.lang === 'ar' ? 'ar' : 'en-GB')]),
          el('span', {}, [r.fired ? '✓' : (r.auto ? 'auto' : '')]),
        ]),
        el('button', {
          class: 'btn ghost sm',
          onclick: async () => {
            try {
              await api.deleteReminder(task.id, r.id);
              renderReminders(list.filter((x) => x.id !== r.id));
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('close')]),
      ])));
  }
  renderReminders(task.reminders || []);
  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('clock'), el('h2', {}, [t('reminders')])]),
    el('div', { class: 'card-body' }, [
      remWrap,
      el('div', { class: 'row', style: { marginTop: '10px' } }, [
        el('div', { class: 'field', style: { flex: '1', margin: '0' } }, [remInput]),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            if (!remInput.value) return;
            try {
              const res = await api.addReminder(task.id, new Date(remInput.value).getTime());
              task.reminders = [...(task.reminders || []), res.reminder];
              renderReminders(task.reminders);
              remInput.value = '';
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('plus'), t('addReminder')]),
      ]),
    ]),
  ]));

  return drawer;
}

export function field(label, input) {
  return el('div', { class: 'field' }, [el('label', {}, [label]), input]);
}

export function select(options, value, disabled = false) {
  const sel = el('select', { disabled });
  for (const [v, label] of options) {
    sel.appendChild(el('option', { value: v, selected: String(v) === String(value) }, [label]));
  }
  sel.value = value ?? '';
  return sel;
}

/* ------------------------------------------------------------- settings --- */

export function settingsView(ctx) {
  const prefs = JSON.parse(JSON.stringify(ctx.user.prefs));
  const stack = el('div', { class: 'stack' });

  const status = el('div', { class: 'hint' });
  function say(message) { status.textContent = message; }

  async function save() {
    try {
      const res = await api.savePrefs(prefs);
      ctx.user.prefs = res.prefs;
      say(t('prefsSaved'));
    } catch (err) { ctx.notifyError(err); }
  }

  /* ---- in-app + the ring ---- */
  const soundRow = switchRow(t('soundOn'), t('soundOnSub'), prefs.inApp.sound, async (on) => {
    prefs.inApp.sound = on;
    ring.setMuted(!on);
    if (on) { await ring.unlock(); ring.ring('default'); }
    save();
  });

  const desktopRow = switchRow(t('desktopOn'), t('desktopOnSub'), prefs.inApp.desktop, async (on, input) => {
    if (on) {
      const permission = await ring.requestDesktopPermission();
      if (permission !== 'granted') {
        input.checked = false;
        prefs.inApp.desktop = false;
        say(t('permissionDenied'));
        save();
        return;
      }
    }
    prefs.inApp.desktop = on;
    save();
  });

  const ringState = el('div', { class: 'hint' });
  ring.onRingState((s) => {
    ringState.textContent = !s.supported
      ? '—'
      : (s.muted ? '' : (s.unlocked ? t('soundReady') : t('enableSoundSub')));
  });

  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('bell'), el('h2', {}, [t('inAppNotif')])]),
    el('div', { class: 'card-body' }, [
      el('p', { class: 'hint', style: { marginTop: '0' } }, [t('inAppNotifSub')]),
      switchRow(t('inAppNotif'), '', prefs.inApp.enabled, (on) => { prefs.inApp.enabled = on; save(); }),
      soundRow,
      desktopRow,
      el('div', { class: 'row', style: { marginTop: '10px' } }, [
        el('button', {
          class: 'btn sm',
          onclick: async () => { await ring.unlock(); ring.ring('default'); },
        }, [ic('volume'), t('enableSound')]),
        ringState,
      ]),
      el('div', { style: { marginTop: '12px' } }, [
        el('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, [t('events')]),
        ...ctx.notifyEvents.map((key) => switchRow(t(`ev_${key}`), '', prefs.inApp.events[key] !== false, (on) => {
          prefs.inApp.events[key] = on;
          save();
        })),
      ]),
    ]),
  ]));

  /* ---- email ---- */
  const modeSel = select([['all', t('emailAll')], ['critical', t('emailCritical')], ['off', t('emailOff')]], prefs.email.mode);
  modeSel.addEventListener('change', () => { prefs.email.mode = modeSel.value; save(); });

  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('mail'), el('h2', {}, [t('emailNotif')])]),
    el('div', { class: 'card-body' }, [
      field(t('emailMode'), modeSel),
      el('div', { style: { marginTop: '6px' } }, [
        el('div', { class: 'eyebrow', style: { marginBottom: '4px' } }, [t('events')]),
        ...ctx.notifyEvents.map((key) => switchRow(t(`ev_${key}`), '', prefs.email.events[key] !== false, (on) => {
          prefs.email.events[key] = on;
          save();
        })),
      ]),
    ]),
  ]));

  /* ---- quiet hours ---- */
  const fromInput = el('input', { type: 'time', value: prefs.quiet.from });
  const toInput = el('input', { type: 'time', value: prefs.quiet.to });
  for (const input of [fromInput, toInput]) {
    input.addEventListener('change', () => {
      prefs.quiet.from = fromInput.value || '21:00';
      prefs.quiet.to = toInput.value || '07:00';
      save();
    });
  }
  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('moon'), el('h2', {}, [t('quietHours')])]),
    el('div', { class: 'card-body' }, [
      el('p', { class: 'hint', style: { marginTop: '0' } }, [t('quietSub')]),
      switchRow(t('quietHours'), '', prefs.quiet.enabled, (on) => { prefs.quiet.enabled = on; save(); }),
      el('div', { class: 'grid g2' }, [field(t('from'), fromInput), field(t('to'), toInput)]),
    ]),
  ]));

  /* ---- prove it works ---- */
  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('bolt'), el('h2', {}, [t('testNotif')])]),
    el('div', { class: 'card-body' }, [
      el('p', { class: 'hint', style: { marginTop: '0' } }, [t('testNotifSub')]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn primary',
          onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            /* The click is the gesture that earns the right to make a sound, so
               the context is unlocked before the notification comes back. */
            await ring.unlock();
            try {
              await api.testNotification();
              say(t('testSent'));
            } catch (err) { ctx.notifyError(err); } finally { btn.disabled = false; }
          },
        }, [ic('bell'), t('testNotif')]),
        status,
      ]),
    ]),
  ]));

  /* ---- profile ---- */
  const nameInput = el('input', { value: ctx.user.name });
  const nameArInput = el('input', { value: ctx.user.nameAr || '', dir: 'rtl' });
  const langSel = select([['ar', 'العربية'], ['en', 'English']], ctx.user.lang);
  const curPw = el('input', { type: 'password', autocomplete: 'current-password' });
  const newPw = el('input', { type: 'password', autocomplete: 'new-password' });
  const pwStatus = el('div', { class: 'hint' });

  stack.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [ic('mine'), el('h2', {}, [t('profile')])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'grid g2' }, [field(t('name'), nameInput), field(t('nameAr'), nameArInput), field(t('language'), langSel)]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              const res = await api.saveProfile({ name: nameInput.value, nameAr: nameArInput.value, lang: langSel.value });
              ctx.onUserUpdated(res.user);
              say(t('prefsSaved'));
            } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('check'), t('save')]),
      ]),
      el('div', { class: 'eyebrow', style: { marginTop: '16px', marginBottom: '6px' } }, [t('changePassword')]),
      el('div', { class: 'grid g2' }, [field(t('currentPassword'), curPw), field(t('newPassword'), newPw)]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn',
          onclick: async () => {
            try {
              await api.changePassword(curPw.value, newPw.value);
              curPw.value = ''; newPw.value = '';
              pwStatus.textContent = t('passwordChanged');
            } catch (err) { pwStatus.textContent = err.body?.error || err.message; }
          },
        }, [t('changePassword')]),
        pwStatus,
      ]),
    ]),
  ]));

  return stack;
}

export function switchRow(label, sub, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked, input));
  return el('div', { class: 'switchrow' }, [
    el('div', { class: 'sl' }, [el('b', {}, [label]), sub ? el('span', {}, [sub]) : null]),
    el('label', { class: 'switch' }, [input, el('i', {})]),
  ]);
}

/* ------------------------------------------------------------ email log --- */

export function emailLogView(ctx, data) {
  const rows = data.emails || [];
  const table = el('table', { class: 'tbl' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, [t('recipient')]), el('th', {}, [t('subject')]),
      el('th', {}, ['kind']), el('th', {}, [t('state')]), el('th', {}, [t('sentAt')]),
    ])]),
    el('tbody', {}, rows.map((m) => el('tr', {}, [
      el('td', { class: 'mono', style: { fontSize: '11.5px' } }, [m.to_email]),
      el('td', {}, [m.subject]),
      el('td', {}, [t(`k_${m.kind}`)]),
      el('td', { class: `state-${m.state}` }, [t(`st_${m.state}`) || m.state, m.error ? el('div', { class: 'dim', style: { fontSize: '10.5px' } }, [m.error]) : null]),
      el('td', { class: 'mono', style: { fontSize: '11px' } }, [m.sent_at ? when(m.sent_at) : when(m.created_at)]),
    ]))),
  ]);

  return el('div', { class: 'stack' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        ic('mail'), el('h2', {}, [t('emailLog')]),
        el('div', { class: 'spacer' }),
        el('span', { class: 'pill' }, [`${t('mailTransport')}: ${data.transport}`]),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            try {
              const res = await api.verifyMail();
              ctx.toast(res.ok ? `${t('mailTransport')}: ${res.transport} ✓` : res.error);
            } catch (err) { ctx.notifyError(err); }
          },
        }, [t('verifyMail')]),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            try { const res = await api.flushMail(); ctx.toast(`${res.sent} ✓ / ${res.failed} ✗`); ctx.reload(); } catch (err) { ctx.notifyError(err); }
          },
        }, [t('sendQueued')]),
        el('button', {
          class: 'btn sm',
          onclick: async () => {
            try { await api.runTick(); ctx.toast(t('engineRan')); ctx.reload(); } catch (err) { ctx.notifyError(err); }
          },
        }, [ic('bolt'), t('runTick')]),
      ]),
      el('div', { class: 'card-body tblwrap' }, [
        rows.length ? table : el('div', { class: 'empty' }, [ic('mail'), el('h3', {}, ['—'])]),
      ]),
    ]),
  ]);
}
