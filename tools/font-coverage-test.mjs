#!/usr/bin/env node
/* Kiwi · font-coverage-test — chaque caractère que le produit peut écrire sort du
 * fichier de fonte prévu pour lui.
 *
 * docs/specs/kiwi-design-2027.md §6.3 (revision 15, M3). Un navigateur choisit une
 * face pour CHAQUE caractère, pas pour la chaîne : il prend la première famille de
 * la pile qui a une face dont le `unicode-range` contient le caractère ET dont le
 * fichier a le glyphe. Une face `local()` revendique, sans plage, tout Unicode.
 * C'est ainsi que la pile de la révision 13 mettait l'arabe en Arial, et qu'un
 * U+202F (dans la plage de la face de repli, absent d'Inter Tight et d'Arial)
 * tombait dans une fonte système dont l'approvisionnement n'est pas celui des
 * largeurs mesurées.
 *
 * Ce test ne devine rien : il lit
 *   · le `cmap` de chaque fichier `url()` committé (tools/font-cmap-dump.mjs) ;
 *   · pour une face `local()`, le `cmap` de la vraie fonte capturé par plateforme
 *     dans tools/fonts/local-faces.json. UNE PLATEFORME SANS CAPTURE COMPTE LA FACE
 *     COMME NE COUVRANT RIEN, jamais tout, et signale qu'elle ne sait pas.
 *
 * Il échoue, sur toute plateforme capturée :
 *   · loaded   : un caractère résout autre chose que son fichier prévu une fois les
 *                fontes chargées (l'arabe → Kiwi Arabic, tout le reste → Inter Tight) ;
 *   · swapping : un caractère qui résout Inter Tight résout, pendant que celui-ci
 *                charge, autre chose que la face de repli (sur une plateforme qui a
 *                Arial) : un caractère qu'Arial n'a pas serait posé dans la fonte
 *                système, donc un décalage de mise en page.
 *
 * Les piles sont découvertes, pas listées : toute pile `--k-font` / `font-family`
 * de assets/kit/ et de tokens-2027.css, et les piles de l'app native. Tant que le
 * kit n'est pas là (étape 1), le test rejoue le bloc de déclarations de §6.1 avec
 * les vrais fichiers d'assets/fonts/ : le jour où tokens-2027.css arrive, ce sont
 * ses règles qui sont lues, et le bloc de §6.1 reste le témoin des contrôles
 * négatifs.
 *
 * Le corpus : chaque valeur de strings/*.json en EN, FR et AR, chaque sortie de
 * KiwiFormat (par tools/format-vectors.json), le jeu de la fixture, et un corpus
 * de base (lettres, chiffres, ponctuation française, U+00A0, U+2212, l'arabe, les
 * unités MAD / درهم / نقطة). Les sources absentes de ce commit sont nommées.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmapOf, fontTables, gsubFeatures, fromRanges, readLocalFaces } from './font-cmap-dump.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
let passed = 0; const failures = [];
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures.push(msg); console.log('  ✗ ' + msg); } };
const note = (msg) => console.log('  ○ ' + msg);
console.log('font-coverage-test');

const U = (c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');
const GENERIC = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-sans-serif', '-apple-system', 'blinkmacsystemfont', 'cursive', 'fantasy']);
const ARABIC_BLOCKS = [[0x600, 0x6ff], [0x750, 0x77f], [0x8a0, 0x8ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff]];

/* ── les fichiers committés ────────────────────────────────────────────── */
const cmapCache = new Map();
const fileCmap = (rel) => {
  if (!cmapCache.has(rel)) cmapCache.set(rel, cmapOf(fs.readFileSync(path.join(ROOT, rel))));
  return cmapCache.get(rel);
};

