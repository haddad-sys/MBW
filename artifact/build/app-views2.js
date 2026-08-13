/* ===========================================================================
   متابِع — issue detail, forms, library, reports, administration, router.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, V = window.MUTV;
  var h = V.h, mount = V.mount, ic = V.ic, toast = V.toast;
  var toAr = M.toAr, uid = M.uid, sg = M.sg, ss = M.ss, sd = M.sd, fmtDate = M.fmtDate;
  var isDone = M.isDone, isParked = M.isParked, isActive = M.isActive, isOD = M.isOD, dueLabel = M.dueLabel;
  var CHIP = M.CHIP, TINT = M.TINT, DOT = M.DOT, HEX = M.HEX, COLORS = M.COLORS;
  var S = V.S, C = V.C, P = V.P, vE = V.vE, vI = V.vI;
  var go = V.go, back = V.back, goTab = V.goTab, replace = V.replace, cur = V.cur, local = V.local, sub = V.sub;
  var TopBar = V.TopBar, Toggle = V.Toggle, openModal = V.openModal, IssueCard = V.IssueCard;
  var INP = V.INP, textInput = V.textInput;

  /* ── ISSUE DETAIL ─────────────────────────────── */
  function IssuePage() {
    var iid = cur().param;
    var st = local({ photos: null, delConf: false, cmt: '', chk: '' });
    var cfgC = C(), perms = P();
    var issue = S.issues.find(function (i) { return i.id === iid; });
    if (!issue) {
      return h('div', { class: 'flex flex-col items-center justify-center text-slate-400 p-8', style: { minHeight: '16rem' } }, [
        ic('refresh', 32), h('p', { class: 'text-sm mt-3' }, 'الملاحظة غير موجودة'),
        h('button', { class: 'mt-4 text-sky-600 text-sm', onclick: back }, 'رجوع')
      ]);
    }
    var ents = vE();
    var ent = ents.find(function (e) { return e.id === issue.entityId; });
    var cat = ent && ent.categories.find(function (c) { return c.id === issue.categoryId; });
    var p = cfgC.P[issue.priority] || { bar: 'bg-slate-300', chip: CHIP.slate, label: issue.priority };
    var s = cfgC.S[issue.status] || { chip: CHIP.slate, label: issue.status };
    var dl = dueLabel(cfgC, issue);
    var cd = issue.checklist.filter(function (c) { return c.done; }).length, ct = issue.checklist.length;
    var flow = cfgC.statuses.filter(function (x) { return !x.parked; });
    var idx = flow.findIndex(function (x) { return x.key === issue.status; });
    var next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
    var prev = idx > 0 ? flow[idx - 1] : null;
    var parkS = cfgC.statuses.find(function (x) { return x.parked; });

    var photoWrap = h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4 space-y-4' });
    if (st.photos === null) {
      sg('photos:' + iid).then(function (pp) { st.photos = pp || { before: [], after: [] }; drawPhotos(); });
    }
    function addPh(files, kind) {
      var list = Array.prototype.slice.call(files || []).filter(function (f) { return f && f.type.indexOf('image/') === 0; });
      if (!list.length) return;
      Promise.all(list.map(function (f) { return M.compress(f); })).then(function (imgs) {
        imgs = imgs.filter(Boolean);
        if (!imgs.length) { toast('تعذّر قراءة الصورة'); return; }
        var np = Object.assign({}, st.photos);
        np[kind] = (np[kind] || []).concat(imgs);
        st.photos = np;
        return ss('photos:' + iid, np).then(function () {
          return V.updIssue(iid, kind === 'before' ? { beforeCount: np.before.length } : { afterCount: np.after.length }, null);
        }).then(function () {
          V.notify('photoAdded', S.issues.find(function (x) { return x.id === iid; }));
          drawPhotos();
          toast('تمت إضافة الصور ✓');
        });
      });
    }
    function lightbox(src) {
      var box = h('div', { class: 'fixed inset-0 z-50 bg-black/90 flex items-center justify-center mut-overlay', onclick: function () { box.remove(); } }, [
        h('img', { src: src, alt: '', class: 'max-w-full max-h-full object-contain' })
      ]);
      document.body.appendChild(box);
    }
    function drawPhotos() {
      if (!perms.photos) { mount(photoWrap, []); photoWrap.style.display = 'none'; return; }
      var pics = st.photos || { before: [], after: [] };
      mount(photoWrap, [{ kind: 'before', label: 'صور الحالة (قبل)' }, { kind: 'after', label: 'صور الإنجاز (بعد)' }].map(function (g) {
        var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer', style: { fontSize: '16px' } });
        fileIn.addEventListener('change', function () { addPh(fileIn.files, g.kind); fileIn.value = ''; });
        return h('div', {}, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, g.label),
          h('div', { class: 'grid grid-cols-3 gap-2' }, (pics[g.kind] || []).map(function (src) {
            return h('button', { class: 'rounded-xl overflow-hidden border border-slate-200', style: { aspectRatio: '1/1' }, onclick: function () { lightbox(src); } }, [
              h('img', { src: src, alt: '', class: 'w-full h-full object-cover' })
            ]);
          }).concat([
            h('div', { class: 'relative rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-0.5', style: { aspectRatio: '1/1' } }, [
              ic('camera', 16, 'text-slate-400'),
              h('span', { class: 'text-slate-400', style: { fontSize: '9px' } }, 'إضافة'),
              fileIn
            ])
          ]))
        ]);
      }));
    }
    drawPhotos();

    var chkIn = h('input', { class: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'إضافة مهمة…' });
    var sendChk = function () {
      var t = chkIn.value.trim();
      if (!t) return;
      V.addChk(iid, t).then(function () { chkIn.value = ''; V.render(); });
    };
    chkIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChk(); });

    var cmtIn = h('input', { class: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'اكتب تعليقاً…' });
    var sendCmt = function () {
      var t = cmtIn.value.trim();
      if (!t) return;
      V.addComment(iid, t).then(function () { cmtIn.value = ''; V.render(); });
    };
    cmtIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendCmt(); });

    function actionPanel() {
      if (!(perms.changeStatus || perms.approve)) return null;
      var rows = [];
      if (isParked(cfgC, issue.status)) {
        rows.push(h('button', {
          class: 'w-full bg-blue-50 text-blue-700 border border-blue-200 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1',
          onclick: function () { V.moveStatus(iid, flow[0] && flow[0].key, 'استئناف المهمة'); }
        }, [ic('play', 15), 'استئناف المهمة']));
      } else {
        if (cfgC.S[issue.status] && cfgC.S[issue.status].gate) {
          if (perms.approve) {
            if (next) rows.push(h('button', {
              class: 'w-full bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl py-2.5 text-sm font-medium',
              onclick: function () { V.moveStatus(iid, next.key, 'اعتماد → ' + next.label); }
            }, 'اعتماد → ' + next.label));
            if (prev) rows.push(h('button', {
              class: 'w-full bg-rose-50 text-rose-600 border border-rose-200 rounded-xl py-2.5 text-sm font-medium',
              onclick: function () { V.moveStatus(iid, prev.key, 'إرجاع للتعديل'); }
            }, 'إرجاع للتعديل'));
          } else {
            rows.push(h('div', { class: 'bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 text-center' }, 'بانتظار اعتماد المسؤول'));
          }
        } else if (next) {
          if (perms.changeStatus) rows.push(h('button', {
            class: 'w-full bg-blue-50 text-blue-700 border border-blue-200 rounded-xl py-2.5 text-sm font-medium',
            onclick: function () { V.moveStatus(iid, next.key, 'الانتقال إلى: ' + next.label); }
          }, 'الانتقال إلى: ' + next.label));
        } else if (perms.approve && prev) {
          rows.push(h('button', {
            class: 'w-full bg-slate-100 text-slate-600 border border-slate-200 rounded-xl py-2.5 text-sm font-medium',
            onclick: function () { V.moveStatus(iid, prev.key, 'إعادة فتح'); }
          }, 'إعادة فتح'));
        } else {
          rows.push(h('div', { class: 'bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 text-center' }, 'تم الإنجاز ✓'));
        }
        if (parkS && perms.changeStatus && !isDone(cfgC, issue.status)) {
          rows.push(h('button', {
            class: 'w-full bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1',
            onclick: function () { V.moveStatus(iid, parkS.key, 'تم التعليق'); }
          }, [ic('pause', 15), 'تعليق المهمة']));
        }
      }
      return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
        h('div', { class: 'text-xs text-slate-400 mb-3' }, 'الإجراء — الحالة الحالية: ' + s.label),
        h('div', { class: 'space-y-2' }, rows)
      ]);
    }

    return h('div', {}, [
      TopBar({
        title: 'تفاصيل الملاحظة', onBack: back, label: S.auth.label,
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
            ].concat(issue.tags.map(function (t) {
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
          ct > 0 ? h('div', { class: 'w-full bg-slate-100 rounded-full mb-3', style: { height: '6px' } }, [
            h('div', { class: 'bg-sky-500 rounded-full', style: { height: '6px', width: (cd / ct * 100) + '%' } })
          ]) : null,
          h('div', { class: 'space-y-2 mb-3' }, issue.checklist.map(function (item) {
            return h('div', { class: 'flex items-center gap-2' }, [
              h('button', {
                class: 'rounded-md border flex items-center justify-center flex-shrink-0 ' + (item.done ? 'bg-sky-500 border-sky-500' : 'border-slate-300'),
                style: { width: '1.25rem', height: '1.25rem' },
                onclick: function () { V.togChk(iid, item.id).then(V.render); }
              }, item.done ? [ic('check', 12, 'text-white')] : []),
              h('span', { class: 'text-sm flex-1 ' + (item.done ? 'line-through text-slate-400' : 'text-slate-700') }, item.text),
              h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { V.delChk(iid, item.id).then(V.render); } }, [ic('x', 13)])
            ]);
          })),
          h('div', { class: 'flex gap-2' }, [chkIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: sendChk }, [ic('plus', 17)])])
        ]),
        photoWrap,
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'التعليقات'),
          h('div', { class: 'space-y-3 mb-3' }, issue.comments.length ? issue.comments.map(function (c) {
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
          h('div', { class: 'space-y-2' }, issue.activity.slice().reverse().map(function (a) {
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
            if (!st.delConf) { st.delConf = true; V.render(); return; }
            V.delIssue(iid).then(function () { back(); toast('تم الحذف ✓'); });
          }
        }, st.delConf ? 'تأكيد الحذف — اضغط مرة أخرى' : 'حذف الملاحظة') : null
      ])
    ]);
  }

  /* ── ISSUE FORM ───────────────────────────────── */
  function IssueForm() {
    var frame = cur();
    var isEdit = frame.view === 'editIssue';
    var editIssue = isEdit ? S.issues.find(function (i) { return i.id === frame.param; }) : null;
    var cfgC = C(), perms = P(), ents = vE();
    if (isEdit && !editIssue) return h('div', { class: 'p-8 text-center text-slate-400' }, 'الملاحظة غير موجودة');

    var prefill = isEdit ? null : (frame.param || {});
    var defEid = (prefill && prefill.entityId) || (perms.scope === 'own' ? S.auth.entityId : (ents[0] && ents[0].id) || '');
    var defPr = (cfgC.priorities[Math.min(2, cfgC.priorities.length - 1)] || cfgC.priorities[0] || {}).key;
    var st = local({
      entityId: isEdit ? editIssue.entityId : defEid,
      title: isEdit ? editIssue.title : '',
      description: isEdit ? (editIssue.description || '') : '',
      categoryId: isEdit ? editIssue.categoryId : '',
      priority: isEdit ? editIssue.priority : defPr,
      assignee: isEdit ? (editIssue.assignee || '') : '',
      dueDate: isEdit && editIssue.dueDate ? new Date(editIssue.dueDate).toISOString().slice(0, 10) : '',
      repeat: isEdit ? editIssue.repeat : 'none',
      tags: isEdit ? editIssue.tags.slice() : [],
      status: isEdit ? editIssue.status : '',
      customCat: '', bFiles: [], bPrevs: [], saving: false
    });

    var selEnt = ents.find(function (e) { return e.id === st.entityId; });
    var cats = (selEnt && selEnt.categories) || [];
    var selCat = cats.find(function (c) { return c.id === st.categoryId; });
    var isOther = !!selCat && selCat.name === 'أخرى';
    var valid = function () {
      return st.title.trim() && st.entityId && st.categoryId && (!isOther || st.customCat.trim());
    };

    var saveBtn = h('button', { class: 'w-full py-3 rounded-xl font-semibold text-sm' });
    function refreshSave() {
      var ok = valid() && !st.saving;
      saveBtn.className = 'w-full py-3 rounded-xl font-semibold text-sm ' + (ok ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-400');
      saveBtn.disabled = !ok;
      saveBtn.textContent = st.saving ? 'جارٍ الحفظ…' : (isEdit ? 'حفظ التعديلات' : 'إنشاء الملاحظة');
    }

    var entSel = h('select', { class: INP, disabled: perms.scope === 'own' });
    entSel.appendChild(h('option', { value: '' }, 'اختر الجهة…'));
    ents.forEach(function (e) { entSel.appendChild(h('option', { value: e.id, selected: e.id === st.entityId }, e.name)); });
    entSel.value = st.entityId || '';
    entSel.addEventListener('change', function () { st.entityId = entSel.value; st.categoryId = ''; V.render(); });

    var catSel = h('select', { class: INP });
    catSel.appendChild(h('option', { value: '' }, 'اختر التصنيف…'));
    cats.forEach(function (c) { catSel.appendChild(h('option', { value: c.id, selected: c.id === st.categoryId }, c.name)); });
    catSel.value = st.categoryId || '';
    catSel.addEventListener('change', function () { st.categoryId = catSel.value; V.render(); });

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
    var addTag = function () {
      var t = tagIn.value.trim();
      if (!t) return;
      if (st.tags.indexOf(t) === -1) st.tags.push(t);
      tagIn.value = '';
      drawTags();
    };
    tagIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTag(); });

    var prevWrap = h('div', { class: 'flex flex-wrap gap-2' });
    function drawPrevs() {
      mount(prevWrap, st.bPrevs.map(function (src, i) {
        return h('div', { class: 'rounded-xl overflow-hidden relative', style: { width: '4rem', height: '4rem' } }, [
          h('img', { src: src, alt: '', class: 'w-full h-full object-cover' }),
          h('button', {
            class: 'absolute bg-black/60 rounded-bl-xl p-0.5', style: { top: '0', right: '0' }, 'aria-label': 'حذف',
            onclick: function () { st.bPrevs.splice(i, 1); st.bFiles.splice(i, 1); drawPrevs(); }
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
        st.bFiles = st.bFiles.concat(arr);
        Promise.all(arr.map(function (f) { return M.readDataURL(f); })).then(function (prevs) {
          st.bPrevs = st.bPrevs.concat(prevs.filter(Boolean));
          drawPrevs();
        });
      });
      return h('div', { class: 'relative rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center', style: { width: '4rem', height: '4rem' } }, [
        ic('camera', 18, 'text-slate-400'), fileIn
      ]);
    }
    drawPrevs();

    function ensureCat(eid, name) {
      var tr = name.trim();
      var upd = S.ents.map(function (e) {
        if (e.id !== eid) return e;
        if (e.categories.find(function (c) { return c.name.trim() === tr; })) return e;
        return Object.assign({}, e, { categories: e.categories.concat([{ id: uid(), name: tr }]) });
      });
      return V.pE(upd).then(function () {
        var e = upd.find(function (x) { return x.id === eid; });
        var c = e && e.categories.find(function (y) { return y.name.trim() === tr; });
        return c && c.id;
      });
    }

    saveBtn.addEventListener('click', function () {
      if (!valid() || st.saving) return;
      st.saving = true; refreshSave();
      Promise.resolve(isOther && st.customCat.trim() ? ensureCat(st.entityId, st.customCat.trim()) : st.categoryId)
        .then(function (catId) {
          var patch = {
            entityId: st.entityId, categoryId: catId, title: st.title.trim(), description: st.description.trim(),
            priority: st.priority, assignee: st.assignee.trim(),
            dueDate: st.dueDate ? new Date(st.dueDate).getTime() : null,
            repeat: st.repeat, tags: st.tags
          };
          if (isEdit) {
            var sp = (perms.edit && st.status && st.status !== editIssue.status) ? { status: st.status } : {};
            return V.updIssue(editIssue.id, Object.assign({}, patch, sp), 'تم تعديل الملاحظة').then(function (u) {
              V.notify('taskUpdated', u);
              replace('issue', editIssue.id);
              toast('تم التحديث ✓');
            });
          }
          return V.createIssue(patch, st.bFiles).then(function (nid) {
            replace('issue', nid);
            toast('تم إنشاء الملاحظة ✓');
          });
        })
        .then(null, function () { toast('تعذّر الحفظ'); })
        .then(function () { st.saving = false; refreshSave(); });
    });
    refreshSave();

    function pickRow(items, selected, onPick) {
      var row = h('div', { class: 'flex gap-2 flex-wrap' });
      items.forEach(function (it) {
        row.appendChild(h('button', {
          class: 'text-sm px-3 py-1.5 rounded-xl border ' + (selected() === it.k ? 'bg-sky-500 text-white border-sky-500' : (it.chip || 'bg-white text-slate-600 border-slate-200')),
          onclick: function () { onPick(it.k); V.render(); }
        }, it.l));
      });
      return row;
    }

    return h('div', {}, [
      TopBar({ title: isEdit ? 'تعديل الملاحظة' : 'ملاحظة جديدة', onBack: back, label: S.auth.label }),
      h('div', { class: 'p-4 space-y-4 pb-8' }, [
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'العنوان *'), titleIn]),
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'التفاصيل'), descIn]),
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'الجهة *'), entSel]),
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'التصنيف *'), catSel]),
        isOther ? h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'اكتب اسم التصنيف *'), customIn]) : null,
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الأولوية'),
          pickRow(cfgC.priorities.map(function (pr) { return { k: pr.key, l: pr.label, chip: cfgC.P[pr.key].chip }; }), function () { return st.priority; }, function (k) { st.priority = k; })
        ]),
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'المسؤول'), assigneeIn, dataList]),
        h('div', {}, [h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, 'تاريخ الاستحقاق'), dueIn]),
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'التكرار'),
          pickRow([{ k: 'none', l: 'بدون' }, { k: 'weekly', l: 'أسبوعي' }, { k: 'monthly', l: 'شهري' }], function () { return st.repeat; }, function (k) { st.repeat = k; })
        ]),
        h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الوسوم'),
          tagsWrap,
          h('div', { class: 'flex gap-2' }, [tagIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: addTag }, [ic('plus', 17)])])
        ]),
        isEdit && perms.edit ? h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'الحالة (تجاوز يدوي)'),
          pickRow(cfgC.statuses.map(function (x) { return { k: x.key, l: x.label, chip: cfgC.S[x.key].chip }; }), function () { return st.status; }, function (k) { st.status = k; })
        ]) : null,
        !isEdit ? h('div', {}, [
          h('label', { class: 'block text-sm font-medium text-slate-700 mb-2' }, 'صور الحالة (قبل)'), prevWrap
        ]) : null,
        saveBtn
      ])
    ]);
  }

  /* ── LIBRARY ──────────────────────────────────── */
  function LibraryPage() {
    var frame = cur();
    var perms = P(), ents = vE();
    var prefillEid = frame.param && frame.param.entityId;
    var st = local({ eid: prefillEid || (ents[0] && ents[0].id) || '', docs: null });

    var listWrap = h('div', {});
    function loadDocs() {
      st.docs = null;
      mount(listWrap, h('div', { class: 'text-center text-slate-400 py-8 text-sm' }, 'جارٍ التحميل…'));
      sg('docs:' + st.eid).then(function (d) { st.docs = d || []; drawDocs(); });
    }
    function fmtSz(b) {
      return b < 1024 ? toAr(b) + ' B' : (b < 1048576 ? toAr(Math.round(b / 1024)) + ' KB' : toAr((b / 1048576).toFixed(1)) + ' MB');
    }
    function tIco(t) {
      if (t.indexOf('image/') === 0) return { i: 'image', c: 'text-violet-600 bg-violet-50' };
      if (t.indexOf('pdf') !== -1) return { i: 'fileText', c: 'text-rose-600 bg-rose-50' };
      return { i: 'fileText', c: 'text-sky-600 bg-sky-50' };
    }
    function drawDocs() {
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
            d.data ? h('button', { class: 'p-2 text-slate-400', 'aria-label': 'تنزيل', onclick: function () { downloadDoc(d); } }, [ic('download', 15)]) : null,
            perms.deleteDocs ? h('button', {
              class: 'p-2 text-slate-400', 'aria-label': 'حذف',
              onclick: function () {
                st.docs = st.docs.filter(function (x) { return x.id !== d.id; });
                ss('docs:' + st.eid, st.docs).then(function () { drawDocs(); toast('تم الحذف ✓'); });
              }
            }, [ic('trash', 15)]) : null
          ])
        ]);
      })));
    }
    function downloadDoc(d) {
      if (!d.data) return;
      try {
        var a = document.createElement('a');
        a.href = d.data; a.download = d.name; a.click();
      } catch (e) { toast('تعذّر التنزيل'); }
    }
    function upload(files) {
      var list = Array.prototype.slice.call(files || []).filter(Boolean);
      if (!list.length) return;
      var jobs = list.map(function (f) {
        if (f.type.indexOf('image/') === 0) return M.compress(f, 1200, 0.6).then(function (data) { return { f: f, data: data }; });
        if (f.size < 1500000) return M.readDataURL(f).then(function (data) { return { f: f, data: data }; });
        return Promise.resolve({ f: f, data: null });
      });
      Promise.all(jobs).then(function (res) {
        var nd = res.map(function (r) {
          return { id: uid(), name: r.f.name, type: r.f.type || 'application/octet-stream', size: r.f.size, at: Date.now(), data: r.data };
        });
        st.docs = (st.docs || []).concat(nd);
        return ss('docs:' + st.eid, st.docs).then(function () {
          drawDocs();
          toast('تم رفع ' + toAr(nd.length) + ' ملف ✓');
          V.notify('libraryUpload', { id: 'lib', title: nd[0].name, entityId: st.eid, status: null, priority: null });
        });
      });
    }
    if (st.docs === null) loadDocs(); else drawDocs();

    var uploadIn = h('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx', class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer', style: { fontSize: '16px' } });
    uploadIn.addEventListener('change', function () { upload(uploadIn.files); uploadIn.value = ''; });

    return h('div', {}, [
      TopBar({ title: 'المكتبة', onBack: S.stack.length > 1 ? back : null, label: S.auth.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        ents.length > 1 ? h('div', { class: 'flex gap-2 overflow-x-auto ns' }, ents.map(function (e) {
          return h('button', {
            class: 'flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border ' + (st.eid === e.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'),
            onclick: function () { st.eid = e.id; loadDocs(); V.render(); }
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

  /* ── REPORTS ──────────────────────────────────── */
  function ReportsPage() {
    var cfgC = C(), perms = P(), ents = vE(), list = vI();
    var active = list.filter(function (i) { return isActive(cfgC, i); });
    var overdue = list.filter(function (i) { return isOD(cfgC, i); });
    var done = list.filter(function (i) { return isDone(cfgC, i.status); });
    var avgClose = done.length ? Math.round(done.reduce(function (s, i) { return s + (i.updatedAt - i.createdAt); }, 0) / done.length / 86400000) : 0;
    var odRate = active.length ? Math.round(overdue.length / active.length * 100) : 0;
    var sData = cfgC.statuses.map(function (s) {
      return { name: s.label, value: list.filter(function (i) { return i.status === s.key; }).length, color: HEX[s.color] };
    }).filter(function (d) { return d.value > 0; });
    var byE = ents.map(function (e) {
      return { name: e.name, value: list.filter(function (i) { return i.entityId === e.id && isActive(cfgC, i); }).length, color: '#0ea5e9' };
    }).sort(function (a, b) { return b.value - a.value; });
    var aMap = {};
    active.forEach(function (i) { if (i.assignee) aMap[i.assignee] = (aMap[i.assignee] || 0) + 1; });
    var topA = Object.keys(aMap).map(function (k) { return { name: k, value: aMap[k], color: '#2563eb' }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 6);

    return h('div', {}, [
      TopBar({ title: 'التقارير', onBack: back, label: S.auth.label }),
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
          V.donut(sData, 190),
          h('div', { class: 'flex flex-wrap gap-2 justify-center' }, sData.map(function (d) {
            return h('span', { class: 'text-xs text-slate-500 flex items-center gap-1' }, [
              h('span', { class: 'rounded-full inline-block', style: { width: '10px', height: '10px', background: d.color } }),
              d.name + ' (' + toAr(d.value) + ')'
            ]);
          }))
        ]) : null,
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'المهام النشطة حسب الفرع'),
          V.hbars(byE)
        ]),
        topA.length ? h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'حِمل العمل حسب المسؤول'),
          V.hbars(topA)
        ]) : null,
        perms.export ? h('button', {
          class: 'w-full bg-white border border-slate-200 rounded-xl py-3 text-sm text-slate-700 flex items-center justify-center gap-2',
          onclick: function () { M.exportCSV(cfgC, list, ents); }
        }, [ic('fileDown', 15), 'تصدير الملاحظات (CSV)']) : null
      ])
    ]);
  }

  /* ── ALERTS (in-page notification centre) ─────── */
  function AlertsPage() {
    var alerts = M.getAlerts();
    var box = h('div', { class: 'space-y-2' });
    if (!alerts.length) {
      box.appendChild(h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد إشعارات'));
    }
    alerts.forEach(function (a) {
      var urgent = !!M.URGENT_EVENTS[a.event];
      box.appendChild(h('button', {
        class: 'w-full text-right bg-white rounded-2xl border p-3 flex items-center gap-3 ' + (a.read ? 'border-slate-200' : 'border-sky-200 bg-sky-50'),
        onclick: function () {
          a.read = true;
          ss('alerts', M.getAlerts());
          if (a.issueId && S.issues.find(function (i) { return i.id === a.issueId; })) go('issue', a.issueId);
          else V.render();
        }
      }, [
        h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + (urgent ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600') }, [ic(urgent ? 'alert' : 'bell', 18)]),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'text-sm font-semibold text-slate-800' }, a.title),
          h('div', { class: 'text-xs text-slate-500 truncate' }, a.text),
          h('div', { class: 'text-xs text-slate-300 mt-0.5' }, fmtDate(a.at))
        ]),
        a.read ? null : h('span', { class: 'w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0' })
      ]));
    });
    return h('div', {}, [
      TopBar({
        title: 'الإشعارات', onBack: back,
        right: alerts.length ? [h('button', {
          class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl',
          onclick: function () {
            M.getAlerts().forEach(function (a) { a.read = true; });
            ss('alerts', M.getAlerts()).then(function () { V.render(); });
          }
        }, 'تعليم الكل')] : null
      }),
      h('div', { class: 'p-4' }, [box])
    ]);
  }

  /* ── MORE ─────────────────────────────────────── */
  function MorePage() {
    var cfgC = C(), perms = P();
    var st = local({ about: false });
    return h('div', {}, [
      TopBar({ title: 'المزيد', label: S.auth.label }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'bg-gradient-to-l from-sky-500 to-blue-600 text-white rounded-2xl p-5' }, [
          h('div', { class: 'text-xl font-bold' }, S.auth.name),
          h('div', { class: 'text-sky-200 text-sm mt-0.5' }, perms.scope === 'all' ? 'صلاحية على كل الفروع' : 'صلاحية محدودة بالفرع')
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100' }, [
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('reports'); } }, [ic('barChart', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'التقارير والإحصاءات')]),
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('alerts'); } }, [ic('bell', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'الإشعارات'), M.unreadAlerts() ? h('span', { class: 'text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg' }, toAr(M.unreadAlerts())) : null]),
          (perms.settings || perms.manageUsers || perms.manageEntities || perms.manageTeam) ? h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { go('settings'); } }, [ic('settings', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'الإعدادات والإدارة')]) : null,
          perms.export ? h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { M.exportCSV(cfgC, vI(), vE()); } }, [ic('fileDown', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'تصدير البيانات (CSV)')]) : null,
          h('button', { class: 'w-full px-4 py-3.5 flex items-center gap-3 text-right', onclick: function () { st.about = !st.about; V.render(); } }, [ic('info', 19, 'text-sky-500'), h('span', { class: 'text-sm text-slate-700' }, 'حول التطبيق')])
        ]),
        st.about ? h('div', { class: 'bg-slate-50 rounded-2xl border border-slate-200 p-4 text-sm text-slate-600' }, [
          h('div', { class: 'font-bold text-slate-800 mb-1' }, 'متابِع v2.0'),
          h('p', {}, 'نظام متابعة المهام للفروع المتعددة — محرّك قابل للتهيئة بالكامل مع صلاحيات دقيقة لكل مستخدم.'),
          h('p', { class: 'text-xs text-slate-400 mt-2' }, 'Exceed Advisors — د. هاني الحداد')
        ]) : null,
        perms.settings ? h('button', {
          class: 'w-full bg-amber-50 text-amber-700 border border-amber-200 rounded-xl py-3 text-sm',
          onclick: function () { V.resetDemo(); }
        }, 'إعادة ضبط العرض التوضيحي') : null,
        h('button', {
          class: 'w-full bg-rose-50 text-rose-600 border border-rose-200 rounded-xl py-3 text-sm flex items-center justify-center gap-2',
          onclick: function () { V.logout(); }
        }, [ic('logout', 15), 'تسجيل الخروج'])
      ])
    ]);
  }

  /* ── SETTINGS ─────────────────────────────────── */
  function SettingsPage() {
    var st = local({ view: 'index' });
    var perms = P();
    function Row(icon, title, desc, onClick) {
      return h('button', { class: 'w-full bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 text-right', onclick: onClick }, [
        h('div', { class: 'w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0' }, [ic(icon, 19)]),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'font-semibold text-slate-800 text-sm' }, title),
          h('div', { class: 'text-xs text-slate-400 mt-0.5' }, desc)
        ]),
        h('span', { class: 'text-slate-300', style: { transform: 'rotate(180deg)' } }, [ic('arrowRight', 16)])
      ]);
    }
    if (st.view === 'index') {
      return h('div', {}, [
        TopBar({ title: 'الإعدادات والإدارة', onBack: back, label: S.auth.label }),
        h('div', { class: 'p-4 space-y-2.5' }, [
          perms.manageUsers ? Row('users', 'المستخدمون والصلاحيات', 'الحسابات والتحكم الدقيق بالصلاحيات', function () { st.view = 'users'; V.render(); }) : null,
          perms.manageEntities ? Row('building', 'الفروع والتصنيفات', 'إدارة الفروع وأنواع المهام', function () { st.view = 'branches'; V.render(); }) : null,
          perms.settings ? Row('grid', 'المتغيّرات', 'الأولويات والحالات والأنواع — إضافة وحذف', function () { st.view = 'vars'; V.render(); }) : null,
          perms.manageTeam ? Row('user', 'الفريق', 'الأشخاص المتاحون للتكليف', function () { st.view = 'team'; V.render(); }) : null,
          perms.settings ? Row('bell', 'الإشعارات', 'تفعيل وتخصيص الإشعارات', function () { st.view = 'notif'; V.render(); }) : null,
          perms.settings ? Row('send', 'إعداد البريد (EmailJS)', 'ربط إرسال البريد', function () { st.view = 'emailjs'; V.render(); }) : null,
          perms.settings ? Row('fileText', 'سجل الرسائل', 'كل رسالة جرى تجهيزها أو إرسالها', function () { st.view = 'outbox'; V.render(); }) : null
        ])
      ]);
    }
    var backToIndex = function () { st.view = 'index'; V.render(); };
    if (st.view === 'users') return UsersPanel(backToIndex);
    if (st.view === 'branches') return BranchesPanel(backToIndex);
    if (st.view === 'vars') return VarsPanel(backToIndex);
    if (st.view === 'team') return TeamPanel(backToIndex);
    if (st.view === 'notif') return NotifPanel(backToIndex);
    if (st.view === 'emailjs') return EmailJSPanel(backToIndex);
    if (st.view === 'outbox') return OutboxPanel(backToIndex);
    return null;
  }

  /* Users + granular permissions */
  function UsersPanel(backFn) {
    function openEditor(acc, isNew) {
      var base = isNew ? { username: '', password: '', name: '', role: 'branch', entityId: (S.ents[0] && S.ents[0].id) || '', label: '', perms: JSON.parse(JSON.stringify(M.P_BR)) }
        : Object.assign({}, acc, { entityId: acc.entityId || '', label: acc.label || '', perms: JSON.parse(JSON.stringify(M.resolvePerms(acc))) });
      var f = base;
      var body = h('div', { class: 'space-y-3' });
      var close;
      function draw() {
        var entSel = h('select', { class: INP });
        entSel.appendChild(h('option', { value: '' }, '— اختر الفرع —'));
        S.ents.forEach(function (e) { entSel.appendChild(h('option', { value: e.id, selected: e.id === f.entityId }, e.name)); });
        entSel.value = f.entityId || '';
        entSel.addEventListener('change', function () { f.entityId = entSel.value; });

        mount(body, [
          h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'الاسم المعروض *'), textInput(f.name, function (v) { f.name = v; })]),
          h('div', { class: 'grid grid-cols-2 gap-2' }, [
            h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'المستخدم *'), textInput(f.username, function (v) { f.username = v; }, { dir: 'ltr', disabled: !isNew })]),
            h('div', {}, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'كلمة المرور *'), textInput(f.password, function (v) { f.password = v; }, { dir: 'ltr' })])
          ]),
          h('div', {}, [
            h('label', { class: 'block text-sm font-semibold text-slate-700 mb-2' }, 'قوالب جاهزة'),
            h('div', { class: 'flex gap-2' }, [
              h('button', { class: 'flex-1 text-xs py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-200', onclick: function () { f.perms = JSON.parse(JSON.stringify(M.P_MGR)); draw(); } }, 'مدير كامل'),
              h('button', { class: 'flex-1 text-xs py-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200', onclick: function () { f.perms = JSON.parse(JSON.stringify(M.P_BR)); draw(); } }, 'موظف فرع'),
              h('button', { class: 'flex-1 text-xs py-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200', onclick: function () { f.perms = JSON.parse(JSON.stringify(M.P_VIEW)); draw(); } }, 'قراءة فقط')
            ])
          ]),
          h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'نطاق الرؤية'),
            h('div', { class: 'flex gap-2' }, [{ k: 'all', l: 'كل الفروع' }, { k: 'own', l: 'فرعه فقط' }].map(function (o) {
              return h('button', {
                class: 'flex-1 text-sm py-2 rounded-xl border ' + (f.perms.scope === o.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
                onclick: function () { f.perms.scope = o.k; draw(); }
              }, o.l);
            })),
            f.perms.scope === 'own' ? h('div', { class: 'mt-2' }, [entSel]) : null
          ]),
          h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, 'التبويبات الظاهرة'),
            h('div', { class: 'space-y-2' }, Object.keys(M.TAB_LABELS).map(function (k) {
              return h('div', { class: 'flex items-center justify-between' }, [
                h('span', { class: 'text-sm text-slate-600' }, M.TAB_LABELS[k]),
                Toggle(!!(f.perms.tabs && f.perms.tabs[k]), function (v) { f.perms.tabs = f.perms.tabs || {}; f.perms.tabs[k] = v ? 1 : 0; draw(); })
              ]);
            }))
          ])
        ].concat(M.PERM_GROUPS.map(function (g) {
          return h('div', { class: 'bg-slate-50 rounded-xl p-3' }, [
            h('div', { class: 'text-sm font-semibold text-slate-700 mb-2' }, g.title),
            h('div', { class: 'space-y-2' }, g.items.map(function (it) {
              return h('div', { class: 'flex items-center justify-between' }, [
                h('span', { class: 'text-sm text-slate-600' }, it[1]),
                Toggle(!!f.perms[it[0]], function (v) { f.perms[it[0]] = v ? 1 : 0; draw(); })
              ]);
            }))
          ]);
        })).concat([
          h('div', { class: 'flex gap-3 pt-1' }, [
            h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
            h('button', { class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold', onclick: save }, 'حفظ')
          ])
        ]));
      }
      function save() {
        if (!f.username.trim() || !f.password.trim() || !f.name.trim()) { toast('أكمل الحقول المطلوبة'); return; }
        var role = f.perms.scope === 'all' ? 'manager' : 'branch';
        var acc2 = {
          username: f.username.trim(), password: f.password.trim(), name: f.name.trim(), role: role,
          entityId: f.perms.scope === 'own' ? (f.entityId || null) : null,
          label: (f.label || '').trim() || f.name.trim(), perms: f.perms
        };
        var list;
        if (isNew) {
          if (S.accounts.find(function (a) { return a.username === acc2.username; })) { toast('اسم المستخدم موجود'); return; }
          list = S.accounts.concat([acc2]);
        } else {
          list = S.accounts.map(function (a) { return a.username === acc.username ? acc2 : a; });
        }
        if (!list.some(function (a) { return M.resolvePerms(a).manageUsers; })) { toast('يجب إبقاء حساب واحد يملك إدارة المستخدمين'); return; }
        V.pAcc(list).then(function () {
          if (S.auth && acc && S.auth.username === acc.username) S.auth = acc2;
          close(); toast('تم الحفظ ✓'); V.render();
        });
      }
      draw();
      close = openModal(isNew ? 'حساب جديد' : 'تعديل الحساب', [body]);
    }

    return h('div', {}, [
      TopBar({
        title: 'المستخدمون والصلاحيات', onBack: backFn,
        right: [h('button', { class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1', onclick: function () { openEditor(null, true); } }, [ic('plus', 13), 'جديد'])]
      }),
      h('div', { class: 'p-4 space-y-2' }, S.accounts.map(function (a) {
        var ent = S.ents.find(function (e) { return e.id === a.entityId; });
        var rp = M.resolvePerms(a);
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + (rp.scope === 'all' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500') }, [ic('user', 18)]),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('div', { class: 'font-semibold text-slate-800 text-sm truncate' }, a.name),
            h('div', { class: 'text-xs text-slate-400', dir: 'ltr' }, a.username + ' · ' + (rp.scope === 'all' ? 'كل الفروع' : ((ent && ent.name) || 'فرع')))
          ]),
          h('button', { class: 'p-2 text-slate-400', 'aria-label': 'تعديل', onclick: function () { openEditor(a, false); } }, [ic('edit', 15)]),
          h('button', {
            class: 'p-2 text-slate-400', 'aria-label': 'حذف',
            onclick: function () {
              if (a.username === S.auth.username) { toast('لا يمكن حذف حسابك الحالي'); return; }
              var rest = S.accounts.filter(function (x) { return x.username !== a.username; });
              if (!rest.some(function (x) { return M.resolvePerms(x).manageUsers; })) { toast('يجب إبقاء حساب مدير واحد'); return; }
              V.pAcc(rest).then(function () { toast('تم الحذف ✓'); V.render(); });
            }
          }, [ic('trash', 15)])
        ]);
      }))
    ]);
  }

  /* Branches + categories */
  function BranchesPanel(backFn) {
    var st = sub('branches', { sel: null, delConf: null });
    var cfgC = C();
    if (st.sel) {
      var ent = S.ents.find(function (e) { return e.id === st.sel; });
      if (!ent) { st.sel = null; }
      else {
        var catIn = h('input', { class: INP, placeholder: 'تصنيف جديد…' });
        var addCat = function () {
          var v = catIn.value.trim();
          if (!v) return;
          V.pE(S.ents.map(function (e) {
            return e.id === st.sel ? Object.assign({}, e, { categories: e.categories.concat([{ id: uid(), name: v }]) }) : e;
          })).then(function () { catIn.value = ''; toast('تمت إضافة التصنيف ✓'); V.render(); });
        };
        catIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCat(); });
        return h('div', {}, [
          TopBar({ title: 'تصنيفات ' + ent.name, onBack: function () { st.sel = null; V.render(); } }),
          h('div', { class: 'p-4 space-y-3' }, [
            h('p', { class: 'text-xs text-slate-400' }, 'أنواع المهام لهذا الفرع'),
            h('div', { class: 'flex gap-2' }, [catIn, h('button', { class: 'bg-sky-500 text-white rounded-xl px-4', 'aria-label': 'إضافة', onclick: addCat }, [ic('plus', 17)])]),
            h('div', { class: 'space-y-2' }, ent.categories.map(function (c) {
              var nameIn = h('input', { class: 'flex-1 bg-transparent text-sm text-slate-700 focus:outline-none', value: c.name });
              nameIn.addEventListener('blur', function () {
                var v = nameIn.value.trim();
                if (!v || v === c.name) { nameIn.value = c.name; return; }
                V.pE(S.ents.map(function (e) {
                  return e.id === st.sel ? Object.assign({}, e, { categories: e.categories.map(function (x) { return x.id === c.id ? Object.assign({}, x, { name: v }) : x; }) }) : e;
                }));
              });
              return h('div', { class: 'bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-2' }, [
                nameIn,
                h('span', { class: 'text-xs text-slate-300' }, toAr(S.issues.filter(function (i) { return i.entityId === st.sel && i.categoryId === c.id; }).length)),
                h('button', {
                  class: 'text-slate-300', 'aria-label': 'حذف',
                  onclick: function () {
                    if (S.issues.some(function (i) { return i.entityId === st.sel && i.categoryId === c.id; })) { toast('لا يمكن حذف تصنيف به ملاحظات'); return; }
                    V.pE(S.ents.map(function (e) {
                      return e.id === st.sel ? Object.assign({}, e, { categories: e.categories.filter(function (x) { return x.id !== c.id; }) }) : e;
                    })).then(function () { toast('تم الحذف ✓'); V.render(); });
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
        right: [h('button', { class: 'bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1', onclick: function () { addBranchModal(cfgC); } }, [ic('plus', 13), 'فرع'])]
      }),
      h('div', { class: 'p-4 space-y-2' }, S.ents.map(function (e) {
        var tc = cfgC.E[e.type] || { icon: 'boxes', tint: TINT.slate, label: e.type };
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ' + tc.tint }, [ic(tc.icon, 19)]),
          h('button', { class: 'flex-1 min-w-0 text-right', onclick: function () { st.sel = e.id; V.render(); } }, [
            h('div', { class: 'font-semibold text-slate-800 text-sm truncate' }, e.name),
            h('div', { class: 'text-xs text-slate-400' }, tc.label + ' · ' + toAr(e.categories.length) + ' تصنيفات')
          ]),
          h('button', {
            class: 'p-2 ' + (st.delConf === e.id ? 'text-rose-500' : 'text-slate-400'), 'aria-label': 'حذف',
            onclick: function () { st.delConf = st.delConf === e.id ? null : e.id; V.render(); }
          }, [ic('trash', 15)])
        ]);
      }).concat(st.delConf ? [h('div', { class: 'bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm' }, [
        h('p', { class: 'text-rose-700 mb-2' }, 'حذف الفرع سيحذف ملاحظاته وملفاته نهائياً. متأكد؟'),
        h('div', { class: 'flex gap-2' }, [
          h('button', { class: 'flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm', onclick: function () { st.delConf = null; V.render(); } }, 'إلغاء'),
          h('button', {
            class: 'flex-1 py-2 rounded-lg bg-rose-500 text-white text-sm',
            onclick: function () { var id = st.delConf; st.delConf = null; V.delEntity(id).then(function () { toast('تم الحذف ✓'); V.render(); }); }
          }, 'تأكيد')
        ])
      ])] : []))
    ]);
  }
  function addBranchModal(cfgC) {
    var form = { name: '', type: (cfgC.types[0] && cfgC.types[0].key) || 'other' };
    var grid = h('div', { class: 'grid grid-cols-2 gap-2' });
    function draw() {
      mount(grid, cfgC.types.map(function (t) {
        return h('button', {
          class: 'p-3 rounded-xl border flex items-center gap-2 text-sm ' + (form.type === t.key ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'),
          onclick: function () { form.type = t.key; draw(); }
        }, [ic(cfgC.E[t.key].icon, 15), t.label]);
      }));
    }
    draw();
    var close = openModal('إضافة فرع', [
      h('div', { class: 'mb-4' }, [h('label', { class: 'block text-sm text-slate-700 mb-1.5' }, 'اسم الفرع'), textInput('', function (v) { form.name = v; })]),
      h('div', { class: 'mb-6' }, [h('label', { class: 'block text-sm text-slate-700 mb-2' }, 'النوع'), grid]),
      h('div', { class: 'flex gap-3' }, [
        h('button', { class: 'flex-1 py-3 rounded-xl bg-slate-100 text-slate-700', onclick: function () { close(); } }, 'إلغاء'),
        h('button', {
          class: 'flex-1 py-3 rounded-xl bg-sky-500 text-white font-semibold',
          onclick: function () {
            if (!form.name.trim()) return;
            V.pE(S.ents.concat([{ id: uid(), name: form.name.trim(), type: form.type, categories: M.makeCats() }]))
              .then(function () { close(); toast('تمت الإضافة ✓'); V.render(); });
          }
        }, 'إضافة')
      ])
    ]);
  }

  /* Variables */
  function VarsPanel(backFn) {
    var st = sub('vars', {
      tab: 'priorities', picker: null,
      pri: S.cfg.priorities.map(function (x) { return Object.assign({}, x); }),
      sts: S.cfg.statuses.map(function (x) { return Object.assign({}, x); }),
      typ: S.cfg.types.map(function (x) { return Object.assign({}, x); }),
      dc: (S.cfg.defaultCats || M.DEF_CATS).slice()
    });
    var newKey = function (p) { return p + '_' + uid().slice(0, 5); };
    function ColorGrid(val, onPick) {
      return h('div', { class: 'flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl mt-2' }, COLORS.map(function (c) {
        return h('button', {
          class: 'rounded-lg ' + DOT[c] + (val === c ? ' ring-2 ring-slate-800' : ''),
          style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': c,
          onclick: function () { onPick(c); }
        });
      }));
    }
    function arrows(arr, i, onChange) {
      return h('div', { class: 'flex flex-col' }, [
        h('button', { class: 'text-slate-400 text-xs', disabled: i === 0, onclick: function () { var b = arr.slice(); var t = b[i - 1]; b[i - 1] = b[i]; b[i] = t; onChange(b); } }, '▲'),
        h('button', { class: 'text-slate-400 text-xs', disabled: i === arr.length - 1, onclick: function () { var b = arr.slice(); var t = b[i + 1]; b[i + 1] = b[i]; b[i] = t; onChange(b); } }, '▼')
      ]);
    }
    var tabs = [{ k: 'priorities', l: 'الأولويات' }, { k: 'statuses', l: 'الحالات' }, { k: 'types', l: 'الأنواع' }, { k: 'cats', l: 'التصنيفات' }];
    var body = h('div', {});
    function draw() {
      var kids = [];
      if (st.tab === 'priorities') {
        kids = st.pri.map(function (p, i) {
          return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3' }, [
            h('div', { class: 'flex items-center gap-2' }, [
              h('button', { class: 'rounded-lg flex-shrink-0 ' + DOT[p.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 'p' + i ? null : 'p' + i; draw(); } }),
              textInput(p.label, function (v) { st.pri[i].label = v; }, { class: 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300' }),
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
                h('button', { class: 'rounded-lg flex-shrink-0 ' + DOT[s.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 's' + i ? null : 's' + i; draw(); } }),
                textInput(s.label, function (v) { st.sts[i].label = v; }, { class: 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300' }),
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
              h('button', { class: 'rounded-lg flex-shrink-0 ' + DOT[t.color], style: { width: '1.75rem', height: '1.75rem' }, 'aria-label': 'لون', onclick: function () { st.picker = st.picker === 't' + i ? null : 't' + i; draw(); } }),
              textInput(t.label, function (v) { st.typ[i].label = v; }, { class: 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300' }),
              h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { st.typ.splice(i, 1); draw(); } }, [ic('trash', 15)])
            ]),
            st.picker === 't' + i ? ColorGrid(t.color, function (c) { st.typ[i].color = c; st.picker = null; draw(); }) : null,
            h('div', { class: 'flex flex-wrap gap-1.5' }, M.ICON_KEYS.map(function (ik) {
              return h('button', {
                class: 'w-9 h-9 rounded-lg flex items-center justify-center border ' + (t.icon === ik ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-500 border-slate-200'),
                'aria-label': ik,
                onclick: function () { st.typ[i].icon = ik; draw(); }
              }, [ic(M.TYPE_ICON[ik], 16)]);
            }))
          ]);
        }).concat([h('button', {
          class: 'w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 flex items-center justify-center gap-1',
          onclick: function () { st.typ.push({ key: newKey('ty'), label: 'نوع جديد', color: 'teal', icon: 'box' }); draw(); }
        }, [ic('plus', 15), 'إضافة نوع'])]);
      } else {
        var dcIn = h('input', { class: INP, placeholder: 'تصنيف جديد…' });
        var addDc = function () { var v = dcIn.value.trim(); if (!v) return; st.dc.push(v); dcIn.value = ''; draw(); };
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
        h('div', { class: 'flex gap-2 overflow-x-auto ns' }, tabs.map(function (t) {
          return h('button', {
            class: 'flex-shrink-0 text-sm px-3 py-1.5 rounded-xl border ' + (st.tab === t.k ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200'),
            onclick: function () { st.tab = t.k; st.picker = null; draw(); }
          }, t.l);
        })),
        body,
        h('button', {
          class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold text-sm',
          onclick: function () {
            if (!st.pri.length) { toast('يجب وجود أولوية واحدة على الأقل'); return; }
            if (!st.sts.some(function (s) { return !s.done && !s.parked; })) { toast('يجب وجود حالة مفتوحة واحدة على الأقل'); return; }
            if (!st.sts.some(function (s) { return s.done; })) { toast('يجب تحديد حالة واحدة كـ«منجزة»'); return; }
            if (!st.typ.length) { toast('يجب وجود نوع واحد على الأقل'); return; }
            V.pCfg(Object.assign({}, S.cfg, { priorities: st.pri, statuses: st.sts, types: st.typ, defaultCats: st.dc }))
              .then(function () { toast('تم حفظ المتغيّرات ✓'); V.render(); });
          }
        }, 'حفظ المتغيّرات'),
        h('p', { class: 'text-xs text-slate-400 text-center' }, 'تنبيه: حذف حالة أو أولوية مستخدمة قد يجعل بعض الملاحظات بلا تسمية — عدّلها من شاشة الملاحظة.')
      ])
    ]);
  }

  /* Team */
  function TeamPanel(backFn) {
    var inp = h('input', { class: 'flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', placeholder: 'اسم العضو الجديد…' });
    var add = function () {
      var n = inp.value.trim();
      if (!n || S.team.indexOf(n) !== -1) return;
      V.pT(S.team.concat([n])).then(function () { inp.value = ''; toast('تم الإضافة ✓'); V.render(); });
    };
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
              onclick: function () { V.pT(S.team.filter(function (x) { return x !== m; })).then(V.render); }
            }, [ic('x', 15)])
          ]);
        }))
      ])
    ]);
  }

  /* Notifications */
  function NotifPanel(backFn) {
    var st = sub('notif', { loc: JSON.parse(JSON.stringify(S.notif)), testing: false });
    var loc = st.loc;
    var body = h('div', { class: 'p-4 space-y-4' });
    var newR = h('input', { class: 'flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300', dir: 'ltr', placeholder: 'email@example.com' });
    var addR = function () {
      var v = newR.value.trim();
      if (!v) return;
      loc.recipients = loc.recipients.concat([v]);
      newR.value = '';
      draw();
    };
    newR.addEventListener('keydown', function (e) { if (e.key === 'Enter') addR(); });

    function draw() {
      mount(body, [
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center justify-between' }, [
            h('div', {}, [
              h('div', { class: 'font-semibold text-slate-800 text-sm' }, 'تفعيل الإشعارات'),
              h('div', { class: 'text-xs text-slate-400 mt-0.5' }, 'المفتاح الرئيسي')
            ]),
            Toggle(loc.enabled, function (v) { loc.enabled = v; draw(); })
          ])
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'flex items-center justify-between' }, [
            h('div', {}, [
              h('div', { class: 'font-semibold text-slate-800 text-sm' }, 'تنبيه صوتي داخل التطبيق'),
              h('div', { class: 'text-xs text-slate-400 mt-0.5' }, 'رنّة قصيرة عند وصول إشعار — تُشغَّل بعد أول ضغطة على الشاشة')
            ]),
            Toggle(loc.sound !== false, function (v) {
              loc.sound = v;
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
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'المستلمون')
        ].concat(loc.recipients.map(function (r, i) {
          return h('div', { class: 'flex items-center gap-2 mb-2' }, [
            h('div', { class: 'flex-1 text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2', dir: 'ltr' }, r),
            h('button', { class: 'text-slate-300', 'aria-label': 'حذف', onclick: function () { loc.recipients = loc.recipients.filter(function (_, j) { return j !== i; }); draw(); } }, [ic('x', 15)])
          ]);
        })).concat([
          h('div', { class: 'flex gap-2 mt-2' }, [newR, h('button', { class: 'bg-sky-500 text-white rounded-xl px-3', 'aria-label': 'إضافة', onclick: addR }, [ic('plus', 16)])])
        ])),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4' }, [
          h('div', { class: 'text-sm font-semibold text-slate-700 mb-3' }, 'أنواع الإشعارات'),
          h('div', { class: 'space-y-3' }, Object.keys(M.NOTIF_LABELS).map(function (k) {
            return h('div', { class: 'flex items-center justify-between gap-3' }, [
              h('span', { class: 'text-sm text-slate-600 flex-1' }, M.NOTIF_LABELS[k]),
              Toggle(!!loc.types[k], function (v) { loc.types[k] = v; draw(); })
            ]);
          }))
        ]),
        h('button', {
          class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold text-sm',
          onclick: function () { V.pN(JSON.parse(JSON.stringify(loc))).then(function () { toast('تم حفظ الإعدادات ✓'); }); }
        }, 'حفظ الإعدادات'),
        h('button', {
          class: 'w-full border rounded-xl py-3 font-semibold text-sm ' + (S.ejs.serviceId ? 'border-sky-300 text-sky-700 bg-white' : 'border-slate-200 text-slate-400 bg-slate-50'),
          onclick: function () {
            if (st.testing) return;
            st.testing = true;
            var cfgC = C();
            V.pN(JSON.parse(JSON.stringify(loc))).then(function () {
              var ti = {
                id: 't', entityId: null, title: 'اختبار الإشعارات من متابِع',
                status: cfgC.statuses[0] && cfgC.statuses[0].key,
                priority: cfgC.priorities[0] && cfgC.priorities[0].key,
                assignee: 'النظام', dueDate: Date.now() + 86400000
              };
              M.pushAlert('taskAdded', ti, null);
              if (loc.sound !== false) M.Ring.unlock().then(function () { M.Ring.play(false); });
              return M.sendEmailNotif(loc, S.ejs, cfgC, 'taskAdded', ti, [], S.auth.name, true);
            }).then(function (res) {
              st.testing = false;
              if (res.ok) toast('تم الإرسال بنجاح ✓');
              else if (res.reason === 'unconfigured') toast('أكمل إعداد البريد أولاً');
              else if (res.reason === 'no_recipients') toast('أضف بريد مستلم');
              else if (res.reason === 'network') toast('الإرسال محجوب هنا — الرسالة في سجل الرسائل');
              else toast('فشل الإرسال (' + (res.status || res.reason) + ')');
              V.render();
            });
          }
        }, st.testing ? 'جارٍ الإرسال…' : '📧 إرسال بريد تجريبي'),
        !S.ejs.serviceId ? h('p', { class: 'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center' }, 'أكمل «إعداد البريد» أولاً لتفعيل الإرسال') : null
      ]);
    }
    draw();
    return h('div', {}, [TopBar({ title: 'الإشعارات', onBack: backFn }), body]);
  }

  /* EmailJS */
  function EmailJSPanel(backFn) {
    var st = sub('ejs', { ejs: Object.assign({}, S.ejs) });
    var fields = [{ k: 'serviceId', l: 'Service ID', ph: 'service_xxxxxxx' }, { k: 'templateId', l: 'Template ID', ph: 'template_xxxxxxx' }, { k: 'publicKey', l: 'Public Key', ph: 'xxxxxxxxxxxxxxxx' }];
    var ready = h('div', { class: 'bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 text-center' }, '✅ البيانات مكتملة — احفظ ثم جرّب الإرسال من «الإشعارات»');
    function refreshReady() {
      ready.style.display = (st.ejs.serviceId && st.ejs.templateId && st.ejs.publicKey) ? '' : 'none';
    }
    var origin = '';
    try { origin = window.location.origin; } catch (e) { origin = ''; }

    var box = h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-4 space-y-4' }, fields.map(function (fl) {
      return h('div', {}, [
        h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, fl.l),
        textInput(st.ejs[fl.k], function (v) { st.ejs[fl.k] = v; refreshReady(); }, { dir: 'ltr', placeholder: fl.ph })
      ]);
    }));
    refreshReady();

    return h('div', {}, [
      TopBar({ title: 'إعداد البريد', onBack: backFn }),
      h('div', { class: 'p-4 space-y-4' }, [
        h('div', { class: 'bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800' },
          'الإرسال الفعلي يتم عبر EmailJS (مجاني). داخل الصفحة المنشورة على claude.ai يمنع الأمان أي اتصال خارجي، فتُحفظ الرسالة في «سجل الرسائل» لنسخها. إذا نشرت الملف على نطاقك الخاص فسيتم الإرسال تلقائياً.'),
        h('div', { class: 'bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-800 space-y-1' }, [
          h('div', { class: 'font-bold mb-2' }, 'خطوات الإعداد'),
          h('div', {}, '١. أنشئ حساباً على emailjs.com'),
          h('div', {}, '٢. Email Services → أضف خدمة Gmail'),
          h('div', {}, '٣. Email Templates → أنشئ قالباً بهذا المحتوى:'),
          h('div', { class: 'font-mono text-xs bg-sky-100 rounded p-2', dir: 'ltr', style: { lineHeight: '2' } }, [
            'To: {{to_email}}', h('br', {}), 'Subject: {{subject}}', h('br', {}), 'Content: {{{message_html}}}'
          ]),
          h('div', {}, '٤. Account → انسخ Public Key'),
          h('div', {}, '٥. Account → Security: أضف رابط التطبيق أدناه')
        ]),
        h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3' }, [
          h('div', { class: 'text-xs text-slate-400 mb-1' }, 'رابط هذا التطبيق:'),
          h('div', { class: 'text-xs text-slate-700 bg-slate-50 rounded-lg px-2 py-1.5', dir: 'ltr', style: { wordBreak: 'break-all' } }, origin)
        ]),
        box,
        ready,
        h('button', {
          class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold text-sm',
          onclick: function () { V.pEjs(Object.assign({}, st.ejs)).then(function () { toast('تم حفظ بيانات البريد ✓'); V.render(); }); }
        }, 'حفظ بيانات البريد')
      ])
    ]);
  }

  /* Outbox — every message the system prepared or sent */
  function OutboxPanel(backFn) {
    var box = M.getOutbox();
    var LABEL = { sent: 'أُرسلت', blocked: 'محجوبة — انسخها', unconfigured: 'البريد غير مُعد', no_recipients: 'بلا مستلم', failed: 'فشلت', pending: 'قيد الإرسال' };
    var CLS = { sent: 'text-emerald-600', blocked: 'text-amber-600', failed: 'text-rose-600', unconfigured: 'text-slate-400', no_recipients: 'text-slate-400', pending: 'text-slate-400' };
    return h('div', {}, [
      TopBar({ title: 'سجل الرسائل', onBack: backFn }),
      h('div', { class: 'p-4 space-y-2' }, [
        h('p', { class: 'text-xs text-slate-400' }, 'كل رسالة جهّزها النظام. اضغط الرسالة لعرض نصها ونسخه.')
      ].concat(box.length ? box.map(function (m) {
        var open = false;
        var bodyBox = h('div', { class: 'mt-2' });
        bodyBox.style.display = 'none';
        bodyBox.appendChild(h('pre', {
          class: 'text-xs text-slate-600 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap',
          style: { maxHeight: '220px', overflowY: 'auto', fontFamily: 'inherit' }
        }, m.body || '—'));
        bodyBox.appendChild(h('div', { class: 'flex gap-2 mt-2' }, [
          h('button', {
            class: 'flex-1 border border-slate-200 rounded-xl py-2 text-xs text-slate-600 flex items-center justify-center gap-1',
            onclick: function () { copyText(m.subject + '\n\n' + m.body); }
          }, [ic('copy', 13), 'نسخ']),
          h('button', {
            class: 'flex-1 border border-slate-200 rounded-xl py-2 text-xs text-slate-600 flex items-center justify-center gap-1',
            onclick: function () { M.saveOut('mutabea-' + m.id + '.txt', m.subject + '\n\n' + m.body, 'text/plain'); }
          }, [ic('download', 13), 'حفظ'])
        ]));
        return h('div', { class: 'bg-white rounded-2xl border border-slate-200 p-3' }, [
          h('button', {
            class: 'w-full text-right flex items-center gap-2',
            onclick: function () { open = !open; bodyBox.style.display = open ? '' : 'none'; }
          }, [
            h('div', { class: 'flex-1 min-w-0' }, [
              h('div', { class: 'text-sm font-medium text-slate-700 truncate' }, m.subject),
              h('div', { class: 'text-xs text-slate-400 truncate', dir: 'ltr' }, m.to || '—')
            ]),
            h('span', { class: 'text-xs flex-shrink-0 ' + (CLS[m.state] || 'text-slate-400') }, LABEL[m.state] || m.state)
          ]),
          bodyBox
        ]);
      }) : [h('div', { class: 'text-center text-slate-300 py-12 text-sm' }, 'لا توجد رسائل بعد')]))
    ]);
  }
  function copyText(text) {
    var done = function (ok) { toast(ok ? 'تم النسخ ✓' : 'حدّد النص وانسخه يدوياً'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      return;
    }
    fallback();
    function fallback() {
      try {
        var a = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
        a.value = text;
        document.body.appendChild(a);
        a.select();
        var ok = document.execCommand('copy');
        a.remove();
        done(ok);
      } catch (e) { done(false); }
    }
  }

  /* ── router ───────────────────────────────────── */
  function render() {
    /* Overlays live outside #root so they can cover the shell; a navigation —
       or a sign-out — has to take them with it. */
    var stale = document.querySelectorAll('.mut-overlay');
    for (var i = 0; i < stale.length; i++) stale[i].remove();
    if (!S.ready) {
      V.mount(document.getElementById('root'), h('div', { class: 'min-h-screen bg-gradient-to-b from-sky-500 to-blue-700 flex items-center justify-center', dir: 'rtl' }, [
        h('div', { class: 'text-center text-white' }, [
          h('div', { class: 'text-5xl font-extrabold mb-2' }, 'متابِع'),
          h('div', { class: 'text-sky-200' }, 'جارٍ التحميل…')
        ])
      ]));
      return;
    }
    var rootEl = document.getElementById('root');
    if (!S.auth) { V.mount(rootEl, V.LoginPage()); return; }

    var view = cur().view;
    var page = null;
    if (view === 'home') page = V.HomePage();
    else if (view === 'tasks') page = V.TasksPage();
    else if (view === 'entities') page = V.EntitiesPage();
    else if (view === 'entity') page = V.EntityPage();
    else if (view === 'issue') page = IssuePage();
    else if (view === 'addIssue' || view === 'editIssue') page = IssueForm();
    else if (view === 'library') page = LibraryPage();
    else if (view === 'reports') page = ReportsPage();
    else if (view === 'alerts') page = AlertsPage();
    else if (view === 'more') page = MorePage();
    else if (view === 'settings') page = SettingsPage();

    var perms = P();
    var shell = h('div', { class: 'w-full max-w-md bg-slate-50 min-h-screen relative pb-20 shadow-2xl overflow-hidden', id: 'shell' }, [
      h('div', { id: 'toastHost' }),
      page,
      (perms.create && ['home', 'tasks', 'entities', 'library', 'more'].indexOf(view) !== -1) ? h('button', {
        class: 'fixed bottom-20 z-30 w-14 h-14 rounded-full bg-sky-500 text-white shadow-lg flex items-center justify-center active:bg-sky-600',
        style: { right: '16px' }, 'aria-label': 'ملاحظة جديدة',
        onclick: function () { go('addIssue', perms.scope === 'own' ? { entityId: S.auth.entityId } : {}); }
      }, [ic('plus', 26)]) : null,
      V.BottomNav()
    ]);
    V.mount(rootEl, h('div', { class: 'min-h-screen bg-slate-200 flex justify-center', dir: 'rtl' }, [shell]));
  }
  V.render = render;

  /* ── boot ─────────────────────────────────────── */
  render();
  Promise.all([sg('cfg'), sg('accounts'), sg('entities'), sg('issues'), sg('team'), sg('notif'), sg('emailjs'), sg('outbox'), sg('alerts'), sg('session')])
    .then(function (r) {
      var cfg = r[0], acc = r[1], ents = r[2], issues = r[3], team = r[4], notif = r[5], ejs = r[6], outbox = r[7], alerts = r[8], sess = r[9];
      if (cfg) { S.cfg = Object.assign({}, M.DEF_CFG, cfg); M.setCfgCats(S.cfg.defaultCats || M.DEF_CATS); }
      if (acc && acc.length) S.accounts = acc;
      if (ents && ents.length) { S.ents = ents; S.issues = issues || []; }
      else {
        var se = M.SEED_DEFS.map(function (d) { return Object.assign({}, d, { categories: M.makeCats() }); });
        var si = M.seedIssues(se);
        S.ents = se; S.issues = si;
        ss('entities', se); ss('issues', si);
      }
      S.team = team || M.DEF_TEAM.slice();
      S.notif = Object.assign({}, M.DEF_NOTIF, notif || {});
      S.notif.types = Object.assign({}, M.DEF_NOTIF.types, (notif && notif.types) || {});
      S.ejs = Object.assign({}, M.DEF_EJS, ejs || {});
      M.setOutbox(outbox || []);
      M.setAlerts(alerts || []);
      if (sess) {
        var a = S.accounts.find(function (x) { return x.username === sess; });
        if (a) S.auth = a;
      }
    })
    .then(null, function () {
      var se = M.SEED_DEFS.map(function (d) { return Object.assign({}, d, { categories: M.makeCats() }); });
      S.ents = se; S.issues = M.seedIssues(se); S.team = M.DEF_TEAM.slice();
    })
    .then(function () { S.ready = true; render(); });
}());
