// POST /api/pair/redeem — the CAISSE half of pairing. No account session (the
// caisse has no login); it only needs to have passed the passcode gate, which
// the same-origin fetch carries via kiwi_gate (see functions/_middleware.js).
//
// Body: { code }. Atomic single-use redemption — one UPDATE claims the code and
// returns the store it binds to, so two devices can never redeem the same code:
//   UPDATE ... SET used_ts=? WHERE code=? AND used_ts IS NULL AND expires_ts>? RETURNING ...
//
// Response contract with assets/caisse-pairing.js (do NOT change the client):
//   · valid   → 200 { ok:true, merchant, type, subtype, name }.  The `ok:true` is
//     REQUIRED: redeem() only calls applyPairing when j.ok is truthy.
//   · invalid or expired → 422 { error:'invalid_or_expired' }. This is a REAL
//     rejection ("code invalide") — the client shows an error and does NOT fall
//     back to localStorage.
//   · NEVER 404/405 — the client reads those as "backend absent" and falls back
//     to the same-browser localStorage map, which would mask a genuine bad code.
//
// No DB ⇒ 503 (a static host has no pairings table; the client's 404-style
// fallback isn't reached here, but 503 still keeps it away from the 422 path).

import { json, tillToken, tillCookie, terminalToken, terminalCookie, tillEpoch,
} from '../../auth/_lib.js';

/* ── Brute-force cap ────────────────────────────────────────────────────────
 * This endpoint has no session to check — a till has no login — so a 6-digit
 * code was the only thing between a script and binding its own device to
 * someone else's store. 900 000 codes, unlimited guesses and a 15-minute window
 * is a tractable grind for whichever codes happen to be live.
 *
 * Counting is per client IP (CF-Connecting-IP, set by the edge and not
 * spoofable by the client). A SUCCESSFUL redeem clears the counter, so a shop
 * fumbling its own code is never locked out for long. Counter failures are
 * swallowed: if the table is missing the endpoint keeps working exactly as it
 * did — pairing a real store must not depend on the rate limiter being healthy.
 */
const WINDOW_MS = 10 * 60 * 1000;   // rolling window a burst is measured over
const MAX_FAILS = 10;               // wrong codes tolerated in that window
const BLOCK_MS  = 15 * 60 * 1000;   // lockout once the cap is passed

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')
      || '';
}

/* Record one wrong guess. The window is rolling by restart, not sliding: once
 * first_ts is older than WINDOW_MS the row is reset to a fresh single failure,
 * so old rows expire themselves and no sweeper is needed. Best-effort — any
 * error here is swallowed so a limiter problem can never block a real pairing. */
async function noteFail(env, ip, now) {
  if (!ip || !env.DB) return;
  try {
    const a = await env.DB.prepare(
      'SELECT fails, first_ts FROM pair_attempts WHERE ip = ?'
    ).bind(ip).first();

    if (!a || (now - a.first_ts) > WINDOW_MS) {
      await env.DB.prepare(
        `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(ip) DO UPDATE SET fails = 1, first_ts = excluded.first_ts, blocked_until = NULL`
      ).bind(ip, now).run();
      return;
    }

    const fails = (a.fails || 0) + 1;
    const blocked = fails >= MAX_FAILS ? (now + BLOCK_MS) : null;
    await env.DB.prepare(
      'UPDATE pair_attempts SET fails = ?, blocked_until = ? WHERE ip = ?'
    ).bind(fails, blocked, ip).run();
  } catch (_) { /* limiter unavailable → fail open, pairing still works */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { body = {}; }
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const terminalId = /^[A-Za-z0-9_-]{12,80}$/.test(String(body.terminalId || ''))
    ? String(body.terminalId) : '';

  const now = Date.now();
  const ip = clientIp(request);

  // Are we already locked out? Checked BEFORE the code is even shaped, so a
  // blocked source cannot use malformed input as a free probe.
  if (ip) {
    try {
      const a = await env.DB.prepare(
        'SELECT fails, first_ts, blocked_until FROM pair_attempts WHERE ip = ?'
      ).bind(ip).first();
      if (a && a.blocked_until && a.blocked_until > now) {
        return json({ error: 'too_many_attempts', retry_after: Math.ceil((a.blocked_until - now) / 1000) }, 429);
      }
    } catch (_) { /* no table → no limiter, pairing still works */ }
  }

  if (code.length !== 6) { await noteFail(env, ip, now); return json({ error: 'invalid_or_expired' }, 422); }

  let row = null;
  try {
    row = await env.DB.prepare(
      `UPDATE pairings SET used_ts = ?
        WHERE code = ? AND used_ts IS NULL AND expires_ts > ?
        RETURNING merchant, type, subtype, name`
    ).bind(now, code, now).first();
  } catch (_) {
    // Table missing / db error → treat as a bad code, never 404 (which would
    // wrongly trip the client's "backend absent" localStorage fallback).
    return json({ error: 'invalid_or_expired' }, 422);
  }

  if (!row) { await noteFail(env, ip, now); return json({ error: 'invalid_or_expired' }, 422); }

  // Genuine pairing — wipe the counter so an honest shop that mistyped twice
  // starts clean again.
  if (ip) { try { await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(ip).run(); } catch (_) {} }

  const res = json({
    ok: true,
    merchant: row.merchant,
    type: row.type || '',
    subtype: row.subtype || '',
    name: row.name || '',
  });

  /* Hand the till proof of WHICH store it just became, so /api/config can answer
   * a session-less caisse without taking ?merchant= on the client's word. Set as
   * an httpOnly cookie: no page script can read it, and it rides along on the
   * same-origin config fetch automatically — the client needs no change. */
  if (env.AUTH_SECRET) {
    /* Émis au millésime COURANT du commerçant : un dépairage ultérieur le
     * périmera, comme tous les autres. */
    try {
      const epoch = await tillEpoch(env, row.merchant);
      res.headers.append('Set-Cookie', tillCookie(await tillToken(env.AUTH_SECRET, row.merchant, epoch)));
    } catch (_) {}
    if (terminalId) {
      try { res.headers.append('Set-Cookie', terminalCookie(await terminalToken(env.AUTH_SECRET, row.merchant, terminalId))); } catch (_) {}
    }
  }
  return res;
}
