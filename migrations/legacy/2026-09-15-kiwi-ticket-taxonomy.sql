-- Kiwi Tickets · type, area, sub-kind and money-risk classification.

ALTER TABLE kiwi_tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'unsorted';
ALTER TABLE kiwi_tickets ADD COLUMN area TEXT;
ALTER TABLE kiwi_tickets ADD COLUMN subkind TEXT;
ALTER TABLE kiwi_tickets ADD COLUMN money_at_risk INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_kiwi_tickets_filters
  ON kiwi_tickets (status, money_at_risk DESC, kind, area, id DESC);

PRAGMA optimize;
