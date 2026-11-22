/* GET /api/channel/glovo/menu-feed?store=<id> — la carte que Glovo vient lire.
 * Glovo la demande après POST /webhook/stores/{id}/menu { menuUrl }, avec
 * « Authorization: Bearer <jeton partagé> » (glovoAuth accepte les deux formes).
 * Le magasin se lit dans glovo_stores ; une adresse inconnue ou en pause : 404.
 * Voir _glovo-menu.js › buildGlovoMenu. */
import { json } from '../../../auth/_lib.js';
import { glovoAuth, storeFor } from './_glovo.js';
import { buildGlovoMenu, readKiwiMenu } from './_glovo-menu.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const denied = glovoAuth(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const store = await storeFor(env, url.searchParams.get('store'));
  if (!store) return json({ error: 'unknown-store' }, 404);
  const kiwi = await readKiwiMenu(env, store.merchant);
  if (!kiwi) return json({ error: 'menu-not-published' }, 404);
  const origin = url.protocol === 'https:' ? url.origin : '';
  return new Response(JSON.stringify(buildGlovoMenu(kiwi, { origin }).menu), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
