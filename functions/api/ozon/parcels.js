// /api/ozon/parcels — send a delivery sale with Ozon Express, and list them.
//
//   GET  ?merchant=slug[&refresh=1|force=1] → { connected, parcels: [...], refreshed? }
//   POST { merchant, saleId, receiver, phone, cityId, address, note?, nature?,
//          open?, fragile?, replace? } → { ok, parcel, already? }
//
// The parcel's cash-on-delivery price is what is still owed on that sale
// (receivables.js › deliveryDue), never a figure typed on the tablet: Ozon
// collects exactly what the shop is owed. One parcel per sale: a second send,
// even simultaneous from two devices, returns the first (a reservation row
// takes the sale's slot before Ozon is called). Pickup mode comes from the
// connection (Ozon picks up at the shop unless the owner chose Ozon stock).
import { deliveryDue } from '../receivables.js';
import { exactMerchant, json, readAccount, ozonCall, stepError, pick, cities, cents } from './_lib.js';
import { listParcels, parcelView, refreshTracking } from './_track.js';
const CUSTOMER_FEE_CENTS = 5000;   // ce que le client paie pour la livraison, partout

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await exactMerchant(request, env, url.searchParams.get('merchant'), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const account = await readAccount(env, merchant);
  let refreshed;
  if (account && (url.searchParams.get('refresh') === '1' || url.searchParams.get('force') === '1')) {
    refreshed = await refreshTracking(env, merchant, { force: url.searchParams.get('force') === '1' });
  }
  return json({ connected: !!account, parcels: await listParcels(env, merchant), refreshed });
}

const PHONE_RE = /^(?:\+?212|0)?[5-7]\d{8}$/;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/* The till knows a sale by its own id (« sale-<uuid> »); the server stores it
 * as « sale-ref-<hash>-<last 32 characters> » (assets/live-link.js › stableId).
 * Same tail, same store, one row: that row is the sale. */
