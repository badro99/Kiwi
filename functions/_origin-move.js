// Origin retirement: fixed destinations, live identities, no credential projection.
import { readCookie, readSession, SESS_COOKIE, sessionRevocation, tillVerification,
  TILL_STORE_COOKIE, TILL_STORE, activeEmployee, tillEpoch, isTerminalFor, DEVICE_ID } from './auth/_lib.js';
export const OLD_HOST = 'kiwi-maroc.pages.dev';
export const NEW_HOST = 'kiwi-os.com';
export const MOVE_PATHS = { till: '/kiwi-caisse.html', kitchen: '/kiwi-cuisine.html', employee: '/kiwi-serveur.html', waiter: '/kiwi-serveur.html' };

export function visitorRedirect(request) {
  const url = new URL(request.url);
  if (url.hostname !== OLD_HOST || request.method !== 'GET') return null;
  if (/(?:^|;\s*)kiwi[^=;]*=/i.test(request.headers.get('Cookie') || '')) return null;
  if (request.headers.get('Sec-Fetch-Mode') !== 'navigate'
      && request.headers.get('Sec-Fetch-Dest') !== 'document'
      && !(request.headers.get('Accept') || '').includes('text/html')) return null;
  // Exact public documents only. Locale export payloads and images are assets.
  const publicPage = /^\/(?:index\.html)?$/.test(url.pathname)
    || /^\/(?:fr|en|ar|de|it|nl|es)(?:\/(?:index\.html|pricing|legal|booking|signup|login)?)?\/?$/.test(url.pathname)
    || /^\/(?:pricing|tarifs|privacy|terms|mentions-legales|cookies|support|booking|signup|login|reset)(?:\.html)?\/?$/.test(url.pathname);
  if (!publicPage) return null;
  url.protocol = 'https:'; url.host = NEW_HOST;
  return new Response(null, { status: 302, headers: { Location: url.href, 'Cache-Control': 'no-store', Vary: 'Cookie, Sec-Fetch-Mode, Sec-Fetch-Dest, Accept' } });
}
export async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function moveIdentity(request, env, role, terminalId, telemetry = false) {
  if (!env?.DB || !env.AUTH_SECRET) return null;
  const employee = await activeEmployee(request, env, '');
  if (employee && (!role || role === 'employee' || role === 'waiter')) {
    if (!await merchantActive(env, employee.merchant)) return null;
    return { merchant: employee.merchant, role: 'employee', device: await digest(readCookie(request, 'kiwi_employee')),
      staff: employee.session.staffId, version: employee.session.av || 0 };
  }
  const merchant = readCookie(request, TILL_STORE_COOKIE) || new URL(request.url).searchParams.get('merchant') || '';
  if (TILL_STORE.test(merchant) && (!role || role === 'till' || role === 'kitchen' || role === 'waiter')) {
    const till = await tillVerification(request, env, merchant);
    const device = till.deviceId || (till.ok && till.legacy && DEVICE_ID.test(terminalId || '')
      && await isTerminalFor(request, env, merchant, terminalId) ? terminalId : '');
    if (till.ok && till.legacy && !device && telemetry && await merchantActive(env, merchant)) {
      return { merchant, role: role || 'till', device: await digest(readCookie(request, 'kiwi_terminal') || readCookie(request, 'kiwi_till')) };
    }
    if (till.ok && device && await merchantActive(env, merchant)) {
      return { merchant, role: role || 'till', device, version: await tillEpoch(env, merchant) };
    }
  }
  if (role) return null;
  const raw = readCookie(request, SESS_COOKIE);
  const session = raw && await readSession(raw, env.AUTH_SECRET);
  if (!session) return null;
  const revocation = await sessionRevocation(env, session);
  const account = await env.DB.prepare('SELECT status, session_epoch FROM accounts WHERE id = ?').bind(session.aid).first();
  if (!account || account.status === 'suspended' || revocation.revoked || revocation.unavailable
      || Number(account.session_epoch || 0) !== Number(session.sv || 0)) return null;
  const { results } = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE account_id = ?').bind(session.aid).all();
  return (results || []).map(row => ({ merchant: row.merchant, role: 'owner', device: raw }));
}
export async function merchantActive(env, merchant) {
  const row = await env.DB.prepare(`SELECT m.status, a.status AS account_status FROM merchant_config m
    LEFT JOIN accounts a ON a.id = m.account_id WHERE m.merchant = ?`).bind(merchant).first();
  return !!row && row.status !== 'suspended' && row.account_status !== 'suspended';
}
const seen = new WeakMap();
export async function recordOldOrigin(request, env) {
  if (new URL(request.url).hostname !== OLD_HOST || !env?.DB) return;
  try {
    const path = new URL(request.url).pathname;
    let surface = path;
    try {
      const ref = new URL(request.headers.get('Referer'));
      if (ref.hostname === OLD_HOST) surface = ref.pathname;
    } catch (_) {}
    const role = /^\/kiwi-cuisine(?:\.html)?$/.test(surface) ? 'kitchen'
      : /^\/kiwi-serveur(?:\.html)?$/.test(surface) ? 'waiter' : undefined;
    const identity = await moveIdentity(request, env, role, new URL(request.url).searchParams.get('terminalId'), true);
    const rows = Array.isArray(identity) ? identity : identity ? [identity] : [];
    let cache = seen.get(env.DB);
    if (!cache) { cache = new Map(); seen.set(env.DB, cache); }
    for (const row of rows) {
      const device = await digest(row.device);
      const key = row.merchant + ':' + device;
      const now = Date.now();
      if (cache.get(key) > now - 3600000) continue;
      // Reserve before awaiting: concurrent requests in this isolate share the throttle.
      cache.set(key, now);
      if (cache.size > 10000) cache.delete(cache.keys().next().value);
      try {
        const previous = await env.DB.prepare('SELECT last_seen FROM origin_devices WHERE merchant = ? AND device_hash = ?').bind(row.merchant, device).first();
        if (previous && previous.last_seen > now - 3600000) continue;
        await env.DB.prepare(`INSERT INTO origin_devices (merchant, device_hash, role, last_seen) VALUES (?, ?, ?, ?)
          ON CONFLICT(merchant, device_hash) DO UPDATE SET role = excluded.role, last_seen = excluded.last_seen
          WHERE origin_devices.last_seen <= excluded.last_seen - 3600000`).bind(row.merchant, device, row.role, now).run();
      } catch (_) { cache.delete(key); }
    }
  } catch (_) { /* Telemetry must never interrupt a sale, including before migration. */ }
}
