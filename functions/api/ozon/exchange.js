// /api/ozon/exchange — a delivery customer swaps an item (Santos, 2 Nov 2026).
//
//   POST { merchant, saleId, id, swaps: [{ i, q, pid, size, color }],
//          feeOnCustomer?, receiver?, phone?, address?, cityId?, note?, by? }
//     → { ok, already, exchange: { id, saleId, swaps, backCents, outCents,
//         diffCents, creditCents, codCents }, parcel }
//
// The customer already has the order (often paid to the courier) and wants
// another size or colour. The shop sends the new piece as an Ozon « échange »
// parcel: the courier hands it over and takes the old one back. What the
// courier collects is the price difference only, plus the delivery fee when
// the customer pays it, never the order total again.
//
//   · `swaps` names lines of the original basket (i, q) and, for each, the
//     replacement variant. The value going back is read from the sale's frozen
//     basket; the value going out is the catalogue price, or the line's paid
//     price when the replacement is the same article (a size or colour swap
//     costs nothing, a discount on the ticket included). Neither comes from
//     the tablet.
//   · The exchange is ONE new delivery sale, id = `id` (from the till, one per
//     exchange), whose part to collect is the difference. A difference to
//     collect is then followed like any delivery: « Payé » chez Ozon writes it
//     into revenue (receivables.js › confirmByCarrier). A cheaper replacement
//     collects nothing: the shop keeps what the customer paid (`creditCents`
//     says how much, the till shows it before anyone confirms).
//   · The original sale gets a sale_audit 'delivery-exchange' row (note = id):
//     replaying the same id never sends two parcels, and the swapped units of
//     a line can never be swapped or returned twice.
//   · Ozon refuses (phone, address)? Nothing stays: the sale and its trace are
//     removed, the till says why, the order can be swapped again.
//   · Stock moves at the till, like a delivery return (livraisons.js): the new
//     piece leaves now, the old one is counted back in. If the original order
//     still holds its stock (_delivery-stock.js), its confirmation later takes
//     the old piece out once, so the count still ends right.
import { exactMerchant, json, readAccount, cities } from './_lib.js';
import { sendParcel, clean, PHONE_RE, CUSTOMER_FEE_CENTS } from './parcels.js';
import { owedCents } from '../receivables.js';  // readExchanges lives there too: the list reads it
import { readDeliveryCards } from '../_delivery-card.js';
import { __test as catalogFns } from '../catalog.js';

const ID_RE = /^xch-[A-Za-z0-9_-]{8,80}$/;
const MAX_SWAPS = 10;
const colorMatch = (v, color) => String(v.colorId || '') === String(color || '')
  || String(v.colorFamily || '') === String(color || '');

const parse = (raw, fallback) => { try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (_) { return fallback; } };

/* Units of each basket line already gone back: returns and earlier swaps. */
async function usedQty(db, merchant, saleId) {
  const used = new Map();
  const rs = await db.prepare(`SELECT action, impact FROM sale_audit WHERE merchant = ? AND sale_id = ?
    AND action IN ('delivery-return', 'delivery-exchange')`).bind(merchant, saleId).all();
  (rs.results || []).forEach((r) => {
    const imp = parse(r.impact || '{}', {});
    const rows = r.action === 'delivery-exchange' ? (imp.swaps || []) : (imp.lines || []);
    rows.forEach((l) => { const i = Number(l && l.i), q = Number(l && l.q) || 0; if (Number.isSafeInteger(i) && q > 0) used.set(i, (used.get(i) || 0) + q); });
  });
  return used;
}

function view(impact, id, saleId) {
  return { id, saleId, swaps: impact.swaps || [], backCents: impact.backCents || 0, outCents: impact.outCents || 0,
    diffCents: impact.diffCents || 0, creditCents: impact.creditCents || 0, codCents: impact.codCents || 0 };
}

