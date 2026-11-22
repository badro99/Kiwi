/* Glovo · les gestes du magasin sur une commande ou sur son adresse.
 *
 *   pickedUpGlovoOrder     webhook « Order Picked Up » : le coursier Glovo a pris
 *                          la commande ; la caisse l'affiche « récupérée ».
 *   adjustGlovoPrep        PUT /api/v1/…/adjust_preparation_time : coursier Glovo
 *                          seulement, avant qu'un coursier accepte ; chaque appel
 *                          remplace le précédent.
 *   deliveredGlovoOrder    PUT /api/v1/…/delivered : Marketplace seulement (le
 *                          magasin livre) ; Glovo date la livraison à l'appel.
 *   closeGlovoStore        PUT /webhook/stores/{id}/closing { until }
 *   reopenGlovoStore       DELETE /webhook/stores/{id}/closing
 *   readGlovoClosing       GET  /webhook/stores/{id}/closing
 *
 * Le commerçant vient toujours de la session ou de la caisse appairée (la route
 * le résout), jamais du corps ; chaque commande et chaque adresse est relue
 * avec CE commerçant avant d'appeler Glovo. */
import { glovoCall } from './_glovo-api.js';

const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ORDER = /^[A-Za-z0-9._:-]{1,64}$/;

export async function storesOf(env, merchant) {
  try {
    const rs = await env.DB.prepare(
      `SELECT store_id, prep_minutes, status, marketplace, closing_until, closing_ts, last_ts, last_err,
              menu_tx, menu_status, menu_ts, menu_detail, bulk_tx, bulk_status, bulk_ts, bulk_detail, api_err, api_err_ts
         FROM glovo_stores WHERE merchant = ? ORDER BY store_id`
    ).bind(String(merchant)).all();
    return { migrated: true, stores: (rs && rs.results) || [] };
  } catch (_) {
    try {
      const rs = await env.DB.prepare('SELECT store_id, prep_minutes, status FROM glovo_stores WHERE merchant = ? ORDER BY store_id').bind(String(merchant)).all();
      return { migrated: false, stores: (rs && rs.results) || [] };
    } catch (_e) { return { migrated: false, stores: [] }; }
  }
}

/* Les commandes Glovo du magasin encore utiles à la caisse (12 dernières heures). */
export async function openGlovoOrders(env, merchant, now = Date.now()) {
  try {
    const rs = await env.DB.prepare(
      `SELECT g.order_id, g.kiwi_order_id, g.order_code, g.store_id, g.pickup, g.created_ts, g.cancelled_ts,
              g.picked_up_ts, g.out_ts, g.delivered_ts, g.pickup_at, g.last_call, g.last_call_err, s.marketplace
         FROM glovo_orders g JOIN glovo_stores s ON s.store_id = g.store_id
        WHERE g.merchant = ? AND g.created_ts >= ? ORDER BY g.created_ts DESC LIMIT 80`
    ).bind(String(merchant), now - 12 * 3600000).all();
    return ((rs && rs.results) || []).map((r) => ({
      kiwiOrderId: String(r.kiwi_order_id), code: String(r.order_code || ''), storeId: String(r.store_id),
      pickup: Number(r.pickup) === 1, marketplace: Number(r.marketplace) === 1,
      cancelled: r.cancelled_ts != null, pickedUpTs: r.picked_up_ts == null ? null : Number(r.picked_up_ts),
      outTs: r.out_ts == null ? null : Number(r.out_ts), deliveredTs: r.delivered_ts == null ? null : Number(r.delivered_ts),
      pickupAt: r.pickup_at || null, lastCall: r.last_call || '', lastCallErr: r.last_call_err || '',
    }));
  } catch (_) { return []; }
}

