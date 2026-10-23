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
function ok(label, fn) { try { fn(); passed++; console.log(`  ✓ ${label}`); } catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n').slice(0, 8).join(' ')}`); } }

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
  /* The lock and the browser preflight follow what the run will launch: the
     full tier always, the fast tier never, the changed tier when it selected a
     browser suite (runsBrowsers, proven below). */
  assert.match(src, /if \(require\('\.\/check-guard'\)\.runsBrowsers\(\)\) require\('\.\/check-guard'\)\.acquireLock\(\);/);
  const tail = src.slice(src.lastIndexOf("if (failures)"));
  assert.ok(tail.indexOf("guard.tier() === 'fast'") > 0 && tail.indexOf("guard.tier() === 'fast'") < tail.indexOf('all checks passed'), 'the fast verdict comes first');
  assert.match(tail, /NOT run, so this is not the gate/);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node tools/check.js', 'npm test stays the full gate');
  assert.equal(pkg.scripts.check, 'node tools/check.js');
  assert.equal(pkg.scripts['check:fast'], 'node tools/check.js --fast');
  assert.equal(pkg.scripts['check:full'], 'node tools/check.js');
});

/* Browser preflight, proven without a browser: fake executables and a path that
 * does not exist, handed over the variable every browser suite reads. */
