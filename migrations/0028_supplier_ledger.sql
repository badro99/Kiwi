-- 0028 · Fournisseurs en D1 et grand livre d'argent signé (functions/api/_ledger.js).
-- Les fournisseurs du document `procurement` sont importés à la première
-- lecture (functions/api/_suppliers.js) ; purchase_orders.supplier_id relie un
-- bon à son fournisseur, la colonne texte reste pour l'histoire.
CREATE TABLE IF NOT EXISTS suppliers (
  merchant     TEXT NOT NULL,
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  ice          TEXT NOT NULL DEFAULT '',
  rib          TEXT NOT NULL DEFAULT '',
  bank         TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  terms_days   INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT '',
  created_ts   INTEGER NOT NULL,
  updated_ts   INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE TABLE IF NOT EXISTS money_ledger (
  id                TEXT PRIMARY KEY,
  merchant          TEXT NOT NULL,
  idem_key          TEXT NOT NULL,
  entry_date        TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
  direction         TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  party_type        TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier', 'cashbook')),
  party_id          TEXT NOT NULL DEFAULT '',
  kind              TEXT NOT NULL DEFAULT 'manual',
  method            TEXT NOT NULL DEFAULT 'other',
  note              TEXT NOT NULL DEFAULT '',
  attachment_ref    TEXT NOT NULL DEFAULT '',
  sale_id           TEXT,
  purchase_order_id TEXT,
  expense_id        TEXT,
  cheque_id         TEXT,
  archived          INTEGER NOT NULL DEFAULT 0,
  internal          INTEGER NOT NULL DEFAULT 0,
  -- 'posted' compte dans les soldes ; 'pending' attend l'accord du patron
  -- (réception de bon saisie par un employé), hors soldes jusque-là.
  status            TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'pending')),
  deleted_ts        INTEGER,
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_ledger_state (
  merchant         TEXT PRIMARY KEY,
  started_ts       INTEGER NOT NULL,
  procurement_rev  INTEGER NOT NULL DEFAULT 0,
  updated_ts       INTEGER NOT NULL
);

ALTER TABLE purchase_orders ADD COLUMN supplier_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (merchant, archived, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_money_ledger_idem ON money_ledger (merchant, idem_key);

CREATE INDEX IF NOT EXISTS idx_money_ledger_party ON money_ledger (merchant, party_type, party_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_money_ledger_po ON money_ledger (merchant, purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_money_ledger_expense ON money_ledger (merchant, expense_id);

