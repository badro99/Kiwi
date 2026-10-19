-- 0002 · combler l'écart : ce que schema.sql déclarait et que la production
-- n'avait pas le 2026-10-19 (relevé en lecture seule sur sqlite_master).
--
-- 14 tables, 6 colonnes, et leurs index. Tout est ADDITIF : aucune ligne n'est
-- réécrite ni effacée. Les tables ci-dessous sont aussi créées à l'exécution par
-- leur route (foodcost.js, _oauth.js, intake.js, …) : IF NOT EXISTS les laisse
-- intactes si la route est passée avant.
--
-- Les ALTER, eux, n'ont pas de IF NOT EXISTS en SQLite. push_tokens.lang est
-- posée à l'exécution par functions/api/push/register.js : si elle existe déjà
-- au moment d'appliquer, wrangler s'arrête sur « duplicate column » sans rien
-- avoir appliqué de ce fichier. Lancer `node tools/d1-schema.mjs` juste avant ;
-- la marche à suivre est dans docs/ops/MIGRATIONS.md.
CREATE TABLE IF NOT EXISTS accountant_access (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  label        TEXT,
  email        TEXT,
  token_hash   TEXT NOT NULL UNIQUE,
  created_ts   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,      -- accounts.id, ou 'op:<operators.id>'
  last_seen_ts INTEGER,
  revoked_ts   INTEGER,
  expires_ts   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hotel_reservations (
  merchant        TEXT NOT NULL,
  id              TEXT NOT NULL,
  code            TEXT NOT NULL,
  room_id         TEXT NOT NULL,
  room_type_id    TEXT NOT NULL,
  start_at        INTEGER NOT NULL,
  end_at          INTEGER NOT NULL,
  check_in        TEXT NOT NULL,
  check_out       TEXT NOT NULL,
  status          TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'direct',
  external_ref    TEXT NOT NULL DEFAULT '',
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT NOT NULL DEFAULT '',
  customer_email  TEXT NOT NULL DEFAULT '',
  party_size      INTEGER NOT NULL DEFAULT 1,
  rate            INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  raw_json        TEXT NOT NULL,
  created_ts      INTEGER NOT NULL,
  updated_ts      INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);

CREATE TABLE IF NOT EXISTS invoice_series (
  merchant   TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  number     TEXT NOT NULL,
  doc_ref    TEXT,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, prefix, seq)
);

CREATE TABLE IF NOT EXISTS invoice_docs (
  id                TEXT PRIMARY KEY,
  merchant          TEXT NOT NULL,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL,
  number            TEXT,
  seq               INTEGER,
  issue_date        TEXT,
  due_date          TEXT,
  terms_days        INTEGER,
  valid_until       TEXT,
  customer          TEXT NOT NULL,
  seller            TEXT,
  lines             TEXT NOT NULL,
  totals            TEXT NOT NULL,
  ttc_cents         INTEGER NOT NULL DEFAULT 0,
  payment_method    TEXT,
  note              TEXT,
  exemption_mention TEXT,
  internal_note     TEXT,
  original_id       TEXT,
  source_quote_id   TEXT,
  reason            TEXT,
  created_ts        INTEGER NOT NULL,
  updated_ts        INTEGER NOT NULL,
  issued_ts         INTEGER,
  sent_ts           INTEGER,
  cancelled_ts      INTEGER,
  created_by        TEXT,
  legacy_ref        TEXT
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  doc_id       TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  date         TEXT,
  method       TEXT,
  reference    TEXT,
  created_ts   INTEGER NOT NULL,
  created_by   TEXT
);

