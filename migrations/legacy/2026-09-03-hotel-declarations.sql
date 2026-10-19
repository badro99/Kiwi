-- Hotel Monthly Declarations & Revisions Ledger (Append-Only)
-- Immutability enforced by SQLite triggers.
CREATE TABLE IF NOT EXISTS hotel_monthly_declarations (
  merchant TEXT NOT NULL,
  month TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'closed',
  source_cursor INTEGER NOT NULL DEFAULT 0,
  -- Required: every seal or rectification carries a client-generated key, so a
  -- retried request replays instead of forking the revision chain.
  idempotency_key TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  lineage_json TEXT NOT NULL DEFAULT '{}',
  closed_at INTEGER NOT NULL,
  closed_by_user_id TEXT NOT NULL DEFAULT '',
  closed_by_name TEXT NOT NULL DEFAULT '',
  rectification_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (merchant, month, revision),
  UNIQUE (merchant, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_hotel_decl_merchant_month
  ON hotel_monthly_declarations (merchant, month, revision);

-- Triggers enforcing that finalized declaration rows are strictly immutable
CREATE TRIGGER IF NOT EXISTS prevent_declaration_update
BEFORE UPDATE ON hotel_monthly_declarations
BEGIN
  SELECT RAISE(ABORT, 'hotel_monthly_declarations rows are immutable; append a new revision');
END;

CREATE TRIGGER IF NOT EXISTS prevent_declaration_delete
BEFORE DELETE ON hotel_monthly_declarations
BEGIN
  SELECT RAISE(ABORT, 'hotel_monthly_declarations rows cannot be deleted');
END;
