/* L'échange de plusieurs pièces d'un même ticket, boutique et maison.
 *
 * L'échange prend les pièces une à une, dans l'ordre du ticket, chacune avec
 * son remplacement et son règlement. Le chemin d'une pièce reste celui de la
 * caisse (stock, avoir, encaissement) ; on ne fait que l'enchaîner. Une ligne
 * rendue en 2 exemplaires compte 2. Fonctions pures : la caisse donne les
 * lignes cochées et la quantité choisie pour chacune. */

/* picks : indices de lignes cochés ; qtyOf(i) : pièces rendues sur la ligne i. */
export function exchangeQueue(picks, qtyOf) {
  const q = [];
  Array.from(picks).sort((a, b) => a - b).forEach((i) => {
    const n = qtyOf(i);
    for (let k = 0; k < n; k++) q.push(i);
  });
  return q;
}

/* L'échange en cours, passé à la pièce suivante ; null quand il n'en reste plus. */
export function nextExchange(ex) {
  const rest = (ex && ex.queue) || [];
  return rest.length ? Object.assign({}, ex, { idx: rest[0], queue: rest.slice(1), step: (ex.step || 1) + 1 }) : null;
}

export function exchStartToast(saleId, n) {
  return n > 1
    ? `Échange ${saleId}, ${n} pièces, choisissez le remplacement de la première`
    : `Échange ${saleId}, choisissez l'article de remplacement dans la grille`;
}
