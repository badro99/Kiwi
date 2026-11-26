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
        WHERE merchant = ? AND ref_id = ? AND action = 'issue'), 0) - COALESCE((SELECT SUM(c.amount_cents) FROM store_credit_events c WHERE c.merchant = ? AND c.action = 'cancel' AND c.credit_id IN (SELECT i.credit_id FROM store_credit_events i WHERE i.merchant = ? AND i.ref_id = ? AND i.action = 'issue')), 0) AS c`
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
  } catch (_) { throw new Error('store-credit-unavailable'); }
  const out = [];
  for (const row of rows) {
    const cents = Math.round(Number(row.cents) || 0);
    if (!(cents > 0)) continue;
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
