// Inscription : un compte renommé ne laisse pas son ancien slug réservé à la
// place du nouveau nom. L'unique écriture de accounts.business après la création
// (suppression d'un établissement par la console, qui fait passer le magasin
// suivant en principal) écrit désormais business ET business_slug dans le même
// lot : le contrôle d'inscription compare au slug stocké de chaque compte, et
// aux seuls comptes sans slug (anciens) par balayage.
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as signup } from '../functions/auth/signup.js';
import { onRequestDelete as deleteStore } from '../functions/api/admin/clients.js';

const root = new URL('..', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

async function world(breakSlugNull) {
  const f = await fixture(root);
  // Le compte A vend sous « Server Money Shop » (slug réservé) et possède un 2e magasin « Properties ».
  f.sql.prepare("UPDATE accounts SET business='Server Money Shop', business_slug='server-money-shop' WHERE id='money-owner'").run();
  f.sql.prepare("UPDATE merchant_config SET name='Properties' WHERE merchant='server-other-shop'").run();
  const DB = { ...f.DB, prepare(q) {
    if (breakSlugNull && /UPDATE accounts SET business_slug = NULL/.test(q)) throw new Error('simulated: post-batch slug write lost');
    return f.DB.prepare(q);
  } };
  return { f, env: { ...f.env, DB } };
}
const del = (env, f) => deleteStore({ env, request: new Request(`https://kiwi.test/api/admin/clients?merchant=${f.merchant}&confirm=${f.merchant}`, {
  method: 'DELETE', headers: { Cookie: 'kiwi_op=' + f.cookieOp } }) });
const join = (env, business) => signup({ env, waitUntil() {}, request: new Request('https://kiwi.test/auth/signup', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'new@example.test', name: 'New', business, password: 'Zx' + crypto.randomUUID() }) }) });

for (const lost of [false, true]) {
  const { f, env } = await world(lost);
  const { operatorToken, operatorIdToken } = await import('../functions/auth/_lib.js');
  f.cookieOp = (await operatorToken(f.env.AUTH_SECRET)) + '; kiwi_op_id=' + (await operatorIdToken(f.env.AUTH_SECRET, 'money-operator'));
  const r = await del(env, f);
  ok(r.status === 200, 'the store delete succeeds' + (lost ? ' even when a later slug write would have been lost' : '') + ' (' + r.status + ')');
  const a = f.sql.prepare("SELECT business, business_slug FROM accounts WHERE id='money-owner'").get();
  ok(a.business === 'Properties' && a.business_slug === 'properties', 'business and business_slug moved together (' + a.business + ' / ' + a.business_slug + ')');
  const s = await join(env, 'PROPERTIES');
  ok(s.status === 409 && (await s.json()).error === 'business-taken', 'a new signup under the renamed account\'s new name is refused');
  ok(f.sql.prepare("SELECT COUNT(*) n FROM accounts WHERE email='new@example.test'").get().n === 0, 'and no account is created');
  f.close();
}
// Le slug visé est déjà tenu par un autre compte : on échoue fermé, rien n'est supprimé.
{
  const { f, env } = await world(false);
  const { operatorToken, operatorIdToken } = await import('../functions/auth/_lib.js');
  f.cookieOp = (await operatorToken(f.env.AUTH_SECRET)) + '; kiwi_op_id=' + (await operatorIdToken(f.env.AUTH_SECRET, 'money-operator'));
  f.sql.prepare("INSERT INTO accounts(id,email,business,salt,hash,created_ts,status,business_slug) VALUES('other','o@example.test','Properties','s','h',1,'active','properties')").run();
  const r = await del(env, f);
  ok(r.status === 500, 'a slug already held by another account refuses the delete (' + r.status + ')');
  const a = f.sql.prepare("SELECT business, business_slug FROM accounts WHERE id='money-owner'").get();
  ok(a.business === 'Server Money Shop' && a.business_slug === 'server-money-shop', 'and the account keeps its name and slug together');
  f.close();
}
// Base pas encore migrée (sans colonne business_slug) : la suppression marche encore.
{
  const { f, env } = await world(false);
  const { operatorToken, operatorIdToken } = await import('../functions/auth/_lib.js');
  f.cookieOp = (await operatorToken(f.env.AUTH_SECRET)) + '; kiwi_op_id=' + (await operatorIdToken(f.env.AUTH_SECRET, 'money-operator'));
  f.sql.exec('DROP INDEX idx_accounts_business_slug'); f.sql.exec('ALTER TABLE accounts DROP COLUMN business_slug');
  const r = await del(env, f);
  ok(r.status === 200, 'without the business_slug column the delete still works (' + r.status + ')');
  ok(f.sql.prepare("SELECT business FROM accounts WHERE id='money-owner'").get().business === 'Properties', 'and the account still moves to its next store');
  f.close();
}
console.log(`signup-renamed-slug: ${checks} checks passed`);