/* ── parse des @font-face ──────────────────────────────────────────────── */
const parseRanges = (text) => {
  if (!text) return null;
  const out = [];
  for (const part of text.split(',')) {
    const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (!m) continue;
    if (m[1].includes('?')) out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'F'), 16)]);
    else out.push([parseInt(m[1], 16), m[2] ? parseInt(m[2], 16) : parseInt(m[1], 16)]);
  }
  return out.length ? out : null;
};
/* served : dossier d'où la feuille est servie (pour résoudre ses url()). */
function parseFaces(css, served) {
  const faces = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1];
    const fam = (body.match(/font-family\s*:\s*(["']?)([^;"']+)\1/i) || [])[2];
    const src = (body.match(/src\s*:\s*([^;]+)/i) || [])[1] || '';
    if (!fam) continue;
    const url = src.match(/url\(\s*(["']?)([^"')]+)\1\s*\)/i);
    const loc = src.match(/local\(\s*(["']?)([^"')]+)\1\s*\)/i);
    const face = { family: fam.trim(), ranges: parseRanges((body.match(/unicode-range\s*:\s*([^;]+)/i) || [])[1]) };
    if (url) face.file = path.posix.normalize(path.posix.join(served, url[2].split(/[?#]/)[0]));
    else if (loc) face.local = loc[2].trim();
    else continue;
    faces.push(face);
  }
  return faces;
}

/* ── la déclaration de §6.1, avec les vrais fichiers d'assets/fonts/ ───── */
const LATIN = parseRanges('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD');
const LATIN_EXT = parseRanges('U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF');
const ARABIC = parseRanges('U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF');
const specFaces = (opts = {}) => [
  { family: 'Inter Tight', file: 'assets/fonts/inter-tight-latin-ext.woff2', ranges: LATIN_EXT },
  { family: 'Inter Tight', file: 'assets/fonts/inter-tight-latin.woff2', ranges: LATIN },
  ...[400, 500, 600, 700].map((w) => ({ family: 'Kiwi Arabic', file: `assets/fonts/plex-arabic-${w}.woff2`, ranges: ARABIC })),
  { family: 'Inter Tight Fallback', local: 'Arial', ranges: opts.unrangedFallback ? null : LATIN.concat(LATIN_EXT) },
];
const KIT_STACK = ['Inter Tight', 'Kiwi Arabic', 'Inter Tight Fallback', 'system-ui'];

/* ── résolution d'un caractère ─────────────────────────────────────────── */
const inRanges = (r, c) => !r || r.some(([a, b]) => c >= a && c <= b);
const localCmap = (lf, platform, name) => {
  const p = lf && lf.platforms && lf.platforms[platform];
  if (!p || !p.captured) return { captured: false };
  const f = p.faces[name];
  if (f === null || f === undefined) return { captured: true, cmap: new Set(), none: true };      // « pas d'Arial »
  return { captured: true, cmap: fromRanges(f.cmap) };
};

/* → {family, via: 'url'|'local'|'system', couldClaim}. `unavailable` : fichiers pas encore chargés. */
function resolve(c, stack, faces, platform, lf, unavailable = new Set()) {
  let couldClaim = null;
  for (const fam of stack) {
    if (GENERIC.has(fam.toLowerCase())) return { family: fam, via: 'system', couldClaim };
    for (const f of faces.filter((x) => x.family === fam && inRanges(x.ranges, c)).reverse()) {
      if (f.file) {
        if (unavailable.has(f.file)) continue;
        if (fileCmap(f.file).has(c)) return { family: fam, via: 'url', file: f.file, couldClaim };
      } else {
        const l = localCmap(lf, platform, f.local);
        if (!l.captured) { couldClaim = couldClaim || { family: fam, local: f.local }; continue; }   // couvre RIEN, mais elle pourrait en prendre
        if (l.cmap.has(c)) return { family: fam, via: 'local', local: f.local, couldClaim };
      }
    }
  }
  return { family: 'system', via: 'system', couldClaim };
}

const expectedFamily = (c) => (ARABIC_BLOCKS.some(([a, b]) => c >= a && c <= b) ? 'Kiwi Arabic' : 'Inter Tight');

/* Les deux règles de §6.3, sur une pile, un corpus et une plateforme. */
function evaluate(stack, faces, corpus, platform, lf, { arabicFamily = 'Kiwi Arabic', latinFamily = 'Inter Tight', fallback = 'Inter Tight Fallback' } = {}) {
  const loaded = [], swapping = [];
  const latinFiles = new Set(faces.filter((f) => f.family === latinFamily && f.file).map((f) => f.file));
  const ownerOf = (c) => (expectedFamily(c) === 'Kiwi Arabic' ? arabicFamily : latinFamily);
  for (const c of corpus) {
    const r = resolve(c, stack, faces, platform, lf);
    if (r.via !== 'url' || r.family !== ownerOf(c)) loaded.push({ c, got: r.via === 'url' ? `${r.family} (${r.file})` : r.via === 'local' ? `local(${r.local}) via ${r.family}` : 'la fonte système' });
    else if (r.couldClaim) loaded.push({ c, got: `${r.family}, mais la face local(${r.couldClaim.local}) de ${r.couldClaim.family}, sans capture sur ${platform}, pourrait la prendre` });
    if (r.via === 'url' && r.family === latinFamily) {
      const s = resolve(c, stack, faces, platform, lf, latinFiles);
      if (!(s.via === 'local' && s.family === fallback)) swapping.push({ c, got: s.via === 'local' ? `local(${s.local}) via ${s.family}` : s.via === 'system' ? 'la fonte système' : s.family });
    }
  }
  return { loaded, swapping };
}

const fmt = (list) => list.slice(0, 8).map((x) => `${U(x.c)} → ${x.got}`).join(' ; ') + (list.length > 8 ? ` … (+${list.length - 8})` : '');

/* ═══ 1 · les fichiers sont ceux que la spécification décrit ═════════════ */
{
  const sizes = { 'inter-tight-latin.woff2': 44872, 'inter-tight-latin-ext.woff2': 89800, 'plex-arabic-400.woff2': 42848, 'plex-arabic-500.woff2': 45296, 'plex-arabic-600.woff2': 45688, 'plex-arabic-700.woff2': 44280 };
  for (const [f, n] of Object.entries(sizes)) check(exists(`assets/fonts/${f}`) && fs.statSync(path.join(ROOT, `assets/fonts/${f}`)).size === n, `assets/fonts/${f} : ${n} octets (§6.1)`);
  check(exists('assets/fonts/LICENSE-inter-tight.txt') && exists('assets/fonts/LICENSE-ibm-plex-sans-arabic.txt'), 'les deux licences OFL voyagent avec les fichiers');
  const inter = fileCmap('assets/fonts/inter-tight-latin.woff2');
  check(inter.size === 231, `Inter Tight Latin : 231 points de code (lu : ${inter.size})`);
  check(inter.has(0xa0) && inter.has(0x2212), 'Inter Tight Latin a U+00A0 et U+2212');
  check(!inter.has(0x202f), 'Inter Tight Latin n\'a PAS U+202F : il est interdit, pas ajouté (§6.1)');
  const feats = gsubFeatures(fs.readFileSync(path.join(ROOT, 'assets/fonts/inter-tight-latin.woff2')));
  check(feats.includes('tnum') && !feats.includes('zero'), `Inter Tight Latin : tnum oui, zero non (lu : ${feats.join(' ')})`);
  const plex = fileCmap('assets/fonts/plex-arabic-400.woff2');
  const inArabic = [...plex].filter((c) => ARABIC_BLOCKS.some(([a, b]) => c >= a && c <= b)).length;
  const others = [...plex].filter((c) => !ARABIC_BLOCKS.some(([a, b]) => c >= a && c <= b)).sort((a, b) => a - b);
  check(inArabic === 676, `Plex Arabic 400 : 676 points de code dans les plages arabes (lu : ${inArabic})`);
  check(others.map(U).join() === 'U+0000,U+000D,U+0020,U+00A0,U+2010', `Plex Arabic 400 : hors de l'arabe seulement U+0000, U+000D, U+0020, U+00A0, U+2010 (lu : ${others.map(U).join()})`);
  check(![...plex].some((c) => (c >= 0x30 && c <= 0x39)), 'Plex Arabic n\'a aucun chiffre ASCII : les chiffres viennent d\'Inter Tight');
  const lf = readLocalFaces();
  check(!!lf && lf.platforms.macos && lf.platforms.macos.captured && lf.platforms.ios && lf.platforms.ios.captured, 'tools/fonts/local-faces.json : macOS et iOS capturés');
  check(lf.platforms.android && lf.platforms.android.captured && lf.platforms.android.faces.Arial === null, 'Android : « pas d\'Arial » est une capture');
  const mac = fromRanges(lf.platforms.macos.faces.Arial.cmap);
  const ar = [...mac].filter((c) => c >= 0x600 && c <= 0x6ff).length;
  check(ar === 235, `l'Arial de macOS a 235 points de code dans U+0600-06FF (lu : ${ar}) : c'est lui qui prenait l'arabe en révision 13`);
  check(!mac.has(0x202f), 'ni l\'Arial de macOS ni celui d\'iOS n\'a U+202F');
}

/* ═══ 2 · le corpus ══════════════════════════════════════════════════════ */
const corpus = new Set();
const sources = [];
const addText = (t) => { for (const ch of String(t)) { const c = ch.codePointAt(0); if (c >= 0x20 || c === 0xa0) corpus.add(c); } };
const walkStrings = (v, fn) => { if (typeof v === 'string') fn(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) walkStrings(x, fn); };
{
  /* base : ce que les tableaux de §6.3 et §9 peuvent produire, que les sources
     ci-dessous existent ou non. */
  const base = [
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz',
    'àâäçéèêëîïôöùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŒ',
    '\u00a0\u00b7\u2026\u2019\u2018\u201c\u201d\u00ab\u00bb\u2212\u2013\u00d7\u2191\u2193%',
    'MAD درهم نقطة',
    'أبتثجحخدذرزسشصضطظعغفقكلمنهوىيءآإؤئةى',
    '٠١٢٣٤٥٦٧٨٩،؛؟٪٫٬',
    'الاثنين الثلاثاء الأربعاء الخميس الجمعة السبت الأحد أمس قبل يومين',
  ];
  base.forEach(addText);
  sources.push('corpus de base');
  for (const dir of ['strings', 'assets/strings']) {
    if (!exists(dir)) continue;
    const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json'));
    for (const f of files) walkStrings(JSON.parse(read(`${dir}/${f}`)), addText);
    if (files.length) sources.push(`${dir}/*.json (${files.length} fichiers)`);
  }
  for (const f of ['tools/format-vectors.json', 'tools/fixtures/worked-example.json']) {
    if (exists(f)) { walkStrings(JSON.parse(read(f)), addText); sources.push(f); }
  }
  const missing = ['strings/*.json', 'tools/format-vectors.json', 'tools/fixtures/worked-example.json'].filter((s) => !sources.some((x) => x.startsWith(s.replace('/*.json', ''))));
  note(`corpus : ${corpus.size} caractères distincts ; sources lues : ${sources.join(', ')}`);
  if (missing.length) note(`sources absentes de ce commit (elles s'ajoutent d'elles-mêmes à leur arrivée) : ${missing.join(', ')}`);
  const banned = [...corpus].filter((c) => c === 0x202f);
  check(!banned.length, 'le corpus ne contient pas U+202F (interdit en §6.1, §6.3 et par strings-lint)');
}
const CORPUS = [...corpus].sort((a, b) => a - b);

/* ═══ 3 · les piles découvertes ══════════════════════════════════════════ */
const lf = readLocalFaces();
const PLATFORMS = ['macos', 'ios', 'windows', 'android'];
const captured = (p) => !!(lf.platforms[p] && lf.platforms[p].captured);
const stacks = [];                 // {name, stack, faces, arabicFamily, kind}
{
  /* le kit : tokens-2027.css (assets/kit/ ou assets/) et toute feuille d'assets/kit/ */
  const kitFiles = ['assets/kit/tokens-2027.css', 'assets/tokens-2027.css']
    .concat(exists('assets/kit') ? fs.readdirSync(path.join(ROOT, 'assets/kit')).filter((f) => f.endsWith('.css')).map((f) => `assets/kit/${f}`) : [])
    .filter((f, i, a) => exists(f) && a.indexOf(f) === i);
  let kitFaces = [];
  const kitStacks = new Set();
  for (const f of kitFiles) {
    const css = read(f);
    kitFaces = kitFaces.concat(parseFaces(css, path.posix.dirname(f)));
    for (const m of css.matchAll(/--k-font\s*:\s*([^;}]+)/g)) kitStacks.add(m[1].trim());
    for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) if (!/var\(/.test(m[1]) && !/^\s*inherit/.test(m[1])) kitStacks.add(m[1].trim());
  }
  const split = (s) => s.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (kitFiles.length && kitFaces.length) {
    for (const s of kitStacks) {
      const st = split(s);
      if (!st.includes('Kiwi Arabic') && !st.includes('Inter Tight')) continue;      // une pile d'icônes ou de code n'a pas de Latin à garder
      stacks.push({ name: `kit : ${s}`, stack: st, faces: kitFaces, kind: 'kit' });
    }
    note(`kit lu : ${kitFiles.join(', ')}`);
  } else {
    stacks.push({ name: 'kit (bloc de déclarations de §6.1, tokens-2027.css absent de ce commit)', stack: KIT_STACK, faces: specFaces(), kind: 'kit' });
  }
  /* l'app native : les piles de native-runtime.css et native-shell.css, face par face */
  for (const f of ['app/src/native-runtime.css', 'app/src/native-shell.css']) {
    if (!exists(f)) continue;
    const css = read(f);
    const faces = parseFaces(css, '');            // servi à la racine du bundle
    /* Les piles sont celles des règles de style, pas la ligne font-family d'un @font-face. */
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/gi, '');
    for (const m of rules.matchAll(/(?:font-family|--sans)\s*:\s*([^;}]+)/g)) {
      const st = m[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (st[0] !== 'Inter Tight' && st[0] !== 'IBM Plex Sans Arabic') continue;
      if (!st.some((x) => GENERIC.has(x.toLowerCase()))) st.push('sans-serif');
      const name = `app (${f.split('/').pop()}) : ${st.join(', ')}`;
      if (!stacks.some((s) => s.name === name)) stacks.push({ name, stack: st, faces, kind: 'app' });
    }
  }
}

/* ═══ 4 · les règles, plateforme par plateforme ══════════════════════════ */
for (const s of stacks) {
  /* Les faces d'une pile de l'app pointent dans le bundle ; on remappe sur l'arbre.
     native-runtime.css écrit « assets/fonts/x » depuis la racine du bundle, qui est
     celle du dépôt pour assets/. native-fonts/ (JetBrains Mono) n'est pas lu. */
  s.faces = s.faces.filter((f) => !f.file || exists(f.file));
  for (const platform of PLATFORMS) {
    if (!captured(platform)) { note(`${s.name} · ${platform} : NON CAPTURÉ (jamais compté comme réussi, §6.3)`); continue; }
    if (s.kind === 'kit') {
      const r = evaluate(s.stack, s.faces, CORPUS, platform, lf);
      check(!r.loaded.length, `${platform} · ${s.name} · chargé : chaque caractère sort de son fichier${r.loaded.length ? ' — ' + fmt(r.loaded) : ''}`);
      if (platform === 'android') {
        /* Pas d'Arial : tout caractère latin atteint la face système pendant l'échange ; §6.1 l'accepte et le mesure. */
        note(`${platform} · ${s.name} · échange : pas d'Arial, les caractères latins passent par la fonte système jusqu'au chargement (accepté, §6.1, mesuré à l'étape 3c)`);
      } else {
        check(!r.swapping.length, `${platform} · ${s.name} · échange : pendant le chargement d'Inter Tight, chaque caractère tient dans la face de repli${r.swapping.length ? ' — ' + fmt(r.swapping) : ''}`);
      }
    } else {
      /* La pile de l'app (l'étape 1 ne la change pas) : seul compte que le LATIN
         sorte d'Inter Tight et l'ARABE de Plex quand la pile la nomme en premier.
         Une pile livrée qui ne nomme pas Inter Tight (la carte de compte en arabe :
         « IBM Plex Sans Arabic », sans-serif) envoie son latin à la fonte système, par
         conception ; elle n'est jugée que sur l'arabe. */
      const latin = s.stack.includes('Inter Tight')
        ? CORPUS.filter((c) => expectedFamily(c) === 'Inter Tight' && fileCmap('assets/fonts/inter-tight-latin.woff2').has(c))
        : [];
      const bad = [];
      for (const c of latin) {
        const r = resolve(c, s.stack, s.faces, platform, lf);
        const spaceInPlexFirst = s.stack[0] === 'IBM Plex Sans Arabic' && fileCmap('assets/fonts/plex-arabic-400.woff2').has(c);   // §6.1 : U+0020 et U+00A0 viennent de Plex sur une page arabe, par conception
        if (spaceInPlexFirst) { if (!(r.via === 'url' && r.family === 'IBM Plex Sans Arabic')) bad.push({ c, got: r.family }); continue; }
        if (!(r.via === 'url' && r.family === 'Inter Tight')) bad.push({ c, got: `${r.family} (${r.via})` });
      }
      check(!bad.length, `${platform} · ${s.name} · le latin et les chiffres sortent d'Inter Tight (les espaces d'une page arabe de Plex, §6.1)${bad.length ? ' — ' + fmt(bad) : ''}`);
      if (s.stack[0] === 'IBM Plex Sans Arabic') {
        const ar = CORPUS.filter((c) => ARABIC_BLOCKS.some(([a, b]) => c >= a && c <= b) && fileCmap('assets/fonts/plex-arabic-400.woff2').has(c));
        const badAr = ar.filter((c) => { const r = resolve(c, s.stack, s.faces, platform, lf); return !(r.via === 'url' && r.family === 'IBM Plex Sans Arabic'); });
        check(!badAr.length, `${platform} · ${s.name} · l'arabe sort d'IBM Plex Sans Arabic${badAr.length ? ' — ' + fmt(badAr.map((c) => ({ c, got: 'autre' }))) : ''}`);
      }
    }
  }
}

/* ═══ 5 · contrôles négatifs : le test doit voir ce qu'il existe pour voir ═ */
{
  const AR_STRING = [...'مقعدان'].map((ch) => ch.codePointAt(0));
  /* révision 13 : face de repli sans plage, placée avant Kiwi Arabic → l'arabe en Arial. */
  const rev13 = evaluate(['Inter Tight', 'Inter Tight Fallback', 'Kiwi Arabic', 'system-ui'], specFaces({ unrangedFallback: true }), AR_STRING, 'macos', lf);
  check(rev13.loaded.length === AR_STRING.length - new Set([]).size && rev13.loaded.every((x) => /local\(Arial\)/.test(x.got)),
    `contrôle négatif · la pile de la révision 13 échoue sur « مقعدان » : chaque lettre part en Arial (${rev13.loaded.length} sur ${AR_STRING.length})`);
  /* la même chose, par la règle qui compte la plage. */
  const ok = evaluate(KIT_STACK, specFaces(), AR_STRING, 'macos', lf);
  check(!ok.loaded.length, 'contrôle négatif · la pile de la révision 14 passe la même chaîne : le test ne rejette pas tout');
  /* U+202F : dans la plage de la face de repli, ni dans Inter Tight ni dans Arial. */
  const nnbsp = [...'19 174'].map((ch) => ch.codePointAt(0));
  const r202f = evaluate(KIT_STACK, specFaces(), nnbsp, 'macos', lf);
  check(r202f.loaded.length === 1 && r202f.loaded[0].c === 0x202f, `contrôle négatif · « 19\\u202F174 » échoue sur U+202F et sur lui seul (${r202f.loaded.map((x) => U(x.c)).join()})`);
  /* un caractère qu'Inter Tight a et qu'Arial n'a pas : l'échange doit le voir. */
  const mac = fromRanges(lf.platforms.macos.faces.Arial.cmap);
  const onlyInter = [...fileCmap('assets/fonts/inter-tight-latin.woff2')].filter((c) => !mac.has(c) && c >= 0x20);
  if (onlyInter.length) {
    const sw = evaluate(KIT_STACK, specFaces(), [onlyInter[0]], 'macos', lf);
    check(sw.swapping.length === 1, `contrôle négatif · ${U(onlyInter[0])} est dans Inter Tight et pas dans l'Arial de macOS : la règle d'échange l'attrape`);
    note(`caractères d'Inter Tight Latin absents de l'Arial de macOS (l'échange les poserait en fonte système) : ${onlyInter.map(U).join(' ')}`);
  } else note('tout caractère d\'Inter Tight Latin est dans l\'Arial de macOS : pas de cas pour l\'échange');
  /* une plateforme sans capture ne compte rien : jamais « réussi ». */
  const fake = { platforms: { macos: { captured: false, faces: {} } } };
  const un = evaluate(KIT_STACK, specFaces(), [0x41], 'macos', fake);
  check(un.swapping.length === 1, 'contrôle négatif · une plateforme sans capture compte la face de repli comme ne couvrant rien (l\'échange échoue, il ne passe pas)');
  /* une face local() sans capture AVANT une face livrée pourrait la lui prendre. */
  const claim = evaluate(['Inter Tight Fallback', 'Inter Tight', 'system-ui'], specFaces(), [0x41], 'macos', fake);
  check(claim.loaded.length === 1 && /pourrait la prendre|local|système/.test(claim.loaded[0].got), 'contrôle négatif · une face local() sans capture placée avant Inter Tight est signalée');
}

if (failures.length) { console.log(`\n✗ ${failures.length} échec(s), ${passed} contrôles verts`); process.exit(1); }
console.log(`\n✓ font-coverage-test : ${passed} contrôles verts`);
