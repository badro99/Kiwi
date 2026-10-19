-- External order idempotency: provider retries must resolve to one Kiwi order.
--
-- Before applying this migration to an existing database, verify that the
-- tuple below has no duplicates. The deployment tool performs this check and
-- refuses to create the index if reconciliation is required.
--
-- SELECT merchant, channel, ext_ref, COUNT(*) AS n
--   FROM orders
--  WHERE ext_ref IS NOT NULL AND ext_ref <> ''
--  GROUP BY merchant, channel, ext_ref
-- HAVING n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS orders_ext_ref
  ON orders (merchant, channel, ext_ref)
  WHERE ext_ref IS NOT NULL AND ext_ref <> '';
