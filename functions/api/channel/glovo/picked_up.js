/* POST /api/channel/glovo/picked_up — Glovo : le coursier a pris la commande.
 * Corps identique à dispatched (le modèle Order). Authorization : le jeton
 * partagé Glovo. Idempotent ; toujours 2xx pour une commande inconnue (Glovo
 * relance tout le reste). Voir _glovo-ops.js › pickedUpGlovoOrder. */
import { json } from '../../../auth/_lib.js';
import { glovoAuth, readBody } from './_glovo.js';
import { pickedUpGlovoOrder } from './_glovo-ops.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const denied = glovoAuth(request, env);
  if (denied) return denied;
  const { body, error } = await readBody(request);
  if (error) return error;
  const r = await pickedUpGlovoOrder(env, body);
  return json(r.body, r.status);
}
