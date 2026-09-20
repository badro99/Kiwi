/* POST /api/pair/recover — restore the short-lived authorization role of a
 * physical till from its stable, device-bound terminal proof.
 *
 * Pairing deliberately gives the browser two independent HttpOnly cookies:
 * `kiwi_terminal` proves which physical device was paired, while `kiwi_till`
 * is the revocable authorization used on sale requests. Some kiosk browsers
 * have retained only one Set-Cookie value from the redemption response. The
 * local pairing then looks healthy, yet every sale is rejected and the client
 * creates another one-time pairing every minute. This endpoint returns only
 * the till cookie, so recovery cannot lose it behind a second Set-Cookie.
 *
 * The terminal id from the body is not authority. It is accepted only when the
 * HttpOnly terminal cookie verifies for the same merchant and exact id.
 */
import {
  isTerminalFor, json, tillCookie, tillEpoch, tillToken,
} from '../../auth/_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String(body.merchant || '').trim().slice(0, 64);
  const terminalId = String(body.terminalId || '').trim();
  if (!merchant || !/^[A-Za-z0-9_-]{12,80}$/.test(terminalId)) {
    return json({ error: 'terminal-required' }, 400);
  }

  if (!await isTerminalFor(request, env, merchant, terminalId)) {
    return json({ error: 'forbidden-terminal' }, 403);
  }

  const epoch = await tillEpoch(env, merchant);
  if (!Number.isFinite(epoch)) return json({ error: 'auth-verification-unavailable' }, 503);

  return json({ ok: true, merchant }, 200, {
    'Set-Cookie': tillCookie(await tillToken(env.AUTH_SECRET, merchant, epoch)),
  });
}

export function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}
