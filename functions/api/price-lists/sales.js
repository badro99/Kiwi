// /api/price-lists/sales — ce que chaque tarif a vendu, et les ventes signalées.
//
//   GET ?merchant=…&days=30 → { ok, days, since,
//        lists: [{ listId, name, sales, amountCents, flagged }],      // hors principal
//        flags: [{ saleId, ref, amountCents, method, reason, note, saleTs, listId }] }
//
// Le patron voit ici, sans passer par la console Kiwi, les ventes faites à un
// tarif (gros, fiche client) et celles que le serveur a signalées parce
// qu'aucun code responsable ne les accompagnait (sale_audit
// 'price-list-policy', écrit par _price-list-sale.js). Lecture réservée à qui
// gère les tarifs (canManage) : un montant de vente n'est pas pour la caisse.
import { json, isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { ownerMerchant } from '../_private.js';
import { str, visibleLists, canManage } from '../_price-lists.js';

const DEPS = { isOperator, sessionTierAtLeast, ownerMerchant };
const DAY = 86400000;

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = str(url.searchParams.get('merchant'), 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await canManage(request, env, merchant, DEPS))) return json({ error: 'forbidden' }, 403);
  const days = Math.max(1, Math.min(90, Math.round(Number(url.searchParams.get('days')) || 30)));
  const since = Date.now() - days * DAY;
  const names = new Map((await visibleLists(env, merchant, { archived: true })).map((l) => [l.id, l.name]));
  let rows = [], flags = [];
  try {
    rows = ((await env.DB.prepare(
      `SELECT price_list_id AS list_id, COUNT(*) AS sales, COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS amount_cents
         FROM sales WHERE merchant = ? AND ts >= ? AND void_ts IS NULL AND price_list_id IS NOT NULL
        GROUP BY price_list_id ORDER BY amount_cents DESC LIMIT 60`
    ).bind(merchant, since).all()).results) || [];
  } catch (_) { rows = []; /* base pas encore migrée : aucune vente à un tarif */ }
  try {
    flags = ((await env.DB.prepare(
      `SELECT sale_id, ref, amount_cents, method, reason, note, sale_ts, impact
         FROM sale_audit WHERE merchant = ? AND action = 'price-list-policy' AND ts >= ?
        ORDER BY ts DESC LIMIT 200`
    ).bind(merchant, since).all()).results) || [];
  } catch (_) { flags = []; }
  const listOf = (impact) => { try { return String(JSON.parse(impact || '{}').priceListId || ''); } catch (_) { return ''; } };
  const flagged = new Map();
  for (const f of flags) { const id = listOf(f.impact); flagged.set(id, (flagged.get(id) || 0) + 1); }
  return json({
    ok: true, days, since,
    lists: rows.map((r) => ({ listId: String(r.list_id), name: names.get(String(r.list_id)) || String(r.list_id),
      sales: Number(r.sales) || 0, amountCents: Number(r.amount_cents) || 0, flagged: flagged.get(String(r.list_id)) || 0 })),
    flags: flags.map((f) => ({ saleId: String(f.sale_id), ref: String(f.ref || ''), amountCents: Number(f.amount_cents) || 0,
      method: String(f.method || ''), reason: String(f.reason || ''), note: String(f.note || ''), saleTs: Number(f.sale_ts) || 0, listId: listOf(f.impact) })),
  });
}
