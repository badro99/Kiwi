-- Tenant guard: document history and refused cross-store copies.
-- Same statements as schema.sql; idempotent.
CREATE TABLE IF NOT EXISTS doc_history (merchant TEXT NOT NULL, kind TEXT NOT NULL, feature TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL, saved_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_doc_history ON doc_history(merchant, kind, feature, saved_ts);
CREATE TABLE IF NOT EXISTS tenant_guard_events (ts INTEGER NOT NULL, merchant TEXT NOT NULL, feature TEXT NOT NULL, source_merchant TEXT NOT NULL, kind TEXT NOT NULL, matched INTEGER NOT NULL, sampled INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tenant_guard_ts ON tenant_guard_events(ts);
