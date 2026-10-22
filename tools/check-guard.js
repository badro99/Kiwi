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
 * Parallel (default, KIWI_CHECK_JOBS=1 to turn off): prefetch() reads the
 * test files check.js names (every one of them lives in tools/), and
 * tools/check-pool.js runs them side by side before check.js starts its
 * sections; check.js then replays against those results. Same order, same
 * output, same verdict: only a PASS is reused, and a test that failed in
 * parallel runs again alone at its usual place. A call that does not match a
 * prefetched run (other args, a cwd, an env) simply runs as before.
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

/* ── Replay (see prefetch) ─────────────────────────────────────────────── */
let replay = null;                      // key → { status, signal, stdout, stderr }
const keyOf = (cmd, args, o) => JSON.stringify([cmd, args, (o && o.cwd) || '']);
let reused = 0;
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
    if (cmd === process.execPath && Array.isArray(args) && !o.input && !o.env) {
      const key = keyOf(cmd, args, o);
      const hit = replay && replay[key];
      if (hit && hit.status === 0) {
        reused++;
        const out = { status: 0, signal: null, stdout: hit.stdout, stderr: hit.stderr, pid: 0, kiwiReplayed: true };
        if (o.encoding) { out.output = [null, out.stdout, out.stderr]; return out; }
        out.stdout = Buffer.from(out.stdout); out.stderr = Buffer.from(out.stderr);
        out.output = [null, out.stdout, out.stderr];
        return out;
      }
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
  wrapped.kiwiReal = real;
  cp.spawnSync = wrapped;
  return wrapped;
}

/* The test files a check script names: every quoted `*.js` / `*.mjs` that
 * exists next to it (or at that absolute path), minus the runner itself.
 * Reading the source rather than dry-running it: a dry run hands each
 * section a fake empty output, and the sections parse what they get. */
function namedTests(script) {
  const dir = path.dirname(script);
  const own = new Set([script, path.join(__dirname, 'check-guard.js'), path.join(__dirname, 'check-pool.js')]);
  const out = [];
  const seen = new Set();
  const re = /['"]([A-Za-z0-9_./-]+\.m?js)['"]/g;
  const src = fs.readFileSync(script, 'utf8');
  let m;
  while ((m = re.exec(src))) {
    const file = path.isAbsolute(m[1]) ? m[1] : path.join(dir, m[1]);
    if (seen.has(file) || own.has(file)) continue;
    seen.add(file);
    try { if (fs.statSync(file).isFile()) out.push(file); } catch (_) {}
  }
  return out;
}

/* Run every child test check.js names, side by side, before check.js runs
 * them one by one. Returns nothing; on any trouble it simply leaves `replay`
 * empty and check.js runs serially, exactly as before. */
function prefetch(opts) {
  opts = opts || {};
  const log = opts.log || ((m) => console.log(m));
  const cpus = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 2;
  const jobs = Number(process.env.KIWI_CHECK_JOBS) || Math.max(2, Math.min(8, cpus - 1));
  if (jobs <= 1) return;
  const browserJobs = Number(process.env.KIWI_CHECK_BROWSER_JOBS) || Math.max(1, Math.min(3, Math.floor(jobs / 2)));
  const real = cp.spawnSync.kiwiReal || cp.spawnSync;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-check-'));
  const records = path.join(dir, 'records.jsonl'), results = path.join(dir, 'results.json');
  try {
    const script = path.resolve(opts.script || process.argv[1]);
    const files = namedTests(script).filter((f) => !(tier() === 'fast' && isSlow(f)));
    fs.writeFileSync(records, files.map((f) => JSON.stringify({ key: keyOf(process.execPath, [f], {}), args: [f], cwd: '' })).join('\n'));
    const pool = real.call(cp, process.execPath, [path.join(__dirname, 'check-pool.js'), records, results, String(jobs), String(browserJobs)], {
      stdio: ['ignore', 'inherit', 'inherit'], timeout: 60 * 60 * 1000,
    });
    if (pool.error) throw pool.error;
    replay = JSON.parse(fs.readFileSync(results, 'utf8'));
  } catch (e) {
    replay = null;
    log(`  ! parallel prefetch unavailable (${(e && e.message) || e}), running serially`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}
const reusedCount = () => reused;

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

/* ── Browser preflight ─────────────────────────────────────────────────────
 * Every browser suite looks for Chromium the same way (KIWI_CHROMIUM_BIN, then
 * the usual macOS and Linux paths) and, finding none, prints "○ skip" and
 * exits 0. The dependency check above it only proves puppeteer-core is on disk,
 * so a machine with no browser used to finish the full gate green with every
 * browser assertion unrun. This finds the executable the suites would use and
 * launches it once (headless, throwaway profile, short timeout): a binary that
 * exists but cannot start is as absent as one that does not exist.
 * Returns { ok, bin, reason }. Never throws. */
const BROWSER_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
];
function findBrowser(env) {
  env = env || process.env;
  const explicit = env.KIWI_CHROMIUM_BIN || env.CHROME_BIN;
  if (explicit) return explicit;               // what the suites will use, existing or not
  return BROWSER_CANDIDATES.find((f) => fs.existsSync(f)) || null;
}
function browserPreflight(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const timeoutMs = opts.timeoutMs || 30000;
  const bin = findBrowser(env);
  if (!bin) return { ok: false, bin: null, reason: 'no Chromium or Chrome executable found (set KIWI_CHROMIUM_BIN)' };
  if (!fs.existsSync(bin)) return { ok: false, bin, reason: `${bin} does not exist` };
  let profile = null;
  try { profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-preflight-')); } catch (_) {}
  try {
    const args = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--dump-dom', 'about:blank'];
    if (profile) args.unshift('--user-data-dir=' + profile);
    const r = (opts.spawnSync || require('child_process').spawnSync)(bin, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.error && r.error.code === 'ETIMEDOUT') return { ok: false, bin, reason: `${bin} did not start and exit within ${Math.round(timeoutMs / 1000)}s` };
    if (r.error) return { ok: false, bin, reason: `${bin} could not be launched (${r.error.code || r.error.message})` };
    /* The rendered DOM is the proof, not the exit code: on macOS Chrome prints
       the page, then its teardown watchdog kills it with exit 2. */
    if (/<html/i.test(r.stdout || '')) return { ok: true, bin, reason: '' };
    return { ok: false, bin, reason: `${bin} did not render a page on a headless launch (exit ${r.status == null ? r.signal : r.status})` };
  } finally {
    if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} }
  }
}

module.exports = { install, acquireLock, prefetch, reusedCount, isSlow, tier, skipped, takeSkip, findBrowser, browserPreflight, DEFAULT_TIMEOUT_MS, SLOW_MS, ENV_EXIT };
