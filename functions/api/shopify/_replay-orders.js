/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify : rattraper les commandes en ligne que Kiwi n'a jamais reçues
 *
 * Vu en production le 21 octobre : Maison 121 refusait depuis le 6 septembre
 * chaque webhook Shopify (domaine permanent, voir samePermanentShop dans
 * channel/shopify/[link].js). Les ventes en ligne de cette période ont bien
 * baissé le stock Shopify, jamais le stock Kiwi. Shopify ne renvoie pas un
 * webhook refusé au-delà de 48 h : il faut aller chercher les commandes.
 *
 * Règles :
 *  · une ligne = un mouvement « vente » daté de la COMMANDE, avec le même
 *    identifiant que celui du webhook (so-<commande>-<ligne>) : rejouer deux
 *    fois, ou recevoir plus tard le webhook de la même commande, ne retire
 *    jamais deux fois la même pièce ;
 *  · une variante comptée (stock saisi) APRÈS la commande l'a déjà dans son
 *    chiffre : la ligne est sautée et dite « déjà comptée » ;
 *  · la quantité est la quantité COURANTE de la ligne (après retours et
 *    retraits), une commande annulée ou de test ne compte pas ;
 *  · `dryRun` dit tout ce qui serait fait, sans rien écrire.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { __test as catalogFns } from '../catalog.js';
import { shopifyGraphQL } from './_lib.js';

const MAX_ORDERS = 1000;
const tail = (gid) => String(gid || '').split('/').pop();

export async function listShopifyOrdersSince(env, merchant, sinceTs) {
  const since = new Date(Math.max(0, Number(sinceTs) || 0)).toISOString();
  const query = `query KiwiMissedOrders($q: String!, $after: String) {
    orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name createdAt cancelledAt test
        lineItems(first: 100) { nodes { id currentQuantity variant { id } } }
      }
    }
  }`;
  const out = [];
  let after = null;
  do {
    const res = await shopifyGraphQL(env, merchant, query, { q: `created_at:>='${since}'`, after });
    const page = (res.data && res.data.orders) || {};
    for (const o of page.nodes || []) out.push(o);
    after = page.pageInfo && page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after && out.length < MAX_ORDERS);
  return out.slice(0, MAX_ORDERS);
}

/* Le cœur, sans réseau : des commandes déjà lues, le catalogue, les liens. */
export function planReplay(data, links, orders) {
  const existing = new Set((data.moves || []).map((m) => String(m.id)));
  const byId = new Map((data.variants || []).map((v) => [v.id, v]));
  const plan = { orders: 0, skippedOrders: 0, apply: [], counted: [], already: 0, unmatched: 0, pieces: 0 };
  for (const o of orders || []) {
    if (!o || o.cancelledAt || o.test) { plan.skippedOrders++; continue; }
    const at = Date.parse(o.createdAt);
    if (!Number.isFinite(at)) { plan.skippedOrders++; continue; }
    plan.orders++;
    const ref = tail(o.id);
    for (const line of (o.lineItems && o.lineItems.nodes) || []) {
      const qty = Math.max(0, Math.min(1000000, Math.round(Number(line && line.currentQuantity) || 0)));
      if (!qty) continue;
      const kiwiVariantId = links.get(String(line.variant && line.variant.id || ''));
      const variant = kiwiVariantId && byId.get(kiwiVariantId);
      if (!variant) { plan.unmatched++; continue; }
      const moveId = `so-${ref.slice(-24)}-${tail(line.id).slice(-24)}`.slice(0, 64);
      if (existing.has(moveId)) { plan.already++; continue; }
      const row = { moveId, vid: kiwiVariantId, qty, at, order: String(o.name || ref).slice(0, 40), ref };
      if (Number(variant.baseAt || variant.stockAt || 0) >= at) { plan.counted.push(row); continue; }
      plan.apply.push(row);
      plan.pieces += qty;
      existing.add(moveId);
    }
  }
  return plan;
}

export async function replayShopifyOrders(env, merchant, { sinceTs, dryRun } = {}) {
  const rs = await env.DB.prepare(
    `SELECT kiwi_variant_id, shopify_variant_id FROM shopify_variant_links
      WHERE merchant = ? AND status IN ('active','drift')`
  ).bind(merchant).all();
  const links = new Map((rs.results || []).map((r) => [String(r.shopify_variant_id), String(r.kiwi_variant_id)]));
  if (!links.size) throw new Error('no-linked-variants');
  const orders = await listShopifyOrdersSince(env, merchant, sinceTs);

  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
    if (!row || !row.data) throw new Error('catalog-missing');
    const raw = JSON.parse(row.data);
    if (Array.isArray(raw.moves) && raw.moves.length > 11000) throw new Error('catalog-journal-too-long');
    const data = catalogFns.sanitize(raw);
    catalogFns.materialize(data);
    const plan = planReplay(data, links, orders);
    const summary = {
      since: Number(sinceTs) || 0, orders: plan.orders, skippedOrders: plan.skippedOrders,
      lines: plan.apply.length, pieces: plan.pieces, counted: plan.counted.length,
      already: plan.already, unmatched: plan.unmatched,
      sample: plan.apply.slice(0, 20).map((x) => ({ order: x.order, variant: x.vid, qty: x.qty, at: x.at })),
    };
    if (dryRun || !plan.apply.length) return { ...summary, applied: 0, dryRun: !!dryRun };
    for (const x of plan.apply) {
      data.moves.push({ id: x.moveId, vid: x.vid, d: -x.qty, at: x.at, why: 'vente', ref: `shopify:${x.ref}`.slice(0, 64) });
    }
    catalogFns.materialize(data);
    const next = Number(row.rev || 0) + 1;
    const write = await env.DB.prepare(
      `UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?`
    ).bind(JSON.stringify(data), next, Date.now(), merchant, Number(row.rev || 0)).run();
    if (write && write.meta && Number(write.meta.changes) === 1) return { ...summary, applied: plan.apply.length, dryRun: false };
  }
  throw new Error('catalog-busy');
}
