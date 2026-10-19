-- Migration: Add amount_cents to sales and sale_audit tables for centime precision
-- Authoritative when present; legacy rows fall back to COALESCE(amount_cents, amount * 100)
--
-- APPLIED TO PROD (kiwi-sales) 2026-08-17. Verified after: 830 rows, all with
-- amount_cents NULL, and SUM(amount) == SUM(COALESCE(amount_cents, amount*100))/100
-- == 373711 MAD, so every legacy row reads back through the new path unchanged.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS, so a second run fails
-- with "duplicate column name: amount_cents". That error is safe to ignore — it
-- means the column is already there. Check first rather than re-running blind:
--   SELECT name FROM pragma_table_info('sales') WHERE name = 'amount_cents';

ALTER TABLE sales ADD COLUMN amount_cents INTEGER;
ALTER TABLE sale_audit ADD COLUMN amount_cents INTEGER;
