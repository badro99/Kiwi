-- Table transfers and merges audit trail
CREATE TABLE IF NOT EXISTS table_transfers (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  from_table TEXT NOT NULL,
  to_table TEXT NOT NULL,
  session_id TEXT,
  server TEXT,
  covers INTEGER,
  orders_count INTEGER,
  is_merge INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_table_transfers_live
  ON table_transfers (merchant, created_ts);
