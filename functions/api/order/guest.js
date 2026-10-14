// GET /api/order/guest?merchant=<slug>&lang=fr — ce que la page d'accueil du
// client montre autour de la carte.
//
//   → { ok, guest: { wifi, review, socials, games }, pairs, waits, ramadan, zone }
//
// PUBLIC, comme /api/menu : le client a posé son téléphone sur un tag, il n'a
// ni compte ni cookie (chemin exact dans functions/_middleware.js). Rien de
// nominatif n'en sort :
//   · guest   : le document `guestpage` du propriétaire, vu par _guest.js ›
//               publicGuest (jamais les bonnes réponses des quiz) ;
//   · pairs   : « avec ça ? », les articles que les tickets des 28 derniers
//               jours associent (le calcul de la caisse, functions/api/_pairs.js),
//               réduits à leurs identifiants ;
//   · waits   : le temps réel entre l'arrivée d'une commande Order Pro et le
//               « prêt » de la cuisine (order_course), en minutes, par plat ;
//   · ramadan : l'heure du ftour du jour quand le propriétaire a allumé le mode.
// Order Pro coupé, ou commerce suspendu : 403, la page n'affiche que sa carte.
//
// Les deux calculs lourds (paires, temps) sont gardés dix minutes en mémoire
// d'isolat ; le document, lui, est relu à chaque appel au-delà d'une minute,
// pour qu'une manche lancée au comptoir apparaisse vite.

import { json } from '../../auth/_lib.js';
import { storeSuspended } from '../_private.js';
import { merchantZone } from '../_business-day.js';
import { computePairs } from '../_pairs.js';
import { recentBaskets } from '../pairs.js';
import { orderProEnabled } from './_lib.js';
import { cleanGuestDoc, publicGuest, waitStats, iftarAt, LANGS } from './_guest.js';

const HEAVY_TTL_MS = 10 * 60 * 1000;
const DOC_TTL_MS = 60 * 1000;
const WAIT_WINDOW_MS = 14 * 864e5;
const PAIRS_WINDOW_MS = 28 * 864e5;
const heavy = new Map();
const docs = new Map();

export async function readGuestDoc(env, merchant) {
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'guestpage'")
      .bind(merchant).first();
    return cleanGuestDoc(row && row.data ? JSON.parse(row.data) : {});
  } catch (_) { return cleanGuestDoc({}); }
}

async function readWaits(env, merchant, now) {
  try {
    const rs = await env.DB.prepare(
      `SELECT oc.ready_ts AS ready_ts, o.created_ts AS created_ts, o.lines AS lines
         FROM order_course oc JOIN orders o ON o.id = oc.order_id AND o.merchant = oc.merchant
        WHERE oc.merchant = ? AND oc.ready_ts IS NOT NULL AND o.created_ts >= ?
        ORDER BY o.created_ts DESC LIMIT 2000`
    ).bind(merchant, now - WAIT_WINDOW_MS).all();
    return waitStats((rs && rs.results) || []);
  } catch (_) { return { overall: null, items: {}, samples: 0 }; }
}

async function readPairs(env, merchant, now) {
  try {
    const { pairs } = computePairs(await recentBaskets(env, merchant, now - PAIRS_WINDOW_MS));
    const out = {};
    Object.keys(pairs).forEach((k) => { out[k] = pairs[k].map((p) => p.i); });
    return out;
  } catch (_) { return {}; }
}

export async function onRequestGet({ request, env }, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  if (!env || !env.DB) return json({ ok: false, error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const lang = LANGS.includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'fr';
  if (!merchant) return json({ ok: false, error: 'merchant-required' }, 400);
  if (await storeSuspended(env, merchant) || !(await orderProEnabled(env, merchant))) {
    return json({ ok: false, error: 'orderpro-off' }, 403);
  }

  let doc = docs.get(merchant);
  if (!doc || doc.until <= now || deps.noCache) {
    doc = { until: now + DOC_TTL_MS, value: await readGuestDoc(env, merchant), zone: await merchantZone(env, merchant) };
    docs.set(merchant, doc);
  }
  let calc = heavy.get(merchant);
  if (!calc || calc.until <= now || deps.noCache) {
    const [pairs, waits] = await Promise.all([readPairs(env, merchant, now), readWaits(env, merchant, now)]);
    calc = { until: now + HEAVY_TTL_MS, pairs, waits };
    heavy.set(merchant, calc);
  }
  const d = doc.value;
  const iftar = d.ramadan.on ? iftarAt(d.ramadan, now, doc.zone) : null;
  return json({
    ok: true,
    guest: publicGuest(d, lang, now),
    pairs: calc.pairs,
    waits: { overall: calc.waits.overall, items: calc.waits.items },
    ramadan: iftar ? { on: true, city: iftar.city, today: iftar.today, tomorrow: iftar.tomorrow } : null,
    zone: doc.zone,
  }, 200, { 'Cache-Control': 'no-store' });
}

export function onRequestPost() {
  return json({ error: 'method-not-allowed' }, 405);
}
