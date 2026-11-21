// POST /api/cheques/move { merchant, id, to, requestId, date?, reason?, method? }
//   Fait avancer un chèque d'un statut à un autre selon TRANSITIONS
//   (functions/api/_cheques.js). Un passage interdit : 409 { error:
//   'illegal-transition', allowed: [...] }. Le même requestId rejoué : la même
//   réponse, duplicate: true, rien d'écrit deux fois. Un autre appareil a bougé
//   le chèque entre-temps : 409 'stale' avec le statut réel. `method` (réglé
//   autrement) : cash | transfer | card | other.
// POST /api/cheques/move { merchant, action: 'deposit', ids: [...], bank?, date?, requestId }
//   Bordereau de remise : les chèques en portefeuille choisis passent « remis
//   à la banque » d'un seul lot, sous un numéro de bordereau (BR-AAAAMMJJ-XXXXXX).
// Patron et opérateur ; gérant pour les chèques reçus (./_access.js). Jamais
// une caisse : elle enregistre un chèque, elle ne le fait pas avancer.
import { json } from '../../auth/_lib.js';
import { chequeActor, readBody } from './_access.js';
import { chequesReady, moveCheque, depositSlip, merchantDays } from '../_cheques.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const read = await readBody(request);
  if (read.error) return json({ error: read.error }, read.error === 'payload-too-large' ? 413 : 400);
  const body = read.body;
  const merchant = String(body.merchant || '').slice(0, 64);
  const actor = await chequeActor(request, env, merchant, { write: true });
  if (!actor) return json({ error: 'manager-required' }, 403);
  if (!(await chequesReady(env))) return json({ error: 'unmigrated' }, 503);
  const today = await merchantDays(env, merchant);
  const ctx = { actor: actor.name, only: actor.only, today };
  const res = body.action === 'deposit'
    ? await depositSlip(env, merchant, body, ctx)
    : await moveCheque(env, merchant, String(body.id || ''), body, ctx);
  if (!res.ok) return json({ error: res.error, allowed: res.allowed, cheque: res.cheque }, res.status || 400);
  return json(res);
}
