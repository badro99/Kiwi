// POST /api/suppliers/expense
//   { merchant, expenseId, supplier?: <nom>, supplierId?, amountCents, date,
//     method, version, deleted? }
//
// Une dépense du registre du patron (document `expenses`, assets/expenses/)
// qui nomme un fournisseur connu s'inscrit à son relevé : la facture (in) et
// son règlement (out), du même montant puisque le registre ne note que des
// dépenses payées. Le solde ne bouge pas ; le relevé et le tableau du
// fournisseur, si (ce qu'on lui a acheté, ce qu'on lui a payé).
//
// Rejouable : `version` (le updatedAt de la ligne) entre dans la clé. Une
// version plus récente archive les lignes de la précédente ; une version plus
// ANCIENNE qui arrive en retard ne touche à rien. Une dépense supprimée, ou
// dont le fournisseur n'est plus connu, retire ses lignes. Un nom qu'aucune
// fiche ne porte ne crée pas de fournisseur : « Marjane » sur un ticket de
// courses n'en est pas un tant que le patron ne l'a pas décidé.
// Une dépense supprimée puis réenregistrée à la MÊME version (annuler une
// suppression) retrouve ses lignes : elles sont désarchivées, pas comptées
// comme un rejeu déjà vivant.
//
// Patron et opérateur Kiwi seulement (./_access.js).
import { json } from '../../auth/_lib.js';
import { ledgerActor, readBody } from './_access.js';
import { postLedgerEntry, validYmd } from '../_ledger.js';
import { getSupplier, findSupplierByName } from '../_suppliers.js';

const EXPENSE_ID = /^[A-Za-z0-9_-]{3,64}$/;

function versionOf(idem) {
  const m = /^expense:[^:]+:(\d+):/.exec(String(idem || ''));
  return m ? Number(m[1]) : 0;
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await ledgerActor(request, env, merchant, { write: true });
  if (!actor) return json({ error: 'owner-required' }, 403);
  const expenseId = String(body.expenseId || '');
  if (!EXPENSE_ID.test(expenseId)) return json({ error: 'bad-expense' }, 400);
  const version = Math.max(0, Math.floor(Number(body.version) || 0));

  let live = [];
  try {
    const got = await env.DB.prepare('SELECT id, idem_key FROM money_ledger WHERE merchant = ? AND expense_id = ? AND archived = 0')
      .bind(merchant, expenseId).all();
    live = (got && got.results) || [];
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const newest = live.reduce((m, r) => Math.max(m, versionOf(r.idem_key)), 0);
  if (version < newest) return json({ ok: true, stale: true });

  let supplier = null;
  if (!body.deleted) {
    supplier = body.supplierId ? await getSupplier(env, merchant, body.supplierId) : null;
    if (!supplier && body.supplier) supplier = await findSupplierByName(env, merchant, body.supplier);
    if (supplier && Number(supplier.archived) === 1) supplier = null;
  }
  const cents = Number(body.amountCents);
  const keep = [];
  if (supplier && Number.isSafeInteger(cents) && cents > 0) {
    const base = { amountCents: cents, partyType: 'supplier', partyId: supplier.id, expenseId,
      date: validYmd(body.date) ? body.date : '', method: body.method, createdBy: actor.name };
    const note = String(body.note || '').slice(0, 200);
    const bill = await postLedgerEntry(env, merchant, { ...base, idemKey: `expense:${expenseId}:${version}:bill`, direction: 'in', kind: 'expense', note });
    const paid = await postLedgerEntry(env, merchant, { ...base, idemKey: `expense:${expenseId}:${version}:paid`, direction: 'out', kind: 'expense-payment' });
    if (!bill.ok || !paid.ok) return json({ error: bill.error || paid.error }, bill.error === 'idempotency-conflict' || paid.error === 'idempotency-conflict' ? 409 : 400);
    keep.push(`expense:${expenseId}:${version}:bill`, `expense:${expenseId}:${version}:paid`);
    /* Un rejeu sur une clé archivée (suppression annulée) la remet en vie. */
    const revive = [bill, paid].filter((r) => r.duplicate && r.entry && r.entry.archived).map((r) => r.entry.id);
    if (revive.length) {
      await env.DB.batch(revive.map((id) => env.DB.prepare("UPDATE money_ledger SET archived = 0, voided_by = '' WHERE merchant = ? AND id = ? AND deleted_ts IS NULL").bind(merchant, id)));
    }
  }
  const stale = live.filter((r) => !keep.includes(String(r.idem_key))).map((r) => String(r.id));
  if (stale.length) {
    await env.DB.batch(stale.map((id) => env.DB.prepare('UPDATE money_ledger SET archived = 1 WHERE merchant = ? AND id = ?').bind(merchant, id)));
  }
  return json({ ok: true, linked: !!supplier, supplierId: supplier ? supplier.id : '', supplierName: supplier ? supplier.name : '', archived: stale.length });
}