async function prior(env, merchant, saleId, id) {
  const row = await env.DB.prepare(`SELECT impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-exchange' AND note = ?`)
    .bind(merchant, saleId, id).first();
  if (!row) return null;
  const parcel = await env.DB.prepare(`SELECT tracking FROM ozon_parcels WHERE merchant = ? AND sale_id = ?`).bind(merchant, id).first();
  return json({ ok: true, already: true, exchange: view(parse(row.impact || '{}', {}), id, saleId),
    parcel: parcel && !String(parcel.tracking).startsWith('pending:') ? { tracking: String(parcel.tracking) } : null });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await exactMerchant(request, env, String(b && b.merchant || ''), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const account = await readAccount(env, merchant);
  if (!account) return json({ error: 'not-connected' }, 409);
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return json({ error: 'bad-id' }, 400);
  const saleId = clean(b.saleId, 128);
  if (!saleId) return json({ error: 'sale-required' }, 400);
  const again = await prior(env, merchant, saleId, id);
  if (again) return again;

  const sale = await env.DB.prepare(`SELECT s.id, s.ref, s.ts, s.lines, s.method, s.payment_parts, s.amount, s.amount_cents, s.void_ts, r.gross_ticket_cents
      FROM sales s LEFT JOIN sale_receipts r ON r.merchant = s.merchant AND r.sale_id = s.id WHERE s.merchant = ? AND s.id = ?`)
    .bind(merchant, saleId).first();
  if (!sale || sale.void_ts != null || !(owedCents(sale) > 0)) return json({ error: 'not-a-delivery' }, 404);
  const closed = await env.DB.prepare(`SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action IN ('refund', 'delivery-writeoff') LIMIT 1`)
    .bind(merchant, saleId).first();
  if (closed) return json({ error: 'sale-closed' }, 409);

  const basket = parse(sale.lines || '[]', []);
  if (!Array.isArray(basket) || !basket.length) return json({ error: 'no-basket' }, 409);
  const raw = Array.isArray(b.swaps) ? b.swaps : [];
  if (!raw.length || raw.length > MAX_SWAPS) return json({ error: 'bad-swaps' }, 400);

  const catRow = await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?').bind(merchant).first();
  let cat = null;
  try { cat = catalogFns.sanitize(JSON.parse(catRow && catRow.data || 'null')); catalogFns.materialize(cat); } catch (_) { cat = null; }
  if (!cat) return json({ error: 'no-catalog' }, 409);

  const used = await usedQty(env.DB, merchant, saleId);
  const want = new Map();
  const outStock = new Map();
  const swaps = [];
  for (const s of raw) {
    const i = Number(s && s.i), q = Number(s && s.q);
    if (!Number.isSafeInteger(i) || i < 0 || i >= basket.length || !Number.isSafeInteger(q) || q < 1) return json({ error: 'bad-swaps' }, 400);
    const line = basket[i] || {};
    const lineQ = Number(line.q) || 0;
    want.set(i, (want.get(i) || 0) + q);
    const left = Math.max(0, lineQ - (used.get(i) || 0));
    if (want.get(i) > left) return json({ error: 'exceeds-line', i, left }, 409);
    const pid = clean(s.pid, 40), size = clean(s.size, 12), color = clean(s.color, 40);
    const product = (cat.products || []).find((p) => p.id === pid && !p.archived);
    if (!product) return json({ error: 'unknown-product', pid }, 409);
    const variants = (cat.variants || []).filter((v) => v.productId === pid && String(v.size || '') === size && colorMatch(v, color));
    if (!variants.length) return json({ error: 'unknown-variant', pid, size, color }, 409);
    const key = [pid, size, color].join(':');
    outStock.set(key, (outStock.get(key) || 0) + q);
    const onHand = variants.reduce((n, v) => n + Math.max(0, Number(v.stock) || 0), 0);
    if (outStock.get(key) > onHand) return json({ error: 'stock-insufficient', pid, size, color, onHand }, 409);
    const backCents = lineQ > 0 ? Math.round(Math.round(Number(line.t || 0) * 100) * q / lineQ) : 0;
    const samePiece = String(line.v || '').split(':')[0] === pid;
    const outCents = samePiece ? backCents : Math.round(Number(product.priceMAD || 0) * 100) * q;
    swaps.push({ i, q, pid, size, color, backCents, outCents, from: String(line.n || 'Article').slice(0, 60),
      to: (String(product.name || 'Article') + (size ? ' ' + size : '')).slice(0, 60), cat: String(line.c || '').slice(0, 40) });
  }

  const backCents = swaps.reduce((n, s) => n + s.backCents, 0);
  const outCents = swaps.reduce((n, s) => n + s.outCents, 0);
  const diffCents = Math.max(0, outCents - backCents);
  const creditCents = Math.max(0, backCents - outCents);
  const feeOnCustomer = b.feeOnCustomer === true || b.feeOnCustomer === 1 || b.feeOnCustomer === '1';
  const codCents = diffCents + (feeOnCustomer ? CUSTOMER_FEE_CENTS : 0);

  /* Who receives it: what the till sends, else the original parcel, else the
     delivery card taken at the sale. */
  const parcel = await env.DB.prepare('SELECT receiver, phone, city_id, address FROM ozon_parcels WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).first();
  const card = (await readDeliveryCards(env.DB, merchant)).get(saleId) || {};
  const receiver = clean(b.receiver, 80) || clean(parcel && parcel.receiver, 80) || clean(card.name, 80);
  const phone = (clean(b.phone, 20) || clean(parcel && parcel.phone, 20) || clean(card.phone, 20)).replace(/[\s.-]/g, '');
  const address = clean(b.address, 240) || clean(parcel && parcel.address, 240) || clean(card.address, 240);
  const cityId = Number(b.cityId) > 0 ? Number(b.cityId) : Number(parcel && parcel.city_id) > 0 ? Number(parcel.city_id) : Number(card.cityId) || 0;
  if (!receiver || !address || !PHONE_RE.test(phone) || !Number.isSafeInteger(cityId) || cityId <= 0) return json({ error: 'recipient-required' }, 409);
  let city = null;
  try { city = (await cities(env)).find((c) => c.id === cityId) || null; } catch (_) { city = null; }
  if (!city) return json({ error: 'unknown-city' }, 400);

  /* The new sale: what leaves, priced so that its lines add up to what the
     courier collects for the shop (the difference). */
  let given = 0;
  const lines = swaps.map((s, k) => {
    const t = k === swaps.length - 1 ? diffCents - given : (outCents > 0 ? Math.round(diffCents * s.outCents / outCents) : 0);
    given += t;
    const o = { n: s.to, q: s.q, t: t / 100, i: s.pid, v: [s.pid, s.size, s.color].join(':'), u: 'piece', kd: 'product' };
    if (s.cat) o.c = s.cat;
    return o;
  });
  const by = b.by && typeof b.by === 'object' ? b.by : {};
  const byId = String(by.id || '').slice(0, 64), byName = String(by.name || '').slice(0, 80);
  const now = Date.now();
  const ref = String(sale.ref || '');
  const impact = { swaps: swaps.map(({ i, q, pid, size, color, backCents: bc, outCents: oc, from, to }) => ({ i, q, pid, size, color, backCents: bc, outCents: oc, from, to })),
    exchangeSaleId: id, backCents, outCents, diffCents, creditCents, codCents, feeOnCustomer };
  const label = ('Échange · ' + (ref || saleId)).slice(0, 120);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
        SELECT ?, ?, 'delivery-exchange', 'customer-exchange', ?, ?, ?, ?, ?, 'delivery', ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'delivery-exchange' AND note = ?)`)
        .bind(merchant, saleId, id, byName, byId, Math.round(backCents / 100), backCents, ref, Number(sale.ts) || 0, JSON.stringify(impact), now, merchant, id),
      /* Written only with its trace (same id, same instant): a replay that lost
         the race writes nothing, and a taken id fails the whole batch. */
      env.DB.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, lines, channel)
        SELECT ?, ?, 0, 0, 'delivery', ?, ?, ?, ?, ?, 'delivery'
        WHERE EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-exchange' AND note = ? AND ts = ?)`)
        .bind(id, merchant, JSON.stringify([{ method: 'delivery', amountCents: diffCents }]), label, ref || null, now, JSON.stringify(lines), merchant, saleId, id, now),
    ]);
  } catch (_) {
    return (await prior(env, merchant, saleId, id)) || json({ error: 'id-taken' }, 409);
  }
  const mine = await env.DB.prepare(`SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND ts = ?`).bind(merchant, id, now).first();
  if (!mine) return (await prior(env, merchant, saleId, id)) || json({ error: 'exchange-in-progress' }, 409);

  const names = swaps.map((s) => s.to).join(', ');
  const sent = await sendParcel(env, merchant, account, {
    saleId: id, receiver, phone, cityId, city, address, codCents,
    nature: ('Échange · ' + names).slice(0, 120),
    note: ('Échange : reprendre ' + swaps.map((s) => s.from).join(', ') + (clean(b.note, 120) ? ' · ' + clean(b.note, 120) : '')).slice(0, 240),
    open: 1, fragile: false, replace: true,
  });
  const body = await sent.json();
  if (!body.ok) {
    /* Ozon said no: the exchange never happened. */
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM sales WHERE merchant = ? AND id = ? AND ts = ?`).bind(merchant, id, now),
      env.DB.prepare(`DELETE FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-exchange' AND note = ?`).bind(merchant, saleId, id),
    ]);
    return json({ error: body.error || 'ozon-refused', message: body.message || '' }, sent.status >= 400 ? sent.status : 502);
  }
  return json({ ok: true, already: false, exchange: view(impact, id, saleId), parcel: body.parcel || null });
}
