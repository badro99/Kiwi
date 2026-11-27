-- Cartes Wallet des clients (Apple, Google, web) : cartes, appareils, tickets réclamés, QR de caisse.
CREATE TABLE IF NOT EXISTS wallet_cards (
  serial TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  client_id TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  last_balance TEXT NOT NULL DEFAULT '',
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallet_devices (
  device_id TEXT NOT NULL,
  serial TEXT NOT NULL,
  push_token TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (device_id, serial)
);

CREATE TABLE IF NOT EXISTS wallet_claims (
  merchant TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  claimed_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sale_id)
);

CREATE TABLE IF NOT EXISTS wallet_tokens (
  token TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  client_id TEXT NOT NULL,
  expires_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_cards_client ON wallet_cards (merchant, client_id);

CREATE INDEX IF NOT EXISTS idx_wallet_devices_serial ON wallet_devices (serial);

