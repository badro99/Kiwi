-- destructive: approved by owner 2026-10-24
-- Wave D explicitly authorizes annual numbering and its schema migration.
-- Constraint rebuild only: INSERT SELECT preserves all rows before DROP.
-- Annual invoice series. Preserve every historical number and sale link.

CREATE TABLE sale_invoices_annual (
  merchant   TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  number     TEXT NOT NULL,
  sale_id    TEXT NOT NULL,
  customer   TEXT,
  snapshot   TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sale_id),
  UNIQUE (merchant, number)
);

INSERT INTO sale_invoices_annual SELECT * FROM sale_invoices;

DROP TABLE sale_invoices;

ALTER TABLE sale_invoices_annual RENAME TO sale_invoices;

CREATE TABLE invoice_series_annual (
  merchant   TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  number     TEXT NOT NULL,
  doc_ref    TEXT,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, prefix, number)
);

INSERT INTO invoice_series_annual SELECT * FROM invoice_series;

DROP TABLE invoice_series;

ALTER TABLE invoice_series_annual RENAME TO invoice_series;

CREATE INDEX idx_sale_invoices_merchant_seq ON sale_invoices (merchant, seq);
