// /api/live/socket — la porte du concentrateur temps réel.
//
// Pourquoi passer par ici plutôt que d'ouvrir la socket directement sur l'URL
// workers.dev du Worker : le cookie de session est posé sur kiwi-os.com. Une
// socket ouverte vers un autre domaine ne l'emporterait pas, et on se
// retrouverait à réinventer un jeton d'accès rien que pour ça. En passant par
// une Pages Function du même domaine, on réutilise TELLE QUELLE l'autorisation
// déjà écrite pour /api/service/events — même fonction, mêmes règles, même
// comportement en cas de refus.
//
// Et c'est important que ce soit exactement les mêmes : ce sont elles qui
// décident dans QUELLE salle on entre. La salle porte le slug du commerçant tel
// que le serveur l'a résolu, jamais celui que le client a demandé.
//
// Ce que la socket donne une fois ouverte : un signal creux, « ça a bougé ».
// Aucune donnée. Le client relit ensuite par sa route habituelle, qui refait
// tous ses contrôles — y compris le filtrage par employé de /api/service/events,
// qui ne montre à un serveur que ses tables et celles qu'il couvre.

import { json, entitledMerchant, activeServiceEmployee } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

export async function onRequestGet({ request, env }) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'expected-websocket' }, 426);
  }

  /* Pas de binding = fonctionnalité pas encore déployée. On le DIT, et le
   * navigateur reste sur ses sondages sans réessayer en boucle. */
  if (!env.LIVE) return json({ error: 'unbound' }, 503);
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const role = String(url.searchParams.get('role') || '').toLowerCase();

  let merchant = '';
  if (role === 'caisse') {
    /* allowTill : une caisse appairée n'a pas de session de compte, elle a un
     * jeton de terminal. C'est la même porte que celle par laquelle elle lit
     * déjà /api/service/events. */
    merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  } else if (role === 'service') {
    const employee = await activeServiceEmployee(request, env, asked);
    merchant = employee ? employee.merchant : '';
  } else {
    merchant = await tenantFor(request, env, asked);
  }
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  return env.LIVE.get(env.LIVE.idFromName(merchant)).fetch(request);
}
