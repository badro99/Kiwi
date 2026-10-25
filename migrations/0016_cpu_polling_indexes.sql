-- Bound hot polling probes to matching ranges, rather than merchant history.
CREATE INDEX IF NOT EXISTS idx_print_jobs_recent ON print_jobs (merchant, created_ts);
CREATE INDEX IF NOT EXISTS idx_print_jobs_expiry ON print_jobs (merchant, status, expires_ts);
CREATE INDEX IF NOT EXISTS idx_print_jobs_claimed ON print_jobs (merchant, status, claimed_ts);
CREATE INDEX IF NOT EXISTS idx_sales_linked_refunds ON sales (merchant, id)
  WHERE void_ts IS NULL AND COALESCE(amount_cents, amount * 100) < 0;
CREATE INDEX IF NOT EXISTS idx_sale_audit_refund_note ON sale_audit (merchant, note, sale_id)
  WHERE action = 'refund';
