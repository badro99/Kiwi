// functions/api/ai/_quota.js
// Quota journalier par type d'appel AI et par établissement.
// Table ai_usage_kind : isolation par kind ('ask', 'intake', 'invoice', 'menuimport', 'index', 'resolve', 'transcribe', 'image').
//
// Deux plafonds, tous deux sur la même table (aucun schéma ajouté) :
//  1. par établissement et par type d'appel, compté sur SON jour commercial
//     (coupure 05:00 par défaut, fuseau de l'établissement) ;
//  2. un plafond global tous établissements confondus (ligne merchant = '*global*',
//     kind = 'all'), compté sur le jour UTC : l'allocation gratuite de Workers AI
//     se remet à zéro à 00:00 UTC, pas à l'heure d'un commerçant. Réglable par la
//     variable d'environnement AI_GLOBAL_DAILY_CALLS ; il compte des appels, pas
//     des neurones (un appel vision coûte bien plus qu'un appel texte), d'où une
//     valeur par défaut volontairement basse. Au plafond, tout refuse (429 quota).
import { businessDate, validZone, DEFAULT_ZONE, DEFAULT_CUTOFF } from '../_business-day.js';

export const GLOBAL_MERCHANT = '*global*';
export const GLOBAL_KIND = 'all';
export const DEFAULT_GLOBAL_DAILY_CALLS = 1000;

export const DAILY_CAPS = {
  ask: 200,
  intake: 100,
  invoice: 200,
  menuimport: 60,
  menutranslate: 120,
  salleimport: 20,
  index: 20,
  resolve: 300,
  transcribe: 100,
  image: 20,
  visioninspect: 150,
  supporttriage: 60,
};

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

export function globalDailyCap(env) {
  const raw = env && env.AI_GLOBAL_DAILY_CALLS;
  const n = Number(raw);
  return raw !== undefined && raw !== null && raw !== '' && Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_GLOBAL_DAILY_CALLS;
}

/* Le jour commercial de l'établissement : son fuseau et sa coupure, sinon
 * Maroc 05:00. Une base sans ces colonnes ou un établissement inconnu donnent
 * le défaut ; l'erreur n'ouvre jamais un quota. */
async function merchantDay(db, merchant, now = Date.now()) {
  let zone = DEFAULT_ZONE, cutoff = DEFAULT_CUTOFF;
  try {
    const row = await db.prepare('SELECT timezone, business_cutoff FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (row) {
      zone = validZone(row.timezone) || DEFAULT_ZONE;
      if (Number.isInteger(row.business_cutoff) && row.business_cutoff >= 0 && row.business_cutoff <= 12) cutoff = row.business_cutoff;
    }
  } catch (_) {}
  return businessDate(now, cutoff, zone);
}
export { merchantDay as quotaDay };

/* Un CREATE TABLE IF NOT EXISTS par isolate, pas par appel : le drapeau tombe
 * si la création échoue, et le prochain appel réessaie. */
const ensured = new WeakSet();
export async function ensureAiUsageSchema(db) {
  if (!db || typeof db.prepare !== 'function') return;
  if (ensured.has(db)) return;
  try {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS ai_usage_kind (' +
      'merchant TEXT NOT NULL, ' +
      'day TEXT NOT NULL, ' +
      'kind TEXT NOT NULL, ' +
      'calls INTEGER NOT NULL DEFAULT 0, ' +
      'PRIMARY KEY (merchant, day, kind)' +
      ')'
    ).run();
    ensured.add(db);
  } catch (_) {}
}

export async function quotaOk(env, merchant, kind, cap = 200) {
  if (!env || !env.DB || !merchant || !kind || !Number.isSafeInteger(cap) || cap < 1) return false;
  try {
    await ensureAiUsageSchema(env.DB);
    const bump = 'INSERT INTO ai_usage_kind (merchant, day, kind, calls) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT(merchant, day, kind) DO UPDATE SET calls = calls + 1 ' +
      'WHERE ai_usage_kind.calls < ? RETURNING calls';
    const day = await merchantDay(env.DB, merchant);
    const row = await env.DB.prepare(bump).bind(merchant, day, kind, cap).first();
    if (!row) return false;
    // Plafond global : s'il est atteint, l'appel du commerçant est rendu (il n'a rien consommé).
    const shared = await env.DB.prepare(bump).bind(GLOBAL_MERCHANT, utcDay(), GLOBAL_KIND, globalDailyCap(env)).first();
    if (!shared) {
      try {
        await env.DB.prepare('UPDATE ai_usage_kind SET calls = calls - 1 WHERE merchant = ? AND day = ? AND kind = ? AND calls > 0')
          .bind(merchant, day, kind).run();
      } catch (_) {}
      return false;
    }
    return true;
  } catch (_) {
    // Unavailable accounting must not authorize unbounded paid requests.
    return false;
  }
}
