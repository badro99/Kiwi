-- Index for reading one store's sales over a date window
-- (/api/sales-summary, and /api/feed?from= used by the till's day views).
-- Read-only speed-up: no data changes. Safe to apply at any time.
CREATE INDEX IF NOT EXISTS idx_sales_merchant_ts ON sales (merchant, ts);
