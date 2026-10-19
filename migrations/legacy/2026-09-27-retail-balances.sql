-- #94: an open retail bill is distinct from money received on a given day.
-- Apply to production D1 before deploying the corresponding application code.
CREATE TABLE IF NOT EXISTS retail_balances (
  merchant TEXT NOT NULL,
  id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  ticket_ref TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents > 0),
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_balances_ticket
  ON retail_balances(merchant, ticket_ref);
CREATE INDEX IF NOT EXISTS retail_balances_customer
  ON retail_balances(merchant, customer_id, created_ts DESC);
CREATE TABLE IF NOT EXISTS retail_balance_receipts (
  merchant TEXT NOT NULL,
  balance_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted')),
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sale_id),
  FOREIGN KEY (merchant, balance_id) REFERENCES retail_balances(merchant, id)
);
CREATE INDEX IF NOT EXISTS retail_balance_receipts_by_balance
  ON retail_balance_receipts(merchant, balance_id, created_ts);
