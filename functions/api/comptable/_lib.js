// Espace comptable · socle commun (cookie, table, jeton).
//
// L'expert-comptable d'un commerçant n'a PAS de compte Kiwi. Il reçoit un lien
// que le propriétaire a créé (functions/api/comptable/access.js), l'échange une
// fois contre un cookie (session.js) et lit les livres d'UN établissement, en
// lecture seule (books.js).
//
// Règle de cloisonnement, la seule qui compte ici : le cookie `kiwi_acct` n'est
// honoré que par functions/api/comptable/books.js. Il n'entre dans AUCUNE des
// fonctions qui décident d'un locataire (tenantFor, entitledMerchant, isTillFor,
// les opérateurs…) : rien d'autre ne le lit, et son Path le garde hors de toute
// autre route de l'application.
//
// Un fichier préfixé `_` n'est pas routé ; il est seulement importé.

import { readCookie, json } from '../../auth/_lib.js';

export const ACCT_COOKIE = 'kiwi_acct';
export const ACCT_PATH = '/api/comptable';
export const DEFAULT_EXPIRY_DAYS = 365;
export const MAX_EXPIRY_DAYS = 730;
export const MAX_ACTIVE_PER_STORE = 10;
const COOKIE_MAX_AGE_S = 90 * 86400;
const SEEN_EVERY_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

const ACCESS_DDL = `CREATE TABLE IF NOT EXISTS accountant_access (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  label        TEXT,
  email        TEXT,
  token_hash   TEXT NOT NULL UNIQUE,
  created_ts   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,
  last_seen_ts INTEGER,
  revoked_ts   INTEGER,
  expires_ts   INTEGER NOT NULL)`;
const ACCESS_INDEX = 'CREATE INDEX IF NOT EXISTS idx_accountant_access_merchant ON accountant_access (merchant, created_ts)';

/* La production a toujours du retard sur schema.sql : la table se crée au
 * premier usage (même démarche que ensureTillDevices). */
const ensured = new WeakSet();
export async function ensureAccountantAccess(env) {
  if (!env || !env.DB) return false;
  if (ensured.has(env.DB)) return true;
  try {
    await env.DB.prepare(ACCESS_DDL).run();
    await env.DB.prepare(ACCESS_INDEX).run();
    ensured.add(env.DB);
    return true;
  } catch (_) { return false; }
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 32 octets aléatoires, base64url : 43 caractères. */
export function newToken() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
export function newAccessId() { return 'ca_' + b64url(crypto.getRandomValues(new Uint8Array(12))); }
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const ACCESS_ID_RE = /^ca_[A-Za-z0-9_-]{16}$/;

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(text))));
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Valeur du cookie : "<id>.<HMAC(secret, id)>". Elle ne contient pas le jeton
 * du lien (qui ne vit que dans le fragment et dans le presse-papiers du
 * propriétaire) ; la révocation est vérifiée en base à CHAQUE requête. */
export async function accountantCookieValue(secret, accessId) {
  return accessId + '.' + (await hmacHex(secret, 'kiwi-acct-v1:' + accessId));
}
export function accountantCookie(value, maxAgeS) {
  const age = Math.max(0, Math.min(COOKIE_MAX_AGE_S, Math.floor(maxAgeS || COOKIE_MAX_AGE_S)));
  return `${ACCT_COOKIE}=${value}; Path=${ACCT_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
export function clearAccountantCookie() {
  return `${ACCT_COOKIE}=; Path=${ACCT_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function accessStatus(row, now = Date.now()) {
  if (row.revoked_ts) return 'revoked';
  if (Number(row.expires_ts) <= now) return 'expired';
  return 'active';
}

/* Qui lit ? Renvoie { access } ou { response } (401/503 à rendre tel quel). */
export async function authAccountant(request, env) {
  if (!env || !env.DB || !env.AUTH_SECRET) return { response: json({ error: 'not-configured' }, 503) };
  const raw = readCookie(request, ACCT_COOKIE);
  const dot = raw ? raw.lastIndexOf('.') : -1;
  if (!raw || dot <= 0) return { response: json({ error: 'unauthenticated' }, 401) };
  const id = raw.slice(0, dot);
  if (!ACCESS_ID_RE.test(id)) return { response: json({ error: 'unauthenticated' }, 401) };
  const want = await hmacHex(env.AUTH_SECRET, 'kiwi-acct-v1:' + id);
  if (!safeEqual(raw.slice(dot + 1), want)) return { response: json({ error: 'unauthenticated' }, 401) };
  await ensureAccountantAccess(env);
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT id, merchant, label, created_ts, last_seen_ts, revoked_ts, expires_ts FROM accountant_access WHERE id = ?'
    ).bind(id).first();
  } catch (_) { return { response: json({ error: 'unavailable' }, 503) }; }
  if (!row) return { response: json({ error: 'unauthenticated' }, 401, { 'Set-Cookie': clearAccountantCookie() }) };
  const status = accessStatus(row);
  /* Révoqué ou expiré : on garde le cookie, il n'ouvre plus rien, et la page peut
   * continuer de dire POURQUOI (lien désactivé, lien expiré) au lieu d'un lien « invalide ». */
  if (status !== 'active') return { response: json({ error: status }, 401) };
  const now = Date.now();
  if (!row.last_seen_ts || now - Number(row.last_seen_ts) > SEEN_EVERY_MS) {
    try { await env.DB.prepare('UPDATE accountant_access SET last_seen_ts = ? WHERE id = ?').bind(now, id).run(); } catch (_) {}
  }
  return { access: { id: row.id, merchant: String(row.merchant), label: row.label || '', expiresTs: Number(row.expires_ts) } };
}
