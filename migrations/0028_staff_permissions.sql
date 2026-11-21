-- 0028 · droits de l'équipe par personne (rôle + surcharges) et leur journal.
-- Lu par functions/api/_permissions.js. Sans ces tables la prod garde le
-- comportement d'avant (droits par rôle) : à appliquer par le propriétaire.

CREATE TABLE IF NOT EXISTS staff_permissions (
  merchant   TEXT NOT NULL,
  staff_key  TEXT NOT NULL,
  preset     TEXT NOT NULL,
  grants     TEXT NOT NULL DEFAULT '[]',
  denies     TEXT NOT NULL DEFAULT '[]',
  name       TEXT NOT NULL DEFAULT '',
  updated_ts INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, staff_key)
);

CREATE TABLE IF NOT EXISTS staff_permission_presets (
  merchant   TEXT NOT NULL,
  preset     TEXT NOT NULL,
  perms      TEXT NOT NULL DEFAULT '[]',
  updated_ts INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, preset)
);

CREATE TABLE IF NOT EXISTS staff_permission_settings (
  merchant           TEXT PRIMARY KEY,
  free_discount_pct  INTEGER NOT NULL DEFAULT 10,
  legacy_doc         TEXT,
  legacy_imported_ts INTEGER,
  updated_ts         INTEGER NOT NULL,
  updated_by         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS staff_permission_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant      TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  actor         TEXT NOT NULL,
  actor_label   TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL,
  subject_label TEXT NOT NULL DEFAULT '',
  change        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_permission_audit ON staff_permission_audit (merchant, ts);

