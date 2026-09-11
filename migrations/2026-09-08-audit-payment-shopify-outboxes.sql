-- Reservations survive ambiguous provider responses; never release them merely
-- because a request timed out. Reconcile against provider evidence first.
CREATE TABLE IF NOT EXISTS payment_refund_reservations (
  merchant TEXT NOT NULL, command_id TEXT NOT NULL, reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), status TEXT NOT NULL,
  provider_ref TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, command_id)
);
CREATE INDEX IF NOT EXISTS idx_refund_reservation_reference
  ON payment_refund_reservations(merchant, reference, status);
CREATE TABLE IF NOT EXISTS shopify_inbound_stock (
  merchant TEXT NOT NULL, order_ref TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_ts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, order_ref)
);
CREATE INDEX IF NOT EXISTS idx_shopify_inbound_due ON shopify_inbound_stock(status, next_ts);
