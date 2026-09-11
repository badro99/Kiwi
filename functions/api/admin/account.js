/* /api/admin/account — les adresses e-mail d'un client (console opérateur).
 *
 *   GET ?merchant=slug | ?email=…   → le compte, ses adresses, ses établissements
 *   PUT {accountId, field, email, reason}  → corriger une adresse
 *   PUT {accountId, field:'login', revert:true, reason}  → reprise contrôlée
 *
 * ── LES QUATRE ADRESSES ─────────────────────────────────────────────────────
 * Elles ne jouent pas le même rôle et ne se corrigent pas dans le même esprit :
 *
 *   login    (accounts.email)         la CLÉ. C'est ce que le client tape pour
 *                                     entrer, et c'est unique dans tout Kiwi.
 *   contact  (accounts.contact_email) l'adresse à laquelle Kiwi écrit au commerce.
 *   billing  (accounts.billing_email) la comptabilité, quand elle diffère.
 *   équipe   (store_docs feature 'team')  les adresses des salariés, par magasin.
 *
 * Les trois premières vivaient sous une seule colonne : corriger l'adresse de
 * connexion mal saisie changeait du même geste l'adresse à laquelle Kiwi écrit.
 * Vides, `contact` et `billing` veulent dire « la même que la connexion » — ce
 * qui est l'état réel de tous les comptes existants, et pourquoi la migration ne
 * recopie rien dedans.
 *
 * Les adresses d'ÉQUIPE sont montrées, jamais modifiées ici. Elles appartiennent
 * au registre du personnel que le commerçant tient lui-même (Équipe → salariés),
 * elles ne servent à aucune authentification, et les écraser depuis la console
 * ferait diverger deux fiches du même salarié. L'opérateur qui appelle a besoin
 * de LES VOIR pour savoir à qui il parle ; c'est tout ce qu'on lui doit.
 *
 * ── CE QU'UN CHANGEMENT D'ADRESSE NE DOIT PAS CASSER ────────────────────────
 * Rien, et ce n'est pas une promesse : c'est une propriété du schéma. La session
 * est signée sur accounts.id (auth/_lib.js › makeSession), la propriété des
 * boutiques est merchant_config.account_id, les ventes sont rangées par slug de
 * magasin. AUCUN de ces liens ne passe par l'adresse. Un UPDATE d'une colonne
 * ne peut donc ni créer un second compte, ni relancer l'onboarding, ni détacher
 * le client de ses établissements, ni lui faire perdre ses droits — il n'y a
 * aucun chemin par lequel cela arriverait. Le client reste même connecté.
 */

import {
  isOperator, isSeniorOperator, operatorActor, json, normEmail, maskEmail, sendMail,
} from '../../auth/_lib.js';

const FIELDS = { login: 'email', contact: 'contact_email', billing: 'billing_email' };

function looksLikeEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
}

async function guard(context, senior) {
  if (!(await isOperator(context.request, context.env))) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  if (senior && !(await isSeniorOperator(context.request, context.env))) {
    return json({ error: 'operator-code-required' }, 403);
  }
  return null;
}

/* Les colonnes contact/billing peuvent manquer (migration pas encore passée).
   On relit alors sans elles plutôt que d'échouer : la console montre l'adresse
   de connexion, dit que les deux autres attendent la migration, et reste utile. */
async function readAccount(env, where, arg) {
  try {
    return {
      row: await env.DB.prepare(
        `SELECT id, email, name, business, status, created_ts, contact_email, billing_email
           FROM accounts WHERE ${where}`).bind(arg).first(),
      migrated: true,
    };
  } catch (_) {
    return {
      row: await env.DB.prepare(
        `SELECT id, email, name, business, status, created_ts FROM accounts WHERE ${where}`).bind(arg).first(),
      migrated: false,
    };
  }
}

/* Les adresses du personnel, telles que le commerçant les a saisies dans son
   registre Équipe. Lecture seule, et fail-soft : un magasin sans registre (ou
   une base sans store_docs) ne doit pas vider le panneau. */
