// POST /api/cheques/edit { merchant, id, requestId, number?, bank?, drawerName?,
//                          drawerBank?, dueDate?, note?, amount?, partyName?, partyId?, reason? }
//   Corrige le papier d'un chèque encore en cours (un chèque encaissé, débité,
//   réglé autrement ou annulé est en lecture seule : 409 'read-only'). Le
//   montant ne change que sur un chèque reçu encore en portefeuille et jamais
//   rejeté ; donner un client à un chèque rejeté sans tiers rattache sa dette
//   à ce client. Chaque modification écrit une ligne d'historique.
// Patron et opérateur ; gérant pour les chèques reçus (./_access.js).
import { json } from '../../auth/_lib.js';
import { chequeActor, readBody } from './_access.js';
import { chequesReady, editCheque, merchantDays } from '../_cheques.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await chequeActor(request, env, merchant, { write: true });
  if (!actor) return json({ error: 'manager-required' }, 403);
  if (!(await chequesReady(env))) return json({ error: 'unmigrated' }, 503);
  const res = await editCheque(env, merchant, String(body.id || ''), body, { actor: actor.name, only: actor.only, today: await merchantDays(env, merchant) });
  if (!res.ok) return json({ error: res.error, allowed: res.allowed, cheque: res.cheque }, res.status || 400);
  return json(res);
}
