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
 *   changed         `node tools/check.js --changed [--base <ref>]`: only the child
 *                   tests the working tree's changes can affect (see selection()
 *                   below), browser suites included when they are affected. The
 *                   in-process checks (syntax, data-action, i18n keys…) all run.
 *                   Seconds instead of minutes between edits; NOT the gate either.
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
/* A suite that reaches the browser through a shared harness (surface-matrix-lib,
   a local helper) is slow too: local imports and requires are followed. */
const LOCAL_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+\.(?:m?js|cjs))['"]/gm;
function isSlow(file, seen) {
  if (!file || !/\.(m?js|cjs)$/.test(file)) return false;
  if (slowCache.has(file)) return slowCache.get(file);
  seen = seen || new Set();
  if (seen.has(file)) return false;
  seen.add(file);
  /* The runner names these words itself (the regex above); it launches nothing. */
  if (/(^|[\\/])(check|check-guard|check-pool)\.js$|dep-trace\.cjs$/.test(file) && seen.size > 1) { slowCache.set(file, false); return false; }
  let slow = false, src = '';
  try { src = fs.readFileSync(file, 'utf8'); } catch (_) { src = ''; }
  if (SLOW_SOURCE.test(src)) slow = true;
  else {
    LOCAL_IMPORT.lastIndex = 0;
    let m;
    while (!slow && (m = LOCAL_IMPORT.exec(src))) slow = isSlow(path.resolve(path.dirname(file), m[1]), seen);
  }
  slowCache.set(file, slow);
  return slow;
}
const tier = () => {
  const t = process.env.KIWI_CHECK_TIER;
  return t === 'fast' || t === 'changed' ? t : 'full';
};

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

/* Every test file this run started a child for, or replayed from the parallel
   pool (a tier that leaves a suite out does not count it). check.js compares it
   with tools/ on the full gate: a file only mentioned in check.js (a comment, a
   list nobody loops over) is named, yet never runs, and the name check alone
   cannot see that. */
const ran = new Set();
function noteRan(args) {
  if (Array.isArray(args)) for (const a of args) { const s = String(a); if (/test\.(?:m?js|cjs)$/.test(s)) ran.add(path.basename(s)); }
}
function ranTests() { return new Set(ran); }
/* A property or accessibility suite that cannot load its library prints
   "○ skip … unavailable" and exits 0. check.js fails the run on any of them,
   whatever the tier: a suite that did not execute is not a pass. */
const depSkips = [];
const DEP_SKIP = /○ skip[: ]+(?:fast-check|axe-core|puppeteer-core|typescript|cargo) unavailable/;
function noteDepSkip(args, stdout) {
  const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || '');
  if (!DEP_SKIP.test(text)) return;
  const script = Array.isArray(args) && args.length ? path.basename(String(args[args.length - 1])) : '?';
  if (!depSkips.includes(script)) depSkips.push(script);
}
function dependencySkips() { return depSkips.slice(); }
/* Flake ledger. check-pool.js runs a test beside seven others, and a test that
   fails there is run again alone at its usual place. When that second run
   passes the run is green, and until now nothing said the suite had failed
   first: a flaky suite stayed invisible. The pool's failures are noted here,
   and a suite that fails in the pool then passes alone is a flake: listed for
   check.js, which warns and appends it to a ledger in the temp dir. */
const poolFailed = new Set();
const flaked = [];
const scriptOf = (args) => (Array.isArray(args) && args.length ? path.basename(String(args[args.length - 1])) : '?');
function notePoolResults(results) {
  for (const [key, r] of Object.entries(results || {})) {
    if (!r || r.status === 0) continue;
    try { poolFailed.add(scriptOf(JSON.parse(key)[1])); } catch (_) {}
  }
}
function noteAlonePass(args, status) {
  if (status !== 0) return;
  const name = scriptOf(args);
  if (poolFailed.has(name) && !flaked.includes(name)) flaked.push(name);
}
const flakes = () => flaked.slice();
const FLAKE_LEDGER = path.join(os.tmpdir(), 'kiwi-flake-ledger.jsonl');
const FLAKE_DAYS = 7;
/* Appends this run's flakes and returns, per suite, how many times it flaked
   in the last FLAKE_DAYS days (this run included). */
