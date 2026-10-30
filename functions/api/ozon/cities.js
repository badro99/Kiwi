// /api/ozon/cities — Ozon Express's city list with its prices (public at
// api.ozonexpress.ma/cities, ~800 entries), for the parcel form.
//   GET → { cities: [{ id, name, deliveredCents, returnedCents, refusedCents }] }
// Any signed-in session or paired till may read it; the list is cached an hour.
import { exactMerchant, json, cities } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const merchant = await exactMerchant(request, env, new URL(request.url).searchParams.get('merchant'), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  try {
    const list = await cities(env);
    if (!list.length) return json({ error: 'ozon-unreachable' }, 502);
    return new Response(JSON.stringify({ cities: list }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (_) { return json({ error: 'ozon-unreachable' }, 502); }
}
