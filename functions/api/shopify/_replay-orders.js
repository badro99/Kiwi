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
 *  · une variante ne descend jamais sous zéro : ce que Kiwi n'a plus est
 *    « déjà sorti » (`short`), pas retiré une deuxième fois ;
 *  · une ligne arrivée sur un stock déjà à zéro laisse un mouvement à zéro
 *    (« solde-shopify ») : réglée une fois pour toutes, un réassort ne la fait
 *    pas retirer plus tard ;
 *  · `dryRun` dit tout ce qui serait fait, sans rien écrire.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { __test as catalogFns } from '../catalog.js';
import { shopifyGraphQL } from './_lib.js';

/* Bornes d'UN appel : un Worker a un plafond de CPU et de sous-requêtes. Au-delà,
 * l'appel s'arrête ENTRE deux commandes entières et garde sa position (le curseur
 * Shopify de la dernière commande traitée) : l'appel suivant reprend juste après,
 * au lieu de relire les mêmes 1 000 premières commandes et de ne jamais voir les
 * suivantes. Une commande n'est jamais coupée : ses lignes au-delà de 100 sont lues
 * page après page avant qu'elle n'entre dans le lot. */
const MAX_ORDERS = 1000;
const MAX_CALLS = 30;            // appels GraphQL Shopify par passage
const MAX_LINE_PAGES = 50;       // 5 000 lignes : exception explicite, aucun retrait partiel
const CURSOR_DOC = 'shopify-replay';   // store_docs, côté serveur seulement (absent de FEATURES)
const UNRESOLVED_DOC = 'shopify-replay-unresolved';
const tail = (gid) => String(gid || '').split('/').pop();

const ORDERS_QUERY = `query KiwiMissedOrders($q: String!, $after: String) {
    orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id name createdAt cancelledAt test
          lineItems(first: 100) { pageInfo { hasNextPage endCursor } nodes { id currentQuantity variant { id } } }
        }
      }
    }
  }`;
const LINES_QUERY = `query KiwiOrderLines($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id currentQuantity variant { id } } }
    }
  }`;

/* Les commandes depuis `sinceTs`, à partir de `after` (curseur d'une commande déjà
 * traitée, ou null pour le début). Rend { orders, next, more } : `more` dit qu'il en
 * reste, `next` est le curseur de la dernière commande rendue, d'où repartir. */
export async function listShopifyOrdersSince(env, merchant, sinceTs, { after = null, maxOrders = MAX_ORDERS, maxCalls = MAX_CALLS } = {}) {
  const since = new Date(Math.max(0, Number(sinceTs) || 0)).toISOString();
  const out = [], exceptions = [];
  let page = after || null;
  let next = after || null;
  let calls = 0;
  for (;;) {
    if (out.length + exceptions.length >= maxOrders || calls >= maxCalls) return { orders: out, exceptions, next, more: true };
    calls++;
    const res = await shopifyGraphQL(env, merchant, ORDERS_QUERY, { q: `created_at:>='${since}'`, after: page });
    const conn = (res.data && res.data.orders) || {};
    for (const edge of conn.edges || []) {
      const o = edge && edge.node;
      if (!o) continue;
      if (out.length + exceptions.length >= maxOrders) return { orders: out, exceptions, next, more: true };
      const li = o.lineItems || {};
      const nodes = (li.nodes || []).slice();
      let info = li.pageInfo || {};
      let pages = 1;
      let oversized = false;
      while (info.hasNextPage) {
        /* Plus d'appels : cette commande attend le passage suivant, entière. La
           première commande d'un passage est toujours finie, sinon on n'avancerait jamais. */
        if (calls >= maxCalls && (out.length || exceptions.length)) return { orders: out, exceptions, next, more: true };
        if (++pages > MAX_LINE_PAGES) {
          exceptions.push({ orderId: String(o.id || '').slice(0, 160), code: 'shopify-order-too-many-lines' });
          oversized = true;
          break;
        }
        calls++;
        const more = await shopifyGraphQL(env, merchant, LINES_QUERY, { id: o.id, after: info.endCursor || null });
        const lines = (more.data && more.data.order && more.data.order.lineItems) || {};
        for (const n of lines.nodes || []) nodes.push(n);
        info = lines.pageInfo || {};
      }
      if (!oversized) out.push({ ...o, lineItems: { nodes } });
      next = edge.cursor || next;
    }
    const info = conn.pageInfo || {};
    if (!info.hasNextPage) return { orders: out, exceptions, next: null, more: false };
    page = info.endCursor || next;
  }
}

