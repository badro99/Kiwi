#!/usr/bin/env node
/* Kiwi · plex-census.mjs — comment chaque page obtient « IBM Plex Sans Arabic ».
 *
 * docs/specs/kiwi-design-2027.md §6.1 (revisions 10 à 14) : le recensement n'est
 * pas compté à la main (deux révisions avaient publié 18 puis 48 pages, toutes
 * deux trop courtes). C'est ce script, et le test qui le rejoue :
 * tools/font-face-census-test.mjs.
 *
 * Il parcourt chaque *.html que `git ls-files` liste (hors node_modules/ et hors
 * les copies de conflit iCloud « foo 2.html », CLAUDE.md §1), lit le balisage de
 * la page et chaque feuille locale qu'elle lie (un « / » initial se résout contre
 * la racine du dépôt, un chemin relatif contre le dossier de la page), suit les
 * @import locaux sur trois niveaux, puis classe la page selon COMMENT elle
 * obtient la famille :
 *
 *   (1) une URL Google Fonts nommant IBM+Plex+Sans+Arabic dans son propre balisage ;
 *   (2) une telle URL dans un @import d'une feuille qu'elle lie (le chemin de la
 *       feuille est rapporté) ;
 *   (3) un @font-face de la famille dans une feuille Kiwi (ou un <style> de la page) ;
 *   (4) rien de cela, alors que la page ou une feuille qu'elle charge nomme la famille.
 *
 * assets/fonts/legacy-faces.css est le REMÈDE, pas une route : il est ignoré par
 * la classification (sinon les pages de classe 4 deviendraient de classe 3 le
 * jour où on le lie) et rapporté à part, avec sa position (§6.1, « où va le lien »).
 *
 * Il rapporte aussi, par page, les graisses de Plex demandées (la liste wght@ de
 * l'URL Google, ou le font-weight de chaque @font-face Kiwi) et ce que devient
 * chacune quand la source Google disparaît (200 et 300 → 400, 700 → 600).
 *
 * Node, rien d'autre. Sortie non nulle sur une page qu'il ne sait pas classer
 * (une feuille liée localement et introuvable, par exemple).
 *
 *   node tools/plex-census.mjs            une ligne par page, un total par classe
 *   node tools/plex-census.mjs --json     le même recensement en JSON
 *   node tools/plex-census.mjs --strict   échoue aussi si le lien legacy manque ou est mal placé
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.KIWI_CENSUS_ROOT ? path.resolve(process.env.KIWI_CENSUS_ROOT) : path.resolve(HERE, '..');
export const LEGACY = 'assets/fonts/legacy-faces.css';
export const FAMILY = 'IBM Plex Sans Arabic';
/* Les graisses que legacy-faces.css déclare, et ce que devient chaque graisse
   demandée mais non déclarée quand la source Google d'une page disparaît
   (appariement CSS des graisses : sous 400 on cherche plus léger puis plus lourd,
   au-dessus de 500 plus lourd puis plus léger). §6.1, revision 13, M5. */
export const DECLARED_WEIGHTS = [400, 500, 600];
export const MAPPED_WEIGHTS = { 200: 400, 300: 400, 700: 600 };
const MAX_IMPORT_DEPTH = 3;

const STALE_COPY = / \d+\.[A-Za-z0-9]+$/;
const NAMES_FAMILY = /IBM(?:\+| )Plex(?:\+| )Sans(?:\+| )Arabic/i;
const GOOGLE_HOST = /^(?:https?:)?\/\/fonts\.googleapis\.com\//i;

const decode = (s) => s.replace(/&amp;/g, '&');
const posix = (p) => p.split(path.sep).join('/');