const BIN_ENV = 'KIWI_CHROMIUM_BIN';
const nowhere = path.join(dir, 'no-such-browser');
ok('browser preflight: a configured executable that does not exist fails, and says so', () => {
  cp.spawnSync = realSpawnSync;
  const r = guard.browserPreflight({ env: { [BIN_ENV]: nowhere } });
  assert.equal(r.ok, false);
  assert.equal(r.bin, nowhere, 'the configured path is the one judged, never a fallback');
  assert.match(r.reason, /does not exist/);
});
if (process.platform !== 'win32') {
  const fake = (name, body) => { const f = path.join(dir, name); writeFileSync(f, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return f; };
  ok('browser preflight: an executable that starts and renders a page passes, whatever its exit code', () => {
    cp.spawnSync = realSpawnSync;
    const r = guard.browserPreflight({ env: { [BIN_ENV]: fake('renders', 'echo "<html><head></head><body></body></html>"; exit 2') } });
    assert.equal(r.ok, true, r.reason);
  });
  ok('browser preflight: an executable that exits without rendering fails', () => {
    cp.spawnSync = realSpawnSync;
    const r = guard.browserPreflight({ env: { [BIN_ENV]: fake('crashes', 'echo "dyld: missing library" >&2; exit 1') } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /did not render a page/);
  });
  ok('browser preflight: an executable that hangs is killed at the timeout and fails', () => {
    cp.spawnSync = realSpawnSync;
    const t0 = Date.now();
    const r = guard.browserPreflight({ timeoutMs: 500, env: { [BIN_ENV]: fake('hangs', 'sleep 30') } });
    assert.ok(Date.now() - t0 < 5000, 'returned promptly');
    assert.equal(r.ok, false);
    assert.match(r.reason, /within 1s|did not render/);
  });
}
ok('check.js: the full run refuses to start without a working browser; the fast tier only warns', () => {
  const env = { ...process.env, [BIN_ENV]: nowhere, KIWI_ALLOW_PROPERTY_SKIP: '1', KIWI_CHECK_NO_LOCK: '1' };
  delete env.CHROME_BIN; delete env.KIWI_CHECK_TIER; delete env.KIWI_ALLOW_BROWSER_SKIP;
  const t0 = Date.now();
  const r = realSpawnSync(process.execPath, [path.join(ROOT, 'tools/check.js')], { env, encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
  assert.ok(Date.now() - t0 < 15000, 'refused before running anything');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no working Chromium/);
  assert.match(r.stdout, /does not exist/);
  assert.match(r.stdout, /KIWI_ALLOW_BROWSER_SKIP=1/);
  const src = readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
  const at = src.indexOf('browserPreflight()');
  const block = src.slice(at - 200, at + 900);
  assert.match(block, /runsBrowsers\(\) && process\.env\.KIWI_ALLOW_BROWSER_SKIP !== '1'/, 'only a run that launches a browser refuses');
  assert.match(block, /else if \(process\.env\.KIWI_CHECK_TIER === 'fast' \|\| process\.env\.KIWI_CHECK_TIER === 'changed'\)[\s\S]*findBrowser\(\)[\s\S]*⚠/, 'the fast and changed tiers warn');
  assert.ok(at < src.indexOf('.acquireLock();'), 'the refusal comes before the lock and every suite');
});

/* ── Changed tier ─────────────────────────────────────────────────────────
 * A throwaway git repo with a check.js naming four suites: one names the
 * changed asset, one does not, one drives a browser and only read the asset
 * (recorded map), and the stamp suite. */
{
  const g = (cwd, ...args) => { const r = realSpawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); return r.stdout; };
  const repo = mkdtempSync(path.join(tmpdir(), 'kiwi-changed-'));
  const put = (rel, text) => { const f = path.join(repo, rel); require('node:fs').mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };
  put('tools/check.js', "run('names-test.mjs'); run('other-test.mjs'); run('page-browser-test.mjs'); run('harness-user-test.mjs'); run('stamp-drift-test.js');\n");
  put('tools/names-test.mjs', "import x from '../assets/x.js';\n");
  put('tools/other-test.mjs', "// about assets/y.js\n");
  put('tools/page-browser-test.mjs', "import puppeteer from 'puppeteer-core';\n");
  put('tools/harness.mjs', "export const launch = () => require('puppeteer-core');\n");
  put('tools/harness-user-test.mjs', "import { launch } from './harness.mjs';\n");
  put('tools/stamp-drift-test.js', '// stamps\n');
  put('assets/x.js', 'export default 1;\n');
  put('assets/y.js', 'export default 2;\n');
  put('dashboard.html', '<script src="assets/x.js?v=1"></script>\n');
  put('lib/check-guard.js', "/* puppeteer chromium: the runner names these words */\n");
  put('tools/uses-guard-test.mjs', "const g = require('../lib/check-guard.js');\n");
  g(repo, 'init', '-q'); g(repo, 'add', '.');
  g(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
  const T = (n) => path.join(repo, 'tools', n);
  const deps = { 'tools/page-browser-test.mjs': ['assets/x.js', 'dashboard.html'], 'tools/other-test.mjs': ['assets/y.js'] };
  const sel = (o) => guard.selection(Object.assign({ root: repo, script: T('check.js'), base: null, deps, browsers: false }, o));

  ok('isSlow follows a local harness import, and never counts the runner itself', () => {
    assert.equal(guard.isSlow(T('harness-user-test.mjs')), true);
    assert.equal(guard.isSlow(T('names-test.mjs')), false);
    assert.equal(guard.isSlow(T('uses-guard-test.mjs')), false, 'requiring the runner does not make a test slow');
  });
  ok('the changed tier runs the tests that name or read a changed file, and nothing else', () => {
    put('assets/x.js', 'export default 3;\n');
    const s = sel();
    assert.deepEqual(s.changed.filter((c) => c.startsWith('assets/')), ['assets/x.js']);
    assert.ok(s.picked.has(T('names-test.mjs')), 'the suite that imports it');
    assert.ok(!s.picked.has(T('other-test.mjs')), 'an unrelated suite is left out');
    assert.ok(!s.picked.has(T('page-browser-test.mjs')), 'a browser suite that only loaded it waits for the full gate');
    assert.ok(s.browserLater.includes(T('page-browser-test.mjs')), '…and is listed as such');
    assert.ok(sel({ browsers: true }).picked.has(T('page-browser-test.mjs')), '--browsers runs it now');
    put('tools/page-browser-test.mjs', "import puppeteer from 'puppeteer-core'; // assets/x.js\n");
    assert.ok(sel().picked.has(T('page-browser-test.mjs')), 'a browser suite that names the file runs');
    assert.ok(!sel({ noBrowsers: true }).picked.has(T('page-browser-test.mjs')), '…unless --no-browsers (a sandbox without Chromium)');
    g(repo, 'checkout', '-q', '--', 'tools/page-browser-test.mjs');
    g(repo, 'checkout', '-q', '--', 'assets/x.js');
  });
  ok('a change that only moves stamps selects the stamp suites, not every page suite', () => {
    put('dashboard.html', '<script src="assets/x.js?v=2"></script>\n');
    const s = sel({ browsers: true });
    assert.deepEqual(s.stampOnly, ['dashboard.html']);
    assert.ok(s.picked.has(T('stamp-drift-test.js')));
    assert.ok(!s.picked.has(T('page-browser-test.mjs')), 'the page suite that read dashboard.html is not run for a stamp');
    put('dashboard.html', '<script src="assets/x.js?v=2"></script><p>new</p>\n');
    assert.ok(sel({ browsers: true }).picked.has(T('page-browser-test.mjs')), 'a real edit to the page does select it');
    g(repo, 'checkout', '-q', '--', 'dashboard.html');
  });
  ok('a changed test runs itself, a new file is seen, and a runner change selects every plain suite', () => {
    put('tools/other-test.mjs', '// edited\n');
    put('assets/new.js', '1;\n');
    let s = sel();
    assert.ok(s.picked.has(T('other-test.mjs')));
    assert.ok(s.changed.includes('assets/new.js'), 'untracked files count as changed');
    g(repo, 'checkout', '-q', '--', 'tools/other-test.mjs');
    put('tools/check.js', "run('names-test.mjs'); run('other-test.mjs'); run('page-browser-test.mjs'); run('harness-user-test.mjs'); run('stamp-drift-test.js'); // edited\n");
    s = sel();
    assert.equal(s.all, true);
    assert.ok(s.picked.has(T('other-test.mjs')) && s.picked.has(T('names-test.mjs')));
    assert.ok(!s.picked.has(T('page-browser-test.mjs')), 'still no browser suite without --browsers');
  });
  ok('the changed tier says it is not the gate, and package.json offers it', () => {
    const src = readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
    assert.match(src, /process\.argv\.includes\('--changed'\)\) process\.env\.KIWI_CHECK_TIER = 'changed'/);
    const tail = src.slice(src.lastIndexOf('if (failures)'));
    assert.ok(tail.indexOf("guard.tier() === 'changed'") > 0 && tail.indexOf("guard.tier() === 'changed'") < tail.indexOf('all checks passed'));
    assert.match(tail, /so this is not the gate/);
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['check:changed'], 'node tools/check.js --changed');
  });
  ok('dep-trace records the repo files a process imports and reads, and nothing outside it', () => {
    const out = path.join(repo, 'trace.txt');
    put('tools/reader.mjs', "import fs from 'node:fs';\nimport './harness.mjs';\nfs.readFileSync(new URL('../assets/y.js', import.meta.url), 'utf8');\nfs.readFileSync('/etc/hosts', 'utf8');\n");
    const r = realSpawnSync(process.execPath, [T('reader.mjs')], { encoding: 'utf8', env: { ...process.env,
      KIWI_DEP_TRACE: out, KIWI_DEP_ROOT: repo, NODE_OPTIONS: '--require=' + path.join(ROOT, 'tools/dep-trace.cjs') } });
    assert.equal(r.status, 0, r.stderr);
    const got = readFileSync(out, 'utf8').split('\n').filter(Boolean);
    assert.ok(got.includes('assets/y.js'), 'an fs read');
    assert.ok(got.includes('tools/harness.mjs'), 'an import');
    assert.ok(!got.some((f) => f.includes('hosts') || f.startsWith('node:')), 'nothing outside the repo');
  });
  ok('in the changed tier an unselected suite is skipped with a line its section can parse', () => {
    const saved = process.env.KIWI_CHECK_TIER;
    try {
      process.env.KIWI_CHECK_TIER = 'full';
      assert.equal(guard.runsBrowsers(), true, 'the full tier always launches browsers (lock, preflight)');
      process.env.KIWI_CHECK_TIER = 'fast';
      assert.equal(guard.runsBrowsers(), false, 'the fast tier never does');
      process.env.KIWI_CHECK_TIER = 'changed';
      const named = [...guard.selection().named].find((f) => !guard.selection().picked.has(f));
      if (named) {
        guard.install({ timeoutMs: 5000, log: () => {} });   // earlier cases put the real spawnSync back
        const r = cp.spawnSync(process.execPath, [named], { encoding: 'utf8' });
        assert.equal(r.status, 0);
        assert.equal(r.kiwiSkipped, true);
        assert.match(r.stdout, /✓ .* not affected by this change/);
        assert.equal(guard.takeSkip(), path.basename(named));
      }
    } finally { if (saved === undefined) delete process.env.KIWI_CHECK_TIER; else process.env.KIWI_CHECK_TIER = saved; }
  });
}

/* ── Suite CPU ratchet ──────────────────────────────────────────────────── */
{
  const d = mkdtempSync(path.join(tmpdir(), 'kiwi-cpu-'));
  const file = path.join(d, 'suite-cpu-baseline.json');
  ok('the first measurement pins only the suites above the budget', () => {
    const r = guard.cpuRatchet({ file, update: true, times: { 'a-test.mjs': 90000, 'b-test.mjs': 2000 } });
    assert.equal(r.wrote, true);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).pins, { 'a-test.mjs': 90000 });
  });
  ok('a pinned suite fails past twice its pin; a new one fails past the budget', () => {
    let r = guard.cpuRatchet({ file, update: false, times: { 'a-test.mjs': 170000, 'c-test.mjs': guard.CPU_BUDGET_MS - 1 } });
    assert.equal(r.over.length, 0, 'within the margins');
    r = guard.cpuRatchet({ file, update: false, times: { 'a-test.mjs': 190000, 'c-test.mjs': guard.CPU_BUDGET_MS + 1 } });
    assert.deepEqual(r.over.map((o) => o.name).sort(), ['a-test.mjs', 'c-test.mjs']);
  });
  ok('the update lowers a pin, drops one that fell under the budget, and never raises or adds', () => {
    guard.cpuRatchet({ file, update: true, times: { 'a-test.mjs': 50000, 'z-test.mjs': 25000 } });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).pins, { 'a-test.mjs': 50000 }, 'lowered, nothing added');
    const r = guard.cpuRatchet({ file, update: true, times: { 'a-test.mjs': 80000 } });
    assert.equal(r.wrote, false);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pins['a-test.mjs'], 50000, 'never raised');
    guard.cpuRatchet({ file, update: true, times: { 'a-test.mjs': 4000 } });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).pins, {}, 'under the budget, the pin goes');
  });
  ok('an over-budget run never rewrites the baseline', () => {
    writeFileSync(file, JSON.stringify({ pins: { 'a-test.mjs': 40000 } }));
    const r = guard.cpuRatchet({ file, update: true, times: { 'a-test.mjs': 10000, 'n-test.mjs': 99000 } });
    assert.equal(r.wrote, false);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pins['a-test.mjs'], 40000);
  });
  ok('check.js runs the ratchet before its verdict', () => {
    const src = readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
    assert.ok(src.indexOf('guard.cpuRatchet()') > 0 && src.indexOf('guard.cpuRatchet()') < src.lastIndexOf('if (failures)'));
  });
}

console.log(`\ncheck-guard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
