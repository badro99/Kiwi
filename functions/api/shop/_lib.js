/* Kiwi Commerce, shared by /api/shop/orders and /api/shop/decide.
 *
 * A merchant's online shop (the kiwi-storefronts project, one Cloudflare
 * Pages deployment for every store) sends its cash-on-delivery orders here.
 * Kiwi stays the authority: each line is checked against the merchant's own
 * catalogue (the `catalogs` row), the order waits `pending`, and only a
 * person in the shop turns it into a delivery sale. */
import { __test as catalogFns } from '../catalog.js';

export const MAX_LINES = 20;
export const MAX_QTY = 10;
export const MAX_PENDING = 200;            // une file que personne ne traite n'est plus une file
export const MAX_DELIVERY_CENTS = 50000;   // 500 MAD de livraison : au-delà, c'est une erreur

export const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const cents = (mad) => Math.round((Number(mad) || 0) * 100);

/* Off until an operator writes `true` (God Mode › modules). Missing row,
 * missing key, broken JSON, database down: off. */
export async function commerceEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT features FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).commerce === true;
  } catch (_) { return false; }
}

/* The merchant's catalogue as the server knows it, stock materialised. */
export async function readCatalog(env, merchant) {
  const row = await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?').bind(merchant).first();
  if (!row || !row.data) return null;
  const data = catalogFns.sanitize(JSON.parse(row.data));
  catalogFns.materialize(data);
  return data;
}

/* Moroccan numbers: 0[5-7]XXXXXXXX, +212 or 00212. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+212|00212|212|0)([5-7]\d{8})$/);
  return m ? '+212' + m[1] : '';
}

export function cleanCustomer(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {
    name: str(c.name, 80), phone: normalizePhone(c.phone), city: str(c.city, 60),
    address: str(c.address, 240), note: str(c.note, 300),
  };
  if (!out.name) return { error: 'name' };
  if (!out.phone) return { error: 'phone' };
  if (!out.city) return { error: 'city' };
  if (!out.address) return { error: 'address' };
  return { customer: out };
}

/* Each line against the catalogue. The storefront already priced the order;
 * Kiwi checks that every variant exists, is on the shop, and costs what the
 * storefront said. Stock is NOT checked here: an order takes nothing, and a
 * size that sold out since is the shop's call at confirmation. */
export function checkLines(catalog, rawLines) {
  if (!Array.isArray(rawLines) || !rawLines.length) return { error: 'empty' };
  if (rawLines.length > MAX_LINES) return { error: 'too-many-lines' };
  const products = new Map((catalog.products || []).map((p) => [p.id, p]));
  const variants = new Map((catalog.variants || []).map((v) => [v.id, v]));
  const merged = new Map();
  for (const l of rawLines) {
    const id = str(l && l.variantId, 64);
    const qty = Number(l && l.quantity);
    const unit = Number(l && l.unitCents);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY || !Number.isSafeInteger(unit) || unit < 0) return { error: 'bad-line' };
    const v = variants.get(id);
    const p = v && products.get(v.productId);
    if (!v || !p || p.archived || p.online === false) return { error: 'unknown-variant', variantId: id };
    if (unit !== cents(p.priceMAD)) return { error: 'price-changed', variantId: id };
    const prev = merged.get(id);
    if (prev) { prev.quantity = Math.min(MAX_QTY, prev.quantity + qty); continue; }
    merged.set(id, {
      variantId: id, productId: p.id, title: str(p.name, 120),
      size: str(v.size, 12), colorId: str(v.colorId, 40), color: str(v.colorLabel || '', 40),
      quantity: qty, unitCents: unit,
    });
  }
  const lines = [...merged.values()];
  return { lines, subtotalCents: lines.reduce((s, l) => s + l.unitCents * l.quantity, 0) };
}

/* Which lines the shop cannot fill from stock right now. */
export function shortLines(catalog, lines) {
  const stock = new Map((catalog.variants || []).map((v) => [v.id, Math.max(0, Number(v.stock) || 0)]));
  return lines.filter((l) => (stock.get(l.variantId) || 0) < l.quantity)
    .map((l) => ({ variantId: l.variantId, title: l.title, size: l.size, wanted: l.quantity, inStock: stock.get(l.variantId) || 0 }));
}

/* A short number a customer can read on the phone: W-7K3Q9. */
export function orderNumber() {
  const abc = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return 'W-' + [...bytes].map((b) => abc[b % abc.length]).join('');
}

export function shapeOrder(row) {
  let customer = {}, lines = [];
  try { customer = JSON.parse(row.customer || '{}') || {}; } catch (_) {}
  try { lines = JSON.parse(row.lines || '[]') || []; } catch (_) {}
  return {
    id: row.id, number: row.number, status: row.status, customer, lines,
    subtotalCents: Number(row.subtotal_cents) || 0, discountCents: Number(row.discount_cents) || 0,
    deliveryCents: Number(row.delivery_cents) || 0, totalCents: Number(row.total_cents) || 0,
    createdTs: Number(row.created_ts) || 0, decidedTs: Number(row.decided_ts) || 0,
    decidedBy: row.decided_by || '', reason: row.reason || '', saleId: row.sale_id || '',
  };
}

/* Splits the order's discount across its product lines (the last one takes
 * the rounding), so the lines of the sale add up to what the customer pays
 * for the goods. The delivery fee is its own line, kind `fee`, like the
 * pizzeria till's (assets/pos-pizzeria.js): stock never reads it. */
export function saleLines(order) {
  const goods = order.lines.map((l) => l.unitCents * l.quantity);
  const gross = goods.reduce((a, b) => a + b, 0);
  let left = order.discountCents;
  const out = order.lines.map((l, i) => {
    const off = i === order.lines.length - 1 ? left : Math.floor(order.discountCents * goods[i] / (gross || 1));
    left -= off;
    return {
      i: l.productId, v: [l.productId, l.size || '', l.colorId || ''].join(':'),
      n: (l.title + (l.size && l.size !== 'TU' ? ' ' + l.size : '')).slice(0, 60),
      q: l.quantity, t: (goods[i] - off) / 100, u: 'piece', kd: 'product',
    };
  });
  if (order.deliveryCents > 0) {
    out.push({ i: 'livraison-web', n: 'Livraison', c: 'livraison', q: 1, t: order.deliveryCents / 100, u: 'service', kd: 'fee' });
  }
  return out;
}
