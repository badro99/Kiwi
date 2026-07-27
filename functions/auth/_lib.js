// Kiwi — shared auth helpers for the account gate (Cloudflare Pages Functions).
//
// Runs on the Workers runtime and uses only Web Crypto + platform globals
// (crypto.subtle, crypto.getRandomValues, crypto.randomUUID, btoa/atob,
// TextEncoder/Decoder) — all of which Node 18+ also exposes, so the same logic
// is verifiable locally. Passwords are PBKDF2-SHA256 with a per-user salt;
// sessions are stateless HMAC-signed tokens. Nothing here is stored in the repo.
//
// A `_`-prefixed file is excluded from routing but importable by the route
// handlers (signup/login/logout) and by _middleware.js.

const ITER = 100000;            // PBKDF2 rounds
export const SESS_COOKIE = 'kiwi_sess';
const SESS_DAYS = 30;

const encoder = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToB64url(buf) {
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Constant-time-ish compare over two equal-length hex strings.
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, saltBytes) {
  const km = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITER, hash: 'SHA-256' },
    km, 256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { salt: toHex(salt), hash: toHex(hash) };
}

export async function verifyPassword(password, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false;
  const hash = await pbkdf2(password, fromHex(saltHex));
  return timingSafeEqualHex(toHex(hash), hashHex);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(sig);
}

// ── Gate tokens (staff bypass + operator console) ───────────────────────────
// Both are unforgeable HMACs. The staff token is keyed by the shared SITE_PASSWORD
// (so it matches the "Accès équipe" cookie in _middleware.js). The operator token
// is keyed by AUTH_SECRET and is constant — it only proves "operator-authenticated"
// (a specific code was accepted at /__operator), not which code, so deleting a code
// leaves live sessions intact. Both cookie names live here so the middleware and the
// /api/admin/* handlers verify identically.
export const GATE_COOKIE = 'kiwi_gate';
export const OP_COOKIE = 'kiwi_op';

export async function staffToken(sitePassword) {
  return hmacHex(sitePassword, 'kiwi-gate-v1');
}

// ── Till token ──────────────────────────────────────────────────────────────
// Proof that THIS device redeemed a pairing code for THIS merchant. A till has
// no account login, so before this the only way /api/config could answer a
// session-less caisse was to trust ?merchant= on the client's word — which meant
// anyone who knew a slug could read that store's staff PINs. The token is a
// per-merchant HMAC handed out by /api/pair/redeem and returned as an httpOnly
// cookie, so a page script cannot read it and a different merchant's token does
// not verify. Unforgeable without AUTH_SECRET; carries no expiry because a
// pairing is meant to last until the merchant unpairs.
export const TILL_COOKIE = 'kiwi_till';

export async function tillToken(authSecret, merchant) {
  return hmacHex(authSecret, 'kiwi-till-v1:' + String(merchant || ''));
}
export function tillCookie(value) {
  return `${TILL_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86400}`;
}
// True when the request proves it is the till of `merchant`.
export async function isTillFor(request, env, merchant) {
  const secret = env && env.AUTH_SECRET;
  if (!secret || !merchant) return false;
  const got = readCookie(request, TILL_COOKIE);
  if (!got) return false;
  return timingSafeEqualHex(got, await tillToken(secret, merchant));
}
export async function operatorToken(authSecret) {
  return hmacHex(authSecret, 'kiwi-operator-v1');
}

/* QUI est l'opérateur, et pas seulement « c'en est un ».
 *
 * kiwi_op est le même cookie pour tout le monde — HMAC du secret, sans identité
 * dedans — parce qu'il ne sert qu'à dire « ce code était bon ». Le journal des
 * modules (config_audit) doit pouvoir écrire un nom en face d'un geste, alors le
 * middleware pose EN PLUS ce cookie-ci au moment où un code est vérifié.
 *
 * Signé, sinon il suffirait de le réécrire pour attribuer une coupure à un
 * collègue : la valeur est "<operators.id>.<HMAC(secret, id)>" et lire l'id sans
 * revérifier la signature reviendrait à croire le navigateur sur parole.
 * Absent ⇒ null, et l'appelant écrit une identité générique plutôt qu'un faux
 * nom (laissez-passer équipe, ou session ouverte avant cette version). */
export const OPID_COOKIE = 'kiwi_op_id';
export async function operatorIdToken(authSecret, opId) {
  return String(opId) + '.' + (await hmacHex(authSecret, 'kiwi-operator-id-v1:' + String(opId)));
}
export async function readOperatorId(request, env) {
  const secret = env && env.AUTH_SECRET;
  const raw = readCookie(request, OPID_COOKIE);
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const want = await hmacHex(secret, 'kiwi-operator-id-v1:' + id);
  return timingSafeEqualHex(raw.slice(dot + 1), want) ? id : null;
}

