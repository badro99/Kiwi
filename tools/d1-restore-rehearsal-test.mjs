#!/usr/bin/env node
/* Local only. Plain SQL export/import, file-atomic upgrade failure, and a harsher
 * interrupted/autocommit prefix probe. No Cloudflare client or merchant data.
 * --mutant-drop-table / --mutant-skip-rows deliberately makes the restore assertion fail (exit 1).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS_DIR, listMigrations, shapeOf, compareShapes, applySchema } from './d1-migrations.mjs';

const files = listMigrations();
const read = name => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
const q = name => `"${name.replaceAll('"', '""')}"`;
const dbs = [];
function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  dbs.push(db);
  return db;
}
const tables = db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const columns = (db, t) => db.prepare('SELECT * FROM pragma_table_info(?)').all(t).map(c => c.name);

/* Tokenize strings/comments before splitting: semicolons inside strings and
 * trigger BEGIN...END bodies must stay inside their original SQL statement. */
function statements(sql) {
  const tokens = sql.match(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|\b\w+\b|[^\w]/g) || [];
  const result = [];
  let part = '', trigger = false, depth = 0;
  for (const token of tokens) {
    if (token.startsWith('--') || token.startsWith('/*')) { part += ' '; continue; }
    part += token;
    if (/^\s*CREATE\s+TRIGGER\b/i.test(part)) trigger = true;
    if (trigger && /^(BEGIN|CASE)$/i.test(token)) depth++;
    if (trigger && /^END$/i.test(token)) depth--;
    if (token === ';' && !depth) { result.push(part.trim()); part = ''; trigger = false; }
  }
  assert.equal(part.trim(), '', 'migration has an unterminated statement');
  return result;
}

