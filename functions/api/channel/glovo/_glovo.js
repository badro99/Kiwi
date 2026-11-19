/* Glovo · l'API Partners, côté Kiwi.
 *
 * Glovo ne fournit pas de connecteur de caisse (ticket NFQC-5519, 19 nov. 2026) :
 * c'est le logiciel de caisse qui héberge les webhooks et qui rend compte.
 *   Glovo → Kiwi  POST dispatched / cancelled  (functions/api/channel/glovo/)
 *   Kiwi → Glovo  PUT /api/v0/integrations/orders/{id}/accept | ready_for_pickup
 *                 | customer_picked_up        (notifyGlovo, appelé par la file)
 * Doc : https://api-docs.glovoapp.com/partners/index.html
 *
 * UN jeton pour toute l'intégration (secret Cloudflare GLOVO_TOKEN) : Glovo
 * l'envoie dans `Authorization` sur nos webhooks, nous le renvoyons sur leurs
 * routes. Le commerçant ne vient donc pas du jeton mais du `store_id` du corps,
 * traduit par la table glovo_stores. GLOVO_API_BASE choisit Stage ou production.
 *
 * Ce qui est volontairement absent : l'annulation côté magasin (« Available
 * soon », à ne pas appeler avant l'annonce de Glovo), l'envoi du menu, la
 * modification de commande. */
import { json } from '../../../auth/_lib.js';
import { startOfWeek } from '../../order/_lib.js';
import { merchantZone } from '../../_business-day.js';
import { storeSuspended, storeSubscriptionPending } from '../../_private.js';

const MAX_BODY = 256 * 1024;
const MAX_LINES = 60;
const MAX_PENDING = 60;
const DEFAULT_BASE = 'https://api.glovoapp.com';
const STORE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const cents = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const mad = (c) => Math.round(c) / 100;

/* Comparaison à temps constant du jeton partagé. Un jeton absent côté serveur
 * n'est jamais « égal » à un en-tête vide : le webhook répond 503 avant. */
function sameToken(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* La doc dit `Authorization: token` ; certains clients HTTP préfixent « Bearer ». */
export function glovoAuth(request, env) {
  const expected = String((env && env.GLOVO_TOKEN) || '');
  if (!expected) return json({ error: 'not-configured' }, 503);
  let got = String(request.headers.get('Authorization') || '').trim();
  if (/^Bearer\s+/i.test(got)) got = got.replace(/^Bearer\s+/i, '');
  return sameToken(got, expected) ? null : json({ error: 'unauthorized' }, 401);
}

export async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return { error: json({ error: 'too-large' }, 413) };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { error: json({ error: 'too-large' }, 413) };
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return { body };
  } catch (_) { return { error: json({ error: 'bad-json' }, 400) }; }
}

export async function storeFor(env, storeId) {
  const id = str(storeId, 64);
  if (!STORE_ID.test(id)) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT store_id, merchant, prep_minutes, status FROM glovo_stores WHERE store_id = ?'
    ).bind(id).first();
    return row && row.status === 'active' ? row : null;
  } catch (_) { return null; }
}

async function stampStore(env, storeId, ok, err) {
  try {
    await env.DB.prepare(ok
      ? 'UPDATE glovo_stores SET last_ts = ?, last_err = NULL WHERE store_id = ?'
      : 'UPDATE glovo_stores SET last_err = ? WHERE store_id = ?'
    ).bind(ok ? Date.now() : str(err, 120), storeId).run();
  } catch (_) {}
}

/* ── Traduction d'une commande Glovo ──────────────────────────────────────────
 * Glovo compte en centimes. Le prix d'un produit n'inclut pas ses attributs
 * (« Extra meat » +3,00) : le prix unitaire du ticket les additionne, comme le
 * total Glovo (exemple de la doc : 2 × (10,00 + 3,00) + 4,80 = 30,80). Un menu
 * (sub_products) se lit sur une ligne, ses éléments dans les options. */
