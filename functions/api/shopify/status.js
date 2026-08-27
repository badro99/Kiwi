// Merchant-facing control plane for the invisible Shopify connector.
// It exposes health and mapping metadata only; encrypted tokens stay server-side.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import {
  buildExactVariantMapping, connectionFor, enqueueStockChanges,
  flushShopifyOutbox, listLocations, listShopifyVariants,
} from './_lib.js';

const n = (v) => Math.max(0, Number(v) || 0);

function shapeConnection(row) {
  if (!row) return null;
  return {
    shop: row.shop_domain,
    status: row.status,
    location: row.location_id ? { id: row.location_id, name: row.location_name || '' } : null,
    connectedTs: n(row.connected_ts),
    lastSyncTs: n(row.last_sync_ts),
    lastError: String(row.last_error || '').slice(0, 300),
  };
}

async function health(env, merchant) {
  const connection = await connectionFor(env, merchant).catch(() => null);
  let mapping = { active: 0, drift: 0 }, queue = { pending: 0, failed: 0 }, legacy = 0;
  try {
    const rows = await env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM shopify_variant_links WHERE merchant = ? GROUP BY status`
    ).bind(merchant).all();
    for (const row of rows.results || []) mapping[row.status] = n(row.n);
    const outbox = await env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM shopify_sync_outbox WHERE merchant = ? GROUP BY status`
    ).bind(merchant).all();
    for (const row of outbox.results || []) queue[row.status] = n(row.n);
    const old = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM channel_links WHERE merchant = ? AND channel = 'shopify'
        AND (config IS NULL OR config NOT LIKE '%"oauth":true%')`
    ).bind(merchant).first();
    legacy = n(old && old.n);
  } catch (_) {}
  return { connection: shapeConnection(connection), mapping, queue, legacyWebhookLinks: legacy };
}

async function catalogue(env, merchant) {
  const row = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
  if (!row || !row.data) return { data: { products: [], variants: [] }, rev: 0 };
  let data;
  try { data = JSON.parse(row.data); } catch (_) { throw new Error('catalog-invalid'); }
  return { data, rev: n(row.rev) };
}

function preview(result) {
  return {
    counts: {
      matched: result.matches.length,
      barcode: result.matches.filter((x) => x.method === 'barcode').length,
      sku: result.matches.filter((x) => x.method === 'sku').length,
      ambiguous: result.ambiguous.length,
      unmatchedKiwi: result.unmatched.length,
      unmatchedShopify: result.unmatchedShopify.length,
    },
    matches: result.matches.slice(0, 100).map((x) => ({
      kiwiVariantId: x.kiwi.id,
      kiwiTitle: x.kiwi.title,
      shopifyVariantId: x.shopify.id,
      shopifyTitle: x.shopify.title,
      method: x.method,
      kiwiQuantity: x.kiwi.stock,
      shopifyQuantity: x.shopify.quantity,
    })),
    unmatched: result.unmatched.slice(0, 100).map((x) => ({ id: x.id, title: x.title, sku: x.sku })),
    ambiguous: result.ambiguous.slice(0, 100).map((x) => ({ id: x.id, title: x.title, sku: x.sku })),
  };
}

async function refreshMapping(env, merchant) {
  const connection = await connectionFor(env, merchant);
  if (!connection || !connection.location_id) throw new Error('location-required');
  const [cat, variants] = await Promise.all([
    catalogue(env, merchant),
    listShopifyVariants(env, merchant, connection.location_id),
  ]);
  const result = buildExactVariantMapping(cat.data, variants);
  const now = Date.now();
  const statements = [env.DB.prepare('DELETE FROM shopify_variant_links WHERE merchant = ?').bind(merchant)];
  for (const match of result.matches) {
    statements.push(env.DB.prepare(
      `INSERT INTO shopify_variant_links
        (merchant, kiwi_variant_id, shopify_variant_id, inventory_item_id,
         location_id, match_method, last_shopify_quantity, status, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).bind(
      merchant, match.kiwi.id, match.shopify.id, match.shopify.inventoryItemId,
      connection.location_id, match.method,
      match.shopify.quantity == null ? null : n(match.shopify.quantity), now
    ));
  }
  statements.push(env.DB.prepare(
    `DELETE FROM shopify_sync_outbox
      WHERE merchant = ? AND NOT EXISTS (
        SELECT 1 FROM shopify_variant_links l
         WHERE l.merchant = shopify_sync_outbox.merchant
           AND l.kiwi_variant_id = shopify_sync_outbox.kiwi_variant_id
      )`
  ).bind(merchant));
  const nextStatus = connection.status === 'active' ? 'active' : 'ready';
  statements.push(env.DB.prepare(
    `UPDATE shopify_connections SET status = ?, updated_ts = ?, last_error = '' WHERE merchant = ?`
  ).bind(nextStatus, now, merchant));
  await env.DB.batch(statements);
  return { ...preview(result), catalog: cat };
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const merchant = await tenantFor(request, env, new URL(request.url).searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const out = await health(env, merchant);
  let locations = [];
  if (out.connection) {
    try { locations = await listLocations(env, merchant); }
    catch (e) {
      out.connection.lastError = out.connection.lastError || String(e && e.message || e).slice(0, 300);
    }
    if (waitUntil && out.queue.pending + out.queue.failed > 0) waitUntil(flushShopifyOutbox(env, merchant, 5));
  }
  return json({ ok: true, merchant, ...out, locations });
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const action = String(body && body.action || '');

  try {
    if (action === 'select-location') {
      const locationId = String(body && body.locationId || '').slice(0, 160);
      const locations = await listLocations(env, merchant);
      const location = locations.find((x) => x.id === locationId);
      if (!location) return json({ error: 'invalid-location' }, 400);
      await env.DB.prepare(
        `UPDATE shopify_connections
            SET location_id = ?, location_name = ?, status = 'mapping', updated_ts = ?, last_error = ''
          WHERE merchant = ?`
      ).bind(location.id, String(location.name || '').slice(0, 120), Date.now(), merchant).run();
      const mapped = await refreshMapping(env, merchant);
      return json({ ok: true, action, preview: { counts: mapped.counts, matches: mapped.matches, unmatched: mapped.unmatched, ambiguous: mapped.ambiguous }, ...(await health(env, merchant)) });
    }

    if (action === 'refresh-mapping') {
      const mapped = await refreshMapping(env, merchant);
      return json({ ok: true, action, preview: { counts: mapped.counts, matches: mapped.matches, unmatched: mapped.unmatched, ambiguous: mapped.ambiguous }, ...(await health(env, merchant)) });
    }

    if (action === 'activate' || action === 'reconcile') {
      const mapped = await refreshMapping(env, merchant);
      await env.DB.prepare(`UPDATE shopify_connections SET status = 'active', updated_ts = ?, last_error = '' WHERE merchant = ?`)
        .bind(Date.now(), merchant).run();
      const queued = await enqueueStockChanges(env, merchant, null, mapped.catalog.data, mapped.catalog.rev, true);
      if (waitUntil) waitUntil(flushShopifyOutbox(env, merchant, 25));
      return json({ ok: true, action, queued, preview: { counts: mapped.counts, matches: mapped.matches, unmatched: mapped.unmatched, ambiguous: mapped.ambiguous }, ...(await health(env, merchant)) });
    }

    if (action === 'retry') {
      await env.DB.prepare(
        `UPDATE shopify_sync_outbox SET status = 'pending', next_attempt_ts = 0, last_error = '', updated_ts = ?
          WHERE merchant = ? AND status = 'failed'`
      ).bind(Date.now(), merchant).run();
      const result = await flushShopifyOutbox(env, merchant, 25);
      return json({ ok: true, action, result, ...(await health(env, merchant)) });
    }
  } catch (e) {
    const message = String(e && e.message || e).slice(0, 300);
    await env.DB.prepare('UPDATE shopify_connections SET last_error = ?, updated_ts = ? WHERE merchant = ?')
      .bind(message, Date.now(), merchant).run().catch(() => {});
    return json({ error: 'shopify-action-failed', detail: message }, 502);
  }
  return json({ error: 'bad-action' }, 400);
}

export const __test = { preview };
