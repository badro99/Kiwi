-- Annuaire Kiwi (9 nov 2026) : fiches publiques modérées et fiches premium des
-- clients Kiwi, plus la file des signalements. Additive ; tant qu'elle n'est pas
-- appliquée, les pages de l'annuaire s'affichent vides (jamais en 500).
CREATE TABLE IF NOT EXISTS directory_listings (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL DEFAULT 'public',
  merchant      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  name          TEXT NOT NULL,
  trade         TEXT NOT NULL,
  city          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  show_phone    INTEGER NOT NULL DEFAULT 0,
  whatsapp      INTEGER NOT NULL DEFAULT 0,
  contact_name  TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  dedupe_key    TEXT NOT NULL DEFAULT '',
  lang          TEXT NOT NULL DEFAULT '',
  created_ts    INTEGER NOT NULL,
  updated_ts    INTEGER NOT NULL,
  reviewed_ts   INTEGER NOT NULL DEFAULT 0,
  reviewed_by   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS directory_requests (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  contact     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_ts  INTEGER NOT NULL,
  updated_ts  INTEGER NOT NULL DEFAULT 0,
  handled_by  TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_merchant ON directory_listings(merchant) WHERE merchant IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_directory_place ON directory_listings(status, city, trade);

CREATE INDEX IF NOT EXISTS idx_directory_dedupe ON directory_listings(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_directory_requests_open ON directory_requests(status, created_ts);

