// Kiwi · pass-cache-test.mjs — the gate's pass cache (tools/check-pool.js) only
// reuses a pass when every input it read is unchanged.
//
// Builds a throwaway repo with the real pool, guard and tracer, runs a small
// test through the pool twice, then changes one input at a time and checks the
// test runs again: a file it read, a folder it listed, a file it probed and
// found absent, a KIWI_ setting. A failing test, a test that starts git, a run
// that printed a skip ("○ skip", "○ … not run") and KIWI_PASS_CACHE=0 are never
// served from the cache. The cache lives in a
// private TMPDIR, so this suite never touches the machine's real cache.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Real path: macOS's temp dir is a symlink, and the pool's ROOT is resolved, so a
// symlinked repo path would key the cache '../../var/…' instead of 'tools/…'.
const box = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pass-cache-')));
const repo = path.join(box, 'repo');
const tmp = path.join(box, 'tmp');
fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
fs.mkdirSync(path.join(repo, 'data'), { recursive: true });
fs.mkdirSync(path.join(repo, 'flags'), { recursive: true });
fs.mkdirSync(tmp);
for (const f of ['check-pool.js', 'check-guard.js', 'dep-trace.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(repo, 'tools', f));

const write = (rel, text) => fs.writeFileSync(path.join(repo, rel), text);
write('data/price.txt', '1200');
write('data/a.txt', 'a');
write('tools/sum-test.mjs', `import fs from 'node:fs';
const price = fs.readFileSync(new URL('../data/price.txt', import.meta.url), 'utf8');
const files = fs.readdirSync(new URL('../data/', import.meta.url)).length;
const flag = fs.existsSync(new URL('../flags/off.flag', import.meta.url));
console.log('price ' + price + ' files ' + files + ' flag ' + flag);
process.exit(price === 'broken' ? 1 : 0);
`);
// Exits 0 but says it skipped, the way a browser suite does when Chromium did
// not start under load. Replaying that "pass" kept a suite green that never ran.
write('tools/skip-test.mjs', `import fs from 'node:fs';
const up = fs.existsSync(new URL('../flags/browser.up', import.meta.url));
console.log(up ? '  ✓ browser assertions ran' : '○ skip: puppeteer-core or axe-core unavailable');
`);
write('tools/notrun-test.mjs', `console.log('○ simulator part not run: no booted device');
`);
write('tools/git-test.mjs', `import { execFileSync } from 'node:child_process';
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch (_) {}
console.log('git ok');
`);

// Inputs the file list cannot see. A suite that declares one, a suite that reads
// something under the user's home outside the repo, and one that dials a
// non-local host are never replayed (gate#2: a pass whose key cannot notice the
// input changing would stay green on a stale answer).
write('tools/declared-test.mjs', `// kiwi-cache: never reads a machine setting nothing traces
console.log('declared ok');
`);
write('tools/home-test.mjs', `import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const seen = fs.existsSync(path.join(os.homedir(), '.kiwi-pass-cache-test-probe'));
console.log('home probe ' + seen);
`);
write('tools/pkg-test.mjs', `import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const seen = fs.existsSync(path.join(os.homedir(), '.kiwi-pass-cache-test-probe', 'node_modules', 'pkg', 'index.js'));
console.log('pkg probe ' + seen);
`);
write('tools/net-test.mjs', `import net from 'node:net';
const s = net.connect({ host: '192.0.2.1', port: 9, timeout: 50 });
s.on('error', () => {}); s.on('timeout', () => s.destroy());
s.on('close', () => console.log('net done'));
`);
write('tools/local-test.mjs', `import net from 'node:net';
const srv = net.createServer((c) => c.end()).listen(0, '127.0.0.1', () => {
  const s = net.connect(srv.address().port, '127.0.0.1');
  s.on('close', () => { srv.close(); console.log('local done'); });
});
`);

// Declared inputs (gate#A2): a suite that starts a program the tracer cannot follow may list
// what it depends on instead of being never-cached; the list is validated.
const GIT = `import { execFileSync } from 'node:child_process';
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch (_) {}
console.log('probe ' + process.env.DECL_PROBE);
`;
write('tools/decl-git-test.mjs', '// kiwi-cache: inputs data/price.txt dir:data env:DECL_PROBE\n' + GIT);
write('tools/decl-missing-test.mjs', '// kiwi-cache: inputs data/does-not-exist.txt\n' + GIT);
write('tools/decl-escape-test.mjs', '// kiwi-cache: inputs ../outside.txt\n' + GIT);
write('tools/decl-empty-test.mjs', '// kiwi-cache: inputs\n' + GIT);
write('tools/decl-never-test.mjs', '// kiwi-cache: inputs data/price.txt\n// kiwi-cache: never also reads a clock\n' + GIT);
write('tools/decl-blind-test.mjs', `// kiwi-cache: inputs data/price.txt
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
console.log('blind probe ' + fs.existsSync(path.join(os.homedir(), '.kiwi-pass-cache-test-probe')));
`);

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failures++; };

function pool(names, env = {}) {
  const records = path.join(box, 'records.jsonl');
  const results = path.join(box, 'results.json');
  fs.writeFileSync(records, names.map((n) => JSON.stringify({ key: n, args: [path.join(repo, 'tools', n)], cwd: repo })).join('\n') + '\n');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^KIWI_|^NODE_OPTIONS$/.test(k)));
  const r = spawnSync(process.execPath, [path.join(repo, 'tools', 'check-pool.js'), records, results, '2', '1'], {
    cwd: repo, encoding: 'utf8', env: { ...clean, TMPDIR: tmp, TMP: tmp, TEMP: tmp, ...env },
  });
  if (r.status !== 0) throw new Error('pool failed: ' + r.stderr + r.stdout);
  return JSON.parse(fs.readFileSync(results, 'utf8'));
}
const cached = (res, n) => !!(res[n] && res[n].cached);

