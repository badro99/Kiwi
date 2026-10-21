-- Optional index for paginated void reads; correctness does not depend on it.

CREATE INDEX IF NOT EXISTS idx_sales_merchant_void_ts ON sales (merchant, void_ts) WHERE void_ts >= 0;

