CREATE TABLE IF NOT EXISTS client_reward_refusals (
  merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
  error TEXT NOT NULL, created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, ref)
);
