// Kiwi · le limiteur d'essais (pair_attempts), sorti de _lib.js le 23 nov. 2026
// quand la courte pause des codes du personnel l'a fait grossir. _lib.js le
// réexporte : les routes importent toujours depuis _lib.js.
import { json, hmacHex } from './_lib.js';

/* ─────────────────────── ATTEMPT LIMITER (brute force) ───────────────────────
 * Le même compteur que l'appairage (functions/api/pair/redeem.js), rendu
 * réutilisable. Il manquait là où il compte le plus : /auth/operator, le POST
 * /__operator du middleware et /auth/login n'avaient AUCUNE limite. Un code
 * opérateur fait au minimum 4 caractères — soit ~10 000 essais pour obtenir la
 * console d'administration, c'est-à-dire les ventes, les PIN et les clients de
 * TOUS les commerçants. Sans plafond, c'est quelques minutes de script.
 *
 * On réutilise la table pair_attempts telle quelle (aucune migration) en
 * préfixant la clé par un domaine : « op|1.2.3.4 ». Sans ce préfixe un
 * appairage raté bloquerait une connexion, et l'opérateur partagerait son
 * quota avec les caisses.
 *
 * Le compteur est une dépendance d'autorisation : si la table manque ou que
 * D1 tousse, l'appelant reçoit un 503 récupérable. Un limiteur cassé ne doit
 * jamais être confondu avec une absence d'échec enregistré.
 * ───────────────────────────────────────────────────────────────────────── */
export const LIMIT_WINDOW_MS = 15 * 60 * 1000;   // fenêtre d'observation
export const LIMIT_BLOCK_MS  = 15 * 60 * 1000;   // durée du blocage
export const LIMIT_MAX_FAILS = 8;                // essais ratés tolérés par fenêtre
/* Plafond de la BOUTIQUE entière pour les codes de caisse : le double du plafond
 * d'un appareil. Les fautes de frappe d'une caissière ne comptent que sur son
 * appareil (huit essais) ; ce plafond commun arrête seulement une devinette
 * répartie sur plusieurs appareils ou adresses. */
export const LIMIT_STORE_MAX_FAILS = 16;
/* Les codes du personnel ne bloquent JAMAIS une caisse pendant un quart
 * d'heure. Le 23 novembre 2026, une tablette de Pasta Corner est restée
 * fermée 15 minutes en plein service après huit fautes de frappe des serveurs
 * (owner : « on ne peut pas faire des blocages pareils »). Passé le budget
 * gratuit, chaque nouvelle faute coûte une courte pause qui monte, 10 s, 20 s,
 * 40 s, puis 60 s au plus. Une devinette reste lente (une caisse appairée
 * plafonne vers une centaine d'essais à l'heure, contre des milliers de
 * combinaisons), et un serveur qui se trompe attend quelques secondes. */
export const PIN_COOLDOWN_MS = [10000, 20000, 40000, 60000];
/* Pas de plafond journalier qui rebloquerait des minutes : décision du patron
 * (23 Nov 2026, « no blocking »), prise après la revue sécurité qui le
 * proposait. Le ralentisseur ci-dessus est la seule limite des codes du
 * personnel, à la caisse comme au tableau de bord. */

/* Un compteur rattaché à la CIBLE, pas seulement à la source. Sans lui, un
 * attaquant change d'adresse IP et repart à zéro sur le même compte ; avec lui,
 * la cible garde son propre plafond quoi qu'il arrive. On range une empreinte
 * tronquée et non l'adresse elle-même : `pair_attempts` ne doit pas devenir un
 * annuaire des e-mails des employés. Ce n'est pas un secret, seulement une clé. */
export async function targetKey(authSecret, kind, value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || !authSecret) return '';
  return kind + ':' + (await hmacHex(authSecret, 'kiwi-limiter-v1:' + kind + ':' + v)).slice(0, 16);
}

function limiterKey(request, scope, identity = '') {
  if (identity) return `${scope}|${identity}`;
  const ip = request.headers.get('CF-Connecting-IP')
          || request.headers.get('X-Forwarded-For')
          || '';
  return ip ? `${scope}|${ip}` : '';
}

/* Déjà bloqué ? Vérifié AVANT de regarder le code, pour qu'une entrée
   malformée ne serve pas de sonde gratuite. Renvoie une Response 429 à
   retourner telle quelle, ou null si la voie est libre. */
export async function limitCheck(request, env, scope, identity = '') {
  const k = limiterKey(request, scope, identity);
  if (!k) return null;
  if (!env || !env.DB) return rateLimitUnavailable();
  try {
    const a = await env.DB.prepare(
      'SELECT blocked_until FROM pair_attempts WHERE ip = ?'
    ).bind(k).first();
    const now = Date.now();
    if (a && a.blocked_until && a.blocked_until > now) {
      return json({ error: 'too_many_attempts', retry_after: Math.ceil((a.blocked_until - now) / 1000) }, 429);
    }
  } catch (_) { return rateLimitUnavailable(); }
  return null;
}

/* Un essai raté de plus. Fenêtre glissante par redémarrage : passé
   LIMIT_WINDOW_MS la ligne repart à 1, donc elle expire d'elle-même. */
