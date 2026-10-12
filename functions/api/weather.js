// GET /api/weather?merchant=<slug> · la météo du commerce et son carnet.
//
//   { ok: true, city, days: [{ day, tmin, tmax, precip, kind }], log: { day: … },
//     source: 'MET Norway' }
//   { ok: false, reason: 'no-city' | 'unknown-city' | 'unavailable' }
//
// La ville vient de la fiche du commerce, jamais de la requête : ce n'est pas
// un relais météo ouvert à qui veut. Une seule lecture MET par ville et par
// période de validité (en-tête Expires, entre 10 et 60 minutes), partagée par
// tous les commerces de la ville. Voir _weather.js pour la source et ses
// conditions.

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';
import { MET_URL, USER_AGENT, cityCoords, summarize, mergeLog, localParts } from './_weather.js';

const LOG_FEATURE = 'weather-log';
const LOG_EVERY_MS = 3 * 3600e3;
const CACHE_MIN_S = 600, CACHE_MAX_S = 3600;

async function shopCity(env, merchant) {
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'business'").bind(merchant).first();
    const legal = (row && JSON.parse(row.data || '{}').legal) || {};
    for (const v of [legal.city, legal.address]) if (v && cityCoords(v)) return String(v).trim();
    if (legal.city && String(legal.city).trim()) return String(legal.city).trim();
  } catch (_) {}
  /* La colonne peut manquer sur une base déployée avant elle : on se tait. */
  try {
    const row = await env.DB.prepare('SELECT city FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (row && row.city && String(row.city).trim()) return String(row.city).trim();
  } catch (_) {}
  return '';
}

async function forecast(place, deps) {
  const url = `${MET_URL}?lat=${place.lat.toFixed(2)}&lon=${place.lon.toFixed(2)}`;
  const cache = deps.cache;
  const key = new Request(url);
  if (cache) {
    try { const hit = await cache.match(key); if (hit) return await hit.json(); } catch (_) {}
  }
  const res = await deps.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res || !res.ok) throw new Error('met-' + (res ? res.status : 'down'));
  const body = await res.json();
  if (cache) {
    let ttl = CACHE_MAX_S;
    const expires = Date.parse(res.headers && res.headers.get ? res.headers.get('Expires') || '' : '');
    if (Number.isFinite(expires)) ttl = Math.round((expires - deps.now()) / 1000);
    ttl = Math.max(CACHE_MIN_S, Math.min(CACHE_MAX_S, ttl));
    try {
      await cache.put(key, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }));
    } catch (_) {}
  }
  return body;
}

async function readLog(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, LOG_FEATURE).first();
    if (!row) return { log: {}, at: 0 };
    const doc = JSON.parse(row.data || '{}');
    return { log: doc && doc.days && typeof doc.days === 'object' ? doc.days : {}, at: Number(row.updated_ts) || 0, city: doc && doc.city };
  } catch (_) { return { log: {}, at: 0 }; }
}

async function writeLog(env, merchant, city, log, now) {
  try {
    await env.DB.prepare(`INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (merchant, feature) DO UPDATE SET data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`)
      .bind(merchant, LOG_FEATURE, JSON.stringify({ city, days: log }), now).run();
    return true;
  } catch (_) { return false; }
}

export function makeWeatherHandler(deps) {
  return async function onRequestGet(context) {
    const { request, env } = context;
    const now = deps.now();
    const url = new URL(request.url);
    const merchant = await deps.tenant(request, env, url.searchParams.get('merchant') || '');
    if (!merchant) return json({ error: 'unauthorized' }, 401);
    if (!env || !env.DB) return json({ ok: false, reason: 'unavailable' });

    const city = await shopCity(env, merchant);
    if (!city) return json({ ok: false, reason: 'no-city' });
    const place = cityCoords(city);
    if (!place) return json({ ok: false, reason: 'unknown-city', city });

    let days;
    try { days = summarize(await forecast(place, deps), now); }
    catch (_) { return json({ ok: false, reason: 'unavailable', city: place.name }); }
    if (!days.length) return json({ ok: false, reason: 'unavailable', city: place.name });

    /* Le carnet : la prévision du jour même, au plus une écriture toutes les
       trois heures. Une ville changée repart d'un carnet vide : les jours de
       pluie de Tanger ne disent rien des ventes de Marrakech. */
    const saved = await readLog(env, merchant);
    let log = saved.city && saved.city !== place.name ? {} : saved.log;
    const today = days.find((d) => d.day === localParts(now).day);
    if (today && (now - saved.at >= LOG_EVERY_MS || !log[today.day] || saved.city !== place.name)) {
      log = mergeLog(log, today);
      /* Lire la météo reste ouvert à un magasin suspendu ou en attente, comme
         toute lecture ; ÉCRIRE son carnet passe par la porte des écritures
         (tenantFor strict), et seulement si elle désigne le MÊME magasin : un
         slug inconnu ne doit pas ranger ce carnet chez le magasin du compte. */
      const writer = deps.writer ? await deps.writer(request, env, url.searchParams.get('merchant') || '') : merchant;
      if (writer && writer === merchant) await writeLog(env, merchant, place.name, log, now);
    }
    return json({
      ok: true, city: place.name,
      days: days.map(({ day, tmin, tmax, precip, kind }) => ({ day, tmin, tmax, precip, kind })),
      log, source: 'MET Norway',
    });
  };
}

export const onRequestGet = makeWeatherHandler({
  tenant: (request, env, asked) => tenantFor(request, env, asked),
  writer: (request, env, asked) => tenantFor(request, env, asked, { strict: true }),
  fetch: (url, init) => fetch(url, init),
  cache: typeof caches !== 'undefined' && caches.default ? caches.default : null,
  now: () => Date.now(),
});
