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
