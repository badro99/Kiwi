'use strict';
/* Kiwi · check-guard.js — keeps `node tools/check.js` from hanging or drowning.
 *
 * check.js runs ~100 child test processes one after another through
 * spawnSync. Three things made it "get stuck":
 *   1. Only four of those calls had a timeout, so one hung browser test froze
 *      the whole run with no output, forever.
 *   2. Several runs at once (one per session/worktree) each launch headless
 *      browsers; the machine hit a load average above 50 and page.goto()
 *      timed out in tests that are fine on their own.
 *   3. Nothing said which test was slow, so slow and hung looked identical.
 *
 * install() fixes all three without touching any call site:
 *   - every spawnSync without a `timeout` gets one (KIWI_CHECK_TIMEOUT_MS,
 *     default 5 min) and is SIGKILLed on expiry; the failure text says
 *     "TIMED OUT" and names the test instead of "exited null";
 *   - a test that runs longer than SLOW_MS is announced, so progress is visible;
 *   - one check run at a time per machine: a second run waits for the first
 *     (stale locks from dead PIDs are ignored; KIWI_CHECK_NO_LOCK=1 opts out);
 *   - a test that exits 3 said « the environment failed, not the product »
 *     (tools/browser-trace.mjs: no Chromium, a launch or navigation timeout,
 *     a closed target). It runs once more before it counts as red, and the
 *     output says so. Exit 1 (an assertion) is never retried.
 *
 * Two tiers (KIWI_CHECK_TIER=fast, or `node tools/check.js --fast`):
 *   full (default)  everything, exactly as before: the gate before a push.
 *   fast            skips every child test that launches a browser (about 80 of
 *                   ~600 suites, but most of the ten minutes), and says so by
 *                   name; a green fast run is NOT a green gate. It exists for the
 *                   loop between edits, the full tier stays the one that ships.
 *   A test is "slow" when its source drives a browser (puppeteer, browser-trace,
 *   Chromium, Playwright, Chrome), read from the file rather than guessed from
 *   its name, so a new browser suite is classed correctly without anyone
 *   registering it.
 * Zero dependencies, like check.js itself. */
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 300000;
const SLOW_MS = 60000;
const ENV_EXIT = 3;
const LOCK = path.join(os.tmpdir(), 'kiwi-check.lock');

const SLOW_SOURCE = /puppeteer|browser-trace|chromium|playwright|google chrome/i;
const slowCache = new Map();
/* True when the test file at `file` drives a real browser. Unreadable ⇒ false:
   a file we cannot read is run, never skipped. */
function isSlow(file) {
  if (!file || !/\.(m?js)$/.test(file)) return false;
  if (!slowCache.has(file)) {
    let slow = false;
    try { slow = SLOW_SOURCE.test(fs.readFileSync(file, 'utf8')); } catch (_) { slow = false; }
    slowCache.set(file, slow);
  }
  return slowCache.get(file);
}
const tier = () => (process.env.KIWI_CHECK_TIER === 'fast' ? 'fast' : 'full');
/* What the fast tier left out, for the summary, and the one-shot flag check.js
   reads so a skipped suite prints as skipped instead of "green (0 controls)". */
const skipped = [];
let skipFlag = null;
function takeSkip() { const s = skipFlag; skipFlag = null; return s; }

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function install(opts) {
  opts = opts || {};
  const timeout = Number(process.env.KIWI_CHECK_TIMEOUT_MS) || opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const real = opts.spawnSync || cp.spawnSync;
  const log = opts.log || ((m) => console.log(m));
  const wrapped = function kiwiGuardedSpawnSync(cmd, args, o) {
    o = Object.assign({}, o || {});
    skipFlag = null;
    const script = Array.isArray(args) && args.length ? String(args[args.length - 1]) : '';
    if (tier() === 'fast' && cmd === process.execPath && isSlow(script)) {
      const n = path.basename(script);
      skipped.push(n);
      skipFlag = n;
      return { status: 0, signal: null, stdout: '', stderr: '', output: [], pid: 0, kiwiSkipped: true };
    }
    if (!o.timeout) o.timeout = timeout;
    if (!o.killSignal) o.killSignal = 'SIGKILL';
    const t0 = Date.now();
    let r = real.call(cp, cmd, args, o);
    const name = (Array.isArray(args) && args.length ? String(args[args.length - 1]) : String(cmd)).replace(/^.*\//, '');
    if (r && r.status === ENV_EXIT && !o.kiwiNoRetry) {
      log(`  … ${name} failed on the environment (exit ${ENV_EXIT}), running it once more`);
      r = real.call(cp, cmd, args, o);
      if (r && r.status === ENV_EXIT) r.stderr = (r.stderr || '') + `\n  ✗ ${name} failed on the environment twice (exit ${ENV_EXIT}: Chromium, the server or the machine, not an assertion). Check the load, then rerun it alone.`;
      else if (r) r.stdout = `(first run exited ${ENV_EXIT} on the environment, second run below)\n` + (r.stdout || '');
    }
    const dt = Date.now() - t0;
    if (r && (r.error && r.error.code === 'ETIMEDOUT' || (r.status === null && r.signal === 'SIGKILL' && dt >= o.timeout - 50))) {
      r.stderr = (r.stderr || '') + `\n  ✗ ${name} TIMED OUT after ${Math.round(o.timeout / 1000)}s and was killed (hung, or the machine is overloaded: raise KIWI_CHECK_TIMEOUT_MS only after checking load)`;
    } else if (dt >= SLOW_MS) {
      log(`  … ${name} took ${Math.round(dt / 1000)}s`);
    }
    return r;
  };
  cp.spawnSync = wrapped;
  return wrapped;
}

/* Take the machine-wide lock, waiting for a live holder. Returns release(). */
function acquireLock(opts) {
  opts = opts || {};
  const file = opts.file || LOCK;
  const maxWait = opts.maxWaitMs != null ? opts.maxWaitMs : 20 * 60 * 1000;
  const log = opts.log || ((m) => console.log(m));
  if (process.env.KIWI_CHECK_NO_LOCK === '1') return function () {};
  const t0 = Date.now();
  let told = false;
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') return function () {};          // unwritable tmp: never block the gate
      let holder = 0;
      try { holder = parseInt(fs.readFileSync(file, 'utf8'), 10); } catch (_) {}
      if (!holder || holder === process.pid || !alive(holder)) { try { fs.unlinkSync(file); } catch (_) {} continue; }
      if (Date.now() - t0 > maxWait) { log(`  ! check.js: still locked by PID ${holder} after ${Math.round(maxWait / 60000)} min, running anyway`); return function () {}; }
      if (!told) { log(`  … another check.js run (PID ${holder}) is using this machine, waiting so both don't time out under load`); told = true; }
      sleep(2000);
    }
  }
  let released = false;
  const release = function () {
    if (released) return; released = true;
    try { if (parseInt(fs.readFileSync(file, 'utf8'), 10) === process.pid) fs.unlinkSync(file); } catch (_) {}
  };
  process.on('exit', release);
  process.on('SIGINT', function () { release(); process.exit(130); });
  process.on('SIGTERM', function () { release(); process.exit(143); });
  return release;
}

module.exports = { install, acquireLock, isSlow, tier, skipped, takeSkip, DEFAULT_TIMEOUT_MS, SLOW_MS, ENV_EXIT };
