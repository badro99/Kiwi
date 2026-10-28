import { balanceOf, displayStatus } from './_documents.js';
// Register-wide figures, independent of list filters and loaded pages.
export async function registerSummary(ctx, today) {
  const rows = await ctx.db.prepare(`SELECT d.id, d.type, d.status, d.number, d.due_date, d.valid_until, d.ttc_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.merchant=d.merchant AND p.doc_id=d.id),0) paid,
    COALESCE((SELECT SUM(c.ttc_cents) FROM invoice_docs c WHERE c.merchant=d.merchant AND c.original_id=d.id AND c.type='credit_note' AND c.number IS NOT NULL),0) credited
    FROM invoice_docs d WHERE d.merchant=?`).bind(ctx.merchant).all();
  const s = {outstanding:0, late:0, paidMonth:0, waiting:0, lateCount:0, total:rows.results.length};
  for (const r of rows.results) {
    const status = displayStatus(r, r.paid, r.credited, today);
    if (r.type !== 'invoice' || !['issued','partial','overdue'].includes(status)) continue;
    const balance = balanceOf(r, r.paid, r.credited);
    s.outstanding += balance; s.waiting++;
    if (status === 'overdue') { s.late += balance; s.lateCount++; }
  }
  const paid = await ctx.db.prepare("SELECT COALESCE(SUM(amount_cents),0) amount FROM invoice_payments WHERE merchant=? AND substr(date,1,7)=?").bind(ctx.merchant, today.slice(0,7)).first();
  s.paidMonth = Number(paid.amount);
  const sales = await ctx.db.prepare('SELECT COUNT(*) n FROM sale_invoices WHERE merchant=?').bind(ctx.merchant).first();
  s.total += Number(sales.n);
  return s;
}
