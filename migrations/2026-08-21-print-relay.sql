-- Relais d'impression Kiwi — une caisse sur iPad (ou tout appareil sans pont
-- local) dépose ses tickets ESC/POS ici ; le Kiwi Printer Bridge du comptoir
-- vient les chercher (sortant uniquement) et les pousse à l'imprimante réseau.
-- Additif, idempotent. Appliqué en prod le 2026-08-21.

CREATE TABLE IF NOT EXISTS print_bridges (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  name         TEXT,
  platform     TEXT,
  version      TEXT,
  token_hash   TEXT NOT NULL UNIQUE,   -- sha256 du jeton porteur, jamais le jeton
  created_ts   INTEGER NOT NULL,
  last_seen_ts INTEGER,
  revoked_ts   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_print_bridges_merchant ON print_bridges (merchant, revoked_ts);

CREATE TABLE IF NOT EXISTS print_bridge_codes (
  code       TEXT NOT NULL,
  merchant   TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_bridge_codes_live ON print_bridge_codes (code) WHERE used_ts IS NULL;

CREATE TABLE IF NOT EXISTS print_jobs (
  id         TEXT PRIMARY KEY,
  merchant   TEXT NOT NULL,
  bridge_id  TEXT,                       -- NULL = n'importe quel pont du commerce
  kind       TEXT,                       -- receipt · kitchen · label · test · drawer
  target     TEXT NOT NULL,              -- JSON {ip,port} | {osPrinter}
  data_b64   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued · claimed · done · failed · expired
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  claimed_ts INTEGER,
  done_ts    INTEGER,
  bytes      INTEGER,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs (merchant, status, created_ts);
