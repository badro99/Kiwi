import { auditRetailOnAccount, deferAudit } from './_credit-audit.js';

// A retail bill is not a day's takings. Each confirmed payment is still a
// distinct /api/sale receipt; this table only protects and locates the balance.
const token = value => String(value || '').trim().slice(0, 64);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const DAY = 86400000;
/* La fin d'une avance, envoyée par la caisse depuis le réglage du tableau de
   bord (Reçu · Validité des bons). Absente ou illisible : sans limite. */
function avanceExpiry(value, ts) {
  const n = Math.round(Number(value));
  if (!Number.isSafeInteger(n) || n <= ts) return null;
  return Math.min(n, ts + 3650 * DAY);
}
/* Les pièces gardées pour la cliente : ce que la caisse scanne pour les remettre
   en stock quand l'avance expire. Bornées, jamais un prix ni un code personnel. */
function heldLines(raw) {
  if (!Array.isArray(raw)) return null;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const lines = raw.slice(0, 40).map(line => ({
    pid: str(line && line.pid, 64), size: str(line && line.size, 24), color: str(line && line.color, 24),
    qty: Math.max(1, Math.min(999, Math.round(Number(line && line.qty)) || 1)),
    name: str(line && line.name, 120), barcode: str(line && line.barcode, 64),
    ...(line && line.piece === true ? { piece: true } : {}),   /* Maison : vendue à la pièce, revient au dépareillé */
  })).filter(line => line.pid || line.barcode);
  return lines.length ? JSON.stringify(lines) : null;
}
const parseLines = value => { try { const rows = JSON.parse(value || '[]'); return Array.isArray(rows) ? rows : []; } catch (_) { return []; } };

