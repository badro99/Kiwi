#!/usr/bin/env node
/* Jon's Burgers (26 Nov 2026) · the two owner documents behind Paramètres ›
 * Caisse & Reçu, as /api/store accepts them:
 *   · `discountpolicy` carries named discounts (`presets`): a name and a whole
 *     percentage, each one a percentage the till is allowed to apply;
 *   · `counterflow` holds three switches, booleans only;
 *   · both are owner documents: a paired till reads them, never writes them.
 * Run: node tools/counter-policy-store-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet: storeGet, onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { tillToken, makeSession, sessionCookie, DEMO_MERCHANTS } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

let fails = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'counter-policy-secret-0123456789';
const SHOP = 'test-burgers-store';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status,session_epoch) VALUES ('acc-1','o@burgers.test','Test Burgers','s','h',?,'active',0)`).run(now);
db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,till_epoch,updated_ts) VALUES (?, '{}','pro','restaurant','acc-1','Test Burgers','active',0,?)`).run(SHOP, now);

const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
} };
const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const post = (cookie, feature, data, baseRev) => storePost({ request: new Request('https://k/api/store', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.0.0.2' },
  body: JSON.stringify({ feature, merchant: SHOP, data, baseRev }) }), env });
const read = (cookie, feature) => storeGet({ request: new Request(`https://k/api/store?feature=${feature}&merchant=${SHOP}`, { headers: { Cookie: cookie, 'CF-Connecting-IP': '10.0.0.2' } }), env });

console.log('\n\x1b[1mRemises nommées et commande au comptoir · /api/store\x1b[0m');
ok('the bench merchant is not a demo slug (anything would pass there)', !DEMO_MERCHANTS[SHOP], SHOP);

let r = await post(owner, 'discountpolicy', { percentages: [10, 20], presets: [{ name: 'Étudiant', pct: 10 }, { name: 'Personnel', pct: 20 }] });
ok('the owner saves two named discounts', r.status === 200, String(r.status) + ' ' + await r.clone().text());
r = await post(owner, 'discountpolicy', { percentages: [10], presets: [{ name: 'Personnel', pct: 20 }] });
ok('a named discount whose rate is not an allowed percentage is refused', r.status === 400 && /bad-discount-policy/.test(await r.text()));
r = await post(owner, 'discountpolicy', { percentages: [10], presets: [{ name: 'Étudiant', pct: 10 }, { name: ' étudiant ', pct: 10 }] });
ok('two named discounts with the same name are refused', r.status === 400);
r = await post(owner, 'discountpolicy', { percentages: [10], presets: [{ name: '', pct: 10 }] });
ok('a named discount without a name is refused', r.status === 400);
r = await post(owner, 'discountpolicy', { percentages: [10, 20] }, 1);
ok('a policy without presets (an older till or dashboard) still saves', r.status === 200, String(r.status) + ' ' + await r.clone().text());

r = await post(owner, 'counterflow', { direct: true, payToKitchen: true, typeAtPay: false, pagers: 12 });
ok('the owner saves the three counter switches and the bipeur count', r.status === 200, String(r.status));
r = await post(owner, 'counterflow', { direct: 'yes' });
ok('a switch that is not a boolean is refused', r.status === 400 && /bad-counter-flow/.test(await r.text()));
r = await post(owner, 'counterflow', { direct: true, sneaky: true });
ok('an unknown key is refused', r.status === 400);
for (const bad of [0, 21, '12', 2.5]) {
  r = await post(owner, 'counterflow', { direct: true, pagers: bad });
  ok(`a bipeur count of ${JSON.stringify(bad)} is refused (mall restaurants, 1 to 20)`, r.status === 400 && /bad-counter-flow/.test(await r.text()));
}

r = await read(till, 'counterflow');
const body = r.status === 200 ? await r.json() : null;
ok('a paired till reads the counter switches', !!body && body.data && body.data.direct === true && body.data.payToKitchen === true && body.data.pagers === 12, JSON.stringify(body));
r = await post(till, 'counterflow', { direct: false, payToKitchen: false, typeAtPay: false });
ok('a paired till cannot write them', r.status === 403 || r.status === 401, String(r.status));
r = await post(till, 'discountpolicy', { percentages: [50], presets: [{ name: 'Moi', pct: 50 }] });
ok('nor the named discounts', r.status === 403 || r.status === 401, String(r.status));

if (fails) { console.log(`\n\x1b[31m${fails} failure(s)\x1b[0m`); process.exit(1); }
console.log('\n✓ counter policy store: named discounts and counter switches validated, owner-only');
