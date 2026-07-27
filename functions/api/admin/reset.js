/* /api/admin/reset — envoyer au client un lien de réinitialisation (console).
 *
 *   GET  ?accountId=…            → l'état : dernier envoi, prochain envoi possible
 *   POST { accountId, merchant } → fabrique un lien et l'envoie AU CLIENT
 *
 * ── CE QUE L'OPÉRATEUR PEUT, ET NE PEUT PAS ─────────────────────────────────
 * Il peut déclencher l'envoi. Il ne voit jamais le mot de passe existant — il
 * n'existe nulle part en clair, seulement un PBKDF2 (auth/_lib.js) — et il ne
 * peut pas en choisir un à la place du client : aucun chemin de ce fichier
 * n'écrit dans accounts.salt/hash. Le seul geste disponible est « envoyer le
 * lien à l'adresse du compte ».
 *
 * Et il ne voit pas le lien non plus. C'est délibéré, et c'est la décision
 * structurante de ce fichier : la réponse ne contient que « parti / pas parti ».
 * Un lien affiché dans la console serait une prise de contrôle en un clic pour
 * quiconque ouvre God mode, et le dicter au téléphone reviendrait exactement au
 * même que choisir le mot de passe du client. Le lien va à l'adresse du compte,
 * ou il ne part pas.
 *
 * ── LE DÉLAI ────────────────────────────────────────────────────────────────
 * Chaque envoi périme le précédent (le client ne doit avoir qu'une clé vivante),
 * donc renvoyer en boucle INVALIDE en boucle le lien que le client est peut-être
 * en train d'ouvrir. C'est le vrai risque ici, plus que le spam : un opérateur
 * pressé qui reclique trois fois pendant que le client lit son e-mail l'enferme
 * dehors. D'où RESEND_MS, et surtout d'où le fait que la console affiche
 * l'heure du dernier envoi et celle du prochain autorisé plutôt qu'un bouton
 * grisé sans explication.
 */

import {
  isOperator, isSeniorOperator, operatorActor, json, maskEmail, sendMail,
  makeResetToken, resetVerifierHash,
} from '../../auth/_lib.js';

const TTL_MS = 60 * 60 * 1000;      /* validité du lien : une heure */
const RESEND_MS = 5 * 60 * 1000;    /* délai avant un nouvel envoi */

async function guard(context, senior) {
  if (!(await isOperator(context.request, context.env))) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  if (senior && !(await isSeniorOperator(context.request, context.env))) {
    return json({ error: 'operator-code-required' }, 403);
  }
  return null;
}

async function lastToken(env, accountId) {
  try {
    return await env.DB.prepare(
      `SELECT created_ts, expires_ts, used_ts, actor FROM reset_tokens
        WHERE account_id = ? ORDER BY created_ts DESC LIMIT 1`).bind(accountId).first();
  } catch (_) { return null; }
}

function stateOf(last) {
  const now = Date.now();
  const created = Number((last && last.created_ts) || 0);
  const nextAllowed = created ? created + RESEND_MS : 0;
  return {
    lastSent: created,
    used: Number((last && last.used_ts) || 0),
    expires: Number((last && last.expires_ts) || 0),
    live: !!(last && !last.used_ts && Number(last.expires_ts) > now),
    canSend: !created || now >= nextAllowed,
    nextAllowed,
    retryAfter: created && now < nextAllowed ? Math.ceil((nextAllowed - now) / 1000) : 0,
  };
}

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const url = new URL(context.request.url);
  const accountId = (url.searchParams.get('accountId') || '').trim();
  if (!accountId) return json({ error: 'account-required' }, 400);
  return json({ ...stateOf(await lastToken(context.env, accountId)), mail: !!context.env.MAIL_WEBHOOK });
}

