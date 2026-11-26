/* Le reçu boutique porte son N° en Code 128 (receipt.js › ticketCode ; Santos,
 * 26 nov. 2026 : « il faut un code scannable pour retrouver le ticket »).
 *   · scanné à la douchette hors inventaire, il ouvre Échanges filtré sur ce N° ;
 *   · tapé ou scanné exact dans la recherche d'Échanges, il saute à sa journée.
 * Un article qui porte le même code garde la priorité, et une vente hors de la
 * fenêtre de retour n'ouvre aucune journée. Pur : la caisse passe ses données. */

export function saleByTicket(sales, code) {
  const c = String(code || '').trim();
  return c ? (sales || []).find((s) => s && !s.voided && String(s.id) === c) || null : null;
}

/* La journée commerciale de ce ticket si elle est dans [oldestKey, todayKey], sinon ''. */
export function ticketDayIn(sales, code, dayKey, oldestKey, todayKey) {
  const sale = saleByTicket(sales, code);
  if (!sale) return '';
  const k = dayKey(sale.at);
  return k >= oldestKey && k <= todayKey ? k : '';
}

/* Un scan est un ticket quand aucun article ne porte ce code et qu'une vente a ce N°. */
export function isTicketScan(sales, code, isCatalogCode) {
  return !!code && !isCatalogCode(code) && !!saleByTicket(sales, code);
}