export async function claimRetailBalance(db, merchant, raw, saleId, amountCents, method, ts, defer) {
  const id = token(raw && raw.id);
  const customerId = token(raw && raw.customerId);
  const ticketRef = token(raw && raw.ticketRef);
  const totalCents = Number(raw && raw.totalCents);
  const stage = String(raw && raw.stage || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(customerId)
      || !ticketRef || !Number.isSafeInteger(totalCents) || totalCents < 1
      || totalCents > 20000000 || !['open', 'payment'].includes(stage)
      || !Number.isSafeInteger(amountCents) || amountCents > totalCents) {
    return json({ error: 'bad-retail-balance' }, 400);
  }
  // Two shapes only: a real payment (1 cent or more, money method), or the whole
  // ticket put on the customer's account when the note opens (0 received, `compte`).
  const onAccount = stage === 'open' && amountCents === 0 && method === 'compte';
  if (!onAccount && (amountCents < 1 || !['cash', 'card', 'transfer', 'cheque'].includes(method))) {
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
      /* 0028 · Une avance (la cliente verse une partie pour qu'on lui garde la
         pièce) porte sa fin et ses pièces ; un compte client n'expire pas. */
      const kind = onAccount ? 'credit' : 'avance';
      const expires = kind === 'avance' ? avanceExpiry(raw && raw.expiresAt, ts) : null;
      await db.prepare(`INSERT OR IGNORE INTO retail_balances
        (merchant,id,customer_id,ticket_ref,total_cents,created_ts,kind,expires_ts,lines) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(merchant, id, customerId, ticketRef, totalCents, ts, kind, expires,
          kind === 'avance' ? heldLines(raw && raw.lines) : null).run();
    }
    const bill = await db.prepare(`SELECT id,customer_id,ticket_ref,total_cents FROM retail_balances
      WHERE merchant = ? AND id = ?`).bind(merchant, id).first();
    if (!bill) return json({ error: 'retail-balance-missing' }, 409);
    if (bill.customer_id !== customerId || bill.ticket_ref !== ticketRef
        || Number(bill.total_cents) !== totalCents) {
      return json({ error: 'retail-balance-conflict' }, 409);
    }
    // Nothing was received: the note itself is the whole record. No receipt row,
    // so the note's paid amount stays 0 and every later payment is a new sale.
    // Past the customer's credit limit without a manager's approval, the owner's
    // credit book flags it (functions/api/_credit-audit.js, never blocks).
    if (onAccount) { await deferAudit(defer, () => auditRetailOnAccount(db, merchant, customerId, id, totalCents)); return null; }
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
    b.kind,b.expires_ts,b.lines,
    COALESCE(SUM(CASE WHEN r.status = 'posted' AND s.id IS NOT NULL AND s.void_ts IS NULL
      THEN r.amount_cents ELSE 0 END),0) AS paid_cents,
    COALESCE(SUM(CASE WHEN r.status = 'pending' THEN r.amount_cents ELSE 0 END),0) AS pending_cents,
    GROUP_CONCAT(CASE WHEN r.status = 'pending' OR (s.id IS NOT NULL AND s.void_ts IS NULL)
      THEN r.sale_id END) AS receipt_ids
    FROM retail_balances b LEFT JOIN retail_balance_receipts r
      ON r.merchant = b.merchant AND r.balance_id = b.id
    LEFT JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id
    WHERE b.merchant = ? AND b.closed_ts IS NULL ${where}
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
    kind: String(row.kind || ''), expiresAt: Number(row.expires_ts) || 0, lines: parseLines(row.lines),
  }));
}

/* ── L'avance expirée ──────────────────────────────────────────────────────
 * La cliente n'est pas revenue payer le reste avant la fin de son avance. La
 * caisse a scanné chaque pièce gardée (preuve que le magasin l'a bien) et va
 * les remettre en stock ; ici, en UNE écriture D1 (batch = transaction) :
 *   · la note se ferme (closed_ts), elle quitte « Avances » et le reste dû ;
 *   · l'argent déjà versé devient un avoir au nom de la cliente, avec la
 *     validité d'un avoir réglée au tableau de bord.
 * L'identifiant de l'avoir dérive de la note : rejouer la requête rend le même
 * avoir, jamais un second. Un versement encore en attente bloque : il doit
 * d'abord arriver, sinon il manquerait à l'avoir. */
export async function expireAvance(env, merchant, body, actor, at, credits) {
  const id = token(body && body.id);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return json({ error: 'bad-retail-balance' }, 400);
  const db = env.DB;
  const bill = await db.prepare(`SELECT b.id,b.customer_id,b.ticket_ref,b.total_cents,b.kind,b.expires_ts,
      b.closed_ts,b.close_credit_code,
      COALESCE((SELECT SUM(r.amount_cents) FROM retail_balance_receipts r
        JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id AND s.void_ts IS NULL
        WHERE r.merchant = b.merchant AND r.balance_id = b.id AND r.status = 'posted'),0) AS paid_cents,
      COALESCE((SELECT SUM(r.amount_cents) FROM retail_balance_receipts r
        WHERE r.merchant = b.merchant AND r.balance_id = b.id AND r.status = 'pending'),0) AS pending_cents,
      (SELECT r.sale_id FROM retail_balance_receipts r WHERE r.merchant = b.merchant AND r.balance_id = b.id
        ORDER BY r.created_ts LIMIT 1) AS first_sale_id,
      (SELECT c.name FROM clients c WHERE c.merchant = b.merchant AND c.id = b.customer_id) AS customer_name
    FROM retail_balances b WHERE b.merchant = ? AND b.id = ?`).bind(merchant, id).first();
  if (!bill) return json({ error: 'retail-balance-missing' }, 404);
  const creditId = 'avx-' + id;
  if (bill.closed_ts) {
    const credit = bill.close_credit_code
      ? await db.prepare('SELECT * FROM store_credits WHERE merchant = ? AND id = ?').bind(merchant, creditId).first() : null;
    return json({ ok: true, replay: true, closedAt: Number(bill.closed_ts), credit: credit ? credits.view(credit) : null });
  }
  if (bill.kind !== 'avance') return json({ error: 'not-an-avance' }, 409);
  if (!Number(bill.expires_ts) || Number(bill.expires_ts) > at) return json({ error: 'avance-not-expired' }, 409);
  if (Number(bill.pending_cents) > 0) return json({ error: 'avance-payment-pending' }, 409);
  const paid = Math.max(0, Number(bill.paid_cents) || 0);
  const code = paid > 0 ? credits.generatedCode() : null;
  const close = db.prepare(`UPDATE retail_balances SET closed_ts = ?, close_reason = 'avance-expired', close_credit_code = ?
    WHERE merchant = ? AND id = ? AND closed_ts IS NULL`).bind(at, code, merchant, id);
  if (!paid) {
    const result = await close.run();
    if (!result.meta?.changes) return json({ error: 'retail-balance-conflict' }, 409);
    return json({ ok: true, closedAt: at, credit: null });
  }
  const expiresAt = await credits.creditExpiry(env, merchant, at, body);
  const originalSaleId = token(bill.first_sale_id) || id;
  const customerName = String(bill.customer_name || '').slice(0, 120) || 'Cliente';
  const reason = ('Avance expirée · ticket ' + bill.ticket_ref).slice(0, 160);
  const eventId = creditId + ':issue';
  const detail = JSON.stringify({ avance: id, lines: parseLines(body && body.scanned).slice(0, 40), resellable: true }).slice(0, 12000);
  /* Le batch est une transaction : l'avoir n'existe que si CETTE requête a
     fermé la note (closed_ts = at et le code qu'elle vient de tirer). */
  await db.batch([
    close,
    db.prepare(`INSERT OR IGNORE INTO store_credits
        (id, merchant, code, customer_id, customer_name, original_sale_id, original_ref,
         amount_cents, balance_cents, status, expires_ts, reason, issued_by,
         last_event_id, created_ts, updated_ts)
      SELECT ?, ?, ?, b.customer_id, ?, ?, b.ticket_ref, ?, ?, 'active', ?, ?, ?, ?, ?, ?
        FROM retail_balances b WHERE b.merchant = ? AND b.id = ? AND b.closed_ts = ? AND b.close_credit_code = ?`)
      .bind(creditId, merchant, code, customerName, originalSaleId, paid, paid, expiresAt, reason, actor,
        eventId, at, at, merchant, id, at, code),
    db.prepare(`INSERT OR IGNORE INTO store_credit_events
        (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
      SELECT ?, ?, id, code, 'issue', ?, balance_cents, original_sale_id, ?, ?, ?
        FROM store_credits WHERE merchant = ? AND id = ? AND last_event_id = ?`)
      .bind(eventId, merchant, paid, actor, detail, at, merchant, creditId, eventId),
  ]);
  const credit = await db.prepare('SELECT * FROM store_credits WHERE merchant = ? AND id = ?').bind(merchant, creditId).first();
  if (!credit) return json({ error: 'retail-balance-conflict' }, 409);
  return json({ ok: true, closedAt: at, credit: credits.view(credit) });
}
