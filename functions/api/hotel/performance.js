import { json } from '../../auth/_lib.js';
import { authorize } from './commercial.js';
import { SOLD, hotelPerformance, performanceWindow, roomInventory } from './_performance.js';

/* GET /api/hotel/performance?merchant=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Occupation, ADR, RevPAR, arrivées et départs d'un hôtel sur une plage de
 * nuits (bornes incluses), calculés sur le registre réel `hotel_reservations`
 * et l'inventaire du document `rooms`. Même garde que la production mensuelle :
 * session propriétaire ou opérateur nommé, jamais une caisse appariée. Un
 * débordement ou une ligne illisible est un ÉCHEC explicite, pas un total
 * partiel : un taux d'occupation tiré d'un registre tronqué serait faux. */
const reply = (body, status = 200) => json(body, status, { 'Cache-Control': 'no-store' });
const LIMIT = 20000;

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const merchant = await authorize(request, env, url.searchParams.get('merchant'));
    if (!merchant) return reply({ error: 'unauthorized' }, 401);
    const window = performanceWindow(url.searchParams.get('from'), url.searchParams.get('to'));
    const marks = SOLD.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT id, check_in, check_out, status, total, raw_json
      FROM hotel_reservations WHERE merchant=? AND check_in<=? AND check_out>=?
      AND status IN (${marks}) ORDER BY id LIMIT ${LIMIT + 1}`)
      .bind(merchant, window.to, window.from, ...SOLD).all();
    if (!Array.isArray(result?.results)) throw new Error('unavailable');
    if (result.results.length > LIMIT) return reply({ error: 'performance-limit' }, 503);
    const doc = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first();
    return reply({ ok: true, coverage: 'ledger', ...hotelPerformance(result.results, window, roomInventory(doc?.data)) });
  } catch (e) {
    const known = ['bad-range', 'range-too-long'].includes(e?.code);
    return reply({ error: known ? e.code : 'performance-unavailable' }, known ? 400 : 503);
  }
}
