-- Additive operator work records. No existing merchant rows are changed.
CREATE TABLE IF NOT EXISTS operator_tasks (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, signal_key TEXT,
  title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','snoozed','resolved')),
  assignee TEXT NOT NULL DEFAULT '', due_ts INTEGER, snoozed_until INTEGER,
  outcome TEXT NOT NULL DEFAULT '', source_ts INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1, mutation_id TEXT NOT NULL,
  created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_task_signal ON operator_tasks(merchant, signal_key) WHERE signal_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operator_task_queue ON operator_tasks(status, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_operator_task_merchant ON operator_tasks(merchant, updated_ts DESC);
CREATE TABLE IF NOT EXISTS operator_task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, merchant TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES operator_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_operator_task_events ON operator_task_events(merchant,ts DESC);
CREATE TABLE IF NOT EXISTS operator_notes (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, body TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_notes ON operator_notes(merchant,ts DESC);
