-- Attribute each immutable sale to the employee who rang it.
-- Additive and nullable: historical rows remain valid and are never guessed.
ALTER TABLE sales ADD COLUMN seller_id TEXT;
ALTER TABLE sales ADD COLUMN seller_name TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_merchant_seller_ts
  ON sales (merchant, seller_id, ts);
