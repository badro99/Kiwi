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

/* Somme des avoirs émis sur la vente (en centimes). 0 si la table n'existe pas :
 * sans table, aucun avoir n'a jamais été émis. */
export async function creditsIssuedCents(env, merchant, saleId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS c FROM store_credit_events
        WHERE merchant = ? AND ref_id = ? AND action = 'issue'`
    ).bind(merchant, saleId).first();
    return Math.max(0, Math.round(Number(row && row.c) || 0));
  } catch (_) { return 0; }
}

/* Somme des remboursements versés sur la vente (en centimes). Repli sans
 * `amount_cents` pour une base d'avant cette colonne. */
export async function refundsIssuedCents(env, merchant, saleId) {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS c FROM sale_audit
        WHERE merchant = ? AND sale_id = ? AND action = 'refund'`
    ).bind(merchant, saleId).first();
    return Math.max(0, Math.round(Number(row && row.c) || 0));
  } catch (_) {
    try {
      const row = await env.DB.prepare(
        `SELECT COALESCE(SUM(amount * 100), 0) AS c FROM sale_audit
          WHERE merchant = ? AND sale_id = ? AND action = 'refund'`
      ).bind(merchant, saleId).first();
      return Math.max(0, Math.round(Number(row && row.c) || 0));
    } catch (__) { return 0; }
  }
}
