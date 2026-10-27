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

let scanned = 0;
const env = { ...f.env, DB: { ...f.DB, prepare(q) {
  const s = f.DB.prepare(q);
  if (/FROM accounts/.test(q) && /business/.test(q) && !/WHERE email/.test(q) && /SELECT business/.test(q)) {
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
ok(scanned <= 3, 'the name check read only the accounts without a reserved slug (' + scanned + ' rows, not 63)');

scanned = 0;
r = await go({ email: 'dup@example.test', name: 'Dup', business: 'BOUTIQUE numero 41', password: pw() });
ok(r.status === 409 && r.body.error === 'business-taken', 'a reserved slug still blocks a new account');

scanned = 0;
r = await go({ email: 'dup2@example.test', name: 'Dup', business: 'vieux  cafe', password: pw() });
ok(r.status === 409 && r.body.error === 'business-taken', 'an older account without a reserved slug still blocks its name');
ok(scanned <= 3, 'the legacy scan stays bounded to the legacy set (' + scanned + ')');
f.close();
console.log(`signup-slug-scan: ${checks} checks passed`);
