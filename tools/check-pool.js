'use strict';
/* Kiwi · check-pool.js — runs the gate's child tests side by side.
 *
 *   node tools/check-pool.js <records.jsonl> <results.json> <jobs> <browserJobs>
 *
 * check.js runs ~100 test files one after another; most of its wall time is a
 * single core busy while the others wait. check-guard.js (prefetch) records
 * every child test check.js is about to run, hands the list to this pool, then
 * replays check.js against the results: same order, same output, same verdict.
 * Only a PASS is reused. A test that failed here (load, a race with a sibling,
 * a real bug) runs again, alone, at its usual place in check.js, so a red gate
 * still means red when nothing else is running.
 *
 * Browser suites (they launch Chromium) are capped separately and start first:
 * they are the long ones, and too many browsers at once time out on their own.
 * Each test also runs with tools/dep-trace.cjs preloaded: a test that passes
 * leaves the list of repo files it touched in kiwi-test-deps.json (temp dir,
 * next to the durations), which is how `check.js --changed` knows what a change
 * can affect. KIWI_DEP_TRACE=0 turns the tracing off.
 * Zero dependencies, like check.js. */
const cp = require('child_process');
const fs = require('fs');
const { isSlow, DEFAULT_TIMEOUT_MS } = require('./check-guard');

