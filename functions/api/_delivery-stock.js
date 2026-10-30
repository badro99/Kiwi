/* Le stock d'une livraison sort à la confirmation (propriétaire, 30 octobre 2026).
 *
 * Avant, la caisse retirait les articles du stock à l'encaissement de la
 * livraison, comme pour une vente au comptoir. Le propriétaire veut que le stock
 * ne bouge qu'une fois la livraison confirmée : payée en entier (espèces à la
 * caisse, virement, « Payé » chez Ozon, confirmation automatique des 15 jours)
 * ou abandonnée (passée en perte : l'article ne reviendra pas).
 *
 *   · La caisse envoie la vente avec `stockHeld: true` et ne touche pas au
 *     stock. /api/sale l'écrit ici, une fois : sale_audit 'delivery-stock-held'.
 *     Sans cette ligne (livraisons d'avant, caisse hors Live), rien ne change :
 *     le stock est déjà sorti à l'encaissement et ne ressort jamais ici.
 *   · À la confirmation, takeHeldStock() retire du catalogue serveur ce qui
 *     n'est pas revenu (le panier figé de la vente moins les retours), avec des
 *     mouvements « vente » à identifiant fixe, puis écrit 'delivery-stock-taken'.
 *     Deux confirmations simultanées ne retirent jamais deux fois : les
 *     identifiants des mouvements sont les mêmes, et le catalogue s'écrit à
 *     révision comparée (même schéma que l'entrée de stock Shopify,
 *     functions/api/channel/shopify/[link].js › applyShopifyOrderStock).
 *   · Un retour d'une livraison retenue ne remet rien en stock : rien n'en est
 *     sorti. GET /api/receivables le dit à la caisse (`stockHeld`).
 *
 * Aucune migration : sale_audit existe partout. */
import { __test as catalogFns } from './catalog.js';

const HELD = 'delivery-stock-held';
const TAKEN = 'delivery-stock-taken';
const colorMatch = (v, color) => String(v.colorId || '') === String(color || '')
  || String(v.colorFamily || '') === String(color || '');

export async function markStockHeld(db, merchant, saleId, saleTs) {
  if (!db || !merchant || !saleId) return false;
  await db.prepare(
    `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
     SELECT ?, ?, '${HELD}', '', '', '', '', 0, 0, 'delivery', '', ?, '{}', ?
      WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = '${HELD}')`
  ).bind(merchant, saleId, Number(saleTs) || 0, Date.now(), merchant, saleId).run();
  return true;
}

/* Les livraisons du commerce dont le stock attend encore la confirmation. */
export async function heldStockSales(db, merchant) {
  const held = new Set();
  try {
    const rs = await db.prepare(`SELECT sale_id FROM sale_audit h WHERE h.merchant = ? AND h.action = '${HELD}'
      AND NOT EXISTS (SELECT 1 FROM sale_audit t WHERE t.merchant = h.merchant AND t.sale_id = h.sale_id AND t.action = '${TAKEN}')`)
      .bind(merchant).all();
    (rs.results || []).forEach((r) => held.add(String(r.sale_id)));
  } catch (_) { /* table absente : rien de retenu */ }
  return held;
}

/* Cette livraison attend-elle encore la confirmation pour sortir du stock ? */
export async function isStockHeld(db, merchant, saleId) {
  try {
    const rs = await db.prepare(`SELECT action FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action IN ('${HELD}', '${TAKEN}')`)
      .bind(merchant, saleId).all();
    const acts = new Set((rs.results || []).map((r) => String(r.action)));
    return acts.has(HELD) && !acts.has(TAKEN);
  } catch (_) { return false; }
}

/* Les quantités qui ne sont pas revenues, par ligne du panier. */
async function keptQty(db, merchant, saleId, basket) {
  const back = new Map();
  const rs = await db.prepare(`SELECT impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-return'`)
    .bind(merchant, saleId).all();
  (rs.results || []).forEach((r) => {
    let lines = [];
    try { lines = (JSON.parse(r.impact || '{}') || {}).lines || []; } catch (_) { lines = []; }
    lines.forEach((l) => { const i = Number(l && l.i), q = Number(l && l.q) || 0; if (Number.isSafeInteger(i)) back.set(i, (back.get(i) || 0) + q); });
  });
  return basket.map((l, i) => Math.max(0, (Number(l && l.q) || 0) - (back.get(i) || 0)));
}

