#!/usr/bin/env node
/* tools/coverage-report-test.mjs · cheap self-test of the V8 coverage tool.
 * Runs a two-function fixture under NODE_V8_COVERAGE (a fraction of a second),
 * merges it with tools/coverage-lib.mjs and checks the numbers and the ratchet.
 * The real measurement is `npm run coverage` (minutes, outside the default tiers). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, FLOOR_FILE, mergeDirs, summarise, checkFloors, raiseFloors, repoPath } from './coverage-lib.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-covtest-'));
try {
  fs.mkdirSync(path.join(root, 'functions'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'functions/fix.mjs'), [
    'export function used(a) {',
    '  const b = a + 1;',
    '  return b;',
    '}',
    'export function unused(a) {',
    '  const c = a * 2;',
    '  const d = c + 1;',
    '  return d;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'assets/never.mjs'), 'export const a = 1;\nexport function f() { return 2; }\n');
  fs.writeFileSync(path.join(root, 'driver.mjs'), "import { used } from './functions/fix.mjs';\nif (used(1) !== 2) process.exit(2);\n");
  const covDir = path.join(root, 'cov');
  const r = spawnSync(process.execPath, [path.join(root, 'driver.mjs')], { env: { ...process.env, NODE_V8_COVERAGE: covDir }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);

  const merged = mergeDirs([covDir], root);
  assert.ok(merged.processes >= 1, 'a coverage file was written');
  const files = summarise(merged, root);
  const fix = files['functions/fix.mjs'];
  assert.equal(fix.loaded, true);
  assert.equal(fix.functions, 3, 'top-level body, used, unused');
  assert.equal(fix.functionsCovered, 2, 'unused() never ran');
  assert.equal(fix.lines, 7, 'the closing braces do not count');
  assert.equal(fix.linesCovered, 4, 'used() (3 lines) plus the `export` of unused(), which ran; its body did not');
  const never = files['assets/never.mjs'];
  assert.equal(never.loaded, false, 'a file no process loaded is reported, not hidden');
  assert.equal(never.linesCovered, 0);

  /* The ratchet. */
  const floors = { files: { 'functions/fix.mjs': { coveredFunctions: 2, totalFunctions: 3 } } };
  assert.deepEqual(checkFloors(files, floors), []);
  const high = { files: { 'functions/fix.mjs': { coveredFunctions: 3, totalFunctions: 3 } } };
  assert.equal(checkFloors(files, high).length, 1, 'below the floor fails');
  assert.equal(checkFloors(files, { files: { 'functions/gone.mjs': { coveredFunctions: 1 } } }).length, 1, 'a vanished file fails');
  const raised = raiseFloors({ 'functions/fix.mjs': { functionsCovered: 3, functions: 3 } }, floors);
  assert.equal(raised.files['functions/fix.mjs'].coveredFunctions, 3, 'floors go up');
  const kept = raiseFloors({ 'functions/fix.mjs': { functionsCovered: 1, functions: 3 } }, floors);
  assert.equal(kept.files['functions/fix.mjs'].coveredFunctions, 2, 'floors never go down');

  assert.equal(repoPath('file://' + path.join(fs.realpathSync(root), 'functions/fix.mjs'), root), 'functions/fix.mjs');
  assert.equal(repoPath('file://' + path.join(fs.realpathSync(root), 'driver.mjs'), root), null, 'only functions/ and assets/');
  assert.equal(repoPath('node:fs', root), null);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

/* The pinned money/auth files exist, and the script is wired. */
const floors = JSON.parse(fs.readFileSync(FLOOR_FILE, 'utf8'));
for (const rel of Object.keys(floors.files)) {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is pinned in code-coverage-floor.json but missing`);
  assert.ok(Number.isInteger(floors.files[rel].coveredFunctions) && floors.files[rel].coveredFunctions >= 0, `${rel}: floor must be an integer`);
}
for (const must of ['functions/api/sale.js', 'functions/api/sale/refund.js', 'functions/auth/_lib.js', 'functions/api/store-credits.js']) {
  assert.ok(floors.files[must], `${must} must stay in the money/auth ratchet`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.equal(pkg.scripts.coverage, 'node tools/coverage-report.mjs');
console.log(`✓ coverage tool · V8 merge, line/function counts, floors that only rise; ${Object.keys(floors.files).length} money/auth files pinned`);
