-- Payroll: advances per staff member and period, and the immutable archive of
-- numbered pay statements (RP-YYYY-NNNN, one series per merchant and calendar year).
-- functions/api/pay-statements.js. Applied to prod by the owner (docs/ops/MIGRATIONS.md).

CREATE TABLE IF NOT EXISTS pay_advances (
  merchant TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  member_id TEXT NOT NULL,
  advance_cents INTEGER NOT NULL DEFAULT 0,
  updated_ts INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, period_start, period_end, member_id)
);

CREATE TABLE IF NOT EXISTS pay_statements (
  id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  year INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  number TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL DEFAULT '',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_cents INTEGER NOT NULL,
  advance_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL,
  rated INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT NOT NULL,
  replaces_id TEXT,
  issued_ts INTEGER NOT NULL,
  issued_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pay_statements_seq ON pay_statements (merchant, year, seq);

CREATE UNIQUE INDEX IF NOT EXISTS pay_statements_number ON pay_statements (merchant, number);

CREATE UNIQUE INDEX IF NOT EXISTS pay_statements_replaces ON pay_statements (merchant, replaces_id) WHERE replaces_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pay_statements_period ON pay_statements (merchant, period_start, period_end);

-- A statement is a document: it is never edited or deleted, a correction is a new one.
CREATE TRIGGER IF NOT EXISTS pay_statements_no_update BEFORE UPDATE ON pay_statements BEGIN
  SELECT RAISE(ABORT, 'pay-statement-immutable');
END;

CREATE TRIGGER IF NOT EXISTS pay_statements_no_delete BEFORE DELETE ON pay_statements BEGIN
  SELECT RAISE(ABORT, 'pay-statement-immutable');
END;
