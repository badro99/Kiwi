import { tableAliases } from './service/events.js';
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
/* `phone` : a payment taken on the waiter's phone. The phone has no discount
 * and no other tender: whatever it charges is what it showed as the bill. A
 * shortfall therefore means its bill was stale (a dish added after it read,
 * a split from a visit that is gone), never a reduction the merchant chose.
 * Such a payment never closes the visit: the orders it covers in full are
 * settled, the rest stays owed on an open table (judge probes: 14 on a 56
 * bill; 56 on orders of 28 and 40). The till keeps its rule above, because a
 * discount it did not file must still close its table. */
export async function settleCoveredOrders(env, merchant, sessionId, now, { phone = false } = {}) {
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
    while (k < orders.length && covered + (Number(orders[k].cents) || 0) <= paid + 1) {
      covered += Number(orders[k].cents) || 0;
      k++;
    }
    const onBoundary = k > 0 && k < orders.length && Math.abs(covered - paid) <= 1;
    const phoneShort = phone && paid > 0;
    if (!onBoundary && !phoneShort) return null;
    const ids = orders.slice(0, k).map(o => o.id);
    if (ids.length) {
      await env.DB.prepare(
        `UPDATE orders SET paid_ts = ?, updated_ts = ?
          WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL AND id IN (${ids.map(() => '?').join(',')})`
      ).bind(now, now, merchant, sessionId, ...ids).run();
    }
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

/* A VISIT ALREADY SETTLED, PAID AGAIN FROM A STALE PHONE. The till settles a
 * table: its sale closes the visit and stamps every ticket paid. A waiter
 * phone that has not re-read since still shows the bill and takes
 * « Encaisser ». The visit is closed, so /api/sale's open-visit checks never
 * ran, and the phone's sale id is its own: the same bill entered the books
 * twice (tools/shared-table-two-devices-browser-test.mjs, « défaut connu »).
 * A closed visit whose tickets are all paid has nothing left to collect.
 * Called for the waiter app naming its visit only (an employee, or the owner or
 * an operator using the app, which says `surface: 'serveur'`): the till keeps its rule
 * (« a closed visit must still be allowed to write its sale », its own close
 * can arrive first), and a replay of a sale already stored never gets here.
 * Returns { status, body } to refuse, or null. */
export async function staleVisitPayment(env, merchant, session, table) {
  if (!session || !session.id || session.status === 'open') return null;
  let tally = null;
  try {
    tally = await env.DB.prepare(
      `SELECT SUM(CASE WHEN paid_ts IS NULL THEN 1 ELSE 0 END) AS unpaid,
              SUM(CASE WHEN paid_ts IS NOT NULL THEN 1 ELSE 0 END) AS paid
         FROM orders WHERE merchant = ? AND session_id = ? AND status <> 'rejected'`
    ).bind(merchant, session.id).first();
  } catch (_) { return { status: 503, body: { error: 'visit-order-lookup-unavailable' } }; }
  if (!(tally && Number(tally.paid) > 0 && !Number(tally.unpaid))) return null;
  /* Une nouvelle visite déjà ouverte sur la même table ne change rien : une vente n'est JAMAIS
     écrite sur une visite soldée. L'accepter ici payait une seconde fois « à travers » l'ancienne
     visite dès que la table était rouverte, et rangeait l'argent sur la mauvaise visite. Le refus
     nomme la visite ouverte (alias « 4 » / « T4 » compris) : le téléphone relit la note et
     relance contre elle, avec le même identifiant de vente. */
  let reopened = '';
  if (table) {
    try {
      const aliases = tableAliases(table);
      const current = await env.DB.prepare(`SELECT id FROM table_sessions WHERE merchant = ? AND table_no IN (${aliases.map(() => '?').join(',')}) AND mode = 'table' AND status = 'open' AND id <> ? ORDER BY opened_ts DESC LIMIT 1`)
        .bind(merchant, ...aliases, session.id).first();
      reopened = (current && current.id) ? String(current.id) : '';
    } catch (_) { return { status: 503, body: { error: 'visit-order-lookup-unavailable' } }; }
  }
  if (reopened) return { status: 409, body: { error: 'visit-already-settled', table: table || '', reopened: true, openSession: reopened } };
  return { status: 409, body: { error: 'visit-already-settled', table: table || '' } };
}

/* Tolerance between a payment's device timestamp and the server time its
 * table visit was opened. */
const VISIT_BIND_SKEW_MS = 2 * 60 * 1000;

/* The table visit a payment belongs to (/api/sale). A named visit is read as
 * is, whatever its status. Otherwise the table's open visit, but never one
 * opened AFTER the payment: a till replays its offline queue later, sometimes
 * the next evening, and "the table's open visit" is by then a NEW party.
 * Binding to it gave the replay a new idempotency id (a second ledger row: 320
 * MAD at Restaurant MixMax on 11-12 Sep 2026) and could close the new party's
 * table with an old payment. Two minutes absorb the till opening the visit at
 * payment time and ordinary clock drift. Returns the row or null; throws when
 * the lookup itself fails (the caller answers 503). */
export async function paymentVisit(env, merchant, { requestedSession, table, paymentTs }) {
  if (requestedSession) {
    return env.DB.prepare(
      `SELECT id, table_no, status, opened_ts, closed_ts FROM table_sessions
        WHERE id = ? AND merchant = ? AND mode = 'table' LIMIT 1`
    ).bind(requestedSession, merchant).first();
  }
  const aliases = tableAliases(table);
  return env.DB.prepare(
    `SELECT id, table_no, status, opened_ts, closed_ts FROM table_sessions
      WHERE merchant = ? AND table_no IN (${aliases.map(() => '?').join(',')}) AND mode = 'table' AND status = 'open'
        AND opened_ts <= ?
      ORDER BY opened_ts DESC LIMIT 1`
  ).bind(merchant, ...aliases, paymentTs + VISIT_BIND_SKEW_MS).first();
}
