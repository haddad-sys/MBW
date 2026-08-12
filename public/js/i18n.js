/* Arabic is the default because the console is used in Arabic first; English is
   a full peer, not a fallback. Any missing key renders its own name rather than
   an empty string, so a gap is visible instead of silent. */

export const STRINGS = {
  ar: {
    app: 'متابع', appSub: 'منصّة المتابعة',
    signIn: 'تسجيل الدخول', signInSub: 'سجّل الدخول للمتابعة',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', signOut: 'تسجيل الخروج',
    invalidCredentials: 'بيانات الدخول غير صحيحة', demoHint: 'حساب تجريبي: admin@mutabi.local · Mutabi#2026',

    navWork: 'العمل', navSystem: 'النظام',
    today: 'اليوم', myTasks: 'مهامي', following: 'أتابعها', allTasks: 'كل المهام',
    notifications: 'الإشعارات', settings: 'الإعدادات', emailLog: 'سجل البريد', people: 'المستخدمون',

    search: 'بحث في المهام…', newTask: 'مهمة جديدة', refresh: 'تحديث',
    theme: 'المظهر', language: 'اللغة',

    open: 'مفتوحة', overdue: 'متأخرة', dueToday: 'مستحقة اليوم', completed: 'مكتملة',
    dueSoon: 'قريبة الاستحقاق', noDue: 'بدون استحقاق', due: 'الاستحقاق',
    priority: 'الأولوية', status: 'الحالة', assignee: 'المسؤول', owner: 'المالك', time: 'الوقت',
    prio_Critical: 'حرجة', prio_High: 'عالية', prio_Medium: 'متوسطة', prio_Low: 'منخفضة',
    progress: 'الإنجاز', description: 'الوصف', title: 'العنوان', titleAr: 'العنوان بالعربية',
    category: 'التصنيف', project: 'المشروع', unassigned: 'غير مسندة',

    watchers: 'المتابعون', addWatcher: 'إضافة متابع', follow: 'متابعة', unfollow: 'إلغاء المتابعة',
    following_: 'تتابع هذه المهمة', notFollowing: 'لا تتابع هذه المهمة',
    comments: 'التعليقات', addComment: 'اكتب تعليقًا… استخدم @ للإشارة إلى شخص',
    checklist: 'قائمة التحقق', addItem: 'إضافة بند', history: 'السجل', reminders: 'التذكيرات',
    addReminder: 'إضافة تذكير', remindAt: 'وقت التذكير',

    save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', add: 'إضافة', remove: 'حذف', delete: 'حذف', send: 'إرسال',
    markAllRead: 'تعليم الكل كمقروء', noNotifications: 'لا توجد إشعارات', viewAll: 'عرض الكل',
    readOnly: 'للقراءة فقط', noTasks: 'لا توجد مهام هنا', noTasksSub: 'أنشئ مهمة أو غيّر المرشّح.',

    notifSettings: 'إعدادات الإشعارات', inAppNotif: 'إشعارات داخل الموقع',
    inAppNotifSub: 'تظهر في الجرس وتصلك مباشرة أثناء عملك.',
    soundOn: 'تنبيه صوتي (رنّة)', soundOnSub: 'تُشغَّل نغمة قصيرة عند وصول إشعار جديد.',
    desktopOn: 'إشعارات سطح المكتب', desktopOnSub: 'تظهر خارج المتصفح — تحتاج إذن المتصفح.',
    emailNotif: 'إشعارات البريد الإلكتروني', emailMode: 'متى تصلني رسالة؟',
    emailAll: 'كل الإشعارات', emailCritical: 'المهام الحرجة فقط', emailOff: 'إيقاف',
    quietHours: 'ساعات الهدوء', quietSub: 'تُكتم الرنّة وتؤجَّل الرسائل حتى انتهاء الفترة. التصعيد والاعتماد لا يُكتمان.',
    from: 'من', to: 'إلى',
    events: 'الأحداث', ev_assign: 'الإسناد', ev_due: 'الاستحقاق والتذكيرات', ev_overdue: 'التأخر',
    ev_mention: 'التعليقات والإشارات', ev_approval: 'الاعتماد', ev_escalation: 'التصعيد', ev_watch: 'تحديثات ما أتابعه',
    testNotif: 'إرسال إشعار تجريبي', testNotifSub: 'يمر عبر المسار الحقيقي: الجرس والرنّة والبريد.',
    testSent: 'أُرسل الإشعار التجريبي.', prefsSaved: 'حُفظت التفضيلات.',
    enableSound: 'تفعيل الصوت', enableSoundSub: 'اضغط مرة واحدة للسماح للمتصفح بتشغيل النغمة.',
    soundReady: 'الصوت جاهز.', permissionDenied: 'رفض المتصفح إذن الإشعارات.',
    connected: 'متصل مباشرة', disconnected: 'انقطع الاتصال — تُعاد المحاولة…',

    profile: 'الملف الشخصي', name: 'الاسم', nameAr: 'الاسم بالعربية',
    changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة',
    passwordChanged: 'تم تغيير كلمة المرور.',

    mailTransport: 'ناقل البريد', recipient: 'المستلم', subject: 'الموضوع', state: 'الحالة', sentAt: 'وقت الإرسال',
    sendQueued: 'إرسال المعلّق', verifyMail: 'فحص الاتصال', runTick: 'تشغيل المحرّك',
    st_sent: 'أُرسلت', st_queued: 'في الانتظار', st_failed: 'فشلت', st_suppressed: 'مكتومة',
    engineRan: 'اكتملت دورة المحرّك.',

    k_assign: 'إسناد', k_reassign: 'إعادة إسناد', k_reminder: 'تذكير', k_due: 'تغيير الاستحقاق',
    k_overdue: 'متأخرة', k_escalation: 'تصعيد', k_approval: 'اعتماد', k_mention: 'إشارة',
    k_comment: 'تعليق', k_complete: 'اكتملت', k_status: 'تغيّر الحالة', k_update: 'تحديث',
    k_watch: 'متابعة', k_dependency: 'رفع اعتمادية', k_rule: 'أتمتة',
  },
  en: {
    app: 'Mutabi', appSub: 'Follow-up console',
    signIn: 'Sign in', signInSub: 'Sign in to continue',
    email: 'Email', password: 'Password', signOut: 'Sign out',
    invalidCredentials: 'Those credentials were not accepted', demoHint: 'Demo account: admin@mutabi.local · Mutabi#2026',

    navWork: 'Work', navSystem: 'System',
    today: 'Today', myTasks: 'My tasks', following: 'Following', allTasks: 'All tasks',
    notifications: 'Notifications', settings: 'Settings', emailLog: 'Email log', people: 'People',

    search: 'Search tasks…', newTask: 'New task', refresh: 'Refresh',
    theme: 'Theme', language: 'Language',

    open: 'Open', overdue: 'Overdue', dueToday: 'Due today', completed: 'Completed',
    dueSoon: 'Due soon', noDue: 'No due date', due: 'Due',
    priority: 'Priority', status: 'Status', assignee: 'Assignee', owner: 'Owner', time: 'Time',
    prio_Critical: 'Critical', prio_High: 'High', prio_Medium: 'Medium', prio_Low: 'Low',
    progress: 'Progress', description: 'Description', title: 'Title', titleAr: 'Arabic title',
    category: 'Category', project: 'Project', unassigned: 'Unassigned',

    watchers: 'Followers', addWatcher: 'Add follower', follow: 'Follow', unfollow: 'Unfollow',
    following_: 'You follow this task', notFollowing: 'You are not following this task',
    comments: 'Comments', addComment: 'Write a comment… use @ to mention someone',
    checklist: 'Checklist', addItem: 'Add item', history: 'History', reminders: 'Reminders',
    addReminder: 'Add reminder', remindAt: 'Remind at',

    save: 'Save', cancel: 'Cancel', close: 'Close', add: 'Add', remove: 'Remove', delete: 'Delete', send: 'Send',
    markAllRead: 'Mark all read', noNotifications: 'Nothing to read', viewAll: 'View all',
    readOnly: 'View only', noTasks: 'No tasks here', noTasksSub: 'Create one, or change the filter.',

    notifSettings: 'Notification settings', inAppNotif: 'In-app notifications',
    inAppNotifSub: 'They land in the bell and arrive while you work.',
    soundOn: 'Audible ring', soundOnSub: 'A short chime plays when a notification arrives.',
    desktopOn: 'Desktop notifications', desktopOnSub: 'Shown outside the browser — needs permission.',
    emailNotif: 'Email notifications', emailMode: 'When should we email you?',
    emailAll: 'Every notification', emailCritical: 'Critical tasks only', emailOff: 'Never',
    quietHours: 'Quiet hours', quietSub: 'The ring is muted and email is held until the window closes. Escalations and approvals are never muted.',
    from: 'From', to: 'To',
    events: 'Events', ev_assign: 'Assignment', ev_due: 'Due dates and reminders', ev_overdue: 'Overdue',
    ev_mention: 'Comments and mentions', ev_approval: 'Approvals', ev_escalation: 'Escalations', ev_watch: 'Updates I follow',
    testNotif: 'Send a test notification', testNotifSub: 'Goes through the real path: bell, ring and email.',
    testSent: 'Test notification sent.', prefsSaved: 'Preferences saved.',
    enableSound: 'Enable sound', enableSoundSub: 'Click once so the browser will let the chime play.',
    soundReady: 'Sound is ready.', permissionDenied: 'The browser refused notification permission.',
    connected: 'Live', disconnected: 'Reconnecting…',

    profile: 'Profile', name: 'Name', nameAr: 'Arabic name',
    changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password',
    passwordChanged: 'Password changed.',

    mailTransport: 'Mail transport', recipient: 'Recipient', subject: 'Subject', state: 'State', sentAt: 'Sent',
    sendQueued: 'Send queued', verifyMail: 'Verify connection', runTick: 'Run engine',
    st_sent: 'Sent', st_queued: 'Queued', st_failed: 'Failed', st_suppressed: 'Suppressed',
    engineRan: 'Engine pass complete.',

    k_assign: 'Assigned', k_reassign: 'Reassigned', k_reminder: 'Reminder', k_due: 'Due date changed',
    k_overdue: 'Overdue', k_escalation: 'Escalation', k_approval: 'Approval', k_mention: 'Mentioned',
    k_comment: 'Comment', k_complete: 'Completed', k_status: 'Status changed', k_update: 'Updated',
    k_watch: 'Following', k_dependency: 'Dependency cleared', k_rule: 'Automation',
  },
};

export const state = { lang: localStorage.getItem('mutabi.lang') || 'ar' };

export function t(key) {
  return STRINGS[state.lang]?.[key] ?? STRINGS.en[key] ?? key;
}

export function setLang(lang) {
  state.lang = lang === 'en' ? 'en' : 'ar';
  localStorage.setItem('mutabi.lang', state.lang);
  document.body.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', state.lang);
}

export function isRtl() {
  return state.lang === 'ar';
}

/* Priority is stored as a stable English enum and displayed in the reader's
   language — the value in the database never changes with the UI. */
export function priorityLabel(priority) {
  return t(`prio_${priority}`);
}

/* Names, titles and status labels all carry an Arabic twin. */
export function pick(obj, enKey, arKey) {
  if (!obj) return '';
  return (state.lang === 'ar' ? obj[arKey] || obj[enKey] : obj[enKey]) || '';
}
