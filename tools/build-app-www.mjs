#!/usr/bin/env node
/* tools/build-app-www.mjs — assemble le bundle web embarqué dans l'app native.
 *
 * docs/roadmaps/KIWI_APP_PLAN.md §3 : l'app Capacitor (app/) n'a PAS de deuxième
 * base de code. Elle embarque les surfaces du dépôt telles quelles — la caisse,
 * KiwiÉquipe, la cuisine, le tableau de bord — plus `assets/`, et une page
 * d'accueil native (app/src/). Ce script les copie dans app/www (gitignoré) en
 * faisant exactement quatre choses aux pages :
 *
 *   1. injecter `<script src="assets/api-base.js">` EN TÊTE de <head>, avant tout
 *      autre script — c'est lui qui préfixe /api/ et /auth/ par kiwi-os.com quand
 *      la page tourne sous capacitor://localhost (aucun site d'appel n'est édité) ;
 *   2. retirer `<link rel="manifest">` — le bundle n'est pas une PWA, il est
 *      versionné par la release ; le service worker, lui, est coupé par les gardes
 *      isNativePlatform() des bootstraps (assets/*-pwa.js, employee-live.js) ;
 *   3. poser `<meta name="kiwi-bundle">` (empreinte du bundle) sur la page d'accueil ;
 *   4. ÉCHOUER si un script, une feuille de style, une image ou une police
 *      référencée par une page manque dans le bundle : un 404 dans l'app est
 *      silencieux, il ne doit pas pouvoir sortir d'ici.
 *
 * Déterministe : mêmes entrées → même bundle, même empreinte (.kiwi-bundle.json,
 * trié, sans horodatage). tools/app-bundle-test.mjs s'en sert.
 *
 *   node tools/build-app-www.mjs                 → app/www
 *   node tools/build-app-www.mjs --out <dir>     → ailleurs (tests)
 *   node tools/build-app-www.mjs --api-base https://kiwi-maroc.pages.dev
 *        → force window.KIWI_API_BASE (tester le bundle dans un navigateur de
 *          bureau contre un déploiement ; sans le drapeau, api-base.js ne
 *          préfixe qu'en natif, vers https://kiwi-os.com)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DEFAULT_OUT = path.join(ROOT, 'app', 'www');

/* Les quatre surfaces embarquées. dashboard.html n'est pas un objectif de la
 * v1.0 (plan §1.1) mais la porte existe ; elle coûte 0 octet de code natif. */
export const PAGES = ['kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html', 'dashboard.html'];
/* La page d'accueil native et ses deux fichiers (app/src/ → racine du bundle). */
export const SHELL = ['index.html', 'native-shell.js', 'native-shell.css'];
export const API_BASE_TAG = '<script src="assets/api-base.js"></script>';
export const NATIVE_RUNTIME_TAGS = '<link rel="stylesheet" href="native-runtime.css" />\n<script src="native-runtime.js" defer></script>';
const NATIVE_RUNTIME = ['native-runtime.js', 'native-runtime.css'];
const NATIVE_FONTS = {
  'native-fonts/inter-tight-latin.woff2': 'node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2',
  'native-fonts/ibm-plex-sans-arabic-400.woff2': 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  'native-fonts/ibm-plex-sans-arabic-500.woff2': 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
  'native-fonts/ibm-plex-sans-arabic-600.woff2': 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
};

/* Ce qui ne part pas dans le bundle : le site vitrine (assets/landing/, sauf
 * l'icône d'app et les icônes de navigation qu'une surface référence), les
 * médias marketing (assets/media/), et les copies de conflit iCloud « foo 2.js »
 * qui n'ont rien à faire nulle part. */
