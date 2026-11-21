-- 0029 · Portefeuille de chèques et d'effets (LCN) : le papier, ce qu'il règle
-- (ventes, lignes du grand livre, bons) et son historique en ajout seul.
-- functions/api/_cheques.js. Création seule (IF NOT EXISTS) : rejouable.
CREATE TABLE IF NOT EXISTS cheques (
  merchant      TEXT NOT NULL,
  id            TEXT NOT NULL,
  idem_key      TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'cheque' CHECK (kind IN ('cheque', 'lcn')),
  direction     TEXT NOT NULL CHECK (direction IN ('received', 'issued')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  number        TEXT NOT NULL DEFAULT '',
  -- banque de remise (où le commerçant dépose ou d'où il paie) ; la banque
  -- tirée, imprimée sur le chèque, est drawer_bank.
  bank          TEXT NOT NULL DEFAULT '',
  drawer_name   TEXT NOT NULL DEFAULT '',
  drawer_bank   TEXT NOT NULL DEFAULT '',
  reception_date TEXT NOT NULL,
  due_date      TEXT,
  deposit_date  TEXT,
  settle_date   TEXT,
  deposit_slip  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('received', 'deposited', 'collected', 'rejected', 'in_litigation', 'replaced', 'cancelled', 'issued', 'debited')),
  party_type    TEXT NOT NULL DEFAULT '' CHECK (party_type IN ('', 'customer', 'supplier')),
  party_id      TEXT NOT NULL DEFAULT '',
  party_name    TEXT NOT NULL DEFAULT '',
  photo_ref     TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'dashboard',
  -- 1 tant qu'un rejet a remis la somme au compte du tiers sans qu'elle soit
  -- encore réglée (encaissement après représentation, autre moyen).
  debt_open     INTEGER NOT NULL DEFAULT 0,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE TABLE IF NOT EXISTS cheque_links (
  merchant      TEXT NOT NULL,
  cheque_id     TEXT NOT NULL,
  link_type     TEXT NOT NULL CHECK (link_type IN ('sale', 'ledger', 'purchase_order')),
  link_id       TEXT NOT NULL,
  amount_cents  INTEGER,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (merchant, cheque_id, link_type, link_id)
);

CREATE TABLE IF NOT EXISTS cheque_history (
  merchant        TEXT NOT NULL,
  id              TEXT NOT NULL,
  cheque_id       TEXT NOT NULL,
  request_id      TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('create', 'move', 'edit')),
  from_status     TEXT NOT NULL DEFAULT '',
  to_status       TEXT NOT NULL,
  event_date      TEXT NOT NULL,
  reason          TEXT NOT NULL DEFAULT '',
  detail          TEXT NOT NULL DEFAULT '',
  ledger_entry_id TEXT,
  actor           TEXT NOT NULL DEFAULT '',
  at              INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cheques_idem ON cheques (merchant, idem_key);

CREATE INDEX IF NOT EXISTS idx_cheques_status_due ON cheques (merchant, status, due_date);

CREATE INDEX IF NOT EXISTS idx_cheques_party ON cheques (merchant, party_type, party_id);

CREATE INDEX IF NOT EXISTS idx_cheques_slip ON cheques (merchant, deposit_slip);

CREATE INDEX IF NOT EXISTS idx_cheque_links_target ON cheque_links (merchant, link_type, link_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cheque_history_request ON cheque_history (merchant, request_id);

CREATE INDEX IF NOT EXISTS idx_cheque_history_cheque ON cheque_history (merchant, cheque_id, at);