CREATE TABLE IF NOT EXISTS order_following (
  order_id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  table_no TEXT,
  items TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  cleared_ts INTEGER
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  seq INTEGER NOT NULL,
  number TEXT NOT NULL,
  supplier TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MAD',
  expected_date TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL DEFAULT 0,
  invoiced_cents INTEGER NOT NULL DEFAULT 0,
  command_id TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  number TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  sku TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  variant_id TEXT NOT NULL DEFAULT '',
  location_id TEXT NOT NULL DEFAULT 'principal',
  unit TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL,
  unit_cents INTEGER NOT NULL,
  received_qty INTEGER NOT NULL DEFAULT 0,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_morning_sent (
  merchant TEXT NOT NULL,
  day      TEXT NOT NULL,        -- journée commerciale notifiée, AAAA-MM-JJ
  sent_ts  INTEGER NOT NULL,
  PRIMARY KEY (merchant, day)
);

CREATE TABLE IF NOT EXISTS intake_docs (
  merchant   TEXT    NOT NULL,             -- slugMerchant (tenantFor strict)
  doc_id     TEXT    NOT NULL,             -- SHA-256 hex des octets déposés
  mime       TEXT    NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,   -- octets annoncés au commit, vérifiés à l'upload
  r2_key     TEXT    NOT NULL DEFAULT '',
  has_object INTEGER NOT NULL DEFAULT 0,   -- 1 une fois l'objet R2 écrit et vérifié
  status     TEXT    NOT NULL DEFAULT 'received', -- received | confirmed
  doc_type   TEXT    NOT NULL DEFAULT '',  -- supplier_invoice (V1)
  source     TEXT    NOT NULL DEFAULT '',  -- ex. stock-scan
  posting_hash TEXT  NOT NULL DEFAULT '',  -- SHA-256 du brouillon relu ; jamais son contenu
  posting_count INTEGER NOT NULL DEFAULT 0, -- nb de mouvements requis avant confirmed
  created_ts INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, doc_id)
);

CREATE TABLE IF NOT EXISTS agent_oauth_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,      -- JSON array, https or loopback http only
  created_ts INTEGER NOT NULL,
  last_used_ts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_oauth_codes (
  code_hash TEXT PRIMARY KEY,       -- sha-256 of the code; the code itself is never stored
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  merchant TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_epoch INTEGER NOT NULL,
  scopes TEXT NOT NULL,
  challenge TEXT NOT NULL,          -- PKCE S256 challenge
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts INTEGER
);

CREATE TABLE IF NOT EXISTS foodcost_sheets (
  merchant TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sheet', data TEXT NOT NULL,
  version INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, id)
);

CREATE TABLE IF NOT EXISTS foodcost_snapshots (
  merchant TEXT NOT NULL, sheet_id TEXT NOT NULL, version INTEGER NOT NULL,
  name TEXT NOT NULL, data TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '',
  actor_kind TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sheet_id, version)
);

ALTER TABLE hotel_internal_request_lines ADD COLUMN substitute_unit TEXT NOT NULL DEFAULT '';

ALTER TABLE hotel_internal_request_lines ADD COLUMN substitute_conversion_snapshot TEXT NOT NULL DEFAULT '{}';

ALTER TABLE hotel_internal_request_lines ADD COLUMN substitute_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE hotel_room_charge_events ADD COLUMN stay_id TEXT NOT NULL DEFAULT '';

ALTER TABLE hotel_room_charge_events ADD COLUMN room_id TEXT NOT NULL DEFAULT '';

ALTER TABLE push_tokens ADD COLUMN lang TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_accountant_access_merchant ON accountant_access (merchant, created_ts);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_room_dates ON hotel_reservations (merchant, room_id, status, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_dates ON hotel_reservations (merchant, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_lookup ON hotel_reservations (merchant, status, check_in, check_out);

CREATE INDEX IF NOT EXISTS idx_invoice_docs_merchant ON invoice_docs (merchant, type, issue_date);

CREATE INDEX IF NOT EXISTS idx_invoice_docs_original ON invoice_docs (merchant, original_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_docs_number ON invoice_docs (merchant, number) WHERE number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_docs_legacy ON invoice_docs (merchant, legacy_ref) WHERE legacy_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_doc ON invoice_payments (merchant, doc_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number ON purchase_orders (merchant, number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_seq ON purchase_orders (merchant, seq);

CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders (merchant, status, updated_ts DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_line_sku ON purchase_order_lines (merchant, number, sku);

CREATE INDEX IF NOT EXISTS idx_hotel_room_charge_stay ON hotel_room_charge_events (merchant, stay_id, occurred_ts);

CREATE INDEX IF NOT EXISTS idx_intake_docs_status ON intake_docs (merchant, status);

CREATE INDEX IF NOT EXISTS idx_foodcost_sheets_upd ON foodcost_sheets (merchant, updated_ts DESC);

