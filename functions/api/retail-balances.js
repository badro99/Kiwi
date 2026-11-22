import { activeEmployee, entitledMerchant } from '../auth/_lib.js';
import { expireAvance, readRetailBalances } from './_retail-balances.js';
import { creditExpiry, generatedCode, view } from './store-credits.js';
import { storeSubscriptionPending, storeSuspended } from './_private.js';
import { poke } from './_live.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return Response.json({ error: 'no-db' }, { status: 503 });
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return Response.json({ error: 'forbidden-merchant' }, { status: 403 });
  const filter = String(url.searchParams.get('q') || '').trim().slice(0, 64);
  try {
    return Response.json({ balances: await readRetailBalances(env.DB, merchant, filter) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (_) { return Response.json({ error: 'retail-balance-unavailable' }, { status: 503 }); }
}

/* POST {action:'expire-avance', id, merchant, noExpiry|expiresAt, scanned}
 * L'avance expirée dont la caisse vient de scanner chaque pièce : la note se
 * ferme et l'argent versé devient un avoir (functions/api/_retail-balances.js).
 * Le scan est le contrôle demandé par les propriétaires : un employé ne
 * confirme pas « on l'a » sans avoir la pièce en main. */
export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return Response.json({ error: 'no-db' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch (_) { return Response.json({ error: 'bad-json' }, { status: 400 }); }
  const asked = String(body && body.merchant || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return Response.json({ error: 'forbidden-merchant' }, { status: 403 });
  if (await storeSuspended(env, merchant)) return Response.json({ error: 'store-suspended' }, { status: 423 });
  if (await storeSubscriptionPending(env, merchant)) return Response.json({ error: 'subscription-required' }, { status: 402 });
  if (String(body && body.action || '') !== 'expire-avance') return Response.json({ error: 'invalid-request' }, { status: 400 });
  let actor = 'Caisse';
  try {
    const member = (await activeEmployee(request, env, merchant))?.member;
    const name = String(member && (member.name || [member.firstName, member.lastName].filter(Boolean).join(' ')) || '').trim().slice(0, 100);
    if (name) actor = name;
  } catch (_) {}
  try {
    const response = await expireAvance(env, merchant, body, actor, Date.now(), { creditExpiry, generatedCode, view });
    if (response.ok) { try { await poke(env, merchant, 'store-credit-issued'); } catch (_) {} }
    return response;
  } catch (_) { return Response.json({ error: 'retail-balance-unavailable' }, { status: 503 }); }
}
