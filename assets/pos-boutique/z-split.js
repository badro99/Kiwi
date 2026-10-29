/* Le rapport Z de la boutique sort en DEUX tickets : le magasin (hors
 * livraisons), puis les livraisons seules. Sorti de pos-boutique.js (plafond de
 * taille, tools/file-size-ratchet-test.mjs).
 *
 * Une vente « vient de la livraison » dès qu'une de ses parts est réglée en
 * livraison (même règle que channel:'delivery'). Le partage se fait PAR PART :
 * si une livraison a pris un peu d'espèces au comptoir, ces espèces restent sur
 * le Z du magasin, sinon le tiroir sortirait faux ; la part livraison, l'avoir,
 * les articles et la remise vont au ticket livraisons. `only` absent : la
 * journée entière, comme avant (écran de clôture, rapport classé au tableau
 * de bord). Le rapport enregistré reste la journée entière : seul le papier
 * se partage. */
const zIsDelivery = (s) => (Array.isArray(s.parts) && s.parts.length)
  ? s.parts.some((p) => p && p.m === 'livraison')
  : String(s.methods || '').split(' + ').includes('livraison');
/* Les parts d'argent d'une vente qui reviennent au ticket `only`. */
const zSplitParts = (s, parts, only) => (!only || !zIsDelivery(s)) ? parts
  : parts.filter((p) => (p.m === 'livraison') === (only === 'delivery'));
const zSalesFor = (sales, only) => only === 'delivery' ? sales.filter(zIsDelivery) : sales;
/* Les parts décrites au rapport, partagées comme l'argent. */
const zSentParts = (s, only) => (!only || !zIsDelivery(s)) ? s.parts
  : (s.parts || []).filter((p) => p && (only === 'delivery') !== (p.m !== 'livraison' && p.m !== 'avoir'));
/* En-tête et pied de chaque ticket. Le ticket livraisons n'a pas de tiroir :
 * rien n'y entre, ni au terminal carte. */
const zTicketOpts = (only) => ({
  title: only === 'delivery' ? 'RAPPORT Z · LIVRAISONS' : only === 'store' ? 'RAPPORT Z · HORS LIVRAISONS' : 'RAPPORT JOURNALIER',
  netLabel: only === 'delivery' ? 'NET LIVRAISONS' : 'NET DU JOUR',
  noDrawer: only === 'delivery',
});
/* Les deux rapports, construits ensemble : même heure de fermeture et même
 * numéro de clôture que le rapport classé. À construire AVANT d'effacer le
 * poste, ils lisent son fond et son heure d'ouverture. */
const zPair = (build, counted, closedAt, saved) => {
  try {
    const store = build(counted, closedAt, 'store'), delivery = build(null, closedAt, 'delivery');
    if (!store || !delivery) return null;
    if (saved) [store, delivery].forEach((r) => { r.closedCount = saved.closedCount; r.closed = saved.closed; });
    return { store, delivery };
  } catch (_) { return null; }
};
/* Le magasin d'abord, puis les livraisons, l'un après l'autre : deux travaux
 * lancés ensemble se croisent sur une imprimante Bluetooth. */
const zPrintPair = (print, pair, copy) => !pair ? Promise.resolve({ ok: false })
  : print(pair.store, copy, 'store').then((first) => (first && first.ok) ? print(pair.delivery, copy, 'delivery') : (first || { ok: false }));
export { zIsDelivery, zSplitParts, zSalesFor, zSentParts, zTicketOpts, zPair, zPrintPair };
