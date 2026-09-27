import { entitledMerchant } from '../auth/_lib.js';
import { readRetailBalances } from './_retail-balances.js';

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
