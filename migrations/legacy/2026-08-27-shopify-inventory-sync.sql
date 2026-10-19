CREATE TABLE IF NOT EXISTS shopify_connections (
  merchant TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL UNIQUE,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_expires_ts INTEGER NOT NULL DEFAULT 0,
  refresh_expires_ts INTEGER NOT NULL DEFAULT 0,
  scopes TEXT NOT NULL DEFAULT '',
  location_id TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  channel_link_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'needs_location',
  connected_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  last_sync_ts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_shop ON shopify_connections (shop_domain, status);

CREATE TABLE IF NOT EXISTS shopify_oauth_states (
  state_hash TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_expiry ON shopify_oauth_states (expires_ts);

CREATE TABLE IF NOT EXISTS shopify_variant_links (
  merchant TEXT NOT NULL,
  kiwi_variant_id TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  last_shopify_quantity INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, kiwi_variant_id),
  UNIQUE (merchant, shopify_variant_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_variant_links_inventory ON shopify_variant_links (merchant, inventory_item_id, location_id);

CREATE TABLE IF NOT EXISTS shopify_sync_outbox (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  kiwi_variant_id TEXT NOT NULL,
  target_quantity INTEGER NOT NULL,
  source_rev INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_ts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  UNIQUE (merchant, kiwi_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_outbox_ready ON shopify_sync_outbox (status, next_attempt_ts, updated_ts);

CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  shop_domain TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  received_ts INTEGER NOT NULL,
  PRIMARY KEY (shop_domain, webhook_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_received ON shopify_webhook_events (received_ts);
