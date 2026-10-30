-- Ozon Express: the merchant's Ozon account (key encrypted), its parcels and delivery notes.
-- functions/api/ozon/. Applied to prod by the owner (docs/ops/MIGRATIONS.md).

CREATE TABLE IF NOT EXISTS ozon_accounts (
  merchant TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  pickup_mode INTEGER NOT NULL DEFAULT 0,
  connected_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ozon_parcels (
  merchant TEXT NOT NULL,
  tracking TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  receiver TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city_id INTEGER NOT NULL,
  city_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  fee_delivered_cents INTEGER NOT NULL DEFAULT 0,
  fee_returned_cents INTEGER NOT NULL DEFAULT 0,
  fee_refused_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  status_label TEXT NOT NULL DEFAULT '',
  status_ts INTEGER NOT NULL DEFAULT 0,
  checked_ts INTEGER NOT NULL DEFAULT 0,
  paid_ts INTEGER NOT NULL DEFAULT 0,
  bl_ref TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, tracking)
);

CREATE TABLE IF NOT EXISTS ozon_delivery_notes (
  merchant TEXT NOT NULL,
  ref TEXT NOT NULL,
  parcels INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, ref)
);

CREATE UNIQUE INDEX IF NOT EXISTS ozon_parcels_sale ON ozon_parcels (merchant, sale_id);

CREATE INDEX IF NOT EXISTS ozon_parcels_open ON ozon_parcels (merchant, status, checked_ts);

