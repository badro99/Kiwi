-- 0025 · palier de la session (owner | manager | reception), par appareil.
-- Lu par functions/auth/_session-tier.js. Sans cette table la prod garde le
-- comportement d'avant (palier patron) : à appliquer par le propriétaire.

CREATE TABLE IF NOT EXISTS session_tiers (
  sid        TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  tier       TEXT NOT NULL,
  staff_id   TEXT,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_tiers_updated ON session_tiers (updated_ts);

