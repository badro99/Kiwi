-- Inventaire physique universel & validation propriétaire Kiwi POS
-- Permet la saisie à l'aveugle en caisse (Boutique, Maison, Restaurant/Ledger),
-- le gel des métadonnées humaines, la revue propriétaire et la traçabilité des événements.
-- Additif, idempotent. Appliqué en prod le 2026-08-22.

CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  store_id TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  employee_role TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewer_id TEXT DEFAULT '',
  reviewer_name TEXT DEFAULT '',
  review_decision TEXT DEFAULT '',
  review_note TEXT DEFAULT '',
  applied_at INTEGER,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_counted REAL NOT NULL DEFAULT 0,
  total_system REAL NOT NULL DEFAULT 0,
  total_diff REAL NOT NULL DEFAULT 0,
  total_variance_cost_mad REAL NOT NULL DEFAULT 0,
  abs_variance_cost_mad REAL NOT NULL DEFAULT 0,
  lines_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_date ON inventory_counts (merchant, submitted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_status ON inventory_counts (merchant, status);

CREATE TABLE IF NOT EXISTS inventory_count_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  event TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  via TEXT,
  note TEXT,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_events_merchant_count ON inventory_count_events (merchant, count_id, ts);
