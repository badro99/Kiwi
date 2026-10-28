#!/usr/bin/env node
/* tools/coverage-report.mjs · `npm run coverage` · real code coverage (V8).
 *
 *   node tools/coverage-report.mjs                run the money/auth suites, print the ratchet
 *   node tools/coverage-report.mjs --all          run every non-browser suite check.js names (slow)
 *   node tools/coverage-report.mjs --suites a.mjs,b.mjs
 *   node tools/coverage-report.mjs --from <dir>   merge coverage already written to <dir>
 *   node tools/coverage-report.mjs --update       raise the floors to what this run covered
 *   options: --jobs N (default 3) · --out file.json (full per-file summary)
 *
 * Each suite runs as its own node process with NODE_V8_COVERAGE set, so
 * children of children are measured too. Browser suites are left out (their
 * page code runs in Chromium, not Node). The default set is every non-browser
 * suite whose source names one of the ratchet files, which is where the money
 * and auth paths are exercised; --all can only measure more, never less.
 * The ratchet is tools/code-coverage-floor.json: for sale.js, refund.js,
 * auth/_lib.js and the store-credit files, a covered-function floor that only
 * moves up. The run exits 1 when one of them drops below its floor.
 * Not part of any default tier (minutes); tools/coverage-report-test.mjs is
 * the cheap self-test check.js runs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, FLOOR_FILE, mergeDirs, summarise, totals, readFloors, checkFloors, raiseFloors } from './coverage-lib.mjs';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

/* Gate suites named in check.js that are plain node processes. */
export function nodeSuites() {
  const { isSlow } = require('./check-guard.js');
  const check = fs.readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
  const named = [...new Set([...check.matchAll(/['"`](?:tools\/)?([\w.-]+-test\.(?:mjs|js|cjs))['"`]/g)].map((m) => m[1]))];
  return named.map((f) => path.join(ROOT, 'tools', f)).filter((f) => fs.existsSync(f) && !isSlow(f) && !/kiwi:network-only/.test(fs.readFileSync(f, 'utf8').slice(0, 600)));
}

function selectDefault(floors) {
  const stems = Object.keys(floors.files || {}).map((r) => r.replace(/^functions\//, '').replace(/\.js$/, ''));
  return nodeSuites().filter((f) => { const src = fs.readFileSync(f, 'utf8'); return stems.some((s) => src.includes(s)); });
}

function runAll(files, dir, jobs) {
  let next = 0, done = 0, failed = [];
  return new Promise((resolve) => {
    const launch = () => {
      if (next >= files.length) { if (done === files.length) resolve(failed); return; }
      const f = files[next++];
      const child = spawn(process.execPath, [f], { cwd: ROOT, env: { ...process.env, NODE_V8_COVERAGE: dir }, stdio: 'ignore' });
      const kill = setTimeout(() => child.kill('SIGKILL'), 240000);
      child.on('exit', (code) => {
        clearTimeout(kill);
        if (code !== 0) failed.push(path.basename(f));
        done++;
        if (done % 25 === 0 || done === files.length) process.stderr.write(`  ${done}/${files.length} suites\n`);
        launch();
      });
    };
    for (let i = 0; i < Math.min(jobs, files.length); i++) launch();
    if (!files.length) resolve(failed);
  });
}

const floors = readFloors();
let dirs, failed = [], ran = 0, tmp = null;
if (opt('--from')) dirs = [path.resolve(opt('--from'))];
else {
  const files = flag('--all') ? nodeSuites()
    : opt('--suites') ? opt('--suites').split(',').map((f) => path.resolve(ROOT, f.includes('/') ? f : path.join('tools', f)))
    : selectDefault(floors);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-v8cov-'));
  dirs = [tmp];
  ran = files.length;
  console.log(`coverage · running ${ran} suites, ${opt('--jobs', '3')} at a time`);
  failed = await runAll(files, tmp, Math.max(1, Number(opt('--jobs', '3')) || 3));
}

const merged = mergeDirs(dirs);
const files = summarise(merged);
const t = totals(files);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + '%';
console.log(`coverage · ${merged.processes} node processes${ran ? `, ${failed.length} of ${ran} suites exited non-zero (their coverage still counts)` : ''}`);
console.log(`  functions/ + assets/: ${t.loaded}/${t.files} files loaded · lines ${pct(t.linesCovered, t.lines)} · functions in loaded files ${pct(t.functionsCovered, t.functions)}`);
for (const scope of ['functions', 'assets']) {
  const s = totals(Object.fromEntries(Object.entries(files).filter(([r]) => r.startsWith(scope + '/'))));
  console.log(`  ${scope.padEnd(9)} ${s.loaded}/${s.files} files · lines ${pct(s.linesCovered, s.lines)} · functions in loaded files ${pct(s.functionsCovered, s.functions)}`);
}
console.log('  money/auth ratchet:');
for (const [rel, pin] of Object.entries(floors.files || {})) {
  const f = files[rel] || { functionsCovered: 0, functions: 0, linesCovered: 0, lines: 0 };
  console.log(`    ${rel.padEnd(42)} functions ${String(f.functionsCovered).padStart(3)}/${String(f.functions).padEnd(3)} (floor ${pin.coveredFunctions}) · lines ${pct(f.linesCovered, f.lines)}`);
}
if (opt('--out')) fs.writeFileSync(path.resolve(opt('--out')), JSON.stringify({ totals: t, files }, null, 2) + '\n');
if (flag('--update')) {
  fs.writeFileSync(FLOOR_FILE, JSON.stringify(raiseFloors(files, floors), null, 2) + '\n');
  console.log('floors raised where this run covered more (they never go down)');
} else {
  const problems = checkFloors(files, floors);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (problems.length) { for (const p of problems) console.log('  ✗ ' + p); process.exit(1); }
  console.log('  ✓ every ratchet file at or above its floor');
}
if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