function attrList(attrs) {
  return (Array.isArray(attrs) ? attrs : []).filter((a) => a && a.name).slice(0, 20);
}
function attrCents(attrs) {
  return attrList(attrs).reduce((s, a) => s + cents(a.price) * Math.max(1, cents(a.quantity) || 1), 0);
}
function attrName(a) {
  const q = cents(a.quantity);
  return (q > 1 ? q + '× ' : '') + str(a.name, 60);
}

export function mapGlovoOrder(p) {
  const products = Array.isArray(p && p.products) ? p.products.filter((x) => x && x.name) : [];
  const lines = products.slice(0, MAX_LINES).map((x) => {
    const subs = (Array.isArray(x.sub_products) ? x.sub_products : []).filter((s) => s && s.name).slice(0, 12);
    const unit = cents(x.price) + attrCents(x.attributes)
      + subs.reduce((s, sp) => s + (cents(sp.price) + attrCents(sp.attributes)) * Math.max(1, cents(sp.quantity) || 1), 0);
    const options = attrList(x.attributes).map(attrName).concat(subs.map((sp) => {
      const inner = attrList(sp.attributes).map(attrName);
      return (cents(sp.quantity) > 1 ? cents(sp.quantity) + '× ' : '') + str(sp.name, 60) + (inner.length ? ' (' + inner.join(', ') + ')' : '');
    }));
    return {
      id: str(x.id, 40), name: str(x.name, 80),
      qty: Math.min(99, Math.max(1, cents(x.quantity) || 1)),
      unitPrice: mad(unit), options: str(options.join(' · '), 200), note: '',
    };
  });

  /* Ce que le magasin facture : le total produits après SA propre remise. La
   * remise financée par Glovo ne touche pas le commerçant. */
  const discounted = p && p.partner_discounted_products_total;
  const totalCents = Number.isFinite(Number(discounted)) && discounted !== null && discounted !== ''
    ? cents(discounted) : cents(p && p.estimated_total_price);
  const lineCents = lines.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.qty, 0);

  const c = (p && p.customer) || {};
  const phone = str(c.phone_number, 32);
  const a = (p && p.delivery_address) || {};
  const addressBits = [
    str(a.label, 160),
    a.building_name ? 'Imm. ' + str(a.building_name, 40) : '',
    a.floor_number ? 'Étage ' + str(a.floor_number, 10) : '',
    a.door_number ? 'Porte ' + str(a.door_number, 10) : '',
    str(a.additional_information, 120),
  ].filter(Boolean);
  const notes = [
    p && p.pick_up_code ? 'Code retrait ' + str(p.pick_up_code, 12) : '',
    str(p && p.allergy_info, 160) ? 'Allergie : ' + str(p.allergy_info, 160) : '',
    str(p && p.special_requirements, 160),
    p && p.cutlery_requested ? 'Couverts' : '',
    p && p.payment_method === 'CASH' ? 'Coursier paie en espèces' : '',
  ].filter(Boolean);
  const adjustment = totalCents - lineCents;
  if (adjustment) notes.push('Ajustement canal: ' + (adjustment / 100).toFixed(2) + ' MAD');

  return {
    ref: str((p && p.order_code) || (p && p.order_id), 48),
    mode: p && p.is_picked_up_by_customer ? 'takeout' : 'delivery',
    total: mad(totalCents),
    lines,
    customer: {
      name: str(c.name, 80),
      phone: /^n\/?a$/i.test(phone) ? '' : phone,
      address: str(addressBits.join(', '), 240),
      note: str(notes.join(' · '), 240),
      channelAdjustmentCents: adjustment,
    },
  };
}

