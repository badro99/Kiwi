-- Relational store for hotel reservations and forward availability.
-- Supplements the bounded operational document cache in store_docs (feature='reservations').
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

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_room_dates
  ON hotel_reservations (merchant, room_id, status, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_dates
  ON hotel_reservations (merchant, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_lookup
  ON hotel_reservations (merchant, status, check_in, check_out);
