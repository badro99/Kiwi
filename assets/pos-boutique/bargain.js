/* Remise à la marocaine : l'arithmétique du prix convenu, sans DOM ni ticket.
 * On ne marchande pas en pourcentage au Maroc : « akher taman ? », et la
 * discussion finit sur un prix rond. La caissière tape ce prix (ou le montant
 * retiré) ; ce module dit si c'est permis et ce que paie chaque pièce.
 * Tout se compte en centimes entiers. Spec :
 * docs/superpowers/specs/2026-11-18-bargain-remise-design.md */

const cents = (v) => Math.round((Number(v) || 0) * 100);

/* Le taux le plus haut que le patron autorise fait le plancher de TOUT geste,
   pourcentage, prix convenu ou montant : sans lui, « −MAD » contournerait la
   liste des remises autorisées. */
export function maxPct(percentages) {
  const list = (Array.isArray(percentages) ? percentages : []).map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  return list.length ? Math.max(...list) : 0;
}

function floorC(baseC, pct) { return Math.ceil(baseC * (100 - pct) / 100 - 1e-9); }

export function floorUnit(base, pct) { return floorC(cents(base), pct) / 100; }

/* « 299,50 », « 1 234 », « 300 » : ce qu'un doigt tape sur une caisse
   marocaine. Trois décimales ou zéro : null, pas un prix. */
export function parseMad(text) {
  const s = String(text == null ? '' : text).replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const v = Number(s);
  return v > 0 ? v : null;
}

/* Une pièce : mode 'price' (le prix convenu) ou 'amount' (les dirhams retirés). */
export function agreedUnit(base, mode, value, pct) {
  if ((mode !== 'price' && mode !== 'amount') || !(Number(value) > 0)) return { error: 'invalid' };
  const baseC = cents(base);
  const unitC = mode === 'price' ? cents(value) : baseC - cents(value);
  if (unitC >= baseC) return { error: 'above' };
  const fl = floorC(baseC, pct);
  if (unitC < fl) return { error: 'floor', floor: fl / 100 };
  return { unit: unitC / 100, cut: (baseC - unitC) / 100 };
}

/* Le ticket « kolchi b 500 » : chaque pièce paie sa part du total convenu,
   en dirhams ronds, au prorata de son prix ; le reste se pose sur une pièce
   de la ligne la plus chère (coupée en deux si sa quantité dépasse 1), sans
   qu'aucune pièce ne passe sous son plancher ni au-dessus de son prix. Un
   retour rendra ainsi ce que la pièce a vraiment coûté. */
export function spreadTicket(lines, target, pct) {
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => l && cents(l.base) > 0 && Math.round(l.qty) > 0)
    .map((l) => ({ key: l.key, b: cents(l.base), qty: Math.round(l.qty) }));
  const T = cents(target);
  if (!rows.length || !(T > 0)) return { error: 'invalid' };
  const B = rows.reduce((s, r) => s + r.b * r.qty, 0);
  const F = rows.reduce((s, r) => s + floorC(r.b, pct) * r.qty, 0);
  if (T >= B) return { error: 'above' };
  if (T < F) return { error: 'floor', floor: F / 100 };
  const pieces = [];
  rows.forEach((r, i) => {
    const f = floorC(r.b, pct);
    const p = Math.min(r.b, Math.max(f, Math.round(r.b * T / B / 100) * 100));
    for (let k = 0; k < r.qty; k++) pieces.push({ row: i, key: r.key, b: r.b, f, p });
  });
  let R = T - pieces.reduce((s, x) => s + x.p, 0);
  const order = pieces.slice().sort((x, y) => y.b - x.b || x.row - y.row);
  for (const x of order) {
    if (!R) break;
    const d = R > 0 ? Math.min(R, x.b - x.p) : Math.max(R, x.f - x.p);
    x.p += d; R -= d;
  }
  const assign = [];
  for (const x of pieces) {
    const same = assign.find((a) => a.row === x.row && a.c === x.p);
    if (same) same.qty++; else assign.push({ row: x.row, key: x.key, c: x.p, qty: 1 });
  }
  return { assign: assign.map((a) => ({ key: a.key, qty: a.qty, agreed: a.c / 100 })) };
}

/* Le prix d'une pièce : le prix convenu s'il existe (jamais au-dessus du prix
   du moment : une promotion arrivée plus bas reste la meilleure), sinon le
   pourcentage d'avant, calculé par la règle partagée. */
export function unitFor(base, line, pctUnit) {
  const a = line && line.agreed;
  if (a != null && Number.isFinite(Number(a)) && Number(a) > 0) return Math.min(Number(base) || 0, Number(a));
  return pctUnit(base, (line && line.remise) || 0);
}
