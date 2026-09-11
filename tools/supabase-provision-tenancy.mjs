#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · le pont d'appartenance entre `accounts` (D1) et Supabase Auth.
 *
 *   node tools/supabase-provision-tenancy.mjs
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * La fondation posait tout le cloisonnement sur `public.account_users` :
 * `private.owns_merchant()` et `owns_account()` ne lisent QUE cette table, et
 * toutes les politiques passent par elles. Or rien ne la remplissait. Elle
 * n'est pas dans les 19 tables de l'import — elle ne PEUT pas y être : D1 ne
 * connaît pas d'utilisateur Supabase, `accounts` porte le sel et l'empreinte
 * de Kiwi, pas une identité `auth.users`.
 *
 * Conséquence : après un import parfaitement réussi, `account_users` est vide,
 * les deux fonctions rendent `false`, et un commerçant authentifié lit ZÉRO
 * ligne. Pas « les lignes des autres » — les siennes aussi.
 *
 * Le piège est dans la recette, pas dans le produit. La porte 5 dit « vérifier
 * que deux commerçants d'essai ne se lisent pas l'un l'autre » : elle passait
 * d'office, puisque aucun des deux ne lisait quoi que ce soit. Une porte qui ne
 * peut pas échouer ne garde rien, et elle est pire qu'absente parce qu'on la
 * coche.
 *
 * CE QU'IL FAIT
 *
 * Pour chaque ligne de `public.accounts`, il retrouve ou crée l'utilisateur
 * Supabase portant la même adresse, puis pose la ligne `account_users`
 * (rôle 'owner'). Rejouable : un compte déjà relié n'est pas retouché.
 *
 * CE QU'IL NE FAIT PAS
 *
 * · Aucun courriel n'est envoyé — les comptes sont créés `email_confirm: true`,
 *   ce qui n'ouvre aucun envoi. Personne n'apprend l'existence du staging.
 * · Aucun mot de passe n'est choisi, affiché, ni journalisé. Chaque compte reçoit
 *   une valeur aléatoire que PERSONNE ne connaît, pas même ce script après sa
 *   sortie. Se connecter réellement en staging passe par une réinitialisation
 *   depuis la console Supabase — c'est-à-dire par le propriétaire, pas par un
 *   secret recopié dans un fichier.
 * · Aucune écriture D1. La production reste la source de vérité.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { pathToFileURL } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

const EXPECTED_CONFIRMATION = 'kiwi-staging';
const PAGE_SIZE = 1000;

function required(name, env = process.env) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function config(env = process.env) {
  if (required('MIGRATION_CONFIRM', env) !== EXPECTED_CONFIRMATION) {
    throw new Error(`MIGRATION_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  const supabaseUrl = required('SUPABASE_URL', env).replace(/\/$/, '');
  const expectedRef = required('SUPABASE_EXPECTED_PROJECT_REF', env);
  const host = new URL(supabaseUrl).hostname;
  if (host !== `${expectedRef}.supabase.co`) {
    throw new Error(`Refusing target ${host}; expected ${expectedRef}.supabase.co`);
  }
  return { supabaseUrl, supabaseSecret: required('SUPABASE_SECRET_KEY', env) };
}

function headers(cfg, extra = {}) {
  return {
    apikey: cfg.supabaseSecret,
    Authorization: `Bearer ${cfg.supabaseSecret}`,
    ...extra,
  };
}

async function rest(cfg, path, init = {}) {
  const response = await fetch(`${cfg.supabaseUrl}${path}`, {
    ...init,
    headers: headers(cfg, init.headers || {}),
  });
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

/* Un mot de passe que personne ne lira. Il n'ouvre rien : il ferme. Sans lui,
   l'API refuse de créer l'utilisateur ; avec une valeur devinable, le compte
   d'essai deviendrait une porte. 32 octets d'urandom, jamais retournés. */
function unknowablePassword() {
  return `${randomBytes(24).toString('base64url')}${randomUUID()}`;
}

async function allAuthUsers(cfg) {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const body = await rest(cfg, `/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`);
    const users = body?.users || [];
    for (const user of users) {
      if (user.email) byEmail.set(String(user.email).toLowerCase(), user.id);
    }
    if (users.length < PAGE_SIZE) return byEmail;
  }
}

async function createAuthUser(cfg, email) {
  const created = await rest(cfg, '/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: unknowablePassword(),
      email_confirm: true,          // aucun courriel n'est envoyé
    }),
  });
  return created.id;
}

export async function main(env = process.env) {
  const cfg = config(env);

  const accounts = await rest(cfg, '/rest/v1/accounts?select=id,email&order=id');
  const existingLinks = await rest(cfg, '/rest/v1/account_users?select=account_id');
  const linked = new Set(existingLinks.map((row) => row.account_id));
  const byEmail = await allAuthUsers(cfg);

  const rows = [];
  let created = 0;
  for (const account of accounts) {
    const email = String(account.email || '').trim().toLowerCase();
    if (!email) {
      console.warn(`compte ${account.id} sans adresse — ignoré, il restera sans accès`);
      continue;
    }
    if (linked.has(account.id)) continue;
    let userId = byEmail.get(email);
    if (!userId) {
      userId = await createAuthUser(cfg, email);
      byEmail.set(email, userId);
      created += 1;
    }
    rows.push({ auth_user_id: userId, account_id: account.id, role: 'owner' });
  }

  if (rows.length) {
    await rest(cfg, '/rest/v1/account_users?on_conflict=auth_user_id,account_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
  }

  /* Les orphelins ne sont pas un détail de journal. `owns_merchant()` joint
     `merchant_config` sur `account_id` : une fiche dont la colonne est NULL
     n'atteint aucun membre, donc son commerçant ne lira NI ses ventes, NI ses
     commandes, NI ses clients — sans erreur, sans page vide explicite, juste
     des zéros partout. Autant le dire ici, où quelqu'un lit encore. */
  const orphans = await rest(
    cfg,
    '/rest/v1/merchant_config?select=merchant&account_id=is.null&order=merchant',
  );

  console.log(`account_users : ${rows.length} liaison(s) posée(s), ${created} utilisateur(s) Auth créé(s).`);
  console.log(`déjà reliés : ${linked.size} · comptes lus : ${accounts.length}`);
  if (orphans.length) {
    console.log(`\n⚠ ${orphans.length} établissement(s) sans account_id — invisibles à tout membre :`);
    for (const row of orphans) console.log(`   · ${row.merchant}`);
    console.log('   Rattachez-les dans merchant_config avant toute bascule.');
  }
  return { linked: rows.length, created, orphans: orphans.map((row) => row.merchant) };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
