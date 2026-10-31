// /api/shop/status — "Suivre ma commande", for the customer who placed it.
//
//   GET ?number=W-XXXXX&t=<token>   Authorization: Bearer <storefront key>
//     →  { ok, order: { number, status, createdTs, decidedTs, city, lines,
//                       deliveryCents, totalCents, parcel? } }
//
// Two locks: the store's key (only that store's storefront asks), and the
// order's own token, returned once to the customer when the order arrived
// (/api/shop/orders). A number alone opens nothing. The answer never carries
// the phone, the address or the shop's reason for declining.
import { json } from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { storefrontLink, commerceEnabled, statusToken, sameToken, shapeOrder, str } from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const link = await storefrontLink(request, env);
  if (!link) return json({ error: 'unauthorized' }, 401);
  const merchant = String(link.merchant || '').toLowerCase();
  // Les mêmes portes que /api/shop/catalog et /api/shop/orders.
  if (await storeSuspended(env, merchant) || await storeSubscriptionPending(env, merchant)) return json({ error: 'unauthorized' }, 401);
  if (!await commerceEnabled(env, merchant)) return json({ error: 'commerce-off' }, 403);
  const url = new URL(request.url);
  const number = str(url.searchParams.get('number'), 12);
  const token = str(url.searchParams.get('t'), 64);
  if (!/^W-[A-Z0-9]{5}$/.test(number) || !/^[a-f0-9]{32}$/.test(token)) return json({ error: 'not-found' }, 404);
  const row = await env.DB.prepare('SELECT * FROM web_orders WHERE merchant = ? AND number = ?').bind(merchant, number).first();
  if (!row || !sameToken(token, await statusToken(env, merchant, row.id))) return json({ error: 'not-found' }, 404);
  const o = shapeOrder(row);
  let parcel = null;
  if (o.saleId) {
    const p = await env.DB.prepare(
      'SELECT tracking, status, status_label FROM ozon_parcels WHERE merchant = ? AND sale_id = ? ORDER BY created_ts DESC LIMIT 1'
    ).bind(merchant, o.saleId).first();
    if (p) parcel = { tracking: str(p.tracking, 40), status: str(p.status, 40), label: str(p.status_label, 80) };
  }
  return json({ ok: true, order: {
    number: o.number, status: o.status === 'confirming' ? 'pending' : o.status,
    createdTs: o.createdTs, decidedTs: o.status === 'confirmed' || o.status === 'declined' ? o.decidedTs : 0,
    city: str(o.customer.city, 60),
    lines: o.lines.map((l) => ({ title: l.title, size: l.size, quantity: l.quantity })),
    deliveryCents: o.deliveryCents, totalCents: o.totalCents, parcel,
  } });
}