const [recordsFile, resultsFile, jobsArg, browserArg] = process.argv.slice(2);
const jobs = Math.max(1, Number(jobsArg) || 4);
const browserJobs = Math.max(1, Math.min(jobs, Number(browserArg) || 3));
const timeout = Number(process.env.KIWI_CHECK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

const seen = new Set();
const tasks = [];
for (const line of fs.readFileSync(recordsFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let rec; try { rec = JSON.parse(line); } catch (_) { continue; }
  if (seen.has(rec.key)) continue;
  seen.add(rec.key);
  rec.slow = isSlow(rec.args[rec.args.length - 1]);
  tasks.push(rec);
}
/* Longest first: the last long test to start decides when the pool ends.
 * Durations from the previous run on this machine (a cache in the temp dir,
 * never in the repo); a test never timed counts as long when it drives a
 * browser, short otherwise. */
const os = require('os');
const path = require('path');
const TIMES = path.join(os.tmpdir(), 'kiwi-check-durations.json');
let times = {};
try { times = JSON.parse(fs.readFileSync(TIMES, 'utf8')) || {}; } catch (_) { times = {}; }
const nameOf = (t) => String(t.args[t.args.length - 1]).replace(/^.*\//, '');
const guess = (t) => (times[nameOf(t)] != null ? times[nameOf(t)] : (t.slow ? 60000 : 2000));
tasks.sort((a, b) => guess(b) - guess(a));

/* What each passing test read or imported (tools/dep-trace.cjs). */
const ROOT = path.resolve(__dirname, '..');
const TRACER = path.join(__dirname, 'dep-trace.cjs');
const DEPS = path.join(os.tmpdir(), 'kiwi-test-deps.json');
const tracing = process.env.KIWI_DEP_TRACE !== '0' && fs.existsSync(TRACER);
const traceDir = tracing ? fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-deps-')) : null;
const deps = {};
let traceN = 0;
const relOf = (f) => path.relative(ROOT, path.resolve(f)).split(path.sep).join('/');
function envFor(task) {
  if (!tracing) return { env: process.env, file: null };
  const file = path.join(traceDir, (traceN++) + '.txt');
  const req = '--require=' + (/\s/.test(TRACER) ? JSON.stringify(TRACER) : TRACER);
  return { file, env: Object.assign({}, process.env, {
    KIWI_DEP_TRACE: file, KIWI_DEP_ROOT: ROOT,
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' ' + req).trim(),
  }) };
}
function saveDeps() {
  if (!tracing) return;
  try { fs.rmSync(traceDir, { recursive: true, force: true }); } catch (_) {}
  if (!Object.keys(deps).length) return;
  let all = {};
  try { all = JSON.parse(fs.readFileSync(DEPS, 'utf8')) || {}; } catch (_) { all = {}; }
  Object.assign(all, deps);
  try { fs.writeFileSync(DEPS, JSON.stringify(all)); } catch (_) {}
}

const results = {};
let running = 0, runningSlow = 0, done = 0;
const t0 = Date.now();

/* Pass cache. A test that passed reads the same bytes again → it passes again.
 * After a pass we keep, in the temp dir (never the repo), a key made of the
 * content of the test file and of every repo file it read, listed or probed
 * (tools/dep-trace.cjs), plus Node, the app/ lockfile, Chromium and the KIWI_*
 * settings. A later run with the same key reuses that pass and its output
 * instead of running the test. Never reused: a pass older than 24 h (date and
 * time dependent tests still run daily), a test that calls git (it reads the
 * history, not files), a test whose trace is missing. KIWI_PASS_CACHE=0 runs
 * everything. Keys are content hashes, so worktrees share the cache safely. */
const crypto = require('crypto');
const CACHE = path.join(os.tmpdir(), 'kiwi-pass-cache.json');
const cacheOn = tracing && process.env.KIWI_PASS_CACHE !== '0';
const MAX_AGE_MS = 24 * 3600 * 1000;
let passCache = {};
if (cacheOn) { try { passCache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) || {}; } catch (_) { passCache = {}; } }
const sha = (x) => crypto.createHash('sha1').update(x).digest('hex');
const hashMemo = new Map();
function contentHash(rel) {
  if (hashMemo.has(rel)) return hashMemo.get(rel);
  let h = '∅';
  try {
    if (rel.startsWith('dir:')) h = sha(fs.readdirSync(path.join(ROOT, rel.slice(4))).sort().join('\n'));
    else {
      const abs = path.join(ROOT, rel);
      h = fs.statSync(abs).isDirectory() ? 'd' : sha(fs.readFileSync(abs));
    }
  } catch (_) { h = '∅'; }
  hashMemo.set(rel, h);
  return h;
}
const SALT = sha(JSON.stringify([
  new Date().toDateString(), process.version, contentHash('app/package-lock.json'), contentHash('tools/dep-trace.cjs'), process.env.KIWI_CHROMIUM_BIN || '',
  Object.keys(process.env).filter((k) => /^KIWI_/.test(k) && !/^KIWI_(DEP_|CHECK_|PASS_CACHE)/.test(k)).sort().map((k) => k + '=' + process.env[k]),
]));
/* A program other than node reads files the tracer cannot see (git reads the
   history, sqlite3 or a shell read whatever they like): a test that starts one,
   directly or through a tools/ helper, is never reused. */
const FOREIGN = /(?:\b(?:spawn|execFile|spawnSync|execSync|execFileSync)|\b(?:cp|child_process|childProcess)\.exec)\(\s*(?:['"`](?!node['"`\s])[\w./-]+|[A-Za-z_$][\w$]*\s*,)/;
const NODE_ONLY = /(?:\b(?:spawn|execFile|spawnSync|execFileSync|fork)|\b(?:cp|child_process|childProcess)\.exec)\(\s*process\.execPath\b/g;
const foreignMemo = new Map();
const startsForeign = (r) => {
  if (foreignMemo.has(r)) return foreignMemo.get(r);
  let hit = false;
  try { const src = fs.readFileSync(path.join(ROOT, r), 'utf8'); hit = /child_process/.test(src) && FOREIGN.test(src.replace(NODE_ONLY, '')); } catch (_) {}
  foreignMemo.set(r, hit);
  return hit;
};
const callsGit = (rels) => rels.some((r, i) => /\.(m?js|cjs)$/.test(r) && (i === 0 || r.startsWith("tools/")) && startsForeign(r));
function passKey(task, own, list) {
  return sha([SALT, JSON.stringify(task.args.map((a) => String(a).startsWith(ROOT) ? relOf(a) : String(a))),
    own + ':' + contentHash(own), ...list.map((r) => r + ':' + contentHash(r))].join('\n'));
}
let reused = 0;
if (cacheOn) {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i], own = relOf(task.args[task.args.length - 1]), hit = passCache[own];
    if (!hit || Date.now() - hit.at > MAX_AGE_MS || !Array.isArray(hit.deps)) continue;
    if (passKey(task, own, hit.deps) !== hit.key) continue;
    results[task.key] = { status: 0, signal: null, stdout: hit.stdout || '', stderr: hit.stderr || '', cpuMs: null, wallMs: 0, cached: true };
    tasks.splice(i, 1); reused++;
  }
}
function remember(task, own, list, stdout, stderr) {
  if (!cacheOn) return;
  const all = [own, ...list];
  if (callsGit(all) || stdout.length + stderr.length > 512 * 1024) { delete passCache[own]; return; }
  passCache[own] = { key: passKey(task, own, list), deps: list, at: Date.now(), stdout, stderr };
}
function savePassCache() {
  if (!cacheOn) return;
  try { fs.writeFileSync(CACHE, JSON.stringify(passCache)); } catch (_) {}
}

function next() {
  if (!tasks.length) return null;
  const i = tasks.findIndex((t) => !t.slow || runningSlow < browserJobs);
  return i < 0 ? null : tasks.splice(i, 1)[0];
}

function start(task) {
  running++; if (task.slow) runningSlow++;
  const trace = envFor(task);
  const child = cp.spawn(process.execPath, task.args, { cwd: task.cwd || undefined, env: trace.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, timeout);
  const began = Date.now();
  child.on('close', (status, signal) => {
    clearTimeout(timer);
    if (status === 0) times[nameOf(task)] = Date.now() - began;
    let cpuMs = null;
    if (trace.file) {
      try {
        const own = relOf(task.args[task.args.length - 1]);
        const lines = fs.readFileSync(trace.file, 'utf8').split('\n').filter(Boolean);
        cpuMs = lines.filter((l) => l.startsWith('#cpu ')).reduce((n, l) => n + (Number(l.slice(5)) || 0), 0);
        if (status === 0) {
          const list = new Set(lines.filter((l) => !l.startsWith('#')));
          list.delete(own);
          deps[own] = [...list].sort();
          remember(task, own, deps[own], stdout, stderr);
        }
      } catch (_) {}
    }
    running--; if (task.slow) runningSlow--;
    done++;
    results[task.key] = { status, signal, stdout, stderr, cpuMs, wallMs: Date.now() - began };
    if (status !== 0) {
      if (cacheOn) delete passCache[relOf(task.args[task.args.length - 1])];
      const name = String(task.args[task.args.length - 1]).replace(/^.*\//, '');
      console.log(`  … ${name} did not pass in parallel (exit ${status === null ? signal : status}), it will run again alone`);
    }
    pump();
  });
}

function pump() {
  while (running < jobs) {
    const task = next();
    if (!task) break;
    start(task);
  }
  if (!running && !tasks.length) {
    fs.writeFileSync(resultsFile, JSON.stringify(results));
    try { fs.writeFileSync(TIMES, JSON.stringify(times)); } catch (_) {}
    saveDeps();
    savePassCache();
    if (reused) console.log(`  ✓ ${reused} test files reused from the pass cache (same inputs as their last pass, under 24 h; KIWI_PASS_CACHE=0 runs them)`);
    console.log(`  ✓ ${done} test files run in parallel in ${Math.round((Date.now() - t0) / 1000)}s (${jobs} at a time, ${browserJobs} browsers)`);
  }
}

console.log(`  … running ${tasks.length} test files in parallel (${jobs} at a time, ${browserJobs} browsers)`);
pump();
