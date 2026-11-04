/* Le document « promotions » d'une boutique : ce que le serveur accepte d'enregistrer.
 * Le client normalise tout avant d'écrire (assets/promos.js) ; le serveur ne se fie
 * pas à lui. Un taux de 250 %, un type inconnu ou une fenêtre à l'envers ne doivent
 * pas atteindre la caisse appairée qui relit ce document pour fixer un prix.
 * Rend le motif du refus, ou null. */
const KINDS = ['percent', 'amount', 'fixed'];
const SCOPES = ['tout', 'rayon', 'produits', 'avant', 'stock'];
const MAX_MAD = 1e7;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function badPromotion(doc) {
  const list = doc && doc.promos;
  if (list === undefined) return null;
  if (!Array.isArray(list)) return 'promos-not-a-list';
  for (const p of list) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'promo-not-an-object';
    if (typeof p.id !== 'string' || !p.id) return 'promo-id';
    if (!KINDS.includes(p.kind)) return 'promo-kind';
    if (!isNum(p.value) || p.value < 0 || p.value > MAX_MAD) return 'promo-value';
    if (p.kind === 'percent' && p.value > 100) return 'promo-percent-over-100';
    if (p.scope != null) {
      if (typeof p.scope !== 'object' || !SCOPES.includes(p.scope.type)) return 'promo-scope';
      if (p.scope.before != null && (!isNum(p.scope.before) || p.scope.before < 0)) return 'promo-scope-date';
      if (p.scope.max != null && (!isNum(p.scope.max) || p.scope.max < 0)) return 'promo-scope-max';
    }
    for (const k of ['from', 'to']) if (p[k] != null && (!isNum(p[k]) || p[k] < 0)) return 'promo-date';
    if (p.from && p.to && p.to < p.from) return 'promo-window';
  }
  return null;
}
