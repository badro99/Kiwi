/* Refunds store original basket quantities in their immutable audit impact.
   Amount-only partial refunds reverse each line pro-rata, never a whole basket. */
export async function enrichRecipeRefunds(env, merchant, rows, legacy = merchant) {
  const refunds = rows.filter(row => row.channel === 'refund' || Number(row.amount_cents ?? row.amountCents ?? Number(row.amount) * 100) < 0);
  for (let offset = 0; offset < refunds.length; offset += 75) {
    const batch = refunds.slice(offset, offset + 75);
    const result = await env.DB.prepare(`SELECT a.note AS refund_id, a.impact, s.lines AS original_lines FROM sale_audit a
      LEFT JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
      WHERE a.merchant IN (?, ?) AND a.action = 'refund' AND a.note IN (${batch.map(() => '?').join(',')})`)
      .bind(merchant, legacy || merchant, ...batch.map(row => row.id)).all();
    const impacts = new Map((result.results || []).map(row => [row.refund_id, row]));
    batch.forEach(row => {
      try {
        const audit = impacts.get(row.id);
        const impact = JSON.parse(audit.impact);
        const original = Number(impact.originalAmountCents);
        const returned = (impact.allocations || []).reduce((sum, part) => sum + Math.max(0, Number(part.amountCents) || 0), 0);
        if (!(original > 0) || !(returned > 0)) return;
        const ratio = Math.min(1, returned / original);
        const basket = audit.original_lines ? JSON.parse(audit.original_lines) : impact.lines;
        row.lines = (basket || []).map(line => ({
          itemId: line.i || line.itemId || '', name: line.n || line.name || '',
          qty: Math.max(0, Number(line.q ?? line.qty) || 0) * ratio,
        }));
      } catch (_) { /* An old audit without quantities cannot invent a basket. */ }
    });
  }
}