/* ── Dépôt : un order_id Glovo = un ticket Kiwi ───────────────────────────── */
export async function depositGlovoOrder(env, store, p, now = Date.now()) {
  const merchant = String(store.merchant || '').toLowerCase();
  const orderId = str(p && p.order_id, 64);
  if (!orderId) return json({ error: 'missing-order-id' }, 400);
  if (await storeSuspended(env, merchant) || await storeSubscriptionPending(env, merchant)) {
    await stampStore(env, store.store_id, false, 'commerce suspendu');
    return json({ error: 'store-unavailable' }, 404);
  }
  const replay = async () => {
    const row = await env.DB.prepare(
      `SELECT o.id, o.number FROM glovo_orders g JOIN orders o ON o.id = g.kiwi_order_id
        WHERE g.order_id = ?`
    ).bind(orderId).first();
    return row ? json({ ok: true, id: row.id, number: row.number, duplicate: true }) : null;
  };
  try { const dup = await replay(); if (dup) return dup; } catch (_) {}

  const m = mapGlovoOrder(p);
  if (!m.lines.length) { await stampStore(env, store.store_id, false, 'commande sans produit'); return json({ error: 'empty-order' }, 400); }
  if (!(m.total > 0)) { await stampStore(env, store.store_id, false, 'total absent'); return json({ error: 'bad-total' }, 400); }

  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending'"
    ).bind(merchant).first();
    if (pending && pending.n >= MAX_PENDING) {
      await stampStore(env, store.store_id, false, 'file d\'attente pleine');
      return json({ error: 'queue-full' }, 429);
    }
  } catch (_) {}

  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
  let number = 1;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                             created_ts, updated_ts, channel, ext_ref, customer)
         SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, '', ?, ?, 'pending', ?, ?, 'glovo', ?, ?
           FROM orders WHERE merchant = ? AND created_ts >= ?
         RETURNING number`
      ).bind(id, merchant, m.mode, m.total, JSON.stringify(m.lines), now, now, m.ref,
        JSON.stringify(m.customer), merchant, startOfWeek(now, await merchantZone(env, merchant))),
      env.DB.prepare(
        `INSERT INTO glovo_orders (order_id, store_id, merchant, kiwi_order_id, order_code, pickup, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(orderId, store.store_id, merchant, id, m.ref, m.mode === 'takeout' ? 1 : 0, now),
    ]);
    const first = results && results[0];
    number = (first && first.results && first.results[0] && first.results[0].number) || 1;
  } catch (e) {
    /* Deux relances simultanées : la clé primaire de glovo_orders a tranché,
     * et le lot entier de la perdante a été annulé. */
    try { const dup = await replay(); if (dup) return dup; } catch (_) {}
    await stampStore(env, store.store_id, false, String((e && e.message) || e));
    return json({ error: 'write-failed' }, 500);
  }
  await stampStore(env, store.store_id, true);
  return json({ ok: true, id, number });
}

