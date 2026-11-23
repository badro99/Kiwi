/* Vendre hors stock, et savoir quoi recompter (boutique et maison, 2026-11-23).
 *
 * Amira Boutique : le compte de Kiwi disait 0 pour une pièce que la cliente
 * tenait à la main, et la caisse refusait de la vendre. La pièce posée sur le
 * comptoir prouve que c'est le compte qui est faux, pas la vente.
 *
 * Donc la caisse ne refuse plus. Une taille à zéro touchée une fois avertit ;
 * touchée de nouveau dans les quatre secondes, elle se vend. Un code-barres
 * scanné vaut preuve et passe du premier coup. La vente sort du stock partagé
 * même sous zéro : le registre garde le vrai négatif, la fiche montre 0 et
 * l'écart à recompter (règle du 4 nov., pages-pro-boutique.js › _bqxLedgerGap).
 * L'Inventaire de la caisse regroupe ces articles sous « À recompter » ; un
 * comptage physique repose le socle et l'écart disparaît. */

const ARM_MS = 15000;   // Mabs, 23 nov. : 4 s ne laissait pas le temps de lire l'avertissement puis de retoucher
let armed = { key: '', at: 0 };
const tr = (s) => { try { return (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s); } catch (_) { return s; } };

/* true : la vente peut passer le compte. toast(msg, ms, kind, desc) est celui de la caisse. */
export function oversellOk(key, label, have, toast, scanned) {
  const now = Date.now();
  if (!scanned && (armed.key !== key || now - armed.at > ARM_MS)) {
    armed = { key, at: now };
    toast(`${label}, ${tr('Kiwi compte')} ${Math.max(0, have | 0)} ${tr('en stock')}`, 8000, 'warn', tr('Touchez encore pour vendre quand même'));
    return false;
  }
  armed = { key: '', at: 0 };
  toast(`${label}, ${tr('vendu hors stock')}`, 4200, 'warn', tr('Le compte est à vérifier : voir « À recompter » dans Inventaire'));
  return true;
}

/* L'écart d'un article : la somme des négatifs que le registre garde sous le 0 affiché. */
export function gapOf(cat, pid) {
  try {
    return (cat.listVariants(pid) || []).reduce((n, v) => n + Math.min(0, Math.round(Number(v.ledgerStock ?? v.stock) || 0)), 0);
  } catch (_) { return 0; }
}

export const RECOUNT = 'recompter';

/* La liste de l'Inventaire : le filtre « À recompter » garde les articles en écart. */
export function invProducts(cat, filter, q) {
  if (filter !== RECOUNT) return cat.listProducts({ categoryId: filter, q: q || '' });
  return cat.listProducts({ q: q || '' }).filter((p) => gapOf(cat, p.id) < 0);
}

/* La pastille, seulement quand il y a quelque chose à recompter (ou qu'elle est choisie). */
export function recountPill(cat, filter, cls) {
  let n = 0;
  try { n = (cat.listProducts({}) || []).filter((p) => gapOf(cat, p.id) < 0).length; } catch (_) {}
  if (!n && filter !== RECOUNT) return '';
  return `<button class="${cls} ${filter === RECOUNT ? 'on' : ''}" data-f="${RECOUNT}">${tr('À recompter')} · ${n}</button>`;
}

/* « · écart −2 » derrière le stock d'une ligne d'Inventaire. */
export function gapLabel(cat, pid, esc) {
  const gap = gapOf(cat, pid);
  return gap < 0 ? ` · ${esc(tr('stock à vérifier · écart'))} −${Math.abs(gap)}` : '';
}

/* Le stock d'une ligne d'Inventaire, signé : −1 quand le total passe sous zéro,
   comme l'ancienne caisse (owner, 23/11/2026) ; l'écart reste dit quand le total
   le cache. `stock` est le total vendable (tailles à zéro ou plus). */
export function stockLabel(cat, pid, stock, esc) {
  const gap = gapOf(cat, pid), shown = (Number(stock) || 0) + gap;
  return shown < 0 ? '−' + Math.abs(shown) : String(shown) + gapLabel(cat, pid, esc);
}
