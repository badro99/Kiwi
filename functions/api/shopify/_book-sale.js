/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Shopify hors Maroc : une commande PAYÉE est une vente
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, boutique Startoner en Espagne) : « when
 * an order comes thru, we'll see it here? ». Au Maroc, la porte des webhooks
 * range une commande Shopify en ticket « pending » qui attend un geste au
 * comptoir (le relais OrderPro des restaurants). Une boutique en ligne
 * espagnole n'a personne pour régler ce ticket : le client a déjà payé chez
 * Shopify. Pour un commerce hors Maroc, la commande payée entre donc dans les
 * livres comme vente, au jour et à l'heure de la commande, dans la devise du
 * pays, sans ticket.
 *
 *  · L'id est celui de la reprise d'historique (functions/api/admin/
 *    channel-sales.js) : shp:<commerce>:<numéro visible>. Une commande déjà
 *    reprise, ou reçue deux fois (orders/create puis orders/paid), n'ajoute
 *    rien, et une vente écrite par quelqu'un d'autre n'est jamais réécrite.
 *  · Annulation et remboursement ajoutent une contre-écriture négative au
 *    canal `refund`, avec sa ligne sale_audit, comme un retour au comptoir
 *    (functions/api/sale/refund.js). Le total rendu ne dépasse jamais la vente :
 *    une annulation suivie de son remboursement ne rend pas deux fois.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { shopifyGraphQL } from './_lib.js';
import { poke } from '../_live.js';

const MAX_CENTS = 100000000;
const BOOKED = new Set(['paid', 'partially_paid', 'partially_refunded']);
const AUTHOR = 'channel:shopify';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/* « #1072 » → « 1072 », comme la reprise d'historique. */
export function orderNumber(name) {
  return str(name, 64).replace(/[^A-Za-z0-9_-]/g, '');
}
export function saleIdFor(merchant, number) {
  return ('shp:' + merchant + ':' + number).slice(0, 120);
}

/* La passerelle dit comment le client a payé. PayPal, Bizum et les
 * portefeuilles comptent comme portefeuille, le paiement manuel et le
 * virement comme virement, le paiement à la livraison comme espèces. */
export function methodOf(order) {
  const names = (Array.isArray(order && order.payment_gateway_names) ? order.payment_gateway_names : [order && order.gateway])
    .map((g) => String(g || '').toLowerCase()).join(' ');
  if (/paypal|bizum|wallet|apple|google|klarna/.test(names)) return 'wallet';
  if (/manual|bank|transfer|transferencia|deposit/.test(names)) return 'transfer';
  if (/cash|cod|contra|reembolso/.test(names)) return 'cash';
  return 'card';
}

export function linesOf(order) {
  const items = Array.isArray(order && order.line_items) ? order.line_items : [];
  return items.slice(0, 40).map((l) => {
    const variant = str(l && l.variant_title, 60);
    const q = Math.max(1, Math.round(Number(l && l.quantity) || 1));
    const off = (Array.isArray(l && l.discount_allocations) ? l.discount_allocations : [])
      .reduce((s, d) => s + (cents(d && d.amount) || 0), 0);
    const gross = (cents(l && l.price) || 0) * q;
    return {
      n: (str(l && (l.title || l.name), 80) + (variant && variant !== 'Default Title' ? ' · ' + variant : '')).slice(0, 80),
      q,
      t: Math.max(0, gross - off) / 100,
    };
  }).filter((l) => l.n);
}

export function isPaid(order) {
  return BOOKED.has(String(order && order.financial_status || '').toLowerCase());
}

/* Écrit la vente si la commande est payée. { booked, id } ou { waiting }. */
export async function bookShopifySale(env, merchant, order) {
  if (!isPaid(order)) return { waiting: 'payment' };
  const number = orderNumber(order && order.name) || orderNumber(order && order.id);
  const total = cents(order && order.total_price);
  if (!number) return { error: 'no-order-number' };
  if (!Number.isInteger(total) || total < 0 || total > MAX_CENTS) return { error: 'bad-total' };
  const ts = Date.parse(str(order.processed_at || order.created_at, 40));
  const now = Date.now();
  const id = saleIdFor(merchant, number);
  await env.DB.prepare(
    `INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, received_ts, written_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shopify', ?, ?) ON CONFLICT(id) DO NOTHING`
  ).bind(id, merchant, Math.round(total / 100), total, methodOf(order), ('Shopify ' + number).slice(0, 80),
    number, Number.isFinite(ts) ? ts : now, JSON.stringify(linesOf(order)), now, AUTHOR).run();
  try { await poke(env, merchant, 'sales'); } catch (_) { /* le flux suivant la verra */ }
  return { booked: true, id };
}

