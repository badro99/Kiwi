// A retail bill is not a day's takings. Each confirmed payment is still a
// distinct /api/sale receipt; this table only protects and locates the balance.
const token = value => String(value || '').trim().slice(0, 64);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function claimRetailBalance(db, merchant, raw, saleId, amountCents, method, ts) {
  const id = token(raw && raw.id);
  const customerId = token(raw && raw.customerId);
  const ticketRef = token(raw && raw.ticketRef);
  const totalCents = Number(raw && raw.totalCents);
  const stage = String(raw && raw.stage || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(customerId)
      || !ticketRef || !Number.isSafeInteger(totalCents) || totalCents < 1
      || totalCents > 20000000 || !['open', 'payment'].includes(stage)
      || !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > totalCents
      || !['cash', 'card', 'transfer', 'cheque'].includes(method)) {
    return json({ error: 'bad-retail-balance' }, 400);
  }
  let customer;
  try {
    customer = await db.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0')
      .bind(merchant, customerId).first();
  } catch (_) { return json({ error: 'retail-customer-unavailable' }, 503); }
  // A newly attached customer may still be in the client outbox. Keep this
  // payment retryable rather than turning an ordering race into a blocked sale.
  if (!customer) return json({ error: 'retail-customer-sync-pending' }, 503);
  try {
    if (stage === 'open') {
      await db.prepare(`INSERT OR IGNORE INTO retail_balances
        (merchant,id,customer_id,ticket_ref,total_cents,created_ts) VALUES (?,?,?,?,?,?)`)
        .bind(merchant, id, customerId, ticketRef, totalCents, ts).run();
    }
    const bill = await db.prepare(`SELECT id,customer_id,ticket_ref,total_cents FROM retail_balances
      WHERE merchant = ? AND id = ?`).bind(merchant, id).first();
    if (!bill) return json({ error: 'retail-balance-missing' }, 409);
    if (bill.customer_id !== customerId || bill.ticket_ref !== ticketRef
        || Number(bill.total_cents) !== totalCents) {
      return json({ error: 'retail-balance-conflict' }, 409);
    }
    const previous = await db.prepare(`SELECT balance_id,amount_cents,method FROM retail_balance_receipts
      WHERE merchant = ? AND sale_id = ?`).bind(merchant, saleId).first();
    if (previous) return previous.balance_id === id && Number(previous.amount_cents) === amountCents && previous.method === method
      ? null : json({ error: 'retail-payment-conflict' }, 409);

    // One SQLite INSERT decides capacity atomically. Pending reservations count
    // until /api/sale has durably written that receipt, so two tills cannot both
    // spend the same remaining balance. A voided receipt releases its capacity.
    const result = await db.prepare(`INSERT INTO retail_balance_receipts
      (merchant,balance_id,sale_id,amount_cents,method,status,created_ts)
      SELECT ?, b.id, ?, ?, ?, 'pending', ? FROM retail_balances b
      WHERE b.merchant = ? AND b.id = ? AND ? <= b.total_cents - COALESCE((
        SELECT SUM(r.amount_cents) FROM retail_balance_receipts r
        LEFT JOIN sales s ON s.id = r.sale_id AND s.merchant = r.merchant
        WHERE r.merchant = b.merchant AND r.balance_id = b.id
          AND (r.status = 'pending' OR (s.id IS NOT NULL AND s.void_ts IS NULL))
      ), 0)`)
      .bind(merchant, saleId, amountCents, method, ts, merchant, id, amountCents).run();
    if (!result.meta?.changes) return json({ error: 'retail-balance-exceeded' }, 409);
    return null;
  } catch (error) {
    // A missing migration is a retriable sync failure, never a fallback to an
    // unlinked receipt. The outbox retains the exact financial event.
    return json({ error: 'retail-balance-unavailable', detail: String(error && error.message || error) }, 503);
  }
}

export async function confirmRetailBalance(db, merchant, saleId) {
  await db.prepare(`UPDATE retail_balance_receipts SET status = 'posted'
    WHERE merchant = ? AND sale_id = ?`).bind(merchant, saleId).run();
}

export async function readRetailBalances(db, merchant, filter = '') {
  const where = filter ? `AND (b.ticket_ref LIKE ? OR b.customer_id = ? OR b.id = ?)` : '';
  const args = filter ? [merchant, `%${filter}%`, filter, filter] : [merchant];
  const rows = await db.prepare(`SELECT * FROM (SELECT b.id,b.customer_id,b.ticket_ref,b.total_cents,b.created_ts,
    COALESCE(SUM(CASE WHEN r.status = 'posted' AND s.id IS NOT NULL AND s.void_ts IS NULL
      THEN r.amount_cents ELSE 0 END),0) AS paid_cents,
    COALESCE(SUM(CASE WHEN r.status = 'pending' THEN r.amount_cents ELSE 0 END),0) AS pending_cents,
    GROUP_CONCAT(CASE WHEN r.status = 'pending' OR (s.id IS NOT NULL AND s.void_ts IS NULL)
      THEN r.sale_id END) AS receipt_ids
    FROM retail_balances b LEFT JOIN retail_balance_receipts r
      ON r.merchant = b.merchant AND r.balance_id = b.id
    LEFT JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id
    WHERE b.merchant = ? ${where}
    GROUP BY b.merchant,b.id)
    WHERE total_cents > paid_cents + pending_cents
    ORDER BY created_ts DESC`)
    .bind(...args).all();
  return (rows.results || []).map(row => ({
    id: row.id, customerId: row.customer_id, ticketRef: row.ticket_ref,
    totalCents: Number(row.total_cents), paidCents: Number(row.paid_cents),
    pendingCents: Number(row.pending_cents), receiptIds: String(row.receipt_ids || '').split(',').filter(Boolean),
    balanceCents: Math.max(0, Number(row.total_cents) - Number(row.paid_cents) - Number(row.pending_cents)),
    createdTs: Number(row.created_ts),
  }));
}
