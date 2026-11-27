/* La remise d'une vente maison, telle que le serveur la garde.
 *
 * La Maison en Vogue (20 nov. 2026) : la remise sortait sur le ticket mais
 * n'apparaissait nulle part ailleurs. La caisse envoyait le net (850) sans dire
 * qu'il venait de 1 000 moins 150 ; /api/sale sait garder le brut et la remise
 * (gross_amount_cents, discount_amount_cents), le tableau de bord sait les
 * montrer, la caisse maison ne les donnait pas.
 *
 * La règle du serveur est stricte : brut − remise = montant reçu, un motif de
 * la liste, un acteur identifiant (jamais un code à quatre chiffres). Quand
 * l'argent reçu n'est pas le ticket (avoir, dépôt-vente, acompte, livraison),
 * on n'envoie rien : un brut faux serait refusé, et la vente avec. */
export function mzSaleDiscount({ amountCents, totalCents, remiseCents = 0, rewardCents = 0, actorId = '' } = {}) {
  const amount = Math.round(+amountCents || 0), total = Math.round(+totalCents || 0);
  const remise = Math.max(0, Math.round(+remiseCents || 0)), reward = Math.max(0, Math.round(+rewardCents || 0));
  const discount = remise + reward;
  if (!(discount > 0) || amount < 0 || amount !== total) return null;   // 0 = ticket entièrement offert : brut = remise
  const actor = String(actorId || '');
  return {
    grossAmountCents: amount + discount,
    discountAmountCents: discount,
    discountReason: remise > 0 ? 'commercial' : 'loyal-customer',
    actorId: /^[A-Za-z0-9:_-]{1,96}$/.test(actor) && !/^\d{4}$/.test(actor) ? actor : 'till',
  };
}
