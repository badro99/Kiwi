ALTER TABLE merchant_config ADD COLUMN test_account INTEGER NOT NULL DEFAULT 0 CHECK (test_account IN (0, 1));
ALTER TABLE merchant_config ADD COLUMN poll_checked_ts INTEGER;
ALTER TABLE merchant_config ADD COLUMN poll_mode TEXT;
UPDATE merchant_config SET test_account = 1 WHERE merchant IN ('amira-cafe', 'amira-boutique', 'art-de-table-by-amira', 'pressing-amira');
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_activity ON hotel_reservations (merchant, updated_ts);
