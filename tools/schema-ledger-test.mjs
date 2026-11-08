// Contrat de déploiement du registre des migrations : le vrai middleware, un vrai SQLite.
// Registre absent, trous dans l'historique, complet, et panne passagère de D1.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { schemaCompatibility, MINIMUM_SCHEMA_VERSION as MIN } from '../functions/_schema-version.js';
import { onRequest } from '../functions/api/_middleware.js';

const d1 = (sqlite, hook) => ({ prepare(sql) { return { async all() { if (hook) hook(sql); return { results: sqlite.prepare(sql).all() }; } }; } });
const ledgerDb = (numbers) => {
  const sqlite = new DatabaseSync(':memory:');
  if (numbers) {
    sqlite.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
    for (const n of numbers) sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(String(n).padStart(4, '0') + '_x.sql');
    // The physical shape migrations 0020 to 0023 leave behind (the probe reads it).
    sqlite.exec('CREATE TABLE clients (id TEXT, spend_cents INTEGER); CREATE TABLE sales (id TEXT, client_id TEXT, received_ts INTEGER);' +
      'CREATE TABLE pay_statements (id TEXT, merchant TEXT, number TEXT, member_id TEXT, issued_ts INTEGER, issued_by TEXT)');
  }
  return sqlite;
};
const all = (n) => Array.from({ length: n }, (_, i) => i + 1);
const through = async (db) => (await onRequest({ env: { DB: db }, next: () => 'route reached' }));

// Registre absent : base ancienne ou jamais suivie par wrangler. 503, jamais une route.
const absent = d1(ledgerDb(null));
const refused = await through(absent);
assert.equal(refused.status, 503, 'sans table d1_migrations, toutes les routes répondent 503');
assert.equal((await refused.json()).code, 'incompatible_schema');

// Trou : 0023 présent, 0021 manquant (sales.client_id absente). Refusé.
assert.equal((await through(d1(ledgerDb(all(MIN).filter(n => n !== 21))))).status, 503, 'un trou sous le minimum refuse');
assert.equal((await through(d1(ledgerDb([23])))).status, 503, 'le seul numéro le plus haut ne suffit pas');
assert.equal((await through(d1(ledgerDb(all(MIN - 1))))).status, 503, 'sous le minimum');

// Complet : passe.
assert.equal(await through(d1(ledgerDb(all(MIN)))), 'route reached');
assert.equal(await through(d1(ledgerDb(all(MIN + 2)))), 'route reached', 'au-dessus du minimum');

// Panne passagère : ne bloque pas les ventes, relue dans quelques secondes.
let reads = 0;
const blip = d1(ledgerDb(all(MIN)), () => { reads++; throw new Error('D1_ERROR: network connection lost'); });
assert.equal(await through(blip), 'route reached', 'une lecture qui échoue ne refuse pas');
assert.equal(await through(blip), 'route reached'); assert.equal(reads, 1, 'pas relue à chaque requête');
const realNow = Date.now;
try {
  Date.now = () => realNow() + 6000;
  assert.equal(await through(blip), 'route reached'); assert.equal(reads, 2, 'relue après quelques secondes');
  const sqlite = ledgerDb(all(MIN)), live = d1(sqlite);
  Date.now = realNow;
  assert.equal(await schemaCompatibility(live), null);
  sqlite.exec("DELETE FROM d1_migrations WHERE name LIKE '0021%'");
  assert.equal(await schemaCompatibility(live), null, 'dans la fenêtre, le résultat est réutilisé');
  Date.now = () => realNow() + 11 * 60000;
  assert.equal((await schemaCompatibility(live)).status, 503, 'après la fenêtre, la dérive est détectée');
} finally { Date.now = realNow; }

// A0: the ledger is a claim, the table shape is the proof. Every required
// migration recorded but a column physically gone (restored backup, hand-edited
// base): refused before a route fails on it.
for (const [what, drop] of [
  ['sales.client_id', 'ALTER TABLE sales DROP COLUMN client_id'],
  ['sales.received_ts', 'ALTER TABLE sales DROP COLUMN received_ts'],
  ['clients.spend_cents', 'ALTER TABLE clients DROP COLUMN spend_cents'],
  ['pay_statements.issued_by', 'ALTER TABLE pay_statements DROP COLUMN issued_by'],
  ['pay_statements table', 'DROP TABLE pay_statements'],
]) {
  const sqlite = ledgerDb(all(MIN)); sqlite.exec(drop);
  const out = await through(d1(sqlite));
  assert.equal(out.status, 503, `ledger complete but ${what} missing refuses`);
  assert.equal((await out.json()).code, 'incompatible_schema');
}
// A shape probe that FAILS (a blip, not "no such column") is not proof of absence.
{
  let probes = 0;
  const flaky = d1(ledgerDb(all(MIN)), (sql) => { if (!/d1_migrations/.test(sql)) { probes++; throw new Error('D1_ERROR: network connection lost'); } });
  assert.equal(await through(flaky), 'route reached', 'a probe fault lets sales through');
  assert.ok(probes >= 1);
}

// B0: a ledger read fault is a blip ONLY when nothing says the schema is incomplete.
// (1) last seen refused (incomplete ledger): a fault is no evidence the migration landed.
{
  const sqlite = ledgerDb(all(MIN).filter(n => n !== 21));
  let fault = false;
  const warm = d1(sqlite, (sql) => { if (fault && /d1_migrations/.test(sql)) throw new Error('D1_ERROR: timeout'); });
  assert.equal((await through(warm)).status, 503, 'incomplete ledger refused');
  fault = true;
  Date.now = () => realNow() + 61000;
  try {
    assert.equal((await through(warm)).status, 503, 'incomplete schema + ledger read fault stays refused');
    fault = false; sqlite.prepare("INSERT INTO d1_migrations (name) VALUES ('0021_x.sql')").run();
    Date.now = () => realNow() + 130000;
    assert.equal(await through(warm), 'route reached', 'recovers as soon as the ledger reads complete');
  } finally { Date.now = realNow; }
}
// (2) a binding that never once read its ledger and keeps faulting is unknown, not a blip.
{
  const cold = d1(ledgerDb(all(MIN)), () => { throw new Error('D1_ERROR: timeout'); });
  let t = realNow();
  try {
    const seen = [];
    for (let i = 0; i < 3; i++) { Date.now = () => t; seen.push(await through(cold)); t += 6000; }
    assert.equal(seen[0], 'route reached'); assert.equal(seen[1], 'route reached', 'first faults are blips');
    assert.equal(seen[2].status, 503, 'third consecutive fault with no good read ever is an unknown state');
  } finally { Date.now = realNow; }
}
// (3) a warm, previously good binding riding out the same faults keeps selling.
{
  const sqlite = ledgerDb(all(MIN)); let fault = false;
  const good = d1(sqlite, (sql) => { if (fault && /d1_migrations/.test(sql)) throw new Error('D1_ERROR: timeout'); });
  assert.equal(await through(good), 'route reached');
  fault = true; let t = realNow() + 11 * 60000;
  try { for (let i = 0; i < 5; i++) { Date.now = () => t; assert.equal(await through(good), 'route reached', 'blip on a known-good binding'); t += 6000; } }
  finally { Date.now = realNow; }
}
console.log('schema ledger contract ok');
