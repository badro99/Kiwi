-- Carnet de crédit du patron : plafonds, échéanciers, rappels (functions/api/_credit-accounts.js).
CREATE TABLE IF NOT EXISTS credit_accounts (
  merchant TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('carnet','client')),
  customer_key TEXT NOT NULL,
  limit_cents INTEGER CHECK(limit_cents IS NULL OR limit_cents >= 0),
  lang TEXT NOT NULL DEFAULT '',
  paid_mark_cents INTEGER NOT NULL DEFAULT 0,
  reminded_ts INTEGER NOT NULL DEFAULT 0,
  schedule TEXT NOT NULL DEFAULT '[]',
  rev INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, source, customer_key)
);

CREATE TABLE IF NOT EXISTS credit_events (
  merchant TEXT NOT NULL, id TEXT NOT NULL,
  source TEXT NOT NULL, customer_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('schedule','limit','limit-override','collected','reminded','promise')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE INDEX IF NOT EXISTS credit_events_customer ON credit_events(merchant, source, customer_key, ts DESC);

