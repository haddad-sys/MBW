/* The configurable vocabulary of the system, transcribed from the delivered
   build. Statuses are ordered: the order IS the workflow path.
     gate   — crossing it requires the approval permission
     done   — counts as complete
     parked — a siding off the path (on hold) */

export const DEF_PRIORITIES = [
  { key: 'urgent', label: 'عاجلة', color: 'rose' },
  { key: 'high', label: 'عالية', color: 'orange' },
  { key: 'medium', label: 'متوسطة', color: 'yellow' },
  { key: 'low', label: 'منخفضة', color: 'slate' },
];

export const DEF_STATUSES = [
  { key: 'open', label: 'مفتوحة', color: 'slate', gate: false, done: false, parked: false },
  { key: 'in_progress', label: 'قيد التنفيذ', color: 'blue', gate: false, done: false, parked: false },
  { key: 'pending', label: 'بانتظار الاعتماد', color: 'amber', gate: true, done: false, parked: false },
  { key: 'closed', label: 'مغلقة', color: 'emerald', gate: false, done: true, parked: false },
  { key: 'on_hold', label: 'معلّقة', color: 'zinc', gate: false, done: false, parked: true },
];

export const DEF_TYPES = [
  { key: 'nursery', label: 'حضانة', color: 'rose', icon: 'baby' },
  { key: 'restaurant', label: 'مطعم', color: 'amber', icon: 'food' },
  { key: 'office', label: 'مكتب', color: 'sky', icon: 'office' },
  { key: 'other', label: 'أخرى', color: 'violet', icon: 'box' },
];

export const DEF_CATS = ['شغل داخلي', 'شغل خارجي', 'مشتريات', 'الأوراق والمستندات', 'شغل مع الحكومة', 'شغل مع الوزارة', 'أخرى'];
export const DEF_TEAM = ['أبو محمد', 'إدارة الفرع', 'فريق الصيانة', 'المنسّق التربوي', 'المشتريات', 'السباك', 'السكرتارية'];

export const DEF_CFG = {
  priorities: DEF_PRIORITIES,
  statuses: DEF_STATUSES,
  types: DEF_TYPES,
  defaultCats: DEF_CATS.slice(),
};

/* ------------------------------------------------------------ permissions -- */

export const P_MGR = {
  scope: 'all',
  tabs: { home: 1, tasks: 1, entities: 1, library: 1 },
  create: 1, edit: 1, changeStatus: 1, approve: 1, del: 1, comment: 1, photos: 1,
  uploadDocs: 1, deleteDocs: 1,
  manageEntities: 1, manageTeam: 1, manageUsers: 1, settings: 1, export: 1,
};
export const P_BR = {
  scope: 'own',
  tabs: { home: 1, tasks: 1, entities: 1, library: 1 },
  create: 1, edit: 0, changeStatus: 1, approve: 0, del: 0, comment: 1, photos: 1,
  uploadDocs: 1, deleteDocs: 0,
  manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 1,
};
export const P_VIEW = {
  scope: 'own',
  tabs: { home: 1, tasks: 1, entities: 1, library: 1 },
  create: 0, edit: 0, changeStatus: 0, approve: 0, del: 0, comment: 0, photos: 0,
  uploadDocs: 0, deleteDocs: 0,
  manageEntities: 0, manageTeam: 0, manageUsers: 0, settings: 0, export: 0,
};

export const PERM_KEYS = [
  'create', 'edit', 'changeStatus', 'approve', 'del', 'comment', 'photos',
  'uploadDocs', 'deleteDocs', 'manageEntities', 'manageTeam', 'manageUsers', 'settings', 'export',
];
export const TAB_KEYS = ['home', 'tasks', 'entities', 'library'];

export const PERM_GROUPS = [
  { title: 'المهام', items: [['create', 'إنشاء ملاحظات'], ['edit', 'تعديل الحقول'], ['changeStatus', 'تغيير الحالة'], ['approve', 'الاعتماد والإرجاع'], ['del', 'حذف الملاحظات'], ['comment', 'إضافة تعليقات'], ['photos', 'إضافة صور']] },
  { title: 'المكتبة', items: [['uploadDocs', 'رفع الملفات'], ['deleteDocs', 'حذف الملفات']] },
  { title: 'الإدارة', items: [['manageEntities', 'إدارة الفروع'], ['manageTeam', 'إدارة الفريق'], ['manageUsers', 'إدارة المستخدمين'], ['settings', 'الإعدادات والمتغيّرات'], ['export', 'تصدير البيانات']] },
];
export const TAB_LABELS = { home: 'الرئيسية', tasks: 'المهام', entities: 'الجهات', library: 'المكتبة' };

/** Resolves a user's effective permissions: the role default, then their own
 *  overrides on top. A stored override is authoritative for the keys it names. */
export function resolvePerms(user) {
  if (!user) return P_VIEW;
  const base = user.role === 'manager' ? P_MGR : P_BR;
  let override = user.perms;
  if (typeof override === 'string') {
    try { override = JSON.parse(override); } catch { override = null; }
  }
  if (!override || typeof override !== 'object') return { ...base, tabs: { ...base.tabs } };
  const out = { ...base, ...override };
  out.tabs = { ...base.tabs, ...(override.tabs || {}) };
  out.scope = override.scope === 'all' || override.scope === 'own' ? override.scope : base.scope;
  return out;
}

export function can(user, perm) {
  return !!resolvePerms(user)[perm];
}

/* Row-level reach. A person with 'own' scope exists only inside their branch;
   everything the API returns is filtered through this, never through the UI. */
export function canReachEntity(user, entityId) {
  const perms = resolvePerms(user);
  if (perms.scope === 'all') return true;
  return !!entityId && entityId === user.entity_id;
}

export const NOTIF_EVENTS = [
  'taskAdded', 'taskUpdated', 'statusChanged', 'pendingApproval', 'approvedClosed',
  'newComment', 'photoAdded', 'assignment', 'dueSoon', 'overdue', 'recurringSpawned',
  'libraryUpload', 'registration', 'accountApproved',
];

export const NOTIF_LABELS = {
  taskAdded: 'مهمة جديدة', taskUpdated: 'تحديث مهمة', statusChanged: 'تغيّر الحالة',
  pendingApproval: 'بانتظار الاعتماد', approvedClosed: 'اعتماد وإغلاق', newComment: 'تعليق جديد',
  photoAdded: 'صورة', assignment: 'تكليف', dueSoon: 'تستحق قريباً', overdue: 'متأخرة',
  recurringSpawned: 'مهمة متكررة', libraryUpload: 'ملف مكتبة',
  registration: 'طلب تسجيل جديد', accountApproved: 'اعتماد الحساب',
};

export const DEF_NOTIF = {
  enabled: true,
  recipients: [],
  types: {
    taskAdded: true, taskUpdated: true, statusChanged: true, pendingApproval: true,
    approvedClosed: true, newComment: true, photoAdded: false, assignment: true,
    dueSoon: true, overdue: true, recurringSpawned: false, libraryUpload: false,
    registration: true, accountApproved: true,
  },
};

export const URGENT_EVENTS = new Set(['overdue', 'pendingApproval', 'registration']);
