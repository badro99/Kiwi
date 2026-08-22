#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · bump-stamp --sw et garde-fou pre-commit
 *
 *   node tools/bump-stamp-test.mjs
 *
 * Deux choses que rien ne testait :
 *   · `node tools/bump-stamp.js --sw` avance la génération du service worker
 *     dans les QUATRE fichiers (CACHE + trois register()) puis déplace les
 *     estampilles des bootstraps réécrits — shell, SW, manifeste.
 *   · tools/hooks/pre-commit refuse un commit dont l'index a dérivé, l'accepte
 *     quand il est cohérent, et ignore l'arbre de travail (le travail non
 *     stagé d'une autre session ne le fait pas rougir).
 * Les deux tournent dans un arbre jetable (KIWI_STAMPS_ROOT / dépôt git temp).
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; const failures = [];
const ok = (c, m) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failures.push(m); console.log(`  ✗ ${m}`); } };
console.log('■ bump-stamp --sw · pre-commit hook (tools/bump-stamp-test.mjs)');

/* ── un mini-dépôt Kiwi : deux shells, un SW, trois bootstraps, un registre ── */
function fixture(dir) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  for (const f of ['stamps.js', 'bump-stamp.js', 'stamp-drift-test.js']) {
    fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
  }
  const w = (rel, s) => fs.writeFileSync(path.join(dir, rel), s);
  w('assets/dashboard-pwa.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/caisse-pwa.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/employee-live.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/venues.js', 'window.KiwiVenue = {};\n');
  w('assets/pos-dispatch.js', "const REGISTRY = { '0002': { id: 'boutique', file: 'pos-boutique', rev: '3' } };\n");
  w('assets/pos-boutique.js', '// boutique\n');
  w('dashboard.html', '<script src="assets/venues.js?v=7"></script><script src="assets/dashboard-pwa.js?v=2"></script>\n');
  w('kiwi-caisse.html', '<script src="assets/caisse-pwa.js?v=5"></script><script src="assets/employee-live.js?v=9"></script>\n');
  w('kiwi-sw.js', "var CACHE = 'kiwi-app-v40';\nvar SHELL = ['/assets/venues.js?v=7','/assets/dashboard-pwa.js?v=2','/assets/caisse-pwa.js?v=5','/assets/employee-live.js?v=9'];\n");
}
const env = (dir) => ({ ...process.env, KIWI_STAMPS_ROOT: dir });
const run = (dir, args) => spawnSync(process.execPath, [path.join(dir, 'tools/bump-stamp.js'), ...args], { env: env(dir), encoding: 'utf8' });
const rd = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