async function serverSaleId(env, merchant, saleId) {
  if (saleId.startsWith('sale-ref-')) return saleId;
  const tail = saleId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
  if (tail.length < 16) return saleId;
  try {
    const rs = await env.DB.prepare("SELECT id FROM sales WHERE merchant = ? AND id LIKE 'sale-ref-%' AND substr(id, -?) = ? LIMIT 2")
      .bind(merchant, tail.length, tail).all();
    const rows = rs.results || [];
    return rows.length === 1 ? String(rows[0].id) : saleId;
  } catch (_) { return saleId; }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await exactMerchant(request, env, String(b && b.merchant || ''), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const account = await readAccount(env, merchant);
  if (!account) return json({ error: 'not-connected' }, 409);

  let saleId = clean(b.saleId, 128);
  const receiver = clean(b.receiver, 80);
  const phone = clean(b.phone, 20).replace(/[\s.-]/g, '');
  const address = clean(b.address, 240);
  const cityId = Number(b.cityId);
  if (!saleId) return json({ error: 'sale-required' }, 400);
  if (!receiver) return json({ error: 'receiver-required' }, 400);
  if (!PHONE_RE.test(phone)) return json({ error: 'bad-phone' }, 400);
  if (!address) return json({ error: 'address-required' }, 400);
  if (!Number.isSafeInteger(cityId) || cityId <= 0) return json({ error: 'city-required' }, 400);

  saleId = await serverSaleId(env, merchant, saleId);
  const existing = await env.DB.prepare('SELECT * FROM ozon_parcels WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).first();
  if (existing && !String(existing.tracking).startsWith('pending:')) return json({ ok: true, already: true, parcel: parcelView(existing) });
  /* Une réservation de plus de deux minutes est celle d'un envoi mort en route
     (Ozon n'a rien répondu) : on la libère au lieu de bloquer la vente. */
  if (existing && Date.now() - (Number(existing.created_ts) || 0) < 120000) return json({ error: 'parcel-in-progress' }, 409);
  if (existing) await env.DB.prepare('DELETE FROM ozon_parcels WHERE merchant = ? AND tracking = ?').bind(merchant, existing.tracking).run();

  const due = await deliveryDue(env, merchant, saleId);
  if (!due) return json({ error: 'not-a-delivery' }, 404);
  if (!(due.dueCents > 0)) return json({ error: 'nothing-due' }, 409);

  let city = null;
  try { city = (await cities(env)).find((c) => c.id === cityId) || null; } catch (_) { city = null; }
  if (!city) return json({ error: 'unknown-city' }, 400);

  /* Ce que le livreur encaisse : ce qui reste dû sur la vente, plus les frais
     de livraison quand la boutique les fait payer au client (Santos, 30 oct.
     2026). Le chiffre d'affaires, lui, reste ce qui est dû sur la vente
     (_track.js › confirmByCarrier) : les frais sont à Ozon. */
  const feeOnCustomer = b.feeOnCustomer === true || b.feeOnCustomer === 1 || b.feeOnCustomer === '1';
  /* Le client paie toujours 50 MAD, quelle que soit la ville (Santos, 30 oct.
     2026) ; Ozon garde ses frais de ville sur ce qu'il encaisse. */
  const codCents = due.dueCents + (feeOnCustomer ? CUSTOMER_FEE_CENTS : 0);

  /* La place de la vente est prise AVANT d'appeler Ozon : deux envois
     simultanés ne créent jamais deux colis. */
  const hold = 'pending:' + saleId;
  const now = Date.now();
  try {
    await env.DB.prepare(`INSERT INTO ozon_parcels (merchant, tracking, sale_id, receiver, phone, city_id, city_name, address, price_cents, created_ts, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(merchant, hold, saleId, receiver, phone, cityId, city.name, address, codCents, now, 'kiwi').run();
  } catch (_) {
    const again = await env.DB.prepare('SELECT * FROM ozon_parcels WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).first();
    if (again && !String(again.tracking).startsWith('pending:')) return json({ ok: true, already: true, parcel: parcelView(again) });
    return json({ error: 'parcel-in-progress' }, 409);
  }

  const form = new FormData();
  form.append('parcel-receiver', receiver);
  form.append('parcel-phone', phone);
  form.append('parcel-city', String(cityId));
  form.append('parcel-address', address);
  form.append('parcel-price', String(Math.round(codCents) / 100));
  form.append('parcel-stock', String(Number(account.pickup_mode) === 1 ? 1 : 0));
  form.append('parcel-nature', clean(b.nature, 120) || clean(due.label, 120) || 'Commande');
  const note = clean(b.note, 240);
  if (note) form.append('parcel-note', note);
  form.append('parcel-open', Number(b.open) === 2 ? '2' : '1');
  form.append('parcel-fragile', b.fragile ? '1' : '0');
  form.append('parcel-replace', b.replace ? '1' : '0');

  const res = await ozonCall(env, account, 'add-parcel', form);
  const tracking = res.ok ? pick(res.data, ['TRACKING-NUMBER']) : undefined;
  if (!res.ok || !tracking) {
    await env.DB.prepare('DELETE FROM ozon_parcels WHERE merchant = ? AND tracking = ?').bind(merchant, hold).run();
    const message = res.ok ? stepError(res.data) : (res.message || '');
    return json({ error: res.ok ? 'ozon-refused' : res.error, message }, res.ok || res.error === 'ozon-refused' ? 422 : 502);
  }
  const feeOr = (names, fallback) => { const v = pick(res.data, names); return v == null ? fallback : cents(v); };
  await env.DB.prepare(`UPDATE ozon_parcels SET tracking = ?, fee_delivered_cents = ?, fee_returned_cents = ?, fee_refused_cents = ?,
      city_name = ?, status = 'pending', status_ts = ?, checked_ts = ? WHERE merchant = ? AND tracking = ?`)
    .bind(String(tracking).slice(0, 64), feeOr(['DELIVERED-PRICE'], city.deliveredCents), feeOr(['RETURNED-PRICE'], city.returnedCents),
      feeOr(['REFUSED-PRICE'], city.refusedCents), String(pick(res.data, ['CITY-NAME']) || city.name).slice(0, 80), now, now, merchant, hold).run();
  const row = await env.DB.prepare('SELECT * FROM ozon_parcels WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).first();
  return json({ ok: true, parcel: parcelView(row) });
}