function history(db) {
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
}
function applyFile(db, name, failAfter = -1) {
  db.exec('BEGIN');
  try {
    for (const [i, sql] of statements(read(name)).entries()) {
      db.exec(sql);
      if (i === failAfter) db.exec('SELECT * FROM synthetic_missing_upgrade_table');
    }
    db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(name);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function baseline() {
  const db = fresh();
  history(db);
  applyFile(db, files[0]);
  return db;
}

/* Every baseline table is seeded, so new money/staff/customer/stock tables
 * cannot silently escape coverage. Three tenants/rows include NULL, Unicode,
 * apostrophes, newlines, non-round money and negative stock. Credential fields
 * contain nonfunctional synthetic markers only; no row values are logged. */
function seed(db) {
  db.exec('BEGIN; PRAGMA defer_foreign_keys=ON');
  for (const t of tables(db).filter(t => t !== 'd1_migrations')) {
    const info = db.prepare('SELECT * FROM pragma_table_info(?)').all(t);
    const ddl = db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(t).sql;
    const fks = db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(t);
    for (let n = 1; n <= 3; n++) {
      const row = {};
      for (const c of info) {
        let value = /INT|REAL|NUM|FLOAT|DOUBLE/i.test(c.type) ? n : `synth-${c.name}-${n}`;
        if (c.dflt_value != null) value = db.prepare(`SELECT ${c.dflt_value} AS v`).get().v;
        if (c.pk) value = /INT/i.test(c.type) ? n : `synth-${c.name}-${n}`;
        if (!c.notnull && !c.pk && n === 3) value = null;
        const enumMatch = ddl.match(new RegExp(`CHECK\\s*\\(\\s*${c.name}\\s+IN\\s*\\(\\s*'([^']+)'`, 'i'));
        if (enumMatch) value = enumMatch[1];
        if (/cents$/.test(c.name)) value = n * 101;
        if (c.name === 'qty_milli') value = n === 2 ? -1250 : 2500;
        if (c.name === 'priority') value = n;
        if (['name', 'body', 'label', 'note'].includes(c.name)) value = n === 3 && !c.notnull ? null : `Synth ${n} · l'été العربية\nligne; suite`;
        if (['data', 'payload', 'snapshot', 'customer', 'features', 'conversion_snapshot'].includes(c.name)) value = JSON.stringify({ synthetic: n, text: "l'été العربية" });
        if (['items', 'lines', 'lines_json'].includes(c.name)) value = JSON.stringify([{ id: `synth-item-${n}`, qty: n, price: 1.01 }]);
        if (['pin', 'pin_digest', 'salt', 'hash'].includes(c.name)) value = `synthetic-unusable-${n}`;
        const fk = fks.find(f => f.from === c.name);
        if (fk) value = /INT/i.test(db.prepare('SELECT * FROM pragma_table_info(?)').all(fk.table).find(x => x.name === fk.to)?.type || '') ? n : `synth-${fk.to}-${n}`;
        row[c.name] = value;
      }
      if (t === 'sales') Object.assign(row, {
        amount: n * 101 / 100, amount_cents: n * 101,
        gross_amount_cents: n * 101 + 25, discount_amount_cents: 25,
        method: n === 2 ? 'split' : 'cash', tip_cents: n * 10,
        payment_parts: JSON.stringify(n === 2
          ? [{ method: 'cash', amount_cents: 100 }, { method: 'card', amount_cents: 102 }]
          : [{ method: 'cash', amount_cents: n * 101 }]),
        void_ts: n === 3 ? 1760000000000 : null,
      });
      if (t === 'store_docs') Object.assign(row, {
        feature: ['stock', 'team', 'customers'][n - 1],
        data: JSON.stringify(n === 1 ? { items: [{ id: 'synth-item-1', qty: 2.5, cost: 1.01 }] }
          : n === 2 ? { members: [{ id: 'synth-staff-2', name: 'Synth Staff', role: 'cashier' }] }
            : { clients: [{ id: 'synth-client-3', credit_cents: 303 }] }),
      });
      db.prepare(`INSERT INTO ${q(t)} (${info.map(c => q(c.name)).join(',')}) VALUES (${info.map(() => '?').join(',')})`).run(...info.map(c => row[c.name]));
    }
  }
  db.exec('COMMIT');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
}

function snapshot(db, projection) {
  return Object.fromEntries((projection ? Object.keys(projection) : tables(db)).map(t => {
    const cols = projection?.[t].cols || columns(db, t);
    const rows = db.prepare(`SELECT ${cols.map(q).join(',')} FROM ${q(t)}`).all()
      .map(row => JSON.stringify(cols.map(c => row[c]))).sort();
    return [t, { cols, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), rows }];
  }));
}
function same(db, expected, project = false) {
  const actual = snapshot(db, project ? expected : undefined);
  assert.deepEqual(actual, expected, 'table counts, SHA-256 hashes and sorted rows must match');
}

/* D1 export-compatible plain SQL: deferred FK checking, CREATE TABLE, INSERT
 * VALUES, then indexes/triggers. Do not install triggers before loading data.
 * SQLite quote() handles NULL, numeric values, apostrophes and blobs. Preserve
 * sqlite_sequence as well, including deleted high-water AUTOINCREMENT ids. */
function dump(db, omit = '') {
  const sql = ['PRAGMA defer_foreign_keys=TRUE;'];
  for (const t of tables(db)) {
    if (t === omit) continue;
    sql.push(db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(t).sql + ';');
  }
  for (const t of tables(db).filter(t => t !== omit)) {
    const cols = columns(db, t);
    if (t === 'clients' && process.argv.includes('--mutant-skip-rows')) continue;
    for (const row of db.prepare(`SELECT ${cols.map(c => `quote(${q(c)}) AS ${q(c)}`).join(',')} FROM ${q(t)}`).all()) {
      sql.push(`INSERT INTO ${q(t)} (${cols.map(q).join(',')}) VALUES (${cols.map(c => row[c]).join(',')});`);
    }
  }
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
    sql.push('DELETE FROM sqlite_sequence;');
    for (const r of db.prepare('SELECT quote(name) AS n, quote(seq) AS s FROM sqlite_sequence').all()) sql.push(`INSERT INTO sqlite_sequence VALUES(${r.n},${r.s});`);
  }
  sql.push(...db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name").all().map(r => r.sql + ';'));
  return sql.join('\n');
}
function restore(sql) {
  const db = fresh();
  db.exec('BEGIN');
  db.exec(sql);
  db.exec('COMMIT');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  return db;
}
function appShape(db) {
  const shape = shapeOf(db);
  shape.tables.delete('d1_migrations');
  for (const [name, index] of shape.indexes) if (index.table === 'd1_migrations') shape.indexes.delete(name);
  return shape;
}

try {
  const source = baseline();
  seed(source);
  const before = snapshot(source);
  const backup = dump(source, process.argv.includes('--mutant-drop-table') ? 'clients' : '');
  const restored = restore(backup);
  same(restored, before);
  assert.deepEqual(compareShapes(shapeOf(source), shapeOf(restored)), []);
  console.log(`✓ SQL backup/restore: ${Object.keys(before).length} tables, counts + SHA-256 + every row equal`);
  for (const [t, s] of Object.entries(before)) console.log(`  ${t}: ${s.count} rows ${s.hash}`);

  // File 0002 contains real ALTERs. File 0001 stays committed after its failure.
  const failed = restore(backup);
  assert.throws(() => applyFile(failed, files[1], Math.floor(statements(read(files[1])).length / 2)), /synthetic_missing_upgrade_table/);
  same(failed, before);
  assert.deepEqual(failed.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(r => r.name), [files[0]]);
  console.log(`✓ failure inside ${files[1]}: its DDL rolled back; baseline rows and committed history remain`);

  const originalRows = { ...before };
  delete originalRows.d1_migrations;
  const want = appShape(applySchema(fresh()));
  const unsafe = new Set();
  /* The backup was restored from SQL and proven above; every probe below starts
   * from an exact copy of that restored database instead of executing the dump
   * again (same bytes, a fraction of the time). Recovery from the backup and the
   * per-file control never depend on the prefix, so each is built once. */
  const image = restored.serialize();
  const fromBackup = () => { const db = fresh(); db.deserialize(image); db.exec('PRAGMA foreign_keys=ON'); return db; };
  const recoveredOnce = fromBackup();
  same(recoveredOnce, before);
  for (const pending of files.slice(1)) applyFile(recoveredOnce, pending);
  assert.deepEqual(compareShapes(want, appShape(recoveredOnce)), []);
  same(recoveredOnce, originalRows, true);
  const controls = new Map();
  const controlFor = (f) => {
    if (!controls.has(f)) {
      const control = fromBackup();
      for (let p = 1; p <= f; p++) applyFile(control, files[p]);
      controls.set(f, { rows: snapshot(control, originalRows), shape: appShape(control) });
    }
    return controls.get(f);
  };
  // Probe EVERY nonempty prefix, including full apply (lost acknowledgement).
  for (let f = 0; f < files.length; f++) {
    const name = files[f], parts = statements(read(name));
    for (let k = 1; k <= parts.length; k++) {
      const probe = fromBackup();
      for (let p = 1; p < f; p++) applyFile(probe, files[p]);
      for (const sql of parts.slice(0, k)) probe.exec(sql);
      if (f === 1 && k === Math.floor(parts.length / 2)) {
        assert.ok(compareShapes(appShape(source), appShape(probe)).length > 0);
        assert.deepEqual(probe.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(r => r.name), [files[0]]);
        console.log(`! simulated non-atomic interruption: ${name}, ${k}/${parts.length} statements persist, no completion record`);
      }
      let replayError;
      try { probe.exec(read(name)); } catch (error) { replayError = error; }
      if (replayError) {
        // Known historical ALTERs are documented, never silently ignored.
        assert.match(replayError.message, /duplicate column name/);
        unsafe.add(name);
      } else {
        const control = controlFor(f);
        same(probe, control.rows, true);
        assert.deepEqual(compareShapes(control.shape, appShape(probe)), []);
      }
      // Fresh restore is recovery even for the harsher non-atomic prefix: it
      // never reads the damaged probe, so it was proven once, above the loop.
      probe.close(); dbs.splice(dbs.indexOf(probe), 1);
    }
    console.log(`${unsafe.has(name) ? '! NOT safe to replay after partial apply' : '✓ safe to replay every prefix'}: ${name}`);
  }
  assert.deepEqual([...unsafe], files.filter(n => /^(0002|0007|0008|0009|0010)_/.test(n)), 'review replay classification when migrations change');
  console.log('✓ every interrupted prefix recovers from SQL backup, reaches schema.sql, and preserves every original row');
} catch (error) {
  // Assertions may hold credential-shaped synthetic fields: never dump rows.
  console.error(`✗ restore rehearsal: ${error.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  for (const db of dbs) db.close();
}
