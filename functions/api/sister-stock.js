// /api/sister-stock — le stock d'un AUTRE magasin du même propriétaire, en lecture.
//
//   GET ?merchant=<mon magasin>                 → les magasins liés : { self, stores }
//   GET ?merchant=<mon magasin>&store=<frère>   → l'inventaire du frère, réduit
//
// Le besoin (Santos, 2026-11-19) : à Rabat, un article est en rupture ; la
// vendeuse regarde à la caisse s'il en reste à Casablanca, vend au client et le
// fait livrer. La caisse ne VEND et ne BOUGE que le stock de son propre
// magasin ; celui de l'autre ville se regarde, c'est tout. La commande entre
// magasins passe par un autre chemin.
//
// Trois règles, tenues ICI et pas seulement à l'écran :
//   1. Il n'y a que GET. Aucune écriture n'existe sur cette route ; le stock du
//      frère ne peut bouger que par /api/catalog, qui exige la preuve de CE
//      magasin-là (tenantFor strict). Une page modifiée à Rabat ne peut donc ni
//      vendre ni décompter une pièce de Casablanca.
//   2. Le lien est celui du CATALOGUE PARTAGÉ (console God mode,
//      `features.sharedCatalog`, functions/api/_catalog-family.js) : même compte,
//      même métier, interrupteur allumé sur chaque boutique, aucune suspendue.
//      Des boutiques qui vendent les mêmes articles, et seulement elles. Éteint
//      par défaut ; un compte qui n'a rien demandé ne voit rien changer.
//   3. La réponse est réduite à ce que la question justifie : article, rayon,
//      prix de vente, taille, couleur, quantité, codes-barres (pour scanner).
//      Jamais de coût d'achat, de fournisseur, de déposant, ni de journal.
//
// Pourquoi pas /api/stock/lookup : il répond article par article sur TOUT le
// compte et reste fermé aux caisses (tools/till-gate-test.mjs). Ici la caisse
// parcourt l'inventaire d'un frère que l'opérateur a lié, rien d'autre.

import { json } from '../auth/_lib.js';
import { loadParts } from './_catalog-parts.js';
import { tenantFor } from './_private.js';
import { materialize } from './_rules-catalog.js';
import { catalogFamily } from './_catalog-family.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_STORES = 12;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

/* Les autres boutiques de la famille de `merchant`, avec leur nom, relues du
 * registre à chaque appel. Jamais une liste venue du navigateur. */
async function sisters(env, merchant) {
  const fam = await catalogFamily(env, merchant);
  if (!fam) return null;
  const names = {};
  for (const m of fam.members) {
    const r = await env.DB.prepare('SELECT name FROM merchant_config WHERE merchant = ?').bind(m).first();
    names[m] = str((r && r.name) || m, 80);
  }
  const stores = fam.members.filter((m) => m !== merchant).slice(0, MAX_STORES)
    .map((m) => ({ merchant: m, name: names[m] }));
  return { self: { merchant, name: names[merchant] }, stores };
}

/* L'inventaire réduit. Le stock est MATÉRIALISÉ (socle + mouvements), le même
 * calcul que la caisse du frère. */
function reduce(raw) {
  const db = raw && typeof raw === 'object' ? raw : {};
  const products = Array.isArray(db.products) ? db.products : [];
  const variants = Array.isArray(db.variants) ? db.variants : [];
  materialize({ variants, moves: Array.isArray(db.moves) ? db.moves : [] });
  const cats = {};
  for (const c of Array.isArray(db.categories) ? db.categories : []) if (c && c.id) cats[c.id] = str(c.name, 60);
  const live = new Set();
  const outP = [];
  for (const p of products) {
    if (!p || !p.id || !p.name || p.archived || p.format === 'service') continue;
    live.add(p.id);
    outP.push({
      id: str(p.id, 40), name: str(p.name, 120),
      category: (p.categoryId && cats[p.categoryId]) || '',
      price: Math.max(0, Number(p.priceMAD) || 0),
      sku: str(p.sku, 48),
    });
  }
  const outV = [];
  for (const v of variants) {
    if (!v || !live.has(v.productId)) continue;
    outV.push({
      productId: str(v.productId, 40),
      size: str(v.size, 12),
      color: str(v.colorLabel || v.colorFamily || '', 40),
      hex: str(v.colorHex, 9),
      stock: Math.max(0, Math.round(Number(v.stock) || 0)),
      codes: (Array.isArray(v.barcodes) ? v.barcodes : [])
        .map((b) => str(typeof b === 'string' ? b : b && b.code, 40)).filter(Boolean).slice(0, 12),
    });
  }
  return { products: outP, variants: outV };
}

export const __test = { reduce };

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = str(url.searchParams.get('merchant'), 64).trim().toLowerCase();
  const store = str(url.searchParams.get('store'), 64).trim().toLowerCase();
  const headers = { 'Cache-Control': 'no-store' };
  if (!SLUG.test(merchant) || (store && !SLUG.test(store))) return json({ error: 'bad-request' }, 400, headers);
  if (!env.DB) return json({ ok: true, stores: [], unconfigured: true }, 200, headers);

  /* La preuve porte sur le magasin d'où l'on parle — caisse appairée, session du
   * propriétaire ou opérateur — et doit répondre CE magasin, pas un repli. */
  const who = await tenantFor(request, env, merchant);
  if (!who || who !== merchant) return json({ error: 'unauthorized' }, 401, headers);

  let set;
  try { set = await sisters(env, merchant); } catch (_) { set = null; }
  if (!set) return json({ ok: true, self: { merchant }, stores: [] }, 200, headers);
  if (!store) return json({ ok: true, ...set }, 200, headers);

  const sib = set.stores.find((s) => s.merchant === store);
  if (!sib) return json({ error: 'not-linked' }, 403, headers);
  let row = null;
  try {
    row = await loadParts(env.DB, store, await env.DB.prepare('SELECT data, updated_ts FROM catalogs WHERE merchant = ?').bind(store).first());
  } catch (_) { return json({ ok: true, store: sib, known: false, products: [], variants: [] }, 200, headers); }
  if (!row || !row.data) return json({ ok: true, store: sib, known: false, products: [], variants: [] }, 200, headers);
  let raw = null;
  try { raw = JSON.parse(row.data); } catch (_) { raw = null; }
  return json({ ok: true, store: sib, known: !!raw, updated_ts: Number(row.updated_ts) || 0, read_ts: Date.now(), ...reduce(raw) }, 200, headers);
}
