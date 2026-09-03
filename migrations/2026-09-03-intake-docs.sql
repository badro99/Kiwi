-- Migration: registre du guichet unique documentaire (slice 1 : factures PDF).
-- L'empreinte SHA-256 est l'identifiant : un re-dépôt converge vers la même
-- ligne (INSERT OR IGNORE côté route). Les octets vivent en R2, jamais en D1.
CREATE TABLE IF NOT EXISTS intake_docs (
  merchant   TEXT    NOT NULL,
  doc_id     TEXT    NOT NULL,
  mime       TEXT    NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  r2_key     TEXT    NOT NULL DEFAULT '',
  has_object INTEGER NOT NULL DEFAULT 0,
  status     TEXT    NOT NULL DEFAULT 'received',
  doc_type   TEXT    NOT NULL DEFAULT '',
  source     TEXT    NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_docs_status ON intake_docs (merchant, status);