try {
  let res = pool(['sum-test.mjs']);
  ok(res['sum-test.mjs'].status === 0 && !cached(res, 'sum-test.mjs'), 'first run executes the test');
  res = pool(['sum-test.mjs']);
  ok(cached(res, 'sum-test.mjs'), 'same inputs: the pass is reused');
  ok(/price 1200 files 2 flag false/.test(res['sum-test.mjs'].stdout), 'a reused pass replays the output it printed');
  ok(res['sum-test.mjs'].cpuMs == null, 'a reused pass reports no CPU time, so the CPU ratchet skips it');

  write('data/price.txt', '1300');
  res = pool(['sum-test.mjs']);
  ok(!cached(res, 'sum-test.mjs') && /price 1300/.test(res['sum-test.mjs'].stdout), 'a file it read changed: runs again');
  ok(cached(pool(['sum-test.mjs']), 'sum-test.mjs'), 'and is reused once more after passing');

  write('data/b.txt', 'b');
  res = pool(['sum-test.mjs']);
  ok(!cached(res, 'sum-test.mjs') && /files 3/.test(res['sum-test.mjs'].stdout), 'a folder it listed gained a file: runs again');
  pool(['sum-test.mjs']);

  res = pool(['sum-test.mjs']);
  ok(cached(res, 'sum-test.mjs'), 'settled inputs are reused');
  write('flags/off.flag', '1');
  res = pool(['sum-test.mjs']);
  ok(!cached(res, 'sum-test.mjs') && /flag true/.test(res['sum-test.mjs'].stdout), 'a file it probed and found absent now exists: runs again');
  pool(['sum-test.mjs']);

  res = pool(['sum-test.mjs'], { KIWI_LOCALES: 'fr,en,ar' });
  ok(!cached(res, 'sum-test.mjs'), 'a different KIWI_ setting: runs again');
  ok(!cached(pool(['sum-test.mjs'], { KIWI_PASS_CACHE: '0' }), 'sum-test.mjs'), 'KIWI_PASS_CACHE=0 runs everything');

  write('data/price.txt', 'broken');
  res = pool(['sum-test.mjs']);
  ok(res['sum-test.mjs'].status === 1, 'a failing test fails');
  write('data/price.txt', '1300');
  res = pool(['sum-test.mjs']);
  ok(!cached(res, 'sum-test.mjs'), 'after a failure the old pass is gone, even for inputs it once passed with');

  pool(['git-test.mjs']);
  ok(!cached(pool(['git-test.mjs']), 'git-test.mjs'), 'a test that starts git (it reads history, not traced files) is never reused');

  pool(['skip-test.mjs']);
  res = pool(['skip-test.mjs']);
  ok(!cached(res, 'skip-test.mjs') && /○ skip/.test(res['skip-test.mjs'].stdout), 'a run that printed "○ skip" is never reused as a pass');
  fs.writeFileSync(path.join(repo, 'flags', 'browser.up'), '1');
  res = pool(['skip-test.mjs']);
  ok(/browser assertions ran/.test(res['skip-test.mjs'].stdout), 'so the next run executes once the browser is back');
  fs.rmSync(path.join(repo, 'flags', 'browser.up'));
  pool(['notrun-test.mjs']);
  ok(!cached(pool(['notrun-test.mjs']), 'notrun-test.mjs'), 'a run that printed "○ … not run" is never reused either');

  // A skip stored by an older pool (before this rule) is refused when read.
  const cacheFile = path.join(tmp, 'kiwi-pass-cache.json');
  write('flags/browser.up', '1');
  pool(['skip-test.mjs']); pool(['skip-test.mjs']);
  const stale = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  ok(!!stale['tools/skip-test.mjs'], 'a real pass of the same suite is cached');
  stale['tools/skip-test.mjs'].stdout = '○ skip: puppeteer-core or axe-core unavailable\n';
  fs.writeFileSync(cacheFile, JSON.stringify(stale));
  res = pool(['skip-test.mjs']);
  ok(!cached(res, 'skip-test.mjs') && /browser assertions ran/.test(res['skip-test.mjs'].stdout), 'an old cached skip is ignored and the suite runs');
  fs.rmSync(path.join(repo, 'flags', 'browser.up'));

  pool(['declared-test.mjs']);
  ok(!cached(pool(['declared-test.mjs']), 'declared-test.mjs'), 'a suite declaring "kiwi-cache: never" is never reused');
  pool(['home-test.mjs']);
  res = pool(['home-test.mjs']);
  ok(!cached(res, 'home-test.mjs') && /home probe/.test(res['home-test.mjs'].stdout), 'a suite that probes a path under the home folder outside the repo is never reused');
  pool(['pkg-test.mjs']);
  res = pool(['pkg-test.mjs']);
  ok(cached(res, 'pkg-test.mjs') && /pkg probe/.test(res['pkg-test.mjs'].stdout), 'a package read through node_modules outside the repo (a worktree\'s symlinked app/node_modules) stays cacheable');
  pool(['net-test.mjs']);
  res = pool(['net-test.mjs']);
  ok(!cached(res, 'net-test.mjs') && /net done/.test(res['net-test.mjs'].stdout), 'a suite that dials a non-local host is never reused');
  pool(['local-test.mjs']);
  res = pool(['local-test.mjs']);
  ok(cached(res, 'local-test.mjs') && /local done/.test(res['local-test.mjs'].stdout), 'loopback traffic and temp files stay cacheable');

  // Declared inputs: a git-starting suite that lists what it reads is reusable, and each listed input is in the key.
  pool(['decl-git-test.mjs'], { DECL_PROBE: 'a' });
  ok(cached(pool(['decl-git-test.mjs'], { DECL_PROBE: 'a' }), 'decl-git-test.mjs'), 'a suite that starts git but declares its inputs is reused when none changed');
  ok(!cached(pool(['decl-git-test.mjs'], { DECL_PROBE: 'b' }), 'decl-git-test.mjs'), 'a declared environment variable changed: runs again');
  pool(['decl-git-test.mjs'], { DECL_PROBE: 'b' });
  write('data/price.txt', '1400');
  ok(!cached(pool(['decl-git-test.mjs'], { DECL_PROBE: 'b' }), 'decl-git-test.mjs'), 'a declared file changed: runs again');
  pool(['decl-git-test.mjs'], { DECL_PROBE: 'b' });
  write('data/c.txt', 'c');
  ok(!cached(pool(['decl-git-test.mjs'], { DECL_PROBE: 'b' }), 'decl-git-test.mjs'), 'a declared folder listing changed: runs again');
  for (const n of ['decl-missing-test.mjs', 'decl-escape-test.mjs', 'decl-empty-test.mjs', 'decl-never-test.mjs', 'decl-blind-test.mjs']) {
    pool([n]);
    const again = pool([n]);
    ok(!cached(again, n) && again[n].status === 0, n + ': ' + ({
      'decl-missing-test.mjs': 'a declared file that does not exist invalidates the declaration: never reused',
      'decl-escape-test.mjs': 'a declared path outside the repo is refused: never reused',
      'decl-empty-test.mjs': 'an empty declaration is refused: never reused',
      'decl-never-test.mjs': '"never" outranks a declared list',
      'decl-blind-test.mjs': 'a read outside the repo that the tracer saw is not covered by a list: never reused',
    })[n]);
  }

  const cache = JSON.parse(fs.readFileSync(path.join(tmp, 'kiwi-pass-cache.json'), 'utf8'));
  ok(Object.keys(cache).length > 0 && Object.keys(cache).every((k) => k.startsWith('tools/')), 'cache entries are keyed repo-relative, never by absolute path');
} finally {
  fs.rmSync(box, { recursive: true, force: true });
}

if (failures) { console.log(`\n  ✗ pass cache: ${failures} failure(s)`); process.exit(1); }
console.log('\n  ✓ pass cache: reused only on identical inputs');
