/* ===========================================================================
   متابِع — the record, the form, the library, reports, alerts, settings.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, U = window.UI, T = window.ST, V = window.VIEWS;
  var h = U.h, ic = U.ic, mount = U.mount, api = M.api;
  var S = T.S, C = T.C, P = T.P;
  var toAr = M.toAr, fmtDate = M.fmtDate, fmtWhen = M.fmtWhen;
  var isDone = T.isDone, isParked = T.isParked, isActive = T.isActive, isOD = T.isOD, dueLabel = T.dueLabel;
  var cur = V.cur, go = V.go, back = V.back, replace = V.replace, local = V.local, sub = V.sub;
  var TopBar = V.TopBar, Toggle = V.Toggle, openModal = V.openModal, toast = V.toast, fail = V.fail;
  var INP = V.INP, textInput = V.textInput, field = V.field, IssueCard = V.IssueCard;
  function render() { window.APP.render(); }

  /* ── the record ───────────────────────────────── */
  function IssuePage() {
    var iid = cur().param;
    var st = local({ photos: null, loadingPhotos: false, delConf: false });
    var cfgC = C(), perms = P();
    var issue = T.issue(iid);
    if (!issue) {
      return h('div', { class: 'flex flex-col items-center justify-center text-slate-400 p-8', style: { minHeight: '16rem' } }, [
        ic('refresh', 32), h('p', { class: 'text-sm mt-3' }, 'الملاحظة غير موجودة'),
        h('button', { class: 'mt-4 text-sky-600 text-sm', onclick: back }, 'رجوع')
      ]);
    }
    var ent = T.entity(issue.entityId);
    var cat = ent && (ent.categories || []).find(function (c) { return c.id === issue.categoryId; });
    var p = cfgC.P[issue.priority] || { bar: 'bg-slate-300', chip: M.CHIP.slate, label: issue.priority };
    var s = cfgC.S[issue.status] || { chip: M.CHIP.slate, label: issue.status };
    var dl = dueLabel(issue);
    var cd = (issue.checklist || []).filter(function (c) { return c.done; }).length;
    var ct = (issue.checklist || []).length;
    var flow = cfgC.statuses.filter(function (x) { return !x.parked; });
    var idx = flow.findIndex(function (x) { return x.key === issue.status; });
    var next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
    var prev = idx > 0 ? flow[idx - 1] : null;
    var parkS = cfgC.statuses.find(function (x) { return x.parked; });

    function apply(promise, okMsg) {
      return promise.then(function (res) {
        if (res && res.issue) T.mergeIssue(res.issue);
        if (okMsg) toast(okMsg);
        render();
      }).catch(fail);
    }
    function move(key, note) {
      api.post('/api/issues/' + encodeURIComponent(iid) + '/status', { status: key, note: note })
        .then(function (res) {
          T.mergeIssue(res.issue);
          toast('تم التحديث ✓');
          return T.loadIssues();
        })
        .then(function () { render(); })
        .catch(fail);
    }

    /* Photographs are fetched only when the record is open — they are large. */
    var photoWrap = h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4 space-y-4' });
    if (perms.photos && st.photos === null && !st.loadingPhotos) {
      st.loadingPhotos = true;
      api.get('/api/issues/' + encodeURIComponent(iid) + '?photos=1').then(function (res) {
        st.photos = (res.issue && res.issue.photos) || { before: [], after: [] };
        st.loadingPhotos = false;
        drawPhotos();
      }).catch(function () { st.loadingPhotos = false; st.photos = { before: [], after: [] }; drawPhotos(); });
    }
    function lightbox(src) {
      var box = h('div', { class: 'fixed inset-0 z-50 bg-black/90 flex items-center justify-center mut-overlay', onclick: function () { box.remove(); } },
        [h('img', { src: src, alt: '', class: 'max-w-full max-h-full object-contain' })]);
      document.body.appendChild(box);
    }
    function upload(files, kind) {
      var list = Array.prototype.slice.call(files || []).filter(function (f) { return f && f.type.indexOf('image/') === 0; });
      if (!list.length) return;
      toast('جارٍ الرفع…');
      Promise.all(list.map(function (f) { return M.compress(f); })).then(function (images) {
        images = images.filter(Boolean);
        if (!images.length) { toast('تعذّر قراءة الصورة'); return null; }
        return api.post('/api/issues/' + encodeURIComponent(iid) + '/photos', { kind: kind, images: images });
      }).then(function (res) {
        if (!res) return;
        T.mergeIssue(res.issue);
        st.photos = (res.issue && res.issue.photos) || st.photos;
        drawPhotos();
        toast('تمت إضافة الصور ✓');
        render();
      }).catch(fail);
    }
    function drawPhotos() {
      if (!perms.photos) { mount(photoWrap, []); photoWrap.style.display = 'none'; return; }
      var pics = st.photos || { before: [], after: [] };
      mount(photoWrap, [{ kind: 'before', label: 'صور الحالة (قبل)' }, { kind: 'after', label: 'صور الإنجاز (بعد)' }].map(function (g) {
        var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer', style: { fontSize: '16px' } });
        fileIn.addEventListener('change', function () { upload(fileIn.files, g.kind); fileIn.value = ''; });
        return h('div', {}, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, g.label),
          h('div', { class: 'grid grid-cols-3 gap-2' }, (pics[g.kind] || []).map(function (ph) {
            return h('button', { class: 'rounded-xl overflow-hidden border border-slate-200', style: { aspectRatio: '1/1' }, onclick: function () { lightbox(ph.data); } },
              [h('img', { src: ph.data, alt: '', class: 'w-full h-full object-cover' })]);
          }).concat([
            h('div', { class: 'relative rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5', style: { aspectRatio: '1/1' } }, [
              ic('camera', 16, 'text-slate-400'),
              h('span', { class: 'text-slate-400', style: { fontSize: '9px' } }, st.loadingPhotos ? '…' : 'إضافة'),
              fileIn
            ])
          ]))
        ]);
      }));
    }
    drawPhotos();

    var chkIn = h('input', { class: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'إضافة مهمة…' });
    function sendChk() {
      var t = chkIn.value.trim();
      if (!t) return;
      chkIn.value = '';
      apply(api.post('/api/issues/' + encodeURIComponent(iid) + '/checklist', { text: t }));
    }
    chkIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChk(); });

    var cmtIn = h('input', { class: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'اكتب تعليقاً…' });
    function sendCmt() {
      var t = cmtIn.value.trim();
      if (!t) return;
      cmtIn.value = '';
      apply(api.post('/api/issues/' + encodeURIComponent(iid) + '/comments', { text: t }));
    }
    cmtIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendCmt(); });

    function actionPanel() {
      if (!(perms.changeStatus || perms.approve)) return null;
      var rows = [];
      if (isParked(issue.status)) {
        rows.push(h('button', {
          class: 'w-full bg-blue-50 text-blue-700 border border-blue-200 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1',
          onclick: function () { move(flow[0] && flow[0].key, 'استئناف المهمة'); }
        }, [ic('play', 15), 'استئناف المهمة']));
      } else if (s.gate) {
        if (perms.approve) {
          if (next) rows.push(h('button', {
            class: 'w-full bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl py-2.5 text-sm font-medium',
            onclick: function () { move(next.key, 'اعتماد → ' + next.label); }
          }, 'اعتماد → ' + next.label));
          if (prev) rows.push(h('button', {
            class: 'w-full bg-rose-50 text-rose-600 border border-rose-200 rounded-xl py-2.5 text-sm font-medium',
            onclick: function () { move(prev.key, 'إرجاع للتعديل'); }
          }, 'إرجاع للتعديل'));
        } else {
          rows.push(h('div', { class: 'bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 text-center' }, 'بانتظار اعتماد المسؤول'));
        }
      } else if (next) {
        if (perms.changeStatus) rows.push(h('button', {
          class: 'w-full bg-blue-50 text-blue-700 border border-blue-200 rounded-xl py-2.5 text-sm font-medium',
          onclick: function () { move(next.key, 'الانتقال إلى: ' + next.label); }
        }, 'الانتقال إلى: ' + next.label));
      } else if (perms.approve && prev) {
        rows.push(h('button', {
          class: 'w-full bg-slate-100 text-slate-600 border border-slate-200 rounded-xl py-2.5 text-sm font-medium',
          onclick: function () { move(prev.key, 'إعادة فتح'); }
        }, 'إعادة فتح'));
      } else {
        rows.push(h('div', { class: 'bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 text-center' }, 'تم الإنجاز ✓'));
      }
      if (parkS && perms.changeStatus && !isParked(issue.status) && !isDone(issue.status)) {
        rows.push(h('button', {
          class: 'w-full bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1',
          onclick: function () { move(parkS.key, 'تم التعليق'); }
        }, [ic('pause', 15), 'تعليق المهمة']));
      }
      return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
        h('div', { class: 'text-xs text-slate-400 mb-3' }, 'الإجراء — الحالة الحالية: ' + s.label),
        h('div', { class: 'space-y-2' }, rows)
      ]);
    }

    return h('div', {}, [
      TopBar({
        title: 'تفاصيل الملاحظة', onBack: back, label: S.user.label,
        right: perms.edit ? [h('button', { class: 'bg-white/20 p-2 rounded-xl', 'aria-label': 'تعديل', onclick: function () { go('editIssue', iid); } }, [ic('edit', 14)])] : null
      }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 overflow-hidden' }, [
          h('div', { class: 'h-1.5 ' + p.bar }),
          h('div', { class: 'p-4' }, [
            h('div', { class: 'flex items-start gap-2 mb-3' }, [
              h('h2', { class: 'font-bold text-slate-800 flex-1 leading-snug' }, issue.title),
              h('span', { class: 'text-xs border rounded-lg px-2 py-1 flex-shrink-0 ' + s.chip }, s.label)
            ]),
            h('div', { class: 'flex flex-wrap gap-2' }, [
              h('span', { class: 'text-xs border rounded-lg px-2 py-1 ' + p.chip }, p.label),
              h('span', { class: 'text-xs ' + dl.cls }, dl.text),
              issue.repeat !== 'none' ? h('span', { class: 'text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1' }, [ic('refresh', 10), issue.repeat === 'weekly' ? 'أسبوعية' : 'شهرية']) : null
            ].concat((issue.tags || []).map(function (t) {
              return h('span', { class: 'text-xs bg-slate-100 text-slate-600 rounded-lg px-2 py-0.5' }, t);
            })))
          ])
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5' }, [
          { l: 'الجهة', v: ent && ent.name }, { l: 'التصنيف', v: cat && cat.name },
          { l: 'المسؤول', v: issue.assignee }, { l: 'المُنشئ', v: issue.reporter },
          { l: 'الاستحقاق', v: issue.dueDate ? fmtDate(issue.dueDate) : null }
        ].map(function (r) {
          return h('div', { class: 'flex justify-between text-sm' }, [
            h('span', { class: 'text-slate-400' }, r.l),
            h('span', { class: 'text-slate-700 font-medium' }, r.v || '—')
          ]);
        })),
        issue.description ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-xs text-slate-400 mb-1' }, 'التفاصيل'),
          h('div', { class: 'text-sm text-slate-700 whitespace-pre-wrap' }, issue.description)
        ]) : null,
        actionPanel(),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center justify-between mb-3' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700' }, 'قائمة المهام الفرعية'),
            ct > 0 ? h('span', { class: 'text-xs text-slate-400' }, toAr(cd) + '/' + toAr(ct)) : null
          ]),
          ct > 0 ? h('div', { class: 'w-full bg-slate-100 rounded-full mb-3', style: { height: '6px' } },
            [h('div', { class: 'bg-sky-500 rounded-full', style: { height: '6px', width: (cd / ct * 100) + '%' } })]) : null,
          h('div', { class: 'space-y-2 mb-3' }, (issue.checklist || []).map(function (item) {
            return h('div', { class: 'flex items-center gap-2' }, [
              h('button', {
                class: 'rounded-md border flex items-center justify-center flex-shrink-0 ' + (item.done ? 'bg-sky-500 border-sky-500' : 'border-slate-300'),
                style: { width: '1.25rem', height: '1.25rem' },
                onclick: function () { apply(api.patch('/api/issues/' + encodeURIComponent(iid) + '/checklist/' + encodeURIComponent(item.id))); }
              }, item.done ? [ic('check', 12, 'text-white')] : []),
              h('span', { class: 'text-sm flex-1 ' + (item.done ? 'line-through text-slate-400' : 'text-slate-700') }, item.text),
              h('button', {
                class: 'text-slate-300', 'aria-label': 'حذف',
                onclick: function () { apply(api.del('/api/issues/' + encodeURIComponent(iid) + '/checklist/' + encodeURIComponent(item.id))); }
              }, [ic('x', 13)])
            ]);
          })),
          h('div', { class: 'flex gap-2' }, [chkIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: sendChk }, [ic('plus', 17)])])
        ]),
        photoWrap,
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'التعليقات'),
          h('div', { class: 'space-y-3 mb-3' }, (issue.comments || []).length ? issue.comments.map(function (c) {
            return h('div', { class: 'rounded-2xl p-3 ' + (c.mgr ? 'bg-sky-50' : 'bg-slate-100') }, [
              h('div', { class: 'flex justify-between text-xs text-slate-400 mb-1' }, [
                h('span', { class: 'font-medium text-slate-600' }, c.author),
                h('span', {}, fmtDate(c.at))
              ]),
              h('p', { class: 'text-sm text-slate-700' }, c.text)
            ]);
          }) : [h('p', { class: 'text-xs text-slate-300 text-center py-2' }, 'لا توجد تعليقات بعد')]),
          perms.comment ? h('div', { class: 'flex gap-2' }, [cmtIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إرسال', onclick: sendCmt }, [ic('send', 17)])]) : null
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'سجل النشاط'),
          h('div', { class: 'space-y-2' }, (issue.activity || []).slice().reverse().map(function (a) {
            return h('div', { class: 'flex gap-2 text-xs' }, [
              h('div', { class: 'rounded-full bg-slate-300 flex-shrink-0', style: { width: '6px', height: '6px', marginTop: '6px' } }),
              h('div', {}, [
                h('span', { class: 'text-slate-600 font-medium' }, a.by || '—'),
                h('span', { class: 'text-slate-400 mx-1' }, '·'),
                h('span', { class: 'text-slate-700' }, a.note),
                h('div', { class: 'text-slate-300 mt-0.5' }, fmtDate(a.at))
              ])
            ]);
          }))
        ]),
        perms.del ? h('button', {
          class: 'w-full rounded-xl py-3 text-sm border ' + (st.delConf ? 'bg-rose-500 text-white border-rose-500' : 'bg-rose-50 text-rose-600 border-rose-200'),
          onclick: function () {
            if (!st.delConf) { st.delConf = true; render(); return; }
            api.del('/api/issues/' + encodeURIComponent(iid)).then(function () {
              T.dropIssue(iid); back(); toast('تم الحذف ✓');
            }).catch(fail);
          }
        }, st.delConf ? 'تأكيد الحذف — اضغط مرة أخرى' : 'حذف الملاحظة') : null
      ])
    ]);
  }

  /* ── the form ─────────────────────────────────── */
  function IssueForm() {
    var frame = cur();
    var isEdit = frame.view === 'editIssue';
    var editIssue = isEdit ? T.issue(frame.param) : null;
    var cfgC = C(), perms = P();
    if (isEdit && !editIssue) return h('div', { class: 'p-8 text-center text-slate-400' }, 'الملاحظة غير موجودة');

    var prefill = isEdit ? null : (frame.param || {});
    var defEid = (prefill && prefill.entityId) || (perms.scope === 'own' ? S.user.entityId : (S.entities[0] && S.entities[0].id) || '');
    var defPr = ((cfgC.priorities[Math.min(2, cfgC.priorities.length - 1)] || cfgC.priorities[0]) || {}).key;
    var st = local({
      entityId: isEdit ? editIssue.entityId : defEid,
      title: isEdit ? editIssue.title : '',
      description: isEdit ? (editIssue.description || '') : '',
      categoryId: isEdit ? editIssue.categoryId : '',
      priority: isEdit ? editIssue.priority : defPr,
      assignee: isEdit ? (editIssue.assignee || '') : '',
      dueDate: isEdit && editIssue.dueDate ? new Date(editIssue.dueDate).toISOString().slice(0, 10) : '',
      repeat: isEdit ? editIssue.repeat : 'none',
      tags: isEdit ? (editIssue.tags || []).slice() : [],
      status: isEdit ? editIssue.status : '',
      customCat: '', pending: [], saving: false
    });

    var cats = T.categoriesOf(st.entityId);
    var selCat = cats.find(function (c) { return c.id === st.categoryId; });
    var isOther = !!selCat && selCat.name === 'أخرى';
    function valid() { return st.title.trim() && st.entityId && st.categoryId && (!isOther || st.customCat.trim()); }

    var saveBtn = h('button', { class: 'w-full py-3 rounded-xl font-semibold text-sm' });
    function refreshSave() {
      var ok = valid() && !st.saving;
      saveBtn.className = 'w-full py-3 rounded-xl font-semibold text-sm ' + (ok ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-400');
      saveBtn.disabled = !ok;
      saveBtn.textContent = st.saving ? 'جارٍ الحفظ…' : (isEdit ? 'حفظ التعديلات' : 'إنشاء الملاحظة');
    }

    var entSel = h('select', { class: INP, disabled: perms.scope === 'own' });
    entSel.appendChild(h('option', { value: '' }, 'اختر الجهة…'));
    S.entities.forEach(function (e) { entSel.appendChild(h('option', { value: e.id, selected: e.id === st.entityId }, e.name)); });
    entSel.value = st.entityId || '';
    entSel.addEventListener('change', function () { st.entityId = entSel.value; st.categoryId = ''; render(); });

    var catSel = h('select', { class: INP });
    catSel.appendChild(h('option', { value: '' }, 'اختر التصنيف…'));
    cats.forEach(function (c) { catSel.appendChild(h('option', { value: c.id, selected: c.id === st.categoryId }, c.name)); });
    catSel.value = st.categoryId || '';
    catSel.addEventListener('change', function () { st.categoryId = catSel.value; render(); });

    var titleIn = textInput(st.title, function (v) { st.title = v; refreshSave(); }, { placeholder: 'اكتب عنوان الملاحظة…' });
    var descIn = h('textarea', { class: INP + ' resize-none', rows: 3 }, st.description);
    descIn.addEventListener('input', function () { st.description = descIn.value; });
    var customIn = textInput(st.customCat, function (v) { st.customCat = v; refreshSave(); });
    var assigneeIn = h('input', { class: INP, list: 'teamlist', value: st.assignee });
    assigneeIn.addEventListener('input', function () { st.assignee = assigneeIn.value; });
    var dataList = h('datalist', { id: 'teamlist' }, S.team.map(function (m) { return h('option', { value: m }); }));
    var dueIn = h('input', { class: INP, type: 'date', value: st.dueDate });
    dueIn.addEventListener('input', function () { st.dueDate = dueIn.value; });

    var tagsWrap = h('div', { class: 'flex flex-wrap gap-2 mb-2' });
    function drawTags() {
      mount(tagsWrap, st.tags.map(function (t) {
        return h('span', { class: 'text-xs bg-slate-100 text-slate-600 rounded-lg px-2 py-1 flex items-center gap-1' }, [
          t, h('button', { 'aria-label': 'حذف', onclick: function () { st.tags = st.tags.filter(function (x) { return x !== t; }); drawTags(); } }, [ic('x', 10)])
        ]);
      }));
    }
    drawTags();
    var tagIn = h('input', { class: INP, placeholder: 'وسم جديد…' });
    function addTag() {
      var t = tagIn.value.trim();
      if (!t) return;
      if (st.tags.indexOf(t) === -1) st.tags.push(t);
      tagIn.value = '';
      drawTags();
    }
    tagIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTag(); });

    /* Photos chosen before the record exists are held, then uploaded once the
       server has given the new issue an id. */
    var prevWrap = h('div', { class: 'flex flex-wrap gap-2' });
    function drawPrevs() {
      mount(prevWrap, st.pending.map(function (src, i) {
        return h('div', { class: 'rounded-xl overflow-hidden relative', style: { width: '4rem', height: '4rem' } }, [
          h('img', { src: src, alt: '', class: 'w-full h-full object-cover' }),
          h('button', {
            class: 'absolute bg-black/60 rounded-bl-xl p-0.5', style: { top: '0', right: '0' }, 'aria-label': 'حذف',
            onclick: function () { st.pending.splice(i, 1); drawPrevs(); }
          }, [ic('x', 11, 'text-white')])
        ]);
      }).concat([fileBox()]));
    }
    function fileBox() {
      var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer', style: { fontSize: '16px' } });
      fileIn.addEventListener('change', function () {
        var arr = Array.prototype.slice.call(fileIn.files || []).filter(function (f) { return f && f.type.indexOf('image/') === 0; });
        fileIn.value = '';
        if (!arr.length) return;
        Promise.all(arr.map(function (f) { return M.compress(f); })).then(function (imgs) {
          st.pending = st.pending.concat(imgs.filter(Boolean));
          drawPrevs();
        });
      });
      return h('div', { class: 'relative rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center', style: { width: '4rem', height: '4rem' } },
        [ic('camera', 18, 'text-slate-400'), fileIn]);
    }
    drawPrevs();

    saveBtn.addEventListener('click', function () {
      if (!valid() || st.saving) return;
      st.saving = true; refreshSave();
      var payload = {
        entityId: st.entityId, categoryId: st.categoryId, title: st.title.trim(),
        description: st.description.trim(), priority: st.priority, assignee: st.assignee.trim(),
        dueDate: st.dueDate ? new Date(st.dueDate).getTime() : null, repeat: st.repeat, tags: st.tags
      };
      if (isOther && st.customCat.trim()) payload.customCategory = st.customCat.trim();
      if (isEdit && perms.edit && st.status && st.status !== editIssue.status) payload.status = st.status;

      var call = isEdit
        ? api.patch('/api/issues/' + encodeURIComponent(editIssue.id), payload)
        : api.post('/api/issues', payload);

      call.then(function (res) {
        var id = res.issue.id;
        T.mergeIssue(res.issue);
        if (!isEdit && st.pending.length) {
          return api.post('/api/issues/' + encodeURIComponent(id) + '/photos', { kind: 'before', images: st.pending })
            .then(function (r2) { T.mergeIssue(r2.issue); return id; }, function () { return id; });
        }
        return id;
      }).then(function (id) {
        return T.refresh().then(function () {
          replace('issue', id);
          toast(isEdit ? 'تم التحديث ✓' : 'تم إنشاء الملاحظة ✓');
        });
      }).catch(function (err) {
        st.saving = false; refreshSave(); fail(err);
      });
    });
    refreshSave();

    function pickRow(items, get, set) {
      return h('div', { class: 'flex gap-2 flex-wrap' }, items.map(function (it) {
        return h('button', {
          class: 'text-sm px-3 py-1.5 rounded-xl border ' + (get() === it.k ? 'bg-sky-500 text-white border-sky-500' : (it.chip || 'bg-white text-slate-600 border-slate-200')),
          onclick: function () { set(it.k); render(); }
        }, it.l);
      }));
    }

    return h('div', {}, [
      TopBar({ title: isEdit ? 'تعديل الملاحظة' : 'ملاحظة جديدة', onBack: back, label: S.user.label }),
      h('div', { class: 'p-4 space-y-4 pb-8' }, [
        field('العنوان *', titleIn),
        field('التفاصيل', descIn),
        field('الجهة *', entSel),
        field('التصنيف *', catSel),
        isOther ? field('اكتب اسم التصنيف *', customIn) : null,
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الأولوية'),
          pickRow(cfgC.priorities.map(function (pr) { return { k: pr.key, l: pr.label, chip: cfgC.P[pr.key].chip }; }), function () { return st.priority; }, function (k) { st.priority = k; })
        ]),
        field('المسؤول', assigneeIn), dataList,
        field('تاريخ الاستحقاق', dueIn),
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'التكرار'),
          pickRow([{ k: 'none', l: 'بدون' }, { k: 'weekly', l: 'أسبوعي' }, { k: 'monthly', l: 'شهري' }], function () { return st.repeat; }, function (k) { st.repeat = k; })
        ]),
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الوسوم'),
          tagsWrap,
          h('div', { class: 'flex gap-2' }, [tagIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: addTag }, [ic('plus', 17)])])
        ]),
        (isEdit && perms.edit) ? h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الحالة (تجاوز يدوي)'),
          pickRow(cfgC.statuses.map(function (x) { return { k: x.key, l: x.label, chip: cfgC.S[x.key].chip }; }), function () { return st.status; }, function (k) { st.status = k; })
        ]) : null,
        !isEdit ? h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'صور الحالة (قبل)'), prevWrap]) : null,
        saveBtn
      ])
    ]);
  }

  /* ── library ──────────────────────────────────── */
  function LibraryPage() {
    var frame = cur();
    var perms = P();
    var st = local({ eid: (frame.param && frame.param.entityId) || (S.entities[0] && S.entities[0].id) || '', docs: null, loading: false });
    var listWrap = h('div', {});

    function load() {
      if (!st.eid) { mount(listWrap, h('div', { class: 'text-center text-slate-300 py-8 text-sm' }, 'لا توجد جهات')); return; }
      st.loading = true;
      mount(listWrap, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      api.get('/api/entities/' + encodeURIComponent(st.eid) + '/documents').then(function (res) {
        st.docs = res.documents || [];
        st.loading = false;
        draw();
      }).catch(function (err) { st.loading = false; st.docs = []; draw(); fail(err); });
    }
    function fmtSz(b) {
      return b < 1024 ? toAr(b) + ' B' : (b < 1048576 ? toAr(Math.round(b / 1024)) + ' KB' : toAr((b / 1048576).toFixed(1)) + ' MB');
    }
    function tIco(t) {
      if (String(t).indexOf('image/') === 0) return { i: 'image', c: 'text-violet-600 bg-violet-50' };
      if (String(t).indexOf('pdf') !== -1) return { i: 'fileText', c: 'text-rose-600 bg-rose-50' };
      return { i: 'fileText', c: 'text-sky-600 bg-sky-50' };
    }
    function draw() {
      if (!st.docs || !st.docs.length) {
        mount(listWrap, h('div', { class: 'text-center text-slate-300 py-8 text-sm' }, 'لا توجد ملفات'));
        return;
      }
      mount(listWrap, h('div', { class: 'space-y-2' }, st.docs.map(function (d) {
        var t = tIco(d.type);
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + t.c }, [ic(t.i, 18)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'text-sm font-medium text-slate-700 truncate' }, d.name),
            h('div', { class: 'text-xs text-slate-400' }, fmtDate(d.at) + ' · ' + (d.size ? fmtSz(d.size) : '—'))
          ]),
          h('div', { class: 'flex gap-1' }, [
            h('button', {
              class: 'p-2 text-slate-400', 'aria-label': 'تنزيل',
              onclick: function () {
                api.get('/api/documents/' + encodeURIComponent(d.id)).then(function (res) {
                  var doc = res.document;
                  if (!doc || !doc.data) { toast('لا توجد نسخة محفوظة من الملف'); return; }
                  var a = document.createElement('a');
                  a.href = doc.data; a.download = doc.name; a.click();
                }).catch(fail);
              }
            }, [ic('download', 15)]),
            perms.deleteDocs ? h('button', {
              class: 'p-2 text-slate-400', 'aria-label': 'حذف',
              onclick: function () {
                api.del('/api/documents/' + encodeURIComponent(d.id))
                  .then(function () { st.docs = st.docs.filter(function (x) { return x.id !== d.id; }); draw(); toast('تم الحذف ✓'); })
                  .catch(fail);
              }
            }, [ic('trash', 15)]) : null
          ])
        ]);
      })));
    }
    if (st.docs === null && !st.loading) load(); else draw();

    var uploadIn = h('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx', class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer', style: { fontSize: '16px' } });
    uploadIn.addEventListener('change', function () {
      var list = Array.prototype.slice.call(uploadIn.files || []).filter(Boolean);
      uploadIn.value = '';
      if (!list.length) return;
      toast('جارٍ الرفع…');
      Promise.all(list.map(function (f) {
        var reader = f.type.indexOf('image/') === 0 ? M.compress(f, 1200, 0.6) : M.readDataURL(f);
        return reader.then(function (data) { return { name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: data }; });
      })).then(function (files) {
        return api.post('/api/entities/' + encodeURIComponent(st.eid) + '/documents', { files: files });
      }).then(function (res) {
        toast('تم رفع ' + toAr(res.stored) + ' ملف ✓');
        load();
      }).catch(fail);
    });

    return h('div', {}, [
      TopBar({ title: 'المكتبة', onBack: S.stack.length > 1 ? back : null, label: S.user.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        S.entities.length > 1 ? h('div', { class: 'flex gap-2 overflow-x-auto ns' }, S.entities.map(function (e) {
          return h('button', {
            class: 'flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border ' + (st.eid === e.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'),
            onclick: function () { st.eid = e.id; st.docs = null; render(); }
          }, e.name);
        })) : null,
        perms.uploadDocs ? h('div', { class: 'relative w-full border-2 border-dashed border-slate-300 rounded-2xl py-6 flex flex-col items-center gap-2 text-slate-400' }, [
          ic('upload', 26),
          h('span', { class: 'text-sm' }, 'اضغط لرفع ملف من جهازك'),
          h('span', { class: 'text-xs text-slate-300' }, 'PDF · Word · Excel · صور'),
          uploadIn
        ]) : null,
        listWrap
      ])
    ]);
  }

  /* ── reports ──────────────────────────────────── */
  function ReportsPage() {
    var cfgC = C(), perms = P();
    var list = S.issues;
    var active = list.filter(isActive), overdue = list.filter(isOD);
    var done = list.filter(function (i) { return isDone(i.status); });
    var avgClose = done.length ? Math.round(done.reduce(function (s, i) { return s + (i.updatedAt - i.createdAt); }, 0) / done.length / 86400000) : 0;
    var odRate = active.length ? Math.round(overdue.length / active.length * 100) : 0;
    var sData = cfgC.statuses.map(function (s) {
      return { name: s.label, value: list.filter(function (i) { return i.status === s.key; }).length, color: M.HEX[s.color] };
    }).filter(function (d) { return d.value > 0; });
    var byE = S.entities.map(function (e) {
      return { name: e.name, value: list.filter(function (i) { return i.entityId === e.id && isActive(i); }).length, color: '#0ea5e9' };
    }).sort(function (a, b) { return b.value - a.value; });
    var aMap = {};
    active.forEach(function (i) { if (i.assignee) aMap[i.assignee] = (aMap[i.assignee] || 0) + 1; });
    var topA = Object.keys(aMap).map(function (k) { return { name: k, value: aMap[k], color: '#2563eb' }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 6);

    return h('div', {}, [
      TopBar({ title: 'التقارير', onBack: back, label: S.user.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'grid grid-cols-2 gap-3' }, [
          { l: 'مهام نشطة', v: toAr(active.length), c: 'bg-blue-50 text-blue-700' },
          { l: 'معدّل التأخير', v: toAr(odRate) + '%', c: 'bg-rose-50 text-rose-700' },
          { l: 'متوسط الإنجاز (يوم)', v: toAr(avgClose), c: 'bg-amber-50 text-amber-700' },
          { l: 'إجمالي المنجزة', v: toAr(done.length), c: 'bg-emerald-50 text-emerald-700' }
        ].map(function (k) {
          return h('div', { class: 'p-3 rounded-2xl text-right ' + k.c }, [
            h('div', { class: 'text-2xl font-bold' }, k.v),
            h('div', { class: 'text-xs mt-0.5' }, k.l)
          ]);
        })),
        sData.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'التوزيع حسب الحالة'),
          U.donut(sData, 190),
          h('div', { class: 'flex flex-wrap gap-2 justify-center' }, sData.map(function (d) {
            return h('span', { class: 'text-xs text-slate-500 flex items-center gap-1' }, [
              h('span', { class: 'rounded-full inline-block', style: { width: '10px', height: '10px', background: d.color } }),
              d.name + ' (' + toAr(d.value) + ')'
            ]);
          }))
        ]) : null,
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'المهام النشطة حسب الفرع'), U.hbars(byE)
        ]),
        topA.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'حِمل العمل حسب المسؤول'), U.hbars(topA)
        ]) : null,
        perms.export ? h('a', {
          class: 'w-full bg-white border border-slate-200 rounded-xl py-3 text-sm text-slate-700 flex items-center justify-center gap-2',
          href: '/api/export.csv', download: 'mutabea.csv'
        }, [ic('fileDown', 15), 'تصدير الملاحظات (CSV)']) : null
      ])
    ]);
  }

  /* ── notification centre ──────────────────────── */
  function AlertsPage() {
    var st = local({ items: null, loading: false });
    var box = h('div', { class: 'space-y-2' });
    function load() {
      st.loading = true;
      mount(box, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      api.get('/api/notifications?limit=80').then(function (res) {
        st.items = res.notifications || [];
        S.unread = res.unread || 0;
        st.loading = false;
        draw();
      }).catch(function (err) { st.loading = false; st.items = []; draw(); fail(err); });
    }
    function draw() {
      if (!st.items || !st.items.length) {
        mount(box, h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد إشعارات'));
        return;
      }
      mount(box, st.items.map(function (n) {
        var urgent = n.event === 'overdue' || n.event === 'pendingApproval' || n.event === 'registration';
        return h('button', {
          class: 'w-full text-right bg-white rounded-2xl border p-3 flex items-center gap-3 ' + (n.read ? 'border-slate-200' : 'border-sky-200 bg-sky-50'),
          onclick: function () {
            var after = function () {
              if (n.event === 'registration') { go('settings', 'registrations'); return; }
              if (n.issue_id && T.issue(n.issue_id)) go('issue', n.issue_id);
              else render();
            };
            if (!n.read) {
              n.read = 1;
              api.post('/api/notifications/read', { ids: [n.id] })
                .then(function (r) { S.unread = r.unread; after(); })
                .catch(after);
            } else after();
          }
        }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + (urgent ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600') },
            [ic(urgent ? 'alert' : 'bell', 18)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'text-sm font-semibold text-slate-800' }, (S.labels && S.labels.events && S.labels.events[n.event]) || n.event),
            h('div', { class: 'text-xs text-slate-500 truncate' }, n.title),
            n.text ? h('div', { class: 'text-xs text-slate-400 truncate' }, n.text) : null,
            h('div', { class: 'text-xs text-slate-300 mt-0.5' }, fmtWhen(n.at))
          ]),
          n.read ? null : h('span', { class: 'w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0' })
        ]);
      }));
    }
    if (st.items === null && !st.loading) load(); else draw();

    return h('div', {}, [
      TopBar({
        title: 'الإشعارات', onBack: back,
        right: [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl',
          onclick: function () {
            api.post('/api/notifications/read-all').then(function () {
              S.unread = 0;
              (st.items || []).forEach(function (n) { n.read = 1; });
              draw(); render();
            }).catch(fail);
          }
        }, 'تعليم الكل')]
      }),
      h('div', { class: 'p-4' }, [box])
    ]);
  }

  /* ── more ─────────────────────────────────────── */
  function MorePage() {
    var perms = P();
    var st = local({ about: false });
    return h('div', {}, [
      TopBar({ title: 'المزيد', label: S.user.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'bg-gradient-to-l from-sky-500 to-blue-600 text-white rounded-2xl p-5' }, [
          h('div', { class: 'text-xl font-bold' }, S.user.name),
          h('div', { class: 'text-sky-200 text-sm mt-0.5' }, perms.scope === 'all' ? 'صلاحية على كل الفروع' : 'صلاحية محدودة بالفرع'),
          h('div', { class: 'text-sky-200 text-xs mt-1', dir: 'ltr' }, S.user.email)
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100' }, [
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('reports'); } },
            [ic('barChart', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'التقارير والإحصاءات')]),
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('alerts'); } },
            [ic('bell', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700 flex-1' }, 'الإشعارات'),
              S.unread ? h('span', { class: 'text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg' }, toAr(S.unread)) : null]),
          (perms.settings || perms.manageUsers || perms.manageEntities || perms.manageTeam) ? h('button', {
            class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('settings'); }
          }, [ic('settings', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700 flex-1' }, 'الإعدادات والإدارة'),
            (perms.manageUsers && S.pendingRegistrations) ? h('span', { class: 'text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg' }, toAr(S.pendingRegistrations)) : null]) : null,
          perms.export ? h('a', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', href: '/api/export.csv', download: 'mutabea.csv' },
            [ic('fileDown', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'تصدير البيانات (CSV)')]) : null,
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { passwordModal(); } },
            [ic('lock', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'تغيير كلمة المرور')]),
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { st.about = !st.about; render(); } },
            [ic('info', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'حول التطبيق')])
        ]),
        st.about ? h('div', { class: 'bg-slate-50 rounded-2xl border border-slate-200 p-4 text-sm text-slate-600' }, [
          h('div', { class: 'font-bold text-slate-800 mb-1' }, 'متابِع'),
          h('p', {}, 'نظام متابعة المهام للفروع المتعددة — محرّك قابل للتهيئة بالكامل مع صلاحيات دقيقة لكل مستخدم.'),
          h('p', { class: 'text-xs text-slate-400 mt-2' }, 'Exceed Advisors — د. هاني الحداد')
        ]) : null,
        h('button', {
          class: 'w-full bg-rose-50 text-rose-600 border border-rose-200 rounded-xl py-3 text-sm flex items-center justify-center gap-2',
          onclick: function () { window.APP.signOut(); }
        }, [ic('logout', 15), 'تسجيل الخروج'])
      ])
    ]);
  }

  function passwordModal() {
    var form = { current: '', next: '' };
    var msg = h('div', { class: 'text-xs text-rose-600 mb-2' });
    msg.style.display = 'none';
    var close = openModal('تغيير كلمة المرور', [
      msg,
      h('div', { class: 'mb-4' }, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'كلمة المرور الحالية'),
        textInput('', function (v) { form.current = v; }, { type: 'password' })]),
      h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'كلمة المرور الجديدة'),
        textInput('', function (v) { form.next = v; }, { type: 'password' })]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
          onclick: function () {
            api.post('/api/auth/password', form).then(function () { close(); toast('تم تغيير كلمة المرور ✓'); })
              .catch(function (err) {
                msg.textContent = err.code === 'password_too_short' ? 'كلمة المرور قصيرة (٨ أحرف على الأقل)' : 'كلمة المرور الحالية غير صحيحة';
                msg.style.display = '';
              });
          }
        }, 'حفظ')
      ])
    ]);
  }

  window.VIEWS2 = {
    IssuePage: IssuePage, IssueForm: IssueForm, LibraryPage: LibraryPage,
    ReportsPage: ReportsPage, AlertsPage: AlertsPage, MorePage: MorePage
  };
}());
