-- Kiwi Tickets · failed-test notes and optional follow-up images.
-- Apply once to an existing database. Fresh databases use schema.sql.

CREATE TABLE IF NOT EXISTS kiwi_ticket_followups (
  id         TEXT PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES kiwi_tickets(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kiwi_ticket_followups_ticket
  ON kiwi_ticket_followups (ticket_id, created_ts);

ALTER TABLE kiwi_ticket_images ADD COLUMN followup_id TEXT;

PRAGMA optimize;
