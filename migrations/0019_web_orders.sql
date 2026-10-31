-- Kiwi Commerce: cash-on-delivery orders from a merchant's online shop.
-- functions/api/shop/. Applied to prod by the owner (docs/ops/MIGRATIONS.md).

CREATE TABLE IF NOT EXISTS web_orders (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  number TEXT NOT NULL,
  client_ref TEXT NOT NULL,
  link_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  customer TEXT NOT NULL,
  lines TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  delivery_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  created_ts INTEGER NOT NULL,
  decided_ts INTEGER NOT NULL DEFAULT 0,
  decided_by TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  sale_id TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS web_orders_ref ON web_orders (merchant, client_ref);

CREATE INDEX IF NOT EXISTS web_orders_queue ON web_orders (merchant, status, created_ts);

