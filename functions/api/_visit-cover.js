/* What a table visit's receipts actually paid for. Shared by the two places
 * that settle a visit: the payment itself (/api/sale) and the till's
 * "settled" close (/api/order/queue, closeSession + closedBy settle). Both
 * used to mark every order of the visit paid; a course that reached the
 * kitchen after the bill was printed left the table unpaid and looked paid
 * (Pasta Corner, 24 September: 202 MAD). */
/* Settles only what the visit's receipts paid for, when a later course is
 * left over. Returns { remainingCents } when the table must stay open, or
 * null to let the normal settlement run. Orders are taken oldest first and
 * the money must land exactly on one of their boundaries (to the centime):
 * a device's clock is not trusted to say which course came after the bill,
 * the amounts are. Any other shortfall settles as it always has. */
export async function settleCoveredOrders(env, merchant, sessionId, now) {
  try {
    const money = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(gross_amount_cents, amount_cents)), 0) AS paid FROM sales
        WHERE merchant = ? AND session_id = ? AND void_ts IS NULL`
    ).bind(merchant, sessionId).first();
    const rows = await env.DB.prepare(
      `SELECT id, CAST(ROUND(total * 100) AS INTEGER) AS cents FROM orders
        WHERE merchant = ? AND session_id = ? AND status <> 'rejected'
        ORDER BY created_ts, rowid`
    ).bind(merchant, sessionId).all();
    const orders = (rows && rows.results) || [];
    const paid = Number(money && money.paid) || 0;
    const bill = orders.reduce((sum, o) => sum + (Number(o.cents) || 0), 0);
    if (paid + 1 >= bill) return null;
    let covered = 0, k = 0;
    while (k < orders.length && covered + (Number(orders[k].cents) || 0) <= paid + 1) covered += Number(orders[k++].cents) || 0;
    if (!k || k >= orders.length || Math.abs(covered - paid) > 1) return null;
    const ids = orders.slice(0, k).map(o => o.id);
    await env.DB.prepare(
      `UPDATE orders SET paid_ts = ?, updated_ts = ?
        WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL AND id IN (${ids.map(() => '?').join(',')})`
    ).bind(now, now, merchant, sessionId, ...ids).run();
    return { remainingCents: bill - paid, settledOrders: ids, owedOrders: orders.length - k };
  } catch (_) {
    return null; // An unreadable check keeps the settlement as it was.
  }
}

/* What has been paid on each open visit and not yet matched to a settled
 * order: the parts of a shared bill already taken, the deposits that followed
 * a merge onto this visit. The waiter's phone bills the orders still open, so
 * without this figure a merged table offered its whole combined bill again
 * after one of the two tables had been partly paid. Returns a Map
 * session id → cents (only visits with a credit); an unreadable ledger
 * returns null, so a caller never mistakes "unknown" for "nothing paid". */
export async function visitCredits(env, merchant, sessionIds) {
  const ids = Array.from(new Set((sessionIds || []).map(String).filter(Boolean))).slice(0, 200);
  const credits = new Map();
  if (!ids.length) return credits;
  try {
    const marks = ids.map(() => '?').join(',');
    const paid = await env.DB.prepare(
      `SELECT session_id AS id, COALESCE(SUM(COALESCE(gross_amount_cents, amount_cents)), 0) AS cents FROM sales
        WHERE merchant = ? AND void_ts IS NULL AND session_id IN (${marks}) GROUP BY session_id`
    ).bind(merchant, ...ids).all();
    const settled = await env.DB.prepare(
      `SELECT session_id AS id, COALESCE(SUM(CAST(ROUND(total * 100) AS INTEGER)), 0) AS cents FROM orders
        WHERE merchant = ? AND paid_ts IS NOT NULL AND status <> 'rejected' AND session_id IN (${marks}) GROUP BY session_id`
    ).bind(merchant, ...ids).all();
    const used = new Map(((settled && settled.results) || []).map(r => [String(r.id), Number(r.cents) || 0]));
    for (const row of (paid && paid.results) || []) {
      const left = (Number(row.cents) || 0) - (used.get(String(row.id)) || 0);
      if (left > 0) credits.set(String(row.id), left);
    }
    return credits;
  } catch (_) {
    return null;
  }
}
