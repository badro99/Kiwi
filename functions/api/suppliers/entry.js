// POST /api/suppliers/entry
//   { merchant, supplierId, type: 'payment'|'bill'|'opening', amount | amountCents,
//     method, date, note, idemKey, po?, owed?: 'merchant'|'party' }
//   payment = nous payons le fournisseur (out) ; bill = une facture ou un achat
//   à crédit hors bon de commande (in) ; opening = la dette d'avant Kiwi,
//   dans un sens ou dans l'autre (`owed`).
//   `po` = le numéro d'un bon de commande de CE fournisseur : le paiement lui
//   est rattaché (purchase_order_id).
// POST /api/suppliers/entry { merchant, action: 'archive', id }
//   Annule une ligne (archivée, hors soldes, gardée pour l'audit). Sur une
//   ligne en attente, c'est le refus.
// POST /api/suppliers/entry { merchant, action: 'approve', id }
//   Le patron approuve une réception ou un retour saisi par un employé : la
//   ligne en attente entre dans les soldes.
// POST /api/suppliers/entry { merchant, action: 'approve-all', supplierId? }
//   Tout ce qui attend (un fournisseur, ou tous) entre dans les soldes. Les
//   réceptions sans fiche n'en font pas partie : elles se rattachent d'abord.
// POST /api/suppliers/entry { merchant, action: 'attach', po, supplierId }
//   Une réception d'un bon sans fiche (tiers provisoire « po:<n°> ») passe sur
//   une fiche : le bon est relié et ses lignes approuvées du même geste.
// Une fiche archivée ne reçoit plus de paiement ni de facture (409) :
// restaurez-la d'abord. Son relevé reste lisible.
//
// `idemKey` vient du navigateur, une par geste : un double clic ou une requête
// rejouée retombe sur la même ligne (functions/api/_ledger.js).
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor, readBody, centsFrom } from './_access.js';
import { postLedgerEntry, archiveLedgerEntry, approveLedgerEntry, approvePending, partyBalance } from '../_ledger.js';
import { getSupplier, attachUnlinked } from '../_suppliers.js';

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

  if (body.action === 'approve-all') {
    if (body.supplierId && !(await getSupplier(env, merchant, body.supplierId))) return json({ error: 'supplier-not-found' }, 404);
    const res = await approvePending(env, merchant, 'supplier', body.supplierId ? String(body.supplierId) : null, { by: actor.name });
    return res.ok ? json({ ok: true, approved: res.approved }) : json({ error: res.error }, 503);
  }
  if (body.action === 'attach') {
    const res = await attachUnlinked(env, merchant, body.po, body.supplierId, actor.name);
    if (!res.ok) return json({ error: res.error }, res.error === 'unmigrated' ? 503 : res.error === 'supplier-archived' || res.error === 'po-linked' ? 409 : 404);
    return json({ ok: true, supplierId: res.supplierId, moved: res.moved, balance: await partyBalance(env, merchant, 'supplier', res.supplierId) });
  }
  if (body.action === 'archive' || body.action === 'approve') {
    /* Seule une ligne de fournisseur s'annule ici : le carnet client et le
       livre de caisse ont leurs propres portes. */
    let row = null;
    try { row = await env.DB.prepare("SELECT party_type, party_id FROM money_ledger WHERE merchant = ? AND id = ?").bind(merchant, String(body.id || '').slice(0, 64)).first(); } catch (_) { row = null; }
    if (!row || row.party_type !== 'supplier') return json({ error: 'not-found' }, 404);
    /* Une réception sans fiche ne s'approuve pas seule : elle se rattache. */
    if (body.action === 'approve' && String(row.party_id || '').startsWith('po:')) return json({ error: 'attach-required' }, 409);
    const res = body.action === 'approve'
      ? await approveLedgerEntry(env, merchant, body.id, { by: actor.name })
      : await archiveLedgerEntry(env, merchant, body.id, { by: actor.name });
    return res.ok ? json({ ok: true, entry: res.entry }) : json({ error: res.error }, res.error === 'not-found' ? 404 : 503);
  }

  const type = TYPES[String(body.type || '')];
  if (!type) return json({ error: 'bad-type' }, 400);
  if (!/^[A-Za-z0-9:._@-]{8,100}$/.test(String(body.idemKey || ''))) return json({ error: 'bad-idem' }, 400);
  const supplier = await getSupplier(env, merchant, body.supplierId);
  if (!supplier) return json({ error: 'supplier-not-found' }, 404);
  if (Number(supplier.archived) === 1) return json({ error: 'supplier-archived' }, 409);
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
    date: body.date || '', kind: type.kind, method: body.method, note: body.note, ref: poNumber, purchaseOrderId: poId, createdBy: actor.name,
  });
  if (!res.ok) {
    const status = res.error === 'idempotency-conflict' ? 409 : res.error === 'unmigrated' || res.error === 'no-db' ? 503 : 400;
    return json({ error: res.error }, status);
  }
  const balance = await partyBalance(env, merchant, 'supplier', supplier.id);
  return json({ ok: true, duplicate: res.duplicate, entry: res.entry, balance });
}
