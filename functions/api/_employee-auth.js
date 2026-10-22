/* Révision de connexion d'un employé, écrite DANS le même lot que le miroir
 * d'accès qui la porte.
 *
 * Deux routes réécrivent le miroir `employee-access` : la publication des codes
 * (config.js) et l'enregistrement du document team (store.js). Une connexion
 * n'est valide que si la révision du miroir égale la révision durable
 * (employee_auth_versions). Jusqu'au 22 octobre 2026 chaque route montait la
 * révision durable AVANT d'écrire le miroir : un lot qui échouait (révision du
 * document perdue, écriture refusée) laissait la révision montée et le miroir
 * ancien, et deux enregistrements simultanés aux codes différents pouvaient
 * laisser le miroir de l'un face à la révision de l'autre. Dans les deux cas
 * l'employé ne se connectait plus, ni avec l'ancien code ni avec le nouveau.
 *
 * Désormais : on PRÉVOIT la révision (lecture), on l'écrit dans le lot, et la
 * première instruction du lot vérifie que rien n'a bougé dans la table depuis la
 * lecture (empreinte : nombre de lignes et somme des révisions, qui ne font que
 * monter). Sinon le lot échoue entier et la route recommence sur l'état neuf. */

const MOVED = 'employee-auth-moved';

async function pinDigest(merchant, memberId, pin) {
  const text = `${String(merchant || '')}\u0000${String(memberId || '')}\u0000${String(pin || '')}`;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}

export async function authFingerprint(env, merchant) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) || ':' || COALESCE(SUM(auth_version), 0) AS fp FROM employee_auth_versions WHERE merchant = ?"
  ).bind(merchant).first();
  return String((row && row.fp) || '0:0');
}

/* Première instruction du lot : json() sur un texte qui n'en est pas lève une
 * erreur, et D1 annule alors le lot entier. */
export function authSentinel(env, merchant, fingerprint) {
  return env.DB.prepare(
    `SELECT json(CASE WHEN (SELECT COUNT(*) || ':' || COALESCE(SUM(auth_version), 0)
                              FROM employee_auth_versions WHERE merchant = ?) = ?
                      THEN '1' ELSE '${MOVED}' END) AS ok`
  ).bind(merchant, fingerprint);
}

/* La révision qu'aura ce membre une fois le lot passé : la même si son code n'a
 * pas changé, +1 s'il a changé, `fallback` s'il n'a encore aucune ligne. */
export async function planEmployeeAuth(env, merchant, memberId, pin, fallback = 0) {
  const digest = await pinDigest(merchant, memberId, pin);
  try {
    const row = await env.DB.prepare(
      'SELECT auth_version, pin_digest FROM employee_auth_versions WHERE merchant = ? AND member_id = ?'
    ).bind(merchant, memberId).first();
    if (!row) return { ok: true, memberId, digest, version: Math.max(0, Math.round(Number(fallback) || 0)) };
    const current = Number(row.auth_version);
    if (!Number.isInteger(current) || current < 0) return { ok: false };
    return { ok: true, memberId, digest, version: current + (row.pin_digest === digest ? 0 : 1) };
  } catch (_) { return { ok: false }; }
}

/* L'écriture prévue. `guard` (SQL + valeurs) la limite au cas où le miroir de
 * ce lot a bien été écrit : un lot dont le document perd sa révision ne touche
 * pas non plus aux révisions. */
export function writeEmployeeAuth(env, merchant, plan, now, guard) {
  return env.DB.prepare(
    `INSERT INTO employee_auth_versions (merchant, member_id, auth_version, pin_digest, updated_ts)
     SELECT ?, ?, ?, ?, ? WHERE ${guard.sql}
     ON CONFLICT(merchant, member_id) DO UPDATE SET
       auth_version = excluded.auth_version,
       pin_digest = excluded.pin_digest,
       updated_ts = excluded.updated_ts`
  ).bind(merchant, plan.memberId, plan.version, plan.digest, now, ...guard.binds);
}

export function authMoved(error) {
  return /malformed JSON|employee-auth-moved/i.test(String((error && error.message) || error || ''));
}
