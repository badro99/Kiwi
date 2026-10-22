#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · bump-stamp --sw et garde-fou pre-commit
 *
 *   node tools/bump-stamp-test.mjs
 *
 * Trois choses que rien ne testait :
 *   · un asset charge par une URL nue recoit sa premiere estampille dans tous
 *     ses shells, dans le SW s'il y vit deja, puis dans le manifeste.
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
import crypto from 'crypto';
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
  for (const f of ['stamps.js', 'bump-stamp.js', 'stamp-drift-test.js', 'app-bundle-manifest.json']) {
    fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
  }
  const w = (rel, s) => fs.writeFileSync(path.join(dir, rel), s);
  w('assets/dashboard-pwa.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/caisse-pwa.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/employee-live.js', "navigator.serviceWorker.register('/kiwi-sw.js?v=40').then(function(){});\n");
  w('assets/venues.js', 'window.KiwiVenue = {};\n');
  w('assets/procurement.js', 'window.KiwiProcurement = {};\n');
  w('assets/pos-dispatch.js', "const REGISTRY = { '0002': { id: 'boutique', file: 'pos-boutique', rev: '3' } };\n");
  w('assets/pos-boutique.js', '// boutique\n');
  w('dashboard.html', '<script src="assets/venues.js?v=7"></script><script src="assets/dashboard-pwa.js?v=2"></script><script src="assets/procurement.js"></script>\n');
  w('kiwi-caisse.html', '<script src="assets/caisse-pwa.js?v=5"></script><script src="assets/employee-live.js?v=9"></script><script src="assets/procurement.js"></script>\n');
  w('kiwi-sw.js', "var CACHE = 'kiwi-app-v40';\nvar SHELL = ['/assets/venues.js?v=7','/assets/dashboard-pwa.js?v=2','/assets/caisse-pwa.js?v=5','/assets/employee-live.js?v=9','/assets/procurement.js'];\n");
}
const env = (dir) => ({ ...process.env, KIWI_STAMPS_ROOT: dir });
const run = (dir, args) => spawnSync(process.execPath, [path.join(dir, 'tools/bump-stamp.js'), ...args], { env: env(dir), encoding: 'utf8' });
const rd = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

/* A · --sw : génération + estampilles des bootstraps, d'un coup */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bump-'));
  fixture(dir);
  ok(run(dir, ['--sync']).status === 0, 'fixture : manifeste scellé (--sync)');
  const introduced = run(dir, ['assets/procurement.js']);
  ok(introduced.status === 0, 'un asset sans estampille recoit sa premiere estampille');
  ok(/procurement\.js\?v=1/.test(rd(dir, 'dashboard.html')) && /procurement\.js\?v=1/.test(rd(dir, 'kiwi-caisse.html')), 'premiere estampille dans les deux shells');
  ok(/procurement\.js\?v=1/.test(rd(dir, 'kiwi-sw.js')), 'premiere estampille dans SHELL quand la reference y existait deja');
  ok(JSON.parse(rd(dir, 'tools/asset-stamps.json'))['assets/procurement.js']?.v === '1', 'premiere estampille scellee dans le manifeste');
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
  // Git maintenance and macOS file watchers may briefly race disposal. Retry
  // cleanup only; every stamp/hook assertion above still runs exactly once.
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/* Lazy pages-pro URLs participate in drift checks and cascade to their parent. */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-lazy-stamp-'));
  fixture(dir);
  fs.mkdirSync(path.join(dir, 'assets/pages-pro'));
  fs.writeFileSync(path.join(dir, 'assets/pages-pro/spa-appointments.js'), '// spa\n');
  fs.writeFileSync(path.join(dir, 'assets/pages-pro.js'), "const LAZY_SECTIONS = [{ url: 'assets/pages-pro/spa-appointments.js?v=1', handlers: [] }];\n");
  fs.appendFileSync(path.join(dir, 'dashboard.html'), '<script src="assets/pages-pro.js?v=1"></script>');
  run(dir, ['--sync']);
  fs.appendFileSync(path.join(dir, 'assets/pages-pro/spa-appointments.js'), '// changed\n');
  const drift = () => spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(drift().status === 1, 'lazy chunk content drift is rejected');
  ok(run(dir, ['assets/pages-pro/spa-appointments.js']).status === 0, 'lazy chunk bump succeeds');
  ok(rd(dir, 'assets/pages-pro.js').includes('spa-appointments.js?v=2'), 'lazy registry URL moves');
  ok(rd(dir, 'dashboard.html').includes('assets/pages-pro.js?v=2'), 'lazy registry parent stamp cascades');
  ok(drift().status === 0, 'lazy chunk and parent are sealed after bump');
  fs.rmSync(dir, { recursive: true, force: true });
}

