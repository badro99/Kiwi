// GET /api/pairs?merchant=<slug> — « souvent pris ensemble », pour la caisse.
//
// La caisse ne garde pas l'historique des ventes ; le serveur, si. Cette route
// lit les tickets des 28 derniers jours (non annulés, avec leurs lignes) et
// rend, pour chaque article, les articles que ses tickets contiennent aussi
// souvent (functions/api/_pairs.js). La caisse en tire une suggestion au
// moment où un plat entre dans la commande (assets/caisse-pairs.js).
//
// Lecture seule. Ouverte à la caisse appairée et au propriétaire, comme le
// reste des lectures (tenantFor non strict), mais pour le seul commerce
// demandé : un repli sur un autre magasin n'est jamais une réponse.
// Le calcul est gardé trente minutes en mémoire d'isolat : une suggestion
// n'a pas besoin de la vente de la minute, et la base n'a pas à relire quatre
// semaines de tickets à chaque caisse qui démarre.

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';
import { computePairs } from './_pairs.js';

const WINDOW_MS = 28 * 864e5;
const MAX_ROWS = 4000;
const TTL_MS = 30 * 60 * 1000;
const cache = new Map();

async function recentBaskets(env, merchant, since) {
  const run = (sql) => env.DB.prepare(sql).bind(merchant, since).all();
  let rs;
  try {
    rs = await run(`SELECT lines FROM sales
                     WHERE merchant = ? AND ts >= ? AND lines IS NOT NULL AND void_ts IS NULL
                     ORDER BY ts DESC LIMIT ${MAX_ROWS}`);
  } catch (_) {
    /* La base de production peut ne pas avoir la colonne void_ts. */
    rs = await run(`SELECT lines FROM sales
                     WHERE merchant = ? AND ts >= ? AND lines IS NOT NULL
                     ORDER BY ts DESC LIMIT ${MAX_ROWS}`);
  }
  return ((rs && rs.results) || []).map((r) => {
    try { const v = JSON.parse(r.lines || 'null'); return Array.isArray(v) ? v : null; } catch (_) { return null; }
  }).filter(Boolean);
}

export async function onRequestGet({ request, env }, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64).trim();
  if (!asked) return json({ error: 'merchant-required' }, 400);
  const who = await tenantFor(request, env, asked);
  if (!who || who !== asked) return json({ error: 'forbidden-merchant' }, 403);

  const hit = cache.get(who);
  if (hit && hit.until > now && !deps.noCache) {
    return json(hit.body, 200, { 'Cache-Control': 'private, max-age=900' });
  }
  let baskets;
  try { baskets = await recentBaskets(env, who, now - WINDOW_MS); }
  catch (_) { return json({ error: 'unavailable' }, 503); }
  const { baskets: multi, pairs } = computePairs(baskets);
  const body = { merchant: who, since: now - WINDOW_MS, at: now, baskets: multi, pairs };
  cache.set(who, { until: now + TTL_MS, body });
  return json(body, 200, { 'Cache-Control': 'private, max-age=900' });
}

export function onRequestPost() {
  return json({ error: 'method-not-allowed' }, 405);
}