async function numberForOrderId(env, merchant, orderId) {
  const gid = String(orderId).startsWith('gid://') ? String(orderId) : 'gid://shopify/Order/' + orderId;
  const out = await shopifyGraphQL(env, merchant, 'query KiwiOrderName($id: ID!) { order(id: $id) { name } }', { id: gid });
  return orderNumber(out && out.data && out.data.order && out.data.order.name);
}

/* Contre-écriture d'une annulation (tout le reste) ou d'un remboursement (ses
 * transactions réussies), plafonnée à ce qui reste de la vente. */
export async function reverseShopifySale(env, merchant, topic, payload) {
  const refund = topic === 'refunds/create';
  let number, key, asked;
  if (refund) {
    const refundId = str(payload && payload.id, 40).replace(/[^A-Za-z0-9_-]/g, '');
    if (!refundId || !(payload && payload.order_id)) return { done: true, ignored: 'remboursement-incomplet' };
    asked = (Array.isArray(payload.transactions) ? payload.transactions : [])
      .filter((t) => t && String(t.kind) === 'refund' && String(t.status) === 'success')
      .reduce((s, t) => s + (cents(t.amount) || 0), 0);
    if (asked <= 0) return { done: true, ignored: 'sans-montant' };
    number = await numberForOrderId(env, merchant, payload.order_id);
    key = 'rf' + refundId;
  } else {
    number = orderNumber(payload && payload.name);
    key = 'cancel';
    asked = Infinity;
  }
  if (!number) return { done: true, ignored: 'commande-inconnue' };
  const saleId = saleIdFor(merchant, number);
  const original = await env.DB.prepare(
    'SELECT id, amount_cents, amount, method, ts FROM sales WHERE merchant = ? AND id = ? AND void_ts IS NULL'
  ).bind(merchant, saleId).first();
  if (!original) return { done: true, ignored: 'vente-absente' };
  const originalCents = Number(original.amount_cents != null ? original.amount_cents : Number(original.amount) * 100) || 0;
  const already = await env.DB.prepare(
    "SELECT COALESCE(SUM(-amount_cents), 0) AS back FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'refund'"
  ).bind(merchant, saleId).first();
  const take = Math.min(asked, originalCents - (Number(already && already.back) || 0));
  if (!(take > 0)) return { done: true, ignored: 'deja-rendu' };

  const refundId = (saleId + ':' + key).slice(0, 140);
  const now = Date.now();
  const label = ((refund ? 'Remboursement Shopify ' : 'Annulation Shopify ') + number).slice(0, 80);
  /* Les deux écritures se tiennent : la ligne d'audit ne s'écrit que si la
   * contre-écriture existe, et ni l'une ni l'autre ne s'écrit deux fois. */
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, received_ts, written_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'refund', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?)`
    ).bind(refundId, merchant, -Math.round(take / 100), -take, String(original.method || 'card'), label, number, now, now, AUTHOR,
      merchant, refundId),
    env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
       SELECT ?, ?, 'refund', ?, ?, 'shopify', '', ?, ?, ?, ?, ?, '', ?
        WHERE EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND amount_cents = ?)
          AND NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND action = 'refund' AND note = ?)`
    ).bind(merchant, saleId, refund ? 'shopify-refund' : 'shopify-cancel', refundId, -Math.round(take / 100), -take,
      String(original.method || 'card'), number, Number(original.ts) || 0, now,
      merchant, refundId, -take, merchant, refundId),
  ]);
  try { await poke(env, merchant, 'sales'); } catch (_) {}
  return { done: true, refunded: take, id: refundId };
}
