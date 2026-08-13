/* ===========================================================================
   متابِع — Mutabea
   Task and observation follow-up across multiple branches.
   Exceed Advisors — د. هاني الحداد

   This is the delivered React/Tailwind component rebuilt as one self-contained
   page: same data model, same permission engine, same workflow, same screens.
   Three things had to be re-implemented rather than imported, because a
   published page cannot fetch anything from another host:
     · Tailwind  → the exact utility subset the component used (generated)
     · lucide    → the same icons, inline
     · recharts  → the same charts, drawn as SVG
   Storage moved from window.storage to localStorage, keeping the async shape.
   =========================================================================== */
(function () {
  'use strict';

  /* The document is Arabic and right-to-left. The host owns <html>, so the
     direction is stamped here rather than in markup — before first paint, so
     nothing renders left-to-right and then jumps. */
  try {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
    if (document.body) document.body.setAttribute('dir', 'rtl');
  } catch (e) { /* nothing to stamp */ }

  /* ── helpers ──────────────────────────────────── */
  var NS = 'mutabea_v3';
  var ARD = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var toAr = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[0-9]/g, function (d) { return ARD[+d]; }); };
  var uid = function () { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); };

  var memoryStore = {};
  var storageBroken = false;
  var sg = function (k) {
    return new Promise(function (res) {
      try {
        if (storageBroken) { res(memoryStore[k] !== undefined ? memoryStore[k] : null); return; }
        var raw = localStorage.getItem(NS + ':' + k);
        res(raw ? JSON.parse(raw) : null);
      } catch (e) { res(memoryStore[k] !== undefined ? memoryStore[k] : null); }
    });
  };
  var ss = function (k, v) {
    return new Promise(function (res) {
      memoryStore[k] = v;
      try {
        if (!storageBroken) localStorage.setItem(NS + ':' + k, JSON.stringify(v));
      } catch (e) {
        /* A quota failure must not lose the action in progress; the session
           keeps working from memory and the person is told once. */
        storageBroken = true;
        if (window.__mutabeaToast) window.__mutabeaToast('تعذّر الحفظ — المساحة ممتلئة');
      }
      res();
    });
  };
  var sd = function (k) {
    return new Promise(function (res) {
      delete memoryStore[k];
      try { localStorage.removeItem(NS + ':' + k); } catch (e) { /* nothing to remove */ }
      res();
    });
  };
  var listKeys = function () {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS + ':') === 0) out.push(k);
      }
    } catch (e) { /* storage unavailable */ }
    return out;
  };

  var fmtDate = function (ts) {
    try {
      return new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return new Date(ts).toISOString().slice(0, 10); }
  };

  /* Photographs are stored inline, so they are resized and re-encoded before
     they ever reach the store. The timeout keeps a stubborn file from hanging
     the upload — the original data is used instead. */
  var compress = function (file, maxDim, q) {
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
  };
  var readDataURL = function (file) {
    return new Promise(function (r) {
      var rd = new FileReader();
      rd.onload = function (e) { r(e.target.result); };
      rd.onerror = function () { r(null); };
      rd.readAsDataURL(file);
    });
  };

  /* ── palette ──────────────────────────────────── */
  var COLORS = ['rose', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'slate', 'zinc'];
  var CHIP = {}, TINT = {}, DOT = {};
  COLORS.forEach(function (c) {
    var text = (c === 'slate' || c === 'zinc') ? '600' : '700';
    var bg = c === 'zinc' ? '100' : '50';
    CHIP[c] = 'bg-' + c + '-' + bg + ' text-' + c + '-' + text + ' border-' + c + '-200';
    TINT[c] = 'bg-' + c + '-' + (c === 'slate' || c === 'zinc' ? '100' : '50') + ' text-' + c + '-600';
    DOT[c] = 'bg-' + c + '-' + (c === 'yellow' ? '400' : (c === 'slate' || c === 'zinc' ? '400' : '500'));
  });
  var HEX = {
    rose: '#f43f5e', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#84cc16', green: '#22c55e',
    emerald: '#10b981', teal: '#14b8a6', sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
    purple: '#a855f7', pink: '#ec4899', slate: '#94a3b8', zinc: '#a1a1aa'
  };
  var pal = function (c) {
    return { dot: DOT[c] || DOT.slate, bar: DOT[c] || DOT.slate, chip: CHIP[c] || CHIP.slate, tint: TINT[c] || TINT.slate };
  };
  var ICON_KEYS = ['baby', 'food', 'office', 'box', 'store', 'edu', 'health', 'tool'];
  var TYPE_ICON = { baby: 'baby', food: 'food', office: 'building', box: 'boxes', store: 'shopping', edu: 'grad', health: 'heart', tool: 'wrench' };

  /* ── defaults ─────────────────────────────────── */
  var DEF_CATS = ['شغل داخلي', 'شغل خارجي', 'مشتريات', 'الأوراق والمستندات', 'شغل مع الحكومة', 'شغل مع الوزارة', 'أخرى'];
  var DEF_TEAM = ['أبو محمد', 'إدارة الفرع', 'فريق الصيانة', 'المنسّق التربوي', 'المشتريات', 'السباك', 'السكرتارية'];
  var CFG_CATS = DEF_CATS.slice();
  var makeCats = function () { return CFG_CATS.map(function (n) { return { id: uid(), name: n }; }); };

  var DEF_PRIORITIES = [
    { key: 'urgent', label: 'عاجلة', color: 'rose' }, { key: 'high', label: 'عالية', color: 'orange' },
    { key: 'medium', label: 'متوسطة', color: 'yellow' }, { key: 'low', label: 'منخفضة', color: 'slate' }
  ];
  var DEF_STATUSES = [
    { key: 'open', label: 'مفتوحة', color: 'slate', gate: false, done: false, parked: false },
    { key: 'in_progress', label: 'قيد التنفيذ', color: 'blue', gate: false, done: false, parked: false },
    { key: 'pending', label: 'بانتظار الاعتماد', color: 'amber', gate: true, done: false, parked: false },
    { key: 'closed', label: 'مغلقة', color: 'emerald', gate: false, done: true, parked: false },
    { key: 'on_hold', label: 'معلّقة', color: 'zinc', gate: false, done: false, parked: true }
  ];
  var DEF_TYPES = [
    { key: 'nursery', label: 'حضانة', color: 'rose', icon: 'baby' }, { key: 'restaurant', label: 'مطعم', color: 'amber', icon: 'food' },
    { key: 'office', label: 'مكتب', color: 'sky', icon: 'office' }, { key: 'other', label: 'أخرى', color: 'violet', icon: 'box' }
  ];
  var DEF_CFG = { priorities: DEF_PRIORITIES, statuses: DEF_STATUSES, types: DEF_TYPES, defaultCats: DEF_CATS.slice() };

  /* ── permissions ──────────────────────────────── */
  var P_MGR = { scope: 'all', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 1, edit: 1, changeStatus: 1, approve: 1, del: 1, comment: 1, photos: 1, uploadDocs: 1, deleteDocs: 1, manageEntities: 1, manageTeam: 1, manageUsers: 1, settings: 1, export: 1 };
  var P_BR = { scope: 'own', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 1, edit: 0, changeStatus: 1, approve: 0, del: 0, comment: 1, photos: 1, uploadDocs: 1, deleteDocs: 0, manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 1 };
  var P_VIEW = { scope: 'own', tabs: { home: 1, tasks: 1, entities: 1, library: 1 }, create: 0, edit: 0, changeStatus: 0, approve: 0, del: 0, comment: 0, photos: 0, uploadDocs: 0, deleteDocs: 0, manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 0 };
  var resolvePerms = function (acc) {
    if (!acc) return P_VIEW;
    var base = acc.role === 'manager' ? P_MGR : P_BR;
    if (!acc.perms) return base;
    var out = {}; var k;
    for (k in base) out[k] = base[k];
    for (k in acc.perms) out[k] = acc.perms[k];
    out.tabs = {};
    for (k in base.tabs) out.tabs[k] = base.tabs[k];
    if (acc.perms.tabs) for (k in acc.perms.tabs) out.tabs[k] = acc.perms.tabs[k];
    return out;
  };
  var PERM_GROUPS = [
    { title: 'المهام', items: [['create', 'إنشاء ملاحظات'], ['edit', 'تعديل الحقول'], ['changeStatus', 'تغيير الحالة'], ['approve', 'الاعتماد والإرجاع'], ['del', 'حذف الملاحظات'], ['comment', 'إضافة تعليقات'], ['photos', 'إضافة صور']] },
    { title: 'المكتبة', items: [['uploadDocs', 'رفع الملفات'], ['deleteDocs', 'حذف الملفات']] },
    { title: 'الإدارة', items: [['manageEntities', 'إدارة الفروع'], ['manageTeam', 'إدارة الفريق'], ['manageUsers', 'إدارة المستخدمين'], ['settings', 'الإعدادات والمتغيّرات'], ['export', 'تصدير البيانات']] }
  ];
  var TAB_LABELS = { home: 'الرئيسية', tasks: 'المهام', entities: 'الجهات', library: 'المكتبة' };

  var ACCOUNTS = [
    { username: 'manager', password: 'Manager@2026', role: 'manager', name: 'د. هاني', entityId: null, label: 'المدير' },
    { username: 'mubarak', password: 'Mubarak@2026', role: 'branch', name: 'فرع مبارك الكبير', entityId: 'br_mubarak', label: 'مبارك' },
    { username: 'qusour', password: 'Qusour@2026', role: 'branch', name: 'فرع القصور', entityId: 'br_qusour', label: 'القصور' },
    { username: 'adan', password: 'Adan@2026', role: 'branch', name: 'فرع العدان', entityId: 'br_adan', label: 'العدان' },
    { username: 'mishref', password: 'Mishref@2026', role: 'branch', name: 'فرع مشرف', entityId: 'br_mishref', label: 'مشرف' }
  ];
  var SEED_DEFS = [
    { id: 'br_mubarak', name: 'مبارك الكبير', type: 'nursery' }, { id: 'br_qusour', name: 'القصور', type: 'nursery' },
    { id: 'br_adan', name: 'العدان', type: 'nursery' }, { id: 'br_mishref', name: 'مشرف', type: 'nursery' }
  ];

  var seedIssues = function (es) {
    var now = Date.now(), D = 86400000;
    var gc = function (eid, nm) {
      var e = es.find(function (x) { return x.id === eid; });
      var c = e && e.categories.find(function (y) { return y.name === nm; });
      return (c && c.id) || (e && e.categories[0] && e.categories[0].id);
    };
    return [
      { id: uid(), entityId: 'br_mubarak', categoryId: gc('br_mubarak', 'شغل داخلي'), title: 'تصليح مكيّف الصف الثاني', description: 'المكيف لا يعمل، الغرفة حارة', status: 'open', priority: 'high', assignee: 'فريق الصيانة', reporter: 'د. هاني', dueDate: now + 2 * D, createdAt: now - D, updatedAt: now - D, beforeCount: 0, afterCount: 0, comments: [], tags: ['مكيف', 'صيانة'], repeat: 'none', checklist: [{ id: uid(), text: 'فحص الفلاتر', done: false }, { id: uid(), text: 'فحص الفريون', done: false }], activity: [{ id: uid(), at: now - D, by: 'د. هاني', note: 'تم إنشاء الملاحظة' }] },
      { id: uid(), entityId: 'br_qusour', categoryId: gc('br_qusour', 'شغل مع الحكومة'), title: 'تجديد رخصة البلدية', description: 'انتهت الرخصة، يجب التجديد', status: 'in_progress', priority: 'urgent', assignee: 'السكرتارية', reporter: 'د. هاني', dueDate: now - D, createdAt: now - 5 * D, updatedAt: now - D, beforeCount: 0, afterCount: 0, comments: [{ id: uid(), author: 'د. هاني', mgr: true, text: 'يرجى الإسراع', at: now - 3 * D }], tags: ['رخصة'], repeat: 'none', checklist: [], activity: [{ id: uid(), at: now - 5 * D, by: 'د. هاني', note: 'تم إنشاء الملاحظة' }, { id: uid(), at: now - D, by: 'فرع القصور', note: 'بدأ التنفيذ' }] },
      { id: uid(), entityId: 'br_adan', categoryId: gc('br_adan', 'شغل خارجي'), title: 'طلاء بوابة المدخل الرئيسي', description: 'البوابة تحتاج دهاناً جديداً', status: 'pending', priority: 'medium', assignee: 'فريق الصيانة', reporter: 'فرع العدان', dueDate: now + D, createdAt: now - 7 * D, updatedAt: now, beforeCount: 0, afterCount: 0, comments: [{ id: uid(), author: 'فرع العدان', mgr: false, text: 'تم الانتهاء من الطلاء', at: now - D }], tags: ['طلاء'], repeat: 'none', checklist: [{ id: uid(), text: 'تحضير الطلاء', done: true }, { id: uid(), text: 'الطلاء النهائي', done: true }], activity: [{ id: uid(), at: now - 7 * D, by: 'فرع العدان', note: 'تم إنشاء الملاحظة' }, { id: uid(), at: now - D, by: 'فرع العدان', note: 'تم الإصلاح' }] },
      { id: uid(), entityId: 'br_mishref', categoryId: gc('br_mishref', 'شغل مع الوزارة'), title: 'تسليم تقرير الوزارة الشهري', description: 'إعداد التقرير الشهري', status: 'open', priority: 'high', assignee: 'إدارة الفرع', reporter: 'د. هاني', dueDate: now + 5 * D, createdAt: now - 2 * D, updatedAt: now - 2 * D, beforeCount: 0, afterCount: 0, comments: [], tags: ['تقرير'], repeat: 'monthly', checklist: [], activity: [{ id: uid(), at: now - 2 * D, by: 'د. هاني', note: 'تم إنشاء الملاحظة' }] },
      { id: uid(), entityId: 'br_mubarak', categoryId: gc('br_mubarak', 'شغل خارجي'), title: 'شراء وتركيب ألعاب الساحة', description: 'تركيب ألعاب جديدة', status: 'closed', priority: 'low', assignee: 'المشتريات', reporter: 'د. هاني', dueDate: now - 2 * D, createdAt: now - 14 * D, updatedAt: now - 2 * D, beforeCount: 0, afterCount: 0, comments: [], tags: ['ألعاب'], repeat: 'none', checklist: [{ id: uid(), text: 'الشراء', done: true }, { id: uid(), text: 'التركيب', done: true }], activity: [{ id: uid(), at: now - 14 * D, by: 'د. هاني', note: 'تم إنشاء الملاحظة' }, { id: uid(), at: now - 2 * D, by: 'د. هاني', note: 'تم الاعتماد والإغلاق' }] },
      { id: uid(), entityId: 'br_qusour', categoryId: gc('br_qusour', 'شغل داخلي'), title: 'تصليح تسريب مياه الحمام', description: 'تسريب في الأنابيب', status: 'in_progress', priority: 'high', assignee: 'السباك', reporter: 'فرع القصور', dueDate: now + D, createdAt: now - 3 * D, updatedAt: now - D, beforeCount: 0, afterCount: 0, comments: [], tags: ['سباكة'], repeat: 'none', checklist: [{ id: uid(), text: 'تحديد المصدر', done: true }, { id: uid(), text: 'الإصلاح', done: false }], activity: [{ id: uid(), at: now - 3 * D, by: 'فرع القصور', note: 'تم إنشاء الملاحظة' }] },
      { id: uid(), entityId: 'br_adan', categoryId: gc('br_adan', 'الأوراق والمستندات'), title: 'تحديث ملفات بيانات الأطفال', description: 'مراجعة ملفات التسجيل', status: 'open', priority: 'medium', assignee: 'السكرتارية', reporter: 'د. هاني', dueDate: now + 7 * D, createdAt: now - D, updatedAt: now - D, beforeCount: 0, afterCount: 0, comments: [], tags: ['ملفات'], repeat: 'none', checklist: [], activity: [{ id: uid(), at: now - D, by: 'د. هاني', note: 'تم إنشاء الملاحظة' }] }
    ];
  };

  /* ── config bundle ────────────────────────────── */
  var buildC = function (cfg) {
    var S = {}, P = {}, E = {};
    (cfg.statuses || DEF_STATUSES).forEach(function (s) { S[s.key] = Object.assign({}, s, pal(s.color)); });
    (cfg.priorities || DEF_PRIORITIES).forEach(function (p) { P[p.key] = Object.assign({}, p, pal(p.color)); });
    (cfg.types || DEF_TYPES).forEach(function (t) {
      E[t.key] = Object.assign({}, t, pal(t.color), { icon: TYPE_ICON[t.icon] || 'boxes' });
    });
    return { S: S, P: P, E: E, statuses: cfg.statuses || DEF_STATUSES, priorities: cfg.priorities || DEF_PRIORITIES, types: cfg.types || DEF_TYPES };
  };
  var isDone = function (C, s) { return !!(C.S[s] && C.S[s].done); };
  var isParked = function (C, s) { return !!(C.S[s] && C.S[s].parked); };
  var isActive = function (C, i) { return !isDone(C, i.status) && !isParked(C, i.status); };
  var daysUntil = function (d) {
    var n = new Date(); n.setHours(0, 0, 0, 0);
    var dd = new Date(d); dd.setHours(0, 0, 0, 0);
    return Math.round((dd - n) / 86400000);
  };
  var plD = function (n) {
    var a = Math.abs(n);
    if (a === 1) return 'يوم واحد';
    if (a === 2) return 'يومين';
    if (a >= 3 && a <= 10) return toAr(a) + ' أيام';
    return toAr(a) + ' يوماً';
  };
  var dueLabel = function (C, i) {
    if (isDone(C, i.status)) return { text: 'تم الإنجاز', cls: 'text-emerald-600' };
    if (!i.dueDate) return { text: 'بدون تاريخ', cls: 'text-slate-400' };
    var d = daysUntil(i.dueDate);
    if (d < 0) return { text: 'متأخرة ' + plD(d), cls: 'text-rose-600' };
    if (d === 0) return { text: 'تستحق اليوم', cls: 'text-amber-600' };
    if (d === 1) return { text: 'تستحق غداً', cls: 'text-amber-600' };
    return { text: 'خلال ' + plD(d), cls: 'text-slate-400' };
  };
  var isOD = function (C, i) { return isActive(C, i) && i.dueDate && daysUntil(i.dueDate) < 0; };

  var exportCSV = function (C, issues, ents) {
    var B = '﻿', h = ['ID', 'العنوان', 'الجهة', 'الحالة', 'الأولوية', 'المسؤول', 'الاستحقاق'];
    var rows = issues.map(function (i) {
      var e = ents.find(function (x) { return x.id === i.entityId; });
      return [i.id, i.title, (e && e.name) || '', (C.S[i.status] && C.S[i.status].label) || '',
        (C.P[i.priority] && C.P[i.priority].label) || '', i.assignee || '',
        i.dueDate ? new Date(i.dueDate).toLocaleDateString('ar-KW') : ''];
    });
    var csv = B + [h].concat(rows).map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    saveOut('mutabea.csv', csv, 'text/csv;charset=utf-8');
  };

  /* A published page cannot start its own download, so the host is asked when
     it can and the browser is used directly when the page is self-hosted. */
  var saveOut = function (filename, data, mime) {
    var dl = window.claude && window.claude.downloads;
    if (dl && typeof dl.save === 'function') {
      dl.save({ filename: filename, data: data }).then(function () {
        if (window.__mutabeaToast) window.__mutabeaToast('تم حفظ الملف ✓');
      }, function (err) {
        var code = err && err.code;
        if (window.__mutabeaToast) window.__mutabeaToast(code === 'declined' ? 'أُلغي الحفظ' : 'تعذّر الحفظ');
      });
      return;
    }
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: mime || 'text/plain' }));
      a.download = filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {
      if (window.__mutabeaToast) window.__mutabeaToast('تعذّر الحفظ');
    }
  };

  /* ── notifications ────────────────────────────── */
  var DEF_NOTIF = {
    enabled: true, sound: true, recipients: ['hani.alhaddad@gmail.com'],
    types: { taskAdded: true, taskUpdated: true, statusChanged: true, pendingApproval: true, approvedClosed: true, newComment: true, photoAdded: false, assignment: true, dueSoon: true, overdue: true, recurringSpawned: false, libraryUpload: false }
  };
  var NOTIF_LABELS = { taskAdded: 'مهمة جديدة', taskUpdated: 'تحديث مهمة', statusChanged: 'تغيّر الحالة', pendingApproval: 'بانتظار الاعتماد', approvedClosed: 'اعتماد وإغلاق', newComment: 'تعليق جديد', photoAdded: 'صورة', assignment: 'تكليف', dueSoon: 'تستحق قريباً', overdue: 'متأخرة', recurringSpawned: 'مهمة متكررة', libraryUpload: 'ملف مكتبة' };
  var URGENT_EVENTS = { overdue: 1, pendingApproval: 1 };
  var DEF_EJS = { serviceId: '', templateId: '', publicKey: '' };

  var mailHtml = function (C, eventType, issue, ents, actor) {
    var ent = ents && ents.find(function (e) { return e.id === (issue && issue.entityId); });
    var eventLabel = NOTIF_LABELS[eventType] || eventType;
    var dueStr = issue && issue.dueDate ? fmtDate(issue.dueDate) : '—';
    var esc = function (s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:540px;margin:0 auto;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">'
      + '<div style="background:linear-gradient(to left,#0ea5e9,#2563eb);padding:18px 22px;color:#fff"><div style="font-size:20px;font-weight:800">متابِع</div><div style="font-size:12px;color:#bae6fd">نظام متابعة المهام</div></div>'
      + '<div style="padding:20px"><div style="background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:14px;margin-bottom:14px">'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:4px">' + esc(eventLabel) + '</div>'
      + '<div style="font-size:16px;font-weight:700;color:#0f172a">' + esc(issue && issue.title) + '</div></div>'
      + '<table style="width:100%;font-size:13px">'
      + '<tr><td style="padding:5px 0;color:#64748b;width:100px">الجهة</td><td style="color:#1e293b;font-weight:600">' + esc((ent && ent.name) || '—') + '</td></tr>'
      + '<tr><td style="padding:5px 0;color:#64748b">الحالة</td><td style="color:#1e293b;font-weight:600">' + esc((C && C.S[issue && issue.status] && C.S[issue.status].label) || '—') + '</td></tr>'
      + '<tr><td style="padding:5px 0;color:#64748b">المسؤول</td><td style="color:#1e293b;font-weight:600">' + esc((issue && issue.assignee) || '—') + '</td></tr>'
      + '<tr><td style="padding:5px 0;color:#64748b">الاستحقاق</td><td style="color:#1e293b;font-weight:600">' + esc(dueStr) + '</td></tr>'
      + '<tr><td style="padding:5px 0;color:#64748b">بواسطة</td><td style="color:#1e293b;font-weight:600">' + esc(actor || '—') + '</td></tr>'
      + '</table></div><div style="padding:10px 22px;background:#f1f5f9;font-size:11px;color:#94a3b8;text-align:center">متابِع — Exceed Advisors</div></div>';
  };

  var mailText = function (C, eventType, issue, ents, actor) {
    var ent = ents && ents.find(function (e) { return e.id === (issue && issue.entityId); });
    return [
      'متابِع — ' + (NOTIF_LABELS[eventType] || eventType),
      '',
      (issue && issue.title) || '',
      '',
      'الجهة: ' + ((ent && ent.name) || '—'),
      'الحالة: ' + ((C && C.S[issue && issue.status] && C.S[issue.status].label) || '—'),
      'المسؤول: ' + ((issue && issue.assignee) || '—'),
      'الاستحقاق: ' + (issue && issue.dueDate ? fmtDate(issue.dueDate) : '—'),
      'بواسطة: ' + (actor || '—'),
      '',
      'متابِع — Exceed Advisors'
    ].join('\n');
  };

  /* Delivery goes out through EmailJS exactly as the delivered build does.
     Inside a published artifact the sandbox blocks the request, so the result
     is recorded in the outbox to be copied or saved; hosted on your own domain
     the same call sends for real. Either way the attempt is logged. */
  var sendEmailNotif = function (notifCfg, ejsCfg, C, eventType, issue, ents, actor, force) {
    if (!force) {
      if (!notifCfg || !notifCfg.enabled) return Promise.resolve({ ok: false, reason: 'disabled' });
      if (!notifCfg.types || !notifCfg.types[eventType]) return Promise.resolve({ ok: false, reason: 'disabled' });
    }
    var recipients = (notifCfg && notifCfg.recipients) || [];
    var subject = '[متابِع] ' + (NOTIF_LABELS[eventType] || eventType) + ' — ' + ((issue && issue.title) || '');
    var body = mailText(C, eventType, issue, ents, actor);
    var record = {
      id: uid(), at: Date.now(), event: eventType, to: recipients.join(', '),
      subject: subject, body: body, issueId: (issue && issue.id) || null, state: 'pending'
    };

    if (!ejsCfg || !ejsCfg.serviceId || !ejsCfg.templateId || !ejsCfg.publicKey) {
      record.state = 'unconfigured';
      pushOutbox(record);
      return Promise.resolve({ ok: false, reason: 'unconfigured' });
    }
    if (!recipients.length) {
      record.state = 'no_recipients';
      pushOutbox(record);
      return Promise.resolve({ ok: false, reason: 'no_recipients' });
    }

    return fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: ejsCfg.serviceId, template_id: ejsCfg.templateId, user_id: ejsCfg.publicKey,
        template_params: {
          to_email: recipients.join(','), to_name: 'د. هاني', subject: subject,
          message_html: mailHtml(C, eventType, issue, ents, actor), from_name: 'متابِع'
        }
      })
    }).then(function (r) {
      record.state = r.ok ? 'sent' : 'failed';
      record.detail = r.ok ? '' : ('HTTP ' + r.status);
      pushOutbox(record);
      return r.ok ? { ok: true } : { ok: false, reason: 'http', status: r.status };
    }).catch(function () {
      record.state = 'blocked';
      record.detail = 'الشبكة محجوبة داخل الصفحة المنشورة';
      pushOutbox(record);
      return { ok: false, reason: 'network' };
    });
  };

  var outbox = [];
  var pushOutbox = function (record) {
    outbox.unshift(record);
    if (outbox.length > 120) outbox.length = 120;
    ss('outbox', outbox);
  };

  /* ── in-page alerts: the bell, the chime, the toast ───────────────────────
     Added on top of the delivered build at the client's request: an emailed
     notification is no use to somebody who is already looking at the screen. */
  var alerts = [];
  var pushAlert = function (eventType, issue, entName) {
    var a = {
      id: uid(), at: Date.now(), event: eventType,
      title: NOTIF_LABELS[eventType] || eventType,
      text: ((issue && issue.title) || '') + (entName ? ' · ' + entName : ''),
      issueId: (issue && issue.id) || null, read: false
    };
    alerts.unshift(a);
    if (alerts.length > 80) alerts.length = 80;
    ss('alerts', alerts);
    return a;
  };
  var unreadAlerts = function () { return alerts.filter(function (a) { return !a.read; }).length; };

  var Ring = (function () {
    var ctx = null;
    var context = function () {
      if (ctx) return ctx;
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try { ctx = new Ctor(); } catch (e) { ctx = null; }
      return ctx;
    };
    var unlock = function () {
      var c = context();
      if (!c) return Promise.resolve(false);
      if (c.state === 'suspended') {
        try { return Promise.resolve(c.resume()).then(function () { return c.state === 'running'; }, function () { return false; }); }
        catch (e) { return Promise.resolve(false); }
      }
      return Promise.resolve(c.state === 'running');
    };
    var tone = function (c, freq, start, dur, gain) {
      var osc = c.createOscillator(), amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp); amp.connect(c.destination);
      osc.start(start); osc.stop(start + dur + 0.02);
    };
    return {
      unlock: unlock,
      ready: function () { return !!ctx && ctx.state === 'running'; },
      play: function (urgent) {
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

  /* ── exported to the view layer ───────────────── */
  window.MUT = {
    NS: NS, toAr: toAr, uid: uid, sg: sg, ss: ss, sd: sd, listKeys: listKeys, fmtDate: fmtDate,
    compress: compress, readDataURL: readDataURL,
    COLORS: COLORS, CHIP: CHIP, TINT: TINT, DOT: DOT, HEX: HEX, pal: pal,
    ICON_KEYS: ICON_KEYS, TYPE_ICON: TYPE_ICON,
    DEF_CATS: DEF_CATS, DEF_TEAM: DEF_TEAM, DEF_CFG: DEF_CFG,
    getCfgCats: function () { return CFG_CATS; },
    setCfgCats: function (v) { CFG_CATS = v.slice(); },
    makeCats: makeCats,
    P_MGR: P_MGR, P_BR: P_BR, P_VIEW: P_VIEW, resolvePerms: resolvePerms,
    PERM_GROUPS: PERM_GROUPS, TAB_LABELS: TAB_LABELS,
    ACCOUNTS: ACCOUNTS, SEED_DEFS: SEED_DEFS, seedIssues: seedIssues,
    buildC: buildC, isDone: isDone, isParked: isParked, isActive: isActive,
    daysUntil: daysUntil, plD: plD, dueLabel: dueLabel, isOD: isOD,
    exportCSV: exportCSV, saveOut: saveOut,
    DEF_NOTIF: DEF_NOTIF, NOTIF_LABELS: NOTIF_LABELS, URGENT_EVENTS: URGENT_EVENTS,
    DEF_EJS: DEF_EJS, sendEmailNotif: sendEmailNotif,
    getOutbox: function () { return outbox; },
    setOutbox: function (v) { outbox = v || []; },
    getAlerts: function () { return alerts; },
    setAlerts: function (v) { alerts = v || []; },
    pushAlert: pushAlert, unreadAlerts: unreadAlerts,
    Ring: Ring
  };
}());
