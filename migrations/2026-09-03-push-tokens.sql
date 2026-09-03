-- Migration: Push notification registration table
-- Token is a device credential: never logged, never exposed via GET.
CREATE TABLE IF NOT EXISTS push_tokens (
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'caisse',
  employee_id TEXT,
  platform TEXT NOT NULL CHECK(platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (merchant, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_target ON push_tokens (merchant, role);
