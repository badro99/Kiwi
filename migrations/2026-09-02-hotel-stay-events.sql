-- Append-only, non-PII hotel stay history. Production application remains an
-- explicit owner operation after the Sprint 1 shadow-write review.
CREATE TABLE IF NOT EXISTS hotel_stay_events (
  merchant      TEXT NOT NULL,
  id            TEXT NOT NULL,
  stay_id       TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  occurred_ts   INTEGER NOT NULL,
  srv_cursor    INTEGER NOT NULL,
  event_ordinal INTEGER NOT NULL DEFAULT 0,
  actor_id      TEXT NOT NULL,
  actor_role    TEXT NOT NULL,
  PRIMARY KEY (merchant, id),
  UNIQUE (merchant, srv_cursor, event_ordinal)
);
CREATE INDEX IF NOT EXISTS idx_hotel_stay_events_stay
  ON hotel_stay_events (merchant, stay_id, srv_cursor);
