// Essais de code à six chiffres (appairage d'une caisse, d'un pont
// d'impression) : on COMPTE l'essai avant de regarder le code. Vérifier
// d'abord puis compter l'échec ensuite laissait une rafale de requêtes
// simultanées passer toutes la vérification avant le premier incrément, donc
// bien plus d'essais que le plafond.
//
// Une seule instruction SQLite par compteur (pair_attempts) : l'incrément et la
// lecture du résultat sont atomiques, deux essais simultanés reçoivent deux
// rangs différents. L'essai de rang n passe tant que n <= max ; au-delà le
// compteur est bloqué BLOCK_MS. Une fenêtre écoulée remet le compte à zéro,
// mais jamais pendant un blocage (le blocage dure plus longtemps que la
// fenêtre, il ne doit pas s'effacer avec elle).

const RESERVE_SQL = `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?1, 1, ?2, NULL)
  ON CONFLICT(ip) DO UPDATE SET
    fails = CASE
      WHEN pair_attempts.blocked_until > ?2 THEN pair_attempts.fails + 1
      WHEN ?2 - pair_attempts.first_ts > ?3 THEN 1
      ELSE pair_attempts.fails + 1 END,
    first_ts = CASE
      WHEN pair_attempts.blocked_until > ?2 THEN pair_attempts.first_ts
      WHEN ?2 - pair_attempts.first_ts > ?3 THEN ?2
      ELSE pair_attempts.first_ts END,
    blocked_until = CASE
      WHEN pair_attempts.blocked_until > ?2 THEN pair_attempts.blocked_until
      WHEN ?2 - pair_attempts.first_ts > ?3 THEN NULL
      WHEN pair_attempts.fails + 1 > ?4 THEN ?2 + ?5
      ELSE pair_attempts.blocked_until END
  RETURNING fails, blocked_until`;

/** Réserve un essai sur chaque compteur. Lève si la base ne répond pas : à
 *  l'appelant de refuser (503), jamais de laisser passer.
 *  @returns {Promise<{ok: true} | {ok: false, retryAfter: number}>} */
export async function reserveAttempt(env, keys, t, { windowMs, blockMs }) {
  let wait = 0;
  for (const { key, max } of keys) {
    const row = await env.DB.prepare(RESERVE_SQL).bind(key, t, windowMs, max, blockMs).first();
    if (!row) throw new Error('attempt-not-recorded');
    const until = Number(row.blocked_until) || 0;
    if (Number(row.fails) > max || until > t) wait = Math.max(wait, Math.ceil((Math.max(until, t + 1000) - t) / 1000));
  }
  return wait ? { ok: false, retryAfter: wait } : { ok: true };
}

/** Un code juste : le compteur étroit repart de zéro ; le large rend l'essai
 *  qu'on lui avait compté (un appairage réussi n'est pas un échec du réseau),
 *  sans jamais lever un blocage en cours. */
export async function settleSuccess(env, narrowKey, wideKey) {
  try {
    if (narrowKey) await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(narrowKey).run();
    if (wideKey) {
      await env.DB.prepare(
        'UPDATE pair_attempts SET fails = MAX(fails - 1, 0) WHERE ip = ? AND blocked_until IS NULL'
      ).bind(wideKey).run();
    }
  } catch (_) { /* le compteur reste prudent : il a compté un essai de trop */ }
}
