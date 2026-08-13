-- متابِع · Mutabea — schema
-- Applied on every boot; every statement is idempotent.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- An account is not usable until an administrator approves it. `status` is the
-- gate: pending accounts can sign in nowhere, rejected ones carry the reason.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'branch',      -- manager | branch
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending | active | rejected | disabled
  entity_id     TEXT REFERENCES entities(id) ON DELETE SET NULL,
  perms         TEXT,                                -- JSON override, NULL = role default
  phone         TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',            -- what the applicant wrote when registering
  decided_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at    INTEGER,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_entity ON users(entity_id);

CREATE TABLE IF NOT EXISTS entities (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL DEFAULT 'other',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_entity ON categories(entity_id);

CREATE TABLE IF NOT EXISTS issues (
  id           TEXT PRIMARY KEY,
  entity_id    TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',
  priority     TEXT NOT NULL DEFAULT 'medium',
  assignee     TEXT NOT NULL DEFAULT '',
  reporter     TEXT NOT NULL DEFAULT '',
  reporter_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date     INTEGER,
  repeat       TEXT NOT NULL DEFAULT 'none',         -- none | weekly | monthly
  tags         TEXT NOT NULL DEFAULT '[]',           -- JSON array
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  overdue_flagged INTEGER NOT NULL DEFAULT 0,
  due_soon_flagged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_issues_entity ON issues(entity_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_due ON issues(due_date);

CREATE TABLE IF NOT EXISTS checklist (
  id       TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_checklist_issue ON checklist(issue_id);

CREATE TABLE IF NOT EXISTS comments (
  id       TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  author   TEXT NOT NULL DEFAULT '',
  mgr      INTEGER NOT NULL DEFAULT 0,
  text     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);

CREATE TABLE IF NOT EXISTS activity (
  id       TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  by       TEXT NOT NULL DEFAULT '',
  note     TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_issue ON activity(issue_id);

-- Photographs and library files are held as data URIs, resized in the browser
-- before upload. Kept out of the issue row so a list query stays small.
CREATE TABLE IF NOT EXISTS photos (
  id       TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL DEFAULT 'before',           -- before | after
  data     TEXT NOT NULL,
  by       TEXT NOT NULL DEFAULT '',
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_issue ON photos(issue_id, kind);

CREATE TABLE IF NOT EXISTS documents (
  id        TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL DEFAULT 'application/octet-stream',
  size      INTEGER NOT NULL DEFAULT 0,
  data      TEXT,
  by        TEXT NOT NULL DEFAULT '',
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_id);

CREATE TABLE IF NOT EXISTS team (
  name TEXT PRIMARY KEY
);

-- In-application notifications, one row per recipient.
CREATE TABLE IF NOT EXISTS notifications (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event    TEXT NOT NULL,
  title    TEXT NOT NULL DEFAULT '',
  text     TEXT NOT NULL DEFAULT '',
  issue_id TEXT,
  at       INTEGER NOT NULL,
  read     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, at);

-- Every outbound message, whether it reached the mail server or not.
CREATE TABLE IF NOT EXISTS emails (
  id        TEXT PRIMARY KEY,
  to_email  TEXT NOT NULL,
  to_user   TEXT REFERENCES users(id) ON DELETE SET NULL,
  event     TEXT NOT NULL,
  subject   TEXT NOT NULL,
  body      TEXT NOT NULL DEFAULT '',
  html      TEXT NOT NULL DEFAULT '',
  state     TEXT NOT NULL DEFAULT 'queued',          -- queued | sent | failed | suppressed
  attempts  INTEGER NOT NULL DEFAULT 0,
  error     TEXT,
  message_id TEXT,
  next_try_at INTEGER,
  issue_id  TEXT,
  created_at INTEGER NOT NULL,
  sent_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_emails_state ON emails(state, next_try_at);

CREATE TABLE IF NOT EXISTS audit (
  id     TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
