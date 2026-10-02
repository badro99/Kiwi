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
  assert.match(src, /require\('\.\/check-guard'\)\.acquireLock\(\);\s*require\('\.\/check-guard'\)\.install\(\);/);
});

console.log(`\ncheck-guard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
