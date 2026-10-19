-- Kiwi Tickets · durable problem workflow + temporary image metadata.
-- Apply to production once:
--   node tools/d1-schema.mjs --apply --yes

CREATE TABLE IF NOT EXISTS kiwi_tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status       TEXT NOT NULL DEFAULT 'problem'
               CHECK (status IN ('problem', 'testing', 'done')),
  created_ts   INTEGER NOT NULL,
  updated_ts   INTEGER NOT NULL,
  completed_ts INTEGER,
  expires_ts   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kiwi_tickets_status_expiry
  ON kiwi_tickets (status, expires_ts);

CREATE TABLE IF NOT EXISTS kiwi_ticket_images (
  id           TEXT PRIMARY KEY,
  ticket_id    INTEGER NOT NULL REFERENCES kiwi_tickets(id) ON DELETE CASCADE,
  object_key   TEXT NOT NULL UNIQUE,
  filename     TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL,
  byte_size    INTEGER NOT NULL DEFAULT 0,
  created_ts   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kiwi_ticket_images_ticket
  ON kiwi_ticket_images (ticket_id, created_ts);

PRAGMA optimize;
