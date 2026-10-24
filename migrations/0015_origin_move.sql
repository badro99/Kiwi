-- Origin retirement, number 0013 reserved by the task.
CREATE TABLE IF NOT EXISTS origin_handoffs (
  token_hash TEXT PRIMARY KEY,
  preferences TEXT NOT NULL DEFAULT '{}',
  merchant TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('till', 'kitchen', 'employee', 'waiter')),
  device_id TEXT NOT NULL,
  staff_id TEXT,
  auth_version INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts INTEGER
);

CREATE TABLE IF NOT EXISTS origin_devices (
  merchant TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (merchant, device_hash)
);

CREATE INDEX IF NOT EXISTS idx_origin_handoffs_expiry ON origin_handoffs(expires_ts);

CREATE INDEX IF NOT EXISTS idx_origin_devices_seen ON origin_devices(last_seen);

