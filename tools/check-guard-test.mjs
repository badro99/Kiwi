#!/usr/bin/env node
/* check-guard · check.js must never hang on one child test, and two runs must
 * not drown the machine together (tools/check-guard.js).
 *   node tools/check-guard-test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = require(path.join(ROOT, 'tools/check-guard.js'));
const cp = require('node:child_process');
const realSpawnSync = cp.spawnSync;

let passed = 0, failed = 0;
function ok(label, fn) { try { fn(); passed++; console.log(`  ✓ ${label}`); } catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); } }

const dir = mkdtempSync(path.join(tmpdir(), 'kiwi-guard-'));
const hang = path.join(dir, 'hang-test.mjs');
writeFileSync(hang, 'setInterval(() => {}, 1000);\n');
const quick = path.join(dir, 'quick-test.mjs');
writeFileSync(quick, 'console.log("fine");\n');

guard.install({ timeoutMs: 400, log: () => {} });
ok('a call with no timeout gets one and a hung child is killed', () => {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [hang], { encoding: 'utf8' });
  assert.ok(Date.now() - t0 < 5000, 'returned promptly instead of hanging');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /hang-test\.mjs TIMED OUT after \d+s and was killed/);
});
ok('a normal child is untouched', () => {
  /* Its own guard with a realistic cap: 400 ms is the hang test's budget, and
     a node cold start under a release gate plus xcodebuild took longer than
     that, failing build 37 on a child that was never hung. */
  cp.spawnSync = realSpawnSync;
  guard.install({ timeoutMs: 30000, log: () => {} });
  const r = cp.spawnSync(process.execPath, [quick], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /fine/);
  assert.doesNotMatch(r.stderr || '', /TIMED OUT/);
});
ok('an explicit timeout from the call site is respected', () => {
  const seen = [];
  const spy = guard.install({ timeoutMs: 400, log: () => {}, spawnSync: (c, a, o) => { seen.push(o.timeout); return { status: 0, stdout: '', stderr: '' }; } });
  spy(process.execPath, [quick], { timeout: 123456 });
  spy(process.execPath, [quick], {});
  assert.deepEqual(seen, [123456, 400]);
});
ok('a test that fails on the environment (exit 3) runs once more and can recover', () => {
  const flaky = path.join(dir, 'flaky-test.mjs');
  const mark = path.join(dir, 'flaky.mark');
  writeFileSync(flaky, `import fs from 'node:fs'; if (!fs.existsSync(${JSON.stringify(mark)})) { fs.writeFileSync(${JSON.stringify(mark)}, '1'); process.exit(3); } console.log('second time fine');\n`);
  cp.spawnSync = realSpawnSync;
  const msgs = [];
  guard.install({ timeoutMs: 30000, log: (m) => msgs.push(m) });
  const r = cp.spawnSync(process.execPath, [flaky], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /first run exited 3 on the environment/);
  assert.ok(msgs.some((m) => /flaky-test\.mjs failed on the environment \(exit 3\), running it once more/.test(m)));
});
ok('exit 3 twice stays red and says why; exit 1 is never retried', () => {
  const env = path.join(dir, 'env-test.mjs');
  writeFileSync(env, 'process.exit(3);\n');
  const runs = [];
  const spy = guard.install({ timeoutMs: 30000, log: () => {}, spawnSync: (c, a) => { runs.push(a[0]); return { status: /env-test/.test(a[0]) ? 3 : 1, stdout: '', stderr: '' }; } });
  const r = spy(process.execPath, [env], {});
  assert.equal(r.status, 3);
  assert.match(r.stderr, /env-test\.mjs failed on the environment twice/);
  runs.length = 0;
  const r1 = spy(process.execPath, [quick], {});
  assert.equal(r1.status, 1);
  assert.equal(runs.length, 1, 'an assertion failure ran once');
});
cp.spawnSync = realSpawnSync;

