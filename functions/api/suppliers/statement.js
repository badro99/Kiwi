// GET /api/suppliers/statement?merchant=<slug>&id=<supplierId>[&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=500]
//
// Le relevé d'un fournisseur : la fiche, chaque ligne du grand livre avec le
// solde courant après elle, le solde (positif = nous lui devons),
// l'ancienneté de ce que nous devons et son tableau (commandé, % reçu, % payé,
// reste dû, taux de retour, panier moyen). De quoi imprimer, exporter en CSV
// ou envoyer par WhatsApp sans autre appel. `pending` : les réceptions et
// retours saisis par un employé, hors soldes jusqu'à l'accord du patron.
// `from`/`to` : une période ; le solde d'avant est reporté en ouverture.
// `orders` : par bon, reçu (net des retours), payé sur ce bon, reste à payer
// et son état (paid | partial | unpaid | none). Chaque ligne porte `poNumber`
// quand elle vient d'un bon : l'écran écrit « Réception BC-… » dans la langue
// du lecteur, le serveur n'écrit aucun libellé.
//
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor } from './_access.js';
import { partyStatement, partyBalance, ledgerAgeing, owedView, todayYmd, pendingEntries } from '../_ledger.js';
import { getSupplier, supplierView, supplierScorecard, orderBalances } from '../_suppliers.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  const row = await getSupplier(env, merchant, url.searchParams.get('id'));
  if (!row) return json({ error: 'not-found' }, 404);
  const today = todayYmd();
  const [statement, balance, ageing, scorecard, pending] = await Promise.all([
    partyStatement(env, merchant, 'supplier', row.id, {
      from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '', limit: url.searchParams.get('limit'),
    }),
    partyBalance(env, merchant, 'supplier', row.id),
    ledgerAgeing(env, merchant, 'supplier', row.id, { today, termsFor: () => Number(row.terms_days) || 0 }),
    supplierScorecard(env, merchant, row.id),
    pendingEntries(env, merchant, 'supplier', row.id),
  ]);
  const orders = await orderBalances(env, merchant, row.id);
  const numbers = new Map(orders.map((o) => [o.id, o.number]));
  const missing = [...new Set([...statement.lines, ...pending].map((l) => l.purchaseOrderId).filter((id) => id && !numbers.has(id)))];
  if (missing.length) {
    try {
      const got = await env.DB.prepare('SELECT id, number FROM purchase_orders WHERE merchant = ? AND id IN (SELECT value FROM json_each(?))')
        .bind(merchant, JSON.stringify(missing.slice(0, 200))).all();
      for (const o of (got && got.results) || []) numbers.set(String(o.id), String(o.number));
    } catch (_) { /* le n° manque, la ligne reste lisible */ }
  }
  const withPo = (l) => ({ ...l, poNumber: l.purchaseOrderId ? numbers.get(l.purchaseOrderId) || l.ref || '' : '' });
  statement.lines = statement.lines.map(withPo);
  return json({ ok: true, merchant, today, supplier: supplierView(row), balance, owed: owedView('supplier', balance.balanceCents),
    statement, ageing, scorecard, orders, pending: pending.map(withPo) });
}
