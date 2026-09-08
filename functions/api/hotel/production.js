import { json } from '../../auth/_lib.js';
import { authorize } from './commercial.js';
import { readCommercial } from './_commercial.js';
import { monthWindow, monthlyProduction } from './_production.js';

const reply = (body, status = 200) => json(body, status, { 'Cache-Control': 'no-store' });
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const merchant = await authorize(request, env, url.searchParams.get('merchant'));
    if (!merchant) return reply({ error: 'unauthorized' }, 401);
    const period = monthWindow(url.searchParams.get('month'));
    // No compact-document fallback: its retention window cannot prove a
    // historical month complete. Overflow is an explicit failure, not a total.
    const result = await env.DB.prepare(`SELECT id, check_in, check_out, status, channel, room_id, raw_json
      FROM hotel_reservations WHERE merchant=? AND check_in<? AND check_out>?
      AND status IN ('confirmed','checked_in','completed') ORDER BY id LIMIT 20001`)
      .bind(merchant, period.end, period.start).all();
    if (!Array.isArray(result?.results)) throw new Error('unavailable');
    if (result.results.length > 20000) return reply({ error: 'production-limit' }, 503);
    const directory = await readCommercial(env, merchant);
    return reply({ ok: true, coverage: 'ledger', ...monthlyProduction(result.results, period, directory.accounts) });
  } catch (e) {
    return reply({ error: e?.code === 'bad-month' ? 'bad-month' : 'production-unavailable' }, e?.code === 'bad-month' ? 400 : 503);
  }
}
