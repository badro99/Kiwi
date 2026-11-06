/* Caisse boutique et maison · ce qui se REND, c'est ce que la cliente a PAYÉ, au centime.
 *
 * La récompense fidélité baisse le TICKET, pas les lignes. On répartit donc ce
 * qui a été payé sur les lignes (plus fort reste : la somme des parts vaut
 * exactement le payé), puis, à l'intérieur d'une ligne de n pièces, on rend en
 * cumul : les k pièces suivantes valent cumul(déjà rendues + k) - cumul(déjà
 * rendues). Rendre toutes les pièces, en une fois ou en dix, rend donc EXACTEMENT
 * la part payée de la ligne : plus de centime perdu à l'arrondi de chaque pièce.
 * Un ticket sans récompense (payé >= somme des lignes) garde prix x quantité. */
const cents = (v) => Math.round((Number(v) || 0) * 100);
export function lineBudgets(sale) {
  const lines = (sale && sale.lines) || [];
  const gross = lines.map((l) => cents(l && l.unit) * (Number(l && l.qty) || 0));
  const total = gross.reduce((a, b) => a + b, 0);
  const paidMad = sale && (sale.balanceTotal != null ? Number(sale.balanceTotal) : Number(sale.total));
  if (!sale || !sale.reward || !(total > 0) || !Number.isFinite(paidMad) || paidMad < 0) return gross;
  const paid = cents(paidMad);
  if (paid >= total) return gross;
  const share = gross.map((g) => Math.floor(g * paid / total));
  let left = paid - share.reduce((a, b) => a + b, 0);
  gross.map((g, i) => [(g * paid) % total, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => { if (left > 0) { share[i] += 1; left -= 1; } });
  return share;
}
/* Centimes rendus pour `qty` pièces de la ligne `idx`, `returned` pièces étant déjà rendues. */
export function paidCents(sale, idx, returned, qty) {
  const n = Number(sale && sale.lines && sale.lines[idx] && sale.lines[idx].qty) || 0;
  if (!(n > 0)) return 0;
  const budget = lineBudgets(sale)[idx] || 0;
  const r = Math.max(0, Math.min(n, Math.floor(Number(returned) || 0)));
  const k = Math.max(0, Math.min(n - r, Math.floor(Number(qty) || 0)));
  return Math.floor(budget * (r + k) / n) - Math.floor(budget * r / n);
}
