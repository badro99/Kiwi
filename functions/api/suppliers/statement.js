// GET /api/suppliers/statement?merchant=<slug>&id=<supplierId>[&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=500]
//
// Le relevé d'un fournisseur : la fiche, chaque ligne du grand livre avec le
// solde courant après elle, le solde (positif = nous lui devons),
// l'ancienneté de ce que nous devons et son tableau (commandé, % reçu, % payé,
// reste dû, taux de retour, panier moyen). De quoi imprimer, exporter en CSV
// ou envoyer par WhatsApp sans autre appel.
//
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor } from './_access.js';
import { partyStatement, partyBalance, ledgerAgeing, owedView, todayYmd } from '../_ledger.js';
import { getSupplier, supplierView, supplierScorecard } from '../_suppliers.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  const row = await getSupplier(env, merchant, url.searchParams.get('id'));
  if (!row) return json({ error: 'not-found' }, 404);
  const today = todayYmd();
  const [statement, balance, ageing, scorecard] = await Promise.all([
    partyStatement(env, merchant, 'supplier', row.id, {
      from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '', limit: url.searchParams.get('limit'),
    }),
    partyBalance(env, merchant, 'supplier', row.id),
    ledgerAgeing(env, merchant, 'supplier', row.id, { today }),
    supplierScorecard(env, merchant, row.id),
  ]);
  let orders = [];
  try {
    const got = await env.DB.prepare(
      `SELECT id, number, status, total_cents, expected_date, created_ts, updated_ts FROM purchase_orders
        WHERE merchant = ? AND supplier_id = ? ORDER BY created_ts DESC LIMIT 20`
    ).bind(merchant, row.id).all();
    orders = ((got && got.results) || []).map((o) => ({ id: o.id, number: o.number, status: o.status,
      totalCents: Number(o.total_cents) || 0, expectedDate: o.expected_date || '', createdAt: Number(o.created_ts) || 0 }));
  } catch (_) { orders = []; }
  return json({ ok: true, merchant, today, supplier: supplierView(row), balance, owed: owedView('supplier', balance.balanceCents),
    statement, ageing, scorecard, orders });
}
