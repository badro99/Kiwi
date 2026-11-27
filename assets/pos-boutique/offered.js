/* Le ticket boutique entièrement offert (chaque pièce en « Offert », la
 * pastille 100 % de la remise : pos-boutique/ticket-remise.js).
 *
 * Il n'y a rien à encaisser, mais c'est une vente : les pièces sortent du
 * stock, le ticket entre au journal et au Z, le reçu s'imprime, et le serveur
 * l'apprend en vente « Offerte » (settlementKind complimentary, 0 MAD, brut =
 * remise). L'écran de paiement proposait Espèces, Carte… tous à 0 MAD : on le
 * saute, et l'on passe par le même onPaid que n'importe quel encaissement,
 * avec une seule part { m: 'offert', amount: 0 }. */
export const OFFERED_PART = 'offert';

export async function payOffered(opts, deps) {
  const tr = (s) => ((globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s));
  const parts = [{ m: OFFERED_PART, amount: 0 }];
  try {
    if (opts.beforePaid && (await opts.beforePaid()) === false) { if (opts.onCancel) opts.onCancel(); return null; }
  } catch (_) { if (opts.onCancel) opts.onCancel(); return null; }
  const res = opts.onPaid(parts, { partial: false, paidNow: 0, onAccount: false }) || {};
  if (res.error) { if (opts.onCancel) opts.onCancel(); return null; }
  if (res.sale) opts.sale = res.sale;
  try { if (deps && deps.print) deps.print(opts, parts, { auto: true }); } catch (_) {}
  if (deps && deps.toast) deps.toast(tr('Ticket offert enregistré'));
  return res;
}
