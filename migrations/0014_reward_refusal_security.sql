-- destructive: approved by owner 2026-10-24, requested composite-key rebuild; all history is preserved.
-- 0013/0014 reserved for concurrent branches. Preserve valid existing history.
ALTER TABLE client_reward_refusals RENAME TO client_reward_refusals_old;
CREATE TABLE client_reward_refusals (
  merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
  error TEXT NOT NULL, created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, client_id, ref)
);
INSERT OR IGNORE INTO client_reward_refusals SELECT * FROM client_reward_refusals_old;
DROP TABLE client_reward_refusals_old;
CREATE INDEX client_reward_refusals_day ON client_reward_refusals (merchant, created_ts);
