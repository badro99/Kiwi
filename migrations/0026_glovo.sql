-- 0026 · Glovo Partners API : le store_id de chaque adresse de magasin, et le
-- lien commande Glovo ↔ ticket Kiwi. Lu par functions/api/channel/glovo/. Sans ces
-- tables le webhook Glovo répond 404 et rien d'autre ne change : à appliquer par le
-- propriétaire.
CREATE TABLE IF NOT EXISTS glovo_stores (
  store_id     TEXT PRIMARY KEY,   -- l'« external id » de l'adresse chez Glovo
  merchant     TEXT NOT NULL,      -- slugMerchant
  prep_minutes INTEGER NOT NULL DEFAULT 15,  -- heure promise à l'acceptation
  status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused'
  created_ts   INTEGER NOT NULL,
  updated_ts   INTEGER NOT NULL,
  last_ts      INTEGER,            -- dernière commande reçue
  last_err     TEXT                -- dernier refus, lisible sans les logs
);

CREATE TABLE IF NOT EXISTS glovo_orders (
  order_id      TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL,
  merchant      TEXT NOT NULL,
  kiwi_order_id TEXT NOT NULL,     -- orders.id
  order_code    TEXT,
  pickup        INTEGER NOT NULL DEFAULT 0,  -- 1 = le client vient chercher
  created_ts    INTEGER NOT NULL,
  cancelled_ts  INTEGER,
  cancel_reason TEXT,
  last_call     TEXT,              -- 'accept' | 'ready_for_pickup' | 'customer_picked_up'
  last_call_ts  INTEGER,
  last_call_err TEXT
);

CREATE INDEX IF NOT EXISTS idx_glovo_stores_merchant ON glovo_stores (merchant);

CREATE INDEX IF NOT EXISTS idx_glovo_orders_kiwi ON glovo_orders (kiwi_order_id);

