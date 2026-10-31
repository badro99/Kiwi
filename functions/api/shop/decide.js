// /api/shop/decide — a person in the shop confirms or declines an online order.
//
//   POST { merchant, id, action: 'confirm' | 'decline', reason?, force? }
//
// Confirm turns the order into the shop's ordinary delivery sale: 0 MAD now,
// the total owed by the courier (settlementKind `receivable`), the customer's
// card for Livraisons and Ozon, and stock held until the delivery is settled
// (functions/api/_delivery-stock.js). The sale is written by /api/sale itself,
// called with the caller's own session, so it passes exactly the checks a
// sale from the till passes, and a till's day sees it like any delivery.
//
// The sale id is fixed per order (`web-<order id>`): confirming twice, or
// retrying after a timeout, can never write two sales.

import { json, entitledMerchant, readCookie, TILL_COOKIE } from '../../auth/_lib.js';
import { onRequestPost as recordSale } from '../sale.js';
import { readCatalog, shapeOrder, shortLines, saleLines, str } from './_lib.js';

const STUCK_MS = 60 * 1000;   // a confirmation that died half-way may be retried after a minute

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await entitledMerchant(request, env, str(b && b.merchant, 64), { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const id = str(b && b.id, 64);
  const action = b && b.action;
  if (!id || (action !== 'confirm' && action !== 'decline')) return json({ error: 'bad-request' }, 400);
  const by = readCookie(request, TILL_COOKIE) ? 'caisse' : 'tableau de bord';

  const row = await env.DB.prepare('SELECT * FROM web_orders WHERE merchant = ? AND id = ?').bind(merchant, id).first();
  if (!row) return json({ error: 'not-found' }, 404);
  const now = Date.now();

  if (action === 'decline') {
    const done = await env.DB.prepare(
      `UPDATE web_orders SET status = 'declined', reason = ?, decided_ts = ?, decided_by = ?
        WHERE merchant = ? AND id = ? AND status = 'pending' RETURNING *`
    ).bind(str(b.reason, 200), now, by, merchant, id).first();
    if (!done) return json({ error: 'already-decided', status: row.status }, 409);
    return json({ ok: true, order: shapeOrder(done) });
  }

  if (row.status === 'confirmed') return json({ ok: true, order: shapeOrder(row), duplicate: true });
  const stuck = row.status === 'confirming' && now - Number(row.decided_ts || 0) > STUCK_MS;
  if (row.status !== 'pending' && !stuck) return json({ error: 'already-decided', status: row.status }, 409);

  const order = shapeOrder(row);
  /* A size that sold at the counter since the order came in: say which,
     and let the shop decide (it may have one in the back). */
  if (b.force !== true) {
    let catalog = null;
    try { catalog = await readCatalog(env, merchant); } catch (_) {}
    const short = catalog ? shortLines(catalog, order.lines) : [];
    if (short.length) return json({ error: 'short', short }, 409);
  }

  const claim = await env.DB.prepare(
    `UPDATE web_orders SET status = 'confirming', decided_ts = ?, decided_by = ?
      WHERE merchant = ? AND id = ? AND (status = 'pending' OR (status = 'confirming' AND decided_ts < ?))`
  ).bind(now, by, merchant, id, now - STUCK_MS).run();
  if (!claim.meta || Number(claim.meta.changes) !== 1) return json({ error: 'already-decided' }, 409);

  const first = order.lines[0];
  const pieces = order.lines.reduce((n, l) => n + l.quantity, 0);
  const label = 'En ligne ' + order.number + ' · ' + (first ? first.title : 'Commande')
    + (pieces > (first ? first.quantity : 0) ? ' +' + (pieces - first.quantity) + ' art.' : '');
  const payload = {
    merchant, id: 'web-' + id, ts: now,
    amount: 0, amountCents: 0, method: 'delivery',
    settlementKind: 'receivable', ticketAmountCents: order.totalCents,
    paymentParts: [{ method: 'delivery', amountCents: order.totalCents }],
    channel: 'delivery', stockHeld: true,
    deliveryCard: {
      name: order.customer.name, phone: order.customer.phone, city: order.customer.city,
      address: order.customer.address, ...(order.customer.cityId ? { cityId: order.customer.cityId } : {}), note: [order.number, order.customer.note].filter(Boolean).join(' · '),
    },
    label: label.slice(0, 80), ref: order.number,
    lines: saleLines(order),
  };
  let res = null, data = null;
  try {
    res = await recordSale({
      request: new Request(new URL('/api/sale', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('Cookie') || '' },
        body: JSON.stringify(payload),
      }),
      env, waitUntil,
    });
    data = await res.json().catch(() => null);
  } catch (_) { res = null; }

  if (!res || !res.ok || !data || !data.ok) {
    await env.DB.prepare(`UPDATE web_orders SET status = 'pending', decided_ts = 0, decided_by = '' WHERE merchant = ? AND id = ? AND status = 'confirming'`)
      .bind(merchant, id).run().catch(() => null);
    return json({ error: 'sale-refused', detail: (data && data.error) || 'unavailable' }, res && res.status >= 400 && res.status < 500 ? res.status : 502);
  }
  const done = await env.DB.prepare(
    `UPDATE web_orders SET status = 'confirmed', sale_id = ?, decided_ts = ?, decided_by = ?
      WHERE merchant = ? AND id = ? RETURNING *`
  ).bind(String(data.id || payload.id), now, by, merchant, id).first();
  return json({ ok: true, order: shapeOrder(done || row) });
}
