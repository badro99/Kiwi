#!/usr/bin/env node
/* check.js en parallèle (tools/check-guard.js · prefetch, tools/check-pool.js).
 *
 * Un petit « check.js » jetable, qui exige le vrai garde, lance cinq tests
 * enfants l'un après l'autre comme le vrai. On prouve que :
 *   · en parallèle, chaque test qui passe ne tourne qu'UNE fois, et le tout
 *     va plus vite que la somme ;
 *   · un test rouge en parallèle retourne seul à sa place, et reste rouge ;
 *   · la sortie est la même, dans le même ordre, qu'en série ;
 *   · KIWI_CHECK_JOBS=1 rend la série d'avant, sans pool.
 *   node tools/check-parallel-test.mjs */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(ROOT, 'tools/check-guard.js');

let passed = 0, failed = 0;
function ok(label, fn) { try { fn(); passed++; console.log(`  ✓ ${label}`); } catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); } }

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kiwi-par-'));
  const runs = path.join(dir, 'runs');
  const child = (name, body) => {
    const f = path.join(dir, name);
    writeFileSync(f, `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(runs)}, ${JSON.stringify(name)} + '\\n');\n${body}\n`);
    return f;
  };
  const slow = [1, 2, 3, 4].map((i) => child(`slow-${i}-test.mjs`, `await new Promise((r) => setTimeout(r, 900)); console.log('✓ slow ${i} done');`));
  const red = child('red-test.mjs', `console.log('✗ red is red'); process.exit(1);`);
  const check = path.join(dir, 'check.js');
  writeFileSync(check, `'use strict';
process.env.KIWI_CHECK_NO_LOCK = '1';
require(${JSON.stringify(GUARD)}).install({ log: () => {} });
require(${JSON.stringify(GUARD)}).prefetch({ log: (m) => console.log(m) });
const { spawnSync } = require('child_process');
const files = ${JSON.stringify([...slow.slice(0, 2), red, ...slow.slice(2)])};
let failures = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  console.log('RESULT ' + f.replace(/^.*\\//, '') + ' ' + r.status + ' ' + (r.stdout || '').trim());
  if (r.status !== 0) failures++;
}
console.log('FAILURES ' + failures);
process.exit(failures ? 1 : 0);
`);
  return { dir, runs, check };
}

function run(jobs) {
  const fx = fixture();
  const env = Object.assign({}, process.env, { KIWI_CHECK_JOBS: String(jobs), KIWI_CHECK_BROWSER_JOBS: '1' });
  delete env.KIWI_CHECK_PHASE; delete env.KIWI_CHECK_RECORD;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [fx.check], { encoding: 'utf8', env, timeout: 60000 });
  const ms = Date.now() - t0;
  const counts = {};
  for (const n of (existsSync(fx.runs) ? readFileSync(fx.runs, 'utf8') : '').split('\n').filter(Boolean)) counts[n] = (counts[n] || 0) + 1;
  const results = (r.stdout || '').split('\n').filter((l) => l.startsWith('RESULT ') || l.startsWith('FAILURES '));
  rmSync(fx.dir, { recursive: true, force: true });
  return { r, ms, counts, results, out: r.stdout || '' };
}

console.log('■ check.js en parallèle');
const serial = run(1);
const par = run(5);

ok('serial: each test runs once, the red one fails the run', () => {
  assert.equal(serial.r.status, 1);
  assert.deepEqual(Object.values(serial.counts), [1, 1, 1, 1, 1]);
  assert.doesNotMatch(serial.out, /in parallel/);
});
ok('parallel: the same verdict and the same output, in the same order', () => {
  assert.equal(par.r.status, 1);
  assert.deepEqual(par.results, serial.results);
});
ok('parallel: a passing test runs exactly once', () => {
  for (const i of [1, 2, 3, 4]) assert.equal(par.counts[`slow-${i}-test.mjs`], 1, `slow-${i} ran ${par.counts[`slow-${i}-test.mjs`]} times`);
});
ok('parallel: a red test runs again alone, and stays red', () => {
  assert.equal(par.counts['red-test.mjs'], 2);
  assert.match(par.out, /red-test\.mjs did not pass in parallel/);
  assert.ok(par.results.includes('RESULT red-test.mjs 1 ✗ red is red'));
});
ok(`parallel is faster than the sum (${par.ms} ms vs ${serial.ms} ms serial)`, () => {
  assert.ok(par.ms < serial.ms - 1500, `${par.ms} ms is not clearly below ${serial.ms} ms`);
});

console.log(failed ? `\n✗ ${failed} échec(s) sur ${passed + failed}` : `\ncheck-parallel: ${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
