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

import { json, tillToken, tillDeviceToken, recordTillDevice, tillCookie, terminalToken, terminalCookie, tillEpoch, tillStoreCookie,
} from '../../auth/_lib.js';
import { clientAddress, sourceKeys } from '../_net-source.js';
import { reserveAttempt, settleSuccess } from '../_attempt-reserve.js';

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

/* ── …and per NETWORK, not only per address ─────────────────────────────────
 * Codes are global: one guess tries every merchant's live codes at once. An
 * IPv6 client owns a whole /64 and could take a fresh address per request, so
 * the narrow counter is the /64 (IPv4 keeps the exact address, see
 * _net-source.js). A second, wider counter (IPv6 /48, IPv4 /24) bounds a
 * client that rotates whole /64s; it is NOT cleared by a successful pairing,
 * otherwise redeeming a code from one's own Kiwi account would reset it every
 * nine guesses. Thirty wrong codes from one network in ten minutes is never
 * a shop fumbling its own code.
 *
 * No global budget: one would let any stranger switch pairing off for every
 * merchant by spending it. */
const WIDE_MAX_FAILS = 30;
const WIDE_PREFIX = 'pairw|';

function limiterKeys(request) {
  const { narrow, wide } = sourceKeys(clientAddress(request));
  return [narrow ? { key: narrow, max: MAX_FAILS } : null,
          wide ? { key: WIDE_PREFIX + wide, max: WIDE_MAX_FAILS } : null].filter(Boolean);
}

function limiterUnavailable() { return json({ error: 'rate-limit-unavailable' }, 503); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { body = {}; }
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const terminalId = /^[A-Za-z0-9_-]{12,80}$/.test(String(body.terminalId || ''))
    ? String(body.terminalId) : '';

  const now = Date.now();
  const keys = limiterKeys(request);

  // The attempt is COUNTED before the code is even shaped or looked up
  // (_attempt-reserve.js): checking first and counting the failure afterwards
  // let a burst of simultaneous guesses all pass the check. A blocked source
  // cannot use malformed input as a free probe either.
  if (keys.length) {
    let gate;
    try { gate = await reserveAttempt(env, keys, now, { windowMs: WINDOW_MS, blockMs: BLOCK_MS }); }
    catch (_) { return limiterUnavailable(); }
    if (!gate.ok) return json({ error: 'too_many_attempts', retry_after: gate.retryAfter }, 429);
  }

  if (code.length !== 6) return json({ error: 'invalid_or_expired' }, 422);

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

  if (!row) return json({ error: 'invalid_or_expired' }, 422);

  // Genuine pairing — wipe the narrow counter so an honest shop that mistyped
  // twice starts clean again. The network counter only gets this attempt back
  // (see WIDE_MAX_FAILS).
  const narrow = keys.find((k) => !k.key.startsWith(WIDE_PREFIX));
  const wide = keys.find((k) => k.key.startsWith(WIDE_PREFIX));
  await settleSuccess(env, narrow && narrow.key, wide && wide.key);

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
    /* Some legacy kiosk/WebView paths have retained only the final Set-Cookie
     * value. Put the terminal identity first and the sale-authorizing till
     * proof last: an old client then heals on its next existing pairing retry,
     * while current clients confirm/recover both proofs explicitly. */
    if (terminalId) {
      try { res.headers.append('Set-Cookie', terminalCookie(await terminalToken(env.AUTH_SECRET, row.merchant, terminalId, currentEpoch))); } catch (_) {}
    }
    /* Le magasin que la porte du site devra vérifier pour ouvrir la PAGE de la
     * caisse sans session propriétaire. Avant la preuve de caisse : celle-ci
     * reste la dernière, pour les navigateurs qui ne gardent que la dernière. */
    const store = tillStoreCookie(row.merchant);
    if (store) res.headers.append('Set-Cookie', store);
    try {
      if (!Number.isFinite(currentEpoch)) return json({ error: 'auth-unavailable' }, 503);
      /* Un appareil qui se nomme reçoit un jeton à SON nom : on pourra le
         retirer seul (POST /api/pair/devices). Un nouveau code lève une
         ancienne révocation de cet appareil. */
      res.headers.append('Set-Cookie', tillCookie(terminalId
        ? await tillDeviceToken(env.AUTH_SECRET, row.merchant, currentEpoch, terminalId)
        : await tillToken(env.AUTH_SECRET, row.merchant, currentEpoch)));
      if (terminalId) await recordTillDevice(env, row.merchant, terminalId, { paired: true });
    } catch (_) { return json({ error: 'auth-unavailable' }, 503); }
  }
  return res;
}
