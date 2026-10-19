-- Append-only, non-guest room-charge audit. Applying this migration to
-- production is an explicit owner operation; handlers never create it lazily.
CREATE TABLE IF NOT EXISTS hotel_room_charge_events (
  merchant TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  occurred_ts INTEGER NOT NULL,
  reversal_of TEXT NOT NULL DEFAULT '',
  reversed_by_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, id),
  UNIQUE (merchant, sale_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_hotel_room_charge_shift
  ON hotel_room_charge_events (merchant, shift_id, occurred_ts);
