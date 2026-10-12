/* /auth/forgot — « Mot de passe oublié ? », côté demande.
 *
 *   POST { email }  → TOUJOURS la même réponse neutre, que l'adresse soit
 *                     cliente de Kiwi ou non : { ok:true, mail:<bool> }
 *
 * C'est la moitié manquante de /auth/reset : celui-ci sait consommer un jeton,
 * mais seule la console opérateur (api/admin/reset.js) savait en fabriquer un.
 * Un commerçant qui a perdu son mot de passe n'a ni session ni opérateur sous la
 * main un dimanche soir ; ce fichier lui donne la même clé, par la même
 * mécanique (auth/_lib.js › makeResetToken, table reset_tokens, sendMail), sans
 * rien changer à la façon dont elle est consommée.
 *
 * ── PAS D'ORACLE ────────────────────────────────────────────────────────────
 * Adresse connue, inconnue, compte suspendu, envoi refusé, délai de renvoi pas
 * encore écoulé : une seule réponse, mêmes octets. Le champ `mail` dit si Kiwi a
 * UNE SORTIE E-MAIL (une propriété du déploiement, pas du compte) ; il permet à
 * la page d'être honnête (« nous vous écrivons » seulement si c'est vrai, sinon
 * « contactez le support »). Il ne dépend jamais de l'adresse saisie.
 * Le travail réel (écriture D1, appel du webhook) part dans waitUntil : la
 * réponse n'attend pas l'e-mail, donc sa durée ne distingue pas non plus les
 * deux cas.
 *
 * ── LIMITEURS ───────────────────────────────────────────────────────────────
 * Chaque DEMANDE compte, réussie ou non (limitFail est ici un compteur de
 * tentatives) : par source (IP) et par cible (empreinte de l'adresse, qu'elle
 * existe ou non — sinon le 429 deviendrait l'oracle). Huit par quinze minutes,
 * comme la connexion. S'y ajoute un délai de renvoi par compte (RESEND_MS) : un
 * lien vivant tout récent suffit, pas besoin d'en fabriquer un autre.
 *
 * ── LES JETONS ──────────────────────────────────────────────────────────────
 * Une heure, une seule fois, haché côté base (voir reset.js). Contrairement à la
 * console, on ne périme PAS le lien précédent en en émettant un nouveau : un
 * tiers qui saisirait votre adresse en boucle ne doit pas pouvoir invalider le
 * lien que vous êtes en train d'ouvrir. Le premier usage réussi périme tous les
 * autres (reset.js), et le délai de renvoi borne leur nombre.
 *
 * Sans MAIL_WEBHOOK on ne fabrique AUCUN jeton : un lien qui ne part pas ne sert
 * à personne. Le jeton complet n'existe qu'en mémoire, le temps d'écrire
 * l'e-mail ; il n'est ni renvoyé, ni journalisé, ni stocké.
 */

import {
  json, normEmail, sendMail, makeResetToken, resetVerifierHash, maskEmail,
  limitCheck, limitFail, targetKey, rateLimitUnavailable,
} from './_lib.js';

const TTL_MS = 60 * 60 * 1000;            /* validité du lien : une heure */
const RESEND_MS = 2 * 60 * 1000;   /* délai avant un nouveau lien pour le même compte */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function issue(env, request, email) {
  let acc;
  try {
    acc = await env.DB.prepare('SELECT id, name, business, status FROM accounts WHERE email = ?').bind(email).first();
  } catch (_) { return; }
  if (!acc) return;
  if (acc.status && acc.status !== 'active') return;   /* gelé : l'opérateur décide */

  const now = Date.now();
  try {
    const last = await env.DB.prepare(
      'SELECT created_ts FROM reset_tokens WHERE account_id = ? ORDER BY created_ts DESC LIMIT 1'
    ).bind(acc.id).first();
    if (last && Number(last.created_ts) + RESEND_MS > now) return;
  } catch (_) { return; }                               /* table absente ⇒ rien ne part */

  const { selector, verifier, token } = makeResetToken();
  const verifierHash = await resetVerifierHash(env.AUTH_SECRET, verifier);
  try {
    await env.DB.prepare(
      `INSERT INTO reset_tokens (selector, account_id, verifier, created_ts, expires_ts, used_ts, actor, actor_id)
       VALUES (?,?,?,?,?,NULL,?,?)`
    ).bind(selector, acc.id, verifierHash, now, now + TTL_MS, 'client', '').run();
  } catch (_) { return; }

  const origin = new URL(request.url).origin;
  const link = origin + '/reset.html?token=' + encodeURIComponent(token);
  const who = acc.business || acc.name || 'votre commerce';
  const sent = await sendMail(env, {
    to: email,
    subject: 'Kiwi · réinitialiser votre mot de passe',
    text: 'Bonjour,\n\nVoici le lien pour choisir un nouveau mot de passe Kiwi pour ' + who + ' :\n\n' +
          link + '\n\n' +
          'Ce lien est valable une heure et ne fonctionne qu’une fois.\n' +
          'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.\n\n' +
          '·L’équipe Kiwi',
  });
  /* Parti nulle part : le jeton ne sert à personne, on le retire. */
  if (!sent.ok) {
    try { await env.DB.prepare('DELETE FROM reset_tokens WHERE selector = ?').bind(selector).run(); } catch (_) {}
  }
  try {
    await env.DB.prepare(
      `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(acc.id, '', 'reset', '', maskEmail(email), '', 'client', '',
           JSON.stringify({ requested: 'self-serve', delivery: sent.ok ? 'sent' : ('failed:' + sent.reason), expires: now + TTL_MS }),
           now).run();
  } catch (_) {}
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const email = normEmail(body && body.email);
  /* Une adresse mal formée, c'est une faute de frappe, pas une sonde : on le dit
     (ça ne révèle rien sur les comptes) et on ne compte pas l'essai. */
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'bad-email' }, 400);

  const blocked = await limitCheck(request, env, 'forgot');
  if (blocked) return blocked;
  const target = await targetKey(env.AUTH_SECRET, 'forgot', email);
  const blockedTarget = target ? await limitCheck(request, env, 'forgot', target) : null;
  if (blockedTarget) return blockedTarget;
  const sourceOk = await limitFail(request, env, 'forgot');
  const targetOk = !target || await limitFail(request, env, 'forgot', target);
  if (!sourceOk || !targetOk) return rateLimitUnavailable();

  const mail = !!env.MAIL_WEBHOOK;
  if (mail) {
    const work = issue(env, request, email).catch(() => {});
    if (typeof context.waitUntil === 'function') context.waitUntil(work);
    else await work;
  }
  return json({ ok: true, mail });
}