/* ── one run at a time ─────────────────────────────────────────────────────── */
const lockFile = path.join(dir, 'kiwi-check.lock');
ok('a free lock is taken and released', () => {
  const release = guard.acquireLock({ file: lockFile, log: () => {} });
  assert.equal(readFileSync(lockFile, 'utf8'), String(process.pid));
  release();
  assert.equal(existsSync(lockFile), false);
});
ok('a lock left by a dead process is ignored', () => {
  writeFileSync(lockFile, '999999');
  const release = guard.acquireLock({ file: lockFile, log: () => {}, maxWaitMs: 1000 });
  assert.equal(readFileSync(lockFile, 'utf8'), String(process.pid));
  release();
});
const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
ok('a live holder makes the second run wait, then proceed after the cap', () => {
  writeFileSync(lockFile, String(holder.pid));
  const msgs = [];
  const t0 = Date.now();
  guard.acquireLock({ file: lockFile, log: (m) => msgs.push(m), maxWaitMs: 2500 });
  const dt = Date.now() - t0;
  assert.ok(dt >= 2000, `waited (${dt}ms)`);
  assert.ok(msgs.some((m) => /waiting/.test(m)), 'said it was waiting');
  assert.ok(msgs.some((m) => /running anyway/.test(m)), 'did not block forever');
});
holder.kill('SIGKILL');
ok('check.js installs the guard before running anything', () => {
  const src = readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
  assert.match(src, /acquireLock\(\);\s*require\('\.\/check-guard'\)\.install\(\);/);
});

/* ── tiers : la couche rapide saute les suites qui pilotent un navigateur ── */
const browserTest = path.join(dir, 'drive-browser-test.mjs');
writeFileSync(browserTest, "import puppeteer from 'puppeteer-core';\nconsole.log('would launch');\n");
const plainTest = path.join(dir, 'plain-test.mjs');
writeFileSync(plainTest, 'console.log("plain ran");\n');
const cpTier = require('node:child_process');
ok('a test is slow when its source drives a browser, whatever it is called', () => {
  assert.equal(guard.isSlow(browserTest), true);
  assert.equal(guard.isSlow(plainTest), false);
  assert.equal(guard.isSlow(path.join(dir, 'missing-test.mjs')), false, 'an unreadable file is run, never skipped');
  assert.equal(guard.isSlow(path.join(ROOT, 'tools/native-premium-feel-test.mjs')), true, 'a browser suite without "browser" in its name');
  assert.equal(guard.isSlow(path.join(ROOT, 'tools/team-codes-at-rest-test.mjs')), false);
});
ok('the full tier runs a browser suite; the fast tier skips it by name and never skips a plain one', () => {
  const calls = [];
  const spawn = (c, a) => { calls.push(a[a.length - 1]); return { status: 0, stdout: 'ran', stderr: '' }; };
  const prev = process.env.KIWI_CHECK_TIER;
  try {
    delete process.env.KIWI_CHECK_TIER;
    cpTier.spawnSync = realSpawnSync;
    let w = guard.install({ log: () => {}, spawnSync: spawn });
    assert.equal(guard.tier(), 'full');
    assert.equal(w(process.execPath, [browserTest]).stdout, 'ran');
    process.env.KIWI_CHECK_TIER = 'fast';
    assert.equal(guard.tier(), 'fast');
    const before = guard.skipped.length;
    const skipped = w(process.execPath, [browserTest]);
    assert.equal(skipped.kiwiSkipped, true);
    assert.equal(skipped.status, 0);
    assert.equal(guard.takeSkip(), 'drive-browser-test.mjs');
    assert.equal(guard.takeSkip(), null, 'the flag is read once');
    assert.equal(guard.skipped.length, before + 1);
    assert.equal(w(process.execPath, [plainTest]).stdout, 'ran');
    assert.equal(calls.length, 2, 'only the full-tier browser run and the plain run reached the real spawn');
    assert.equal(guard.takeSkip(), null, 'a plain test clears the skip flag');
  } finally {
    if (prev === undefined) delete process.env.KIWI_CHECK_TIER; else process.env.KIWI_CHECK_TIER = prev;
    cpTier.spawnSync = realSpawnSync;
  }
});
ok('the fast tier is opt-in, never says "all checks passed", and never waits behind a full run', () => {
  const src = readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
  assert.match(src, /process\.argv\.includes\('--fast'\)\) process\.env\.KIWI_CHECK_TIER = 'fast'/);
  assert.match(src, /if \(process\.env\.KIWI_CHECK_TIER !== 'fast'\) require\('\.\/check-guard'\)\.acquireLock\(\);/);
  const tail = src.slice(src.lastIndexOf("if (failures)"));
  assert.ok(tail.indexOf("guard.tier() === 'fast'") > 0 && tail.indexOf("guard.tier() === 'fast'") < tail.indexOf('all checks passed'), 'the fast verdict comes first');
  assert.match(tail, /NOT run, so this is not the gate/);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node tools/check.js', 'npm test stays the full gate');
  assert.equal(pkg.scripts.check, 'node tools/check.js');
  assert.equal(pkg.scripts['check:fast'], 'node tools/check.js --fast');
  assert.equal(pkg.scripts['check:full'], 'node tools/check.js');
});

console.log(`\ncheck-guard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