// True if the request carries a valid operator cookie, or a valid staff-bypass
// cookie (owner/partner = operator-equivalent). A plain merchant session is NOT
// enough — the admin surface is cross-merchant and privileged.
export async function isOperator(request, env) {
  const authSecret = env && env.AUTH_SECRET;
  const sitePassword = env && env.SITE_PASSWORD;
  if (authSecret) {
    const want = await operatorToken(authSecret);
    if (timingSafeEqualHex(readCookie(request, OP_COOKIE) || '', want)) return true;
  }
  if (sitePassword) {
    const want = await staffToken(sitePassword);
    if (timingSafeEqualHex(readCookie(request, GATE_COOKIE) || '', want)) return true;
  }
  return false;
}

// Session token = base64url(JSON{aid,exp}) + "." + HMAC(secret, payload).
export async function makeSession(accountId, secret) {
  const exp = Date.now() + SESS_DAYS * 86400 * 1000;
  const payload = bytesToB64url(encoder.encode(JSON.stringify({ aid: accountId, exp })));
  const sig = await hmacHex(secret, payload);
  return payload + '.' + sig;
}

export async function readSession(token, secret) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(secret, payload);
  if (!timingSafeEqualHex(sig, expected)) return null;
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))); } catch (_) { return null; }
  if (!obj || typeof obj.exp !== 'number' || obj.exp < Date.now()) return null;
  return obj;
}

