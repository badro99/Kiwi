// POST /api/pressing/cancel — authorize and durably cancel one pressing order.
// The PIN is accepted only here, server-side; the browser receives the proven
// manager identity and never gets a comparison list or a raw PIN record.
import { employeeRoleOpensDashboard, json, slugMerchant, verifyStaffPin } from '../../auth/_lib.js';
import { poke } from '../_live.js';

const MAX_DOCUMENT = 1500000;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = slugMerchant(body && body.merchant);
  const orderId = String(body && body.orderId || '').trim().slice(0, 40);
  const pin = String(body && body.pin || '').trim();
  if (!merchant || !orderId || !/^\d{4}$/.test(pin)) return json({ error: 'bad-request' }, 400);

  const verified = await verifyStaffPin(request, env, merchant, pin, { requireTill: true });
  if (!verified.ok) {
    if (verified.response) return verified.response;
    return json({ error: verified.error || 'unauthorized' }, verified.status || 403);
  }
  if (!employeeRoleOpensDashboard(verified.staff && verified.staff.role)) {
    return json({ error: 'manager-required' }, 403);
  }

  let current;
  try {
    current = await env.DB.prepare(
      'SELECT data, rev FROM store_docs WHERE merchant=? AND feature=\'pressing-orders\''
    ).bind(merchant).first();
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  if (!current) return json({ error: 'order-not-found' }, 404);

  let doc;
  try { doc = JSON.parse(current.data); } catch (_) { return json({ error: 'corrupt-document' }, 503); }
  if (!doc || !Array.isArray(doc.orders)) return json({ error: 'corrupt-document' }, 503);
  const order = doc.orders.find((row) => row && row.id === orderId);
  if (!order) return json({ error: 'order-not-found' }, 404);

  const actor = {
    id: String(verified.staff.id || '').slice(0, 80),
    name: String(verified.staff.name || '').slice(0, 100),
    role: String(verified.staff.role || '').slice(0, 40),
  };
  if (!actor.id && !actor.name) return json({ error: 'identity-unavailable' }, 503);
  if (order.cancelledAt) {
    return json({ ok: true, alreadyCancelled: true, orderId, actor: order.cancelledBy || actor, cancelledAt: order.cancelledAt, rev: current.rev || 0 });
  }

  const cancelledAt = new Date().toISOString();
  doc.orders = doc.orders.map((row) => row && row.id === orderId
    ? { ...row, cancelledAt, cancelledBy: actor, rack: null, updatedAt: Date.parse(cancelledAt) }
    : row);
  const cancellations = Array.isArray(doc.cancellations) ? doc.cancellations.filter((row) => row && row.id !== orderId) : [];
  cancellations.push({ id: orderId, cancelledAt, cancelledBy: actor });
  doc.cancellations = cancellations;
  doc.updatedAt = Date.now();
  const text = JSON.stringify(doc);
  if (text.length > MAX_DOCUMENT) return json({ error: 'too-large' }, 413);

  const serverRev = Number(current.rev) || 0;
  const nextRev = serverRev + 1;
  let written;
  try {
    written = await env.DB.prepare(
      'UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature=\'pressing-orders\' AND rev=?'
    ).bind(text, nextRev, Date.now(), merchant, serverRev).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }
  if (Number(written.meta?.changes) !== 1) return json({ error: 'stale', feature: 'pressing-orders' }, 409);

  await poke(env, merchant, 'pressing-orders');
  return json({ ok: true, orderId, actor, cancelledAt, rev: nextRev });
}
