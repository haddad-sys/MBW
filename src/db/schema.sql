-- متابع (Mutabi') — schema
-- One file, applied on every boot. Every statement is idempotent so a restart
-- against an existing database is a no-op.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  name_ar   TEXT NOT NULL DEFAULT '',
  head      TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  name_ar   TEXT NOT NULL DEFAULT '',
  dept      TEXT REFERENCES departments(id) ON DELETE SET NULL,
  lead      TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  name_ar       TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  dept          TEXT REFERENCES departments(id) ON DELETE SET NULL,
  team          TEXT REFERENCES teams(id) ON DELETE SET NULL,
  manager       TEXT REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  lang          TEXT NOT NULL DEFAULT 'ar',
  tz            TEXT NOT NULL DEFAULT 'Asia/Kuwait',
  prefs         TEXT NOT NULL DEFAULT '{}',   -- notification preferences, JSON
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(dept);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager);

CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  name_ar  TEXT NOT NULL DEFAULT '',
  color    TEXT NOT NULL DEFAULT '#0B6E6E',
  dept     TEXT REFERENCES departments(id) ON DELETE SET NULL,
  owner    TEXT REFERENCES users(id) ON DELETE SET NULL,
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_ar    TEXT NOT NULL DEFAULT '',
  category   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  owner      TEXT REFERENCES users(id) ON DELETE SET NULL,
  start_date TEXT,
  end_date   TEXT,
  status     TEXT NOT NULL DEFAULT 'active'
);

-- Workflow states are configurable; "overdue" and "due soon" are deliberately
-- absent because they are conditions derived on read, never stored states.
CREATE TABLE IF NOT EXISTS statuses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_ar    TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'open',   -- open | active | stuck | closed
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  title_ar      TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new' REFERENCES statuses(id),
  priority      TEXT NOT NULL DEFAULT 'Medium',
  start_date    TEXT,
  due_date      TEXT,                        -- YYYY-MM-DD
  due_time      TEXT,                        -- HH:MM, optional
  category      TEXT REFERENCES categories(id) ON DELETE SET NULL,
  project       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  dept          TEXT REFERENCES departments(id) ON DELETE SET NULL,
  team          TEXT REFERENCES teams(id) ON DELETE SET NULL,
  owner         TEXT REFERENCES users(id) ON DELETE SET NULL,
  assignee      TEXT REFERENCES users(id) ON DELETE SET NULL,
  progress      INTEGER NOT NULL DEFAULT 0,
  estimate      REAL,
  actual        REAL,
  parent        TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  source        TEXT NOT NULL DEFAULT 'app',
  reminder_lead INTEGER,                     -- days before due; NULL = tenant default
  escalation_days INTEGER,                   -- days overdue before escalation
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  cancelled_at  INTEGER,
  status_since  INTEGER NOT NULL,
  overdue_flagged INTEGER NOT NULL DEFAULT 0,
  due_soon_flagged INTEGER NOT NULL DEFAULT 0,
  escalated_at  INTEGER,
  escalated_to  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_dept ON tasks(dept);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team);

-- المتابعون — the people following a task. A watcher receives every
-- notification the task raises without being accountable for it.
CREATE TABLE IF NOT EXISTS task_watchers (
  task    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (task, user)
);
CREATE INDEX IF NOT EXISTS idx_watchers_user ON task_watchers(user);

CREATE TABLE IF NOT EXISTS task_participants (
  task TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task, user)
);
CREATE INDEX IF NOT EXISTS idx_participants_user ON task_participants(user);

CREATE TABLE IF NOT EXISTS task_tags (
  task TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag  TEXT NOT NULL,
  PRIMARY KEY (task, tag)
);

CREATE TABLE IF NOT EXISTS checklist (
  id         TEXT PRIMARY KEY,
  task       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON checklist(task);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  task       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user       TEXT REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task);

CREATE TABLE IF NOT EXISTS task_deps (
  task       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task, blocked_by)
);

-- A reminder is a scheduled intent to notify. The scheduler fires it once and
-- marks it, so a restart cannot double-send.
CREATE TABLE IF NOT EXISTS reminders (
  id        TEXT PRIMARY KEY,
  task      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user      TEXT REFERENCES users(id) ON DELETE CASCADE,   -- NULL = every follower
  fire_at   INTEGER NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'reminder',
  note      TEXT NOT NULL DEFAULT '',
  fired     INTEGER NOT NULL DEFAULT 0,
  fired_at  INTEGER,
  auto      INTEGER NOT NULL DEFAULT 0,       -- generated from the due date
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(fired, fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_task ON reminders(task);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  task       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  actor      TEXT REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL DEFAULT '',
  text_ar    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user, read, created_at);

-- Every outbound message, whether it reached an SMTP server or not.
CREATE TABLE IF NOT EXISTS emails (
  id         TEXT PRIMARY KEY,
  to_user    TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_email   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  task       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  html       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed | suppressed
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  message_id TEXT,
  next_try_at INTEGER,
  created_at INTEGER NOT NULL,
  sent_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_emails_state ON emails(state, next_try_at);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);

CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  user       TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  task       TEXT,
  field      TEXT,
  from_value TEXT,
  to_value   TEXT,
  src        TEXT NOT NULL DEFAULT 'app'
);
CREATE INDEX IF NOT EXISTS idx_audit_task ON audit(task, at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