/* Même document privé pour la reprise et le bilan consultable par le propriétaire.
 * remaining=null signifie que Shopify annonce encore une page sans total exact. */
export async function readReplayProgress(env, merchant) {
  const row = await env.DB.prepare('SELECT data FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, CURSOR_DOC).first();
  try { return row ? { ...JSON.parse(row.data), unresolved: await readUnresolved(env, merchant) } : null; } catch { return null; }
}
async function writeProgress(env, merchant, progress) {
  await env.DB.prepare(
    `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (merchant, feature) DO UPDATE SET data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`
  ).bind(merchant, CURSOR_DOC, JSON.stringify(progress), Date.now()).run();
}

/* Separate from the bounded recent history and from the replay cursor. Entries
 * survive completed runs and changes to the requested replay window. */
async function readUnresolved(env, merchant) {
  const row = await env.DB.prepare('SELECT data FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, UNRESOLVED_DOC).first();
  return row ? JSON.parse(row.data) : [];
}
export async function writeUnresolved(env, merchant, orders, exceptions) {
  const completed = new Set(orders.map(o => String(o.id || '').slice(0, 160)));
  const kept = (await readUnresolved(env, merchant)).filter(e => !completed.has(e.orderId));
  const entries = new Map([...kept, ...exceptions].map(e => [e.orderId + ':' + (e.lineId || '') + ':' + e.code, e]));
  await env.DB.prepare(`INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT (merchant, feature) DO UPDATE SET data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`)
    .bind(merchant, UNRESOLVED_DOC, JSON.stringify([...entries.values()]), Date.now()).run();
}

/* Le cœur, sans réseau : des commandes déjà lues, le catalogue, les liens. */
export function planReplay(data, links, orders) {
  const existing = new Set((data.moves || []).map((m) => String(m.id)));
  const byId = new Map((data.variants || []).map((v) => [v.id, v]));
  /* Every external piece is an explicit negative ledger movement. Sellable
     stock stays floored at zero by catalog.materialize, while the signed base
     and movements retain the deficit through restocks and compaction. Only a
     later physical count resolves it. Stable order-line IDs prevent retries
     from deducting twice; a shortage is never evidence of a prior sale. */
  const left = new Map((data.variants || []).map((v) => [v.id, Math.max(0, Math.round(Number(v.stock) || 0))]));
  const plan = { orders: 0, skippedOrders: 0, apply: [], settle: [], counted: [], already: 0, unmatched: 0, pieces: 0, short: 0, shortLines: 0, exceptions: [] };
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
      if (!variant) { plan.unmatched++; plan.exceptions.push({ orderId: String(o.id || '').slice(0, 160), lineId: String(line.id || '').slice(0, 160), code: 'shopify-unmapped-line' }); continue; }
      const moveId = `so-${ref.slice(-24)}-${tail(line.id).slice(-24)}`.slice(0, 64);
      if (existing.has(moveId)) { plan.already++; continue; }
      const row = { moveId, vid: kiwiVariantId, qty, at, order: String(o.name || ref).slice(0, 40), ref };
      if (Number(variant.baseAt || variant.stockAt || 0) >= at) { plan.counted.push(row); continue; }
      const have = left.get(kiwiVariantId) || 0;
      const take = Math.min(qty, have);
      if (take < qty) { plan.short += qty - take; plan.shortLines++; }
      left.set(kiwiVariantId, have - take);
      plan.apply.push(row);
      plan.pieces += qty;
      existing.add(moveId);
    }
  }
  return plan;
}

/**
 * @param {*} env Untyped Worker bindings; D1 rows are external input.
 * @param {string} merchant
 * @param {{sinceTs?: number, dryRun?: boolean}} [options]
 */