async function linkFor(env, merchant, kiwiOrderId) {
  if (!ORDER.test(String(kiwiOrderId || ''))) return null;
  try {
    return await env.DB.prepare(
      `SELECT g.order_id, g.store_id, g.pickup, g.cancelled_ts, g.picked_up_ts, g.out_ts, g.delivered_ts, s.marketplace
         FROM glovo_orders g JOIN glovo_stores s ON s.store_id = g.store_id
        WHERE g.kiwi_order_id = ? AND g.merchant = ?`
    ).bind(String(kiwiOrderId), String(merchant)).first();
  } catch (_) { return null; }
}

/* ── Webhook « Order Picked Up » ─────────────────────────────────────────────
 * Même corps que dispatched. Idempotent : un deuxième envoi ne réécrit rien. */
export async function pickedUpGlovoOrder(env, p, now = Date.now()) {
  const orderId = String((p && p.order_id) || '').trim().slice(0, 64);
  const storeId = String((p && p.store_id) || '').trim().slice(0, 64);
  if (!orderId) return { status: 400, body: { error: 'missing-order-id' } };
  let r;
  try {
    r = await env.DB.prepare('UPDATE glovo_orders SET picked_up_ts = ? WHERE order_id = ? AND store_id = ? AND picked_up_ts IS NULL')
      .bind(now, orderId, storeId).run();
  } catch (_) { return { status: 200, body: { ok: true, ignored: 'unmigrated' } }; }
  if (Number(r && r.meta && r.meta.changes) === 1) return { status: 200, body: { ok: true } };
  /* 200 quand même : Glovo relance tout ce qui n'est pas 2xx. */
  return { status: 200, body: { ok: true, ignored: true } };
}

export async function adjustGlovoPrep(env, merchant, kiwiOrderId, minutes, now = Date.now(), deps = {}) {
  const m = Math.round(Number(minutes));
  if (!Number.isInteger(m) || m < 1 || m > 60) return { ok: false, status: 400, error: 'bad-minutes' };
  const link = await linkFor(env, merchant, kiwiOrderId);
  if (!link) return { ok: false, status: 404, error: 'not-glovo' };
  if (link.cancelled_ts) return { ok: false, status: 409, error: 'cancelled' };
  if (Number(link.marketplace) === 1 || Number(link.pickup) === 1) return { ok: false, status: 409, error: 'courier-orders-only' };
  if (link.picked_up_ts) return { ok: false, status: 409, error: 'already-picked-up' };
  const at = isoSeconds(now + m * 60000);
  const res = await glovoCall(env, link.store_id, {
    method: 'PUT', orderRoute: true, body: { expectedPickupAt: at },
    path: '/api/v1/integrations/orders/' + encodeURIComponent(link.order_id) + '/adjust_preparation_time',
  }, Object.assign({ now }, deps));
  try {
    await env.DB.prepare('UPDATE glovo_orders SET last_call = ?, last_call_ts = ?, last_call_err = ?' + (res.ok ? ', pickup_at = ?' : '') + ' WHERE order_id = ?')
      .bind(...['adjust_preparation_time', now, res.ok ? null : res.error, ...(res.ok ? [at] : []), link.order_id]).run();
  } catch (_) {}
  return res.ok ? { ok: true, pickupAt: at } : { ok: false, status: 502, error: res.error };
}

export async function deliveredGlovoOrder(env, merchant, kiwiOrderId, now = Date.now(), deps = {}) {
  const link = await linkFor(env, merchant, kiwiOrderId);
  if (!link) return { ok: false, status: 404, error: 'not-glovo' };
  if (Number(link.marketplace) !== 1 || Number(link.pickup) === 1) return { ok: false, status: 409, error: 'marketplace-only' };
  if (link.cancelled_ts) return { ok: false, status: 409, error: 'cancelled' };
  if (link.delivered_ts) return { ok: true, deliveredTs: Number(link.delivered_ts), replayed: true };
  /* Glovo répond 204 à une livraison répétée : rejouer ne coûte rien. */
  const res = await glovoCall(env, link.store_id, {
    method: 'PUT', orderRoute: true,
    path: '/api/v1/integrations/orders/' + encodeURIComponent(link.order_id) + '/delivered',
  }, Object.assign({ now }, deps));
  try {
    await env.DB.prepare('UPDATE glovo_orders SET last_call = ?, last_call_ts = ?, last_call_err = ?' + (res.ok ? ', delivered_ts = ?' : '') + ' WHERE order_id = ?')
      .bind(...['delivered', now, res.ok ? null : res.error, ...(res.ok ? [now] : []), link.order_id]).run();
  } catch (_) {}
  return res.ok ? { ok: true, deliveredTs: now } : { ok: false, status: 502, error: res.error };
}

