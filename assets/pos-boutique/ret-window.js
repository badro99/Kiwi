/* Échanges & avoirs · une journée chargée ne reconstruit pas des centaines de cartes.
 *
 * `renderEchanges` (checkout.js) refaisait tout le DOM des ventes du jour à chaque touche tapée.
 * Ici on borne la liste : 25 cartes d'abord, 25 de plus à chaque « Afficher plus », et la vente
 * en cours de retour reste toujours dans la liste, même au rang 300. Le compteur est gardé par
 * (journée, recherche) : changer l'un ou l'autre revient à 25. */
export const RET_PAGE = 25;
const counts = new Map();
const keyOf = (day, query) => String(day) + '|' + String(query || '').trim().toLowerCase();

export function windowHits(hits, day, query, selectedId) {
  const n = Math.max(RET_PAGE, counts.get(keyOf(day, query)) || 0);
  const list = hits.slice(0, n);
  if (selectedId && !list.some((s) => s.id === selectedId)) {
    const picked = hits.find((s) => s.id === selectedId);
    if (picked) list.push(picked);
  }
  return { list, rest: Math.max(0, hits.length - n) };
}
export function showMoreHits(day, query) {
  const k = keyOf(day, query);
  counts.set(k, Math.max(RET_PAGE, counts.get(k) || 0) + RET_PAGE);
}
export function moreHitsButton(rest, tr, esc) {
  return rest > 0 ? `<button type="button" class="bq-pill bq-ret-more" data-bq-ret-more>${esc(tr('Afficher plus de ventes'))} <small>${rest}</small></button>` : '';
}
