/* Encaissement de la caisse boutique · « Vendu par » : dans un commerce où une
 * seule caissière encaisse pour plusieurs vendeurs, elle touche le nom du
 * vendeur parmi les pastilles posées au-dessus des modes de paiement. Pas de
 * bouton de plus : la rangée EST le choix, comme « Partager » juste au-dessus.
 *
 * · Les vendeurs sont les fiches Équipe qui ont un taux de commission
 *   (/api/sellers). Gardés par commerce pour la caisse hors ligne.
 * · Le choix vit sur le ticket : il tient si l'écran se redessine (paiement en
 *   deux fois) et repart vide au ticket suivant. Aucun vendeur par défaut, pour
 *   qu'un ticket oublié ne crédite personne par erreur.
 * · La vente n'envoie que l'id de la fiche ; le serveur vérifie qu'elle est
 *   active dans CE commerce et prend le nom sur la fiche (functions/api/_seller.js).
 *
 * Seulement avec les options « Commissions vendeurs » ET « Vendeur choisi à
 * l'encaissement » (kiwi-admin), sur la caisse en design 2027. */

export function sellerPickOn(doc = globalThis.document, cfg = globalThis.window?.KiwiConfig) {
  try {
    return cfg?.features?.sellerCommissions === true && cfg?.features?.sellerPicker === true
      && doc?.documentElement?.getAttribute('data-skin-2027') === 'till';
  } catch (_) { return false; }
}

const tr = (s) => { try { return (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s); } catch (_) { return s; } };
const KEY = (slug) => 'kiwiSellers@' + slug;
const REFRESH_MS = 5 * 60000;
const cache = new Map();   // slug → { list, at, loading }

function cleanList(list) {
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && typeof s.id === 'string' && s.id && typeof s.name === 'string' && s.name)
    .slice(0, 60).map((s) => ({ id: s.id.slice(0, 96), name: s.name.slice(0, 80) }));
}

export function cachedSellers(slug, storage = globalThis.localStorage) {
  if (!slug) return [];
  const hit = cache.get(slug);
  if (hit) return hit.list;
  let list = [];
  try { list = cleanList(JSON.parse(storage.getItem(KEY(slug)) || '[]')); } catch (_) {}
  cache.set(slug, { list, at: 0 });
  return list;
}

/* Relit la liste au plus toutes les 5 minutes ; une erreur réseau garde la dernière. */
export function loadSellers(slug, { fetchImpl, storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!slug) return Promise.resolve([]);
  cachedSellers(slug, storage);
  const entry = cache.get(slug);
  if (entry.loading) return entry.loading;
  if (entry.at && now - entry.at < REFRESH_MS) return Promise.resolve(entry.list);
  const get = fetchImpl || globalThis.fetch;
  entry.loading = Promise.resolve()
    .then(() => get('/api/sellers?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }))
    .then((r) => (r && r.ok ? r.json() : null))
    .then((data) => {
      if (data && Array.isArray(data.sellers)) {
        entry.list = cleanList(data.sellers);
        try { storage.setItem(KEY(slug), JSON.stringify(entry.list)); } catch (_) {}
      }
      entry.at = now;
      return entry.list;
    })
    .catch(() => entry.list)
    .finally(() => { entry.loading = null; });
  return entry.loading;
}

export function sellerStripHtml(list, picked, esc) {
  if (!list.length) return '';
  const on = picked && picked.id;
  return `<div class="bq-split bq-seller" role="radiogroup" aria-label="${esc(tr('Vendu par'))}">
      <span class="bq-split-l">${esc(tr('Vendu par'))}</span>
      ${list.map((s) => `<button type="button" class="bq-split-c${s.id === on ? ' is-on' : ''}" role="radio" aria-checked="${s.id === on}" data-bq-seller="${esc(s.id)}">${esc(s.name)}</button>`).join('')}
    </div>`;
}

/* el : la fiche de paiement qui vient d'être dessinée ; ticket : le ticket en cours. */
export function mountSellerPick(el, ticket, { slug, esc, fetchImpl } = {}) {
  if (!el || !ticket || !slug || !sellerPickOn()) return;
  const draw = (list) => {
    const anchor = el.querySelector('.bq-pay-opts');
    if (!anchor || !el.isConnected) return;
    const old = el.querySelector('.bq-seller');
    if (old) old.remove();
    /* Un vendeur retiré de l'équipe entre deux écrans ne reste pas choisi. */
    if (ticket.seller && !list.some((s) => s.id === ticket.seller.id)) ticket.seller = null;
    anchor.insertAdjacentHTML('beforebegin', sellerStripHtml(list, ticket.seller, esc));
    const strip = el.querySelector('.bq-seller');
    if (!strip) return;
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bq-seller]');
      if (!b) return;
      const s = list.find((x) => x.id === b.getAttribute('data-bq-seller'));
      ticket.seller = s && !(ticket.seller && ticket.seller.id === s.id) ? { id: s.id, name: s.name } : null;
      strip.querySelectorAll('[data-bq-seller]').forEach((x) => {
        const yes = !!ticket.seller && x.getAttribute('data-bq-seller') === ticket.seller.id;
        x.classList.toggle('is-on', yes);
        x.setAttribute('aria-checked', String(yes));
      });
    });
  };
  const known = cachedSellers(slug);
  if (known.length) draw(known);
  loadSellers(slug, { fetchImpl }).then((list) => {
    if (list !== known && JSON.stringify(list) !== JSON.stringify(known)) draw(list);
  });
}
