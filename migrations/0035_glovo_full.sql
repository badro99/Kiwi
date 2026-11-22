-- 0029 · Glovo, l'intégration complète : Marketplace (le magasin livre),
-- fermeture temporaire, envoi du menu et mises à jour en lot (dispo, prix)
-- suivies par transaction, le dernier refus de l'API, la limite de 120 appels
-- par minute et par adresse, et le cycle d'une commande (retirée par le
-- coursier, partie, livrée, heure de retrait ajustée). Colonnes nullables ou à
-- défaut : sans 0029, le connecteur de 0026 continue seul ; les routes
-- nouvelles répondent 503 migration-needed.
CREATE TABLE IF NOT EXISTS glovo_menu_state (
  store_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  available   INTEGER NOT NULL,
  updated_ts  INTEGER NOT NULL,
  PRIMARY KEY (store_id, kind, item_id)
);

CREATE TABLE IF NOT EXISTS glovo_rate (
  store_id TEXT NOT NULL,
  minute   INTEGER NOT NULL,       -- floor(ms / 60000)
  n        INTEGER NOT NULL,
  PRIMARY KEY (store_id, minute)
);

ALTER TABLE glovo_stores ADD COLUMN marketplace INTEGER NOT NULL DEFAULT 0;

ALTER TABLE glovo_stores ADD COLUMN closing_until TEXT;

ALTER TABLE glovo_stores ADD COLUMN closing_ts INTEGER;

ALTER TABLE glovo_stores ADD COLUMN menu_tx TEXT;

ALTER TABLE glovo_stores ADD COLUMN menu_status TEXT;

ALTER TABLE glovo_stores ADD COLUMN menu_ts INTEGER;

ALTER TABLE glovo_stores ADD COLUMN menu_detail TEXT;

ALTER TABLE glovo_stores ADD COLUMN menu_day TEXT;

ALTER TABLE glovo_stores ADD COLUMN menu_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE glovo_stores ADD COLUMN bulk_tx TEXT;

ALTER TABLE glovo_stores ADD COLUMN bulk_status TEXT;

ALTER TABLE glovo_stores ADD COLUMN bulk_ts INTEGER;

ALTER TABLE glovo_stores ADD COLUMN bulk_detail TEXT;

ALTER TABLE glovo_stores ADD COLUMN api_err TEXT;

ALTER TABLE glovo_stores ADD COLUMN api_err_ts INTEGER;

ALTER TABLE glovo_orders ADD COLUMN picked_up_ts INTEGER;

ALTER TABLE glovo_orders ADD COLUMN out_ts INTEGER;

ALTER TABLE glovo_orders ADD COLUMN delivered_ts INTEGER;

ALTER TABLE glovo_orders ADD COLUMN pickup_at TEXT;

CREATE INDEX IF NOT EXISTS idx_glovo_orders_merchant ON glovo_orders (merchant, created_ts);

