-- Migration: Add amount_cents to sales and sale_audit tables for centime precision
-- Authoritative when present; legacy rows fall back to COALESCE(amount_cents, amount * 100)

ALTER TABLE sales ADD COLUMN amount_cents INTEGER;
ALTER TABLE sale_audit ADD COLUMN amount_cents INTEGER;
