-- Tarifs (listes de prix) : price_lists, item_prices, price_list_clients ;
-- le tarif appliqué sur chaque vente et chaque facture.
CREATE TABLE IF NOT EXISTS price_lists (
  merchant        TEXT NOT NULL,
  id              TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_main         INTEGER NOT NULL DEFAULT 0,
  channels        TEXT NOT NULL DEFAULT '[]',
  sites           TEXT NOT NULL DEFAULT '[]',
  archived        INTEGER NOT NULL DEFAULT 0,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_ts      INTEGER NOT NULL,
  updated_ts      INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE TABLE IF NOT EXISTS item_prices (
  merchant     TEXT NOT NULL,
  list_id      TEXT NOT NULL,
  item_key     TEXT NOT NULL,
  variant_key  TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL,
  free         INTEGER NOT NULL DEFAULT 0,   -- 1 : offert exprès par le patron (seul cas d'un prix à 0)
  updated_ts   INTEGER NOT NULL,
  PRIMARY KEY (merchant, list_id, item_key, variant_key),
  CHECK (price_cents > 0 OR free = 1)
);

CREATE TABLE IF NOT EXISTS price_list_clients (
  merchant    TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  list_id     TEXT NOT NULL,
  updated_ts  INTEGER NOT NULL,
  PRIMARY KEY (merchant, client_id)
);

ALTER TABLE sales ADD COLUMN price_list_id TEXT;

ALTER TABLE invoice_docs ADD COLUMN price_list_id TEXT;

CREATE INDEX IF NOT EXISTS idx_item_prices_item ON item_prices (merchant, item_key);

CREATE INDEX IF NOT EXISTS idx_price_list_clients_list ON price_list_clients (merchant, list_id);

