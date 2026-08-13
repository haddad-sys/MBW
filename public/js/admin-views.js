/* ===========================================================================
   متابِع — administration: the approval queue, users and their permissions,
   branches, variables, the team, notification settings and the mail log.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, U = window.UI, T = window.ST, V = window.VIEWS;
  var h = U.h, ic = U.ic, mount = U.mount, api = M.api;
  var S = T.S, C = T.C, P = T.P;
  var toAr = M.toAr, fmtDate = M.fmtDate, fmtWhen = M.fmtWhen;
  var cur = V.cur, back = V.back, local = V.local, sub = V.sub;
  var TopBar = V.TopBar, Toggle = V.Toggle, openModal = V.openModal, toast = V.toast, fail = V.fail;
  var INP = V.INP, textInput = V.textInput;
  function render() { window.APP.render(); }

  var PERM_GROUPS = [
    { title: 'المهام', items: [['create', 'إنشاء ملاحظات'], ['edit', 'تعديل الحقول'], ['changeStatus', 'تغيير الحالة'], ['approve', 'الاعتماد والإرجاع'], ['del', 'حذف الملاحظات'], ['comment', 'إضافة تعليقات'], ['photos', 'إضافة صور']] },
    { title: 'المكتبة', items: [['uploadDocs', 'رفع الملفات'], ['deleteDocs', 'حذف الملفات']] },
    { title: 'الإدارة', items: [['manageEntities', 'إدارة الفروع'], ['manageTeam', 'إدارة الفريق'], ['manageUsers', 'إدارة المستخدمين'], ['settings', 'الإعدادات والمتغيّرات'], ['export', 'تصدير البيانات']] }
  ];
  var TAB_LABELS = { home: 'الرئيسية', tasks: 'المهام', entities: 'الجهات', library: 'المكتبة' };
  var PRESETS = {
    manager: { scope: 'all', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 1, edit: 1, changeStatus: 1, approve: 1, del: 1, comment: 1, photos: 1, uploadDocs: 1, deleteDocs: 1, manageEntities: 1, manageTeam: 1, manageUsers: 1, settings: 1, export: 1 },
    branch: { scope: 'own', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 1, edit: 0, changeStatus: 1, approve: 0, del: 0, comment: 1, photos: 1, uploadDocs: 1, deleteDocs: 0, manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 1 },
    viewer: { scope: 'own', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 0, edit: 0, changeStatus: 0, approve: 0, del: 0, comment: 0, photos: 0, uploadDocs: 0, deleteDocs: 0, manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 0 }
  };

  /** The permission editor, shared by the approval dialog and user editing. */
  function permsEditor(f, redraw) {
    var entSel = h('select', { class: INP });
    entSel.appendChild(h('option', { value: '' }, '— اختر الفرع —'));
    S.entities.forEach(function (e) { entSel.appendChild(h('option', { value: e.id, selected: e.id === f.entityId }, e.name)); });
    entSel.value = f.entityId || '';
    entSel.addEventListener('change', function () { f.entityId = entSel.value; });

    return [
      h('div', {}, [
        h('label', { class: 'block text-sm font-semibold text-slate-700 mb-2' }, 'قوالب جاهزة'),
        h('div', { class: 'flex gap-2' }, [
          ['manager', 'مدير كامل', 'bg-sky-50 text-sky-700 border-sky-200'],
          ['branch', 'موظف فرع', 'bg-slate-50 text-slate-600 border-slate-200'],
          ['viewer', 'قراءة فقط', 'bg-slate-50 text-slate-600 border-slate-200']
        ].map(function (p) {
          return h('button', {
            class: 'flex-1 text-xs py-2 rounded-xl border ' + p[2],
            onclick: function () { f.perms = JSON.parse(JSON.stringify(PRESETS[p[0]])); redraw(); }
          }, p[1]);
        }))
      ]),
      h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
        h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'نطاق الرؤية'),
        h('div', { class: 'flex gap-2' }, [{ k: 'all', l: 'كل الفروع' }, { k: 'own', l: 'فرعه فقط' }].map(function (o) {
          return h('button', {
            class: 'flex-1 text-sm py-2 rounded-xl border ' + (f.perms.scope === o.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
            onclick: function () { f.perms.scope = o.k; redraw(); }
          }, o.l);
        })),
        f.perms.scope === 'own' ? h('div', { class: 'mt-2' }, [entSel]) : null
      ]),
      h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
        h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'التبويبات الظاهرة'),
        h('div', { class: 'space-y-2' }, Object.keys(TAB_LABELS).map(function (k) {
          return h('div', { class: 'flex items-center justify-between' }, [
            h('span', { class: 'text-sm text-slate-600' }, TAB_LABELS[k]),
            Toggle(!!(f.perms.tabs && f.perms.tabs[k]), function (v) { f.perms.tabs = f.perms.tabs || {}; f.perms.tabs[k] = v ? 1 : 0; redraw(); })
          ]);
        }))
      ])
    ].concat(PERM_GROUPS.map(function (g) {
      return h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
        h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, g.title),
        h('div', { class: 'space-y-2' }, g.items.map(function (it) {
          return h('div', { class: 'flex items-center justify-between' }, [
            h('span', { class: 'text-sm text-slate-600' }, it[1]),
            Toggle(!!f.perms[it[0]], function (v) { f.perms[it[0]] = v ? 1 : 0; redraw(); })
          ]);
        }))
      ]);
    }));
  }

  /* ── registration queue ───────────────────────── */
  function RegistrationsPanel(backFn) {
    var st = sub('regs', { items: null, loading: false });
    var box = h('div', { class: 'space-y-3' });

    function load() {
      st.loading = true;
      mount(box, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      api.get('/api/admin/registrations').then(function (res) {
        st.items = res.registrations || [];
        S.pendingRegistrations = res.count || 0;
        st.loading = false;
        /* A full redraw, not a local one: the panel node this closure captured
           may already have been replaced by an intervening render. */
        render();
      }).catch(function (err) { st.loading = false; st.items = []; render(); fail(err); });
    }
    function draw() {
      if (!st.items || !st.items.length) {
        mount(box, h('div', { class: 'text-center py-12' }, [
          ic('users', 34, 'text-slate-200'),
          h('div', { class: 'text-sm text-slate-300 mt-3' }, 'لا توجد طلبات بانتظار الاعتماد')
        ]));
        return;
      }
      mount(box, st.items.map(function (r) {
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center gap-3 mb-3' }, [
            h('div', { class: 'w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0' }, [ic('user', 20)]),
            h('div', { class: 'flex-1 min-w-0' }, [
              h('div', { class: 'font-semibold text-slate-800' }, r.name),
              h('div', { class: 'text-xs text-slate-400', dir: 'ltr' }, r.username + ' · ' + r.email)
            ]),
            h('span', { class: 'text-xs text-slate-300' }, fmtWhen(r.createdAt))
          ]),
          h('div', { class: 'space-y-1 text-xs text-slate-500 mb-3' }, [
            r.phone ? h('div', {}, 'الهاتف: ' + r.phone) : null,
            h('div', {}, 'الفرع المطلوب: ' + (r.entityName || '—')),
            r.note ? h('div', { class: 'bg-slate-50 rounded-lg p-2 text-slate-600 mt-2' }, r.note) : null
          ]),
          h('div', { class: 'flex gap-2' }, [
            h('button', {
              class: 'flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-1',
              onclick: function () { approveDialog(r, load); }
            }, [ic('check', 15), 'اعتماد']),
            h('button', {
              class: 'flex-1 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-sm font-semibold',
              onclick: function () { rejectDialog(r, load); }
            }, 'رفض')
          ])
        ]);
      }));
    }
    if (st.items === null && !st.loading) load(); else draw();

    return h('div', {}, [
      TopBar({ title: 'طلبات التسجيل', onBack: backFn }),
      h('div', { class: 'p-4 space-y-3' }, [
        h('p', { class: 'text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl p-3 leading-relaxed' },
          'لا يستطيع أي شخص الدخول قبل اعتماد حسابه. عند الاعتماد تُحدَّد صلاحياته وفرعه، وتصله رسالة بريد تلقائياً.'),
        box
      ])
    ]);
  }

  function approveDialog(reg, done) {
    var f = {
      entityId: reg.entityId || '',
      label: reg.label || reg.name,
      note: '',
      perms: JSON.parse(JSON.stringify(PRESETS.branch))
    };
    var body = h('div', { class: 'space-y-3' });
    var close;
    function draw() {
      mount(body, [
        h('div', { class: 'bg-slate-50 rounded-xl p-3 text-sm' }, [
          h('div', { class: 'font-semibold text-slate-800' }, reg.name),
          h('div', { class: 'text-xs text-slate-500', dir: 'ltr' }, reg.username + ' · ' + reg.email)
        ]),
        h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'الاسم المختصر'),
          textInput(f.label, function (v) { f.label = v; })])
      ].concat(permsEditor(f, draw)).concat([
        h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'ملاحظة ترافق الاعتماد (اختياري)'),
          textInput(f.note, function (v) { f.note = v; })]),
        h('div', { class: 'flex gap-3 pt-1' }, [
          h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
          h('button', {
            class: 'flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold',
            onclick: function () {
              if (f.perms.scope === 'own' && !f.entityId) { toast('اختر الفرع'); return; }
              api.post('/api/admin/registrations/' + encodeURIComponent(reg.id) + '/approve', {
                role: f.perms.scope === 'all' ? 'manager' : 'branch',
                entityId: f.entityId || null, label: f.label, note: f.note, perms: f.perms
              }).then(function () {
                close(); toast('تم اعتماد الحساب ✓');
                return T.bootstrap();
              }).then(function () { done(); render(); }).catch(fail);
            }
          }, 'اعتماد الحساب')
        ])
      ]));
    }
    draw();
    close = openModal('اعتماد طلب التسجيل', [body]);
  }

  function rejectDialog(reg, done) {
    var note = '';
    var close = openModal('رفض الطلب', [
      h('p', { class: 'text-sm text-slate-600 mb-3' }, 'سيصل ' + reg.name + ' إشعار بالرفض على بريده.'),
      h('div', { class: 'mb-6' }, [
        h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'سبب الرفض (اختياري)'),
        textInput('', function (v) { note = v; })
      ]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-rose-500 text-white font-semibold',
          onclick: function () {
            api.post('/api/admin/registrations/' + encodeURIComponent(reg.id) + '/reject', { note: note })
              .then(function () { close(); toast('تم رفض الطلب'); return T.bootstrap(); })
              .then(function () { done(); render(); }).catch(fail);
          }
        }, 'رفض')
      ])
    ]);
  }

  /* ── users ────────────────────────────────────── */
  function UsersPanel(backFn) {
    var st = sub('users', { items: null, loading: false });
    var box = h('div', { class: 'space-y-2' });
    function load() {
      st.loading = true;
      api.get('/api/admin/users').then(function (res) {
        st.items = res.users || []; st.loading = false; render();
      }).catch(function (err) { st.loading = false; st.items = []; render(); fail(err); });
    }
    var STATUS = { active: ['نشط', 'text-emerald-600'], pending: ['بانتظار الاعتماد', 'text-amber-600'], rejected: ['مرفوض', 'text-rose-600'], disabled: ['موقوف', 'text-slate-400'] };
    function draw() {
      if (!st.items) { mount(box, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…')); return; }
      mount(box, st.items.map(function (u) {
        var ent = T.entity(u.entityId);
        var stat = STATUS[u.status] || [u.status, 'text-slate-400'];
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + (u.perms.scope === 'all' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500') }, [ic('user', 18)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'font-semibold text-slate-800 text-sm truncate' }, u.name),
            h('div', { class: 'text-xs text-slate-400 truncate', dir: 'ltr' }, u.username + ' · ' + (u.perms.scope === 'all' ? 'كل الفروع' : ((ent && ent.name) || 'فرع')) ),
            h('div', { class: 'text-xs ' + stat[1] }, stat[0])
          ]),
          h('button', { class: 'p-2 text-slate-400', 'aria-label': 'تعديل', onclick: function () { userDialog(u, load); } }, [ic('edit', 15)]),
          h('button', {
            class: 'p-2 text-slate-400', 'aria-label': 'حذف',
            onclick: function () {
              api.del('/api/admin/users/' + encodeURIComponent(u.id))
                .then(function () { toast('تم الحذف ✓'); load(); }).catch(fail);
            }
          }, [ic('trash', 15)])
        ]);
      }));
    }
    if (st.items === null && !st.loading) load(); else draw();

    return h('div', {}, [
      TopBar({
        title: 'المستخدمون والصلاحيات', onBack: backFn,
        right: [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1',
          onclick: function () { userDialog(null, load); }
        }, [ic('plus', 13), 'جديد'])]
      }),
      h('div', { class: 'p-4' }, [box])
    ]);
  }

  function userDialog(existing, done) {
    var f = existing
      ? { name: existing.name, label: existing.label, username: existing.username, email: existing.email, password: '', entityId: existing.entityId || '', status: existing.status, perms: JSON.parse(JSON.stringify(existing.perms)) }
      : { name: '', label: '', username: '', email: '', password: '', entityId: '', status: 'active', perms: JSON.parse(JSON.stringify(PRESETS.branch)) };
    var body = h('div', { class: 'space-y-3' });
    var close;
    function draw() {
      mount(body, [
        h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'الاسم المعروض *'), textInput(f.name, function (v) { f.name = v; })]),
        h('div', { class: 'grid grid-cols-2 gap-2' }, [
          h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'المستخدم *'),
            textInput(f.username, function (v) { f.username = v; }, { dir: 'ltr', disabled: !!existing })]),
          h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, existing ? 'كلمة مرور جديدة' : 'كلمة المرور *'),
            textInput(f.password, function (v) { f.password = v; }, { dir: 'ltr', type: 'password' })])
        ]),
        existing ? null : h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'البريد الإلكتروني *'),
          textInput(f.email, function (v) { f.email = v; }, { dir: 'ltr', type: 'email' })]),
        existing ? h('div', { class: 'bg-slate-50 rounded-xl p-3 flex items-center justify-between' }, [
          h('span', { class: 'text-sm text-slate-600' }, 'الحساب نشط'),
          Toggle(f.status === 'active', function (v) { f.status = v ? 'active' : 'disabled'; draw(); })
        ]) : null
      ].concat(permsEditor(f, draw)).concat([
        h('div', { class: 'flex gap-3 pt-1' }, [
          h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
          h('button', {
            class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
            onclick: function () {
              if (f.perms.scope === 'own' && !f.entityId) { toast('اختر الفرع'); return; }
              var payload = {
                name: f.name, label: f.label || f.name, entityId: f.perms.scope === 'own' ? f.entityId : null,
                perms: f.perms, status: f.status
              };
              if (f.password) payload.password = f.password;
              var call = existing
                ? api.patch('/api/admin/users/' + encodeURIComponent(existing.id), payload)
                : api.post('/api/admin/users', Object.assign({ username: f.username, email: f.email, password: f.password }, payload));
              call.then(function () { close(); toast('تم الحفظ ✓'); return T.bootstrap(); })
                .then(function () { done(); render(); }).catch(fail);
            }
          }, 'حفظ')
        ])
      ]));
    }
    draw();
    close = openModal(existing ? 'تعديل الحساب' : 'حساب جديد', [body]);
  }

  /* ── branches ─────────────────────────────────── */
  function BranchesPanel(backFn) {
    var st = sub('branches', { sel: null, delConf: null });
    var cfgC = C();
    if (st.sel) {
      var ent = T.entity(st.sel);
      if (!ent) { st.sel = null; } else {
        var catIn = h('input', { class: INP, placeholder: 'تصنيف جديد…' });
        function addCat() {
          var v = catIn.value.trim();
          if (!v) return;
          api.post('/api/entities/' + encodeURIComponent(st.sel) + '/categories', { name: v })
            .then(function () { catIn.value = ''; return T.bootstrap(); })
            .then(function () { toast('تمت الإضافة ✓'); render(); }).catch(fail);
        }
        catIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCat(); });
        return h('div', {}, [
          TopBar({ title: 'تصنيفات ' + ent.name, onBack: function () { st.sel = null; render(); } }),
          h('div', { class: 'p-4 space-y-3' }, [
            h('p', { class: 'text-xs text-slate-400' }, 'أنواع المهام لهذا الفرع'),
            h('div', { class: 'flex gap-2' }, [catIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-4', 'aria-label': 'إضافة', onclick: addCat }, [ic('plus', 17)])]),
            h('div', { class: 'space-y-2' }, (ent.categories || []).map(function (c) {
              var nameIn = h('input', { class: 'flex-1 bg-transparent text-sm text-slate-700 focus:outline-none', value: c.name });
              nameIn.addEventListener('blur', function () {
                var v = nameIn.value.trim();
                if (!v || v === c.name) { nameIn.value = c.name; return; }
                api.patch('/api/entities/' + encodeURIComponent(st.sel) + '/categories/' + encodeURIComponent(c.id), { name: v })
                  .then(function () { return T.bootstrap(); }).then(render).catch(fail);
              });
              return h('div', { class: 'bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-2' }, [
                nameIn,
                h('span', { class: 'text-xs text-slate-300' }, toAr(S.issues.filter(function (i) { return i.categoryId === c.id; }).length)),
                h('button', {
                  class: 'text-slate-300', 'aria-label': 'حذف',
                  onclick: function () {
                    api.del('/api/entities/' + encodeURIComponent(st.sel) + '/categories/' + encodeURIComponent(c.id))
                      .then(function () { return T.bootstrap(); })
                      .then(function () { toast('تم الحذف ✓'); render(); }).catch(fail);
                  }
                }, [ic('x', 15)])
              ]);
            }))
          ])
        ]);
      }
    }
    return h('div', {}, [
      TopBar({
        title: 'الفروع', onBack: backFn,
        right: [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1',
          onclick: function () { window.VIEWS.entityModal ? window.VIEWS.entityModal(null) : null; }
        }, [ic('plus', 13), 'فرع'])]
      }),
      h('div', { class: 'p-4 space-y-2' }, S.entities.map(function (e) {
        var tc = cfgC.E[e.type] || { icon: 'boxes', tint: M.TINT.slate, label: e.type };
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + tc.tint }, [ic(tc.icon, 19)]),
          h('button', { class: 'flex-1 min-w-0 text-right', onclick: function () { st.sel = e.id; render(); } }, [
            h('div', { class: 'font-semibold text-slate-800 text-sm truncate' }, e.name),
            h('div', { class: 'text-xs text-slate-400' }, tc.label + ' · ' + toAr((e.categories || []).length) + ' تصنيفات')
          ]),
          h('button', {
            class: 'p-2 ' + (st.delConf === e.id ? 'text-rose-500' : 'text-slate-400'), 'aria-label': 'حذف',
            onclick: function () { st.delConf = st.delConf === e.id ? null : e.id; render(); }
          }, [ic('trash', 15)])
        ]);
      }).concat(st.delConf ? [h('div', { class: 'bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm' }, [
        h('p', { class: 'text-rose-700 mb-2' }, 'حذف الفرع سيحذف ملاحظاته وملفاته نهائياً. متأكد؟'),
        h('div', { class: 'flex gap-2' }, [
          h('button', { class: 'flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm', onclick: function () { st.delConf = null; render(); } }, 'إلغاء'),
          h('button', {
            class: 'flex-1 py-2 rounded-lg bg-rose-500 text-white text-sm',
            onclick: function () {
              var id = st.delConf; st.delConf = null;
              api.del('/api/entities/' + encodeURIComponent(id))
                .then(function () { return T.refresh(); })
                .then(function () { toast('تم الحذف ✓'); render(); }).catch(fail);
            }
          }, 'تأكيد')
        ])
      ])] : []))
    ]);
  }

  /* ── variables ────────────────────────────────── */
  function VarsPanel(backFn) {
    var st = sub('vars', {
      tab: 'priorities', picker: null,
      pri: (S.cfg.priorities || []).map(function (x) { return Object.assign({}, x); }),
      sts: (S.cfg.statuses || []).map(function (x) { return Object.assign({}, x); }),
      typ: (S.cfg.types || []).map(function (x) { return Object.assign({}, x); }),
      dc: (S.cfg.defaultCats || []).slice()
    });
    var body = h('div', {});
    var newKey = function (p) { return p + '_' + Math.random().toString(36).slice(2, 7); };
    function ColorGrid(val, onPick) {
      return h('div', { class: 'flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl mt-2' }, M.COLORS.map(function (c) {
        return h('button', {
          class: 'rounded-lg ' + M.DOT[c] + (val === c ? ' ring-2 ring-slate-800' : ''),
          style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': c,
          onclick: function () { onPick(c); }
        });
      }));
    }
    function arrows(arr, i, set) {
      return h('div', { class: 'flex flex-col' }, [
        h('button', { class: 'text-slate-400 text-xs', disabled: i === 0, onclick: function () { var b = arr.slice(); var t = b[i - 1]; b[i - 1] = b[i]; b[i] = t; set(b); } }, '▲'),
        h('button', { class: 'text-slate-400 text-xs', disabled: i === arr.length - 1, onclick: function () { var b = arr.slice(); var t = b[i + 1]; b[i + 1] = b[i]; b[i] = t; set(b); } }, '▼')
      ]);
    }
    var SMALL = 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';
    function draw() {
      var kids = [];
      if (st.tab === 'priorities') {
        kids = st.pri.map(function (p, i) {
          return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3' }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h('button', { class: 'rounded-lg flex-shrink-0 ' + M.DOT[p.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 'p' + i ? null : 'p' + i; draw(); } }),
              textInput(p.label, function (v) { st.pri[i].label = v; }, { class: SMALL }),
              arrows(st.pri, i, function (b) { st.pri = b; draw(); }),
              h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { st.pri.splice(i, 1); draw(); } }, [ic('trash', 15)])
            ]),
            st.picker === 'p' + i ? ColorGrid(p.color, function (c) { st.pri[i].color = c; st.picker = null; draw(); }) : null
          ]);
        }).concat([h('button', {
          class: 'w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 flex items-center justify-center gap-1',
          onclick: function () { st.pri.push({ key: newKey('pri'), label: 'أولوية جديدة', color: 'sky' }); draw(); }
        }, [ic('plus', 15), 'إضافة أولوية'])]);
      } else if (st.tab === 'statuses') {
        kids = [h('p', { class: 'text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl p-3' },
          'الترتيب = مسار سير العمل (الأعلى أولاً). بوابة = تتطلب صلاحية اعتماد للتجاوز. منجزة = تُحتسب مكتملة. معلّقة = حالة جانبية خارج المسار.')]
          .concat(st.sts.map(function (s, i) {
            return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 space-y-2' }, [
              h('div', { class: 'flex items-center gap-2' }, [
                h('button', { class: 'rounded-lg flex-shrink-0 ' + M.DOT[s.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 's' + i ? null : 's' + i; draw(); } }),
                textInput(s.label, function (v) { st.sts[i].label = v; }, { class: SMALL }),
                arrows(st.sts, i, function (b) { st.sts = b; draw(); }),
                h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { st.sts.splice(i, 1); draw(); } }, [ic('trash', 15)])
              ]),
              st.picker === 's' + i ? ColorGrid(s.color, function (c) { st.sts[i].color = c; st.picker = null; draw(); }) : null,
              h('div', { class: 'flex gap-3 text-xs pt-1' }, [['gate', 'بوابة اعتماد'], ['done', 'منجزة'], ['parked', 'معلّقة']].map(function (fl) {
                var cb = h('input', { type: 'checkbox', checked: !!s[fl[0]] });
                cb.addEventListener('change', function () { st.sts[i][fl[0]] = cb.checked; });
                return h('label', { class: 'flex items-center gap-1 text-slate-600' }, [cb, fl[1]]);
              }))
            ]);
          }))
          .concat([h('button', {
            class: 'w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 flex items-center justify-center gap-1',
            onclick: function () { st.sts.push({ key: newKey('st'), label: 'حالة جديدة', color: 'indigo', gate: false, done: false, parked: false }); draw(); }
          }, [ic('plus', 15), 'إضافة حالة'])]);
      } else if (st.tab === 'types') {
        kids = st.typ.map(function (t, i) {
          return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 space-y-2' }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h('button', { class: 'rounded-lg flex-shrink-0 ' + M.DOT[t.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 't' + i ? null : 't' + i; draw(); } }),
              textInput(t.label, function (v) { st.typ[i].label = v; }, { class: SMALL }),
              h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { st.typ.splice(i, 1); draw(); } }, [ic('trash', 15)])
            ]),
            st.picker === 't' + i ? ColorGrid(t.color, function (c) { st.typ[i].color = c; st.picker = null; draw(); }) : null,
            h('div', { class: 'flex flex-wrap gap-1.5' }, M.ICON_KEYS.map(function (ik) {
              return h('button', {
                class: 'w-9 h-9 rounded-lg flex items-center justify-center border ' + (t.icon === ik ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-500 border-slate-200'),
                'aria-label': ik, onclick: function () { st.typ[i].icon = ik; draw(); }
              }, [ic(M.TYPE_ICON[ik], 16)]);
            }))
          ]);
        }).concat([h('button', {
          class: 'w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 flex items-center justify-center gap-1',
          onclick: function () { st.typ.push({ key: newKey('ty'), label: 'نوع جديد', color: 'teal', icon: 'box' }); draw(); }
        }, [ic('plus', 15), 'إضافة نوع'])]);
      } else {
        var dcIn = h('input', { class: INP, placeholder: 'تصنيف جديد…' });
        function addDc() { var v = dcIn.value.trim(); if (!v) return; st.dc.push(v); dcIn.value = ''; draw(); }
        dcIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addDc(); });
        kids = [h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-1' }, 'التصنيفات الافتراضية'),
          h('p', { class: 'text-xs text-slate-400 mb-3' }, 'تُطبَّق تلقائياً على أي فرع جديد'),
          h('div', { class: 'space-y-2 mb-3' }, st.dc.map(function (c, i) {
            return h('div', { class: 'flex items-center gap-2' }, [
              textInput(c, function (v) { st.dc[i] = v; }),
              h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { st.dc.splice(i, 1); draw(); } }, [ic('x', 15)])
            ]);
          })),
          h('div', { class: 'flex gap-2' }, [dcIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: addDc }, [ic('plus', 16)])])
        ])];
      }
      mount(body, h('div', { class: 'space-y-2' }, kids));
    }
    draw();

    return h('div', {}, [
      TopBar({ title: 'المتغيّرات', onBack: backFn }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'flex gap-2 overflow-x-auto ns' }, [
          { k: 'priorities', l: 'الأولويات' }, { k: 'statuses', l: 'الحالات' }, { k: 'types', l: 'الأنواع' }, { k: 'cats', l: 'التصنيفات' }
        ].map(function (t) {
          return h('button', {
            class: 'flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border ' + (st.tab === t.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
            onclick: function () { st.tab = t.k; st.picker = null; draw(); }
          }, t.l);
        })),
        body,
        h('button', {
          class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold text-sm',
          onclick: function () {
            api.put('/api/admin/config', { priorities: st.pri, statuses: st.sts, types: st.typ, defaultCats: st.dc })
              .then(function () { return T.bootstrap(); })
              .then(function () { toast('تم حفظ المتغيّرات ✓'); render(); })
              .catch(function (err) {
                var msgs = {
                  open_status_required: 'يجب وجود حالة مفتوحة واحدة على الأقل',
                  done_status_required: 'يجب تحديد حالة واحدة كـ«منجزة»',
                  priorities_required: 'يجب وجود أولوية واحدة على الأقل',
                  types_required: 'يجب وجود نوع واحد على الأقل'
                };
                toast(msgs[err.code] || V.errText(err));
              });
          }
        }, 'حفظ المتغيّرات'),
        h('p', { class: 'text-xs text-slate-400 text-center' }, 'تنبيه: حذف حالة أو أولوية مستخدمة قد يجعل بعض الملاحظات بلا تسمية.')
      ])
    ]);
  }

  /* ── team ─────────────────────────────────────── */
  function TeamPanel(backFn) {
    var inp = h('input', { class: INP, placeholder: 'اسم العضو الجديد…' });
    function add() {
      var n = inp.value.trim();
      if (!n) return;
      api.post('/api/admin/team', { name: n }).then(function (res) {
        S.team = res.team; inp.value = ''; toast('تم الإضافة ✓'); render();
      }).catch(fail);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    return h('div', {}, [
      TopBar({ title: 'الفريق', onBack: backFn }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('p', { class: 'text-xs text-slate-400' }, 'الأشخاص الذين يمكن تكليفهم بالمهام'),
        h('div', { class: 'flex gap-2' }, [inp, h('button', { class: 'bg-sky-500 text-white rounded-xl px-4', 'aria-label': 'إضافة', onclick: add }, [ic('plus', 17)])]),
        h('div', { class: 'space-y-2' }, S.team.map(function (m) {
          return h('div', { class: 'bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between' }, [
            h('div', { class: 'flex items-center gap-2' }, [ic('user', 15, 'text-slate-400'), h('span', { class: 'text-sm text-slate-700' }, m)]),
            h('button', {
              class: 'text-slate-300', 'aria-label': 'حذف',
              onclick: function () {
                api.del('/api/admin/team/' + encodeURIComponent(m)).then(function (res) { S.team = res.team; render(); }).catch(fail);
              }
            }, [ic('x', 15)])
          ]);
        }))
      ])
    ]);
  }

  /* ── notifications ────────────────────────────── */
  function NotifPanel(backFn) {
    var st = sub('notif', { loaded: null, loading: false, testing: false });
    var body = h('div', { class: 'p-4 space-y-4' });

    if (st.loaded === null && !st.loading) {
      st.loading = true;
      mount(body, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      api.get('/api/admin/notifications-config').then(function (res) {
        st.loaded = res.notif;
        st.transport = res.transport;
        st.from = res.from;
        st.loading = false;
        render();
      }).catch(function (err) { st.loading = false; fail(err); });
    }

    function save() {
      return api.put('/api/admin/notifications-config', st.loaded).then(function (res) { st.loaded = res.notif; });
    }
    function draw() {
      if (!st.loaded) return;
      var loc = st.loaded;
      var newR = h('input', { class: INP, dir: 'ltr', placeholder: 'email@example.com' });
      function addR() {
        var v = newR.value.trim();
        if (!v) return;
        loc.recipients = loc.recipients.concat([v]);
        newR.value = '';
        save().then(draw).catch(fail);
      }
      newR.addEventListener('keydown', function (e) { if (e.key === 'Enter') addR(); });

      mount(body, [
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center justify-between' }, [
            h('div', {}, [
              h('div', { class: 'font-semibold text-slate-800 text-sm' }, 'تفعيل الإشعارات'),
              h('div', { class: 'text-xs text-slate-400 mt-0.5' }, 'المفتاح الرئيسي — يشمل البريد والتنبيه داخل التطبيق')
            ]),
            Toggle(loc.enabled, function (v) { loc.enabled = v; save().then(draw).catch(fail); })
          ])
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center justify-between' }, [
            h('div', {}, [
              h('div', { class: 'font-semibold text-slate-800 text-sm' }, 'تنبيه صوتي داخل التطبيق'),
              h('div', { class: 'text-xs text-slate-400 mt-0.5' }, 'رنّة قصيرة عند وصول إشعار — إعداد خاص بهذا الجهاز')
            ]),
            Toggle(!M.Ring.muted(), function (v) {
              M.Ring.setMuted(!v);
              if (v) M.Ring.unlock().then(function () { M.Ring.play(false); });
              draw();
            })
          ]),
          h('button', {
            class: 'w-full mt-3 border border-sky-200 text-sky-700 bg-white rounded-xl py-2.5 text-sm flex items-center justify-center gap-2',
            onclick: function () { M.Ring.unlock().then(function () { M.Ring.play(false); toast('تم تشغيل النغمة'); }); }
          }, [ic('volume', 15), 'تجربة النغمة'])
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-1' }, 'المستلمون'),
          h('p', { class: 'text-xs text-slate-400 mb-3' }, 'عناوين تصلها نسخة من كل إشعار بالبريد')
        ].concat(loc.recipients.map(function (r, i) {
          return h('div', { class: 'flex items-center gap-2 mb-2' }, [
            h('div', { class: 'flex-1 text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2', dir: 'ltr' }, r),
            h('button', {
              class: 'text-slate-300', 'aria-label': 'حذف',
              onclick: function () {
                loc.recipients = loc.recipients.filter(function (_, j) { return j !== i; });
                save().then(draw).catch(fail);
              }
            }, [ic('x', 15)])
          ]);
        })).concat([
          h('div', { class: 'flex gap-2 mt-2' }, [newR, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: addR }, [ic('plus', 16)])])
        ])),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'أنواع الإشعارات'),
          h('div', { class: 'space-y-3' }, Object.keys(S.labels.events).map(function (k) {
            return h('div', { class: 'flex items-center justify-between gap-3' }, [
              h('span', { class: 'text-sm text-slate-600 flex-1' }, S.labels.events[k]),
              Toggle(loc.types[k] !== false, function (v) { loc.types[k] = v; save().then(draw).catch(fail); })
            ]);
          }))
        ]),
        h('div', { class: 'bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-500' }, [
          h('div', {}, 'ناقل البريد: ' + (st.transport === 'smtp' ? 'SMTP — يُرسل فعلياً' : 'محلي — تُسجَّل الرسائل ولا تُرسل')),
          h('div', { dir: 'ltr', class: 'mt-1' }, st.from || '')
        ]),
        h('button', {
          class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold text-sm',
          onclick: function () {
            if (st.testing) return;
            st.testing = true;
            M.Ring.unlock();
            api.post('/api/admin/notifications-test').then(function (res) {
              st.testing = false;
              var r = res.result || {};
              toast('تم — ' + toAr(r.inApp || 0) + ' تنبيه و' + toAr(r.emails || 0) + ' رسالة');
            }).catch(function (err) { st.testing = false; fail(err); });
          }
        }, '📧 إرسال إشعار تجريبي')
      ]);
    }
    draw();
    return h('div', {}, [TopBar({ title: 'الإشعارات', onBack: backFn }), body]);
  }

  /* ── mail log ─────────────────────────────────── */
  function MailPanel(backFn) {
    var st = sub('mail', { data: null, loading: false });
    var box = h('div', { class: 'space-y-2' });
    var LABEL = { sent: 'أُرسلت', queued: 'في الانتظار', failed: 'فشلت', suppressed: 'مكتومة' };
    var CLS = { sent: 'text-emerald-600', queued: 'text-amber-600', failed: 'text-rose-600', suppressed: 'text-slate-400' };
    function load() {
      st.loading = true;
      mount(box, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      api.get('/api/admin/emails?limit=80').then(function (res) {
        st.data = res; st.loading = false; render();
      }).catch(function (err) { st.loading = false; fail(err); });
    }
    function draw() {
      if (!st.data) return;
      var rows = st.data.emails || [];
      if (!rows.length) { mount(box, h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد رسائل بعد')); return; }
      mount(box, rows.map(function (m) {
        var open = false;
        var detail = h('div', { class: 'mt-2' });
        detail.style.display = 'none';
        detail.appendChild(h('pre', {
          class: 'text-xs text-slate-600 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap',
          style: { maxHeight: '220px', overflowY: 'auto', fontFamily: 'inherit' }
        }, m.body || '—'));
        if (m.error) detail.appendChild(h('div', { class: 'text-xs text-rose-600 mt-2' }, m.error));
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3' }, [
          h('button', {
            class: 'w-full text-right flex items-center gap-2',
            onclick: function () { open = !open; detail.style.display = open ? '' : 'none'; }
          }, [
            h('div', { class: 'flex-1 min-w-0' }, [
              h('div', { class: 'text-sm font-medium text-slate-700 truncate' }, m.subject),
              h('div', { class: 'text-xs text-slate-400 truncate', dir: 'ltr' }, m.to_email)
            ]),
            h('span', { class: 'text-xs flex-shrink-0 ' + (CLS[m.state] || 'text-slate-400') }, LABEL[m.state] || m.state),
            h('span', { class: 'text-xs text-slate-300 flex-shrink-0' }, fmtWhen(m.sent_at || m.created_at))
          ]),
          detail
        ]);
      }));
    }
    if (st.data === null && !st.loading) load(); else draw();

    return h('div', {}, [
      TopBar({ title: 'سجل البريد', onBack: backFn }),
      h('div', { class: 'p-4 space-y-3' }, [
        h('div', { class: 'flex gap-2' }, [
          h('button', {
            class: 'flex-1 bg-white border border-slate-200 rounded-xl py-2.5 text-sm text-slate-700',
            onclick: function () {
              api.get('/api/admin/mail/verify').then(function (r) {
                toast(r.ok ? ('الاتصال سليم (' + r.transport + ')') : ('فشل الاتصال: ' + r.error));
              }).catch(fail);
            }
          }, 'فحص الاتصال'),
          h('button', {
            class: 'flex-1 bg-white border border-slate-200 rounded-xl py-2.5 text-sm text-slate-700',
            onclick: function () {
              api.post('/api/admin/mail/flush').then(function (r) {
                toast('أُرسلت ' + toAr(r.sent) + ' — فشلت ' + toAr(r.failed));
                load();
              }).catch(fail);
            }
          }, 'إرسال المعلّق'),
          h('button', {
            class: 'flex-1 bg-white border border-slate-200 rounded-xl py-2.5 text-sm text-slate-700',
            onclick: function () {
              api.post('/api/admin/tick').then(function (r) {
                toast('المحرّك: ' + toAr(r.overdue) + ' متأخرة، ' + toAr(r.dueSoon) + ' قريبة');
                load();
              }).catch(fail);
            }
          }, 'تشغيل المحرّك')
        ]),
        box
      ])
    ]);
  }

  /* ── settings index ───────────────────────────── */
  function SettingsPage() {
    var st = local({ view: cur().param || 'index' });
    var perms = P();
    function Row(icon, title, desc, onClick, badge) {
      return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 text-right', onclick: onClick }, [
        h('div', { class: 'w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0' }, [ic(icon, 19)]),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'font-semibold text-slate-800 text-sm' }, title),
          h('div', { class: 'text-xs text-slate-400 mt-0.5' }, desc)
        ]),
        badge ? h('span', { class: 'text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg' }, toAr(badge)) : null,
        h('span', { class: 'text-slate-300', style: { transform: 'rotate(180deg)' } }, [ic('arrowRight', 16)])
      ]);
    }
    var backToIndex = function () { st.view = 'index'; render(); };
    if (st.view === 'registrations') return RegistrationsPanel(backToIndex);
    if (st.view === 'users') return UsersPanel(backToIndex);
    if (st.view === 'branches') return BranchesPanel(backToIndex);
    if (st.view === 'vars') return VarsPanel(backToIndex);
    if (st.view === 'team') return TeamPanel(backToIndex);
    if (st.view === 'notif') return NotifPanel(backToIndex);
    if (st.view === 'mail') return MailPanel(backToIndex);

    return h('div', {}, [
      TopBar({ title: 'الإعدادات والإدارة', onBack: back, label: S.user.label }),
      h('div', { class: 'p-4 space-y-2.5' }, [
        perms.manageUsers ? Row('users', 'طلبات التسجيل', 'اعتماد أو رفض طلبات الحسابات الجديدة', function () { st.view = 'registrations'; render(); }, S.pendingRegistrations) : null,
        perms.manageUsers ? Row('user', 'المستخدمون والصلاحيات', 'الحسابات والتحكم الدقيق بالصلاحيات', function () { st.view = 'users'; render(); }) : null,
        perms.manageEntities ? Row('building', 'الفروع والتصنيفات', 'إدارة الفروع وأنواع المهام', function () { st.view = 'branches'; render(); }) : null,
        perms.settings ? Row('grid', 'المتغيّرات', 'الأولويات والحالات والأنواع — إضافة وحذف', function () { st.view = 'vars'; render(); }) : null,
        perms.manageTeam ? Row('user', 'الفريق', 'الأشخاص المتاحون للتكليف', function () { st.view = 'team'; render(); }) : null,
        perms.settings ? Row('bell', 'الإشعارات', 'تفعيل وتخصيص الإشعارات والمستلمين', function () { st.view = 'notif'; render(); }) : null,
        perms.settings ? Row('mail', 'سجل البريد', 'كل رسالة أُرسلت أو في الانتظار', function () { st.view = 'mail'; render(); }) : null
      ])
    ]);
  }

  window.ADMINV = { SettingsPage: SettingsPage };
}());
