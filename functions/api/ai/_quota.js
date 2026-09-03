// functions/api/ai/_quota.js
// Quota journalier par type d'appel AI et par établissement.
// Table ai_usage_kind : isolation par kind ('ask', 'intake', 'invoice', 'menuimport', 'index', 'resolve', 'transcribe', 'image').

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
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* Un CREATE TABLE IF NOT EXISTS par isolate, pas par appel : le drapeau tombe
 * si la création échoue, et le prochain appel réessaie. */
let ensured = false;
export async function ensureAiUsageSchema(db) {
  if (!db || typeof db.prepare !== 'function') return;
  if (ensured) return;
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
    ensured = true;
  } catch (_) {}
}

export async function quotaOk(env, merchant, kind, cap = 200) {
  if (!env || !env.DB) return true;
  try {
    await ensureAiUsageSchema(env.DB);
    const day = today();
    const row = await env.DB.prepare(
      'SELECT calls FROM ai_usage_kind WHERE merchant = ? AND day = ? AND kind = ?'
    ).bind(merchant, day, kind).first();
    if (row && row.calls >= cap) return false;
    await env.DB.prepare(
      'INSERT INTO ai_usage_kind (merchant, day, kind, calls) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT(merchant, day, kind) DO UPDATE SET calls = calls + 1'
    ).bind(merchant, day, kind).run();
    return true;
  } catch (_) {
    // fail-soft : si D1 ou la table est indisponible, on ne bloque pas
    return true;
  }
}
