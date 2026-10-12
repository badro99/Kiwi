/* Kiwi · « souvent pris ensemble », le calcul.
 *
 * Pur et sans dépendance, pour que la route (functions/api/pairs.js) et son
 * banc (tools/pairs-api-test.mjs) exécutent le même code. Entrée : les lignes
 * des tickets, telles que la caisse les envoie (`{i, n, q, kd}` : id d'article,
 * nom, quantité, nature). Sortie : pour chaque article, au plus trois articles
 * que ses tickets contiennent aussi souvent, avec la preuve.
 *
 * Règles, les mêmes que la carte du tableau de bord (assets/dateRange.js ›
 * realPairs) plus une, propre à une suggestion faite au comptoir :
 *   · rien sous MIN_BASKETS tickets à plusieurs articles ;
 *   · une paire compte à partir de MIN_TOGETHER tickets communs ;
 *   · et, pour être proposée après l'article A, l'article B doit figurer dans
 *     au moins MIN_SHARE des tickets de A : on ne suggère pas un thé à chaque
 *     plat parce que le thé est partout.
 * Seules les lignes qui portent un id d'article comptent : la caisse doit
 * pouvoir ajouter ce qu'elle propose. Les éléments d'une formule (kd
 * « formula-part ») sont dans la formule, pas choisis à côté. */
export const MIN_BASKETS = 20;
export const MIN_TOGETHER = 5;
export const MIN_SHARE = 0.25;
export const MAX_PARTNERS = 3;
const MAX_KEYS = 40;

export function basketKeys(lines) {
  const keys = new Map();
  (Array.isArray(lines) ? lines : []).forEach((l) => {
    if (!l || typeof l !== 'object') return;
    const id = String(l.i || '').trim().slice(0, 80);
    const qty = Number(l.q);
    if (!id || !(qty > 0) || String(l.kd || '') === 'formula-part' || keys.size >= MAX_KEYS) return;
    if (!keys.has(id)) keys.set(id, String(l.n || '').slice(0, 80));
  });
  return keys;
}

export function computePairs(baskets) {
  const seen = new Map(), names = new Map(), together = new Map();
  let multi = 0;
  (Array.isArray(baskets) ? baskets : []).forEach((lines) => {
    const keys = basketKeys(lines);
    keys.forEach((name, id) => {
      seen.set(id, (seen.get(id) || 0) + 1);
      if (name && !names.has(id)) names.set(id, name);
    });
    if (keys.size < 2) return;
    multi++;
    const ids = [...keys.keys()].sort();
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const k = ids[a] + '\u0000' + ids[b];
        together.set(k, (together.get(k) || 0) + 1);
      }
    }
  });
  const pairs = {};
  if (multi < MIN_BASKETS) return { baskets: multi, pairs };
  const add = (lead, other, n) => {
    const share = n / Math.max(1, seen.get(lead) || 0);
    if (share < MIN_SHARE) return;
    (pairs[lead] = pairs[lead] || []).push({ i: other, n: names.get(other) || '', together: n, share: Math.round(share * 1000) / 1000 });
  };
  together.forEach((n, k) => {
    if (n < MIN_TOGETHER) return;
    const [x, y] = k.split('\u0000');
    add(x, y, n);
    add(y, x, n);
  });
  Object.keys(pairs).forEach((lead) => {
    pairs[lead] = pairs[lead]
      .sort((p, q) => q.together - p.together || q.share - p.share || p.i.localeCompare(q.i))
      .slice(0, MAX_PARTNERS);
  });
  return { baskets: multi, pairs };
}
