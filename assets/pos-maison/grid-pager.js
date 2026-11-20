/* La grille de la Vente, par pages.
 *
 * La Maison en Vogue a plus de 3 000 articles, dont plus de 500 en stock : la
 * caisse peignait toutes leurs tuiles d'un coup, à chaque arrivée du catalogue,
 * et l'écran restait figé cinq secondes après le code (20 nov. 2026). On peint
 * une première page tout de suite, puis la suivante quand la caissière approche
 * du bas (un témoin observé, 600 px d'avance). Les têtes de rayon restent à leur
 * place, l'index --i continue d'une page à l'autre.
 *
 * Sans IntersectionObserver (vieux navigateur, banc d'essai), tout est peint
 * d'un coup, comme avant. */

/* Le découpage : à partir du curseur {r, k}, prendre n tuiles. Une tête de
   rayon n'est écrite qu'au début de son rayon. Rend { chunks, next }. */
export function mzGridPlan(rayons, at, n) {
  const chunks = [];
  let r = at ? at.r : 0, k = at ? at.k : 0;
  while (n > 0 && r < rayons.length) {
    const items = rayons[r].items || [];
    const take = items.slice(k, k + n);
    if (take.length) chunks.push({ r, head: k === 0, items: take });
    k += take.length; n -= take.length;
    if (k >= items.length) { r++; k = 0; }
  }
  return { chunks, next: r < rayons.length ? { r, k } : null };
}

/* Peint `rayons` dans `wrap`. o = { tile(p, i), head(rayon), after(), first, step, IO };
   after() runs once each later page is in (icônes de la page).
   Rend { done(), all(), observer }. */
export function mzPageGrid(wrap, rayons, o) {
  if (wrap.__mzPager) wrap.__mzPager.stop();
  const IO = o.IO === undefined ? globalThis.IntersectionObserver : o.IO;
  let at = { r: 0, k: 0 }, i = 0, grid = null, observer = null, sentinel = null;
  wrap.innerHTML = '';

  function paint(n) {
    if (!at) return;
    const plan = mzGridPlan(rayons, at, n);
    for (const c of plan.chunks) {
      if (c.head) {
        wrap.insertAdjacentHTML('beforeend', `<div class="mz-cat-head">${o.head(rayons[c.r])}</div><div class="mz-grid"></div>`);
        grid = wrap.lastElementChild;
      }
      grid.insertAdjacentHTML('beforeend', c.items.map((p) => o.tile(p, i++)).join(''));
    }
    at = plan.next;
  }
  function more(n) {
    if (sentinel) sentinel.remove();
    paint(n);
    if (at && sentinel) wrap.appendChild(sentinel);
    else stop();
    if (o.after) o.after();
  }
  function stop() {
    if (observer) { observer.disconnect(); }
    if (sentinel) { sentinel.remove(); sentinel = null; }
    if (wrap.__mzPager === api) wrap.__mzPager = null;
  }
  const api = { done: () => !at, all: () => more(Infinity), stop, observer: null };
  wrap.__mzPager = api;

  if (!IO) { paint(Infinity); wrap.__mzPager = null; return api; }
  paint(o.first || 48);
  if (!at) { wrap.__mzPager = null; return api; }
  sentinel = wrap.ownerDocument.createElement('div');
  sentinel.className = 'mz-grid-more';
  sentinel.setAttribute && sentinel.setAttribute('aria-hidden', 'true');
  wrap.appendChild(sentinel);
  observer = new IO((entries) => { if (entries.some((e) => e.isIntersecting)) more(o.step || 96); }, { rootMargin: '600px 0px' });
  observer.observe(sentinel);
  api.observer = observer;
  return api;
}
