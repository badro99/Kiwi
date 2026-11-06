// Contrat de déploiement du registre des migrations : le vrai middleware, un vrai SQLite.
// Registre absent, trous dans l'historique, complet, et panne passagère de D1.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { schemaCompatibility, MINIMUM_SCHEMA_VERSION as MIN } from '../functions/_schema-version.js';
import { onRequest } from '../functions/api/_middleware.js';

const d1 = (sqlite, hook) => ({ prepare(sql) { return { async all() { if (hook) hook(); return { results: sqlite.prepare(sql).all() }; } }; } });
const ledgerDb = (numbers) => {
  const sqlite = new DatabaseSync(':memory:');
  if (numbers) {
    sqlite.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)');
    for (const n of numbers) sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(String(n).padStart(4, '0') + '_x.sql');
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
console.log('schema ledger contract ok');
