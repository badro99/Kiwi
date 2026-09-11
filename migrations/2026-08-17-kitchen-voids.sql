-- Kitchen voids protocol & waste tracking
CREATE TABLE IF NOT EXISTS kitchen_voids (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  order_id TEXT NOT NULL,
  table_no TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'client_change',
  is_waste INTEGER NOT NULL DEFAULT 0,
  actor TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kitchen_voids_live
  ON kitchen_voids (merchant, created_ts);
