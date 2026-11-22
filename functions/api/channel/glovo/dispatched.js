/* POST /api/channel/glovo/dispatched — Glovo dépose une commande.
 * Authorization: <jeton partagé Glovo>. Le magasin vient du store_id du corps,
 * via glovo_stores. Réponse en moins de 10 s (délai de Glovo) ; toute réponse
 * non-2xx est relancée par Glovo, d'où l'idempotence sur order_id.
 * Voir functions/api/channel/glovo/_glovo.js. */
import { json } from '../../../auth/_lib.js';
import { glovoAuth, readBody, storeFor, depositGlovoOrder } from './_glovo.js';
import { syncGlovoItems } from './_glovo-menu.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const denied = glovoAuth(request, env);
  if (denied) return denied;
  const { body, error } = await readBody(request);
  if (error) return error;
  const store = await storeFor(env, body.store_id);
  if (!store) return json({ error: 'unknown-store' }, 404);
  const res = await depositGlovoOrder(env, store, body);
  /* Un « 86 » à durée (épuisé jusqu'à 18 h) se termine sans geste : chaque
   * commande reçue relit la carte et rend à Glovo ce qui est revenu. */
  if (res.status === 200 && env.GLOVO_TOKEN && context.waitUntil) {
    context.waitUntil(syncGlovoItems(env, store.merchant).catch(() => {}));
  }
  return res;
}
