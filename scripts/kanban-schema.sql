-- Kanban / task-list schema for tasks/kanban.db
-- Idempotent: safe to re-run (uses IF NOT EXISTS).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,          -- short slug id, e.g. "fix-auth-bug"
  title        TEXT NOT NULL,
  description TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'backlog'
                           CHECK (status IN ('backlog','todo','in_progress','review','done','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('low','medium','high','urgent')),
  column_order INTEGER NOT NULL DEFAULT 0,  -- ordering within a status column
  assignee     TEXT DEFAULT '',             -- agent/session/user label
  tags         TEXT DEFAULT '',             -- comma-separated
  parent_id    TEXT DEFAULT '' REFERENCES tasks(id) ON DELETE SET NULL, -- subtask link
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  due_at       TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);

-- Append-only activity log for audit / history.
CREATE TABLE IF NOT EXISTS task_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,              -- created | status | priority | assignee | edited | commented
  from_value TEXT DEFAULT '',
  to_value   TEXT DEFAULT '',
  note       TEXT DEFAULT '',
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity(task_id, at);

-- Default board columns metadata (single-row table).
CREATE TABLE IF NOT EXISTS board_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO board_meta(key, value) VALUES
  ('columns', 'backlog,todo,in_progress,review,done'),
  ('db_version', '1');

-- Trigger: keep updated_at fresh on row update.
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = OLD.id;
END;