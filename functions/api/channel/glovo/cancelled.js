/* POST /api/channel/glovo/cancelled — Glovo annule une commande déjà déposée.
 * Le ticket passe « rejeté », signé Glovo, sauf s'il a déjà été encaissé. Une
 * commande inconnue est acquittée (200) pour que Glovo cesse de relancer.
 * Voir functions/api/channel/glovo/_glovo.js. */
import { json } from '../../../auth/_lib.js';
import { glovoAuth, readBody, cancelGlovoOrder } from './_glovo.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const denied = glovoAuth(request, env);
  if (denied) return denied;
  const { body, error } = await readBody(request);
  if (error) return error;
  return cancelGlovoOrder(env, body);
}
