import config from '../config.js';

/* Bilingual transactional mail. Each message is rendered in the recipient's own
   language — the language is a property of the reader, not of the sender. */

const TITLES = {
  en: {
    assign: 'Task assigned to you',
    reassign: 'Task reassigned',
    reminder: 'Reminder',
    due: 'Due date approaching',
    overdue: 'Task overdue',
    escalation: 'Escalation',
    approval: 'Approval required',
    mention: 'You were mentioned',
    comment: 'New comment',
    complete: 'Task completed',
    status: 'Status changed',
    update: 'Task updated',
    watch: 'You are now following a task',
    dependency: 'Dependency cleared',
    rule: 'Automation',
  },
  ar: {
    assign: 'أُسندت إليك مهمة',
    reassign: 'أُعيد إسناد المهمة',
    reminder: 'تذكير',
    due: 'اقتراب موعد الاستحقاق',
    overdue: 'مهمة متأخرة',
    escalation: 'تصعيد',
    approval: 'مطلوب اعتماد',
    mention: 'تمت الإشارة إليك',
    comment: 'تعليق جديد',
    complete: 'اكتملت المهمة',
    status: 'تغيّرت الحالة',
    update: 'تحديث على المهمة',
    watch: 'أصبحت متابعًا لمهمة',
    dependency: 'رُفعت الاعتمادية',
    rule: 'أتمتة',
  },
};

const LABELS = {
  en: {
    priority: 'Priority', due: 'Due', status: 'Status', assignee: 'Assignee',
    open: 'Open the task', noDue: 'No due date', greeting: 'Hello',
    footer: 'You are receiving this because you follow this task in',
    prefs: 'Change your notification preferences in Settings → Notifications.',
  },
  ar: {
    priority: 'الأولوية', due: 'الاستحقاق', status: 'الحالة', assignee: 'المسؤول',
    open: 'فتح المهمة', noDue: 'بدون تاريخ استحقاق', greeting: 'مرحبًا',
    footer: 'وصلتك هذه الرسالة لأنك من متابعي هذه المهمة في',
    prefs: 'يمكنك تغيير تفضيلات الإشعارات من الإعدادات ← الإشعارات.',
  },
};

export function notifTitle(kind, lang = 'en') {
  const map = TITLES[lang === 'ar' ? 'ar' : 'en'];
  return map[kind] || TITLES.en[kind] || kind;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function taskUrl(task) {
  return task ? `${config.appUrl}/#/task/${encodeURIComponent(task.id)}` : config.appUrl;
}

export function renderEmail({ kind, user, task, text = '', textAr = '', subject = null, body = null }) {
  const lang = user?.lang === 'ar' ? 'ar' : 'en';
  const L = LABELS[lang];
  const rtl = lang === 'ar';
  const org = rtl ? config.orgNameAr : config.orgName;
  const title = notifTitle(kind, lang);
  const message = (rtl ? textAr || text : text) || '';
  const name = (rtl ? user?.name_ar || user?.name : user?.name) || '';
  const taskTitle = task ? (rtl ? task.title_ar || task.title : task.title) : '';

  const subjectLine = subject || (task ? `[${task.id}] ${title} — ${taskTitle}` : `${title} — ${org}`);

  const lines = [
    `${L.greeting} ${name},`,
    '',
    message,
  ];
  if (task) {
    lines.push(
      '',
      `${task.id} — ${taskTitle}`,
      `${L.priority}: ${task.priority}`,
      `${L.due}: ${task.due_date ? `${task.due_date}${task.due_time ? ` ${task.due_time}` : ''}` : L.noDue}`,
      `${L.status}: ${task.status}`,
      '',
      `${L.open}: ${taskUrl(task)}`,
    );
  }
  lines.push('', '—', `${L.footer} ${org}.`, L.prefs);
  const textBody = body || lines.join('\n');

  const html = `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#EEF2F2;font-family:${rtl ? "'Segoe UI',Tahoma,sans-serif" : "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"};color:#0B1E22;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #D3DEDE;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0B6E6E;color:#FFFFFF;padding:16px 20px;font-weight:700;font-size:15px;">${escapeHtml(org)} · ${escapeHtml(title)}</td></tr>
    <tr><td style="padding:20px;">
      <p style="margin:0 0 12px;font-size:14px;">${escapeHtml(L.greeting)} ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
      ${task ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3EBEB;border-radius:10px;background:#F6FAFA;margin:0 0 18px;">
        <tr><td style="padding:12px 14px;">
          <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#48595C;">${escapeHtml(task.id)}</div>
          <div style="font-size:15px;font-weight:650;margin:4px 0 10px;">${escapeHtml(taskTitle)}</div>
          <div style="font-size:13px;color:#48595C;line-height:1.8;">
            <div>${escapeHtml(L.priority)}: <b>${escapeHtml(task.priority)}</b></div>
            <div>${escapeHtml(L.due)}: <b>${task.due_date ? escapeHtml(`${task.due_date}${task.due_time ? ` ${task.due_time}` : ''}`) : escapeHtml(L.noDue)}</b></div>
            <div>${escapeHtml(L.status)}: <b>${escapeHtml(task.status)}</b></div>
          </div>
        </td></tr>
      </table>
      <p style="margin:0 0 18px;"><a href="${escapeHtml(taskUrl(task))}" style="display:inline-block;background:#0B6E6E;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(L.open)}</a></p>` : ''}
      <p style="margin:0;font-size:11.5px;color:#75878A;line-height:1.6;">${escapeHtml(L.footer)} ${escapeHtml(org)}.<br>${escapeHtml(L.prefs)}</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject: subjectLine, text: textBody, html };
}

export default renderEmail;
