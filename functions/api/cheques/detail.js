// GET /api/cheques/detail?merchant=<slug>&id=<chq_…>
//   Un chèque, son historique complet (qui, de quoi à quoi, quand, pourquoi),
//   ce qu'il règle (tickets, lignes du grand livre, bon), les lignes d'argent
//   qu'il a écrites, et les seuls passages permis depuis son statut.
// Patron et opérateur ; gérant pour les chèques reçus (./_access.js).
import { json } from '../../auth/_lib.js';
import { chequeActor } from './_access.js';
import { chequesReady, chequeDetail } from '../_cheques.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const actor = await chequeActor(request, env, merchant);
  if (!actor || actor.kind === 'till') return json({ error: 'manager-required' }, 403);
  if (!(await chequesReady(env))) return json({ error: 'unmigrated' }, 503);
  const d = await chequeDetail(env, merchant, String(url.searchParams.get('id') || ''), actor.only);
  if (!d) return json({ error: 'not-found' }, 404);
  return json({ ok: true, ...d });
}
