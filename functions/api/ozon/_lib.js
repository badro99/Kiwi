// Ozon Express · the one place Kiwi talks to api.ozonexpress.ma.
//
// Ozon's API (client.ozoneexpress.ma/doc, read 30 Oct 2026) puts the merchant's
// customer id AND api key in the URL path:
//   POST /customers/{id}/{key}/add-parcel                  form-data
//   POST /customers/{id}/{key}/parcel-info                 tracking-number
//   POST /customers/{id}/{key}/tracking                    tracking-number, or JSON {"tracking-number":[…]}
//   POST /customers/{id}/{key}/add-delivery-note           → {ref}
//   POST /customers/{id}/{key}/add-parcel-to-delivery-note Ref, Codes[]
//   POST /customers/{id}/{key}/save-delivery-note          Ref
//   GET  /cities                                           public
// Every reply is JSON with a CHECK_API block; a bad key answers HTTP 200 with
// {"CHECK_API":{"RESULT":"ERROR","MESSAGE":"Please verify your API Key"}}.
//
// So the key is a credential that travels in a URL. It never reaches a
// browser: the routes under functions/api/ozon/ read it here, encrypted at rest
// (AES-GCM, key derived from OZON_TOKEN_KEY or AUTH_SECRET with its own label),
// and no reply, log line or error message ever carries it. Errors name the
// Ozon step, never the URL.

import { entitledMerchant } from '../../auth/_lib.js';

const API = 'https://api.ozonexpress.ma';
const PDF = 'https://client.ozoneexpress.ma';
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64ToBytes(value) { const s = atob(String(value || '')), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

async function cryptoKey(env) {
  const secret = String((env && (env.OZON_TOKEN_KEY || env.AUTH_SECRET)) || '');
  if (secret.length < 24) throw new Error('ozon-key-secret-missing');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('kiwi-ozon-api-key-v1\0' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function sealKey(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), enc.encode(String(value)));
  return `v1.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(body))}`;
}
export async function openKey(env, value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('ozon-key-format');
  const body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(parts[1]) }, await cryptoKey(env), b64ToBytes(parts[2]));
  return dec.decode(body);
}

/* The store asked for, or '' — never another one. entitledMerchant falls back
 * to the caller's own store when asked for someone else's; an Ozon action on a
 * store the caller did not name is refused instead. */
export async function exactMerchant(request, env, asked, allowTill) {
  const want = String(asked || '').slice(0, 64);
  if (!want) return '';
  const got = await entitledMerchant(request, env, want, allowTill ? { allowTill: true } : undefined);
  return got && got === want ? got : '';
}

export const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/* Ce qu'on accepte d'un commerçant : l'id client Ozon est numérique, la clé un
 * jeton sans espace ni barre (elle part dans un chemin d'URL). */
export const CUSTOMER_RE = /^\d{1,12}$/;
export const KEY_RE = /^[A-Za-z0-9._~-]{8,200}$/;

export async function readAccount(env, merchant) {
  try {
    return await env.DB.prepare('SELECT merchant, customer_id, api_key_enc, pickup_mode, connected_ts, updated_ts FROM ozon_accounts WHERE merchant = ?')
      .bind(merchant).first();
  } catch (_) { return null; }
}

/* Un appel à Ozon. `fetchImpl` est remplaçable pour les tests. Rend
 * { ok, data } ou { ok:false, error } — jamais l'URL, qui contient la clé. */
