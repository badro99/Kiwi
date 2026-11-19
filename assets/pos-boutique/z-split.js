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
/* L'argent d'un livreur (Santos, 19 nov.) : le règlement d'une livraison déjà
 * vendue, jamais une vente du magasin. Il sort du ticket magasin (le 18 nov.,
 * 500 MAD de virement livreur y gonflaient « hors livraisons » sous « Autres »,
 * avec une transaction et ses articles) et va au ticket livraisons comme argent
 * reçu ce jour-là. Les espèces qu'un livreur laisse AU COMPTOIR restent dans le
 * tiroir, en mouvement d'entrée ; un encaissement relu du serveur (autre caisse,
 * virement) n'y est pas. */
const zIsCollection = (s) => !!s && s.kind === 'livraison-reglement';
const zRowKind = (row) => String((row && row.channel) || '') === 'delivery' && /^Livraison reçue · /.test(String((row && row.label) || '')) ? 'livraison-reglement' : 'vente';
const zSalesFor = (sales, only) => only === 'delivery' ? sales.filter(zIsDelivery) : only === 'store' ? sales.filter((s) => !zIsCollection(s)) : sales;
/* Une livraison vue du Z magasin : son argent du comptoir seul, ni ticket ni articles. */
const zAway = (s, only) => only === 'store' && zIsDelivery(s);
/* L'argent des livreurs reçu dans la journée, quel que soit son moyen : le
 * troisième chiffre de l'écran de clôture, à côté du magasin et des colis à
 * recevoir. Le ticket livraisons imprimé garde son sens (les colis partis). */
const zCollected = (sales) => (sales || []).filter(zIsCollection).reduce((n, s) => n + ((Array.isArray(s.parts) && s.parts.length)
  ? s.parts.reduce((m, p) => m + (p && p.m !== 'avoir' ? Math.max(0, +p.amount || 0) : 0), 0)
  : Math.max(0, s.remote && Number.isFinite(+s.received) ? +s.received : +s.total || 0)), 0);
const zDrawerCash = (sales) => (sales || []).filter((s) => zIsCollection(s) && !s.remote)
  .reduce((n, s) => n + (s.parts || []).reduce((m, p) => m + (p && p.m === 'espèces' ? Math.max(0, +p.amount || 0) : 0), 0), 0);
/* Les mêmes espèces, en entrées de tiroir pour le Z magasin (KiwiDayReport). */
const zDrawerMoves = (sales, only) => only !== 'store' ? [] : (sales || []).filter((s) => zIsCollection(s) && !s.remote && zDrawerCash([s]) > 0)
  .map((s) => ({ ts: +new Date(s.at), type: 'in', amount: Math.round(zDrawerCash([s]) * 100) / 100, reason: 'Livraison reçue' }));
const zDrawerRows = (sales, fmt) => { const c = zDrawerCash(sales); return c > 0 ? [[ztr('Espèces des livraisons'), '+ ' + fmt(c), '']] : []; };
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
  'Argent des livraisons reçu': ['Delivery money received', 'مبالغ التوصيل المستلمة'],
  'Espèces des livraisons': ['Delivery cash', 'نقود التوصيل'],
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
const zDeliveryRows = (td, fmt, got) => [
  [ztr('Livraisons'), '', false, 'head'],
  [ztr('Ventes en livraison'), String(td.txns), false, ''],
  ...(td.items > 0 ? [[ztr('Articles en livraison'), String(td.items), false, '']] : []),
  ...(td.discounts > 0 ? [[ztr('Réductions sur les livraisons'), fmt(td.discounts), true, '']] : []),
  [ztr('Montant à recevoir'), fmt(td.delivery), true, 'total'],
  ...(got > 0 ? [[ztr('Argent des livraisons reçu'), fmt(Math.round(got * 100) / 100), true, 'total']] : []),
];
/* L'écran d'après-clôture : deux chiffres quand les deux tickets existent. Le
 * net du ticket livraisons vaut 0 (rien n'est encore encaissé) : on montre ce
 * qui reste à recevoir. */
const zSplitBlock = (label, value, esc) => '<div class="zs-split-it"><div class="zs-split-label">' + esc(label) + '</div><div class="zs-total mono">' + esc(value) + '</div></div>';
const zCloseTotals = (pair, net, fmt, esc) => !pair ? '<div class="zs-total mono">' + esc(fmt(net)) + '</div>'
  : '<div class="zs-split">' + zSplitBlock(ztr('Caisse · hors livraisons'), fmt(pair.store.net), esc) + zSplitBlock(ztr('Livraisons · à recevoir'), fmt(+pair.delivery.receivable || 0), esc) + '</div>';
/* La vente boutique sort ses pièces du stock PARTAGÉ (une vraie vente doit
 * atteindre la base : les réservations du ticket en mémoire s'évaporent à la
 * prochaine synchro du catalogue). Une livraison, elle, ne sort du stock
 * qu'une fois confirmée (payée au retour du livreur, ou passée en perte) : le
 * serveur s'en charge alors (functions/api/_delivery-stock.js). Hors Live, rien
 * ne la rapporterait : le stock sort à la vente comme avant. */
const zHoldsStock = (parts, live) => !!live && (parts || []).some((x) => x && x.m === 'livraison');
/* L'heure d'ouverture que montrent l'écran de clôture et le Z. Le poste vit
 * dans le navigateur : une journée finie sans « Fermer la caisse » sur CET
 * appareil (fermée ailleurs, onglet resté ouvert) le gardait ouvert des jours,
 * et le Z, qui ne compte que les ventes du jour, annonçait plus de 100 h de
 * service (Santos, 18 novembre). Ouvert un jour d'activité précédent : le
 * service du jour part du premier passage du jour (dayAt, posé par zMarkDay)
 * ou de la première vente du jour. shift.openedAt reste intact : le registre
 * des postes (ouverture / clôture) le garde comme clé. */
const zServiceStart = (shift, sales, isToday, now) => {
  if (!shift || !shift.openedAt) return 0;
  if (isToday(shift.openedAt)) return shift.openedAt;
  const marks = (sales || []).map((s) => +new Date(s.at)).filter((t) => t > 0);
  if (shift.dayAt && isToday(shift.dayAt)) marks.push(shift.dayAt);
  return marks.length ? Math.min(...marks) : now;
};
/* Vrai quand le poste vient d'un jour précédent et n'avait pas encore son
 * premier passage du jour : l'appelant persiste alors le poste. */
const zMarkDay = (shift, isToday, now) => {
  if (!shift || !shift.openedAt || isToday(shift.openedAt) || (shift.dayAt && isToday(shift.dayAt))) return false;
  shift.dayAt = now; return true;
};
export { zServiceStart, zMarkDay, zIsDelivery, zIsCollection, zRowKind, zAway, zCollected, zDrawerCash, zDrawerMoves, zDrawerRows, zSplitParts, zSalesFor, zSentParts, zTicketOpts, zPair, zPrintPair, zStoreHead, zDeliveryRows, zCloseTotals, zHoldsStock };