function excluded(rel) {
  if (/(^|\/)[^/]* \d+\.[^/]+$/.test(rel)) return true;           // "fichier 2.js"
  if (rel.startsWith('assets/media/')) return true;
  if (rel.startsWith('assets/landing/')) {
    return !(rel === 'assets/landing/kiwi-mark-app-icon.png' || rel.startsWith('assets/landing/icons/'));
  }
  if (/\.(md|map)$/.test(rel) && rel !== 'assets/icons/material/LICENSE') return true;
  return false;
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function walk(dir, base, acc) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.posix.join(base, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, rel, acc);
    else if (st.isFile()) acc.push(rel);
  }
  return acc;
}

function safeOutDir(out) {
  const abs = path.resolve(out);
  if (abs === ROOT || ROOT.startsWith(abs + path.sep)) throw new Error('refus : --out pointe sur la racine du dépôt');
  if (fs.existsSync(path.join(abs, '.git'))) throw new Error('refus : --out contient un dépôt git');
  return abs;
}

/* ── transformation d'une page ──────────────────────────────────────────── */
const HEAD_RE = /<head(\s[^>]*)?>/i;
const MANIFEST_RE = /[ \t]*<link\b[^>]*\brel=["']manifest["'][^>]*>[ \t]*\r?\n?/gi;
const NETWORK_FONT_RE = /[ \t]*<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>[ \t]*\r?\n?/gi;
const REF_RE = /<(script|link|img|source|video|audio|track|use)\b[^>]*?\s(?:src|href|poster)=["']([^"']+)["']/gi;

function isLocalRef(u) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
}

export function transformPage(html, opts) {
  const o = opts || {};
  if (!HEAD_RE.test(html)) throw new Error('page sans <head>');
  let out = html.replace(MANIFEST_RE, '').replace(NETWORK_FONT_RE, '');
  const inject = []
    .concat(o.apiBase ? [`<script>window.KIWI_API_BASE=${JSON.stringify(String(o.apiBase))};</script>`] : [])
    .concat(o.bundle ? [`<meta name="kiwi-bundle" content="${o.bundle}" />`] : [])
    .concat([API_BASE_TAG]);
  out = out.replace(HEAD_RE, (m) => `${m}\n${inject.join('\n')}`);
  out = out.replace(/<\/head>/i, `${NATIVE_RUNTIME_TAGS}\n</head>`);
  return out;
}

/* Références locales d'une page (scripts, styles, images, polices, icônes).
 * Les <a href> ne sont PAS des assets : une page peut pointer vers une autre
 * page non embarquée sans casser le bundle. */
