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
//  3. une part du plafond global par établissement, tous types confondus (kind = 'all'
//     sous le nom de l'établissement), comptée elle aussi sur le jour UTC : un seul
//     établissement ne peut pas épuiser le budget de tous, et changer de fuseau ne
//     lui rend aucun appel. Variable AI_MERCHANT_DAILY_CALLS, par défaut un quart du global.
import { businessDate, validZone, DEFAULT_ZONE, DEFAULT_CUTOFF } from '../_business-day.js';

export const GLOBAL_MERCHANT = '*global*';
export const GLOBAL_KIND = 'all';
export const DEFAULT_GLOBAL_DAILY_CALLS = 1000;

/* Le plafond du jour de chaque type d'appel. Une seule table : toute route AI
 * lit son plafond ici (clé = le `kind` passé à quotaOk), jamais un nombre écrit
 * dans le fichier de la route. */
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
  campaign: 60,
  product: 150,
  reservation: 200,
  prepforecast: 60,
  menurank: 200,
  audioorder: 150,
  pressing: 150,
  recipe: 100,
  menuoperations: 60,
  debrief: 100,
  productenhance: 100,
  tpe: 100,
  expense: 200,
  watchdog: 100,
  invoicematch: 150,
  planning: 60,
};

/* Le message d'un plafond atteint, dit simplement dans les trois langues de
 * l'interface : c'est temporaire, le compteur repart au prochain jour commercial. */
export const QUOTA_MESSAGES = {
  fr: "Limite du jour atteinte pour Kiwi AI. Réessayez demain.",
  en: 'Daily Kiwi AI limit reached. Try again tomorrow.',
  ar: 'تم بلوغ الحد اليومي لـ Kiwi AI. حاول غدًا.',
};

/* Le corps JSON d'un plafond atteint (à servir avec le statut 429). `error`
 * garde le code historique de la route (« quota » ou « daily-quota-exceeded »),
 * pour que les clients déjà déployés lisent la même chose ; s'y ajoutent le
 * plafond, le type d'appel et la phrase en FR/EN/AR que l'interface peut
 * afficher telle quelle, au lieu d'un « quota » nu. */
export function quotaBody(kind, error = 'quota') {
  return { ok: false, error, kind, cap: DAILY_CAPS[kind] || null, message: { ...QUOTA_MESSAGES } };
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

export function globalDailyCap(env) {
  const raw = env && env.AI_GLOBAL_DAILY_CALLS;
  const n = Number(raw);
  return raw !== undefined && raw !== null && raw !== '' && Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_GLOBAL_DAILY_CALLS;
}

export function merchantDailyShare(env) {
  const raw = env && env.AI_MERCHANT_DAILY_CALLS;
  const n = Number(raw);
  const global = globalDailyCap(env);
  const share = raw !== undefined && raw !== null && raw !== '' && Number.isSafeInteger(n) && n >= 1 ? n : Math.ceil(global / 4);
  return Math.min(share, global);
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
    // Part de l'établissement puis plafond global : si l'un est atteint, les compteurs
    // déjà pris sont rendus (l'appel n'a rien consommé).
    const undo = async (m, d, k) => {
      try {
        await env.DB.prepare('UPDATE ai_usage_kind SET calls = calls - 1 WHERE merchant = ? AND day = ? AND kind = ? AND calls > 0')
          .bind(m, d, k).run();
      } catch (_) {}
    };
    const today = utcDay();
    const mine = await env.DB.prepare(bump).bind(merchant, today, GLOBAL_KIND, merchantDailyShare(env)).first();
    if (!mine) { await undo(merchant, day, kind); return false; }
    const shared = await env.DB.prepare(bump).bind(GLOBAL_MERCHANT, today, GLOBAL_KIND, globalDailyCap(env)).first();
    if (!shared) { await undo(merchant, today, GLOBAL_KIND); await undo(merchant, day, kind); return false; }
    return true;
  } catch (_) {
    // Unavailable accounting must not authorize unbounded paid requests.
    return false;
  }
}
