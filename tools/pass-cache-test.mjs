// Kiwi · pass-cache-test.mjs — the gate's pass cache (tools/check-pool.js) only
// reuses a pass when every input it read is unchanged.
//
// Builds a throwaway repo with the real pool, guard and tracer, runs a small
// test through the pool twice, then changes one input at a time and checks the
// test runs again: a file it read, a folder it listed, a file it probed and
// found absent, a KIWI_ setting. A failing test, a test that starts git and
// KIWI_PASS_CACHE=0 are never served from the cache. The cache lives in a
// private TMPDIR, so this suite never touches the machine's real cache.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const box = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pass-cache-'));
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
write('tools/git-test.mjs', `import { execFileSync } from 'node:child_process';
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch (_) {}
console.log('git ok');
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

  const cache = JSON.parse(fs.readFileSync(path.join(tmp, 'kiwi-pass-cache.json'), 'utf8'));
  ok(Object.keys(cache).every((k) => !k.startsWith('/')), 'cache entries are keyed repo-relative, never by absolute path');
} finally {
  fs.rmSync(box, { recursive: true, force: true });
}

if (failures) { console.log(`\n  ✗ pass cache: ${failures} failure(s)`); process.exit(1); }
console.log('\n  ✓ pass cache: reused only on identical inputs');
