/* The console checks a merchant exists before writing notes or tasks. A new
 * account answers from its indexed reserved slug; only accounts older than the
 * slug column are slugged by name, and a base without the column still works. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { merchantExists } from '../functions/api/admin/_workspace.js';

function env(withSlug) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT${withSlug ? ', business_slug TEXT' : ''});`);
  const seen = [];
  const DB = { prepare(sql) { seen.push(sql); const st = db.prepare(sql); let args = [];
    return { bind(...a) { args = a; return this; }, async first() { return st.get(...args) || null; }, async all() { return { results: st.all(...args) }; } }; } };
  return { db, seen, env: { DB } };
}
const a = env(true);
a.db.exec(`INSERT INTO accounts VALUES ('n1','new@x.test','Café Neuf','cafe-neuf'), ('o1','old@x.test','Vieux Moulin',NULL)`);
assert.equal(await merchantExists(a.env, 'cafe-neuf'), true, 'indexed slug answers');
assert.ok(!a.seen.some((s) => /FROM accounts$/.test(s.trim())), 'a slugged account never triggers a full scan');
assert.equal(await merchantExists(a.env, 'vieux-moulin'), true, 'a legacy account is still found by name');
assert.ok(a.seen.some((s) => /business_slug IS NULL/.test(s)), 'the legacy fallback reads only unslugged accounts');
assert.equal(await merchantExists(a.env, 'nobody'), false);
const b = env(false);
b.db.exec(`INSERT INTO accounts VALUES ('o1','old@x.test','Vieux Moulin')`);
assert.equal(await merchantExists(b.env, 'vieux-moulin'), true, 'a base without the slug column still answers');
console.log('✓ admin merchantExists: indexed slug, legacy fallback, base without the column');