/* A · --sw : génération + estampilles des bootstraps, d'un coup */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bump-'));
  fixture(dir);
  ok(run(dir, ['--sync']).status === 0, 'fixture : manifeste scellé (--sync)');
  const r = run(dir, ['--sw']);
  ok(r.status === 0, `--sw sort en 0 (${(r.stderr || '').trim().slice(0, 80)})`);
  ok(/CACHE = 'kiwi-app-v41'/.test(rd(dir, 'kiwi-sw.js')), 'kiwi-sw.js : CACHE v40 → v41');
  for (const b of ['dashboard-pwa', 'caisse-pwa', 'employee-live']) {
    ok(/register\('\/kiwi-sw\.js\?v=41'\)/.test(rd(dir, `assets/${b}.js`)), `${b}.js : register() demande ?v=41`);
  }
  ok(/dashboard-pwa\.js\?v=3/.test(rd(dir, 'dashboard.html')) && /dashboard-pwa\.js\?v=3/.test(rd(dir, 'kiwi-sw.js')), 'dashboard-pwa.js : estampille 2 → 3 dans le shell ET la liste SHELL');
  ok(/caisse-pwa\.js\?v=6/.test(rd(dir, 'kiwi-caisse.html')) && /employee-live\.js\?v=10/.test(rd(dir, 'kiwi-sw.js')), 'caisse-pwa 5 → 6 et employee-live 9 → 10 partout');
  ok(/venues\.js\?v=7/.test(rd(dir, 'dashboard.html')), 'un asset non touché (venues.js) garde son estampille');
  const drift = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(drift.status === 0, 'après --sw, stamp-drift-test est vert (copies d\'accord, manifeste re-scellé)');
  ok(/CACHE = 'kiwi-app-v41'/.test(rd(dir, 'kiwi-sw.js')) && ['dashboard-pwa', 'caisse-pwa', 'employee-live'].every((b) => /\?v=41'/.test(rd(dir, `assets/${b}.js`))), 'bootstraps et CACHE portent la même génération (ce que pwa-shell-test vérifie sur le vrai dépôt)');
  const again = run(dir, ['--sw']);
  ok(again.status === 0 && /kiwi-app-v42/.test(rd(dir, 'kiwi-sw.js')) && /dashboard-pwa\.js\?v=4/.test(rd(dir, 'dashboard.html')), 'un second --sw avance encore d\'un cran (41 → 42, estampilles 3 → 4)');
  fs.rmSync(dir, { recursive: true, force: true });
}

/* B · le hook juge l'index, jamais l'arbre de travail */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-hook-'));
  fixture(dir);
  fs.mkdirSync(path.join(dir, 'tools/hooks'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools/hooks/pre-commit'), path.join(dir, 'tools/hooks/pre-commit'));
  fs.chmodSync(path.join(dir, 'tools/hooks/pre-commit'), 0o755);
  fs.copyFileSync(path.join(ROOT, 'tools/install-hooks.sh'), path.join(dir, 'tools/install-hooks.sh'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  run(dir, ['--sync']);
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  const inst = spawnSync('sh', ['tools/install-hooks.sh'], { cwd: dir, encoding: 'utf8' });
  ok(inst.status === 0 && fs.existsSync(path.join(dir, '.git/hooks/pre-commit')), 'install-hooks.sh pose .git/hooks/pre-commit');
  const commit = (msg) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg], { cwd: dir, encoding: 'utf8' });

  /* 1 · un asset édité sans bump, stagé → refusé, avec la commande à lancer */
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), 'window.KiwiVenue.x = 1;\n');
  git('add', 'assets/venues.js');
  const c1 = commit('drift');
  ok(c1.status !== 0, 'commit refusé : venues.js a changé, son estampille non');
  ok(/bump-stamp\.js --all/.test(c1.stdout + c1.stderr), 'le refus indique `node tools/bump-stamp.js --all`');

  /* 2 · bump + stage de tout ce que l'outil a touché → accepté */
  ok(run(dir, ['assets/venues.js']).status === 0, 'bump-stamp déplace venues.js');
  git('add', 'assets/venues.js', 'dashboard.html', 'kiwi-sw.js', 'tools/asset-stamps.json');
  const c2 = commit('bumped');
  ok(c2.status === 0, 'commit accepté une fois l\'estampille déplacée partout');

  /* 3 · du travail NON stagé d'une autre session ne fait pas rougir un commit propre */
  fs.appendFileSync(path.join(dir, 'assets/pos-boutique.js'), '// autre session, pas stagé\n');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  git('add', 'README.md');
  const c3 = commit('docs only');
  ok(c3.status === 0, 'un commit sans surface estampillée passe, malgré la dérive non stagée d\'à côté');
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), '// v2\n');
  ok(run(dir, ['assets/venues.js']).status === 0, 'bump-stamp (2e)');
  git('add', 'assets/venues.js', 'dashboard.html', 'kiwi-sw.js', 'tools/asset-stamps.json');
  const c4 = commit('clean index, dirty tree');
  /* bump-stamp scelle le manifeste depuis l'arbre de travail : la dérive non
     stagée de pos-boutique.js est entrée dans le manifeste stagé, que le commit
     rendrait faux. Le hook refuse — et NOMME le fichier et la cause. */
  ok(c4.status !== 0, 'un manifeste qui encode une dérive non stagée (pos-boutique.js) est refusé');
  ok(/pos-boutique\.js est modifié mais NON stagé/.test(c4.stdout + c4.stderr), 'le refus nomme le fichier non stagé et dit quoi faire');
  git('add', 'assets/pos-boutique.js');
  ok(commit('clean index, staged sibling').status === 0, 'une fois le frère stagé (ou le manifeste cohérent), le commit passe');

  /* 4 · l'échappatoire explicite */
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), '// v3\n');
  git('add', 'assets/venues.js');
  const c5 = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'skip'], { cwd: dir, encoding: 'utf8', env: { ...process.env, KIWI_SKIP_STAMP_HOOK: '1' } });
  ok(c5.status === 0, 'KIWI_SKIP_STAMP_HOOK=1 passe outre');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed · ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
