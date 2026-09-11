#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · la porte 5, rendue capable d'échouer.
 *
 *   node tools/supabase-tenancy-test.mjs
 *
 * « Vérifier que deux commerçants d'essai ne peuvent ni lire ni modifier les
 * lignes de l'autre » se cochait tout seul tant que `account_users` était vide :
 * aucun des deux ne lisait RIEN, donc aucun ne lisait l'autre. Un contrôle qui
 * ne peut pas échouer ne mesure pas le cloisonnement, il mesure sa propre
 * absence — et il rassure exactement autant qu'un vrai.
 *
 * Ici chaque assertion négative est précédée de sa positive : on prouve d'abord
 * que A voit bien SES ventes, et seulement ensuite qu'il ne voit pas celles de
 * B. Sans la première, la seconde ne vaut rien.
 *
 * Le script fabrique ses propres témoins (deux commerçants, trois membres),
 * les exerce, puis les efface — y compris quand il échoue en route. Les mots de
 * passe sont tirés en mémoire, jamais écrits, jamais affichés, et meurent avec
 * le processus.
 *
 * Demande SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
 * SUPABASE_EXPECTED_PROJECT_REF et MIGRATION_CONFIRM=kiwi-staging.
 * Aucun accès D1, aucune écriture en production.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { randomBytes, randomUUID } from 'node:crypto';

const EXPECTED_CONFIRMATION = 'kiwi-staging';
const STAMP = randomBytes(4).toString('hex');
const TAG = `kiwi-tenancy-${STAMP}`;

let failures = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, detail) => { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); };
const section = (title) => console.log(`\n${title}`);

