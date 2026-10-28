// Every runtime declaration is parsed as JavaScript, then interpreted by SQLite.
// Comments, concatenated strings, constants and interpolated table names are covered.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, MIGRATIONS_DIR, freshDb, applySchema, applyMigrations, shapeOf, listMigrations } from './d1-migrations.mjs';
let scan;
try { ({ scan } = createRequire(import.meta.url)('./runtime-ddl-parser.cjs')); }
catch (e) {
  if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
  console.log('  ○ skip  typescript unavailable (npm --prefix app ci, or in a worktree ln -s <main checkout>/app/node_modules app/node_modules), runtime DDL not executed');
  process.exit(0);
}
const canonical = applySchema(freshDb()), expected = shapeOf(canonical);
const applied = freshDb();
for (const file of listMigrations().filter(f => Number(f.slice(0, 4)) <= 10)) applied.exec(fs.readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
const owned = new Set(applied.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all().map(r => r.name));
const problems = [], retained = new Set();
let count = 0;
function differences(sql) {
  const db = freshDb();
  try {
    const index = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)/i.exec(sql);
    if (index) {
      db.exec(fs.readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
      db.exec(`DROP INDEX IF EXISTS ${index[1]}`);
      db.exec(sql);
      return JSON.stringify(shapeOf(db).indexes.get(index[1])) === JSON.stringify(expected.indexes.get(index[1])) ? [] : ['index differs'];
    }
    db.exec(sql);
    const got = shapeOf(db), errors = [];
    for (const [table, shape] of got.tables) {
      const want = expected.tables.get(table);
      if (!want || JSON.stringify([...shape.columns].sort()) !== JSON.stringify([...want.columns].sort())) errors.push(`${table}: columns differ`);
      if (JSON.stringify(shape.foreignKeys) !== JSON.stringify(want?.foreignKeys)) errors.push(`${table}: foreign keys differ`);
      const implicit = s => [...s.indexes].filter(([k,v]) => v.table === table && !k.startsWith('idx_') && !/^CREATE/i.test(v.describe)).sort();
      if (JSON.stringify(implicit(got)) !== JSON.stringify(implicit(expected))) errors.push(`${table}: constraints differ`);
    }
    return errors;
  } finally { db.close(); }
}
for (const file of fs.readdirSync(join(ROOT, 'functions'), { recursive: true }).filter(f => f.endsWith('.js')).sort()) {
  for (const {sql} of scan(join(ROOT, 'functions', file)).out) {
    count++;
    for (const error of differences(sql)) problems.push(`${file}: ${error}`);
    const name = /^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\s+(?:IF NOT EXISTS\s+)?(\w+)/i.exec(sql)?.[1];
    // Owner explicitly froze these modules; retain their declarations but compare them.
    const frozen = file.startsWith('api/ai/') || file === 'api/_support.js';
    if (owned.has(name) && !frozen) problems.push(`${file}: ${name} already owned by migrations <= 0010`);
    retained.add(name);
  }
}
// Negative controls exercise each requested dimension independently.
for (const sql of [
  'CREATE TABLE ticket_sequences (merchant TEXT, period INTEGER, next_value INTEGER, updated_ts INTEGER)',
  'CREATE TABLE ticket_sequences (merchant INTEGER NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY(merchant,period))',
  'CREATE TABLE ticket_sequences (merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL DEFAULT 4, updated_ts INTEGER NOT NULL, PRIMARY KEY(merchant,period))',
  'CREATE INDEX idx_sales_merchant ON sales(ts)',
  'CREATE UNIQUE INDEX idx_sales_merchant ON sales(merchant)',
]) assert.ok(differences(sql).length, 'comparator must reject drift');
console.log(`${count} declarations checked; retained: ${[...retained].sort().join(', ')}`);
for (const error of problems) console.error(error);
assert.equal(problems.length, 0, 'runtime DDL must match schema.sql and respect migration ownership');
// Execute the allocation route helper against migrations, rejecting every DDL
// attempt before SQLite can hide it behind IF NOT EXISTS.
const { nextOrderNumber } = await import('../functions/api/order/_guest-clock.js');
const db = applyMigrations(freshDb());
const initial = shapeOf(db);
const DB = { prepare(sql) {
  assert.doesNotMatch(sql, /^\s*(CREATE|ALTER)\b/i);
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { return { meta: db.prepare(sql).run(...args) }; },
  };
} };
try {
  const now = Date.UTC(2026, 9, 26, 12);
  for (const merchant of ['ddl-proof-a', 'ddl-proof-b']) {
    for (let number = 1; number <= 3; number++) {
      assert.equal(await nextOrderNumber({ DB }, merchant, now), number);
    }
  }
  assert.deepEqual(shapeOf(db), initial, 'allocation must preserve the migrated schema');
} finally { db.close(); }
canonical.close(); applied.close();