/* Retire le stock d'une livraison retenue, une seule fois. Rend { applied,
 * short } ; ne lève jamais : une confirmation ne doit jamais échouer à cause
 * du stock. */
export async function takeHeldStock(env, merchant, saleId) {
  const db = env && env.DB;
  if (!db || !merchant || !saleId) return { applied: 0, short: 0 };
  try {
    const flags = await db.prepare(`SELECT action FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action IN ('${HELD}', '${TAKEN}')`)
      .bind(merchant, saleId).all();
    const acts = new Set((flags.results || []).map((r) => String(r.action)));
    if (!acts.has(HELD) || acts.has(TAKEN)) return { applied: 0, short: 0 };
    const sale = await db.prepare('SELECT lines FROM sales WHERE merchant = ? AND id = ?').bind(merchant, saleId).first();
    let basket = [];
    try { basket = JSON.parse(sale && sale.lines || '[]'); } catch (_) { basket = []; }
    if (!Array.isArray(basket)) basket = [];
    const kept = await keptQty(db, merchant, saleId, basket);
    const tag = String(saleId).replace(/[^a-zA-Z0-9_-]/g, '').slice(-40);
    let result = null;
    for (let attempt = 0; attempt < 4 && !result; attempt++) {
      const row = await db.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
      if (!row || !row.data) { result = { applied: 0, short: kept.reduce((a, b) => a + b, 0) }; break; }
      let raw;
      try { raw = JSON.parse(row.data); } catch (_) { return { applied: 0, short: 0 }; }
      if (Array.isArray(raw.moves) && raw.moves.length > 11000) return { applied: 0, short: 0 };   // réessayé à la prochaine confirmation lue
      const data = catalogFns.sanitize(raw);
      catalogFns.materialize(data);
      const existing = new Set((data.moves || []).map((m) => String(m.id)));
      const left = new Map(data.variants.map((v) => [v.id, Math.max(0, Number(v.stock) || 0)]));
      let applied = 0, short = 0, at = Date.now();
      basket.forEach((line, i) => {
        let want = kept[i];
        if (!want) return;
        const [pid, size, color] = String(line && line.v || '').split(':');
        if (!pid) { short += want; return; }
        const variants = (data.variants || []).filter((v) => v.productId === pid
          && String(v.size || '') === String(size || '') && colorMatch(v, color))
          .sort((a, b) => (String(b.colorId) === color ? 1 : 0) - (String(a.colorId) === color ? 1 : 0));
        variants.forEach((v, k) => {
          if (!want) return;
          const id = `dlv-${tag}-${i}-${k}`;
          if (existing.has(id)) { want = 0; return; }
          const take = Math.min(want, left.get(v.id) || 0);
          if (!take) return;
          left.set(v.id, left.get(v.id) - take);
          data.moves.push({ id, vid: v.id, d: -take, at: at++, why: 'vente', ref: String(saleId).slice(0, 64) });
          existing.add(id); applied++; want -= take;
        });
        short += want;
      });
      if (!applied) { result = { applied: 0, short }; break; }
      catalogFns.materialize(catalogFns.compactForWrite(data));
      let write = null;
      try {
        write = await db.prepare('UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?')
          .bind(JSON.stringify(data), Number(row.rev || 0) + 1, Date.now(), merchant, Number(row.rev || 0)).run();
      } catch (_) { write = null; }
      if (write && write.meta && Number(write.meta.changes) === 1) result = { applied, short };
    }
    if (!result) return { applied: 0, short: 0 };   // le catalogue a bougé quatre fois : la prochaine confirmation lue réessaiera
    await db.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
       SELECT ?, ?, '${TAKEN}', '', '', '', '', 0, 0, 'delivery', '', 0, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = '${TAKEN}')`
    ).bind(merchant, saleId, JSON.stringify(result), Date.now(), merchant, saleId).run();
    return result;
  } catch (_) { return { applied: 0, short: 0 }; }
}
