/* Le ticket de caisse de la boutique, en données, et la question « une vraie
 * imprimante attend-elle ? ». Sortis de checkout.js (plafond de taille,
 * tools/file-size-ratchet-test.mjs) ; purs : rien n'est lu hors des arguments.
 * checkout.js › printReceiptNow les appelle, puis KiwiReceipt.build/print. */

/* L'impression AUTOMATIQUE ne part que vers une imprimante connectée (ou
   configurée), ou vers l'impression système si la propriétaire l'a choisie
   (browserFallback). Sinon false : pas de boîte d'impression macOS surprise. */
function receiptPrinterReady(KP) {
  try {
    if (!KP) return false;
    if (KP.isConnected ? KP.isConnected() : (KP.isConfigured && KP.isConfigured())) return true;
    const cfg = (KP.getConfig && KP.getConfig()) || {};
    return !!cfg.browserFallback;
  } catch (_) { return false; }
}

/* Ce que KiwiReceipt.build reçoit pour une vente boutique. `cashier` est le nom
   de la caissière (STAFF.caissiere), lu par l'appelant. */
function receiptDocInput(opts, parts, cashier) {
  return {
    ref: opts.ref || '',
    ts: (opts.sale && opts.sale.at) || Date.now(),
    cashier,
    lines: (opts.lines || []).map((l) => ({ qty: l.qty, name: l.name, total: l.amount, ref: l.ref, barcode: l.barcode })),
    subtotal: opts.subtotal,
    promo: opts.promo || null,
    discount: opts.discount,
    total: opts.amount,
    acompte: opts.acompte || null,
    customer: opts.customer || null,
    pay: (parts || []).map((x) => ({ label: x.m === 'avoir' ? ('Avoir ' + (x.code || '')) : x.m, amount: x.amount })),
    /* Le « reçu » du ticket, c'est ce que la main du client a posé sur le
       comptoir — donc la PART espèces plus le rendu, pas le total de la
       vente. Avec un paiement partagé (moitié carte, moitié espèces), le
       total imprimait un billet que personne n'avait donné. */
    received: (function () {
      const c = (parts || []).find((x) => x.m === 'espèces' && x.rendu > 0);
      return c ? (+c.amount || 0) + (+c.rendu || 0) : null;
    })(),
    change: (parts || []).reduce((r, x) => r || x.rendu || 0, 0) || null,
  };
}

export { receiptPrinterReady, receiptDocInput };