/* ── Fermeture temporaire d'une adresse ─────────────────────────────────────
 * `until` : ms, dans le futur, au plus 7 jours (une erreur de saisie au-delà). */
async function ownedStore(env, merchant, storeId) {
  try {
    const row = await env.DB.prepare('SELECT store_id FROM glovo_stores WHERE store_id = ? AND merchant = ?').bind(String(storeId || ''), String(merchant)).first();
    return row ? String(row.store_id) : '';
  } catch (_) { return ''; }
}

export async function closeGlovoStore(env, merchant, storeId, untilMs, now = Date.now(), deps = {}) {
  const until = Math.floor(Number(untilMs));
  if (!Number.isFinite(until) || until <= now + 60000 || until - now > 7 * 24 * 3600000) return { ok: false, status: 400, error: 'bad-until' };
  const id = await ownedStore(env, merchant, storeId);
  if (!id) return { ok: false, status: 404, error: 'unknown-store' };
  const iso = isoSeconds(until).replace(/Z$/, '+00:00');
  const res = await glovoCall(env, id, { method: 'PUT', path: '/webhook/stores/' + encodeURIComponent(id) + '/closing', body: { until: iso } }, Object.assign({ now }, deps));
  if (!res.ok) return { ok: false, status: 502, error: res.error };
  try { await env.DB.prepare('UPDATE glovo_stores SET closing_until = ?, closing_ts = ? WHERE store_id = ?').bind(iso, now, id).run(); } catch (_) {}
  return { ok: true, storeId: id, until: iso };
}

export async function reopenGlovoStore(env, merchant, storeId, now = Date.now(), deps = {}) {
  const id = await ownedStore(env, merchant, storeId);
  if (!id) return { ok: false, status: 404, error: 'unknown-store' };
  const res = await glovoCall(env, id, { method: 'DELETE', path: '/webhook/stores/' + encodeURIComponent(id) + '/closing' }, Object.assign({ now }, deps));
  if (!res.ok) return { ok: false, status: 502, error: res.error };
  try { await env.DB.prepare('UPDATE glovo_stores SET closing_until = NULL, closing_ts = ? WHERE store_id = ?').bind(now, id).run(); } catch (_) {}
  return { ok: true, storeId: id };
}

/* L'état réel chez Glovo (une fermeture posée ailleurs, ou déjà passée). */
export async function readGlovoClosing(env, merchant, storeId, now = Date.now(), deps = {}) {
  const id = await ownedStore(env, merchant, storeId);
  if (!id) return { ok: false, status: 404, error: 'unknown-store' };
  const res = await glovoCall(env, id, { method: 'GET', path: '/webhook/stores/' + encodeURIComponent(id) + '/closing' }, Object.assign({ now }, deps));
  if (!res.ok) return { ok: false, status: 502, error: res.error };
  const until = res.data && res.data.until ? String(res.data.until).slice(0, 40) : null;
  const active = !!until && Date.parse(until) > now;
  try { await env.DB.prepare('UPDATE glovo_stores SET closing_until = ? WHERE store_id = ?').bind(active ? until : null, id).run(); } catch (_) {}
  return { ok: true, storeId: id, until: active ? until : null };
}