export async function limitFail(request, env, scope, identity = '', maxFails = LIMIT_MAX_FAILS, ladder = null, windowMs = LIMIT_WINDOW_MS) {
  const k = limiterKey(request, scope, identity);
  if (!k) return true;
  if (!env || !env.DB) return false;
  const now = Date.now();
  /* Durée du blocage selon le rang de la faute au-delà du budget : la même
     pour tous (15 min) sauf si l'appelant passe une échelle courte. */
  const L = Array.isArray(ladder) && ladder.length ? ladder : [LIMIT_BLOCK_MS];
  const steps = [0, 1, 2, 3].map((i) => L[Math.min(i, L.length - 1)]);
  try {
    /* One SQLite statement owns the increment. A read followed by an UPDATE
     * lets concurrent failed guesses overwrite one another and undercount. */
    const result = await env.DB.prepare(
      `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
       ON CONFLICT(ip) DO UPDATE SET
         fails = CASE WHEN ? - pair_attempts.first_ts > ? THEN 1 ELSE pair_attempts.fails + 1 END,
         first_ts = CASE WHEN ? - pair_attempts.first_ts > ? THEN ? ELSE pair_attempts.first_ts END,
         blocked_until = CASE
           WHEN ? - pair_attempts.first_ts > ? THEN NULL
           WHEN pair_attempts.fails + 1 >= ? THEN ? + CASE pair_attempts.fails + 1 - ?
             WHEN 0 THEN ? WHEN 1 THEN ? WHEN 2 THEN ? ELSE ? END
           ELSE pair_attempts.blocked_until END`
    ).bind(k, now, now, windowMs, now, windowMs, now,
           now, windowMs, maxFails, now, maxFails, ...steps).run();
    const changes = Number(result && result.meta && result.meta.changes);
    return Number.isFinite(changes) ? changes > 0 : true;
  } catch (_) { return false; }
}

/* Entrée réussie : on efface l'ardoise, pour qu'un commerçant qui s'est
   trompé deux fois avant de réussir ne traîne pas son compteur. */
export async function limitClear(request, env, scope, identity = '') {
  const k = limiterKey(request, scope, identity);
  if (!k) return true;
  if (!env || !env.DB) return false;
  try { await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(k).run(); return true; } catch (_) { return false; }
}

/* ── RÉSERVER L'ESSAI AVANT DE COMPARER LE CODE (codes du personnel) ──────
 * Vérifier la pause, comparer, PUIS compter laissait une rafale de requêtes
 * parallèles, lancée à la fin d'une pause, passer toute la vérification avant
 * qu'une seule faute soit inscrite (revue sécurité du 23 Nov 2026). Ici une
 * seule instruction SQLite compte l'essai ET refuse s'il tombe pendant une
 * pause : l'essai est réservé avant la comparaison, la rafale est sérialisée
 * par la base. Un bon code rend ensuite sa réservation (limitRelease) : le
 * compteur ne retient que les fautes, et un code juste ne peut jamais effacer
 * les fautes d'avant (l'alternance sept faux / un vrai reste comptée).
 * Aucun blocage long : la pause est celle de l'échelle passée par l'appelant.
 * Renvoie { ok:true, key, until } ou { ok:false, response } (429 ou 503). */
export async function limitReserve(request, env, scope, identity = '', maxFails = LIMIT_MAX_FAILS, ladder = null) {
  const k = limiterKey(request, scope, identity);
  if (!k) return { ok: true, key: '', until: null };
  if (!env || !env.DB) return { ok: false, response: rateLimitUnavailable() };
  const now = Date.now();
  const L = Array.isArray(ladder) && ladder.length ? ladder : [LIMIT_BLOCK_MS];
  const steps = [0, 1, 2, 3].map((i) => L[Math.min(i, L.length - 1)]);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until)
         VALUES (?, 1, ?, CASE WHEN 1 >= ? THEN ? + ? ELSE NULL END)
       ON CONFLICT(ip) DO UPDATE SET
         fails = CASE WHEN ? - pair_attempts.first_ts > ? THEN 1 ELSE pair_attempts.fails + 1 END,
         first_ts = CASE WHEN ? - pair_attempts.first_ts > ? THEN ? ELSE pair_attempts.first_ts END,
         blocked_until = CASE
           WHEN ? - pair_attempts.first_ts > ? THEN NULL
           WHEN pair_attempts.fails + 1 >= ? THEN ? + CASE pair_attempts.fails + 1 - ?
             WHEN 0 THEN ? WHEN 1 THEN ? WHEN 2 THEN ? ELSE ? END
           ELSE NULL END
       WHERE pair_attempts.blocked_until IS NULL OR pair_attempts.blocked_until <= ?
       RETURNING blocked_until`
    ).bind(k, now, maxFails, now, steps[0],
           now, LIMIT_WINDOW_MS, now, LIMIT_WINDOW_MS, now,
           now, LIMIT_WINDOW_MS, maxFails, now, maxFails, ...steps, now).first();
    if (row) return { ok: true, key: k, until: row.blocked_until == null ? null : Number(row.blocked_until) };
    /* Aucune ligne rendue : la pause en cours a refusé l'essai. */
    const a = await env.DB.prepare('SELECT blocked_until FROM pair_attempts WHERE ip = ?').bind(k).first();
    const wait = a && a.blocked_until ? Math.max(1, Math.ceil((a.blocked_until - now) / 1000)) : 1;
    return { ok: false, response: json({ error: 'too_many_attempts', retry_after: wait }, 429) };
  } catch (_) { return { ok: false, response: rateLimitUnavailable() }; }
}

/* Rend une réservation : le code était juste (ou la vérification n'a pas pu
 * se faire). Retire l'essai compté et la pause qu'il aurait posée lui-même,
 * jamais une pause posée par une autre faute. */
export async function limitRelease(env, res) {
  if (!res || !res.ok || !res.key || !env || !env.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE pair_attempts SET fails = MAX(fails - 1, 0),
         blocked_until = CASE WHEN ? IS NOT NULL AND blocked_until = ? THEN NULL ELSE blocked_until END
       WHERE ip = ?`
    ).bind(res.until, res.until, res.key).run();
  } catch (_) {}
}

export function rateLimitUnavailable() {
  return json({ error: 'rate-limit-unavailable' }, 503);
}
