/* ===========================================================================
   متابِع — the working screens: dashboard, tasks, entities, the record,
   the form, the library, reports and the notification centre.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, U = window.UI, T = window.ST;
  var h = U.h, ic = U.ic, mount = U.mount, api = M.api;
  var S = T.S, C = T.C, P = T.P;
  var toAr = M.toAr, fmtDate = M.fmtDate, fmtWhen = M.fmtWhen;
  var isDone = T.isDone, isParked = T.isParked, isActive = T.isActive, isOD = T.isOD, dueLabel = T.dueLabel;

  var INP = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';
  var API_ERRORS = {
    forbidden: 'لا تملك صلاحية لهذا الإجراء',
    approval_required: 'هذه الخطوة تتطلب صلاحية الاعتماد',
    forbidden_entity: 'لا تملك صلاحية على هذا الفرع',
    title_required: 'العنوان مطلوب',
    category_required: 'اختر التصنيف',
    entity_required: 'اختر الجهة',
    text_required: 'اكتب النص أولاً',
    category_in_use: 'لا يمكن حذف تصنيف به ملاحظات',
    not_found: 'العنصر غير موجود',
    last_administrator: 'يجب إبقاء حساب مدير واحد على الأقل',
    already_exists: 'اسم المستخدم أو البريد مستخدم',
    payload_too_large: 'الملف كبير جداً',
    files_too_large: 'الملف كبير جداً',
    cannot_delete_self: 'لا يمكن حذف حسابك الحالي',
    cannot_disable_self: 'لا يمكن إيقاف حسابك الحالي',
  };
  function errText(err) { return API_ERRORS[err && err.code] || 'تعذّر تنفيذ الطلب'; }

  /* ── navigation ───────────────────────────────── */
  function cur() { return S.stack[S.stack.length - 1]; }
  function go(view, param) { S.stack.push({ view: view, param: param }); window.scrollTo(0, 0); render(); }
  function back() { if (S.stack.length > 1) S.stack.pop(); window.scrollTo(0, 0); render(); }
  function goTab(view, param) { S.stack = [{ view: view, param: param }]; window.scrollTo(0, 0); render(); }
  function replace(view, param) { S.stack[S.stack.length - 1] = { view: view, param: param }; window.scrollTo(0, 0); render(); }
  function local(defaults) {
    var f = cur();
    if (!f.local) f.local = Object.assign({}, defaults);
    return f.local;
  }
  function sub(name, defaults) {
    var f = cur();
    if (!f.locals) f.locals = {};
    if (!f.locals[name]) f.locals[name] = Object.assign({}, defaults);
    return f.locals[name];
  }
  function render() { window.APP.render(); }

  /* ── chrome ───────────────────────────────────── */
  var toastTimer = null;
  function toast(text) {
    var host = document.getElementById('toastHost');
    if (!host) return;
    mount(host, h('div', { class: 'bg-slate-900 text-white text-sm rounded-xl px-4 py-2 shadow-lg max-w-xs text-center' }, text));
    host.className = 'fixed bottom-24 left-0 right-0 flex justify-center z-50 pointer-events-none px-4';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { mount(host, []); }, 2600);
  }
  function fail(err) { toast(errText(err)); console.error('[mutabea]', err); }

  function ringBell() {
    var b = document.getElementById('bellBtn');
    if (!b) return;
    b.classList.remove('ringing');
    void b.offsetWidth;
    b.classList.add('ringing');
    setTimeout(function () { b.classList.remove('ringing'); }, 1000);
  }

  function TopBar(opts) {
    return h('div', { class: 'sticky top-0 z-20 bg-gradient-to-l from-sky-500 to-blue-600 text-white px-4 pt-4 pb-3 shadow-md' }, [
      h('div', { class: 'flex items-center gap-2' }, [
        opts.onBack ? h('button', { class: 'p-1.5 rounded-xl bg-white/20 flex-shrink-0', 'aria-label': 'رجوع', onclick: opts.onBack }, [ic('arrowRight', 18)]) : null,
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'font-bold text-lg leading-tight truncate' }, opts.title),
          opts.subtitle ? h('div', { class: 'text-xs text-sky-200' }, opts.subtitle) : null
        ]),
        opts.right ? h('div', { class: 'flex-shrink-0 flex items-center gap-1' }, opts.right) : null,
        bellButton(),
        opts.label ? h('span', { class: 'text-xs bg-white/20 px-2 py-1 rounded-lg flex-shrink-0' }, opts.label) : null
      ])
    ]);
  }

  function bellButton() {
    return h('button', {
      class: 'p-1.5 rounded-xl bg-white/20 flex-shrink-0 relative', id: 'bellBtn', 'aria-label': 'الإشعارات',
      onclick: function (e) { e.stopPropagation(); M.Ring.unlock(); go('alerts'); }
    }, [
      ic('bell', 18),
      S.unread > 0 ? h('span', { class: 'badge-dot' }, toAr(S.unread > 99 ? 99 : S.unread)) : null
    ]);
  }

  function BottomNav() {
    var perms = P();
    var all = [
      { k: 'home', l: 'الرئيسية', i: 'home' }, { k: 'tasks', l: 'المهام', i: 'clipboard' },
      { k: 'entities', l: 'الجهات', i: 'building' }, { k: 'library', l: 'المكتبة', i: 'library' },
      { k: 'more', l: 'المزيد', i: 'grid' }
    ];
    var root = S.stack[0] && S.stack[0].view;
    return h('div', { class: 'fixed bottom-0 z-20 max-w-md mx-auto inset-x-0 bg-white border-t border-slate-200 h-16 flex items-center' },
      all.filter(function (t) { return t.k === 'more' || (perms.tabs && perms.tabs[t.k]); }).map(function (t) {
        var on = root === t.k;
        return h('button', {
          class: 'flex-1 flex flex-col items-center justify-center gap-0.5 h-full ' + (on ? 'text-sky-600' : 'text-slate-400'),
          onclick: function () { goTab(t.k); }
        }, [
          h('div', { class: 'relative' }, [
            ic(t.i, 20),
            (t.k === 'more' && S.pendingRegistrations > 0) ? h('span', { class: 'badge-dot' }, toAr(S.pendingRegistrations)) : null
          ]),
          h('span', { class: 'text-xs' }, t.l)
        ]);
      }));
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

  function openModal(title, body) {
    var node = h('div', { class: 'fixed inset-0 z-40 flex items-end mut-overlay', onclick: close }, [
      h('div', { class: 'absolute inset-0 bg-black/40' }),
      h('div', {
        class: 'relative w-full max-w-md mx-auto bg-white rounded-t-3xl p-6 sUp overflow-y-auto ns',
        style: { maxHeight: '88vh' },
        onclick: function (e) { e.stopPropagation(); }
      }, [h('h3', { class: 'font-bold text-slate-800 mb-4' }, title)].concat(Array.isArray(body) ? body : [body]))
    ]);
    function close() { node.remove(); }
    document.body.appendChild(node);
    return close;
  }

  function field(label, node) {
    return h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, label), node]);
  }
  function textInput(value, onInput, attrs) {
    var n = h('input', Object.assign({ class: INP, value: value === undefined || value === null ? '' : value }, attrs || {}));
    n.addEventListener('input', function () { onInput(n.value); });
    return n;
  }

  /* ── the card ─────────────────────────────────── */
  function IssueCard(issue, onClick) {
    var cfgC = C();
    var ent = T.entity(issue.entityId);
    var cat = ent && (ent.categories || []).find(function (c) { return c.id === issue.categoryId; });
    var dl = dueLabel(issue), ov = isOD(issue);
    var p = cfgC.P[issue.priority] || { bar: 'bg-slate-300' };
    var s = cfgC.S[issue.status] || { chip: M.CHIP.slate, label: issue.status };
    var cd = (issue.checklist || []).filter(function (c) { return c.done; }).length;
    var ct = (issue.checklist || []).length;
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
            (issue.comments || []).length > 0 ? h('span', { class: 'flex items-center gap-1' }, [ic('message', 10), toAr(issue.comments.length)]) : null
          ])
        ])
      ])
    ]);
  }

  /* ── home ─────────────────────────────────────── */
  function HomePage() {
    var cfgC = C();
    var week = Date.now() - 7 * 86400000;
    var list = S.issues;
    var active = list.filter(isActive);
    var overdue = list.filter(isOD);
    var gate = list.filter(function (i) { return cfgC.S[i.status] && cfgC.S[i.status].gate; });
    var doneW = list.filter(function (i) { return isDone(i.status) && i.updatedAt >= week; });
    var kpis = [
      { l: 'مهام نشطة', v: active.length, cls: 'bg-blue-50 text-blue-700 border-blue-100', f: 'active' },
      { l: 'متأخرة', v: overdue.length, cls: 'bg-rose-50 text-rose-700 border-rose-100', f: 'overdue' },
      { l: 'بانتظار الاعتماد', v: gate.length, cls: 'bg-amber-50 text-amber-700 border-amber-100', f: 'gate' },
      { l: 'أُنجزت هذا الأسبوع', v: doneW.length, cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', f: 'done' }
    ];
    var attn = overdue.concat(gate.filter(function (i) { return !isOD(i); })).slice(0, 4);
    var pieData = cfgC.statuses.map(function (s) {
      return { name: s.label, value: list.filter(function (i) { return i.status === s.key; }).length, color: M.HEX[s.color] || '#94a3b8' };
    }).filter(function (d) { return d.value > 0; });
    var barData = S.entities.map(function (e) {
      return { name: e.name.length > 7 ? e.name.slice(0, 7) : e.name, value: list.filter(function (i) { return i.entityId === e.id && isActive(i); }).length, color: '#0ea5e9' };
    });
    var priData = cfgC.priorities.map(function (p) {
      return { name: p.label, value: active.filter(function (i) { return i.priority === p.key; }).length, color: M.HEX[p.color] || '#94a3b8' };
    }).filter(function (d) { return d.value > 0; });

    return h('div', {}, [
      TopBar({ title: 'متابِع', subtitle: 'نظام متابعة المهام والملاحظات', label: S.user.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', {}, [
          h('div', { class: 'text-lg font-bold text-slate-800' }, 'مرحباً 👋 ' + S.user.name),
          h('div', { class: 'text-sm text-slate-500 mt-0.5' }, 'إليك ملخّص متابعاتك اليوم')
        ]),
        (P().manageUsers && S.pendingRegistrations > 0) ? h('button', {
          class: 'w-full bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-3 text-right',
          onclick: function () { go('settings', 'registrations'); }
        }, [
          h('div', { class: 'w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0' }, [ic('users', 19)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'font-semibold text-amber-800 text-sm' }, toAr(S.pendingRegistrations) + ' طلب تسجيل بانتظار اعتمادك'),
            h('div', { class: 'text-xs text-amber-700' }, 'اضغط للمراجعة')
          ]),
          ic('arrowRight', 16, 'text-amber-600')
        ]) : null,
        h('div', { class: 'grid grid-cols-2 gap-3' }, kpis.map(function (k) {
          return h('button', { class: 'p-3 rounded-2xl border text-right ' + k.cls, onclick: function () { goTab('tasks', k.f); } }, [
            h('div', { class: 'text-3xl font-extrabold' }, toAr(k.v)),
            h('div', { class: 'text-xs mt-0.5' }, k.l)
          ]);
        })),
        pieData.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'التوزيع حسب الحالة'),
          U.donut(pieData, 190),
          h('div', { class: 'flex flex-wrap gap-2 justify-center' }, pieData.map(function (d) {
            return h('span', { class: 'text-xs text-slate-500 flex items-center gap-1' }, [
              h('span', { class: 'rounded-full inline-block', style: { width: '10px', height: '10px', background: d.color } }),
              d.name + ' (' + toAr(d.value) + ')'
            ]);
          }))
        ]) : null,
        barData.some(function (d) { return d.value > 0; }) ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'المهام النشطة حسب الفرع'), U.hbars(barData)
        ]) : null,
        priData.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'المهام النشطة حسب الأولوية'), U.vbars(priData, 150)
        ]) : null,
        h('div', {}, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'إحصاءات الفروع'),
          h('div', { class: 'space-y-2' }, S.entities.map(function (e) {
            var ei = list.filter(function (i) { return i.entityId === e.id; });
            var tc = cfgC.E[e.type] || { icon: 'boxes', tint: M.TINT.slate, label: e.type };
            var aC = ei.filter(isActive).length, oC = ei.filter(isOD).length;
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
          h('div', { class: 'space-y-2' }, attn.map(function (i) { return IssueCard(i, function () { go('issue', i.id); }); }))
        ]) : null
      ])
    ]);
  }

  /* ── tasks ────────────────────────────────────── */
  function TasksPage() {
    var st = local({ search: '', sf: cur().param || 'all', ef: 'all', pf: 'all', mode: 'list' });
    var cfgC = C();
    var chips = [{ k: 'all', l: 'الكل' }, { k: 'active', l: 'نشطة' }, { k: 'overdue', l: 'متأخرة' },
      { k: 'gate', l: 'انتظار' }, { k: 'done', l: 'منجزة' }].concat(cfgC.statuses.map(function (s) { return { k: s.key, l: s.label }; }));
    var results = h('div', {});

    function match(i) {
      if (st.search) {
        var s = st.search.toLowerCase();
        if (i.title.toLowerCase().indexOf(s) === -1 &&
          (i.description || '').toLowerCase().indexOf(s) === -1 &&
          (i.assignee || '').toLowerCase().indexOf(s) === -1 &&
          !(i.tags || []).some(function (t) { return t.indexOf(st.search) !== -1; })) return false;
      }
      if (st.ef !== 'all' && i.entityId !== st.ef) return false;
      if (st.pf !== 'all' && i.priority !== st.pf) return false;
      if (st.sf === 'overdue') return isOD(i);
      if (st.sf === 'active') return isActive(i);
      if (st.sf === 'gate') return !!(cfgC.S[i.status] && cfgC.S[i.status].gate);
      if (st.sf === 'done') return isDone(i.status);
      if (st.sf !== 'all') return i.status === st.sf;
      return true;
    }
    function draw() {
      var sorted = S.issues.filter(match).sort(function (a, b) {
        var ad = isDone(a.status) ? 1 : 0, bd = isDone(b.status) ? 1 : 0;
        if (ad !== bd) return ad - bd;
        var ao = isOD(a) ? -1 : 0, bo = isOD(b) ? -1 : 0;
        if (ao !== bo) return ao - bo;
        return (a.dueDate || 0) - (b.dueDate || 0);
      });
      if (st.mode === 'list') {
        mount(results, [
          h('div', { class: 'text-xs text-slate-400 mb-2' }, toAr(sorted.length) + ' ملاحظة'),
          h('div', { class: 'space-y-2' }, sorted.length
            ? sorted.map(function (i) { return IssueCard(i, function () { go('issue', i.id); }); })
            : [h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد ملاحظات')])
        ]);
      } else {
        mount(results, h('div', { class: 'flex gap-3 overflow-x-auto ns pb-4' }, cfgC.statuses.map(function (s) {
          var col = sorted.filter(function (i) { return i.status === s.key; });
          return h('div', { class: 'flex-shrink-0 w-60' }, [
            h('div', { class: 'flex items-center gap-2 mb-2' }, [
              h('div', { class: 'w-2.5 h-2.5 rounded-full ' + cfgC.S[s.key].dot }),
              h('span', { class: 'text-sm font-medium text-slate-700' }, s.label),
              h('span', { class: 'text-xs text-slate-400' }, toAr(col.length))
            ]),
            h('div', { class: 'space-y-2' }, col.length
              ? col.map(function (i) { return IssueCard(i, function () { go('issue', i.id); }); })
              : [h('div', { class: 'border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-300' }, 'لا توجد')])
          ]);
        })));
      }
    }

    var searchIn = h('input', { class: 'w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'بحث…', value: st.search });
    searchIn.addEventListener('input', function () { st.search = searchIn.value; draw(); });

    function chipRow(items, get, set, small) {
      return h('div', { class: 'flex gap-2 overflow-x-auto ns' + (small ? '' : ' pb-0.5') }, items.map(function (it) {
        return h('button', {
          class: 'flex-shrink-0 text-xs px-3 py-' + (small ? '1' : '1.5') + ' rounded-full border ' +
            (get() === it.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
          onclick: function () { set(it.k); render(); }
        }, it.l);
      }));
    }

    draw();
    return h('div', {}, [
      TopBar({
        title: 'المهام', label: S.user.label,
        right: [h('div', { class: 'flex gap-1' }, [
          h('button', { class: 'p-1.5 rounded-lg ' + (st.mode === 'list' ? 'bg-white/30' : 'bg-white/10'), 'aria-label': 'قائمة', onclick: function () { st.mode = 'list'; render(); } }, [ic('list', 15)]),
          h('button', { class: 'p-1.5 rounded-lg ' + (st.mode === 'board' ? 'bg-white/30' : 'bg-white/10'), 'aria-label': 'لوحة', onclick: function () { st.mode = 'board'; render(); } }, [ic('grid', 15)])
        ])]
      }),
      h('div', { class: 'p-3 space-y-3' }, [
        h('div', { class: 'relative' }, [
          h('div', { class: 'absolute text-slate-400', style: { right: '12px', top: '50%', transform: 'translateY(-50%)' } }, [ic('search', 15)]),
          searchIn
        ]),
        st.mode === 'list' ? chipRow(chips, function () { return st.sf; }, function (k) { st.sf = k; }) : null,
        S.entities.length > 1 ? chipRow([{ k: 'all', l: 'كل الفروع' }].concat(S.entities.map(function (e) { return { k: e.id, l: e.name }; })), function () { return st.ef; }, function (k) { st.ef = k; }, true) : null,
        chipRow([{ k: 'all', l: 'كل الأولويات' }].concat(cfgC.priorities.map(function (p) { return { k: p.key, l: p.label }; })), function () { return st.pf; }, function (k) { st.pf = k; }, true),
        results
      ])
    ]);
  }

  /* ── entities ─────────────────────────────────── */
  function EntitiesPage() {
    var cfgC = C(), perms = P();
    return h('div', {}, [
      TopBar({
        title: 'الجهات', label: S.user.label,
        right: perms.manageEntities ? [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1',
          onclick: function () { entityModal(null); }
        }, [ic('plus', 13), 'إضافة'])] : null
      }),
      h('div', { class: 'p-4 space-y-3' }, S.entities.map(function (e) {
        var tc = cfgC.E[e.type] || { icon: 'boxes', tint: M.TINT.slate, label: e.type };
        var aC = S.issues.filter(function (i) { return i.entityId === e.id && isActive(i); }).length;
        return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 text-right', onclick: function () { go('entity', e.id); } }, [
          h('div', { class: 'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ' + tc.tint }, [ic(tc.icon, 24)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'font-semibold text-slate-800' }, e.name),
            h('div', { class: 'text-xs text-slate-400' }, tc.label + ' · ' + toAr((e.categories || []).length) + ' تصنيفات')
          ]),
          aC > 0 ? h('span', { class: 'bg-sky-50 text-sky-700 text-xs px-2 py-1 rounded-lg' }, toAr(aC) + ' نشطة')
            : h('span', { class: 'text-xs text-slate-300' }, 'لا جديد')
        ]);
      }))
    ]);
  }

  function entityModal(existing) {
    var cfgC = C();
    var form = { name: existing ? existing.name : '', type: existing ? existing.type : ((cfgC.types[0] || {}).key || 'other') };
    var grid = h('div', { class: 'grid grid-cols-2 gap-2' });
    function drawTypes() {
      mount(grid, cfgC.types.map(function (t) {
        return h('button', {
          class: 'p-3 rounded-xl border flex items-center gap-2 text-sm ' + (form.type === t.key ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'),
          onclick: function () { form.type = t.key; drawTypes(); }
        }, [ic(cfgC.E[t.key].icon, 15), t.label]);
      }));
    }
    drawTypes();
    var close = openModal(existing ? 'تعديل الجهة' : 'إضافة جهة جديدة', [
      h('div', { class: 'mb-4' }, [
        h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'اسم الجهة'),
        textInput(form.name, function (v) { form.name = v; }, { placeholder: 'مثال: فرع السالمية' })
      ]),
      h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm text-slate-700 mb-2' }, 'النوع'), grid]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
          onclick: function () {
            if (!form.name.trim()) return;
            var call = existing
              ? api.patch('/api/entities/' + encodeURIComponent(existing.id), form)
              : api.post('/api/entities', form);
            call.then(function () { return T.bootstrap(); })
              .then(function () { close(); toast('تم الحفظ ✓'); render(); })
              .catch(fail);
          }
        }, 'حفظ')
      ])
    ]);
  }

  /* ── entity detail ────────────────────────────── */
  function EntityPage() {
    var eid = cur().param;
    var cfgC = C(), perms = P();
    var ent = T.entity(eid);
    if (!ent) return h('div', { class: 'p-8 text-center text-slate-400' }, 'الجهة غير موجودة');
    var ei = S.issues.filter(function (i) { return i.entityId === eid; });
    var aC = ei.filter(isActive).length;
    var tc = cfgC.E[ent.type] || { icon: 'boxes', tint: M.TINT.slate, label: ent.type };

    return h('div', {}, [
      TopBar({
        title: ent.name, subtitle: tc.label, onBack: back,
        right: perms.manageEntities ? [h('button', { class: 'bg-white/20 p-2 rounded-xl', 'aria-label': 'تعديل', onclick: function () { entityModal(ent); } }, [ic('edit', 14)])] : null
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
      ].concat((ent.categories || []).map(function (c) {
        var items = ei.filter(function (i) { return i.categoryId === c.id; });
        return h('div', {}, [
          h('div', { class: 'flex items-center justify-between mb-2' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700' }, c.name),
            h('span', { class: 'text-xs text-slate-400' }, toAr(items.length))
          ]),
          items.length === 0
            ? h('div', { class: 'border-2 border-dashed border-slate-200 rounded-xl p-3 text-center text-xs text-slate-300' }, 'لا توجد ملاحظات')
            : h('div', { class: 'space-y-2' }, items.map(function (i) { return IssueCard(i, function () { go('issue', i.id); }); }))
        ]);
      })))
    ]);
  }

  window.VIEWS = {
    cur: cur, go: go, back: back, goTab: goTab, replace: replace, local: local, sub: sub,
    toast: toast, fail: fail, errText: errText, ringBell: ringBell,
    TopBar: TopBar, BottomNav: BottomNav, Toggle: Toggle, openModal: openModal,
    field: field, textInput: textInput, INP: INP, IssueCard: IssueCard,
    entityModal: entityModal,
    HomePage: HomePage, TasksPage: TasksPage, EntitiesPage: EntitiesPage, EntityPage: EntityPage
  };
}());
