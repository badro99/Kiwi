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
 * fumbling its own code is never locked out for long. Counter failures deny the
 * attempt: pairing must not become an unlimited six-digit oracle while its only
 * brute-force control is unavailable.
 */
const WINDOW_MS = 10 * 60 * 1000;   // rolling window a burst is measured over
const MAX_FAILS = 10;               // wrong codes tolerated in that window
const BLOCK_MS  = 15 * 60 * 1000;   // lockout once the cap is passed

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')
      || '';
}

function limiterUnavailable() { return json({ error: 'rate-limit-unavailable' }, 503); }

async function pairLimitCheck(env, ip, now) {
  if (!ip) return null;
  try {
    const a = await env.DB.prepare(
      'SELECT blocked_until FROM pair_attempts WHERE ip = ?'
    ).bind(ip).first();
    if (a && a.blocked_until && a.blocked_until > now) {
      return json({ error: 'too_many_attempts', retry_after: Math.ceil((a.blocked_until - now) / 1000) }, 429);
    }
    return null;
  } catch (_) { return limiterUnavailable(); }
}

/* Record one wrong guess atomically. Concurrent failures must each advance the
 * same SQLite row; a read-then-write pair loses increments under a wave of
 * guesses. */
async function noteFail(env, ip, now) {
  if (!ip) return true;
  if (!env || !env.DB) return false;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
       ON CONFLICT(ip) DO UPDATE SET
         fails = CASE WHEN ? - pair_attempts.first_ts > ? THEN 1 ELSE pair_attempts.fails + 1 END,
         first_ts = CASE WHEN ? - pair_attempts.first_ts > ? THEN ? ELSE pair_attempts.first_ts END,
         blocked_until = CASE
           WHEN ? - pair_attempts.first_ts > ? THEN NULL
           WHEN pair_attempts.fails + 1 >= ? THEN ?
           ELSE pair_attempts.blocked_until END`
    ).bind(ip, now, now, WINDOW_MS, now, WINDOW_MS, now,
           now, WINDOW_MS, MAX_FAILS, now + BLOCK_MS).run();
    const changes = Number(result && result.meta && result.meta.changes);
    return Number.isFinite(changes) ? changes > 0 : true;
  } catch (_) { return false; }
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
    const limited = await pairLimitCheck(env, ip, now);
    if (limited) return limited;
  }

  if (code.length !== 6) {
    if (!await noteFail(env, ip, now)) return limiterUnavailable();
    return json({ error: 'invalid_or_expired' }, 422);
  }

  /* A paired till needs a current epoch-bound proof. Resolve the merchant before
   * consuming the one-time code so a revocation-read outage neither issues a v0
   * token nor destroys the merchant's only usable pairing attempt. The final
   * UPDATE remains the single-use race arbiter. */
  let pending = null;
  try {
    pending = await env.DB.prepare(
      'SELECT merchant FROM pairings WHERE code = ? AND used_ts IS NULL AND expires_ts > ?'
    ).bind(code, now).first();
  } catch (_) {
    return json({ error: 'auth-verification-unavailable' }, 503);
  }
  /* Appairer, c'est inscrire la boutique au registre — et l'inscription est ce
   * qui rend le millésime LISIBLE. Sans ligne dans merchant_config, tillEpoch()
   * répond « indisponible » (il refuse, à raison, de convertir une absence en
   * zéro), si bien qu'une boutique jamais configurée obtenait un jeton que rien
   * ne pouvait ensuite vérifier : appairée en apparence, 403 sur chaque vente,
   * et impossible à réappairer puisque le même millésime manquait ici aussi.
   * On pose donc la ligne AVANT de lire, sans rien écraser : une boutique déjà
   * configurée garde ses réglages, son plan et son millésime. */
  if (pending && pending.merchant) {
    try {
      await env.DB.prepare(
        `INSERT INTO merchant_config (merchant, features, updated_ts)
         VALUES (?, '{}', ?) ON CONFLICT(merchant) DO NOTHING`
      ).bind(pending.merchant, now).run();
    } catch (_) { /* colonnes absentes ou course : la lecture ci-dessous tranche */ }
  }
  let currentEpoch = 0;
  if (env.AUTH_SECRET) {
    currentEpoch = pending ? await tillEpoch(env, pending.merchant) : 0;
    if (pending && !Number.isFinite(currentEpoch)) return json({ error: 'auth-unavailable' }, 503);
  }

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

  if (!row) {
    if (!await noteFail(env, ip, now)) return limiterUnavailable();
    return json({ error: 'invalid_or_expired' }, 422);
  }

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
      if (!Number.isFinite(currentEpoch)) return json({ error: 'auth-unavailable' }, 503);
      res.headers.append('Set-Cookie', tillCookie(await tillToken(env.AUTH_SECRET, row.merchant, currentEpoch)));
    } catch (_) { return json({ error: 'auth-unavailable' }, 503); }
    if (terminalId) {
      try { res.headers.append('Set-Cookie', terminalCookie(await terminalToken(env.AUTH_SECRET, row.merchant, terminalId))); } catch (_) {}
    }
  }
  return res;
}
