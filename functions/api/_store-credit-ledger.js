// Ce que le serveur sait déjà avoir rendu sur UNE vente : remboursements
// (sale_audit, action = 'refund') et avoirs émis (store_credit_events,
// action = 'issue'). Trois routes en ont besoin pour la même raison : une vente
// ne peut pas être rendue deux fois.
//   · /api/sale/refund   : plafonne le remboursement à ce qui reste après les
//                          avoirs déjà émis ;
//   · /api/store-credits : plafonne l'avoir à ce qui reste après les
//                          remboursements déjà versés ;
//   · /api/sale/cancel   : refuse d'annuler une vente déjà (en partie) rendue,
//                          sinon la même somme sort deux fois des chiffres.
// Un underscore au début du nom : Cloudflare Pages n'en fait pas une route.

// Compatibility helper: migrations own store_credit_events.
export async function ensureCreditEvents(env) {
  return true;
}

/* Somme des avoirs émis sur la vente (en centimes), moins ce qu'un avoir annulé
 * a rendu : un avoir émis par erreur puis annulé ne retient plus le ticket (audit
 * du 26 nov.). Une lecture impossible reste une erreur, jamais un solde nul. */
export async function creditsIssuedCents(env, merchant, saleId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE((SELECT SUM(amount_cents) FROM store_credit_events
        WHERE merchant = ? AND ref_id = ? AND action = 'issue'), 0) - COALESCE((SELECT SUM(MIN(c.amount_cents, i.amount_cents)) FROM store_credit_events c JOIN store_credit_events i ON i.credit_id = c.credit_id AND i.merchant = c.merchant AND i.action = 'issue' WHERE c.merchant = ? AND c.action = 'cancel' AND i.merchant = ? AND i.ref_id = ?), 0) AS c`
    ).bind(merchant, saleId, merchant, merchant, saleId).first();
    return Math.max(0, Math.round(Number(row && row.c) || 0));
  } catch (_) { throw new Error('store-credit-unavailable'); }
}

/* Somme des remboursements versés sur la vente (en centimes).
 * Le schéma minimum garantit amount_cents ; aucune erreur ne vaut zéro. */
export async function refundsIssuedCents(env, merchant, saleId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS c FROM sale_audit
        WHERE merchant = ? AND sale_id = ? AND action = 'refund'`
    ).bind(merchant, saleId).first();
    return Math.max(0, Math.round(Number(row && row.c) || 0));
  } catch (_) { throw new Error('store-credit-unavailable'); }
}

/* Annuler une vente payée (en partie) par avoir rend l'avoir (audit du 26 nov. :
 * 400 MAD de crédit perdus par la cliente). Les écritures rejoignent le lot de
 * l'annulation et ne valent que si CETTE annulation a eu lieu (void_ts = voidTs).
 * Un avoir expiré reçoit la validité d'un avoir neuf, comme au remboursement
 * (sale/refund.js). Une lecture impossible est une erreur, jamais « rien à rendre ». */
export async function voidCreditBackStatements(env, merchant, saleId, voidTs, actor, renewedUntil) {
  let rows;
  try {
    rows = (await env.DB.prepare(
      `SELECT credit_id, SUM(amount_cents) AS cents FROM store_credit_events
        WHERE merchant = ? AND ref_id = ? AND action = 'redeem' GROUP BY credit_id`
    ).bind(merchant, saleId).all()).results || [];
  } catch (e) {
    /* Une base sans registre d'avoirs n'a aucun avoir à rendre ; toute autre erreur bloque. */
    if (/no such table/i.test(String(e && e.message))) return [];
    throw new Error('store-credit-unavailable');
  }
  if (!rows.length) return [];
  /* Jamais plus que la part avoir que la vente elle-même a enregistrée : une
     consommation qui nomme ce ticket sans l'avoir payé ne se rembourse pas. */
  let cap = 0;
  try {
    const sale = await env.DB.prepare(`SELECT s.method, s.amount_cents, s.payment_parts, r.gross_ticket_cents FROM sales s
      LEFT JOIN sale_receipts r ON r.merchant = s.merchant AND r.sale_id = s.id WHERE s.merchant = ? AND s.id = ?`).bind(merchant, saleId).first();
    let parts = null;
    try { parts = JSON.parse(sale && sale.payment_parts || 'null'); } catch (_) { parts = null; }
    const isCredit = (m) => m === 'credit' || m === 'avoir';
    if (Array.isArray(parts) && parts.length) cap = parts.reduce((n, x) => n + (x && isCredit(x.method) ? Math.max(0, Math.round(Number(x.amountCents) || 0)) : 0), 0);
    else if (sale && isCredit(String(sale.method || ''))) cap = Math.max(Math.round(Number(sale.amount_cents) || 0), Math.round(Number(sale.gross_ticket_cents) || 0));
  } catch (_) { throw new Error('store-credit-unavailable'); }
  const out = [];
  for (const row of rows) {
    const cents = Math.min(Math.round(Number(row.cents) || 0), cap);
    if (!(cents > 0)) continue;
    cap -= cents;
    const eventId = `void:${merchant}:${saleId}:${row.credit_id}`;
    out.push(env.DB.prepare(
      `UPDATE store_credits SET balance_cents = balance_cents + ?,
          status = CASE WHEN status = 'consumed' THEN 'active' ELSE status END,
          expires_ts = CASE WHEN expires_ts < ? THEN ? ELSE expires_ts END,
          updated_ts = ?, last_event_id = ?
        WHERE merchant = ? AND id = ? AND status IN ('active', 'consumed')
          AND EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND void_ts = ?)
          AND NOT EXISTS (SELECT 1 FROM store_credit_events WHERE merchant = ? AND id = ?)`
    ).bind(cents, voidTs, renewedUntil, voidTs, eventId, merchant, row.credit_id, merchant, saleId, voidTs, merchant, eventId));
    out.push(env.DB.prepare(
      `INSERT OR IGNORE INTO store_credit_events
         (id, merchant, credit_id, code, action, amount_cents, balance_after_cents, ref_id, actor, detail, ts)
       SELECT ?, merchant, id, code, 'adjust', ?, balance_cents, ?, ?, 'Restauration annulation de vente', ?
         FROM store_credits WHERE merchant = ? AND id = ? AND last_event_id = ?`
    ).bind(eventId, cents, saleId, actor || '', voidTs, merchant, row.credit_id, eventId));
  }
  return out;
}
