// intake_docs belongs to the migrations. ensureIntakeSchema never creates it, never
// shares a verdict between two D1 bindings, and never swallows a missing table.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureIntakeSchema } from '../functions/api/ai/intake.js';

const d1 = (sqlite, log) => ({ prepare(sql) { log && log.push(sql); return { async all() { return { results: sqlite.prepare(sql).all() }; }, async run() { sqlite.exec(sql); return {}; } }; } });

// A base without the table: the helper must refuse loudly and must not create anything.
const bare = new DatabaseSync(':memory:'), bareLog = [];
await assert.rejects(ensureIntakeSchema(d1(bare, bareLog)), /intake_docs/, 'a missing table is an error, not a silent create');
assert.equal(bare.prepare("SELECT count(*) n FROM sqlite_master WHERE name='intake_docs'").get().n, 0, 'no runtime CREATE TABLE');
assert.ok(!bareLog.some(s => /CREATE\s+TABLE/i.test(s)));

// A migrated base passes; its verdict is not leaked to another binding.
const migrated = new DatabaseSync(':memory:');
migrated.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').match(/CREATE TABLE IF NOT EXISTS intake_docs[\s\S]*?\n\);/)[0]);
await ensureIntakeSchema(d1(migrated));
const other = new DatabaseSync(':memory:');
await assert.rejects(ensureIntakeSchema(d1(other)), /intake_docs/, 'a second D1 binding is checked on its own');

console.log('intake schema lifecycle ok');
