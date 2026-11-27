// Apple's pass web service (webServiceURL = <origin>/api/wallet), plus the
// first download of a pass from the /carte page:
//   POST   devices/{device}/registrations/{passTypeId}/{serial}   register
//   DELETE devices/{device}/registrations/{passTypeId}/{serial}   unregister
//   GET    devices/{device}/registrations/{passTypeId}?passesUpdatedSince=
//   GET    passes/{passTypeId}/{serial}                           latest pass
//   POST   log                                                     Apple's errors
//   GET    download/{serial}.pkpass?t=<token>                      first install
// Apple authenticates with "Authorization: ApplePass <card token>".
import { json } from '../../../auth/_lib.js';
import { cardBySerial, registerDevice, unregisterDevice, serialsUpdatedSince } from '../_store.js';
import { cardPass, sameToken } from '../_pass.js';

const PKPASS = 'application/vnd.apple.pkpass';
const authOf = (request) => (/^ApplePass\s+(\S+)$/.exec(request.headers.get('Authorization') || '') || [])[1] || '';

async function authedCard(env, request, ptid, serial) {
  if (ptid !== env.WALLET_APPLE_PASS_TYPE_ID) return { status: 404 };
  const card = await cardBySerial(env.DB, serial);
  if (!card || card.platform !== 'apple') return { status: 404 };
  if (!sameToken(authOf(request), card.auth_token)) return { status: 401 };
  return { card };
}

async function servePass(env, card, request, origin) {
  if (card.revoked) return new Response(null, { status: 410 });
  const modified = Math.floor(card.updated_ts / 1000) * 1000;
  const since = Date.parse(request.headers.get('If-Modified-Since') || '');
  if (Number.isFinite(since) && since >= modified) return new Response(null, { status: 304 });
  const bytes = await cardPass(env, card, origin);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(bytes, { headers: { 'Content-Type': PKPASS, 'Last-Modified': new Date(modified).toUTCString(), 'Cache-Control': 'no-store' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url), method = request.method;
  const parts = (Array.isArray(context.params.path) ? context.params.path : [context.params.path]).filter(Boolean).map(decodeURIComponent);
  try {
    if (parts[0] === 'log' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      for (const line of (Array.isArray(body.logs) ? body.logs : []).slice(0, 10)) console.warn('[wallet] apple:', String(line).slice(0, 300));
      return new Response(null, { status: 200 });
    }
    if (parts[0] === 'download' && parts.length === 2 && method === 'GET') {
      const serial = parts[1].replace(/\.pkpass$/, '');
      const card = await cardBySerial(env.DB, serial);
      if (!card || card.platform !== 'apple' || !sameToken(url.searchParams.get('t'), card.auth_token)) return new Response(null, { status: 404 });
      const res = await servePass(env, card, new Request(request.url), url.origin);
      if (res.status === 200) res.headers.set('Content-Disposition', 'attachment; filename="carte.pkpass"');
      return res;
    }
    if (parts[0] === 'passes' && parts.length === 3 && method === 'GET') {
      const a = await authedCard(env, request, parts[1], parts[2]);
      return a.card ? servePass(env, a.card, request, url.origin) : new Response(null, { status: a.status });
    }
    if (parts[0] === 'devices' && parts[2] === 'registrations') {
      const device = parts[1].slice(0, 128);
      if (parts.length === 5 && (method === 'POST' || method === 'DELETE')) {
        const a = await authedCard(env, request, parts[3], parts[4]);
        if (!a.card) return new Response(null, { status: a.status });
        if (method === 'DELETE') { await unregisterDevice(env.DB, device, a.card.serial); return new Response(null, { status: 200 }); }
        const body = await request.json().catch(() => ({}));
        const token = String(body.pushToken || '');
        if (!/^[0-9a-fA-F]{32,200}$/.test(token)) return new Response(null, { status: 400 });
        const r = await registerDevice(env.DB, { deviceId: device, serial: a.card.serial, pushToken: token });
        return new Response(null, { status: r === 'created' ? 201 : 200 });
      }
      if (parts.length === 4 && method === 'GET') {
        if (parts[3] !== env.WALLET_APPLE_PASS_TYPE_ID) return new Response(null, { status: 404 });
        const r = await serialsUpdatedSince(env.DB, device, Number(url.searchParams.get('passesUpdatedSince')) || 0);
        return r.serials.length ? json({ serialNumbers: r.serials, lastUpdated: r.lastUpdated }) : new Response(null, { status: 204 });
      }
    }
    return new Response(null, { status: 404 });
  } catch (error) {
    if (/no such table/i.test(String(error && error.message))) return json({ error: 'unmigrated' }, 503);
    throw error;
  }
}
