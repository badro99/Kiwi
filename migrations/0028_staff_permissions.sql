-- 0028 · droits de l'équipe par personne (rôle + surcharges), leur activation
-- et leur journal. Lu par functions/api/_permissions.js.
-- Le minimum de production (functions/_schema-version.js) reste 0027 : le code
-- se déploie AVANT cette migration. Tant qu'elle n'est pas appliquée, une table
-- absente vaut « droits non activés » et chaque route garde sa règle d'avant
-- (aucun 503) ; l'écran des droits dit au propriétaire qu'elle manque. Rien ne
-- change non plus après l'avoir appliquée, tant que le propriétaire n'a pas
-- activé les droits depuis l'écran (staff_permission_settings.activated_ts).

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
  activated_ts       INTEGER NOT NULL DEFAULT 0,
  activated_by       TEXT NOT NULL DEFAULT '',
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