export function sessionCookie(value) {
  return `${SESS_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESS_DAYS * 86400}`;
}
export function clearSessionCookie() {
  return `${SESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Merchant slug convention: slugify(business name). "Café Atlas" → "cafe-atlas",
// which is also the Live Link default merchant key, so the roster lines an account
// up with its sales without a stored mapping. Strips accents, lowercases, and
// collapses non-alphanumerics to single hyphens.
export function slugMerchant(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // drop accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'client';
}

// Fire-and-forget lead mirror to a Google Apps Script webhook (set as
// LEADS_WEBHOOK). Best-effort: a failure never blocks or breaks signup.
export async function mirrorLead(env, lead) {
  const url = env && env.LEADS_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
  } catch (_) { /* best-effort */ }
}

/* ── TENANT ENTITLEMENT ──────────────────────────────────────────────────────
 * feed.js worked this out first, and documented it at length: being past the
 * site gate is NOT the same as being entitled to a tenant, because the gate
 * admits EVERY signed-in merchant plus a shared staff passcode. An endpoint that
 * honours a client-supplied `merchant` therefore hands any caller any store —
 * and slugs are derived from business names, so they are guessable.
 *
 * That reasoning was written once, in one file, and never propagated: /api/sale
 * and /api/order/queue still took the tenant from the request body and query.
 * It lives here now, so the next endpoint inherits the rule instead of having to
 * rediscover it.
 *
 *   · paired till     → the store it was bound to (checked FIRST: on a
 *                       multi-store account the till, not the session, knows
 *                       which établissement is ringing)
 *   · account session → the store it asked for WHEN THE REGISTRY SAYS IT OWNS
 *                       IT, otherwise its own account slug
 *   · operator        → whatever was asked; that is the point of God mode
 *   · gate only       → demo tenants, nothing else
 *
 * Returns '' when the caller is entitled to nothing — callers must refuse. */
export const DEMO_MERCHANTS = { 'cafe-atlas': 1, 'maison-mansour': 1, 'spa-bahia': 1 };

/* Who owns this store? '' = a row that predates the registry (or one an operator
 * seeded) and belongs to nobody yet; null = the column isn't there, i.e. the
 * database has not been migrated. Callers treat both the same way — fall back to
 * the account slug — which is what makes the widening below safe to deploy
 * before the ALTER runs. config.js, menu.js and _private.js each carry an older
 * copy of this with identical semantics; new endpoints should import this one. */
export async function storeOwner(env, slug) {
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return row ? (row.account_id || '') : null;
  } catch (_) { return null; }
}

export async function entitledMerchant(request, env, asked, opts) {
  asked = String(asked || '').slice(0, 64);
  /* No auth configured at all (local static server, preview without secrets):
   * the gate is inert there, so keep the historical behaviour rather than
   * bricking local development. */
  if (!env || !env.AUTH_SECRET) return asked;

  if (opts && opts.allowTill && asked) {
    try { if (await isTillFor(request, env, asked)) return asked; } catch (_) {}
  }
  /* God mode, BEFORE the account session — the console is opened from a browser
   * that is normally ALSO signed in as a merchant (the site gate admits real
   * accounts), and with the session first that account won every time: "Ouvrir
   * dashboard" on any client polled the OPERATOR's own store, so every client's
   * En Direct feed and KPIs showed the operator's takings. The doc above always
   * promised "operator → whatever was asked"; only the ordering said otherwise.
   * Not a widening: isOperator() is a signed cookie, so a plain merchant still
   * falls through to the session branch and can still only reach its own shops. */
  if (asked) {
    try { if (await isOperator(request, env)) return asked; } catch (_) {}
  }
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid && env.DB) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      if (!(acc && acc.business)) return '';
      const accSlug = slugMerchant(acc.business);
      /* One login holds SEVERAL établissements, and money is the one thing that
       * must never cross between them. Collapsing every store onto accounts
       * .business is exactly what put the boutique's takings in the restaurant's
       * Commandes: both dashboards polled that single tenant, and both tills
       * wrote into it, so the two shops shared one till roll. The registry says
       * which stores are really this account's — config.js and _private.js
       * already resolve their tenant this way; the sales path was the one left
       * behind. An unowned or unclaimed slug still snaps back to the account,
       * so nothing widens beyond the caller's own shops. */
      if (asked && asked !== accSlug && (await storeOwner(env, asked)) === sess.aid) return asked;
      return accSlug;
    }
  } catch (_) { /* fall through to operator / demo */ }
  try { if (await isOperator(request, env)) return asked; } catch (_) {}
  return DEMO_MERCHANTS[asked] ? asked : '';
}

/* ─────────────────────── ATTEMPT LIMITER (brute force) ───────────────────────
 * Le même compteur que l'appairage (functions/api/pair/redeem.js), rendu
 * réutilisable. Il manquait là où il compte le plus : /auth/operator, le POST
 * /__operator du middleware et /auth/login n'avaient AUCUNE limite. Un code
 * opérateur fait au minimum 4 caractères — soit ~10 000 essais pour obtenir la
 * console d'administration, c'est-à-dire les ventes, les PIN et les clients de
 * TOUS les commerçants. Sans plafond, c'est quelques minutes de script.
 *
 * On réutilise la table pair_attempts telle quelle (aucune migration) en
 * préfixant la clé par un domaine : « op|1.2.3.4 ». Sans ce préfixe un
 * appairage raté bloquerait une connexion, et l'opérateur partagerait son
 * quota avec les caisses.
 *
 * Toujours « fail open » : si la table manque ou que D1 tousse, on laisse
 * passer. Un limiteur cassé ne doit jamais empêcher un commerçant d'entrer
 * chez lui.
 * ───────────────────────────────────────────────────────────────────────── */
const LIMIT_WINDOW_MS = 15 * 60 * 1000;   // fenêtre d'observation
const LIMIT_BLOCK_MS  = 15 * 60 * 1000;   // durée du blocage
const LIMIT_MAX_FAILS = 8;                // essais ratés tolérés par fenêtre

function limiterKey(request, scope) {
  const ip = request.headers.get('CF-Connecting-IP')
          || request.headers.get('X-Forwarded-For')
          || '';
  return ip ? `${scope}|${ip}` : '';
}

/* Déjà bloqué ? Vérifié AVANT de regarder le code, pour qu'une entrée
   malformée ne serve pas de sonde gratuite. Renvoie une Response 429 à
   retourner telle quelle, ou null si la voie est libre. */
export async function limitCheck(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return null;
  try {
    const a = await env.DB.prepare(
      'SELECT blocked_until FROM pair_attempts WHERE ip = ?'
    ).bind(k).first();
    const now = Date.now();
    if (a && a.blocked_until && a.blocked_until > now) {
      return json({ error: 'too_many_attempts', retry_after: Math.ceil((a.blocked_until - now) / 1000) }, 429);
    }
  } catch (_) { /* pas de table → pas de limiteur */ }
  return null;
}

/* Un essai raté de plus. Fenêtre glissante par redémarrage : passé
   LIMIT_WINDOW_MS la ligne repart à 1, donc elle expire d'elle-même. */
export async function limitFail(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return;
  const now = Date.now();
  try {
    const a = await env.DB.prepare(
      'SELECT fails, first_ts FROM pair_attempts WHERE ip = ?'
    ).bind(k).first();
    if (!a || (now - a.first_ts) > LIMIT_WINDOW_MS) {
      await env.DB.prepare(
        `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(ip) DO UPDATE SET fails = 1, first_ts = excluded.first_ts, blocked_until = NULL`
      ).bind(k, now).run();
      return;
    }
    const fails = (a.fails || 0) + 1;
    const blocked = fails >= LIMIT_MAX_FAILS ? (now + LIMIT_BLOCK_MS) : null;
    await env.DB.prepare(
      'UPDATE pair_attempts SET fails = ?, blocked_until = ? WHERE ip = ?'
    ).bind(fails, blocked, k).run();
  } catch (_) { /* limiteur indisponible → on laisse passer */ }
}

/* Entrée réussie : on efface l'ardoise, pour qu'un commerçant qui s'est
   trompé deux fois avant de réussir ne traîne pas son compteur. */
export async function limitClear(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return;
  try { await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(k).run(); } catch (_) {}
}