export function localRefs(html) {
  const refs = new Set();
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(html))) {
    const u = m[2].trim();
    if (!isLocalRef(u) || u.includes('${')) continue;   // gabarit JS dans un <script> en ligne
    const clean = u.split(/[?#]/)[0];
    if (!clean) continue;
    refs.add(clean.replace(/^\.?\//, ''));
  }
  return [...refs].sort();
}

/* ── build ──────────────────────────────────────────────────────────────── */
export function build(options) {
  const opts = options || {};
  const out = safeOutDir(opts.out || DEFAULT_OUT);
  const log = opts.quiet ? () => {} : (s) => process.stdout.write(s + '\n');
  const errors = [];

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  // 1. assets/ (filtré)
  const assetsDir = path.join(ROOT, 'assets');
  const assetFiles = walk(assetsDir, 'assets', []).filter((rel) => !excluded(rel));
  for (const rel of assetFiles) {
    const dst = path.join(out, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  if (!assetFiles.includes('assets/api-base.js')) errors.push('assets/api-base.js manque — le bundle ne peut pas joindre l\'API');

  // Runtime et fontes strictement natifs : aucune requête Google Fonts dans l'app.
  const shellDir = path.join(ROOT, 'app', 'src');
  for (const name of NATIVE_RUNTIME) {
    const src = path.join(shellDir, name);
    if (!fs.existsSync(src)) { errors.push(`app/src/${name} introuvable`); continue; }
    fs.copyFileSync(src, path.join(out, name));
  }
  for (const [target, source] of Object.entries(NATIVE_FONTS)) {
    const src = path.join(ROOT, 'app', source);
    const dst = path.join(out, target);
    if (!fs.existsSync(src)) { errors.push(`${source} introuvable ; lance npm install dans app/`); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  // 2. les pages
  const written = [];
  for (const page of PAGES) {
    const src = path.join(ROOT, page);
    if (!fs.existsSync(src)) { errors.push(`${page} introuvable à la racine du dépôt`); continue; }
    let html = fs.readFileSync(src, 'utf8');
    try { html = transformPage(html, { apiBase: opts.apiBase }); }
    catch (e) { errors.push(`${page} : ${e.message}`); continue; }
    fs.writeFileSync(path.join(out, page), html);
    written.push(page);
  }

  // 3. références manquantes — vérifiées contre le bundle, pas contre le dépôt
  for (const page of written) {
    const html = fs.readFileSync(path.join(out, page), 'utf8');
    for (const ref of localRefs(html)) {
      if (ref.endsWith('.html')) continue;                    // navigation, pas asset
      if (/\.webmanifest$/.test(ref)) continue;               // retiré exprès
      if (!fs.existsSync(path.join(out, ref))) errors.push(`${page} référence ${ref} — absent du bundle`);
    }
  }

  // 4. empreinte de tout sauf la coquille (la coquille la porte en <meta>)
  const core = walk(out, '', []).map((rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(out, rel))) }));
  const coreHash = sha256(core.map((f) => `${f.path}\t${f.sha256}`).join('\n'));

  // 5. la coquille native (app/src/) à la racine du bundle
  for (const name of SHELL) {
    const src = path.join(shellDir, name);
    if (!fs.existsSync(src)) { errors.push(`app/src/${name} introuvable`); continue; }
    let body = fs.readFileSync(src);
    if (name.endsWith('.html')) {
      try { body = Buffer.from(transformPage(body.toString('utf8'), { apiBase: opts.apiBase, bundle: coreHash }), 'utf8'); }
      catch (e) { errors.push(`app/src/${name} : ${e.message}`); continue; }
    }
    fs.writeFileSync(path.join(out, name), body);
  }
  if (fs.existsSync(path.join(out, 'index.html'))) {
    for (const ref of localRefs(fs.readFileSync(path.join(out, 'index.html'), 'utf8'))) {
      if (ref.endsWith('.html')) continue;
      if (!fs.existsSync(path.join(out, ref))) errors.push(`index.html référence ${ref} — absent du bundle`);
    }
  }

  // 6. manifeste trié, sans horodatage
  const files = walk(out, '', []).filter((rel) => rel !== '.kiwi-bundle.json')
    .map((rel) => { const buf = fs.readFileSync(path.join(out, rel)); return { path: rel, bytes: buf.length, sha256: sha256(buf) }; });
  const manifest = {
    core: coreHash,
    bundle: sha256(files.map((f) => `${f.path}\t${f.sha256}`).join('\n')),
    pages: written,
    apiBase: opts.apiBase || null,
    count: files.length,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    files,
  };
  fs.writeFileSync(path.join(out, '.kiwi-bundle.json'), JSON.stringify(manifest, null, 1) + '\n');

  log(`bundle → ${path.relative(ROOT, out) || out}`);
  log(`  ${written.length} pages · ${assetFiles.length} fichiers assets · ${(manifest.bytes / 1048576).toFixed(1)} Mo · empreinte ${manifest.bundle.slice(0, 12)}`);
  if (opts.apiBase) log(`  API forcée sur ${opts.apiBase}`);
  for (const e of errors) log(`  ✗ ${e}`);
  return { out, manifest, errors };
}

/* ── CLI ────────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : undefined; };
  const res = build({ out: opt('--out'), apiBase: opt('--api-base'), quiet: argv.includes('--quiet') });
  if (res.errors.length) { process.stdout.write(`\n${res.errors.length} erreur(s) — bundle refusé.\n`); process.exit(1); }
}
