/* Kiwi · Meilleures ventes, l'onglet d'ouverture des caisses boutique et maison.
 *
 * Décision propriétaire, 21 nov. 2026 : à l'ouverture, la grille ne montre plus
 * « Tous » mais les articles les plus vendus du magasin. Un magasin neuf n'a
 * rien à classer : « Tous » reste le défaut jusqu'à sa première semaine pleine
 * de ventes, puis l'onglet « Meilleures ventes » apparaît en tête et devient
 * celui de l'ouverture.
 *
 * Le classement vient du serveur (functions/api/bestsellers.js : quantités des
 * 30 derniers jours par identifiant d'article, ventes annulées et
 * remboursements exclus, `ready` après 7 jours de ventes). Il est gardé par
 * magasin dans localStorage pour être là dès le premier dessin, puis relu toutes
 * les 30 minutes. Hors ligne, la caisse garde le dernier classement ; sans
 * classement, rien ne change.
 *
 * Les articles sont pris dans les rayons de la caisse, donc dans le catalogue
 * d'aujourd'hui : un article supprimé ne revient pas par l'historique, et la
 * caisse écarte ce qu'elle ne peut pas vendre (épuisé).
 */
const KEY = 'kiwiBestsellers@';
const FRESH = 30 * 60e3;
const RETRY = 5 * 60e3;
const MAX = 24;
const mem = {};
const pending = {};
const chosen = new Set();   // magasins où la caissière a déjà choisi un onglet

function read(m) {
  if (mem[m]) return mem[m];
  try {
    const d = JSON.parse(localStorage.getItem(KEY + m) || 'null');
    if (d && Array.isArray(d.ids)) return (mem[m] = d);
  } catch (_) {}
  return null;
}

function refresh(m, redraw) {
  const d = read(m);
  if (pending[m] || typeof fetch !== 'function') return;
  if (d && Date.now() - d.at < (d.failed ? RETRY : FRESH)) return;
  pending[m] = fetch('/api/bestsellers?merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !j.ok) { mem[m] = { ...(d || { ready: false, ids: [] }), at: Date.now(), failed: true }; return; }
      const next = { at: Date.now(), ready: !!j.ready, ids: (Array.isArray(j.items) ? j.items : []).map((x) => String(x && x.i)).filter(Boolean).slice(0, 60) };
      const changed = !d || d.ready !== next.ready || d.ids.join('|') !== next.ids.join('|');
      mem[m] = next;
      try { localStorage.setItem(KEY + m, JSON.stringify(next)); } catch (_) {}
      if (changed && typeof redraw === 'function') try { redraw(); } catch (_) {}
    })
    .catch(() => { mem[m] = { ...(d || { ready: false, ids: [] }), at: Date.now(), failed: true }; })
    .finally(() => { delete pending[m]; });
}

/* Les meilleures ventes encore vendables, dans l'ordre du classement, ou null
 * tant que le magasin n'a pas sa première semaine (ou hors d'un vrai magasin). */
export function bestItems(merchant, rayons, keep, redraw) {
  if (!merchant) return null;
  refresh(merchant, redraw);
  const d = read(merchant);
  if (!d || !d.ready || !d.ids.length) return null;
  const byId = new Map();
  (rayons || []).forEach((r) => (r.items || []).forEach((p) => { if (p && p.id != null && !byId.has(String(p.id))) byId.set(String(p.id), p); }));
  const out = [];
  for (const id of d.ids) {
    const p = byId.get(id);
    if (p && (!keep || keep(p))) out.push(p);
    if (out.length >= MAX) break;
  }
  return out.length ? out : null;
}

/* L'onglet d'ouverture. « Meilleures ventes » remplace « Tous » une fois que le
 * classement existe, tant que la caissière n'a rien choisi ; si le classement
 * disparaît (tout épuisé), la grille revient sur « Tous » plutôt que de rester
 * vide sans onglet sélectionné. */
export function bestOpen(state, merchant, best, key = 'rayon') {
  if (!best && state[key] === '_best') state[key] = 'tous';
  else if (best && state[key] === 'tous' && !chosen.has(merchant)) state[key] = '_best';
}

/* La caissière a touché un onglet : son choix reste le sien jusqu'au rechargement. */
export function bestTouched(merchant) { if (merchant) chosen.add(merchant); }

export const BEST_LABEL = 'Meilleures ventes';
