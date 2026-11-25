-- Accords du patron (functions/api/_owner-approvals.js, 25 nov. 2026).
CREATE TABLE IF NOT EXISTS owner_approvals (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- cash-out | void-sent | cancel-sale
  ref TEXT NOT NULL DEFAULT '',           -- la vente ou la ligne visée
  label TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT NOT NULL DEFAULT '',
  requested_by_id TEXT NOT NULL DEFAULT '',
  terminal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | granted | used | refused | withdrawn | expired
  created_ts INTEGER NOT NULL,
  decided_ts INTEGER,
  decided_by TEXT NOT NULL DEFAULT '',
  granted_ts INTEGER,
  used_ts INTEGER
);

CREATE TABLE IF NOT EXISTS owner_approval_settings (
  merchant TEXT PRIMARY KEY,
  cash_out INTEGER NOT NULL DEFAULT 0,
  cancel INTEGER NOT NULL DEFAULT 0,
  manager_fallback INTEGER NOT NULL DEFAULT 1,
  min_cents INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS owner_approval_devices (
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, token)
);

CREATE INDEX IF NOT EXISTS idx_owner_approvals_merchant ON owner_approvals (merchant, created_ts);

