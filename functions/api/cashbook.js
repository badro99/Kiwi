// GET  /api/cashbook?merchant=<slug>[&from=YYYY-MM-DD&to=YYYY-MM-DD]
//   Le livre de caisse manuel : les entrées et sorties d'argent que le patron
//   note hors des ventes (apport, retrait, prêt, facture réglée de sa poche),
//   avec le solde courant. Même grand livre que les fournisseurs
//   (functions/api/_ledger.js), party_type 'cashbook', party_id 'main'.
// POST /api/cashbook { merchant, type: 'in'|'out', amount | amountCents, method, date, note, idemKey }
// POST /api/cashbook { merchant, action: 'archive', id }
//
// Les ventes de la caisse n'y sont PAS recopiées : elles vivent dans `sales`
// et la clôture de caisse ; ce livre-ci est celui que le patron tient lui-même.
// Patron et opérateur Kiwi seulement (./suppliers/_access.js).
import { json } from '../auth/_lib.js';
import { ledgerActor, readBody, centsFrom } from './suppliers/_access.js';
import { postLedgerEntry, archiveLedgerEntry, partyStatement, partyBalance } from './_ledger.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await ledgerActor(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  const [statement, balance] = await Promise.all([
    partyStatement(env, merchant, 'cashbook', 'main', {
      from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '', limit: url.searchParams.get('limit'),
    }),
    partyBalance(env, merchant, 'cashbook', 'main'),
  ]);
  return json({ ok: true, merchant, balance, statement });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await ledgerActor(request, env, merchant, { write: true });
  if (!actor) return json({ error: 'owner-required' }, 403);
  if (body.action === 'archive') {
    let row = null;
    try { row = await env.DB.prepare('SELECT party_type FROM money_ledger WHERE merchant = ? AND id = ?').bind(merchant, String(body.id || '').slice(0, 64)).first(); } catch (_) { row = null; }
    if (!row || row.party_type !== 'cashbook') return json({ error: 'not-found' }, 404);
    const res = await archiveLedgerEntry(env, merchant, body.id, { by: actor.name });
    return res.ok ? json({ ok: true, entry: res.entry }) : json({ error: res.error }, 503);
  }
  if (body.type !== 'in' && body.type !== 'out') return json({ error: 'bad-type' }, 400);
  if (!/^[A-Za-z0-9:._@-]{8,100}$/.test(String(body.idemKey || ''))) return json({ error: 'bad-idem' }, 400);
  const cents = centsFrom(body);
  if (!Number.isSafeInteger(cents) || cents <= 0) return json({ error: 'bad-amount' }, 400);
  const res = await postLedgerEntry(env, merchant, {
    idemKey: 'cash:' + body.idemKey, amountCents: cents, direction: body.type, partyType: 'cashbook', partyId: 'main',
    date: body.date || '', kind: 'manual', method: body.method || 'cash', note: body.note, createdBy: actor.name,
  });
  if (!res.ok) return json({ error: res.error }, res.error === 'idempotency-conflict' ? 409 : res.error === 'unmigrated' ? 503 : 400);
  return json({ ok: true, duplicate: res.duplicate, entry: res.entry, balance: await partyBalance(env, merchant, 'cashbook', 'main') });
}
