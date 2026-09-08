-- Audit remediation (I01-I05).
-- Apply with the normal D1 migration runner; no existing ledger or client row
-- is deleted or rewritten here.

-- The additive payload_hash ALTER is deliberately separate:
-- migrations/2026-09-08-inventory-movement-payload-hash.sql
-- applies it to legacy installations whose inventory table predates schema.sql.

CREATE TABLE IF NOT EXISTS inventory_request_reservations (
  merchant TEXT NOT NULL,
  request_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  qty_milli INTEGER NOT NULL,
  review_revision INTEGER NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, request_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_inventory_request_reservations_stock
  ON inventory_request_reservations (merchant, item_id, location_id);

-- Existing reviewed requests are not blindly backfilled. Confirmation uses a
-- serialized SQL ATP/CAS guard to adopt a missing hold only when the currently
-- unreserved stock can cover it; otherwise the API returns reservation-required
-- and asks for an explicit re-review. This keeps the empty table safe during
-- rollout instead of silently overbooking old approvals.

CREATE TABLE IF NOT EXISTS client_purchase_events (
  merchant TEXT NOT NULL,
  ref TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  stamps INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 1,
  created_ts INTEGER NOT NULL,
  srv_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, ref)
);

CREATE INDEX IF NOT EXISTS idx_client_purchase_events_sync
  ON client_purchase_events (merchant, srv_ts);

CREATE TABLE IF NOT EXISTS client_reward_events (
  merchant TEXT NOT NULL,
  ref TEXT NOT NULL,
  client_id TEXT NOT NULL,
  points_delta INTEGER NOT NULL DEFAULT 0,
  stamps_delta INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  srv_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, ref)
);

CREATE INDEX IF NOT EXISTS idx_client_reward_events_sync
  ON client_reward_events (merchant, srv_ts);

-- Purchase/reward amounts remain major-unit numbers rounded to two decimals at
-- the API boundary. SQLite's legacy INTEGER-affinity columns retain fractional
-- values as REAL when needed, so no destructive column rewrite is required.