export async function replayShopifyOrders(env, merchant, options = {}) {
  try { return await replayBatch(env, merchant, options); }
  catch (error) {
    if (!options.dryRun) {
      const since = Math.max(0, Number(options.sinceTs) || 0);
      const saved = await readReplayProgress(env, merchant);
      const previous = saved && saved.since === since ? saved : { since, after: null, done: 0, remaining: null, more: true, exceptions: [] };
      // Do not persist arbitrary remote error text (it may carry credentials).
      const code = String(error && error.message || '');
      const lastError = /^(catalog-(missing|busy|journal-too-long)|no-linked-variants)$/.test(code) ? code : 'shopify-replay-failed';
      await writeProgress(env, merchant, { ...previous, lastError, updatedTs: Date.now() });
    }
    throw error;
  }
}
/** @param {any} env @param {string} merchant @param {{ sinceTs?: number, dryRun?: boolean }} [opts] */
async function replayBatch(env, merchant, { sinceTs, dryRun } = {}) {
  const rs = await env.DB.prepare(
    `SELECT kiwi_variant_id, shopify_variant_id FROM shopify_variant_links
      WHERE merchant = ? AND status IN ('active','drift')`
  ).bind(merchant).all();
  const links = new Map((rs.results || []).map((r) => [String(r.shopify_variant_id), String(r.kiwi_variant_id)]));
  if (!links.size) throw new Error('no-linked-variants');
  const since = Math.max(0, Number(sinceTs) || 0);
  const saved = await readReplayProgress(env, merchant);
  const previous = saved && saved.since === since && saved.after ? saved : null;
  const after = previous && typeof previous.after === 'string' ? previous.after.slice(0, 1024) : null;
  const listed = await listShopifyOrdersSince(env, merchant, since, { after });
  const orders = listed.orders;
  // Bornée : le document de reprise reste petit même si un catalogue entier déborde.
  const exceptions = [...(previous && previous.exceptions || []), ...listed.exceptions].slice(-50);
  const progress = {
    since, after: listed.more ? listed.next : null,
    done: Number(previous && previous.done || 0) + orders.length,
    remaining: listed.more ? null : 0, more: listed.more,
    exceptions, lastError: '', updatedTs: Date.now(),
  };
  // Written after the catalogue CAS: retries remain idempotent if this write fails.
  const keepCursor = async (plan) => {
    await writeUnresolved(env, merchant, orders, [...listed.exceptions, ...plan.exceptions]);
    await writeProgress(env, merchant, progress);
  };

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
      already: plan.already, unmatched: plan.unmatched, short: plan.short, shortLines: plan.shortLines,
      sample: plan.apply.slice(0, 20).map((x) => ({ order: x.order, variant: x.vid, qty: x.qty, at: x.at })),
      /* `more` : d'autres commandes suivent ; le prochain passage reprend à `cursor`. */
      done: progress.done, remaining: progress.remaining, exceptions,
      resumed: !!after, more: listed.more, cursor: listed.more ? listed.next : null,
    };
    if (dryRun) return { ...summary, applied: 0, dryRun: true };
    if (!(plan.apply.length || plan.settle.length)) { await keepCursor(plan); return { ...summary, applied: 0, dryRun: false }; }
    for (const x of plan.apply) {
      data.moves.push({ id: x.moveId, vid: x.vid, d: -x.qty, at: x.at, why: 'vente', ref: `shopify:${x.ref}`.slice(0, 64) });
    }
    for (const x of plan.settle) {
      data.moves.push({ id: x.moveId, vid: x.vid, d: 0, at: x.at, why: 'solde-shopify', ref: `shopify:${x.ref}`.slice(0, 64) });
    }
    catalogFns.materialize(data);
    const next = Number(row.rev || 0) + 1;
    const write = await env.DB.prepare(
      `UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?`
    ).bind(JSON.stringify(data), next, Date.now(), merchant, Number(row.rev || 0)).run();
    if (write && write.meta && Number(write.meta.changes) === 1) {
      await keepCursor(plan);
      return { ...summary, applied: plan.apply.length, dryRun: false };
    }
  }
  throw new Error('catalog-busy');
}