function recordFlakes(opts) {
  opts = opts || {};
  const file = opts.file || FLAKE_LEDGER, now = opts.now || Date.now();
  const names = opts.names || flaked;
  const since = now - FLAKE_DAYS * 86400000;
  const counts = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try { const e = JSON.parse(line); if (e.at >= since) counts[e.suite] = (counts[e.suite] || 0) + 1; } catch (_) {}
    }
  } catch (_) {}
  for (const n of names) {
    counts[n] = (counts[n] || 0) + 1;
    try { fs.appendFileSync(file, JSON.stringify({ at: now, suite: n }) + '\n'); } catch (_) {}
  }
  return Object.fromEntries(names.map((n) => [n, counts[n]]));
}
/* Coverage cells reached (tools/coverage-probe.mjs): from the pool's results,
   cached passes included, and from the suites this process runs itself. */
const reached = new Map();   // "surface|locale|viewport" → Set of suites
const PROBE = path.join(__dirname, 'coverage-probe.mjs');
function noteCells(args, cells) {
  if (!Array.isArray(cells)) return;
  const script = Array.isArray(args) && args.length ? path.basename(String(args[args.length - 1])) : '?';
  for (const c of cells) { if (!reached.has(c)) reached.set(c, new Set()); reached.get(c).add(script); }
}
function reachedCells() { return new Map(reached); }
let claimFiles = null;   // test files holding a landing claim anchor
function probeEnv(script, o) {
  if (process.env.KIWI_COVERAGE_PROBE === '0' || !/\.(?:mjs|js|cjs)$/.test(script) || !fs.existsSync(PROBE)) return null;
  const root = path.resolve(__dirname, '..');
  if (!claimFiles) {
    claimFiles = new Set();
    try { for (const e of Object.values(JSON.parse(fs.readFileSync(path.join(root, 'tools', 'landing-claims-map.json'), 'utf8')).claims || {})) for (const c of e.contracts || []) claimFiles.add(c.file); } catch (_) {}
  }
  const abs = path.resolve(o.cwd || process.cwd(), script);
  let src = '';
  try { src = fs.readFileSync(abs, 'utf8'); } catch (_) { return null; }
  const claim = claimFiles.has(path.relative(root, abs).split(path.sep).join('/'));
  if (!claim && !(/\.mjs$/.test(script) && src.includes('// coverage: surface='))) return null;
  const ledger = path.join(os.tmpdir(), `kiwi-cells-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const base = o.env || process.env;
  return { ledger, env: Object.assign({}, base, {
    KIWI_COVERAGE_LEDGER: ledger,
    NODE_OPTIONS: ((base.NODE_OPTIONS || '') + ' --import=' + require('url').pathToFileURL(PROBE).href).trim(),
  }) };
}
function takeLedger(ledger) {
  try { const cells = [...new Set(fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean))]; fs.rmSync(ledger, { force: true }); return cells; } catch (_) { return []; }
}

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
    if (tier() === 'changed' && cmd === process.execPath && script && !isSelected(path.resolve(o.cwd || process.cwd(), script))) {
      const n = path.basename(script);
      skipped.push(n);
      skipFlag = n;
      /* Sections read a test's output ("the ✓ line", "N passed"): a skipped
         test answers with one line they can parse, and ok() then prints nothing. */
      const text = '  ✓ ' + n + ' not affected by this change (0 failed, 1 passed)\n';
      const out = { status: 0, signal: null, stdout: text, stderr: '', pid: 0, kiwiSkipped: true };
      if (!o.encoding) { out.stdout = Buffer.from(text); out.stderr = Buffer.from(''); }
      out.output = [null, out.stdout, out.stderr];
      return out;
    }
    noteRan(args);
    if (cmd === process.execPath && Array.isArray(args) && !o.input && !o.env) {
      const key = keyOf(cmd, args, o);
      const hit = replay && replay[key];
      if (hit && hit.status === 0) {
        reused++;
        noteDepSkip(args, hit.stdout);
        noteCells(args, hit.cells);
        const out = { status: 0, signal: null, stdout: hit.stdout, stderr: hit.stderr, pid: 0, kiwiReplayed: true };
        if (o.encoding) { out.output = [null, out.stdout, out.stderr]; return out; }
        out.stdout = Buffer.from(out.stdout); out.stderr = Buffer.from(out.stderr);
        out.output = [null, out.stdout, out.stderr];
        return out;
      }
    }
    if (!o.timeout) o.timeout = timeout;
    if (!o.killSignal) o.killSignal = 'SIGKILL';
    const probe = cmd === process.execPath ? probeEnv(script, o) : null;
    if (probe) o.env = probe.env;
    const t0 = Date.now();
    let r = real.call(cp, cmd, args, o);
    const name = (Array.isArray(args) && args.length ? String(args[args.length - 1]) : String(cmd)).replace(/^.*\//, '');
    if (r && r.status === ENV_EXIT && !o.kiwiNoRetry) {
      log(`  … ${name} failed on the environment (exit ${ENV_EXIT}), running it once more`);
      r = real.call(cp, cmd, args, o);
      if (r && r.status === ENV_EXIT) r.stderr = (r.stderr || '') + `\n  ✗ ${name} failed on the environment twice (exit ${ENV_EXIT}: Chromium, the server or the machine, not an assertion). Check the load, then rerun it alone.`;
      else if (r) r.stdout = `(first run exited ${ENV_EXIT} on the environment, second run below)\n` + (r.stdout || '');
    }
    if (r) noteDepSkip(args, r.stdout);
    if (r) noteAlonePass(args, r.status);
    if (probe) { const cells = takeLedger(probe.ledger); if (r && r.status === 0) noteCells(args, cells); }
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
    try { if (fs.statSync(file).isFile() && !networkOnly(file)) out.push(file); } catch (_) {}
  }
  return out;
}

/* A test that needs the network or outside credentials says so in its first
 * lines (`kiwi:network-only`). check.js names it only to exempt it from the
 * "every test is wired" rule, so the parallel prefetch must not run it: it
 * would fail without credentials, or call the live site, on every gate. */
function networkOnly(file) {
  try { return /kiwi:network-only/.test(fs.readFileSync(file, 'utf8').slice(0, 600)); } catch (_) { return false; }
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
    const files = namedTests(script).filter((f) => !(tier() === 'fast' && isSlow(f)) && isSelected(f));
    if (!files.length) return;
    fs.writeFileSync(records, files.map((f) => JSON.stringify({ key: keyOf(process.execPath, [f], {}), args: [f], cwd: '' })).join('\n'));
    const pool = real.call(cp, process.execPath, [path.join(__dirname, 'check-pool.js'), records, results, String(jobs), String(browserJobs)], {
      stdio: ['ignore', 'inherit', 'inherit'], timeout: 60 * 60 * 1000,
    });
    if (pool.error) throw pool.error;
    replay = JSON.parse(fs.readFileSync(results, 'utf8'));
    notePoolResults(replay);
    for (const [key, r] of Object.entries(replay)) {
      if (!r || r.status !== 0 || !(r.cpuMs > 0)) continue;
      try { const args = JSON.parse(key)[1]; cpu[path.basename(String(args[args.length - 1]))] = r.cpuMs; } catch (_) {}
    }
  } catch (e) {
    replay = null;
    log(`  ! parallel prefetch unavailable (${(e && e.message) || e}), running serially`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}
const reusedCount = () => reused;

/* ── Suite time ratchet ────────────────────────────────────────────────────
 * A gate that took thirteen minutes did so one slow suite at a time: a schema
 * replayed a thousand times, a key derivation at a million rounds in a
 * behaviour case, a regex that restarted at every character. Each suite's node
 * CPU time (tools/dep-trace.cjs, every process it starts included) is checked
 * after the parallel run:
 *   · a suite pinned in tools/suite-cpu-baseline.json may not pass twice its
 *     pin (and 15 s more); KIWI_UPDATE_CPU_BASELINE=1 lowers pins, never raises;
 *   · any other suite gets CPU_BUDGET_MS. A new suite that needs more is made
 *     faster (one browser, one page per locale, a fixture built once), not pinned.
 * CPU time, not wall time: wall time doubles when the machine is busy, CPU
 * time barely moves. Only suites the parallel pool ran are measured. */
const CPU_BUDGET_MS = 30000;
const cpu = {};
const cpuTimes = () => cpu;
function cpuRatchet(opts) {
  opts = opts || {};
  const file = opts.file || path.join(__dirname, 'suite-cpu-baseline.json');
  const times = opts.times || cpu;
  const update = opts.update != null ? opts.update : process.env.KIWI_UPDATE_CPU_BASELINE === '1';
  let base = null;
  try { base = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { base = null; }
  const pins = (base && base.pins) || {};
  const over = [], lower = [];
  for (const [name, ms] of Object.entries(base ? times : {})) {   // no baseline yet: measure, judge nothing
    const pin = pins[name];
    const limit = pin ? Math.max(pin * 2, pin + 15000) : CPU_BUDGET_MS;
    if (ms > limit) over.push({ name, ms, pin: pin || 0, limit });
    else if (pin && ms < pin * 0.6) lower.push({ name, ms, pin });
  }
  let wrote = false;
  if (update && (!base || lower.length) && !over.length) {
    const next = { note: (base && base.note) || 'Node CPU ms per suite above the budget, measured by tools/check-pool.js. Pins only come down (KIWI_UPDATE_CPU_BASELINE=1).', pins: {} };
    const src = base ? pins : Object.fromEntries(Object.entries(times).filter(([, ms]) => ms > CPU_BUDGET_MS));
    for (const [name, pin] of Object.entries(src).sort()) {
      const now = times[name];
      const v = base ? (now != null && now < pin ? now : pin) : pin;
      if (v > CPU_BUDGET_MS) next.pins[name] = Math.round(v);
    }
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    wrote = true;
  }
  return { measured: Object.keys(times).length, over, lower, wrote, pinned: Object.keys(pins).length, hasBaseline: !!base };
}


/* ── Changed tier: which child tests can this change affect? ──────────────
 * The changed files are the working tree against HEAD (staged, unstaged and
 * untracked), or against the merge base with --base <ref>. A child test is
 * selected when:
 *   · it is itself one of the changed files;
 *   · it touched a changed file the last time it passed in the parallel pool
 *     (tools/dep-trace.cjs records every import and fs read; the map lives in
 *     the temp dir as kiwi-test-deps.json and every fast or full run refreshes
 *     it);
 *   · its source names a changed file (its repo path, or its file name when
 *     that name is unique in the repo): this covers tests never traced yet.
 * A change that only moves asset stamps (`?v=`, `rev:`, the cache generation,
 * tools/asset-stamps.json) selects the stamp suites, not every page suite.
 * A change to the runner itself selects the whole fast tier. */
const RUNNER = new Set(['tools/check.js', 'tools/check-guard.js', 'tools/check-pool.js', 'tools/dep-trace.cjs']);
const STAMP_SUITES = ['stamp-drift-test.js', 'pwa-shell-test.js', 'asset-stamp-coverage-test.mjs'];
const DEPS_FILE = path.join(os.tmpdir(), 'kiwi-test-deps.json');
const STALE_COPY = / \d+\.[a-z]+$/i;
const stampNorm = (t) => String(t)
  .replace(/([?&]v=)[\w.-]+/g, '$1#')
  .replace(/(\brev\s*:\s*['"])[^'"]*/g, '$1#')
  .replace(/("(?:v|sha)"\s*:\s*")[^"]*/g, '$1#')
  .replace(/(kiwi-app-v)\d+/g, '$1#');

let sel = null;
function git(root, args) {
  const real = cp.spawnSync.kiwiReal || cp.spawnSync;
  const r = real.call(cp, 'git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + String(r.stderr || '').trim().split('\n')[0]);
  return r.stdout;
}
function selection(opts) {
  if (sel && !opts) return sel;
  opts = opts || {};
  const root = path.resolve(opts.root || path.join(__dirname, '..'));
  const script = path.resolve(opts.script || path.join(__dirname, 'check.js'));
  let base = opts.base;
  if (base === undefined) { const i = process.argv.indexOf('--base'); base = i > 0 ? process.argv[i + 1] : null; }
  const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  const ref = base ? git(root, ['merge-base', base, 'HEAD']).trim() : 'HEAD';
  const changed = [...new Set(lines(git(root, ['diff', '--name-only', ref]))
    .concat(lines(git(root, ['ls-files', '--others', '--exclude-standard']))))]
    .filter((f) => !STALE_COPY.test(f)).sort();
  const tests = namedTests(script);
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const byRel = new Map(tests.map((f) => [rel(f), f]));
  const why = new Map();                          // abs test → every reason it qualifies
  const pick = (f, reason) => { if (!f) return; if (!why.has(f)) why.set(f, []); why.get(f).push(reason); };
  let browsers = opts.browsers;
  if (browsers === undefined) browsers = process.argv.includes('--browsers') || process.env.KIWI_CHANGED_BROWSERS === '1';
  /* --no-browsers (or KIWI_CHANGED_BROWSERS=0): a sandbox that cannot launch
     Chromium leaves every browser suite to the full gate, listed. */
  const noBrowsers = opts.noBrowsers != null ? opts.noBrowsers : (process.argv.includes('--no-browsers') || process.env.KIWI_CHANGED_BROWSERS === '0');
  const picked = new Map();                       // abs test → reason shown
  const out = { root, base: base || null, ref, changed, stampOnly: [], all: false, picked, depsKnown: false, named: new Set(tests), browserLater: [] };

  let deps = opts.deps;
  if (!deps) { try { deps = JSON.parse(fs.readFileSync(DEPS_FILE, 'utf8')) || {}; } catch (_) { deps = {}; } }
  out.depsKnown = Object.keys(deps).length > 0;
  const tracked = lines(git(root, ['ls-files']));
  const nameCount = new Map();
  for (const f of tracked) { const b = path.posix.basename(f); nameCount.set(b, (nameCount.get(b) || 0) + 1); }
  const srcCache = new Map();
  const src = (f) => { if (!srcCache.has(f)) { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch (_) {} srcCache.set(f, t); } return srcCache.get(f); };
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const c of changed) {
    if (RUNNER.has(c)) { out.all = true; continue; }
    if (byRel.has(c)) { pick(byRel.get(c), 'changed'); continue; }
    let stampOnly = false;
    if (/\.(html|js|json)$/.test(c) && fs.existsSync(path.join(root, c))) {
      try {
        const before = git(root, ['show', ref + ':' + c]);
        const now = fs.readFileSync(path.join(root, c), 'utf8');
        stampOnly = before !== now && stampNorm(before) === stampNorm(now);
      } catch (_) { stampOnly = false; }
    }
    if (stampOnly) {
      out.stampOnly.push(c);
      for (const n of STAMP_SUITES) pick(byRel.get('tools/' + n), 'stamps of ' + c);
      continue;
    }
    for (const [t, list] of Object.entries(deps)) if (byRel.has(t) && Array.isArray(list) && list.includes(c)) pick(byRel.get(t), 'reads ' + c);
    const b = path.posix.basename(c);
    const needles = [c];
    if ((nameCount.get(b) || 0) <= 1) needles.push(b);
    else { const two = c.split('/').slice(-2).join('/'); if (two !== c) needles.push(two); }
    const re = new RegExp('(^|[^A-Za-z0-9_.-])(' + needles.map(esc).join('|') + ')(?![A-Za-z0-9_-])');
    for (const t of tests) if (re.test(src(t))) pick(t, 'names ' + c);
  }
  if (out.all) for (const t of tests) if (!isSlow(t)) pick(t, 'the runner changed');
  /* A browser suite that opens a whole page reads nearly every asset, so the
     recorded map ties it to almost any change. It runs here when it is about the
     file (it names it, or is it); one that only loaded the file along with the
     page waits for the full gate, listed, unless --browsers asks for it. */
  for (const [t, list] of why) {
    const direct = list.filter((r) => !r.startsWith('reads '));
    if (isSlow(t) && (noBrowsers || (!direct.length && !browsers))) { out.browserLater.push(t); continue; }
    picked.set(t, (direct[0] || list[0]) + (list.length > 1 ? ` +${list.length - 1}` : ''));
  }
  if (!opts.root) sel = out;
  return out;
}
function isSelected(file) {
  if (tier() !== 'changed') return true;
  const s = selection(), f = path.resolve(file);
  return !s.named.has(f) || s.picked.has(f);   // only the tests check.js names are ever skipped
}
/* True when this run will launch a browser suite (decides lock and preflight). */
function runsBrowsers() {
  const t = tier();
  if (t === 'full') return true;
  if (t === 'fast') return false;
  for (const f of selection().picked.keys()) if (isSlow(f)) return true;
  return false;
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

module.exports = { install, ranTests, networkOnly, dependencySkips, flakes, recordFlakes, notePoolResults, FLAKE_DAYS, reachedCells, acquireLock, prefetch, reusedCount, cpuTimes, cpuRatchet, CPU_BUDGET_MS, isSlow, tier, skipped, takeSkip, selection, isSelected, runsBrowsers, namedTests, stampNorm, findBrowser, browserPreflight, DEFAULT_TIMEOUT_MS, SLOW_MS, ENV_EXIT };
