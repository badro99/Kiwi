-- Link each room charge to the server-resolved active stay. No guest identity
-- is copied into this audit ledger; billing joins by the immutable stay id.
ALTER TABLE hotel_room_charge_events ADD COLUMN stay_id TEXT NOT NULL DEFAULT '';
ALTER TABLE hotel_room_charge_events ADD COLUMN room_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_hotel_room_charge_stay
  ON hotel_room_charge_events (merchant, stay_id, occurred_ts);
