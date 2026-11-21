// /api/bestsellers — les articles les plus vendus d'un magasin, pour la caisse.
//
//   GET ?merchant=<slug>  → { ok, ready, first_ts, since, items: [{ i, q }] }
//
// Décision propriétaire (2026-11-21) : à l'ouverture des caisses boutique et
// maison, la grille ne montre plus « Tous » mais les meilleures ventes du
// magasin. Un magasin neuf n'a rien à classer : « Tous » reste le défaut
// jusqu'à sa première semaine pleine de ventes. `ready` le dit : la toute
// première vente du magasin date d'au moins 7 jours.
//
// Le classement : quantités vendues sur les 30 derniers jours, par identifiant
// d'article (la ligne de vente v2 porte `i`, l'id produit du catalogue ; une
// ligne sans `i` ne se classe pas, on ne devine pas un article par son nom).
// Les ventes annulées (void_ts) et les remboursements n'y entrent pas. Une
// vente à crédit, enregistrée à 0, reste une pièce partie du rayon : elle compte.
//
// Lecture seule, réduite à des identifiants et des quantités : ni montants,
// ni clientes, ni tickets. La caisse appairée la lit (TILL_PATHS), comme le
// propriétaire et l'opérateur, pour CE magasin seulement (tenantFor).

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY = 86400000;
export const WINDOW_DAYS = 30;
export const WARMUP_DAYS = 7;
export const MAX_ITEMS = 60;

const LINES = "json_each(CASE WHEN json_valid(s.lines) THEN s.lines ELSE '[]' END)";
const KEPT = "s.merchant = ? AND s.void_ts IS NULL AND COALESCE(s.channel, '') <> 'refund'"
  + ' AND COALESCE(s.amount_cents, s.amount * 100) >= 0';

/* Pure : la réponse, à partir de la première vente et des lignes groupées. */
export function shape(firstTs, rows, now) {
  const first = Number(firstTs) || 0;
  const ready = first > 0 && now - first >= WARMUP_DAYS * DAY;
  const items = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ i: String((r && r.i) || '').slice(0, 80), q: Math.round((Number(r && r.q) || 0) * 1000) / 1000 }))
    .filter((r) => r.i && r.q > 0)
    .slice(0, MAX_ITEMS);
  return { ok: true, ready, first_ts: first || null, since: now - WINDOW_DAYS * DAY, items: ready ? items : [] };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64).trim().toLowerCase();
  const headers = { 'Cache-Control': 'no-store' };
  if (!SLUG.test(merchant)) return json({ error: 'bad-request' }, 400, headers);
  if (!env.DB) return json({ ok: true, ready: false, items: [], unconfigured: true }, 200, headers);

  const who = await tenantFor(request, env, merchant);
  if (!who || who !== merchant) return json({ error: 'unauthorized' }, 401, headers);

  const now = Date.now();
  try {
    const first = await env.DB.prepare(`SELECT MIN(s.ts) AS first FROM sales s WHERE ${KEPT}`).bind(merchant).first();
    const firstTs = Number(first && first.first) || 0;
    if (!firstTs || now - firstTs < WARMUP_DAYS * DAY) return json(shape(firstTs, [], now), 200, headers);
    const { results } = await env.DB.prepare(
      `SELECT json_extract(j.value, '$.i') AS i, SUM(json_extract(j.value, '$.q')) AS q, SUM(json_extract(j.value, '$.t')) AS t
         FROM sales s, ${LINES} j
        WHERE ${KEPT} AND s.ts >= ? AND s.lines IS NOT NULL AND json_extract(j.value, '$.i') IS NOT NULL
        GROUP BY i ORDER BY q DESC, t DESC LIMIT ${MAX_ITEMS}`
    ).bind(merchant, now - WINDOW_DAYS * DAY).all();
    return json(shape(firstTs, results, now), 200, headers);
  } catch (_) {
    /* Une base sans la colonne attendue ne casse pas la caisse : « Tous » reste. */
    return json({ ok: true, ready: false, items: [] }, 200, headers);
  }
}