export async function onRequestPost(context) {
  const bad = await guard(context, true); if (bad) return bad;
  const { env } = context;

  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const accountId = (body.accountId || '').toString().trim();
  if (!accountId) return json({ error: 'account-required' }, 400);
  const merchant = (body.merchant || '').toString().trim().slice(0, 64);

  let acc;
  try {
    acc = await env.DB.prepare('SELECT id, email, name, business FROM accounts WHERE id = ?')
      .bind(accountId).first();
  } catch (e) {
    return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
  }
  if (!acc) return json({ error: 'not-found' }, 404);
  /* L'adresse de destination est celle du COMPTE, lue ici. Elle n'est jamais
     prise dans la requête : un paramètre `to` ferait de cet endpoint un moyen
     d'envoyer un lien de réinitialisation valide vers une boîte choisie par
     l'appelant, ce qui est la définition d'une prise de contrôle. */
  const to = String(acc.email || '');
  if (!to) return json({ error: 'no-email' }, 409);

  const state = stateOf(await lastToken(env, accountId));
  if (!state.canSend) return json({ error: 'too-soon', ...state }, 429);

  /* Sans sortie e-mail, on ne fabrique AUCUN jeton : créer un lien qui ne part
     pas périmerait le précédent (voir plus bas) sans rien donner au client —
     c'est-à-dire lui retirer sa clé pour la jeter. On répond, on l'explique, on
     ne touche à rien. */
  if (!env.MAIL_WEBHOOK) {
    return json({ error: 'mail-unconfigured', ...state, to: maskEmail(to) }, 503);
  }

  const { selector, verifier, token } = makeResetToken();
  const verifierHash = await resetVerifierHash(env.AUTH_SECRET, verifier);
  const now = Date.now();
  const actor = await operatorActor(context.request, env);

  /* Les liens vivants du compte tombent avant qu'on en émette un nouveau : un
     seul lien valide à la fois, celui qu'on vient d'envoyer. */
  try {
    await env.DB.prepare('UPDATE reset_tokens SET used_ts = ? WHERE account_id = ? AND used_ts IS NULL')
      .bind(now, accountId).run();
    await env.DB.prepare(
      `INSERT INTO reset_tokens (selector, account_id, verifier, created_ts, expires_ts, used_ts, actor, actor_id)
       VALUES (?,?,?,?,?,NULL,?,?)`
    ).bind(selector, accountId, verifierHash, now, now + TTL_MS, actor.label, actor.id).run();
  } catch (e) {
    return json({ error: 'migration-needed', detail: String(e && e.message || e) }, 503);
  }

  const origin = new URL(context.request.url).origin;
  const link = origin + '/reset.html?token=' + encodeURIComponent(token);
  const who = acc.business || acc.name || 'votre commerce';
  const sent = await sendMail(env, {
    to,
    subject: 'Kiwi · réinitialiser votre mot de passe',
    text: 'Bonjour,\n\nVoici le lien pour choisir un nouveau mot de passe Kiwi pour ' + who + ' :\n\n' +
          link + '\n\n' +
          'Ce lien est valable une heure et ne fonctionne qu’une fois.\n' +
          'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.\n\n' +
          '— L’équipe Kiwi',
  });

  /* L'envoi a échoué : le jeton qu'on vient de créer ne servira à personne, et
     surtout il a périmé le précédent. On le retire, pour que l'état affiché à
     l'opérateur (« aucun lien vivant ») corresponde à la réalité et qu'il puisse
     réessayer tout de suite au lieu d'attendre cinq minutes pour rien. */
  if (!sent.ok) {
    try { await env.DB.prepare('DELETE FROM reset_tokens WHERE selector = ?').bind(selector).run(); } catch (_) {}
  }

  let journal = true;
  try {
    await env.DB.prepare(
      `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(accountId, merchant, 'reset', '', maskEmail(to), '', actor.label, actor.id,
           /* Ce qui est inscrit : à qui (masqué), par qui, si c'est parti, et
              quand ça expire. JAMAIS le lien ni le jeton — voir schema.sql. */
           JSON.stringify({ delivery: sent.ok ? 'sent' : ('failed:' + sent.reason), expires: now + TTL_MS }),
           now).run();
  } catch (_) { journal = false; }

  if (!sent.ok) return json({ error: 'send-failed', reason: sent.reason, to: maskEmail(to), journal }, 502);

  return json({
    ok: true, to: maskEmail(to), expires: now + TTL_MS,
    nextAllowed: now + RESEND_MS, journal,
  });
}
