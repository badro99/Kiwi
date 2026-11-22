/* Glovo · le seul chemin de Kiwi vers l'API Partners.
 *
 * Tout appel sortant (cycle d'une commande, fermeture, menu, mises à jour en
 * lot) passe par glovoCall, qui tient les deux règles de Glovo :
 *
 *   · 120 appels par minute et par adresse de magasin, tous appels confondus
 *     (https://api-docs.glovoapp.com/partners, « Rate limit ») : un compteur
 *     par minute dans glovo_rate ; Kiwi s'arrête à RATE_CAP, avant Glovo.
 *   · « Error and retry guidance » : un 4xx ne se rejoue jamais tel quel ; un
 *     429 attend la minute suivante ; 500 et 503 se rejouent avec une attente
 *     croissante et bornée (deux reprises). Un 503 qui dure peut vouloir dire
 *     « route désactivée pour cette adresse » : il est écrit comme tel pour
 *     l'opérateur, qui contacte Glovo.
 *
 * Chaque refus s'écrit sur glovo_stores.api_err (lu par la console) ; jamais le
 * jeton, jamais un corps complet. Aucun appel ne bloque la caisse : les routes
 * l'appellent après leur réponse (waitUntil), sauf les gestes du patron qui
 * attendent explicitement la réponse de Glovo (fermer, envoyer le menu). */

export const DEFAULT_BASE = 'https://api.glovoapp.com';
export const RATE_CAP = 110;                 // sous les 120 de Glovo : la marge des relances
const RETRY_WAITS = [400, 1200];            // deux reprises, attente croissante
const TIMEOUT_MS = 8000;

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
export const glovoBase = (env) => String((env && env.GLOVO_API_BASE) || DEFAULT_BASE).replace(/\/+$/, '');

/* Une minute de plus pour cette adresse ; faux quand la minute est pleine.
 * Sans la table (base sans 0029), le compteur ne bloque rien : Glovo répondra
 * 429 lui-même, et ce 429 n'est jamais rejoué. */
export async function takeRateSlot(env, storeId, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO glovo_rate (store_id, minute, n) VALUES (?, ?, 1)
       ON CONFLICT(store_id, minute) DO UPDATE SET n = n + 1
       RETURNING n`
    ).bind(String(storeId), minute).first();
    if (minute % 10 === 0) {
      try { await env.DB.prepare('DELETE FROM glovo_rate WHERE minute < ?').bind(minute - 5).run(); } catch (_) {}
    }
    return !row || Number(row.n) <= RATE_CAP;
  } catch (_) { return true; }
}

export async function noteApiError(env, storeId, err, now = Date.now()) {
  try {
    if (err) await env.DB.prepare('UPDATE glovo_stores SET api_err = ?, api_err_ts = ? WHERE store_id = ?')
      .bind(str(err, 160), now, String(storeId)).run();
    else await env.DB.prepare('UPDATE glovo_stores SET api_err = NULL, api_err_ts = NULL WHERE store_id = ? AND api_err IS NOT NULL')
      .bind(String(storeId)).run();
  } catch (_) {}
}

/* Le texte d'un refus de Glovo, court et sans donnée client. */
async function reasonOf(res) {
  try {
    const t = await res.text();
    if (!t) return '';
    try {
      const j = JSON.parse(t);
      const e = (j && (j.error || j)) || {};
      return str(e.message || e.detail || e.code || t, 140);
    } catch (_) { return str(t, 140); }
  } catch (_) { return ''; }
}

/**
 * @param {object} env  GLOVO_TOKEN, GLOVO_API_BASE, DB
 * @param {string} storeId  l'adresse de magasin chez Glovo
 * @param {{method:string, path:string, body?:any, orderRoute?:boolean}} req
 *   orderRoute : ajoute Glovo-Store-Address-External-Id (routes /api/v0|v1/integrations/orders)
 * @param {{fetch?:Function, sleep?:Function, now?:number}} deps
 * @returns {Promise<{ok:boolean, status:number, data:any, error?:string, attempts:number}>}
 */
export async function glovoCall(env, storeId, req, deps = {}) {
  if (!env || !env.GLOVO_TOKEN) return { ok: false, status: 0, data: null, error: 'not-configured', attempts: 0 };
  const doFetch = deps.fetch || globalThis.fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now != null ? deps.now : Date.now();
  const headers = { Authorization: String(env.GLOVO_TOKEN) };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (req.orderRoute) headers['Glovo-Store-Address-External-Id'] = String(storeId);
  const url = glovoBase(env) + req.path;
  const body = req.body === undefined ? undefined : JSON.stringify(req.body);

  let attempts = 0, last = { ok: false, status: 0, data: null, error: 'network', attempts: 0 };
  for (let i = 0; i <= RETRY_WAITS.length; i++) {
    if (!(await takeRateSlot(env, storeId, now + i))) {
      last = { ok: false, status: 429, data: null, error: 'rate-local', attempts };
      break;
    }
    attempts++;
    let res;
    try {
      res = await doFetch(url, {
        method: req.method, headers, body,
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
      });
    } catch (e) {
      last = { ok: false, status: 0, data: null, error: 'network: ' + str((e && e.message) || e, 80), attempts };
      if (i < RETRY_WAITS.length) { await sleep(RETRY_WAITS[i]); continue; }
      break;
    }
    const status = Number(res && res.status) || 0;
    if (status >= 200 && status < 300) {
      let data = null;
      if (status !== 204) { try { const t = await res.text(); data = t ? JSON.parse(t) : null; } catch (_) { data = null; } }
      await noteApiError(env, storeId, null, now);
      return { ok: true, status, data, attempts };
    }
    const why = await reasonOf(res);
    if (status === 500 || status === 503) {
      last = { ok: false, status, data: null, error: (status === 503 ? 'HTTP 503 (panne ou route désactivée pour cette adresse : contacter Glovo si cela dure)' : 'HTTP 500') + (why ? ' · ' + why : ''), attempts };
      if (i < RETRY_WAITS.length) { await sleep(RETRY_WAITS[i]); continue; }
      break;
    }
    /* 4xx (429 compris) : jamais rejoué tel quel. */
    last = { ok: false, status, data: null, error: (status === 429 ? 'HTTP 429 (limite Glovo atteinte : attendre la minute suivante)' : 'HTTP ' + status) + (why ? ' · ' + why : ''), attempts };
    break;
  }
  await noteApiError(env, storeId, req.method + ' ' + req.path.replace(/\/orders\/[^/]+\//, '/orders/…/') + ' · ' + last.error, now);
  return last;
}
