-- Auth audit remediation: invalidate account sessions after password recovery.
-- Existing rows start at zero so old signed tokens remain compatible until a
-- password reset changes the revision. Apply before deploying the code that
-- reads/writes session_epoch; no existing merchant data is rewritten.
ALTER TABLE accounts ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;

-- Durable employee credential/access revisions. The PIN itself is never stored
-- here; pin_digest lets concurrent writers distinguish a profile edit from a
-- credential change while the revision increment remains SQLite-atomic.
CREATE TABLE IF NOT EXISTS employee_auth_versions (
  merchant     TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0,
  pin_digest   TEXT NOT NULL,
  updated_ts   INTEGER NOT NULL,
  PRIMARY KEY (merchant, member_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_auth_versions_merchant
  ON employee_auth_versions(merchant);
