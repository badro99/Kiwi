#!/usr/bin/env node
/* Kiwi · bundle-manifest-test — une fonte ne peut pas quitter le bundle pendant
 * qu'une règle la nomme encore.
 *
 * docs/specs/kiwi-design-2027.md §21.3 : la liste des fichiers de app/src/ que le
 * build copie à la racine de app/www/ vit dans UN fichier de données,
 * tools/app-bundle-manifest.json, lu par tools/build-app-www.mjs ET par
 * tools/stamps.js. Aucun des deux n'en garde une copie. Ce test l'affirme sur un
 * www/ construit :
 *
 *   1 · le manifeste est complet : chaque fichier de app/src/ est dans
 *       `nativeRuntime` ou `shell`, et chaque entrée existe ; un cinquième fichier
 *       de runtime ne peut donc pas être ajouté à un seul des deux outils ;
 *   2 · ce que le build copie à la racine depuis app/src/ est exactement ces deux
 *       listes (ni plus, ni moins) ;
 *   3 · chaque url() de chaque feuille copiée à la racine résout vers un fichier
 *       présent dans www/ : « un 404 dans l'app est silencieux », et une fonte qui
 *       part pendant qu'une règle la nomme retombe sur la face système, ce qui se
 *       voit ;
 *   4 · assets/fonts/ (bundledFolders) est dans le bundle, fichier pour fichier ;
 *   5 · NATIVE_FONTS ne garde aucune face qu'assets/fonts/ livre ; JetBrains Mono
 *       garde son entrée ET sa règle jusqu'à l'étape 7 ; une face ne quitte la
 *       liste que dans le commit qui repointe chaque règle qui la nomme, dans les
 *       DEUX feuilles natives ;
 *   6 · l'outil d'estampilles voit ces url() : un woff2 d'assets/fonts/ nommé par
 *       les deux feuilles natives est UNE clé, avec UNE estampille ;
 *
 * et il a ses contrôles négatifs : une fonte retirée du bundle, un fichier de
 * runtime hors manifeste, une url() qui sort de l'arbre servi.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, PAGES } from './build-app-www.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0; const failures = [];
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures.push(msg); console.log('  ✗ ' + msg); } };
console.log('bundle-manifest-test');

const MANIFEST_PATH = path.join(ROOT, 'tools/app-bundle-manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const srcDir = path.join(ROOT, manifest.servedAtRoot);
const buildSrc = fs.readFileSync(path.join(ROOT, 'tools/build-app-www.mjs'), 'utf8');
const stampsSrc = fs.readFileSync(path.join(ROOT, 'tools/stamps.js'), 'utf8');

/* ── les vérifications, en fonctions : les contrôles négatifs les rejouent ── */
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));

