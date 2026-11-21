// /api/price-lists/sales — ce que chaque tarif a vendu, et les ventes signalées.
//
//   GET ?merchant=…&days=30 → { ok, days, since,
//        lists: [{ listId, name, sales, grossCents, refundCents, refunds, amountCents, flagged }],  // hors principal
//        unattributed: { count, cents },
//        flags: [{ saleId, ref, amountCents, method, reason, note, saleTs, listId }] }
//
// Les remboursements et les retours sont déduits, au jour où ils sont faits
// (comme les commissions) : `amountCents` = ventes - remboursements liés.
//   · remboursement de caisse : sale_audit 'refund', sale_id = la vente d'origine ;
//   · retour en avoir : store_credits.original_sale_id.
// Une vente négative qu'aucun des deux ne relie à sa vente d'origine ne peut pas
// être rangée sous un tarif : elle revient dans `unattributed`, pour que le
// patron voie qu'il manque quelque chose plutôt qu'un total trop beau.
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
  let rows = [], flags = [], refunds = [], credits = [], loose = null;
  try {
    rows = ((await env.DB.prepare(
      `SELECT price_list_id AS list_id, COUNT(*) AS sales, COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS amount_cents
         FROM sales WHERE merchant = ? AND ts >= ? AND void_ts IS NULL AND price_list_id IS NOT NULL AND COALESCE(amount_cents, amount * 100) > 0
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
  try {
    refunds = ((await env.DB.prepare(
      `SELECT s.price_list_id AS list_id, COUNT(*) AS n, COALESCE(SUM(COALESCE(a.amount_cents, a.amount * 100)), 0) AS cents
         FROM sale_audit a JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
        WHERE a.merchant = ? AND a.action = 'refund' AND a.ts >= ? AND s.void_ts IS NULL AND s.price_list_id IS NOT NULL
        GROUP BY s.price_list_id`
    ).bind(merchant, since).all()).results) || [];
  } catch (_) { refunds = []; }
  try {
    credits = ((await env.DB.prepare(
      `SELECT s.price_list_id AS list_id, COUNT(*) AS n, COALESCE(SUM(c.amount_cents), 0) AS cents
         FROM store_credits c JOIN sales s ON s.merchant = c.merchant AND s.id = c.original_sale_id
        WHERE c.merchant = ? AND c.created_ts >= ? AND c.original_sale_id != '' AND s.void_ts IS NULL AND s.price_list_id IS NOT NULL
        GROUP BY s.price_list_id`
    ).bind(merchant, since).all()).results) || [];
  } catch (_) { credits = []; }
  try {
    // Une vente négative (remboursement, retour) que rien ne relie à une vente :
    // ni une ligne sale_audit 'refund' (note = son id), ni un avoir lié
    // (« ret-<avoir> »). Le remboursement d'avance du carnet n'est pas un retour.
    loose = await env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(-COALESCE(r.amount_cents, r.amount * 100)), 0) AS cents
         FROM sales r
        WHERE r.merchant = ? AND r.ts >= ? AND r.void_ts IS NULL AND COALESCE(r.amount_cents, r.amount * 100) < 0
          AND COALESCE(r.channel, '') != 'credit-book'
          AND NOT EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = r.merchant AND a.action = 'refund' AND a.note = r.id)
          AND NOT EXISTS (SELECT 1 FROM store_credits c WHERE c.merchant = r.merchant AND 'ret-' || c.id = r.id AND c.original_sale_id != '')`
    ).bind(merchant, since).first();
  } catch (_) { loose = null; }
  const listOf = (impact) => { try { return String(JSON.parse(impact || '{}').priceListId || ''); } catch (_) { return ''; } };
  const flagged = new Map();
  for (const f of flags) { const id = listOf(f.impact); flagged.set(id, (flagged.get(id) || 0) + 1); }
  const byList = new Map();
  const row = (id) => {
    if (!byList.has(id)) byList.set(id, { listId: id, name: names.get(id) || id, sales: 0, grossCents: 0, refundCents: 0, refunds: 0, amountCents: 0, flagged: flagged.get(id) || 0 });
    return byList.get(id);
  };
  for (const r of rows) { const o = row(String(r.list_id)); o.sales = Number(r.sales) || 0; o.grossCents = Number(r.amount_cents) || 0; }
  for (const r of [...refunds, ...credits]) { const o = row(String(r.list_id)); o.refunds += Number(r.n) || 0; o.refundCents += Number(r.cents) || 0; }
  const lists = [...byList.values()].map((o) => ({ ...o, amountCents: o.grossCents - o.refundCents })).sort((a, b) => b.grossCents - a.grossCents);
  return json({
    ok: true, days, since, lists,
    unattributed: { count: Number(loose && loose.n) || 0, cents: Number(loose && loose.cents) || 0 },
    flags: flags.map((f) => ({ saleId: String(f.sale_id), ref: String(f.ref || ''), amountCents: Number(f.amount_cents) || 0,
      method: String(f.method || ''), reason: String(f.reason || ''), note: String(f.note || ''), saleTs: Number(f.sale_ts) || 0, listId: listOf(f.impact) })),
  });
}
