#!/usr/bin/env node
/* Kiwi · public and till API boundary regressions. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as sale } from '../functions/api/sale.js';
import { onRequestGet as mediaGet } from '../functions/api/media/[[key]].js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...values) { args = values; return st; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return st;
  },
};
const callSale = async (body) => sale({
  env: { DB },
  request: new Request('https://kiwi.test/api/sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
});

let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? (passed++, console.log('  ✓ ' + label)) : failed.push(label);

let r = await callSale({ id: 'too-large', merchant: 'cafe-atlas', amount: 200001 });
ok('sale endpoint rejects implausibly large amounts', r.status === 400);
r = await callSale({ id: 'max-sale', merchant: 'cafe-atlas', amount: 200000, ts: Date.now() + 365 * 86400000 });
ok('sale endpoint accepts its documented upper boundary', r.status === 200);
const row = sqlite.prepare('SELECT amount, ts FROM sales WHERE id=?').get('max-sale');
ok('future device clocks are normalised instead of poisoning reports',
  row && row.amount === 200000 && row.ts <= Date.now() + 1000);

let mediaTouched = false;
r = await mediaGet({
  params: { key: 'bad%ZZ' },
  env: { MEDIA: { get() { mediaTouched = true; } } },
  request: new Request('https://kiwi.test/api/media/bad%25ZZ'),
});
ok('malformed percent-encoding is a 404, not a worker exception', r.status === 404 && !mediaTouched);

for (const rel of ['functions/api/order/index.js', 'functions/api/order/session.js']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(`${rel} does not expose DB errors to anonymous callers`,
    !/write-failed'\s*,\s*detail/.test(src));
}

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} API boundary checks green`);
