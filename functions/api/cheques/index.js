// GET  /api/cheques?merchant=<slug>[&status=a,b&direction=received|issued&party=customer|<id>&from=&to=&q=&slip=]
//   Le portefeuille : chèques et LCN triés par échéance (sinon remise, sinon
//   réception), cartes de synthèse, ancienneté des chèques en main (en retard
//   1-30 / 31-60 / 61-90 / 90+ jours, à venir par mois sur six mois), « à
//   remettre cette semaine », pastille par client. `migrated:false` tant que
//   la base n'a pas 0029 : l'écran dit « mise à jour en cours », rien ne casse.
//   Patron, opérateur ; gérant pour les chèques reçus seulement (./_access.js).
// POST /api/cheques { merchant, idemKey, kind: cheque|lcn, direction: received|issued,
//                     amount | amountCents, number, bank, drawerName, drawerBank,
//                     receptionDate, dueDate, partyType, partyId, partyName, note,
//                     saleIds[], ledgerIds[], po (n° de bon, émis), by (caisse) }
//   Un chèque reçu peut aussi venir d'une caisse appairée (allowTill) : c'est
//   l'encaissement d'une vente par chèque, lié à ses tickets (saleIds). Un
//   chèque émis (patron seulement) exige une fiche fournisseur active et écrit
//   le paiement du fournisseur au grand livre (functions/api/_cheques.js).
//   `idemKey` vient de l'appareil, une par chèque : un rejeu rend le même.
import { json } from '../../auth/_lib.js';
import { chequeActor, readBody } from './_access.js';
import { chequesReady, createCheque, listCheques, openCheques, chequeSummary, chequeAgeing, merchantDays } from '../_cheques.js';
import { getSupplier, listSuppliers } from '../_suppliers.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const actor = await chequeActor(request, env, merchant);
  if (!actor || actor.kind === 'till') return json({ error: 'manager-required' }, 403);
  const today = await merchantDays(env, merchant);
  if (!(await chequesReady(env))) return json({ ok: true, migrated: false, merchant, role: actor.kind, today: today.civil, cheques: [], summary: null, ageing: null });
  const p = (k) => url.searchParams.get(k) || '';
  const [list, open] = await Promise.all([
    listCheques(env, merchant, { status: p('status'), direction: p('direction'), party: p('party'), from: p('from'), to: p('to'), q: p('q'), slip: p('slip'), limit: p('limit'), only: actor.only }),
    openCheques(env, merchant, actor.only),
  ]);
  if (!list.ok || !open) return json({ ok: true, migrated: false, merchant, role: actor.kind, today: today.civil, cheques: [], summary: null, ageing: null });
  /* Les fiches fournisseurs (pour émettre un chèque) : au patron seulement. */
  const suppliers = actor.only ? [] : (await listSuppliers(env, merchant)).map((s) => ({ id: String(s.id), name: String(s.name) }));
  return json({
    ok: true, migrated: true, merchant, role: actor.kind, today: today.civil,
    cheques: list.cheques, truncated: list.truncated,
    summary: chequeSummary(open, today.civil), ageing: chequeAgeing(open, today.civil), suppliers,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await chequeActor(request, env, merchant, { write: true, allowTill: true });
  if (!actor) return json({ error: 'manager-required' }, 403);
  const direction = body.direction === 'issued' ? 'issued' : 'received';
  if (actor.only && direction !== actor.only) return json({ error: 'owner-required' }, 403);
  if (!(await chequesReady(env))) return json({ error: 'unmigrated' }, 503);
  const input = { ...body, direction };
  let poId = null;
  /* Un tiers fournisseur écrit au grand livre fournisseurs : patron et opérateur
     seulement, même sur un chèque reçu (gérant et caisse : 403). */
  if (actor.only && input.partyType === 'supplier') return json({ error: 'supplier-owner-only' }, 403);
  if (direction === 'issued' || input.partyType === 'supplier') {
    const sup = await getSupplier(env, merchant, input.partyId);
    if (!sup) return json({ error: 'supplier-not-found' }, 404);
    if (Number(sup.archived) === 1) return json({ error: 'supplier-archived' }, 409);
    input.partyType = 'supplier';
    input.partyName = String(sup.name || '');
    const number = String(body.po || '').slice(0, 40);
    if (direction === 'issued' && number) {
      let po = null;
      try { po = await env.DB.prepare('SELECT id, supplier_id FROM purchase_orders WHERE merchant = ? AND number = ?').bind(merchant, number).first(); } catch (_) { po = null; }
      if (!po || (po.supplier_id && po.supplier_id !== sup.id)) return json({ error: 'po-not-found' }, 404);
      poId = po.id;
    }
  }
  const today = await merchantDays(env, merchant);
  /* La caisse signe « Caisse », plus le prénom affiché de la caissière (non prouvé : marqué comme tel). */
  const who = actor.kind === 'till' ? 'Caisse' + (body.by ? ' · ' + String(body.by).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40) : '') : actor.name;
  const res = await createCheque(env, merchant, input, { actor: who, source: actor.kind === 'till' ? 'till' : 'dashboard', today, poId });
  if (!res.ok) return json({ error: res.error, cheque: res.cheque }, res.status || 400);
  return json({ ok: true, duplicate: res.duplicate, cheque: res.cheque });
}