export async function ozonCall(env, account, path, body, opts = {}) {
  let key;
  try { key = await openKey(env, account.api_key_enc); } catch (_) { return { ok: false, error: 'ozon-key-unreadable' }; }
  const url = `${API}/customers/${encodeURIComponent(account.customer_id)}/${encodeURIComponent(key)}/${path}`;
  const init = { method: 'POST', headers: { Accept: 'application/json' } };
  if (body instanceof FormData) init.body = body;
  else if (body && typeof body === 'object') { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const doFetch = (env && env.__ozonFetch) || fetch;
  let res, data;
  try {
    res = await doFetch(url, { ...init, signal: AbortSignal.timeout ? AbortSignal.timeout(opts.timeoutMs || 15000) : undefined });
  } catch (_) { return { ok: false, error: 'ozon-unreachable' }; }
  try { data = await res.json(); } catch (_) { return { ok: false, error: 'ozon-bad-reply', status: res.status }; }
  const check = data && data.CHECK_API;
  if (check && String(check.RESULT || '').toUpperCase() === 'ERROR') {
    return { ok: false, error: /api\s*key/i.test(String(check.MESSAGE || '')) ? 'ozon-key-refused' : 'ozon-refused', message: String(check.MESSAGE || '').slice(0, 200) };
  }
  if (!res.ok) return { ok: false, error: 'ozon-http-' + res.status };
  return { ok: true, data };
}

/* La première réponse d'étape qui n'est pas CHECK_API, et son message
 * d'erreur éventuel (« ADD-PARCEL »: { RESULT: "ERROR", MESSAGE: … }). */
export function stepError(data) {
  if (!data || typeof data !== 'object') return '';
  for (const [k, v] of Object.entries(data)) {
    if (k === 'CHECK_API' || !v || typeof v !== 'object') continue;
    if (String(v.RESULT || '').toUpperCase() === 'ERROR') return String(v.MESSAGE || 'refusé').slice(0, 200);
  }
  return '';
}

/* Trouve, n'importe où dans la réponse, la première valeur sous l'une de ces
 * clés (Ozon nomme en majuscules avec tirets ; on tolère les variantes). */
export function pick(obj, names, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  const wanted = names.map((n) => n.toUpperCase().replace(/[_\s]/g, '-'));
  for (const [k, v] of Object.entries(obj)) {
    if (wanted.includes(k.toUpperCase().replace(/[_\s]/g, '-')) && v != null && typeof v !== 'object') return v;
  }
  for (const v of Object.values(obj)) {
    const found = pick(v, names, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* Le statut Ozon, lu par Kiwi. L'ordre compte : « Payé » l'emporte, puis les
 * fins de course (refusé, retourné, annulé), puis « livré ». Ce qui ne
 * ressemble à rien de connu reste « en cours » avec les mots d'Ozon. Seul
 * « Payé » fait entrer de l'argent (propriétaire, 30 oct. 2026). */
export function readStatus(label) {
  const f = fold(label);
  if (!f) return 'pending';
  /* Une négation d'abord, sous toutes ses formes (« non payé », « pas encore
     payé », « impayé », « unpaid », « not paid ») : de l'argent n'entre jamais
     sur un mot qui le nie. */
  if (/\b(?:non|pas|not|jamais)\s+(?:encore\s+|yet\s+)?(?:paye|payee|payes|payees|regle|reglee|paid|settled)\b|\bimpaye|\bunpaid\b|\ben attente de paiement\b|\bpaiement en attente\b/.test(f)) {
    return /\blivre|\bdelivered\b/.test(f) ? 'delivered' : 'in_transit';
  }
  if (/\b(?:paye|payee|paid|regle|reglee)\b/.test(f)) return 'paid';
  if (/\brefus/.test(f)) return 'refused';
  if (/\bretour/.test(f)) return 'returned';
  if (/\bannul/.test(f)) return 'cancelled';
  if (/\bnon livre\b/.test(f)) return 'in_transit';
  if (/\blivre\b|\blivree\b|\bdelivered\b/.test(f)) return 'delivered';
  return 'in_transit';
}
export const FINAL = new Set(['paid', 'cancelled']);

/* Les mots du statut dans une réponse de suivi, pour UN numéro. Ozon range
 * le dernier état sous LAST_TRACKING / STATUT selon les versions : on prend
 * le premier libellé trouvé. */
export function statusOf(entry) {
  const label = pick(entry, ['STATUT', 'STATUS', 'STATUT-NAME', 'STATUS-NAME', 'LAST-STATUS', 'ETAT']);
  const when = pick(entry, ['TIME', 'DATE', 'TIME-STR', 'UPDATED-AT', 'CREATED-AT']);
  let ts = 0;
  if (when != null) {
    const n = Number(when);
    ts = Number.isFinite(n) && n > 1e9 ? (n < 1e12 ? n * 1000 : n) : (Date.parse(String(when).replace(' ', 'T')) || 0);
  }
  return { label: label == null ? '' : String(label).slice(0, 80), ts };
}

/* Une réponse groupée → Map(numéro → entrée). Ozon répond soit par une table
 * indexée par numéro, soit par une liste d'objets portant le numéro. */
export function byTracking(data, asked) {
  const out = new Map();
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 5) return;
    for (const [k, v] of Object.entries(node)) {
      if (asked.includes(k) && v && typeof v === 'object') { out.set(k, v); continue; }
      if (v && typeof v === 'object') {
        const t = pick(v, ['TRACKING-NUMBER', 'TRACKING', 'CODE']);
        if (t != null && asked.includes(String(t)) && !out.has(String(t))) { out.set(String(t), v); continue; }
        visit(v, depth + 1);
      }
    }
  };
  visit(data, 0);
  if (!out.size && asked.length === 1 && data) out.set(asked[0], data);
  return out;
}

export function pdfLinks(ref) {
  const r = encodeURIComponent(String(ref || ''));
  return {
    standard: `${PDF}/pdf-delivery-note?dn-ref=${r}`,
    labelsA4: `${PDF}/pdf-delivery-note-tickets?dn-ref=${r}`,
    labels10x10: `${PDF}/pdf-delivery-note-tickets-4-4?dn-ref=${r}`,
  };
}

const cents = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
export { cents };

/* Liste publique des villes, gardée une heure dans le cache du worker. */
let CITIES = null, CITIES_TS = 0;
export async function cities(env) {
  if (CITIES && Date.now() - CITIES_TS < 3600000) return CITIES;
  const doFetch = (env && env.__ozonFetch) || fetch;
  const res = await doFetch(`${API}/cities`, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  const list = Object.values((data && data.CITIES) || {}).map((c) => ({
    id: Number(c.ID), name: String(c.NAME || '').trim(), ref: String(c.REF || ''),
    deliveredCents: cents(c['DELIVERED-PRICE']), returnedCents: cents(c['RETURNED-PRICE']), refusedCents: cents(c['REFUSED-PRICE']),
  })).filter((c) => c.id > 0 && c.name).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (list.length) { CITIES = list; CITIES_TS = Date.now(); }
  return list;
}
export function __resetCities() { CITIES = null; CITIES_TS = 0; }