function listPages() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })
      .split('\0').filter(Boolean);
  } catch (_) {
    files = [];
    (function walk(rel) {
      for (const ent of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        if (ent.isDirectory()) { if (!['node_modules', '.git', 'graphify-out', '.claude', '.kiwi'].includes(ent.name)) walk(rel ? `${rel}/${ent.name}` : ent.name); }
        else if (ent.name.endsWith('.html')) files.push(rel ? `${rel}/${ent.name}` : ent.name);
      }
    })('');
  }
  return files
    .filter((f) => !f.split('/').includes('node_modules') && !STALE_COPY.test(path.basename(f)) && fs.existsSync(path.join(ROOT, f)))
    .sort();
}

/* Les graisses que demande une URL Google Fonts pour IBM Plex Sans Arabic.
   `family=IBM+Plex+Sans+Arabic:wght@400;500;600` ou `:ital,wght@0,400;1,400`. */
export function googleWeights(url) {
  const out = new Set();
  const u = decode(url);
  for (const m of u.matchAll(/family=([^&]+)/g)) {
    const fam = decodeURIComponent(m[1].replace(/\+/g, ' '));
    if (!fam.startsWith(FAMILY)) continue;
    const spec = fam.slice(FAMILY.length);
    const axes = (spec.match(/^:([^@]+)@/) || [])[1];
    const tuples = spec.replace(/^[^@]*@?/, '');
    if (!axes) { out.add(400); continue; }
    const cols = axes.split(',');
    const wi = cols.indexOf('wght');
    for (const t of tuples.split(';')) {
      const vals = t.split(',');
      const w = wi >= 0 ? vals[wi] : null;
      if (w) { const [a, b] = w.split('..').map(Number); out.add(a); if (b) out.add(b); }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/* Les url() / chaînes d'un @import. */
function importsOf(css) {
  const out = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')/gi;
  for (const m of bare.matchAll(re)) out.push(decode(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]));
  return out;
}

/* Les @font-face de la famille dans un texte CSS : [{weights:[…]}]. */
function plexFaces(css) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1];
    const fam = (body.match(/font-family\s*:\s*(["']?)([^;"']+)\1/i) || [])[2];
    if (!fam || fam.trim().toLowerCase() !== FAMILY.toLowerCase()) continue;
    const w = (body.match(/font-weight\s*:\s*([^;]+)/i) || [])[1];
    const ws = (w || '400').trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    out.push({ weights: ws.length === 2 ? [ws[0]] : ws.length ? ws : [400], range: ws.length === 2 ? ws : null });
  }
  return out;
}

function resolveLocal(fromPage, ref) {
  const clean = decode(ref).split(/[?#]/)[0];
  if (!clean) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  const abs = clean.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(fromPage), clean);
  return path.posix.normalize(abs);
}

/* Les balises <link rel=stylesheet> et <style> d'une page, dans l'ordre du document. */
function headItems(source) {
  /* Les corps de <script> et les commentaires sont blanchis à longueur égale :
     une page peut contenir « <style> » dans une chaîne JS, et le motif paresseux
     avalerait alors tout jusqu'au </style> suivant, liens compris. */
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const html = source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, b, c) => a + blank(b) + c);
  const items = [];
  for (const m of html.matchAll(/<link\b[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m[0][1].toLowerCase() === 'l') {
      const rel = (m[0].match(/\brel=(["'])(.*?)\1/i) || [])[2] || '';
      const href = (m[0].match(/\bhref=(["'])(.*?)\1/i) || [])[2];
      if (!href) continue;
      items.push({ kind: 'link', rel: rel.toLowerCase(), href: decode(href), at: m.index, raw: m[0] });
    } else {
      items.push({ kind: 'style', css: m[1] || '', at: m.index, raw: m[0] });
    }
  }
  return items;
}

/* Une feuille et ses @import locaux (≤ 3 niveaux). Renvoie
   {sheets:[{path, css}], missing:[path]} ; le premier est la feuille elle-même. */
function loadSheet(file, depth, seen, acc) {
  if (seen.has(file)) return;
  seen.add(file);
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { acc.missing.push(file); return; }
  const css = fs.readFileSync(abs, 'utf8');
  acc.sheets.push({ path: file, css });
  if (depth >= MAX_IMPORT_DEPTH) return;
  for (const imp of importsOf(css)) {
    const local = resolveLocal(file, imp);
    if (local) loadSheet(local, depth + 1, seen, acc);
  }
}

/* Les balises qui déclarent des polices pour une page, dans l'ordre du document : les
   <link rel=stylesheet> (Google compris) et les <style>. Le test de navigateur en
   fait une page de sonde sans le reste du contenu ni ses scripts. */
export function stylesheetTags(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  return headItems(html).filter((it) => it.kind === 'style' || /\bstylesheet\b/.test(it.rel)).map((it) => it.raw);
}

export function classifyPage(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const items = headItems(html);
  const routes = [];
  const weights = new Set();
  const sheets = [];      // {path, at}  feuilles locales liées, dans l'ordre
  const missing = [];
  let legacy = null;      // {at}
  /* « Nomme la famille » : une règle de style de la page (un <style>, un attribut
     style="") ou une feuille liée et ses @import. Ni la prose d'une page (la
     maquette de la direction 2027 nomme la famille dans un paragraphe), ni le JS
     d'une page, ni un commentaire ne sont des règles de style. */
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  let named = [...markup.matchAll(/\bstyle=(["'])(.*?)\1/gis)].some((m) => NAMES_FAMILY.test(m[2]));
  let namedInMarkup = false;

  /* 1 · le balisage lui-même : liens Google, <style> en ligne. */
  for (const it of items) {
    if (it.kind === 'link') {
      if (GOOGLE_HOST.test(it.href) && NAMES_FAMILY.test(it.href)) {
        routes.push({ cls: 1, via: null, at: it.at });
        googleWeights(it.href).forEach((w) => weights.add(w));
      }
    } else {
      for (const imp of importsOf(it.css)) {
        if (GOOGLE_HOST.test(imp) && NAMES_FAMILY.test(imp)) { routes.push({ cls: 1, via: null, at: it.at }); googleWeights(imp).forEach((w) => weights.add(w)); }
      }
      if (plexFaces(it.css).length) {
        routes.push({ cls: 3, via: null, at: it.at });
        plexFaces(it.css).forEach((f) => f.weights.forEach((w) => weights.add(w)));
      }
      if (NAMES_FAMILY.test(it.css)) namedInMarkup = true;
    }
  }

  /* 2 · les feuilles locales liées. */
  for (const it of items) {
    if (it.kind !== 'link' || !/\bstylesheet\b/.test(it.rel)) continue;
    const local = resolveLocal(page, it.href);
    if (!local) continue;
    if (local === LEGACY) { legacy = { at: it.at }; continue; }
    const acc = { sheets: [], missing: [] };
    loadSheet(local, 0, new Set([LEGACY]), acc);
    if (acc.missing.length) missing.push(...acc.missing);
    sheets.push({ path: local, at: it.at });
    acc.sheets.forEach((s, i) => {
      if (NAMES_FAMILY.test(s.css)) named = true;
      const isTop = s.path === local;
      for (const imp of importsOf(s.css)) {
        if (GOOGLE_HOST.test(imp) && NAMES_FAMILY.test(imp)) {
          routes.push({ cls: 2, via: s.path, link: local, at: it.at });
          googleWeights(imp).forEach((w) => weights.add(w));
        }
      }
      const faces = plexFaces(s.css);
      if (faces.length) {
        routes.push({ cls: 3, via: s.path, link: local, at: it.at });
        faces.forEach((f) => f.weights.forEach((w) => weights.add(w)));
      }
      void isTop; void i;
    });
  }
  if (namedInMarkup) named = true;

  routes.sort((a, b) => a.cls - b.cls || a.at - b.at);
  let cls = routes.length ? routes[0].cls : (named ? 4 : 0);
  if (!routes.length && named) routes.push({ cls: 4, via: null, at: 0 });

  /* Le lien legacy est-il à sa place ? */
  let order = 'n/a';
  if (cls === 1 || cls === 2 || cls === 4) {
    if (!legacy) order = 'missing';
    else if (cls === 4) order = 'ok';
    else {
      const r = routes[0];
      if (cls === 1) order = legacy.at < r.at ? 'ok' : 'after-google';
      else if (/^assets\/articles\/article\.css$/.test(r.link)) order = legacy.at < r.at ? 'ok' : 'after-article';
      else order = legacy.at > r.at ? 'ok' : 'before-chunk';
    }
  }
  return {
    page, cls, via: routes[0] ? routes[0].via : null, link: routes[0] ? routes[0].link || null : null,
    routes: routes.map((r) => ({ cls: r.cls, via: r.via })),
    weights: [...weights].sort((a, b) => a - b),
    legacy: !!legacy, order, missing,
  };
}

/* Le contrôle des graisses : chaque graisse demandée est (a) déclarée par une
   feuille Kiwi (400, 500, 600 de legacy-faces.css), (b) encore servie par la
   source Google de la page, ou (c) dans la table de remplacement. Une graisse
   hors des trois est une page qu'on ne sait pas expliquer. */
export function weightProblems(p) {
  const out = [];
  for (const w of p.weights) {
    if (DECLARED_WEIGHTS.includes(w)) continue;
    if (p.cls === 1 || p.cls === 2) continue;           // encore servie par Google
    if (MAPPED_WEIGHTS[w]) continue;
    out.push(w);
  }
  return out;
}

export function census() {
  const pages = listPages().map((f) => {
    try { return classifyPage(f); }
    catch (e) { return { page: f, cls: -1, error: e.message, routes: [], weights: [], legacy: false, order: 'n/a', missing: [] }; }
  });
  const named = pages.filter((p) => p.cls !== 0);
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0 };
  named.forEach((p) => { if (totals[p.cls] !== undefined) totals[p.cls]++; });
  const unclassifiable = pages.filter((p) => p.cls === -1 || (p.cls !== 0 && p.missing.length));
  return { pages, named, totals, unclassifiable };
}

/* Les pages qui doivent porter legacy-faces.css : classes (1), (2) et (4). */
export const needsLegacy = (p) => p.cls === 1 || p.cls === 2 || p.cls === 4;

/* ── CLI ───────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const c = census();
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ totals: c.totals, pages: c.named }, null, 1) + '\n');
  } else {
    for (const p of c.named) {
      const via = p.via ? ` via ${p.via}` : '';
      const w = p.weights.length ? ` weights ${p.weights.join(',')}` : '';
      const leg = needsLegacy(p) ? ` legacy:${p.legacy ? p.order : 'no'}` : '';
      process.stdout.write(`(${p.cls}) ${p.page}${via}${w}${leg}\n`);
    }
    process.stdout.write(`\ntotal ${c.named.length} pages · class 1: ${c.totals[1]} · 2: ${c.totals[2]} · 3: ${c.totals[3]} · 4: ${c.totals[4]}\n`);
    for (const u of c.unclassifiable) process.stdout.write(`✗ cannot classify ${u.page}: ${u.error || 'missing ' + u.missing.join(', ')}\n`);
  }
  let bad = c.unclassifiable.length > 0;
  if (argv.includes('--strict')) {
    for (const p of c.named) {
      if (needsLegacy(p) && (!p.legacy || p.order !== 'ok')) { process.stdout.write(`✗ ${p.page}: legacy-faces.css ${p.legacy ? p.order : 'absent'}\n`); bad = true; }
      const wp = weightProblems(p);
      if (wp.length) { process.stdout.write(`✗ ${p.page}: weight(s) ${wp.join(',')} neither declared, served by Google, nor mapped\n`); bad = true; }
    }
  }
  process.exit(bad ? 1 : 0);
}
