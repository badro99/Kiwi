// GET /api/price-lists/snapshot?merchant=… — ce que la caisse garde en cache.
//
// La caisse vend hors ligne : elle ne peut pas demander un prix au serveur à
// chaque article. Elle lit ici, comme le catalogue, une copie complète des
// tarifs qui la concernent (canal `till`, plus le principal), de leurs prix et
// des tarifs par défaut des fiches clients, et la garde en local.
//
//   → { ok, at, lists: [{ id, name, isMain, channels }],
//       prices: { <listId>: { <itemKey>: cents, '<itemKey>|<variant>': cents } },
//       clients: { <clientId>: <listId> } }
//
// Lecture : caisse appairée, patron, opérateur (tenantFor). Aucun code, aucun
// montant de vente : des prix publics du magasin.
import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { visibleLists, listPrices } from '../_price-lists.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const channel = url.searchParams.get('channel') || 'till';
  let lists;
  try { lists = await visibleLists(env, merchant); } catch (_) { return json({ ok: true, at: Date.now(), lists: [], prices: {}, clients: {}, degraded: true }); }
  const usable = lists.filter((l) => l.isMain || l.channels.includes(channel));
  const prices = {};
  for (const l of usable) {
    if (l.isMain) continue;
    const map = {};
    for (const [k, cents] of await listPrices(env, l)) map[k.endsWith('|') ? k.slice(0, -1) : k] = cents;
    prices[l.id] = map;
  }
  const clients = {};
  try {
    const ids = new Set(usable.map((l) => l.id));
    const rs = ((await env.DB.prepare('SELECT client_id, list_id FROM price_list_clients WHERE merchant = ? LIMIT 20000').bind(merchant).all()).results) || [];
    for (const r of rs) if (ids.has(r.list_id)) clients[r.client_id] = r.list_id;
  } catch (_) { /* pas de défauts clients */ }
  return json({ ok: true, at: Date.now(), merchant,
    lists: usable.map((l) => ({ id: l.id, name: l.name, isMain: l.isMain, channels: l.channels })), prices, clients });
}
