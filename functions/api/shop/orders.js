// /api/shop/orders — the online shop's cash-on-delivery orders.
//
//   POST  Authorization: Bearer kwc.<id>.<secret>   (a `storefront` channel key)
//         { ref, customer:{name,phone,city,address,note},
//           lines:[{variantId, quantity, unitCents}],
//           subtotalCents, discountCents, deliveryCents, totalCents }
//     →   { ok, number }
//
//   GET   ?merchant=<slug>&status=pending|confirmed|declined|all   (shop staff)
//     →   { ok, orders:[…] }
//
// The storefront has no session and never will: like Glovo on
// /api/channel/order, it presents a key that can only deposit orders for the
// one merchant it belongs to. The slug comes from the key, never the body.
//
// Nothing is decided here. The order waits `pending`; /api/shop/decide is
// where a person confirms it (it becomes a delivery sale) or declines it.

import { json, entitledMerchant } from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { mark } from '../channel/_link.js';
import {
  storefrontLink, statusToken, commerceEnabled, readCatalog, cleanCustomer, checkLines, orderNumber, shapeOrder, str,
  MAX_PENDING, MAX_DELIVERY_CENTS,
} from './_lib.js';

const MAX_BODY = 64 * 1024;
const ERRORS = {
  name: 'Indiquez votre nom.', phone: 'Indiquez un numéro de téléphone marocain valide.',
  city: 'Choisissez votre ville.', address: 'Indiquez votre adresse de livraison.',
  empty: 'Votre panier est vide.', 'too-many-lines': 'Trop d’articles dans une seule commande.',
  'bad-line': 'Une ligne de la commande est illisible.',
  'unknown-variant': 'Un article n’est plus en vente. Rechargez la page.',
  'price-changed': 'Un prix vient de changer. Rechargez la page.',
  'bad-total': 'Le total de la commande ne correspond pas.',
};

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooLarge: true };
  try { return { body: JSON.parse(text) }; } catch (_) { return { body: null }; }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const link = await storefrontLink(request, env);
  if (!link) return json({ error: 'unauthorized' }, 401);
  const merchant = String(link.merchant || '').toLowerCase();
  if (await storeSuspended(env, merchant) || await storeSubscriptionPending(env, merchant)) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!await commerceEnabled(env, merchant)) {
    await mark(env, link.id, false, 'boutique en ligne non activée');
    return json({ error: 'commerce-off', message: 'La boutique ne prend pas de commandes pour le moment.' }, 403);
  }

  const { body: b, tooLarge } = await readBody(request);
  if (tooLarge) return json({ error: 'too-large' }, 413);
  if (!b || typeof b !== 'object') { await mark(env, link.id, false, 'corps JSON illisible'); return json({ error: 'bad-json' }, 400); }

  const ref = str(b.ref, 64).replace(/[^A-Za-z0-9_-]/g, '');
  if (!ref) return json({ error: 'no-ref' }, 400);

  /* A storefront retries on timeout: the same ref is the same order. */
  const existing = await env.DB.prepare('SELECT id, number FROM web_orders WHERE merchant = ? AND client_ref = ?')
    .bind(merchant, ref).first().catch(() => null);
  if (existing) return json({ ok: true, number: existing.number, statusToken: await statusToken(env, merchant, existing.id), duplicate: true });

  const who = cleanCustomer(b.customer);
  if (who.error) return json({ ok: false, error: who.error, message: ERRORS[who.error] }, 400);

  let catalog;
  try { catalog = await readCatalog(env, merchant); } catch (_) { catalog = null; }
  if (!catalog) { await mark(env, link.id, false, 'catalogue introuvable'); return json({ error: 'no-catalog' }, 503); }
  const checked = checkLines(catalog, b.lines);
  if (checked.error) {
    await mark(env, link.id, false, 'ligne refusée : ' + checked.error);
    return json({ ok: false, error: checked.error, message: ERRORS[checked.error] }, 409);
  }

  /* The offers (bundles, coupons, delivery fee) are the storefront's: Kiwi
     checks the arithmetic and the bounds, not the marketing. */
  const discount = Number(b.discountCents) || 0, delivery = Number(b.deliveryCents) || 0, total = Number(b.totalCents);
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > checked.subtotalCents
      || !Number.isSafeInteger(delivery) || delivery < 0 || delivery > MAX_DELIVERY_CENTS
      || total !== checked.subtotalCents - discount + delivery || total <= 0) {
    await mark(env, link.id, false, 'total incohérent');
    return json({ ok: false, error: 'bad-total', message: ERRORS['bad-total'] }, 409);
  }

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM web_orders WHERE merchant = ? AND status = 'pending'")
    .bind(merchant).first().catch(() => null);
  if (pending && pending.n >= MAX_PENDING) {
    await mark(env, link.id, false, 'file d’attente pleine');
    return json({ error: 'queue-full', message: 'La boutique reçoit trop de commandes, réessayez plus tard.' }, 429);
  }

  const now = Date.now();
  const id = 'wo-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
  const number = orderNumber();
  try {
    await env.DB.prepare(
      `INSERT INTO web_orders (id, merchant, number, client_ref, link_id, status, customer, lines,
         subtotal_cents, discount_cents, delivery_cents, total_cents, created_ts)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, merchant, number, ref, link.id, JSON.stringify(who.customer), JSON.stringify(checked.lines),
      checked.subtotalCents, discount, delivery, total, now).run();
  } catch (e) {
    /* Two retries can both pass the read above; the unique index decides. */
    const raced = await env.DB.prepare('SELECT id, number FROM web_orders WHERE merchant = ? AND client_ref = ?')
      .bind(merchant, ref).first().catch(() => null);
    if (raced) return json({ ok: true, number: raced.number, statusToken: await statusToken(env, merchant, raced.id), duplicate: true });
    await mark(env, link.id, false, 'écriture impossible');
    return json({ error: 'write-failed' }, 500);
  }
  await mark(env, link.id, true);
  return json({ ok: true, number, statusToken: await statusToken(env, merchant, id) });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await entitledMerchant(request, env, str(url.searchParams.get('merchant'), 64), { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const status = str(url.searchParams.get('status'), 12);
  const one = ['pending', 'confirmed', 'declined'].includes(status) ? status : '';
  const rs = await env.DB.prepare(
    `SELECT * FROM web_orders WHERE merchant = ? ${one ? 'AND status = ?' : ''} ORDER BY created_ts DESC LIMIT 200`
  ).bind(...(one ? [merchant, one] : [merchant])).all();
  return json({ ok: true, enabled: await commerceEnabled(env, merchant), orders: (rs.results || []).map(shapeOrder) });
}
