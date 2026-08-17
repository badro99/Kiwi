/* /auth/reset — le côté CLIENT de la réinitialisation de mot de passe.
 *
 *   GET  ?token=…                → { valid:true } | { valid:false, reason }
 *   POST { token, password }     → nouveau mot de passe, session ouverte
 *
 * L'envoi, lui, est déclenché par la console opérateur (functions/api/admin/
 * reset.js). Ce fichier ne connaît que le jeton : il ne sait pas à qui il a été
 * envoyé, et il ne le dit jamais.
 *
 * ── CE QUE LE JETON EST ─────────────────────────────────────────────────────
 * "<selector>.<verifier>". La base indexe `selector` et ne garde de `verifier`
 * que le HMAC (auth/_lib.js › makeResetToken / resetVerifierHash). Lire la table
 * `reset_tokens` en entier ne donne donc aucun lien utilisable — c'est la raison
 * de la découpe en deux moitiés, et c'est ce qui permet de traiter cette table
 * comme n'importe quelle autre plutôt que comme un coffre.
 *
 * ── UNE SEULE FOIS, VRAIMENT ────────────────────────────────────────────────
 * La consommation est un UPDATE conditionnel — « SET used_ts = ? WHERE selector
 * = ? AND used_ts IS NULL » — donc c'est SQLite qui arbitre, en un énoncé. Deux
 * ouvertures simultanées du même lien (le client qui double-clique, un
 * antivirus qui pré-charge l'URL de l'e-mail) ne peuvent pas réussir toutes les
 * deux : la seconde voit changes = 0 et repart en « lien déjà utilisé ».
 * Vérifier puis écrire en deux temps aurait laissé exactement cette fenêtre.
 *
 * Une réinitialisation réussie périme EN PLUS tous les autres jetons vivants du
 * compte : un client qui a demandé trois fois ne laisse pas deux clés dans la
 * nature après s'être servi de la première.
 *
 * ── CE QU'ON NE DIT PAS ─────────────────────────────────────────────────────
 * Expiré, déjà utilisé, jamais existé, malformé : une seule et même réponse
 * ('invalid'). Distinguer apprendrait à un script à reconnaître un selector
 * réel, et transformerait cette page en oracle. Aucune adresse e-mail ne sort
 * d'ici, sous aucune forme — la page ne peut donc pas servir à savoir si une
 * adresse est cliente de Kiwi.
 */

import {
  PASSWORD_MAX, json, hashPassword, makeSession, sessionCookie,
  splitResetToken, resetVerifierHash,
  limitCheck, limitFail, limitClear, passwordProblem,
} from './_lib.js';

/* Le seul motif renvoyé au monde extérieur. Voir l'en-tête : la précision
   serait une fuite, pas un service. */
const INVALID = { valid: false, reason: 'invalid' };

async function lookup(env, token) {
  const parts = splitResetToken(token);
  if (!parts) return null;
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT selector, account_id, verifier, expires_ts, used_ts FROM reset_tokens WHERE selector = ?'
    ).bind(parts.selector).first();
  } catch (_) { return null; }         /* table absente ⇒ aucun lien valide */
  if (!row) return null;
  if (row.used_ts) return null;
  if (Number(row.expires_ts) < Date.now()) return null;
  const want = await resetVerifierHash(env.AUTH_SECRET, parts.verifier);
  /* Comparaison en temps constant : la longueur est fixe (HMAC hex), et un
     test qui s'arrête au premier octet différent est mesurable. */
  if (want.length !== String(row.verifier).length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ String(row.verifier).charCodeAt(i);
  if (diff !== 0) return null;
  return row;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ valid: false, reason: 'not-configured' }, 503);
  const url = new URL(request.url);
  const row = await lookup(env, url.searchParams.get('token'));
  return row ? json({ valid: true }) : json(INVALID);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  /* Le jeton fait 24 octets de hasard : le deviner est hors de portée. Le
     limiteur est là pour le reste — un script qui pilonne l'endpoint, et le
     coût CPU du PBKDF2 qu'il déclencherait. Même compteur partagé que
     l'appairage et la connexion (auth/_lib.js), sur son propre domaine. */
  const tooMany = await limitCheck(request, env, 'reset');
  if (tooMany) return tooMany;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const password = String(body.password || '');
  let accountEmail = '';
  let accountBusiness = '';
  const row = await lookup(env, body.token);
  if (row && row.account_id) {
    try {
      const acc = await env.DB.prepare('SELECT email, business FROM accounts WHERE id = ?').bind(row.account_id).first();
      if (acc) {
        if (acc.email) accountEmail = acc.email;
        if (acc.business) accountBusiness = acc.business;
      }
    } catch (_) {}
  }
  const problem = passwordProblem(password, { email: accountEmail, business: accountBusiness });
  if (problem) return json({ error: 'weak', reason: problem }, 400);

  if (!row) { await limitFail(request, env, 'reset'); return json({ error: 'invalid' }, 400); }

  /* La consommation D'ABORD, en un énoncé conditionnel : c'est elle qui décide
     qui gagne quand deux requêtes arrivent ensemble. Si elle ne change aucune
     ligne, quelqu'un d'autre a pris le jeton entre-temps et on s'arrête ici,
     sans avoir touché au mot de passe. */
  const now = Date.now();
  try {
    const r = await env.DB.prepare(
      'UPDATE reset_tokens SET used_ts = ? WHERE selector = ? AND used_ts IS NULL'
    ).bind(now, row.selector).run();
    if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'invalid' }, 400);
  } catch (_) { return json({ error: 'invalid' }, 400); }

  const { salt, hash } = await hashPassword(password);
  try {
    const r = await env.DB.prepare('UPDATE accounts SET salt = ?, hash = ? WHERE id = ?')
      .bind(salt, hash, row.account_id).run();
    if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'invalid' }, 400);
  } catch (e) {
    return json({ error: 'update-failed' }, 500);
  }

  /* Les autres clés du compte deviennent inertes. Trois demandes en trois jours
     ne doivent pas laisser deux liens ouverts derrière celui qu'on vient
     d'utiliser. */
  try {
    await env.DB.prepare(
      'UPDATE reset_tokens SET used_ts = ? WHERE account_id = ? AND used_ts IS NULL'
    ).bind(now, row.account_id).run();
  } catch (err) {
    console.error('[reset] Failed to invalidate reset tokens for account', row.account_id);
  }

  /* « La réinitialisation a-t-elle abouti ? » — la question que la console pose
     et à laquelle rien ne répondait. On l'inscrit, sans jeton et sans adresse. */
  try {
    await env.DB.prepare(
      `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(row.account_id, '', 'reset', '', '', '', 'client', '',
           JSON.stringify({ completed: true }), now).run();
  } catch (err) {
    console.error('[reset] Failed to record account audit for reset on account', row.account_id);
  }

  await limitClear(request, env, 'reset');

  /* On ouvre la session dans la foulée : le client vient de prouver qu'il tient
     l'adresse, lui redemander de se connecter à l'écran suivant n'ajoute aucune
     sécurité et perd la moitié des gens qui viennent justement de galérer.
     La page renvoie ensuite vers le tableau de bord — l'entrée normale de Kiwi,
     celle qu'il aurait eue en se connectant. */
  const token = await makeSession(row.account_id, env.AUTH_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token),
    },
  });
}
