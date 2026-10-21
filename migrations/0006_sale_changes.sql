-- Atomic invalidations for every sales mutation, including rowid reuse.
CREATE TABLE IF NOT EXISTS sale_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant TEXT NOT NULL,
  sale_rowid INTEGER NOT NULL,
  sale_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_sale_changes_merchant_seq ON sale_changes (merchant, seq);

CREATE TRIGGER IF NOT EXISTS sales_change_log AFTER UPDATE ON sales BEGIN
  INSERT INTO sale_changes (merchant, sale_rowid, sale_id)
    SELECT OLD.merchant, OLD.rowid, OLD.id
    WHERE OLD.merchant IS NOT NEW.merchant OR OLD.rowid IS NOT NEW.rowid OR OLD.id IS NOT NEW.id;
  INSERT INTO sale_changes (merchant, sale_rowid, sale_id) VALUES (NEW.merchant, NEW.rowid, NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS sales_change_insert AFTER INSERT ON sales BEGIN
  INSERT INTO sale_changes (merchant, sale_rowid, sale_id) VALUES (NEW.merchant, NEW.rowid, NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS sales_change_delete AFTER DELETE ON sales BEGIN
  INSERT INTO sale_changes (merchant, sale_rowid, sale_id) VALUES (OLD.merchant, OLD.rowid, OLD.id);
END;
