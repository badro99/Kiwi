// tools/check-pool.js : le plafond des navigateurs monte quand les suites node sont finies.
// Avant le 18 novembre 2026, trois navigateurs au plus pendant toute la passe : une
// fois les suites node parties, leurs places restaient vides et la file des suites
// navigateur faisait seule les 20 dernières minutes du gate. Tenu ici : tant que des
// suites node restent ou tournent, le plafond d'origine ; ensuite browserIdle ;
// KIWI_CHECK_BROWSER_JOBS_IDLE égal au plafond rend l'ancien comportement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POOL = process.env.KIWI_POOL_UNDER_TEST || path.join(ROOT, 'tools', 'check-pool.js');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

function run(idle) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pool-cap-'));
  const log = path.join(dir, 'events.log');
  const make = (name, ms, browser) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `${browser ? '// drives puppeteer (fixture)\n' : ''}import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(log)}, 'start ${name} ' + Date.now() + '\\n');
await new Promise((r) => setTimeout(r, ${ms}));
fs.appendFileSync(${JSON.stringify(log)}, 'end ${name} ' + Date.now() + '\\n');
`);
    return file;
  };
  const files = [
    ...[1, 2, 3].map((i) => make(`fast-${i}-test.mjs`, 1500, false)),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => make(`page-${i}-browser-test.mjs`, 500, true)),
  ];
  const records = path.join(dir, 'records.jsonl');
  fs.writeFileSync(records, files.map((f) => JSON.stringify({ key: f, args: [f] })).join('\n') + '\n');
  const env = { ...process.env, TMPDIR: dir, KIWI_PASS_CACHE: '0', KIWI_DEP_TRACE: '0', KIWI_COVERAGE_PROBE: '0' };
  delete env.KIWI_CHECK_BROWSER_JOBS_IDLE;
  if (idle != null) env.KIWI_CHECK_BROWSER_JOBS_IDLE = String(idle);
  const r = spawnSync(process.execPath, [POOL, records, path.join(dir, 'results.json'), '8', '2'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => { const [kind, name, t] = l.split(' '); return { kind, name, t: +t }; })
    .sort((a, b) => a.t - b.t || (a.kind === 'end' ? -1 : 1));
  let fast = 0, pages = 0, maxPages = 0, maxPagesBesideFast = 0;
  for (const e of events) {
    const d = e.kind === 'start' ? 1 : -1;
    if (e.name.startsWith('fast')) fast += d; else pages += d;
    maxPages = Math.max(maxPages, pages);
    if (fast > 1) maxPagesBesideFast = Math.max(maxPagesBesideFast, pages);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { maxPages, maxPagesBesideFast, out: r.stdout };
}

const adaptive = run(4);
ok('pendant les suites node, le plafond d’origine tient (2 navigateurs)', () => {
  assert.ok(adaptive.maxPagesBesideFast <= 2, `browsers beside node suites: ${adaptive.maxPagesBesideFast}`);
});
ok('une fois les suites node finies, le plafond monte à KIWI_CHECK_BROWSER_JOBS_IDLE', () => {
  assert.equal(adaptive.maxPages, 4);
  assert.match(adaptive.out, /2 browsers, 4 once node suites are done/);
});
ok('KIWI_CHECK_BROWSER_JOBS_IDLE égal au plafond rend l’ancien comportement', () => {
  assert.equal(run(2).maxPages, 2);
});
ok('par défaut, deux navigateurs de plus que le plafond', () => {
  assert.equal(run(null).maxPages, 4);
});
ok('une suite qui reste ouverte après sa dernière ligne est nommée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-pool-linger-'));
  const held = path.join(dir, 'held-test.mjs'), quick = path.join(dir, 'quick-test.mjs');
  fs.writeFileSync(held, "console.log('✓ done'); setTimeout(() => {}, 900);\n");
  fs.writeFileSync(quick, "console.log('✓ done');\n");
  const records = path.join(dir, 'records.jsonl');
  fs.writeFileSync(records, [held, quick].map((f) => JSON.stringify({ key: f, args: [f] })).join('\n') + '\n');
  const env = { ...process.env, TMPDIR: dir, KIWI_PASS_CACHE: '0', KIWI_DEP_TRACE: '0', KIWI_COVERAGE_PROBE: '0', KIWI_CHECK_LINGER_MS: '500' };
  const r = spawnSync(process.execPath, [POOL, records, path.join(dir, 'results.json'), '4', '1'], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /⚠ held-test\.mjs stayed open \d+ s after its last output/);
  assert.doesNotMatch(r.stdout, /quick-test\.mjs stayed open/);
});
console.log(`check-pool-browser-cap: ${n} checks ok`);
