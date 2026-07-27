// /api/order/queue — the STAFF half of the order relay (the caisse).
//
//   GET  ?merchant=slug&since=<ts>        → { ok, orders:[…], now }
//   POST { merchant, id, status }         → { ok, id, status }
//
// NOT public. This path is deliberately left OUT of the gate's OrderPro
// carve-out (which matches /api/order exactly, not the prefix), so reaching it
// requires the same credentials as the rest of the site — in practice the
// caisse's kiwi_gate staff cookie, exactly like /api/sale.
//
// This is where the human decision lives. An order arrives as `pending` and
// STAYS pending until staff accept it; only then is it a kitchen ticket. Nothing
// here is automatic — no auto-accept, no timeout that promotes an order. If the
// till is busy the customer sees "waiting for the till", which is the truth.
//
// Status flow:  pending → accepted → ready
//                   └──→ rejected            (staff declined; terminal)

import { json, entitledMerchant } from '../../auth/_lib.js';

const NEXT = { accepted: 1, ready: 1, rejected: 1 };
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;
const MAX_ROWS = 100;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const asked = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  /* The gate admits every signed-in merchant plus a shared staff passcode, so
   * "reached this endpoint" never meant "owns this store". Reading the slug from
   * the query let any caller pull another restaurant's live queue — items,
   * notes, totals, table numbers. Server decides now. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  // `since` is the caisse's cursor: it polls for anything that changed after the
  // last answer, so a long shift costs one small response per poll.
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const now = Date.now();

  /* Deux requêtes pour une seule idée. Les colonnes de canal (channel, ext_ref,
   * customer) sont arrivées avec /api/channel/order ; une base où la migration
   * n'est pas encore passée fait échouer le SELECT qui les nomme. Sans ce
   * repli, ajouter la livraison aurait ÉTEINT la file des commandes du
   * téléphone client sur toute base pas encore migrée — casser ce qui marche
   * pour livrer ce qui n'existe pas encore. */
  const COLS = 'id, number, mode, table_no, total, lines, status, created_ts, updated_ts';
  const WHERE = `FROM orders
        WHERE merchant = ? AND updated_ts > ? AND status IN ('pending','accepted','ready')
        ORDER BY created_ts
        LIMIT ?`;
  let rows = { results: [] };
  try {
    rows = await env.DB.prepare(`SELECT ${COLS}, channel, ext_ref, customer ${WHERE}`)
      .bind(merchant, since, MAX_ROWS).all();
  } catch (_) {
    try {
      rows = await env.DB.prepare(`SELECT ${COLS} ${WHERE}`)
        .bind(merchant, since, MAX_ROWS).all();
    } catch (_) {
      // Table pas migrée du tout → une file vide, jamais une erreur que la
      // caisse aurait à gérer. Elle continue d'interroger et s'allume au déploiement.
      return json({ ok: true, orders: [], now });
    }
  }

  const orders = (rows.results || []).map((r) => {
    let lines = [];
    try { lines = JSON.parse(r.lines) || []; } catch (_) { lines = []; }
    let customer = null;
    try { customer = r.customer ? JSON.parse(r.customer) : null; } catch (_) { customer = null; }
    return {
      id: r.id, number: r.number, mode: r.mode, table: r.table_no || '',
      total: r.total, lines, status: r.status,
      // Absent (base pas encore migrée) ⇒ 'kiwi' : une commande sans canal est
      // une commande du relais d'origine, c'est ce qu'elle a toujours été.
      channel: r.channel || 'kiwi',
      ref: r.ext_ref || '',
      customer,
      created_ts: r.created_ts, updated_ts: r.updated_ts,
    };
  });
  return json({ ok: true, orders, now });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  const id = String((b && b.id) || '').trim();
  const status = String((b && b.status) || '').trim();
  if (!asked || !ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);
  if (!NEXT[status]) return json({ error: 'bad-status' }, 400);

  /* Same hole on the write side: accepting or rejecting another store's tickets
   * only ever required knowing its slug. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  const now = Date.now();
  let row;
  try {
    // merchant in the WHERE keeps one store from touching another's tickets —
    // which is only true now that `merchant` is server-derived. It used to come
    // straight from this request body, so the clause was filled in by whoever
    // was attacking it. RETURNING tells us whether the row really existed.
    row = await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_ts = ?
        WHERE id = ? AND merchant = ?
        RETURNING id, status, number`
    ).bind(status, now, id, merchant).first();
  } catch (e) {
    return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
  }
  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, id: row.id, status: row.status, number: row.number });
}