async function teamEmails(env, merchants) {
  const out = [];
  for (const m of merchants) {
    let doc = null;
    try {
      const row = await env.DB.prepare(
        'SELECT data FROM store_docs WHERE merchant = ? AND feature = ?').bind(m, 'team').first();
      if (row && row.data) doc = JSON.parse(row.data);
    } catch (_) { continue; }
    const members = (doc && (doc.members || doc.list)) || [];
    if (!Array.isArray(members)) continue;
    members.forEach((mem) => {
      const mail = normEmail(mem && (mem.email || mem.mail));
      if (!mail) return;
      out.push({
        merchant: m,
        name: String((mem && (mem.name || mem.nom)) || '').slice(0, 60),
        role: String((mem && (mem.role || mem.poste)) || '').slice(0, 40),
        email: mail,
      });
    });
  }
  return out;
}

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const { env } = context;
  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  const email = normEmail(url.searchParams.get('email'));
  if (!merchant && !email) return json({ error: 'merchant-or-email-required' }, 400);

  let acc = null; let migrated = true;
  try {
    if (email) {
      const r = await readAccount(env, 'email = ?', email);
      acc = r.row; migrated = r.migrated;
    }
    if (!acc && merchant) {
      /* Par le registre des magasins d'abord (c'est le lien qui fait autorité),
         puis par le slug de la raison sociale — le chemin d'avant le registre,
         gardé pour qu'un compte jamais synchronisé se retrouve quand même. */
      let aid = '';
      try {
        const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
          .bind(merchant).first();
        aid = (row && row.account_id) || '';
      } catch (_) {}
      if (aid) { const r = await readAccount(env, 'id = ?', aid); acc = r.row; migrated = r.migrated; }
    }
  } catch (e) {
    return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
  }
  /* Pas de compte = une démo, ou un magasin qu'aucun client n'a encore réclamé.
     On le dit, plutôt que de renvoyer une fiche vide qui aurait l'air d'un bug. */
  if (!acc) return json({ account: null, reason: 'no-account' });

  let stores = [];
  try {
    const rs = await env.DB.prepare('SELECT merchant, name FROM merchant_config WHERE account_id = ?')
      .bind(acc.id).all();
    stores = ((rs && rs.results) || []).map((r) => ({ merchant: r.merchant, name: r.name || '' }));
  } catch (_) { /* base pas migrée → au moins le magasin ouvert */ }
  if (merchant && !stores.some((s) => s.merchant === merchant)) stores.push({ merchant, name: '' });

  const team = await teamEmails(env, stores.map((s) => s.merchant));

  /* Quand un lien de réinitialisation est-il parti, et un est-il encore vivant ?
     C'est ce que l'opérateur doit savoir avant d'en renvoyer un — voir le délai
     d'attente dans functions/api/admin/reset.js. */
  let lastReset = null;
  try {
    const r = await env.DB.prepare(
      `SELECT created_ts, expires_ts, used_ts FROM reset_tokens
        WHERE account_id = ? ORDER BY created_ts DESC LIMIT 1`).bind(acc.id).first();
    if (r) lastReset = { created_ts: r.created_ts, expires_ts: r.expires_ts, used_ts: r.used_ts || 0 };
  } catch (_) { /* table absente → aucun envoi connu */ }

  return json({
    account: {
      id: acc.id,
      login: acc.email || '',
      contact: acc.contact_email || '',
      billing: acc.billing_email || '',
      name: acc.name || '',
      business: acc.business || '',
      status: acc.status || 'active',
      created_ts: acc.created_ts || 0,
    },
    stores, team, lastReset, migrated,
    /* Kiwi n'a pas d'étape de vérification d'adresse : il n'y en a jamais eu, ni
       à l'inscription ni ailleurs. La nouvelle adresse devient donc la clé de
       connexion IMMÉDIATEMENT. La console affiche cette phrase telle quelle —
       promettre une vérification qui n'existe pas serait le pire des deux, et
       ajouter une vérification bloquante enfermerait dehors le client qui a
       justement perdu l'accès à son ancienne adresse. */
    verification: 'immediate',
    mail: !!(env && env.MAIL_WEBHOOK),
  });
}

