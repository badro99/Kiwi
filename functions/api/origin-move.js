import { json, tillDeviceToken, tillCookie, tillStoreCookie,
  terminalToken, terminalCookie, employeeToken, employeeCookie, activeEmployee } from '../auth/_lib.js';
import { OLD_HOST, NEW_HOST, MOVE_PATHS, moveIdentity, digest, merchantActive } from '../_origin-move.js';

/* Money and paper block a move; a non-financial command does not. An unreadable
 * queue could hide either, so it blocks too. Mirrors movable() in the client. */
export function queuesMovable(q) {
  return !!q && ['sales', 'prints', 'unknown'].every(k => q[k] === 0);
}
// Explicit non-secret settings only. Never accept arbitrary localStorage buckets.
export function safePreferences(input) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const key of ['kiwiLang', 'kiwiCaisseLang']) {
    if (['fr', 'en', 'ar'].includes(input[key])) result[key] = input[key];
  }
  for (const key of ['kiwiTheme', 'kiwiDashTheme']) {
    if (['light', 'dark', 'system'].includes(input[key])) result[key] = input[key];
  }
  if (/^[A-Za-z0-9_-]{1,80}$/.test(input['kiwi:posDevice'] || '')) result['kiwi:posDevice'] = input['kiwi:posDevice'];
  try {
    const cfg = JSON.parse(input.kiwiPrinterCfg);
    const printer = {};
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cfg.ip || '')) printer.ip = cfg.ip;
    if (Number.isInteger(cfg.port) && cfg.port > 0 && cfg.port < 65536) printer.port = cfg.port;
    if (['58', '80'].includes(String(cfg.paper))) printer.paper = String(cfg.paper);
    if (cfg.model === 'escpos') printer.model = cfg.model;
    if (typeof cfg.osPrinter === 'string' && cfg.osPrinter.length <= 120 && !/[\r\n]/.test(cfg.osPrinter)) printer.osPrinter = cfg.osPrinter;
    if (Object.keys(printer).length) result.kiwiPrinterCfg = JSON.stringify(printer);
  } catch (_) {}
  return result;
}
async function pendingPrints(env, merchant) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM print_jobs WHERE merchant = ?
    AND status IN ('queued', 'claimed', 'uncertain', 'failed')`).bind(merchant).first();
  return Number(row?.n || 0);
}
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!env?.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  if (request.headers.get('Origin') !== url.origin || url.protocol !== 'https:') return json({ error: 'forbidden' }, 403);
  let body;
  try {
    if (Number(request.headers.get('Content-Length')) > 4096) return json({ error: 'too-large' }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'too-large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid-body' }, 400);
  } catch (_) { return json({ error: 'invalid-body' }, 400); }
  try {
    if (body.action === 'status' && url.hostname === OLD_HOST) {
      if (!Object.hasOwn(MOVE_PATHS, body.role)) return json({ error: 'invalid-role' }, 400);
      const identity = await moveIdentity(request, env, body.role, body.terminalId);
      const prints = identity ? await pendingPrints(env, identity.merchant) : 0;
      return json({ prints, login: !identity }, 200, { 'Cache-Control': 'no-store' });
    }
    if (body.action === 'issue' && url.hostname === OLD_HOST) {
      if (!Object.hasOwn(MOVE_PATHS, body.role)) return json({ error: 'invalid-role' }, 400);
      const identity = await moveIdentity(request, env, body.role, body.terminalId);
      if (!identity || Array.isArray(identity)) return json({ error: 'login-required' }, 403);
      const prints = await pendingPrints(env, identity.merchant);
      if (!queuesMovable(body.queues) || prints) return json({ error: 'queues-not-empty', prints }, 409);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const hash = await digest(token);
      await env.DB.prepare('DELETE FROM origin_handoffs WHERE expires_ts < ?').bind(Date.now() - 86400000).run();
      await env.DB.prepare(`INSERT INTO origin_handoffs
        (token_hash, merchant, role, device_id, staff_id, auth_version, expires_ts, preferences)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(hash, identity.merchant, identity.role, identity.device, identity.staff || null, identity.version, Date.now() + 120000, JSON.stringify(safePreferences(body.preferences))).run();
      return json({ token }, 200, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    }
    if (body.action !== 'exchange' || url.hostname !== NEW_HOST) return json({ error: 'forbidden' }, 403);
    if (!queuesMovable(body.queues)) return json({ error: 'queues-not-empty' }, 409);
    if (!/^[a-f0-9]{64}$/.test(body.token || '')) return json({ error: 'invalid-or-expired' }, 422);
    const hash = await digest(body.token);
    const row = await env.DB.prepare('SELECT * FROM origin_handoffs WHERE token_hash = ? AND used_ts IS NULL AND expires_ts > ?')
      .bind(hash, Date.now()).first();
    if (!row || !Object.hasOwn(MOVE_PATHS, row.role) || (body.merchant && body.merchant !== row.merchant)
        || (body.role && body.role !== row.role)) return json({ error: 'invalid-or-expired' }, 422);
    if (!await merchantActive(env, row.merchant)) return json({ error: 'invalid-or-expired' }, 422);
    const prints = await pendingPrints(env, row.merchant);
    if (prints) return json({ error: 'queues-not-empty', prints }, 409);
    const cookies = [];
    if (row.role === 'employee') {
      const employee = await employeeToken(env.AUTH_SECRET, { merchant: row.merchant, staffId: row.staff_id, authVersion: row.auth_version });
      const proof = new Request(request.url, { headers: { Cookie: employeeCookie(employee).split(';')[0] } });
      if (!await activeEmployee(proof, env, row.merchant)) return json({ error: 'invalid-or-expired' }, 422);
      cookies.push(employeeCookie(employee));
    } else {
      // Bypass the normal one-minute auth cache for this credential transfer.
      const current = await env.DB.prepare(`SELECT m.till_epoch, d.revoked_ts FROM merchant_config m
        LEFT JOIN till_devices d ON d.merchant = m.merchant AND d.device_id = ? WHERE m.merchant = ?`)
        .bind(row.device_id, row.merchant).first();
      const epoch = Number(current?.till_epoch || 0);
      if (!current || epoch !== row.auth_version || Number(current.revoked_ts) > 0) return json({ error: 'invalid-or-expired' }, 422);
      const token = await tillDeviceToken(env.AUTH_SECRET, row.merchant, epoch, row.device_id);
      cookies.push(tillCookie(token), tillStoreCookie(row.merchant), terminalCookie(await terminalToken(env.AUTH_SECRET, row.merchant, row.device_id, epoch)));
    }
    // Atomic claim after all checks. Only one concurrent exchange can issue cookies.
    const config = await env.DB.prepare('SELECT name, type FROM merchant_config WHERE merchant = ?').bind(row.merchant).first();
    const used = await env.DB.prepare(`UPDATE origin_handoffs SET used_ts = ?
      WHERE token_hash = ? AND used_ts IS NULL AND expires_ts > ? RETURNING merchant`).bind(Date.now(), hash, Date.now()).first();
    if (!used) return json({ error: 'invalid-or-expired' }, 422);
    const response = json({ ok: true, merchant: row.merchant, role: row.role, deviceId: row.role === 'employee' ? undefined : row.device_id,
      preferences: safePreferences(JSON.parse(row.preferences || '{}')), name: config?.name || '', type: config?.type || '', path: MOVE_PATHS[row.role] }, 200, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    cookies.forEach(cookie => response.headers.append('Set-Cookie', cookie));
    return response;
  } catch (_) { return json({ error: 'move-unavailable' }, 503); }
}
