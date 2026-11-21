-- Coût théorique et réel (functions/api/cost-variance.js) : les sommes du
-- registre de stock portent sur une période d'un magasin.
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_time ON inventory_movements (merchant, occurred_ts);