/* Le chargeur de rapport participe au bump et à sa cascade, comme pages-pro. */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-report-stamp-'));
  fixture(dir);
  fs.writeFileSync(path.join(dir, 'assets/report.js'), '// rapport\n');
  fs.writeFileSync(path.join(dir, 'assets/dashboard-extra.js'), "new URL('assets/report.js?v=1', document.baseURI);\n");
  fs.appendFileSync(path.join(dir, 'dashboard.html'), '<link rel="preload" href="assets/report.js?v=1" as="script"><script src="assets/dashboard-extra.js?v=1"></script>');
  run(dir, ['--sync']);
  fs.appendFileSync(path.join(dir, 'assets/report.js'), '// modifié\n');
  ok(run(dir, ['assets/report.js']).status === 0, 'report bump succeeds');
  ok(rd(dir, 'assets/dashboard-extra.js').includes('report.js?v=2'), 'report loader URL moves with preload');
  ok(rd(dir, 'dashboard.html').includes('dashboard-extra.js?v=2'), 'report loader stamp cascades');
  ok(spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' }).status === 0, 'report loader and preload seal together');
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
  // Comme le .gitattributes du dépôt (* -text) : sans lui, core.autocrlf=true (Git pour
  // Windows) exporte l'index en CRLF et les estampilles ne collent plus aux octets.
  git('config', 'core.autocrlf', 'false');
  run(dir, ['--sync']);
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  const inst = spawnSync('sh', ['tools/install-hooks.sh'], { cwd: dir, encoding: 'utf8' });
  ok(inst.status === 0 && fs.existsSync(path.join(dir, '.git/hooks/pre-commit')), 'install-hooks.sh pose .git/hooks/pre-commit');
  const commit = (msg) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg], { cwd: dir, encoding: 'utf8' });

  /* 0 · le gate complet, même sans hook/env, compare au manifeste de HEAD. */
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), 'window.KiwiVenue.unbumped = 1;\n');
  const silentlyResealed = JSON.parse(rd(dir, 'tools/asset-stamps.json'));
  silentlyResealed['assets/venues.js'].sha = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(dir, 'assets/venues.js'))).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(dir, 'tools/asset-stamps.json'), JSON.stringify(silentlyResealed, null, 2) + '\n');
  const directGate = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { cwd: dir, env: env(dir), encoding: 'utf8' });
  ok(directGate.status !== 0, 'check direct refusé : manifeste re-scellé sans bump, même sans hook/env');
  ok(/manifeste a ete re-scelle/.test(directGate.stdout + directGate.stderr), 'check direct explique le faux vert à partir de HEAD');
  git('checkout', '--', 'assets/venues.js', 'tools/asset-stamps.json');

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

  /* 3 · re-sceller le manifeste sans bumper ne doit pas contourner le hook.
     C'est exactement le faux vert qui a laissé pos-dispatch.js?v=39 en prod
     alors que son registre local demandait Maison v31. */
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), 'window.KiwiVenue.y = 2;\n');
  const resealed = JSON.parse(rd(dir, 'tools/asset-stamps.json'));
  resealed['assets/venues.js'].sha = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(dir, 'assets/venues.js'))).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(dir, 'tools/asset-stamps.json'), JSON.stringify(resealed, null, 2) + '\n');
  git('add', 'assets/venues.js', 'tools/asset-stamps.json');
  const cResealed = commit('resealed without bump');
  ok(cResealed.status !== 0, 'commit refusé : manifeste re-scellé mais estampille inchangée');
  ok(/a change de contenu mais le manifeste a ete re-scelle/.test(cResealed.stdout + cResealed.stderr), 'le refus explique le faux vert et demande un bump');
  ok(run(dir, ['assets/venues.js']).status === 0, 'bump-stamp corrige le re-scellement sans version');
  git('add', 'assets/venues.js', 'dashboard.html', 'kiwi-sw.js', 'tools/asset-stamps.json');
  ok(commit('bumped after reseal').status === 0, 'commit accepté après le vrai bump');

  /* 4 · du travail NON stagé d'une autre session ne fait pas rougir un commit propre */
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
  ok(run(dir, ['assets/pos-boutique.js']).status === 0, 'le frère modifié reçoit lui aussi une nouvelle estampille');
  git('add', 'assets/pos-boutique.js', 'assets/pos-dispatch.js', 'tools/asset-stamps.json');
  ok(commit('clean index, bumped sibling').status === 0, 'une fois le frère bumpé et stagé, le commit passe');

  /* 5 · l'échappatoire explicite */
  fs.appendFileSync(path.join(dir, 'assets/venues.js'), '// v3\n');
  git('add', 'assets/venues.js');
  const c5 = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'skip'], { cwd: dir, encoding: 'utf8', env: { ...process.env, KIWI_SKIP_STAMP_HOOK: '1' } });
  ok(c5.status === 0, 'KIWI_SKIP_STAMP_HOOK=1 passe outre');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/* C · cascade : bumper une verticale réécrit son rev DANS pos-dispatch.js ;
   si le dispatcher est lui-même estampillé, il doit suivre dans le même run
   (sinon il change de contenu en gardant son URL, et `--all` dit « rien »). */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bump-'));
  fixture(dir);
  const w = (rel, txt) => fs.writeFileSync(path.join(dir, rel), txt);
  w('kiwi-caisse.html', rd(dir, 'kiwi-caisse.html') + '<script src="assets/pos-dispatch.js?v=10"></script>\n');
  w('kiwi-sw.js', rd(dir, 'kiwi-sw.js').replace("'/assets/procurement.js'", "'/assets/procurement.js','/assets/pos-dispatch.js?v=10','/assets/pos-boutique.js?v=3'"));
  ok(run(dir, ['--sync']).status === 0, 'cascade · fixture scellée');
  fs.appendFileSync(path.join(dir, 'assets/pos-boutique.js'), '// changed\n');
  const r = run(dir, ['--all']);
  ok(r.status === 0 && /rev: '4'/.test(rd(dir, 'assets/pos-dispatch.js')), 'cascade · le rev de la verticale avance');
  ok(/pos-dispatch\.js\?v=11/.test(rd(dir, 'kiwi-caisse.html')) && /pos-dispatch\.js\?v=11/.test(rd(dir, 'kiwi-sw.js')), 'cascade · le dispatcher réécrit reçoit sa propre estampille');
  const drift = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(drift.status === 0, 'cascade · stamp-drift vert après un seul --all');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/* D · fontes et feuilles de style (design 2027 §21.3, « CSS sites ») : un woff2 se
   bumpe comme un script, ses url() se résolvent contre le dossier d'où la feuille
   est SERVIE, et `../fonts/x.woff2` (assets/kit/), `x.woff2` (assets/fonts/) et
   `assets/fonts/x.woff2` (les feuilles natives, servies à la racine du bundle) sont
   UNE clé avec UNE estampille. Les pages hors coquilles (guides, landings Next) qui
   lient assets/fonts/legacy-faces.css suivent aussi. */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bump-fonts-'));
  fixture(dir);
  const w = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), txt); };
  w('assets/fonts/x.woff2', 'wOF2 pas une vraie fonte, un contenu\n');
  w('assets/fonts/legacy-faces.css', '@font-face{font-family:"IBM Plex Sans Arabic";src:url("x.woff2") format("woff2");font-weight:400}\n');
  w('assets/kit/tokens-2027.css', '@font-face{font-family:"Kiwi Arabic";src:url("../fonts/x.woff2") format("woff2");font-weight:400}\n');
  w('app/src/native-runtime.css', '@font-face{font-family:"IBM Plex Sans Arabic";src:url("assets/fonts/x.woff2") format("woff2");font-weight:400}\n@font-face{font-family:"JetBrains Mono";src:url("native-fonts/jb.woff2") format("woff2")}\n');
  w('app/src/native-shell.css', '@font-face { font-family: "IBM Plex Sans Arabic"; src: url("assets/fonts/x.woff2") format("woff2"); font-weight: 400; }\n');
  for (const f of ['native-runtime.js', 'native-privacy.js', 'native-locale.js', 'index.html', 'native-shell.js']) w(`app/src/${f}`, '//\n');
  w('dashboard.html', rd(dir, 'dashboard.html') + '<link rel="stylesheet" href="assets/fonts/legacy-faces.css">\n');
  w('fr/guides/a.html', '<link rel="stylesheet" href="/assets/fonts/legacy-faces.css" /><link rel="stylesheet" href="/assets/articles/article.css?v=12">\n');
  w('node_modules/pkg/leave-me-alone.html', '<link rel="stylesheet" href="/assets/fonts/legacy-faces.css">\n');
  w('fr/guides/b 2.html', '<link rel="stylesheet" href="/assets/fonts/legacy-faces.css">\n');
  const r1 = run(dir, ['assets/fonts/x.woff2', 'assets/fonts/legacy-faces.css']);
  ok(r1.status === 0, `fontes · bump-stamp d'un woff2 et de sa feuille sort en 0 (${(r1.stderr || '').trim().slice(0, 100)})`);
  ok(/src:url\("x\.woff2\?v=1"\)/.test(rd(dir, 'assets/fonts/legacy-faces.css')), 'fontes · la feuille d\'assets/fonts/ reçoit ?v=1 sur sa url() relative');
  ok(/url\("\.\.\/fonts\/x\.woff2\?v=1"\)/.test(rd(dir, 'assets/kit/tokens-2027.css')), 'fontes · la feuille du kit reçoit ?v=1 sur « ../fonts/x.woff2 » : la même clé');
  ok(/url\("assets\/fonts\/x\.woff2\?v=1"\)/.test(rd(dir, 'app/src/native-runtime.css')) && /url\("assets\/fonts\/x\.woff2\?v=1"\)/.test(rd(dir, 'app/src/native-shell.css')), 'fontes · les deux feuilles natives reçoivent ?v=1, résolues contre la racine du bundle');
  ok(/native-fonts\/jb\.woff2"\)/.test(rd(dir, 'app/src/native-runtime.css')), 'fontes · une fonte hors assets/ (JetBrains Mono, native-fonts/) n\'est pas estampillée');
  ok(/legacy-faces\.css\?v=1/.test(rd(dir, 'dashboard.html')), 'fontes · la coquille liant legacy-faces.css reçoit ?v=1');
  ok(/\/assets\/fonts\/legacy-faces\.css\?v=1/.test(rd(dir, 'fr/guides/a.html')), 'fontes · une page hors coquille (guide) qui lie legacy-faces.css reçoit ?v=1, chemin absolu compris');
  ok(/article\.css\?v=12/.test(rd(dir, 'fr/guides/a.html')), 'fontes · les autres estampilles de cette page ne sont pas touchées (article.css reste à ?v=12)');
  ok(!/\?v=/.test(rd(dir, 'node_modules/pkg/leave-me-alone.html')) && !/\?v=/.test(rd(dir, 'fr/guides/b 2.html')), 'fontes · node_modules/ et les copies de conflit « b 2.html » ne sont pas lues');
  const m1 = JSON.parse(rd(dir, 'tools/asset-stamps.json'));
  ok(m1['assets/fonts/x.woff2']?.v === '1' && m1['assets/fonts/legacy-faces.css']?.v === '1', 'fontes · le manifeste scelle le woff2 et la feuille à ?v=1');
  const d1 = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(d1.status === 0, `fontes · stamp-drift est vert après le premier bump (${(d1.stdout + d1.stderr).trim().split('\n').pop().slice(0, 100)})`);

  /* le fichier change : l'estampille suit PARTOUT, et la feuille qui le nomme change de contenu, donc la sienne aussi */
  fs.appendFileSync(path.join(dir, 'assets/fonts/x.woff2'), 'octets en plus\n');
  const r2 = run(dir, ['--all']);
  ok(r2.status === 0, 'fontes · --all sort en 0');
  ok(['assets/fonts/legacy-faces.css', 'assets/kit/tokens-2027.css', 'app/src/native-runtime.css', 'app/src/native-shell.css'].every((f) => /x\.woff2\?v=2/.test(rd(dir, f))), 'fontes · le woff2 modifié passe à ?v=2 dans les quatre feuilles qui le nomment');
  ok(/legacy-faces\.css\?v=2/.test(rd(dir, 'dashboard.html')) && /legacy-faces\.css\?v=2/.test(rd(dir, 'fr/guides/a.html')), 'fontes · cascade : la feuille réécrite passe à ?v=2 dans la coquille et dans la page de guide');
  const d2 = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(d2.status === 0, 'fontes · stamp-drift vert après un seul --all');

  /* deux sites d'une même clé, deux estampilles : refusé */
  w('app/src/native-shell.css', rd(dir, 'app/src/native-shell.css').replace('x.woff2?v=2', 'x.woff2?v=1'));
  const d3 = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
  ok(d3.status !== 0 && /estampilles différentes/.test(d3.stdout + d3.stderr), 'fontes · deux estampilles pour une même clé (feuille native à ?v=1, le reste à ?v=2) : stamp-drift refuse');
  w('app/src/native-shell.css', rd(dir, 'app/src/native-shell.css').replace('x.woff2?v=1', 'x.woff2?v=2'));

  /* une url() qui sort de l'arbre servi ne passe pas pour une clé */
  w('assets/fonts/legacy-faces.css', rd(dir, 'assets/fonts/legacy-faces.css') + '@font-face{src:url("../../../escape.woff2?v=1")}\n');
  const r3 = run(dir, ['--sync']);
  ok(r3.status !== 0 && /sort de l'arbre servi/.test(r3.stdout + r3.stderr), 'fontes · une url() qui sort du dossier servi fait échouer le scan, avec le fichier nommé');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/* Relative cyclic module imports use one stamp per file. */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-stamp-modules-'));
  try {
    fixture(dir);
    fs.mkdirSync(path.join(dir, 'assets/pos-maison'));
    fs.writeFileSync(path.join(dir, 'assets/pos-maison.js'), "import { feature } from './pos-maison/sales.js?v=1';\nexport const core = () => feature;\n");
    fs.writeFileSync(path.join(dir, 'assets/pos-maison/sales.js'), "import { core } from '../pos-maison.js?v=1';\nexport const feature = () => core;\n");
    fs.appendFileSync(path.join(dir, 'kiwi-sw.js'), "const modules = ['/assets/pos-maison.js?v=1','/assets/pos-maison/sales.js?v=1'];\n");
    ok(run(dir, ['--sync']).status === 0, 'modules: seal initial graph');
    fs.appendFileSync(path.join(dir, 'assets/pos-maison/sales.js'), '// changed\n');
    ok(run(dir, ['assets/pos-maison/sales.js']).status === 0, 'modules: bump feature and cascade through cycle');
    ok(rd(dir, 'assets/pos-maison.js').includes("./pos-maison/sales.js?v=2"), 'modules: core import follows feature stamp');
    ok(rd(dir, 'assets/pos-maison/sales.js').includes("../pos-maison.js?v=2"), 'modules: cyclic import follows core stamp');
    const check = spawnSync(process.execPath, [path.join(dir, 'tools/stamp-drift-test.js')], { env: env(dir), encoding: 'utf8' });
    ok(check.status === 0, 'modules: graph and precache stamps stay sealed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed · ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
