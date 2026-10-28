/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : une commande annulée ou remboursée rend ses pièces au stock
 *
 * orders/create retire du stock Kiwi les pièces de la commande (mouvements
 * « vente » so-<commande>-<ligne>, voir applyShopifyOrderStock). Avant ce
 * module, rien ne les rendait : une commande annulée ou remboursée dans Shopify
 * laissait le stock Kiwi trop bas et le ticket en attente.
 *
 * Règles :
 *  · on ne rend que ce que Kiwi a réellement retiré (le mouvement so-… porte la
 *    quantité effectivement journalisée, pas celle de la commande) ;
 *  · une ligne ne peut jamais être rendue deux fois : annulation et remboursement
 *    d'une même commande se partagent le plafond « retiré − déjà rendu » ;
 *  · chaque mouvement a un identifiant déterministe (sx-… annulation, sr-…
 *    remboursement) : rejouer le webhook n'ajoute rien ;
 *  · un comptage physique saisi APRÈS la vente contient déjà la pièce (elle n'a
 *    jamais quitté l'étagère) : la ligne est sautée, comme dans le rattrapage ;
 *  · comme l'entrée, ce chemin n'écrit PAS dans la file sortante : Shopify a
 *    déjà remis (ou non) sa propre quantité, l'écho doublerait le retour.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { __test as catalogFns } from '../catalog.js';
import { saleMoveId, reversalMoveId } from './_move-ids.js';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const CANCELLABLE = "('pending','accepted','ready')";

/* Rend, ligne par ligne, ce que la commande avait retiré.
 *   wanted : null (tout ce qui reste) ou Map(idLigne → quantité demandée)
 *   kind   : 'cancel' | 'refund' (+ refundId) */
export async function restockShopifyOrder(env, merchant, ref, wanted, kind, refundId = '') {
  const shopRef = `shopify:${ref}`.slice(0, 64);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first().catch(() => null);
    if (!row || !row.data) return { done: true, restored: 0, skipped: 0 };   // aucun catalogue : rien n'a pu être retiré
    let raw;
    try { raw = JSON.parse(row.data); } catch (_) { return { done: false }; }
    if (Array.isArray(raw.moves) && raw.moves.length > 11000) return { done: false };   // journal non compacté
    const data = catalogFns.sanitize(raw);
    catalogFns.materialize(data);
    const moves = data.moves || [];
    const ids = new Set(moves.map((m) => String(m.id)));
    const mine = moves.filter((m) => m.ref === shopRef);
    const deducted = mine.filter((m) => String(m.id).startsWith('so-') && m.d < 0);
    const restoredOf = (key) => mine
      .filter((m) => /^s[xr]-/.test(String(m.id)) && String(m.id).endsWith('-' + key))
      .reduce((s, m) => s + Math.max(0, Number(m.d) || 0), 0);

    const targets = [];     // { move, ask }
    if (wanted) {
      for (const [lineId, qty] of wanted) {
        const move = deducted.find((m) => m.id === saleMoveId(ref, lineId));
        if (move) targets.push({ move, ask: qty });
      }
    } else {
      for (const move of deducted) targets.push({ move, ask: Infinity });
    }

    let restored = 0, skipped = 0, at = Date.now();
    for (const { move, ask } of targets) {
      const key = String(move.id).slice(3);
      const room = -move.d - restoredOf(key);
      const take = Math.min(room, ask);
      if (!(take > 0)) continue;
      const variant = (data.variants || []).find((v) => v.id === move.vid);
      if (!variant) { skipped++; continue; }
      const countedAt = Number(variant.baseAt || variant.stockAt || 0);
      // Un comptage plus récent que la vente décrit l'étagère : la pièce y est déjà.
      if (countedAt >= move.at) { skipped++; continue; }
      const id = reversalMoveId(kind, key, refundId);
      if (ids.has(id)) continue;
      at = Math.max(at + 1, countedAt + 1);
      moves.push({ id, vid: move.vid, d: take, at, why: 'retour', ref: shopRef });
      ids.add(id);
      mine.push(moves[moves.length - 1]);
      restored += take;
    }
    if (!restored) return { done: true, restored: 0, skipped };
    data.moves = moves;
    catalogFns.materialize(data);
    const write = await env.DB.prepare(
      'UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?'
    ).bind(JSON.stringify(data), Number(row.rev || 0) + 1, Date.now(), merchant, Number(row.rev || 0)).run().catch(() => null);
    if (write && write.meta && Number(write.meta.changes) === 1) return { done: true, restored, skipped };
  }
  return { done: false };
}

async function findOrder(env, merchant, ref) {
  return env.DB.prepare(
    `SELECT id, status, total, customer FROM orders
      WHERE merchant = ? AND channel = 'shopify' AND ext_ref = ?`
  ).bind(merchant, str(ref, 48)).first();
}

/* Le ticket est annulé (rejeté, acteur « Shopify ») tant qu'il n'a pas été servi
 * ni encaissé ; un ticket déjà servi garde son état et reçoit seulement la mention. */
