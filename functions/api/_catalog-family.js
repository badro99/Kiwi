// Un catalogue, plusieurs boutiques (Santos Store Rabat + Casablanca, 19 nov. 2026).
//
// Deux boutiques du même compte et du même métier, chacune avec
// `features.sharedCatalog = true` (console opérateur), forment une FAMILLE.
// Chaque boutique garde sa ligne `catalogs` (son stock, ses mouvements, ses
// réservations : une vente ne décompte que la boutique de la caisse), mais la
// DÉFINITION des articles est commune : catégories, articles, tailles, couleurs,
// prix, codes-barres, suppressions. Ce qu'une boutique enregistre est fusionné
// dans les autres par la même fusion champ par champ que deux appareils d'un
// même magasin (mergeDocs), après avoir retiré tout ce qui est du stock.
//
// Pourquoi pas un seul document ? Le stock ET les ventes de chaque boutique
// restent à elle, avec ses clôtures et son tableau de bord ; la caisse, la
// réservation de stock et le décompte n'ont pas une ligne à changer.

import { mergeDocs, materialize } from './_rules-catalog.js';
import { loadParts, packCatalog, runCatalogWrite } from './_catalog-parts.js';

const SHARED = 'sharedCatalog';
const shares = (features) => {
  try { const f = JSON.parse(features || '{}'); return !!f && f[SHARED] === true; } catch (_) { return false; }
};

/* Les boutiques de la famille de `merchant`, elle comprise, ou null. Même
 * compte et même métier obligatoires : l'interrupteur seul ne relie jamais
 * deux comptes. Une boutique suspendue ne reçoit plus rien. */
export async function catalogFamily(env, merchant) {
  if (!env || !env.DB || !merchant) return null;
  try {
    const me = await env.DB.prepare('SELECT account_id, type, features FROM merchant_config WHERE merchant = ?')
      .bind(merchant).first();
    if (!me || !me.account_id || !shares(me.features)) return null;
    const rs = await env.DB.prepare(
      'SELECT merchant, features, status FROM merchant_config WHERE account_id = ? AND type IS ? ORDER BY merchant',
    ).bind(me.account_id, me.type == null ? null : me.type).all();
    const members = ((rs && rs.results) || [])
      .filter((r) => shares(r.features) && String(r.status || '') !== 'suspended')
      .map((r) => String(r.merchant));
    if (members.length < 2 || !members.includes(merchant)) return null;
    return { members };
  } catch (_) { return null; }
}

/* Une étiquette courte par boutique, ajoutée aux identifiants qu'elle crée
 * (prod_14_k2x9a) : deux boutiques qui créent un article dans la même minute,
 * avant de s'être vues, ne tombent jamais sur le même identifiant. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function idTagFor(family, merchant) {
  if (!family) return '';
  for (const len of [5, 7]) {
    const tag = (m) => fnv(m).toString(36).padStart(7, '0').slice(-len);
    const mine = tag(merchant);
    if (family.members.filter((m) => tag(m) === mine).length === 1) return mine;
  }
  return fnv(merchant).toString(36);
}

/* Ce qui voyage : tout, sauf le stock. */
export function definitionsOf(doc) {
  const d = JSON.parse(JSON.stringify(doc || {}));
  d.moves = [];
  for (const v of d.variants || []) { delete v.stock; delete v.base; delete v.baseAt; delete v.stockAt; }
  return d;
}

const blank = () => ({ v: 1, categories: [], products: [], variants: [], seq: 0, removed: {}, moves: [] });

/* Le catalogue d'une boutique qui n'en a pas encore : les articles de la
 * famille, à zéro pièce. Écrit une fois (INSERT OR IGNORE), pour qu'une vente
 * puisse y réserver comme partout ailleurs. */
export async function seedFromFamily(env, merchant, family, sanitize) {
  let source = null;
  for (const m of family.members) {
    if (m === merchant) continue;
    let r = null;
    try { r = await loadParts(env.DB, m, await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?').bind(m).first()); } catch (_) { continue; }
    if (!r || !r.data) continue;
    let d; try { d = sanitize(JSON.parse(r.data)); } catch (_) { continue; }
    if (!source || (d.products || []).length > (source.products || []).length) source = d;
  }
  if (!source) return null;
  const data = sanitize(materialize(mergeDocs(blank(), definitionsOf(source), Date.now()).doc));
  const now = Date.now();
  const packed = packCatalog(data);
  await runCatalogWrite(env.DB, merchant, packed, env.DB.prepare('INSERT OR IGNORE INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, 1, ?)')
    .bind(merchant, packed.head, now), false);
  const r = await loadParts(env.DB, merchant, await env.DB.prepare('SELECT data, rev, updated_ts FROM catalogs WHERE merchant = ?').bind(merchant).first());
  if (!r) return null;
  let out = null; try { out = sanitize(JSON.parse(r.data)); } catch (_) {}
  return { data: out, rev: Number(r.rev) || 0, updated_ts: Number(r.updated_ts) || 0 };
}

/* Après une écriture de `merchant`, porter sa définition chez les autres.
 * Une boutique dont rien ne change n'est pas réécrite (sa révision ne bouge
 * pas, ses caisses ne refusionnent rien). Une course perdue est rejouée ; la
 * fusion étant un état complet et non un delta, la prochaine écriture
 * rattrape de toute façon ce qu'un échec aurait laissé. */
export async function syncFamily(env, merchant, data, sanitize) {
  const family = await catalogFamily(env, merchant);
  if (!family) return { synced: [] };
  const synced = [];
  for (const m of family.members) {
    if (m === merchant) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const defs = definitionsOf(data);   // mergeDocs garde les objets reçus : une copie par écriture
      let r;
      try { r = await loadParts(env.DB, m, await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(m).first()); } catch (_) { break; }
      let mine = blank();
      if (r && r.data) { try { mine = sanitize(JSON.parse(r.data)); } catch (_) { break; } }
      const { doc, ahead } = mergeDocs(mine, defs, Date.now());
      /* `ahead.theirs` ne compte pas une suppression reçue (mergeDocs la range
         du côté « à transmettre ») : une suppression nouvelle réécrit aussi. */
      const newTomb = Object.keys(doc.removed || {}).some((id) => !(mine.removed || {})[id]);
      if (r && !ahead.theirs && !newTomb) break;
      const next = sanitize(materialize(doc));
      const rev = (Number(r && r.rev) || 0) + 1;
      const now = Date.now();
      const packed = packCatalog(next);
      const write = r
        ? await runCatalogWrite(env.DB, m, packed, env.DB.prepare('UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?')
          .bind(packed.head, rev, now, m, Number(r.rev) || 0), r.split)
        : await runCatalogWrite(env.DB, m, packed, env.DB.prepare('INSERT OR IGNORE INTO catalogs (merchant, data, rev, updated_ts) VALUES (?, ?, ?, ?)')
          .bind(m, packed.head, rev, now), false);
      if (write && write.meta && Number(write.meta.changes) === 1) { synced.push(m); break; }
    }
  }
  return { synced };
}
