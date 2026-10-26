import { DateTimeFormat } from '../_zone-law.js';
import { json } from '../../auth/_lib.js';
// Contrat interne : aucune donnée de requête ; constantes, erreurs et utilitaires purs exportés. Les erreurs restent de la même classe pour la route et les actions.

/* Les taux de TVA marocains (CGI art. 87 et 89). Une seule liste, exportée :
 * elle peut changer sans toucher au reste. 0 = exonéré (mention obligatoire). */
export const VAT_RATES = [20, 14, 10, 7, 0];
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'];
export const DOC_TYPES = ['invoice', 'credit_note', 'quote'];

const MAX_LINES = 200;
const MAX_LIST = 500;
const MAX_IMPORT = 500;
const MAX_BODY = 2000000;
const MAX_DOC_CENTS = 1e12;          // 10 milliards de dirhams : borne de bon sens
const MAX_UNIT_CENTS = 1e9;
const MAX_QTY = 1e6;
const QUOTE_VALID_DAYS = 30;
const CHUNK = 40;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ─────────────────────────── erreurs ─────────────────────────── */

class Fail extends Error {
  constructor(status, code, message, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = message || '';
    this.extra = extra || null;
  }
}
const fail = (status, code, message, extra) => new Fail(status, code, message, extra);

function failResponse(err) {
  if (err instanceof Fail) {
    return json({ error: err.code, message: err.detail, ...(err.extra || {}) }, err.status);
  }
  // Rien du message interne ne sort : il pourrait porter une requête ou une valeur.
  return json({ error: 'server-error', message: 'Erreur serveur.' }, 500);
}

/* ─────────────────────────── utilitaires ─────────────────────────── */

const str = (v, max) => String(v == null ? '' : v)
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .trim()
  .slice(0, max);

function parseJson(text, fallback) {
  try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; }
}

function validDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}
function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
function todayIn(zone) {
  try {
    return new DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (_) { return new Date().toISOString().slice(0, 10); }
}

function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return prefix + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const changesOf = (res) => Number(res && res.meta && res.meta.changes) || 0;


export { MAX_LINES, MAX_LIST, MAX_IMPORT, MAX_BODY, MAX_DOC_CENTS, MAX_UNIT_CENTS, MAX_QTY, QUOTE_VALID_DAYS, CHUNK, DAY_RE, Fail, fail, failResponse, str, parseJson, validDay, addDays, todayIn, newId, changesOf };
