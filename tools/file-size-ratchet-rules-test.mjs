// Les règles du cliquet de taille, exécutées sur un petit arbre factice :
// une feuille de style ne grossit plus sans limite, et les 200 lignes de marge
// d'avant ne sont plus un second budget (marge de 50, fichiers déjà au-delà
// figés à leur taille). Le vrai cliquet est tools/file-size-ratchet-test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('./file-size-ratchet-test.mjs', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const lines = (n) => Array.from({ length: n }, (_, i) => 'x' + i).join('\n') + '\n';

function run(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ratchet-'));
  try {
    for (const d of ['assets', 'functions']) fs.mkdirSync(path.join(root, d), { recursive: true });
    for (const [rel, n] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), lines(n)); }
    for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html']) if (!files[shell]) fs.writeFileSync(path.join(root, shell), '<html></html>\n');
    fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tools/controller-interfaces.json'), '{}');
    fs.writeFileSync(path.join(root, 'tools/file-size-baseline.json'), JSON.stringify({ note: '', scripts: { 'dashboard.html': 0, 'kiwi-caisse.html': 0, 'kiwi-serveur.html': 0 }, important: {}, ...baseline }));
    const r = spawnSync(process.execPath, [script], { env: { ...process.env, KIWI_RATCHET_ROOT: root }, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

let r = run({ 'assets/a.css': 1100 }, { lines: {}, cssLines: { 'assets/a.css': 1000 } });
ok(r.code !== 0 && /assets\/a\.css: 1100 lines, 100 over its pin of 1000/.test(r.out), 'a pinned stylesheet 100 lines over its pin fails');
r = run({ 'assets/a.css': 1040 }, { lines: {}, cssLines: { 'assets/a.css': 1000 } });
ok(r.code === 0, 'a stylesheet within 50 lines of its pin passes');
r = run({ 'assets/new.css': 2600 }, { lines: {}, cssLines: {} });
ok(r.code !== 0 && /not pinned/.test(r.out), 'an unpinned stylesheet over 2500 lines fails');
r = run({ 'assets/new.css': 800 }, { lines: {}, cssLines: {} });
ok(r.code === 0, 'a small unpinned stylesheet passes');

r = run({ 'assets/b.js': 1100 }, { lines: { 'assets/b.js': 1000 }, cssLines: {} });
ok(r.code !== 0 && /100 over its pin of 1000/.test(r.out), 'a pinned script 100 lines over its pin fails (the slack was 200)');
r = run({ 'assets/b.js': 1049 }, { lines: { 'assets/b.js': 1000 }, cssLines: {} });
ok(r.code === 0, 'a pinned script within 50 lines passes');
r = run({ 'assets/b.js': 1180 }, { lines: { 'assets/b.js': 1000 }, frozen: { 'assets/b.js': 1180 }, cssLines: {} });
ok(r.code === 0, 'a script frozen at its current size passes');
r = run({ 'assets/b.js': 1181 }, { lines: { 'assets/b.js': 1000 }, frozen: { 'assets/b.js': 1180 }, cssLines: {} });
ok(r.code !== 0 && /frozen at 1180/.test(r.out), 'a frozen script one line over its frozen size fails');

const real = JSON.parse(fs.readFileSync(new URL('./file-size-baseline.json', import.meta.url), 'utf8'));
for (const [rel, n] of Object.entries(real.frozen || {})) assert.ok(n <= real.lines[rel] + 200, rel + ': frozen above the old ceiling');
ok(Object.keys(real.cssLines || {}).length > 50 && real.cssLines['assets/design-vexel.css'] > 5000, 'the real baseline pins every stylesheet, including the four largest');
console.log(`file-size-ratchet-rules: ${checks} checks passed`);
