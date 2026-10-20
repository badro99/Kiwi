-- 0003 · delivery_collections: payments received against delivery sales.
-- The receivables route also creates this table on first use, so on prod this may be a no-op.
-- Additive only.

CREATE TABLE IF NOT EXISTS delivery_collections (
  merchant TEXT NOT NULL,
  collection_sale_id TEXT NOT NULL,  -- the sale that brought the money in
  sale_id TEXT NOT NULL,             -- the delivery sale
  method TEXT NOT NULL,              -- cash | transfer | cheque
  amount_cents INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  collected_by_id TEXT,
  collected_by_name TEXT,
  PRIMARY KEY (merchant, collection_sale_id)
);

CREATE INDEX IF NOT EXISTS delivery_collections_sale ON delivery_collections (merchant, sale_id);

