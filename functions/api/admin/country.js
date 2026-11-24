/* GET/POST /api/admin/country · le pays d'exploitation d'un commerce, réglé dans
 * la console God Mode (owner, 24 nov. 2026 : « add a toggle in godmode so that we
 * can choose the country of operations »).
 *
 * Lire : tout opérateur. Changer : un opérateur NOMMÉ (le pays décide de la devise
 * des tickets et du webhook Shopify), avec la trace prev → next dans le même lot.
 * La journée commerciale suit le pays (Europe/Madrid pour l'Espagne) tant que la
 * caisse n'a pas déclaré un fuseau à elle : un fuseau vide ou celui par défaut de
 * l'ancien pays change, un autre (les Canaries) reste. */
import { isOperator, isSeniorOperator, json, operatorActor } from '../../auth/_lib.js';
import { Countries } from '../_country.js';

async function guard(context, senior) {
  if (!(await isOperator(context.request, context.env))) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  if (senior && !(await isSeniorOperator(context.request, context.env))) return json({ error: 'operator-code-required' }, 403);
  return null;
}

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const merchant = String(new URL(context.request.url).searchParams.get('merchant') || '').trim().slice(0, 80);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  let row;
  try { row = await context.env.DB.prepare('SELECT country FROM merchant_config WHERE merchant = ?').bind(merchant).first(); }
  catch (_) { return json({ error: 'country-unavailable' }, 503); }
  if (!row) return json({ error: 'not-found' }, 404);
  const country = Countries.normalize(row.country);
  return json({ merchant, country, set: !!row.country, profile: Countries.profile(country), choices: Countries.CODES.map((code) => ({ code, label: Countries.label(code, 'fr') })) });
}

export async function onRequestPost(context) {
  const bad = await guard(context, true); if (bad) return bad;
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 80);
  const wanted = String((body && body.country) || '').trim().toUpperCase();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!Countries.CODES.includes(wanted)) return json({ error: 'country-unsupported', choices: Countries.CODES }, 400);
  let row;
  try { row = await env.DB.prepare('SELECT country, timezone FROM merchant_config WHERE merchant = ?').bind(merchant).first(); }
  catch (_) { return json({ error: 'country-unavailable' }, 503); }
  if (!row) return json({ error: 'not-found' }, 404);
  const prev = Countries.normalize(row.country);
  const oldZone = String(row.timezone || '');
  const zone = !oldZone || oldZone === Countries.profile(prev).zone ? Countries.profile(wanted).zone : oldZone;
  const actor = await operatorActor(request, env), ts = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
        VALUES ('', ?, 'store-country', ?, ?, '', ?, ?, ?, ?)`).bind(merchant, prev, wanted, actor.label, actor.id, JSON.stringify({ zone }), ts),
      env.DB.prepare('UPDATE merchant_config SET country = ?, timezone = ?, updated_ts = ? WHERE merchant = ?').bind(wanted, zone, ts, merchant),
    ]);
  } catch (_) { return json({ error: 'country-unavailable' }, 503); }
  return json({ ok: true, merchant, country: wanted, prev, zone, profile: Countries.profile(wanted) });
}
