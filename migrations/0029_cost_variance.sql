-- Coût théorique et réel (functions/api/cost-variance.js) : les sommes du
-- registre de stock portent sur une période d'un magasin.
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_time ON inventory_movements (merchant, occurred_ts);

-- Valeur du stock sans relire l'historique : un cache recalculable.
CREATE TABLE IF NOT EXISTS cost_stock_snapshots (
  merchant   TEXT PRIMARY KEY,
  cursor     INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  updated_ts INTEGER NOT NULL
);

-- Le seuil de marge minimum fixé par le propriétaire.
CREATE TABLE IF NOT EXISTS cost_targets (
  merchant       TEXT PRIMARY KEY,
  min_margin_pct REAL NOT NULL,
  updated_ts     INTEGER NOT NULL,
  updated_by     TEXT NOT NULL DEFAULT ''
);