function required(name, env = process.env) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function config(env = process.env) {
  if (required('MIGRATION_CONFIRM', env) !== EXPECTED_CONFIRMATION) {
    throw new Error(`MIGRATION_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  const url = required('SUPABASE_URL', env).replace(/\/$/, '');
  const expectedRef = required('SUPABASE_EXPECTED_PROJECT_REF', env);
  if (new URL(url).hostname !== `${expectedRef}.supabase.co`) {
    throw new Error(`Refusing target ${new URL(url).hostname}; expected ${expectedRef}.supabase.co`);
  }
  return {
    url,
    secret: required('SUPABASE_SECRET_KEY', env),
    publishable: required('SUPABASE_PUBLISHABLE_KEY', env),
  };
}

const ephemeralPassword = () => `${randomBytes(24).toString('base64url')}${randomUUID()}`;

/* Toute requête passe par ici, y compris celles qu'on ATTEND en échec : un test
   de cloisonnement qui jette sur 403 ne peut pas distinguer « refusé, tant
   mieux » de « cassé ». On rend le statut, on juge après. */
async function call(cfg, path, { method = 'GET', token, body, prefer } = {}) {
  const key = token ? cfg.publishable : cfg.secret;
  const response = await fetch(`${cfg.url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || cfg.secret}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
  return { status: response.status, ok: response.ok, body: parsed };
}

async function must(cfg, path, init, what) {
  const res = await call(cfg, path, init);
  if (!res.ok) throw new Error(`${what} a échoué (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body;
}

const created = { users: [], accounts: [], merchants: [], sales: [] };

async function makeMember(cfg, email) {
  const user = await must(cfg, '/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: ephemeralPassword(), email_confirm: true },
  }, `création de ${email}`);
  created.users.push(user.id);
  return user.id;
}

async function signIn(cfg, email, password) {
  const res = await call(cfg, '/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  if (!res.ok || !res.body?.access_token) {
    throw new Error(`connexion ${email} refusée (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.access_token;
}

/* Le mot de passe est choisi ici et utilisé deux lignes plus bas. Il ne sort
   jamais de cette portée : ni retour, ni journal, ni fichier. */
async function makeSignedInMember(cfg, email) {
  const password = ephemeralPassword();
  const user = await must(cfg, '/auth/v1/admin/users', {
    method: 'POST', body: { email, password, email_confirm: true },
  }, `création de ${email}`);
  created.users.push(user.id);
  return { id: user.id, token: await signIn(cfg, email, password) };
}

async function seedTenant(cfg, slug) {
  const accountId = `acc-${TAG}-${slug}`;
  const merchant = `${TAG}-${slug}`;
  const now = Date.now();

  await must(cfg, '/rest/v1/accounts', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id: accountId, email: `${TAG}-${slug}@kiwi.invalid`,
      salt: 'x', hash: 'x', created_ts: now,
    },
  }, `compte ${slug}`);
  created.accounts.push(accountId);

  await must(cfg, '/rest/v1/merchant_config', {
    method: 'POST', prefer: 'return=minimal',
    body: { merchant, account_id: accountId, features: {}, updated_ts: now },
  }, `établissement ${slug}`);
  created.merchants.push(merchant);

  const saleId = `sale-${TAG}-${slug}`;
  await must(cfg, '/rest/v1/sales', {
    method: 'POST', prefer: 'return=minimal',
    body: { id: saleId, merchant, amount: 120, method: 'cash', ts: now },
  }, `vente ${slug}`);
  created.sales.push(saleId);

  await must(cfg, '/rest/v1/staff_pins', {
    method: 'POST', prefer: 'return=minimal',
    body: { id: `pin-${TAG}-${slug}`, merchant, pin: '0000', role: 'staff', created_ts: now },
  }, `code personnel ${slug}`);

  return { accountId, merchant, saleId };
}

async function link(cfg, userId, accountId, role) {
  await must(cfg, '/rest/v1/account_users', {
    method: 'POST', prefer: 'return=minimal',
    body: { auth_user_id: userId, account_id: accountId, role },
  }, `liaison ${role}`);
}

async function cleanup(cfg) {
  const del = (path) => call(cfg, path, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
  await del(`/rest/v1/staff_pins?merchant=like.${TAG}*`);
  await del(`/rest/v1/sales?merchant=like.${TAG}*`);
  await del(`/rest/v1/merchant_config?merchant=like.${TAG}*`);
  await del(`/rest/v1/account_users?account_id=like.acc-${TAG}*`);
  await del(`/rest/v1/accounts?id=like.acc-${TAG}*`);
  for (const id of created.users) {
    await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

async function run() {
  const cfg = config();
  console.log(`Cloisonnement Supabase · témoins « ${TAG} »`);

  const a = await seedTenant(cfg, 'a');
  const b = await seedTenant(cfg, 'b');
  const owner = await makeSignedInMember(cfg, `${TAG}-owner@kiwi.invalid`);
  const staff = await makeSignedInMember(cfg, `${TAG}-staff@kiwi.invalid`);
  const stranger = await makeSignedInMember(cfg, `${TAG}-stranger@kiwi.invalid`);
  await link(cfg, owner.id, a.accountId, 'owner');
  await link(cfg, staff.id, a.accountId, 'staff');
  await link(cfg, stranger.id, b.accountId, 'owner');

  const asOwner = (path, init = {}) => call(cfg, path, { ...init, token: owner.token });
  const asStaff = (path, init = {}) => call(cfg, path, { ...init, token: staff.token });
  const asAnon = (path, init = {}) => call(cfg, path, { ...init, token: cfg.publishable });

  section('1 · le commerçant lit bien chez lui (sans quoi le reste ne prouve rien)');
  {
    const res = await asOwner(`/rest/v1/sales?merchant=eq.${a.merchant}`);
    const rows = Array.isArray(res.body) ? res.body : [];
    if (rows.length === 1 && rows[0].id === a.saleId) ok('A voit sa propre vente');
    else fail('A ne voit pas sa propre vente', `${res.status} · ${rows.length} ligne(s)`);
  }

  section('2 · et rien chez le voisin');
  {
    const res = await asOwner(`/rest/v1/sales?merchant=eq.${b.merchant}`);
    const rows = Array.isArray(res.body) ? res.body : [];
    rows.length === 0
      ? ok('A ne voit aucune vente de B')
      : fail('A lit les ventes de B', `${rows.length} ligne(s)`);

    const all = await asOwner('/rest/v1/sales?select=merchant');
    const leaked = (Array.isArray(all.body) ? all.body : []).filter((r) => r.merchant !== a.merchant);
    leaked.length === 0
      ? ok('une requête sans filtre ne rend que ses propres lignes')
      : fail('fuite sur requête non filtrée', `${leaked.length} ligne(s) étrangère(s)`);
  }

  section('3 · les codes du personnel ne sortent pas du serveur');
  {
    const res = await asOwner('/rest/v1/staff_pins?select=pin');
    const rows = Array.isArray(res.body) ? res.body : [];
    (!res.ok || rows.length === 0)
      ? ok(`le propriétaire lui-même ne lit aucun code (${res.status})`)
      : fail('les codes sont lisibles depuis le navigateur', `${rows.length} code(s)`);
  }

  section('4 · le navigateur n\'écrit rien, même chez lui');
  {
    const patched = await asOwner(`/rest/v1/sales?id=eq.${a.saleId}`, {
      method: 'PATCH', body: { amount: 999999 }, prefer: 'return=minimal',
    });
    patched.ok
      ? fail('A a pu réécrire le montant de sa vente sans trace')
      : ok(`modifier une vente est refusé (${patched.status})`);

    const inserted = await asOwner('/rest/v1/sales', {
      method: 'POST', prefer: 'return=minimal',
      body: { id: `sale-${TAG}-forged`, merchant: a.merchant, amount: 1, method: 'cash', ts: Date.now() },
    });
    inserted.ok
      ? fail('A a pu insérer une vente hors journal')
      : ok(`insérer une vente est refusé (${inserted.status})`);

    const check = await call(cfg, `/rest/v1/sales?id=eq.${a.saleId}&select=amount`);
    Number(check.body?.[0]?.amount) === 120
      ? ok('le montant d\'origine est intact')
      : fail('le montant a bougé', JSON.stringify(check.body));
  }

  section('5 · le rôle compte');
  {
    const asOwnerRes = await asOwner(`/rest/v1/merchant_config?merchant=eq.${a.merchant}`);
    (Array.isArray(asOwnerRes.body) ? asOwnerRes.body : []).length === 1
      ? ok('le propriétaire lit la fiche commerciale')
      : fail('le propriétaire ne lit pas sa fiche', `${asOwnerRes.status}`);

    const asStaffRes = await asStaff(`/rest/v1/merchant_config?merchant=eq.${a.merchant}`);
    const staffRows = Array.isArray(asStaffRes.body) ? asStaffRes.body : [];
    staffRows.length === 0
      ? ok('un membre « staff » ne lit ni le plan ni le MRR')
      : fail('un membre « staff » lit la fiche commerciale', `${staffRows.length} ligne(s)`);

    const staffSales = await asStaff(`/rest/v1/sales?merchant=eq.${a.merchant}`);
    (Array.isArray(staffSales.body) ? staffSales.body : []).length === 1
      ? ok('mais il voit bien les ventes du comptoir')
      : fail('le membre « staff » ne voit pas les ventes', `${staffSales.status}`);
  }

  section('6 · l\'anonyme ne voit que la carte publiée');
  {
    const menus = await asAnon('/rest/v1/menus?select=merchant&limit=1');
    menus.ok ? ok('la carte publiée reste lisible sans compte')
      : fail('la carte publiée est devenue illisible', `${menus.status}`);

    for (const table of ['sales', 'clients', 'orders', 'accounts', 'staff_pins']) {
      const res = await asAnon(`/rest/v1/${table}?select=*&limit=1`);
      const rows = Array.isArray(res.body) ? res.body : [];
      (!res.ok || rows.length === 0)
        ? ok(`${table} fermé à l'anonyme (${res.status})`)
        : fail(`${table} lisible sans compte`, `${rows.length} ligne(s)`);
    }
  }
}

const cfgForCleanup = (() => { try { return config(); } catch (_) { return null; } })();
try {
  await run();
} catch (error) {
  failures += 1;
  console.log(`\n✗ ${error.message || error}`);
} finally {
  if (cfgForCleanup) await cleanup(cfgForCleanup);
}

console.log('\n' + '─'.repeat(60));
if (failures) {
  console.log(`✗ ${failures} échec(s) — le cloisonnement n'est pas acquis`);
  process.exitCode = 1;
} else {
  console.log('✓ cloisonnement vérifié : chacun chez soi, personne n\'écrit, les codes restent au serveur');
}
