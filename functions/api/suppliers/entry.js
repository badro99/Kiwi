// POST /api/suppliers/entry
//   { merchant, supplierId, type: 'payment'|'bill'|'opening', amount | amountCents,
//     method, date, note, idemKey, po?, owed?: 'merchant'|'party' }
//   payment = nous payons le fournisseur (out) ; bill = une facture ou un achat
//   à crédit hors bon de commande (in) ; opening = la dette d'avant Kiwi,
//   dans un sens ou dans l'autre (`owed`).
//   `po` = le numéro d'un bon de commande de CE fournisseur : le paiement lui
//   est rattaché (purchase_order_id).
// POST /api/suppliers/entry { merchant, action: 'archive', id }
//   Annule une ligne (archivée, hors soldes, gardée pour l'audit).
//
// `idemKey` vient du navigateur, une par geste : un double clic ou une requête
// rejouée retombe sur la même ligne (functions/api/_ledger.js).
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor, readBody, centsFrom } from './_access.js';
import { postLedgerEntry, archiveLedgerEntry, partyBalance } from '../_ledger.js';
import { getSupplier } from '../_suppliers.js';

const TYPES = {
  payment: { direction: 'out', kind: 'payment' },
  bill: { direction: 'in', kind: 'bill' },
  opening: { direction: 'in', kind: 'opening' },
};

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await ledgerActor(request, env, merchant, { write: true });
  if (!actor) return json({ error: 'owner-required' }, 403);

  if (body.action === 'archive') {
    /* Seule une ligne de fournisseur s'annule ici : le carnet client et le
       livre de caisse ont leurs propres portes. */
    let row = null;
    try { row = await env.DB.prepare("SELECT party_type FROM money_ledger WHERE merchant = ? AND id = ?").bind(merchant, String(body.id || '').slice(0, 64)).first(); } catch (_) { row = null; }
    if (!row || row.party_type !== 'supplier') return json({ error: 'not-found' }, 404);
    const res = await archiveLedgerEntry(env, merchant, body.id, { by: actor.name });
    return res.ok ? json({ ok: true, entry: res.entry }) : json({ error: res.error }, res.error === 'not-found' ? 404 : 503);
  }

  const type = TYPES[String(body.type || '')];
  if (!type) return json({ error: 'bad-type' }, 400);
  if (!/^[A-Za-z0-9:._@-]{8,100}$/.test(String(body.idemKey || ''))) return json({ error: 'bad-idem' }, 400);
  const supplier = await getSupplier(env, merchant, body.supplierId);
  if (!supplier) return json({ error: 'supplier-not-found' }, 404);
  const cents = centsFrom(body);
  if (!Number.isSafeInteger(cents) || cents <= 0) return json({ error: 'bad-amount' }, 400);
  let poId = null;
  const poNumber = String(body.po || '').slice(0, 40);
  if (poNumber) {
    let po = null;
    try { po = await env.DB.prepare('SELECT id, supplier_id FROM purchase_orders WHERE merchant = ? AND number = ?').bind(merchant, poNumber).first(); } catch (_) { po = null; }
    if (!po || (po.supplier_id && po.supplier_id !== supplier.id)) return json({ error: 'po-not-found' }, 404);
    poId = po.id;
  }
  const direction = body.type === 'opening' && body.owed === 'party' ? 'out' : type.direction;
  const res = await postLedgerEntry(env, merchant, {
    idemKey: 'sup:' + String(body.idemKey || ''), amountCents: cents, direction, partyType: 'supplier', partyId: supplier.id,
    date: body.date || '', kind: type.kind, method: body.method, note: body.note, purchaseOrderId: poId, createdBy: actor.name,
  });
  if (!res.ok) {
    const status = res.error === 'idempotency-conflict' ? 409 : res.error === 'unmigrated' || res.error === 'no-db' ? 503 : 400;
    return json({ error: res.error }, status);
  }
  const balance = await partyBalance(env, merchant, 'supplier', supplier.id);
  return json({ ok: true, duplicate: res.duplicate, entry: res.entry, balance });
}