/* → ['native-runtime.css : url("x") → x absent', …] pour chaque feuille CSS de la racine de www. */
function brokenCssUrls(www) {
  const out = [];
  for (const f of fs.readdirSync(www).filter((n) => n.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(www, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/url\(\s*(["']?)([^"')\s]+)\1\s*\)/g)) {
      const ref = m[2];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;        // data:, http:, fragment
      const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
      const target = path.posix.normalize(clean.replace(/^\//, ''));
      if (target.startsWith('../') || !fs.existsSync(path.join(www, target))) out.push(`${f} : url("${ref}") → ${target} absent du bundle`);
    }
  }
  return out;
}

/* Les fichiers à la racine de www qui ne sont ni une page, ni l'icône de marque, ni le manifeste de build. */
function strayRootFiles(www, listed) {
  const known = new Set([...PAGES, 'native-brand.png', '.kiwi-bundle.json', ...listed]);
  return fs.readdirSync(www, { withFileTypes: true }).filter((e) => e.isFile() && !known.has(e.name)).map((e) => e.name);
}

/* ═══ 1 · le manifeste ═══════════════════════════════════════════════════ */
const listed = [...manifest.nativeRuntime, ...manifest.shell];
check(Array.isArray(manifest.nativeRuntime) && Array.isArray(manifest.shell) && typeof manifest.servedAtRoot === 'string' && Array.isArray(manifest.bundledFolders),
  'app-bundle-manifest.json : nativeRuntime, shell, servedAtRoot, bundledFolders');
check(new Set(listed).size === listed.length, 'aucun fichier n\'est dans les deux listes');
check(listed.every((f) => fs.existsSync(path.join(srcDir, f))), `chaque entrée existe dans ${manifest.servedAtRoot}${listed.filter((f) => !fs.existsSync(path.join(srcDir, f))).length ? ' (manque : ' + listed.filter((f) => !fs.existsSync(path.join(srcDir, f))).join(', ') + ')' : ''}`);
const inSrc = fs.readdirSync(srcDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
const orphans = inSrc.filter((f) => !listed.includes(f));
check(!orphans.length, `chaque fichier de ${manifest.servedAtRoot} est dans nativeRuntime ou shell : un fichier hors manifeste ne partirait dans aucun bundle${orphans.length ? ' (orphelin : ' + orphans.join(', ') + ')' : ''}`);
check(manifest.bundledFolders.includes('assets/fonts/'), 'assets/fonts/ est dans bundledFolders');

/* ═══ 2 · aucun outil n'en garde une copie ═══════════════════════════════ */
check(/app-bundle-manifest\.json/.test(buildSrc) && /BUNDLE_MANIFEST\.nativeRuntime/.test(buildSrc) && /BUNDLE_MANIFEST\.shell/.test(buildSrc),
  'build-app-www.mjs lit NATIVE_RUNTIME et SHELL dans app-bundle-manifest.json');
check(/require\(['"]\.\/app-bundle-manifest\.json['"]\)/.test(stampsSrc), 'stamps.js lit le même fichier (JSON, parce qu\'il est synchrone et CommonJS : il ne peut pas importer un module ES)');
const literal = /\[\s*['"](?:native-runtime\.js|native-runtime\.css|native-privacy\.js|native-locale\.js|index\.html|native-shell\.js|native-shell\.css)['"]/;
check(!literal.test(buildSrc.replace(/\/\*[\s\S]*?\*\//g, '')) && !literal.test(stampsSrc.replace(/\/\*[\s\S]*?\*\//g, '')),
  'ni build-app-www.mjs ni stamps.js ne garde une liste littérale de ces fichiers');

/* ═══ 3 · un www/ construit ══════════════════════════════════════════════ */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bundle-manifest-'));
let built = null;
try { built = build({ out: path.join(tmp, 'www'), quiet: true }); } catch (e) { check(false, `le build a levé : ${e.message}`); }
if (built) {
  const www = built.out;
  check(built.errors.length === 0, `le build ne signale aucune erreur${built.errors.length ? ' — ' + built.errors.join(' ; ') : ''}`);
  const missingAtRoot = listed.filter((f) => !fs.existsSync(path.join(www, f)));
  check(!missingAtRoot.length, `chaque fichier du manifeste est copié à la racine de www/${missingAtRoot.length ? ' (absent : ' + missingAtRoot.join(', ') + ')' : ''}`);
  const stray = strayRootFiles(www, listed);
  check(!stray.length, `tout fichier copié à la racine depuis ${manifest.servedAtRoot} est dans le manifeste : une page, l'icône de marque ou une entrée de liste, rien d'autre${stray.length ? ' (en trop : ' + stray.join(', ') + ')' : ''}`);
  const fromSrc = listed.filter((f) => fs.existsSync(path.join(www, f)) && fs.readFileSync(path.join(www, f)).equals(fs.readFileSync(path.join(srcDir, f))) );
  check(fromSrc.length >= manifest.nativeRuntime.length + manifest.shell.length - 1, 'les fichiers de runtime sont copiés tels quels (seule index.html est réécrite par transformPage)');

  const rootCss = fs.readdirSync(www).filter((n) => n.endsWith('.css'));
  check(rootCss.includes('native-runtime.css') && rootCss.includes('native-shell.css'), `les deux feuilles natives sont à la racine (${rootCss.join(', ')})`);
  const broken = brokenCssUrls(www);
  check(!broken.length, `chaque url() de chaque feuille de la racine résout vers un fichier du bundle (${rootCss.length} feuilles)${broken.length ? ' — ' + broken.join(' ; ') : ''}`);

  /* 4 · les dossiers embarqués */
  for (const folder of manifest.bundledFolders) {
    const srcFiles = walk(path.join(ROOT, folder)).filter((f) => !/ \d+\.[^/]+$/.test(f));
    const absent = srcFiles.filter((f) => !fs.existsSync(path.join(www, folder, f)));
    check(srcFiles.length > 0 && !absent.length, `${folder} est dans le bundle, ${srcFiles.length} fichiers${absent.length ? ' (absent : ' + absent.join(', ') + ')' : ''}`);
  }

  /* 5 · NATIVE_FONTS */
  const nf = buildSrc.match(/const NATIVE_FONTS = \{([\s\S]*?)\n\};/);
  const nfKeys = nf ? [...nf[1].matchAll(/^\s*'(native-fonts\/[^']+)'\s*:/gm)].map((m) => m[1]) : [];
  check(!!nf, 'NATIVE_FONTS est lisible dans build-app-www.mjs');
  const shipped = walk(path.join(ROOT, 'assets/fonts')).filter((f) => f.endsWith('.woff2'));
  const faceKey = (n) => (/inter-tight/.test(n) ? 'inter-tight' : /plex/.test(n) ? 'plex' : n);
  const dup = nfKeys.filter((k) => shipped.some((s) => faceKey(s) === faceKey(k.split('/').pop())));
  check(!dup.length, `NATIVE_FONTS ne garde aucune face qu'assets/fonts/ livre${dup.length ? ' (en double : ' + dup.join(', ') + ')' : ''}`);
  check(nfKeys.length === 1 && nfKeys[0] === 'native-fonts/jetbrains-mono-latin.woff2', `JetBrains Mono garde son entrée jusqu'à l'étape 7 (reste : ${nfKeys.join(', ') || 'rien'})`);
  const named = new Set();
  for (const f of rootCss) for (const m of fs.readFileSync(path.join(www, f), 'utf8').matchAll(/url\(\s*["']?(native-fonts\/[^"')?\s]+)/g)) named.add(m[1]);
  check([...named].every((n) => nfKeys.includes(n)), `chaque url("native-fonts/…") d'une feuille est servie par une entrée de NATIVE_FONTS (nommées : ${[...named].join(', ') || 'aucune'})`);
  check(nfKeys.every((k) => named.has(k)), 'chaque entrée restante de NATIVE_FONTS est nommée par une règle : une fonte copiée que personne ne nomme est un octet mort');
  for (const f of ['native-runtime.css', 'native-shell.css']) {
    const css = fs.readFileSync(path.join(www, f), 'utf8');
    const fams = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*["']([^"']+)["'][^}]*src:\s*url\(\s*["']?([^"')]+)/g)].map((m) => `${m[1]}=${m[2].split('?')[0]}`);
    const wrong = fams.filter((x) => /Inter Tight|IBM Plex Sans Arabic/.test(x) && !/=assets\/fonts\//.test(x));
    check(!wrong.length, `${f} : Inter Tight et IBM Plex Sans Arabic sont servies depuis assets/fonts/, mêmes noms de famille${wrong.length ? ' (encore : ' + wrong.join(', ') + ')' : ''}`);
    check(/font-family:\s*["']Inter Tight["']/.test(css) && (f === 'native-shell.css' ? /font-family:\s*["']IBM Plex Sans Arabic["']/.test(css) : true), `${f} : la famille s'appelle toujours « Inter Tight » / « IBM Plex Sans Arabic » (les sites d'usage ne bougent pas)`);
  }

  /* ═══ 6 · l'outil d'estampilles ═══════════════════════════════════════ */
  const S = require('./stamps.js');
  const refs = S.cssRefs();
  const keyOf = (k) => refs.filter((r) => r.key === k).map((r) => r.file).sort().join(' + ');
  for (const face of ['inter-tight-latin', 'plex-arabic-400', 'plex-arabic-500', 'plex-arabic-600']) {
    const files = keyOf(`assets/fonts/${face}.woff2`);
    check(/app\/src\/native-runtime\.css/.test(files) && /app\/src\/native-shell\.css/.test(files), `${face}.woff2 : une clé pour les deux feuilles natives (${files})`);
  }
  check(refs.filter((r) => r.file === 'assets/fonts/legacy-faces.css').every((r) => r.key.startsWith('assets/fonts/')), 'legacy-faces.css : ses url() relatives se résolvent contre assets/fonts/, là où elle est servie');
  const scanned = S.scan();
  for (const face of ['plex-arabic-400', 'plex-arabic-500', 'plex-arabic-600']) {
    const e = scanned.get(`assets/fonts/${face}.woff2`);
    check(!!e && e.stamps.size === 1, `${face}.woff2 porte une seule estampille sur tous ses sites (${e ? [...e.stamps].join() : 'aucune'})`);
  }

  /* ═══ 7 · contrôles négatifs ══════════════════════════════════════════ */
  {
    const neg = path.join(tmp, 'neg');
    fs.cpSync(www, neg, { recursive: true });
    fs.rmSync(path.join(neg, 'assets/fonts/plex-arabic-500.woff2'));
    const b = brokenCssUrls(neg);
    check(b.length === 2 && b.every((x) => /plex-arabic-500\.woff2/.test(x)), `négatif · une fonte retirée du bundle pendant que deux règles la nomment est refusée (${b.length} url() cassées)`);
    fs.writeFileSync(path.join(neg, 'native-extra.js'), '// un cinquième fichier de runtime\n');
    check(strayRootFiles(neg, listed).join() === 'native-extra.js', 'négatif · un cinquième fichier de runtime, copié sans entrée de manifeste, est vu');
    fs.appendFileSync(path.join(neg, 'native-shell.css'), '\n.x{background:url("../assets/fonts/inter-tight-latin.woff2")}\n');
    check(brokenCssUrls(neg).some((x) => /\.\.\/assets/.test(x)), 'négatif · « ../assets/fonts/… » (lu depuis app/src/ au lieu de la racine du bundle) sort du bundle et est refusé');
    fs.appendFileSync(path.join(neg, 'native-shell.css'), '\n.y{background:url(data:image/svg+xml;base64,AAAA)}.z{background:url("https://example.com/x.png")}.w{background:url(#frag)}\n');
    check(brokenCssUrls(neg).filter((x) => /data:|example\.com|frag/.test(x)).length === 0, 'négatif · data:, http: et #fragment ne sont pas des fichiers du bundle et ne sont pas comptés');
  }
}
fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

if (failures.length) { console.log(`\n✗ ${failures.length} échec(s), ${passed} contrôles verts`); process.exit(1); }
console.log(`\n✓ bundle-manifest-test : ${passed} contrôles verts`);
