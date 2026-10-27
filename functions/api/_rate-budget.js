// Un budget de requêtes RÉUSSIES par fenêtre fixe, sur la table qui le fait
// déjà pour les commandes opérationnelles (operational_rate, functions/api/
// operations.js). pair_attempts compte des ÉCHECS et s'efface au premier
// succès ; ici on compte ce qui passe : une demande de support, une commande.
//
// Les seaux portent le préfixe « limit: » pour ne jamais croiser ceux
// d'operations.js, et c'est aussi ce qui permet de les élaguer sans toucher
// aux siens.

const PRUNE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/* Compte d'abord, juge ensuite : la tentative refusée est comptée elle aussi,
   sinon marteler le plafond resterait gratuit. Lève si la base ne répond pas ;
   chaque appelant décide s'il refuse ou laisse passer. */
export async function spendBudget(env, owner, bucket, ceiling, windowMs, at = Date.now()) {
  const window = Math.floor(at / windowMs) * windowMs;
  const key = 'limit:' + String(bucket).slice(0, 120);
  const row = await env.DB.prepare(
    `INSERT INTO operational_rate (merchant, bucket, window_ts, hits) VALUES (?, ?, ?, 1)
     ON CONFLICT (merchant, bucket, window_ts) DO UPDATE SET hits = hits + 1
     RETURNING hits`
  ).bind(String(owner || '').slice(0, 64), key, window).first();
  const hits = Number((row && row.hits) || 0);
  /* Élagage occasionnel des fenêtres mortes : sans lui, un seau par adresse et
     par fenêtre s'accumule pour toujours. */
  if (Math.random() < 1 / 64) {
    try {
      await env.DB.prepare("DELETE FROM operational_rate WHERE bucket LIKE 'limit:%' AND window_ts < ?")
        .bind(at - PRUNE_AFTER_MS).run();
    } catch (_) { /* l'élagage n'est jamais une raison d'échouer */ }
  }
  return { ok: hits <= ceiling, hits, retryAfter: Math.max(1, Math.ceil((window + windowMs - at) / 1000)) };
}