export async function onRequestPut(context) {
  const bad = await guard(context, true); if (bad) return bad;
  const { env } = context;

  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const accountId = (body.accountId || '').toString().trim();
  if (!accountId) return json({ error: 'account-required' }, 400);
  const field = (body.field || 'login').toString().trim();
  if (!Object.prototype.hasOwnProperty.call(FIELDS, field)) return json({ error: 'bad-field' }, 400);
  const col = FIELDS[field];
  const reason = (body.reason || '').toString().trim().slice(0, 300);
  if (!reason) return json({ error: 'reason-required' }, 400);
  const merchant = (body.merchant || '').toString().trim().slice(0, 64);

  const cur = await readAccount(env, 'id = ?', accountId);
  if (!cur.row) return json({ error: 'not-found' }, 404);
  if (!cur.migrated && field !== 'login') return json({ error: 'migration-needed' }, 503);

  const prev = normEmail(field === 'login' ? cur.row.email : cur.row[col]);

  /* ── REPRISE CONTRÔLÉE ──
   * « Le client conteste le changement. » On ne demande pas à l'opérateur de
   * retaper l'ancienne adresse de mémoire — il la retaperait de travers, et
   * c'est précisément la situation qu'on répare. On relit la dernière ligne du
   * journal pour CE compte et CE champ, et on remet ce qu'elle dit. Une reprise
   * n'est jamais une suppression : elle s'inscrit à son tour ('email-revert'),
   * donc l'aller ET le retour restent lisibles. */
  let next;
  if (body.revert === true) {
    let last = null;
    try {
      last = await env.DB.prepare(
        `SELECT prev FROM account_audit WHERE account_id = ? AND action IN ('email','contact','billing')
          ORDER BY ts DESC, id DESC LIMIT 1`).bind(accountId).first();
    } catch (_) { return json({ error: 'no-history' }, 409); }
    if (!last || !last.prev) return json({ error: 'no-history' }, 409);
    next = normEmail(last.prev);
  } else {
    next = normEmail(body.email);
  }

  if (!next) return json({ error: 'email-required' }, 400);
  if (!looksLikeEmail(next)) return json({ error: 'bad-email' }, 400);
  if (next === prev) return json({ error: 'unchanged' }, 409);

  /* L'adresse de connexion est UNIQUE dans tout Kiwi : une collision n'est pas
     un détail cosmétique, c'est un INSERT qui échouerait et, pire, deux clients
     qui se disputeraient une porte. On regarde avant, et on le dit avec le nom
     du commerce concerné pour que l'opérateur comprenne tout de suite qu'il
     s'agit de l'autre boutique du même client, ou d'un homonyme. */
  if (field === 'login') {
    try {
      const clash = await env.DB.prepare('SELECT id, business FROM accounts WHERE email = ? AND id != ?')
        .bind(next, accountId).first();
      if (clash) return json({ error: 'email-taken', business: clash.business || '' }, 409);
    } catch (e) {
      return json({ error: 'query-failed', detail: String(e && e.message || e) }, 500);
    }
  }

  try {
    const r = await env.DB.prepare(`UPDATE accounts SET ${col} = ? WHERE id = ?`).bind(next, accountId).run();
    if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'not-found' }, 404);
  } catch (e) {
    if (/no such column|has no column/i.test(String(e && e.message || e))) return json({ error: 'migration-needed' }, 503);
    return json({ error: 'update-failed', detail: String(e && e.message || e) }, 500);
  }

  /* ── PRÉVENIR LES DEUX ADRESSES ──
   * L'ancienne, parce qu'un changement d'adresse de connexion qu'on n'a pas
   * demandé est le premier signe d'une prise de contrôle, et le client doit
   * pouvoir le dire tout de suite. La nouvelle, pour confirmer qu'elle est
   * bien la bonne — et pour que l'opérateur sache, si elle rebondit, qu'il
   * vient de saisir une adresse qui n'existe pas.
   *
   * Aucun des deux envois ne peut faire échouer le changement : il a déjà eu
   * lieu, et le journal enregistre ce qui est parti et ce qui n'est pas parti.
   * Ni l'un ni l'autre ne contient de mot de passe, de lien ou de jeton. */
  const who = cur.row.business || cur.row.name || 'votre compte Kiwi';
  const delivery = { old: 'skipped', new: 'skipped' };
  if (field === 'login' && prev) {
    const m = await sendMail(env, {
      to: prev,
      subject: 'Kiwi · votre adresse de connexion a été modifiée',
      text: 'Bonjour,\n\nL’adresse de connexion de ' + who + ' vient d’être remplacée par ' +
            maskEmail(next) + ' à la demande de votre interlocuteur Kiwi.\n\n' +
            'Si vous n’êtes pas à l’origine de ce changement, répondez à ce message immédiatement : ' +
            'nous rétablirons l’adresse précédente.\n\n·L’équipe Kiwi',
    });
    delivery.old = m.ok ? 'sent' : ('failed:' + m.reason);
  }
  {
    const m = await sendMail(env, {
      to: next,
      subject: 'Kiwi · votre nouvelle adresse',
      text: 'Bonjour,\n\nCette adresse est désormais ' +
            (field === 'login' ? 'celle qui vous connecte à Kiwi' :
             field === 'contact' ? 'l’adresse de contact de ' + who : 'l’adresse de facturation de ' + who) +
            '.\n\n' + (field === 'login'
              ? 'Votre mot de passe n’a pas changé. Connectez-vous avec cette adresse et le mot de passe habituel.\n\n'
              : '') + '·L’équipe Kiwi',
    });
    delivery.new = m.ok ? 'sent' : ('failed:' + m.reason);
  }

  const actor = await operatorActor(context.request, env);
  let journal = true;
  try {
    await env.DB.prepare(
      `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(accountId, merchant,
      body.revert === true ? 'email-revert' : (field === 'login' ? 'email' : field),
      prev, next, reason, actor.label, actor.id,
      JSON.stringify({ field, delivery, verification: 'immediate' }), Date.now()).run();
  } catch (_) { journal = false; }

  return json({ ok: true, field, prev, next, delivery, journal, verification: 'immediate' });
}
