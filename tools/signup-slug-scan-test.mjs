// Inscription : le contrôle « nom d'établissement déjà pris » ne relit plus
// le nom de TOUS les comptes. Les comptes récents portent leur slug réservé
// (accounts.business_slug, index unique) : une recherche indexée les couvre ;
// seuls les comptes antérieurs à la réservation (business_slug NULL, un
// ensemble qui ne grossit plus) passent encore par le balayage.
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as signup } from '../functions/auth/signup.js';

const root = new URL('..', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const f = await fixture(root);

// 60 comptes récents (slug réservé) et 2 anciens (slug NULL).
const ins = f.sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts,status,business_slug) VALUES(?,?,?,?,?,?,?,?)');
for (let i = 0; i < 60; i++) ins.run('acc-new-' + i, `new${i}@example.test`, 'Boutique Numero ' + i, 's', 'h', Date.now(), 'active', 'boutique-numero-' + i);
ins.run('acc-old-1', 'old1@example.test', 'Vieux Cafe', 's', 'h', 1, 'active', null);
ins.run('acc-old-2', 'old2@example.test', 'Ancienne Epicerie', 's', 'h', 1, 'active', null);
ins.run('acc-old-3', 'old3@example.test', 'Vieux  Cafe', 's', 'h', 1, 'active', null);   // même slug que acc-old-1
ins.run('acc-old-4', 'old4@example.test', 'مقهى قديم', 's', 'h', 1, 'active', null);        // aucune lettre latine
const slugOf = (id) => f.sql.prepare('SELECT business_slug AS s FROM accounts WHERE id = ?').get(id).s;

let scanned = 0;
const env = { ...f.env, DB: { ...f.DB, prepare(q) {
  const s = f.DB.prepare(q);
  if (/FROM accounts/.test(q) && /business_slug IS NULL/.test(q) && /^\s*SELECT/.test(q)) {
    const all = s.all.bind(s);
    s.all = async () => { const r = await all(); scanned += r.results.length; return r; };
  }
  return s;
} } };
const go = async (body) => {
  const r = await signup({ env, request: new Request('https://kiwi.test/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), waitUntil() {} });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const pw = () => 'Zx' + crypto.randomUUID();

let r = await go({ email: 'fresh@example.test', name: 'Fresh', business: 'Totally Fresh Shop', password: pw() });
ok(r.status === 200, 'a free name signs up');
ok(scanned >= 4 && scanned <= 6, 'the first signup backfills the legacy accounts once (the 4 added here plus the fixture\'s own), not the 60 recent ones (' + scanned + ' rows)');
ok(slugOf('acc-old-1') === 'vieux-cafe' && slugOf('acc-old-2') === 'ancienne-epicerie', 'legacy accounts now carry their reserved slug');
ok(/^legacy:/.test(slugOf('acc-old-3')), 'a legacy duplicate of an already reserved name leaves the set with a marker slug');
ok(/^shop-/.test(slugOf('acc-old-4')), 'a non-Latin legacy name gets its own shop-… slug');
ok(!!f.sql.prepare("SELECT 1 FROM store_docs WHERE merchant = '_platform' AND feature = 'slug-backfill'").get(), 'a flag records that the backfill is done');

scanned = 0;
r = await go({ email: 'second@example.test', name: 'Second', business: 'Another Fresh Shop', password: pw() });
ok(r.status === 200 && scanned === 0, 'later signups never read the legacy set again (' + scanned + ' rows)');

scanned = 0;
r = await go({ email: 'dup@example.test', name: 'Dup', business: 'BOUTIQUE numero 41', password: pw() });
ok(r.status === 409 && r.body.error === 'business-taken', 'a reserved slug still blocks a new account');

scanned = 0;
r = await go({ email: 'dup2@example.test', name: 'Dup', business: 'vieux  cafe', password: pw() });
ok(r.status === 409 && r.body.error === 'business-taken', 'an older account without a reserved slug still blocks its name');
ok(scanned === 0, 'and it is found through the reserved slug, without any legacy scan (' + scanned + ')');
f.close();

/* The very first signup after deploy asks for a legacy name: refused during the backfill itself. */
{
  const g = await fixture(root);
  g.sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts,status,business_slug) VALUES(?,?,?,?,?,?,?,?)')
    .run('acc-legacy-first', 'first@example.test', 'Premier Cafe', 's', 'h', 1, 'active', null);
  const res = await signup({ env: g.env, request: new Request('https://kiwi.test/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'late@example.test', name: 'Late', business: 'premier  CAFE', password: pw() }) }), waitUntil() {} });
  ok(res.status === 409 && (await res.json()).error === 'business-taken', 'the first signup after deploy still refuses a legacy name');
  ok(g.sql.prepare('SELECT business_slug AS s FROM accounts WHERE id = ?').get('acc-legacy-first').s === 'premier-cafe', 'and that legacy account is now reserved');
  g.close();
}
console.log(`signup-slug-scan: ${checks} checks passed`);
