// GET /api/suppliers/scorecard?merchant=<slug>&id=<supplierId>
//
// Le tableau d'un fournisseur, agrégé en SQL (functions/api/_suppliers.js ›
// supplierScorecard) : bons passés et montant commandé, panier moyen, % reçu
// et reste à recevoir, % payé et reste dû, taux de retour. Sans `id`, le
// tableau de chaque fournisseur actif, trié par reste dû.
//
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor } from './_access.js';
import { getSupplier, listSuppliers, supplierScorecard } from '../_suppliers.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  const id = url.searchParams.get('id');
  if (id) {
    const row = await getSupplier(env, merchant, id);
    if (!row) return json({ error: 'not-found' }, 404);
    return json({ ok: true, merchant, id: row.id, name: row.name, scorecard: await supplierScorecard(env, merchant, row.id) });
  }
  const rows = (await listSuppliers(env, merchant)).slice(0, 200);
  const cards = [];
  for (const row of rows) cards.push({ id: row.id, name: row.name, scorecard: await supplierScorecard(env, merchant, row.id) });
  cards.sort((a, b) => b.scorecard.unpaidCents - a.scorecard.unpaidCents);
  return json({ ok: true, merchant, suppliers: cards });
}
