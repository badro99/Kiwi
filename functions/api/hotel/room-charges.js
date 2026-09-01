import { entitledMerchant, json } from '../../auth/_lib.js';
import { resolveHotelActor } from '../inventory/_hotel-actor.js';
import { resolveInventoryUnitScope } from '../inventory/_unit-scope.js';
import { appendRoomCharge, reverseRoomCharge, roomChargesByCashier } from './_room-charge-data.js';

const TABLE = 'hotel_room_charge_events';
const ROOM_METHODS = new Set(['room', 'folio']);
const TOKEN = /^[A-Za-z0-9._:-]+$/;

function token(value, max = 100) {
  const text = String(value == null ? '' : value).trim();
  return text && text.length <= max && TOKEN.test(text) ? text : '';
}
function timestamp(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}
function unavailable() {
  return json({ error: 'room-charge-unavailable', migrationRequired: true }, 503);
}
function eventFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''), kind: String(row.kind || ''), saleId: String(row.sale_id || ''),
    outletId: String(row.outlet_id || ''), shiftId: String(row.shift_id || ''),
    cashierId: String(row.cashier_id || ''), cashierName: String(row.cashier_name || ''),
    amountCents: Number(row.amount_cents) || 0, occurredTs: Number(row.occurred_ts) || 0,
    reversalOf: String(row.reversal_of || ''), reversedById: String(row.reversed_by_id || ''),
  };
}
async function saleFor(env, merchant, saleId) {
  return env.DB.prepare(
    `SELECT id, amount, amount_cents, method, ts, void_ts FROM sales
      WHERE merchant = ? AND id = ? LIMIT 1`
  ).bind(merchant, saleId).first();
}
async function cashierFor(env, merchant, cashierId) {
  const rows = await env.DB.prepare(
    "SELECT feature, data, updated_ts FROM store_docs WHERE merchant = ? AND feature IN ('employee-access', 'team')"
  ).bind(merchant).all();
  const docs = ((rows && rows.results) || []).map((row) => {
    try { return { ...row, value: JSON.parse(row.data || '{}') }; }
    catch (_) { return { ...row, value: {} }; }
  }).sort((a, b) => Number(b.updated_ts || 0) - Number(a.updated_ts || 0));
  for (const doc of docs) {
    const member = (Array.isArray(doc.value.members) ? doc.value.members : [])
      .find((entry) => entry && String(entry.id || '') === cashierId);
    if (member) return {
      id: cashierId,
      name: [member.firstName, member.lastName].filter(Boolean).join(' ').trim().slice(0, 100),
    };
  }
  return null;
}
async function storedEvent(env, merchant, id) {
  const row = await env.DB.prepare(
    `SELECT id, kind, sale_id, outlet_id, shift_id, cashier_id, cashier_name,
            amount_cents, occurred_ts, reversal_of, reversed_by_id
       FROM ${TABLE} WHERE merchant = ? AND id = ? LIMIT 1`
  ).bind(merchant, id).first();
  return eventFromRow(row);
}
async function insertEvent(env, merchant, line) {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO ${TABLE}
      (merchant, id, kind, sale_id, outlet_id, shift_id, cashier_id, cashier_name,
       amount_cents, occurred_ts, reversal_of, reversed_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    merchant, line.id, line.kind, line.saleId, line.outletId, line.shiftId,
    line.cashierId, line.cashierName || '', line.amountCents, line.occurredTs,
    line.reversalOf || '', line.reversedById || '',
  ).run();
  return {
    created: Number(result && result.meta && result.meta.changes) > 0,
    stored: await storedEvent(env, merchant, line.id),
  };
}
async function hotelManager(request, env, merchant) {
  const actor = await resolveHotelActor(request, env, merchant);
  return actor && actor.kind === 'hotel-manager' ? actor : null;
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = token(url.searchParams.get('merchant'), 64);
  const shiftId = token(url.searchParams.get('shiftId'), 80);
  if (!merchant || !shiftId) return json({ error: 'merchant-and-shift-required' }, 400);
  if (!(await hotelManager(request, env, merchant))) return json({ error: 'forbidden' }, 403);
  const scope = await resolveInventoryUnitScope(request, env, merchant);
  if (!scope.scoped) return json({ error: 'hotel-units-required' }, 409);
  const since = timestamp(url.searchParams.get('since'));
  const until = timestamp(url.searchParams.get('until')) || Date.now();
  if (since && until < since) return json({ error: 'bad-range' }, 400);
  try {
    const result = await env.DB.prepare(
      `SELECT id, kind, sale_id, outlet_id, shift_id, cashier_id, cashier_name,
              amount_cents, occurred_ts, reversal_of, reversed_by_id
         FROM ${TABLE}
        WHERE merchant = ? AND shift_id = ? AND occurred_ts >= ? AND occurred_ts <= ?
        ORDER BY occurred_ts, id`
    ).bind(merchant, shiftId, since, until).all();
    const lines = ((result && result.results) || []).map(eventFromRow).filter(Boolean);
    return json({ ok: true, report: roomChargesByCashier(lines, { shiftId, since, until }) });
  } catch (_) { return unavailable(); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = token(body && body.merchant, 64);
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant || merchant !== asked) return json({ error: 'forbidden' }, 403);
  const terminalId = token(body && body.terminalId, 80);
  const scope = await resolveInventoryUnitScope(request, env, merchant, { terminalId });
  if (!scope.scoped) return json({ error: 'hotel-units-required' }, 409);
  if (!scope.allowed) return json({ error: 'unit-forbidden' }, 403);
  const saleId = token(body && body.saleId, 64);
  if (!saleId) return json({ error: 'sale-required' }, 400);
  let sale;
  try { sale = await saleFor(env, merchant, saleId); }
  catch (_) { return unavailable(); }
  if (!sale) return json({ error: 'sale-not-found' }, 404);

  const action = String(body && body.action || 'append');
  if (action === 'reverse') {
    if (!Number(sale.void_ts)) return json({ error: 'sale-not-reversed' }, 409);
    let original;
    try { original = await storedEvent(env, merchant, `folio-charge:${saleId}`); }
    catch (_) { return unavailable(); }
    if (!original) return json({ error: 'room-charge-not-found' }, 404);
    if (scope.role === 'till' && original.outletId !== scope.unitId) {
      return json({ error: 'unit-forbidden' }, 403);
    }
    const reversed = reverseRoomCharge([original], saleId, {
      occurredTs: timestamp(sale.void_ts),
      actorId: scope.role === 'till' ? original.cashierId : 'manager',
    });
    if (!reversed.ok) return json({ error: reversed.error }, 422);
    try {
      const saved = await insertEvent(env, merchant, reversed.line);
      return saved.stored ? json({ ok: true, created: saved.created, charge: saved.stored }) : unavailable();
    } catch (_) { return unavailable(); }
  }
  if (action !== 'append') return json({ error: 'bad-action' }, 400);
  if (!ROOM_METHODS.has(String(sale.method || '').toLowerCase())) {
    return json({ error: 'sale-not-room-charge' }, 409);
  }
  if (Number(sale.void_ts)) return json({ error: 'sale-reversed' }, 409);
  const shiftId = token(body && body.shiftId, 80);
  const cashierId = token(body && body.cashierId, 80);
  if (!shiftId || !cashierId || /^\d{4}$/.test(cashierId)) {
    return json({ error: 'shift-and-cashier-required' }, 400);
  }
  const outletId = scope.role === 'till' ? scope.unitId : scope.effectiveUnit(body && body.outletId);
  if (!outletId || !scope.activeUnitIds.has(outletId)) {
    return json({ error: 'active-outlet-required' }, 422);
  }
  let cashier;
  try { cashier = await cashierFor(env, merchant, cashierId); }
  catch (_) { return unavailable(); }
  if (!cashier) return json({ error: 'cashier-not-found' }, 422);
  const amountCents = Number.isSafeInteger(Number(sale.amount_cents))
    ? Number(sale.amount_cents) : Math.round(Number(sale.amount || 0) * 100);
  const appended = appendRoomCharge([], {
    saleId, outletId, shiftId, cashierId: cashier.id, cashierName: cashier.name,
    amountCents, occurredTs: timestamp(sale.ts),
  });
  if (!appended.ok) return json({ error: appended.error }, 422);
  try {
    const saved = await insertEvent(env, merchant, appended.line);
    return saved.stored ? json({ ok: true, created: saved.created, charge: saved.stored }) : unavailable();
  } catch (_) { return unavailable(); }
}
