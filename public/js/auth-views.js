/* ===========================================================================
   متابِع — the way in: sign in, apply for an account, and the messages a
   person sees while their application is waiting on a decision.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT, U = window.UI;
  var h = U.h, ic = U.ic, mount = U.mount, api = M.api;

  var INP = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';

  function field(label, node) {
    return h('div', { class: 'mb-4' }, [
      h('label', { class: 'block text-sm font-medium text-slate-700 mb-1.5' }, label), node
    ]);
  }
  function input(attrs) { return h('input', Object.assign({ class: INP }, attrs || {})); }

  var LOGIN_ERRORS = {
    invalid_credentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    account_pending: 'حسابك بانتظار اعتماد المسؤول. ستصلك رسالة عند الاعتماد.',
    account_rejected: 'لم يُعتمد طلب حسابك.',
    account_disabled: 'هذا الحساب موقوف. راجع المسؤول.',
    missing_fields: 'أكمل الحقول المطلوبة',
  };
  var REG_ERRORS = {
    missing_fields: 'أكمل الحقول المطلوبة',
    invalid_username: 'اسم المستخدم يجب أن يكون ٣–٣٢ حرفاً إنجليزياً أو رقماً',
    invalid_email: 'صيغة البريد الإلكتروني غير صحيحة',
    password_too_short: 'كلمة المرور يجب ألا تقل عن ٨ أحرف',
    domain_not_allowed: 'نطاق البريد غير مسموح به',
    registration_closed: 'التسجيل الذاتي مغلق حالياً. راجع المسؤول.',
    invalid_entity: 'اختر فرعاً صحيحاً',
  };

  /** The sign-in card, with an application form behind a toggle. */
  function AuthPage(onSignedIn) {
    var mode = 'login';
    var entities = [];
    var busy = false;
    var box = h('div', { class: 'bg-white rounded-3xl p-6 shadow-2xl' });

    var msg = h('div', { class: 'mb-4 p-3 rounded-xl text-sm text-center' });
    msg.style.display = 'none';
    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'mb-4 p-3 rounded-xl text-sm text-center ' + (kind === 'ok'
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        : 'bg-rose-50 border border-rose-200 text-rose-700');
      msg.style.display = '';
    }
    function clearSay() { msg.style.display = 'none'; }

    api.get('/api/auth/entities').then(function (d) {
      entities = d.entities || [];
      if (d.registrationOpen === false) box.dataset.regClosed = '1';
      if (mode === 'register') draw();
    }, function () { /* the form still works without the branch list */ });

    function drawLogin() {
      var user = input({ autocomplete: 'username', placeholder: 'اسم المستخدم أو البريد' });
      var pass = input({ type: 'password', autocomplete: 'current-password' });
      var submit = h('button', {
        class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 active:bg-sky-600'
      }, [ic('lock', 17), 'تسجيل الدخول']);

      function go() {
        if (busy) return;
        clearSay();
        busy = true;
        submit.disabled = true;
        api.post('/api/auth/login', { username: user.value.trim(), password: pass.value })
          .then(function (res) {
            M.setToken(res.token);
            onSignedIn(res.user);
          })
          .catch(function (err) {
            var text = LOGIN_ERRORS[err.code] || 'تعذّر تسجيل الدخول';
            if (err.code === 'account_rejected' && err.body && err.body.reason) text += ' — ' + err.body.reason;
            say(text);
          })
          .then(function () { busy = false; submit.disabled = false; });
      }
      submit.addEventListener('click', go);
      pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });

      mount(box, [
        msg,
        field('اسم المستخدم', user),
        field('كلمة المرور', pass),
        submit,
        h('div', { class: 'text-center mt-5 text-sm text-slate-500' }, [
          'ليس لديك حساب؟ ',
          h('button', {
            class: 'link-btn',
            onclick: function () { mode = 'register'; clearSay(); draw(); }
          }, 'أنشئ طلب حساب')
        ])
      ]);
      setTimeout(function () { user.focus(); }, 30);
    }

    function drawRegister() {
      var name = input({ placeholder: 'الاسم الكامل' });
      var username = input({ dir: 'ltr', placeholder: 'username', autocomplete: 'username' });
      var email = input({ dir: 'ltr', type: 'email', placeholder: 'email@example.com' });
      var phone = input({ dir: 'ltr', placeholder: '' });
      var pass = input({ type: 'password', autocomplete: 'new-password' });
      var entSel = h('select', { class: INP });
      entSel.appendChild(h('option', { value: '' }, '— اختر الفرع (اختياري) —'));
      entities.forEach(function (e) { entSel.appendChild(h('option', { value: e.id }, e.name)); });
      var note = h('textarea', { class: INP + ' resize-none', rows: 2, placeholder: 'سبب الطلب أو الدور المطلوب' });

      var submit = h('button', {
        class: 'w-full bg-sky-500 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 active:bg-sky-600'
      }, [ic('send', 17), 'إرسال الطلب']);

      submit.addEventListener('click', function () {
        if (busy) return;
        clearSay();
        busy = true; submit.disabled = true;
        api.post('/api/auth/register', {
          name: name.value.trim(), username: username.value.trim(), email: email.value.trim(),
          phone: phone.value.trim(), password: pass.value, entityId: entSel.value || null,
          note: note.value.trim()
        }).then(function (res) {
          mount(box, [
            h('div', { class: 'text-center py-6' }, [
              h('div', { class: 'w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4' }, [ic('check', 32)]),
              h('div', { class: 'font-bold text-slate-800 mb-2' }, 'تم استلام طلبك'),
              h('p', { class: 'text-sm text-slate-500 leading-relaxed' },
                res.message || 'سيراجع المسؤول الطلب. ستصلك رسالة على بريدك عند الاعتماد.'),
              h('button', {
                class: 'mt-6 w-full bg-slate-100 text-slate-700 rounded-xl py-3 text-sm',
                onclick: function () { mode = 'login'; draw(); }
              }, 'العودة لتسجيل الدخول')
            ])
          ]);
        }).catch(function (err) {
          say(REG_ERRORS[err.code] || 'تعذّر إرسال الطلب');
        }).then(function () { busy = false; submit.disabled = false; });
      });

      mount(box, [
        msg,
        h('p', { class: 'text-xs text-slate-500 bg-sky-50 border border-sky-200 rounded-xl p-3 mb-4 leading-relaxed' },
          'يُرسل الطلب إلى مسؤول النظام. لن تتمكن من الدخول حتى يعتمد الحساب، وستصلك رسالة على بريدك عند صدور القرار.'),
        field('الاسم الكامل *', name),
        field('اسم المستخدم *', username),
        field('البريد الإلكتروني *', email),
        field('رقم الهاتف', phone),
        field('كلمة المرور *', pass),
        field('الفرع', entSel),
        field('ملاحظة للمسؤول', note),
        submit,
        h('div', { class: 'text-center mt-5 text-sm text-slate-500' }, [
          'لديك حساب؟ ',
          h('button', { class: 'link-btn', onclick: function () { mode = 'login'; clearSay(); draw(); } }, 'تسجيل الدخول')
        ])
      ]);
    }

    function draw() { if (mode === 'login') drawLogin(); else drawRegister(); }
    draw();

    return h('div', { class: 'auth-wrap', dir: 'rtl' }, [
      h('div', { class: 'w-full max-w-sm' }, [
        h('div', { class: 'text-center mb-8' }, [
          h('div', { class: 'w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4' }, [ic('clipboard', 40)]),
          h('h1', { class: 'text-4xl font-extrabold text-white' }, 'متابِع'),
          h('p', { class: 'text-sky-200 mt-1 text-sm' }, 'نظام متابعة المهام والملاحظات')
        ]),
        box
      ])
    ]);
  }

  window.AUTHV = { AuthPage: AuthPage, INP: INP, field: field, input: input };
}());
