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
const zPrintPair = (print, pair, copy) => {
  if (!pair) return Promise.resolve({ ok: false });
  /* Les deux tickets en UN travail (printDayReportBatch) : jamais l'un sans l'autre, quelle que soit la voie (thermique ou boîte Windows). */
  const P = globalThis.window && window.KiwiPrinter;
  if (P && typeof P.printDayReportBatch === 'function') return P.printDayReportBatch(() => [print(pair.store, copy, 'store'), print(pair.delivery, copy, 'delivery')]).then((res) => res[0] || { ok: false });
  return print(pair.store, copy, 'store').then((first) => (first && first.ok) ? print(pair.delivery, copy, 'delivery') : (first || { ok: false }));
};
/* L'écran de clôture dit la même chose que le papier (propriétaire, 30
 * octobre) : le chiffre de la caisse hors livraisons, puis celui des
 * livraisons. Ses phrases anglaises et arabes vivent ici, caisse-lang.js est
 * gelé en taille. */
const ZPH = {
  'Caisse · hors livraisons': ['Till · excluding deliveries', 'الصندوق · بدون التوصيلات'],
  'Livraisons': ['Deliveries', 'التوصيلات'],
  'Ventes en livraison': ['Delivery sales', 'مبيعات التوصيل'],
  'Articles en livraison': ['Items sent', 'المواد المرسلة'],
  'Réductions sur les livraisons': ['Discounts on deliveries', 'التخفيضات على التوصيلات'],
  'Montant à recevoir': ['Amount to collect', 'المبلغ المنتظر'],
  'Livraisons · à recevoir': ['Deliveries · to collect', 'التوصيلات · قيد التحصيل'],
};
const ztr = (s) => {
  const C = globalThis.window && window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  if (ZPH[s] && (lang === 'en' || lang === 'ar')) return ZPH[s][lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};
/* Lignes de l'écran de clôture : [libellé, valeur, mono, genre]. */
const zStoreHead = () => [ztr('Caisse · hors livraisons'), '', false, 'head'];
const zDeliveryRows = (td, fmt) => [
  [ztr('Livraisons'), '', false, 'head'],
  [ztr('Ventes en livraison'), String(td.txns), false, ''],
  ...(td.items > 0 ? [[ztr('Articles en livraison'), String(td.items), false, '']] : []),
  ...(td.discounts > 0 ? [[ztr('Réductions sur les livraisons'), fmt(td.discounts), true, '']] : []),
  [ztr('Montant à recevoir'), fmt(td.delivery), true, 'total'],
];
/* L'écran d'après-clôture : deux chiffres quand les deux tickets existent. Le
 * net du ticket livraisons vaut 0 (rien n'est encore encaissé) : on montre ce
 * qui reste à recevoir. */
const zSplitBlock = (label, value, esc) => '<div class="zs-split-it"><div class="zs-split-label">' + esc(label) + '</div><div class="zs-total mono">' + esc(value) + '</div></div>';
const zCloseTotals = (pair, net, fmt, esc) => !pair ? '<div class="zs-total mono">' + esc(fmt(net)) + '</div>'
  : '<div class="zs-split">' + zSplitBlock(ztr('Caisse · hors livraisons'), fmt(pair.store.net), esc) + zSplitBlock(ztr('Livraisons · à recevoir'), fmt(+pair.delivery.receivable || 0), esc) + '</div>';
export { zIsDelivery, zSplitParts, zSalesFor, zSentParts, zTicketOpts, zPair, zPrintPair, zStoreHead, zDeliveryRows, zCloseTotals };
