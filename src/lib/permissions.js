/* Authority in متابع resolves in two questions, deliberately kept apart:
     can(user, permission)  — what may this kind of person do at all?
     taskAccess(user, task) — which records exist for them, and may they change
                              this one?
   Every route asks the first; every read and every write asks the second, so a
   surface cannot invent its own rule. */

export const PERMS = [
  'task.view', 'task.create', 'task.edit', 'task.delete', 'task.assign', 'task.reassign',
  'task.deadline', 'task.priority', 'task.complete', 'task.reopen', 'task.cancel', 'task.approve',
  'view.team', 'view.department', 'view.project', 'view.org',
  'manage.categories', 'manage.projects', 'reports.view', 'data.export',
  'manage.users', 'manage.automation', 'manage.settings', 'audit.view',
];

export const ROLES = {
  admin: {
    id: 'admin',
    name: 'System Administrator',
    nameAr: 'مسؤول النظام',
    perms: PERMS.slice(),
  },
  manager: {
    id: 'manager',
    name: 'Manager / Team Leader',
    nameAr: 'مدير / قائد فريق',
    perms: [
      'task.view', 'task.create', 'task.edit', 'task.delete', 'task.assign', 'task.reassign',
      'task.deadline', 'task.priority', 'task.complete', 'task.reopen', 'task.cancel', 'task.approve',
      'view.team', 'view.department', 'view.project',
      'manage.categories', 'manage.projects', 'reports.view', 'data.export', 'manage.automation',
    ],
  },
  member: {
    id: 'member',
    name: 'Team Member',
    nameAr: 'عضو فريق',
    perms: ['task.view', 'task.create', 'task.edit', 'task.complete', 'view.team', 'view.project'],
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer / Stakeholder',
    nameAr: 'مطّلع',
    perms: ['task.view', 'view.project', 'reports.view'],
  },
};

export const ROLE_IDS = Object.keys(ROLES);

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function can(user, perm) {
  if (!user) return false;
  const role = ROLES[user.role];
  if (!role) return false;
  return role.perms.includes(perm);
}

/* Personal attachment beats every structural rule: a person can always reach
   work they are named on, even if their role is otherwise narrow. */
export function isAttached(user, task, links = {}) {
  if (!user || !task) return false;
  const watchers = links.watchers || [];
  const participants = links.participants || [];
  return (
    task.assignee === user.id ||
    task.owner === user.id ||
    task.created_by === user.id ||
    task.escalated_to === user.id ||
    watchers.includes(user.id) ||
    participants.includes(user.id)
  );
}

/**
 * Returns 'none' | 'view' | 'edit'.
 * `links` carries the task's watcher and participant ids; `orgIndex` carries the
 * lookup tables needed for structural reach (direct reports, team membership).
 */
export function taskAccess(user, task, links = {}, orgIndex = {}) {
  if (!user || !task) return 'none';
  const editable = can(user, 'task.edit');

  if (isAttached(user, task, links)) return editable ? 'edit' : 'view';
  if (can(user, 'view.org')) return editable ? 'edit' : 'view';

  if (can(user, 'view.department') && task.dept && task.dept === user.dept) {
    return editable ? 'edit' : 'view';
  }
  if (can(user, 'view.team') && task.team && task.team === user.team) {
    return editable ? 'edit' : 'view';
  }
  /* A manager reaches the work of the people who report to them even when the
     task carries no team, which is common for ad-hoc follow-ups. */
  const reports = orgIndex.directReports || new Set();
  if (can(user, 'view.team') && (reports.has(task.assignee) || reports.has(task.owner))) {
    return editable ? 'edit' : 'view';
  }
  return 'none';
}

export function canSee(user, task, links, orgIndex) {
  return taskAccess(user, task, links, orgIndex) !== 'none';
}

export function roleSummary() {
  return Object.values(ROLES).map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr, perms: r.perms }));
}