/* ── Annulation venue de Glovo ────────────────────────────────────────────── */
export async function cancelGlovoOrder(env, p, now = Date.now()) {
  const orderId = str(p && p.order_id, 64);
  const storeId = str(p && p.store_id, 64);
  let link = null;
  try {
    link = await env.DB.prepare(
      'SELECT order_id, store_id, merchant, kiwi_order_id, cancelled_ts FROM glovo_orders WHERE order_id = ? AND store_id = ?'
    ).bind(orderId, storeId).first();
  } catch (_) {}
  /* 200 quand même : Glovo relance tout ce qui n'est pas 2xx, et une commande
   * qui ne nous a jamais été confiée n'a rien à annuler ici. */
  if (!link) return json({ ok: true, ignored: true });
  if (link.cancelled_ts) return json({ ok: true, replayed: true });
  const reason = str(p && p.cancel_reason, 40);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE orders SET status = 'rejected', updated_ts = ?, cancel_actor_id = 'glovo',
                cancel_actor_name = 'Glovo', cancel_ts = ?
          WHERE id = ? AND merchant = ? AND status IN ('pending','accepted','ready') AND paid_ts IS NULL`
      ).bind(now, now, link.kiwi_order_id, link.merchant),
      env.DB.prepare('UPDATE glovo_orders SET cancelled_ts = ?, cancel_reason = ? WHERE order_id = ?')
        .bind(now, reason, orderId),
    ]);
  } catch (_) { return json({ error: 'write-failed' }, 500); }
  return json({ ok: true });
}

/* ── Retour vers Glovo ────────────────────────────────────────────────────────
 * Appelé APRÈS qu'une commande a bougé dans la file (waitUntil) : la caisse n'attend
 * jamais Glovo, et un refus de Glovo ne défait rien chez nous. Il s'écrit sur
 * glovo_orders.last_call_err, que l'opérateur lit. */
const ROUTES = { accepted: 'accept', ready: 'ready_for_pickup' };
const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function notifyGlovo(env, merchant, kiwiOrderId, status, now = Date.now(), deps = {}) {
  if (!env || !env.GLOVO_TOKEN || !env.DB) return { ok: true, skipped: 'not-configured' };
  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT g.order_id, g.store_id, g.pickup, g.cancelled_ts, s.prep_minutes
         FROM glovo_orders g JOIN glovo_stores s ON s.store_id = g.store_id
        WHERE g.kiwi_order_id = ? AND g.merchant = ?`
    ).bind(String(kiwiOrderId || ''), String(merchant || '')).first();
  } catch (_) { return { ok: true, skipped: 'no-table' }; }
  if (!row || row.cancelled_ts) return { ok: true, skipped: 'not-glovo' };
  let route = ROUTES[status];
  if (status === 'ready' && row.pickup) route = null;              // retrait client : rien à annoncer au coursier
  if (status === 'served' && row.pickup) route = 'customer_picked_up';
  if (!route) return { ok: true, skipped: 'no-route' };

  const base = String(env.GLOVO_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  const url = base + '/api/v0/integrations/orders/' + encodeURIComponent(row.order_id) + '/' + route;
  const body = route === 'accept'
    ? JSON.stringify({ committedPreparationTime: isoSeconds(now + Math.max(1, Number(row.prep_minutes) || 15) * 60000) })
    : undefined;
  const doFetch = deps.fetch || globalThis.fetch;
  let err = null;
  try {
    const res = await doFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: env.GLOVO_TOKEN, 'Glovo-Store-Address-External-Id': row.store_id },
      body,
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res || res.status < 200 || res.status >= 300) err = 'HTTP ' + (res ? res.status : '?');
  } catch (e) { err = str((e && e.message) || e, 100) || 'network'; }
  try {
    await env.DB.prepare('UPDATE glovo_orders SET last_call = ?, last_call_ts = ?, last_call_err = ? WHERE order_id = ?')
      .bind(route, now, err, row.order_id).run();
  } catch (_) {}
  return err ? { ok: false, route, error: err } : { ok: true, route };
}

/* ── Liaison d'une adresse Glovo à un commerçant (console opérateur) ──────── */
export async function upsertGlovoStore(env, input, now = Date.now()) {
  const storeId = str(input && input.storeId, 64);
  const merchant = str(input && input.merchant, 80).toLowerCase();
  if (!STORE_ID.test(storeId)) return { ok: false, error: 'bad-store-id' };
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(merchant)) return { ok: false, error: 'bad-merchant' };
  const prep = Math.min(120, Math.max(1, Math.round(Number(input && input.prepMinutes) || 15)));
  const status = input && input.status === 'paused' ? 'paused' : 'active';
  await env.DB.prepare(
    `INSERT INTO glovo_stores (store_id, merchant, prep_minutes, status, created_ts, updated_ts)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id) DO UPDATE SET merchant = excluded.merchant, prep_minutes = excluded.prep_minutes,
       status = excluded.status, updated_ts = excluded.updated_ts`
  ).bind(storeId, merchant, prep, status, now, now).run();
  return { ok: true, storeId, merchant, prepMinutes: prep, status };
}