async function markCancelled(env, merchant, orderId, state) {
  const now = Date.now();
  const live = `status IN ${CANCELLABLE} AND paid_ts IS NULL`;
  await env.DB.prepare(
    `UPDATE orders SET
        status = CASE WHEN ${live} THEN 'rejected' ELSE status END,
        cancel_actor_id = CASE WHEN ${live} THEN 'shopify' ELSE cancel_actor_id END,
        cancel_actor_name = CASE WHEN ${live} THEN 'Shopify' ELSE cancel_actor_name END,
        cancel_ts = CASE WHEN ${live} THEN ? ELSE cancel_ts END,
        customer = json_set(CASE WHEN json_valid(customer) THEN customer ELSE '{}' END, '$.shopifyState', ?),
        updated_ts = ?
      WHERE id = ? AND merchant = ?`
  ).bind(now, state, now, orderId, merchant).run();
}

function refundAmount(refund) {
  const tx = Array.isArray(refund && refund.transactions) ? refund.transactions : [];
  return Math.round(tx
    .filter((t) => t && (!t.kind || t.kind === 'refund') && !/^(failure|error|pending)$/i.test(String(t.status || '')))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
}

/* Annote le ticket du remboursement (une fois par identifiant) et le rejette si
 * l'ensemble des remboursements couvre le total de la commande. */
async function markRefunded(env, merchant, order, refundId, amount) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = attempt ? await env.DB.prepare('SELECT id, status, total, customer FROM orders WHERE id = ? AND merchant = ?').bind(order.id, merchant).first() : order;
    if (!row) return;
    /** @type {Record<string, any>} */ let cust = {};
    try { cust = row.customer ? JSON.parse(row.customer) || {} : {}; } catch (_) { cust = {}; }
    const refunds = Array.isArray(cust.refunds) ? cust.refunds.slice(0, 19) : [];
    if (refunds.some((r) => r && r.id === refundId)) return;
    refunds.push({ id: refundId, amount, ts: Date.now() });
    const refunded = Math.round(refunds.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
    const full = Number(row.total) > 0 && refunded >= Number(row.total) - 0.005;
    cust.refunds = refunds;
    cust.shopifyState = full ? 'refunded' : 'partially-refunded';
    const now = Date.now();
    const live = `status IN ${CANCELLABLE} AND paid_ts IS NULL`;
    const w = await env.DB.prepare(
      `UPDATE orders SET customer = ?, updated_ts = ?,
          status = CASE WHEN ? = 1 AND ${live} THEN 'rejected' ELSE status END,
          cancel_actor_id = CASE WHEN ? = 1 AND ${live} THEN 'shopify' ELSE cancel_actor_id END,
          cancel_actor_name = CASE WHEN ? = 1 AND ${live} THEN 'Shopify' ELSE cancel_actor_name END,
          cancel_ts = CASE WHEN ? = 1 AND ${live} THEN ? ELSE cancel_ts END
        WHERE id = ? AND merchant = ? AND customer IS ?`
    ).bind(JSON.stringify(cust), now, full ? 1 : 0, full ? 1 : 0, full ? 1 : 0, full ? 1 : 0, now, row.id, merchant, row.customer).run();
    if (w && w.meta && Number(w.meta.changes) === 1) return;
  }
}

/* Point d'entrée des deux sujets. Rend { done:false } quand rien n'est durable
 * (le webhook répond alors 503 et Shopify réessaie). Une commande inconnue de
 * Kiwi n'est pas une erreur : 200, sinon Shopify réessaierait 48 h puis
 * retirerait l'abonnement. */
export async function reverseShopifyOrder(env, merchant, topic, payload) {
  const refund = topic === 'refunds/create';
  const ref = str(refund ? payload && payload.order_id : payload && (payload.id || payload.name), 36);
  if (!ref) return { done: true, ignored: 'sans-commande' };

  let wanted = null, refundId = '';
  if (refund) {
    refundId = str(payload && payload.id, 64);
    if (!refundId) return { done: true, ignored: 'remboursement-sans-id' };
    wanted = new Map();
    const items = Array.isArray(payload.refund_line_items) ? payload.refund_line_items : [];
    for (const item of items) {
      if (!item || item.restock_type === 'no_restock') continue;
      const lineId = str(item.line_item_id || (item.line_item && item.line_item.id), 64);
      const qty = Math.max(0, Math.round(Number(item.quantity) || 0));
      if (lineId && qty) wanted.set(lineId, (wanted.get(lineId) || 0) + qty);
    }
  } else {
    /* Annulée avant que le stock d'entrée soit passé : rien ne doit plus être retiré. */
    await env.DB.prepare(
      `UPDATE shopify_inbound_stock SET status = 'done', last_error = 'commande-annulee', updated_ts = ?
        WHERE merchant = ? AND order_ref = ? AND status = 'pending'`
    ).bind(Date.now(), merchant, ref).run().catch(() => {});
  }

  const stock = wanted && !wanted.size
    ? { done: true, restored: 0, skipped: 0 }
    : await restockShopifyOrder(env, merchant, ref, wanted, refund ? 'refund' : 'cancel', refundId);
  if (!stock.done) return { done: false };

  let order = null;
  try { order = await findOrder(env, merchant, ref); } catch (_) { return { done: false }; }
  if (!order) return { done: true, restored: stock.restored, order: 'inconnue' };
  try {
    if (refund) await markRefunded(env, merchant, order, refundId, refundAmount(payload));
    else await markCancelled(env, merchant, order.id, 'cancelled');
  } catch (_) { return { done: false }; }
  return { done: true, restored: stock.restored, skipped: stock.skipped, order: order.id };
}
