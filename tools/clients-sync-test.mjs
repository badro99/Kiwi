#!/usr/bin/env node
/* Kiwi · client-book cursor allocation and tombstone ordering. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { nextSrvTs } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
function makeDB() {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
        first() { return sqlite.prepare(sql).get(...args) || null; },
      };
      return statement;
    },
  };
}

let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? (passed++, console.log('  ✓ ' + label)) : failed.push(label);
const env = { DB: makeDB() };

const values = await Promise.all(Array.from({ length: 40 }, () => nextSrvTs(env, 'atlas')));
ok('concurrent allocations are all unique', new Set(values).size === values.length);
ok('concurrent allocations are strictly contiguous',
  Math.max(...values) - Math.min(...values) === values.length - 1);

const other = await nextSrvTs(env, 'rif');
ok('each merchant has an independent cursor', other <= Math.max(...values));

const future = Date.now() + 60_000;
sqlite.prepare(`INSERT INTO clients
  (merchant,id,name,updated_ts,srv_ts,deleted) VALUES (?,?,?,?,?,0)`)
  .run('atlas', 'future-clock', 'Client', future, Math.max(...values));
const deletionCursor = await nextSrvTs(env, 'atlas');
sqlite.prepare(`UPDATE clients
  SET deleted=1,
      updated_ts=CASE WHEN updated_ts >= ? THEN updated_ts + 1 ELSE ? END,
      srv_ts=? WHERE merchant=? AND id=?`)
  .run(Date.now(), Date.now(), deletionCursor, 'atlas', 'future-clock');
const tombstone = sqlite.prepare('SELECT updated_ts, deleted FROM clients WHERE merchant=? AND id=?')
  .get('atlas', 'future-clock');
ok('deletion outranks a client whose device clock is in the future',
  tombstone.deleted === 1 && tombstone.updated_ts > future);

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} client sync checks green`);
