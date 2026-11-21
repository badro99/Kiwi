// GET  /api/suppliers?merchant=<slug>[&archived=1]
//   La liste des fournisseurs, chacun avec son solde (positif = nous lui
//   devons) et l'ancienneté de ce que nous devons (0–30, 31–60, 61–90, 90+ j),
//   plus les totaux de la page et le nombre de lignes en attente d'accord.
//   Importe au passage l'identité des fournisseurs du document `procurement`
//   (functions/api/_suppliers.js › syncProcurement), jamais de montant.
// POST /api/suppliers  { merchant, action: 'create'|'update'|'archive'|'restore', id?, supplier:{…} }
//   Crée ou modifie une fiche. Archiver la sort des listes, jamais du grand
//   livre : son relevé reste lisible.
//
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor, readBody } from './_access.js';
import { partyBalances, ageBuckets, todayYmd, LIVE, pendingEntries } from '../_ledger.js';
import { listSuppliers, supplierView, createSupplier, updateSupplier, syncProcurement } from '../_suppliers.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  const today = todayYmd();
  let sync = null;
  try { sync = await syncProcurement(env, merchant); } catch (_) { sync = null; }
  const [rows, balances] = await Promise.all([
    listSuppliers(env, merchant, { includeArchived: url.searchParams.get('archived') === '1' }),
    partyBalances(env, merchant, 'supplier'),
  ]);
  let ledgerRows = [];
  try {
    const got = await env.DB.prepare(
      `SELECT party_id, entry_date, created_at, direction, amount_cents FROM money_ledger
        WHERE merchant = ? AND party_type = 'supplier' AND ${LIVE} ORDER BY party_id, entry_date, created_at LIMIT 20000`
    ).bind(merchant).all();
    ledgerRows = (got && got.results) || [];
  } catch (_) { ledgerRows = []; }
  const byParty = new Map();
  for (const r of ledgerRows) {
    const k = String(r.party_id);
    if (!byParty.has(k)) byParty.set(k, []);
    byParty.get(k).push(r);
  }
  const pendingBy = new Map();
  for (const p of await pendingEntries(env, merchant, 'supplier', null)) pendingBy.set(p.partyId, (pendingBy.get(p.partyId) || 0) + 1);
  const listed = new Set(rows.map((s) => String(s.id)));
  let weOwe = 0, theyOwe = 0;
  const suppliers = rows.map((row) => {
    const v = supplierView(row);
    const b = balances.get(v.id) || { balanceCents: 0, inCents: 0, outCents: 0, count: 0, lastDate: '' };
    if (b.balanceCents > 0) weOwe += b.balanceCents; else theyOwe -= b.balanceCents;
    return { ...v, balanceCents: b.balanceCents, inCents: b.inCents, outCents: b.outCents, lines: b.count,
      lastDate: b.lastDate, pending: pendingBy.get(v.id) || 0, ageing: ageBuckets(byParty.get(v.id) || [], 'supplier', today) };
  });
  return json({
    ok: true, merchant, today, suppliers,
    totals: { weOweCents: weOwe, theyOweCents: theyOwe, count: suppliers.length, pending: suppliers.reduce((n, s) => n + s.pending, 0),
      ageing: ageBuckets(ledgerRows.filter((r) => listed.has(String(r.party_id))), 'supplier', today) },
    imported: sync && !sync.skipped ? { suppliers: sync.imported, lines: sync.posted } : null,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant, { write: true }))) return json({ error: 'owner-required' }, 403);
  const action = String(body.action || 'create');
  let res;
  if (action === 'create') res = await createSupplier(env, merchant, { ...(body.supplier || {}), id: body.id });
  else if (action === 'update') res = await updateSupplier(env, merchant, body.id, body.supplier || {});
  else if (action === 'archive' || action === 'restore') res = await updateSupplier(env, merchant, body.id, { archived: action === 'archive' });
  else return json({ error: 'unsupported-action' }, 400);
  if (!res.ok) return json({ error: res.error }, res.error === 'not-found' ? 404 : res.error === 'unmigrated' ? 503 : 400);
  return json({ ok: true, duplicate: !!res.duplicate, supplier: supplierView(res.supplier) });
}
