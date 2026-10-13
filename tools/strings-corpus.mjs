#!/usr/bin/env node
/* Kiwi · strings-corpus.mjs · le parseur de la table de chaînes (§9.6) et les
 * décomptes qu'elle fonde.
 *
 *   node tools/strings-corpus.mjs            les décomptes
 *   node tools/strings-corpus.mjs --chars    + l'ensemble des caractères du corpus
 *   node tools/strings-corpus.mjs --json     la table analysée (clés, cellules)
 *
 * Deux usages. Les décomptes : « une chaîne est une ligne de §9.6 dont la
 * première cellule commence par une clé entre accents graves ; une ligne qui
 * liste plusieurs clés (`settings.business` / `.devices` / …) est une seule
 * chaîne, comme dessinée ; une chaîne arabe est une telle ligne dont la
 * cellule AR contient au moins une lettre arabe (U+0621 à U+064A) » (§6.6,
 * « Whole-corpus check »). Aucune révision ne les retape : label-fit-test et
 * strings-completeness-test les relisent ici. Et le corpus de caractères que
 * font-coverage-test mesure (§6.3) : toute valeur de les paquets en EN, FR
 * et AR, plus, si le fichier existe déjà, la fixture. Les sorties de
 * KiwiFormat s'y ajoutent quand format.js existera (autre tranche).
 *
 * Zéro dépendance. Le module ne lit que le dépôt ; il n'écrit rien. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.KIWI_ROOT ? path.resolve(process.env.KIWI_ROOT) : path.resolve(HERE, '..');
export const SPEC = path.join(ROOT, 'docs', 'specs', 'kiwi-design-2027.md');
export const LANGS = ['en', 'fr', 'ar'];
/* Surfaces livrées en paquets (§9.3). */
export const BUNDLE_SURFACES = ['kit', 'dashboard', 'till', 'kds', 'team', 'ordering', 'onboarding'];
/* « guest » : les chaînes que les pages invité gardent dans leur propre
 * dictionnaire (dernier tableau de §9.6). Elles sont dans strings/guest.json,
 * lues par les lints, mais ne sont livrées dans aucun paquet. */
export const SURFACES = [...BUNDLE_SURFACES, 'guest'];

export function readSpec(file = SPEC) { return fs.readFileSync(file, 'utf8'); }

/* Les bornes de §9.6 : du titre « ### 9.6 » au prochain titre « ## ». */
export function section96(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^### 9\.6 /.test(l));
  if (start < 0) throw new Error('titre « ### 9.6 » introuvable dans la spec');
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { lines: lines.slice(start, end), first: start + 1 };
}

/* Une parenthèse équilibrée à partir de l'indice i (s[i] === '('). Renvoie
 * l'indice de la parenthèse fermante, ou -1. Les accents graves protègent leur
 * contenu : une note peut citer du code qui contient une parenthèse. */
function closeParen(s, i) {
  let depth = 0, tick = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '`') { tick = !tick; continue; }
    if (tick) continue;
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k;
  }
  return -1;
}

/* La cellule clé : suite de jetons `clé` (avec note facultative entre
 * parenthèses) séparés par « / ». Les suffixes « .menu » héritent du préfixe de
 * la première clé. Renvoie { tokens: [clé complète…], rest }. */
export function parseKeyCell(cell) {
  const tokens = [];
  let s = cell.trim();
  let prefix = null;
  for (;;) {
    const m = /^`([^`]+)`/.exec(s);
    if (!m) break;
    let raw = m[1];
    s = s.slice(m[0].length);
    if (raw.startsWith('.')) {
      if (prefix == null) throw new Error(`suffixe sans clé : ${cell}`);
      raw = prefix + raw;
    } else {
      /* Un suffixe « .cold » hérite du parent de la clé qui le PRÉCÈDE
         immédiatement (`kds.station.hot` → `kds.station`), jamais de la
         première clé de la ligne (`kds.all` → `kds`, d'où kds.cold). */
      prefix = raw.includes('.') ? raw.slice(0, raw.lastIndexOf('.')) : raw;
    }
    tokens.push(raw);
    /* Une note entre parenthèses, puis soit « / `suivante` », soit la fin. */
    let t = s;
    if (t.startsWith(' (')) {
      const close = closeParen(t, 1);
      if (close > 0) t = t.slice(close + 1);
    }
    const next = /^ \/ (?=`)/.exec(t);
    if (!next) { s = t; break; }
    s = t.slice(next[0].length);
  }
  return { tokens, rest: s };
}

/* Découpe une ligne de tableau en cellules. Une cellule ne contient jamais
 * « | » : le nombre de cellules est vérifié, pas supposé. */
export function splitRow(line) {
  const body = line.replace(/^\|\s?/, '').replace(/\s?\|\s*$/, '');
  return body.split(' | ');
}

const HEADER_SURFACE = /\(`([a-z]+)`\)\*\*$/;

/* Lit la table : renvoie une liste de lignes { line, surface, keys, keyCell, cells:{en,fr,ar} }. */
export function parseTable(text = readSpec()) {
  const { lines, first } = section96(text);
  const rows = [];
  let surface = null;
  lines.forEach((raw, i) => {
    const line = first + i;
    if (/^\*\*/.test(raw)) {
      const h = HEADER_SURFACE.exec(raw.trim());
      if (h && SURFACES.includes(h[1])) surface = h[1];
      else if (/^\*\*Guest pages:/.test(raw)) surface = 'guest';
      return;
    }
    if (!raw.startsWith('| `')) return;
    const cells = splitRow(raw);
    if (cells.length !== 4) throw new Error(`ligne ${line} : ${cells.length} cellules au lieu de 4`);
    let keys;
    const keyCell = cells[0];
    if (surface === 'guest') {
      /* « `prep_note_post`, `OrderPro.html` (…) » : la clé et la page. */
      const g = /^`([a-z_]+)`, (?:`([A-Za-z.-]+)`|both pages)/.exec(keyCell);
      if (!g) throw new Error(`ligne ${line} : clé de page invité illisible`);
      const site = g[2] ? g[2].replace(/\.html$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'both';
      keys = [`guest.${g[1]}.${site}`];
    } else {
      keys = parseKeyCell(keyCell).tokens;
    }
    if (!keys.length) throw new Error(`ligne ${line} : aucune clé dans « ${keyCell.slice(0, 60)} »`);
    rows.push({ line, surface, keys, keyCell, cells: { en: cells[1], fr: cells[2], ar: cells[3] } });
  });
  return rows;
}

export const hasArabicLetter = (s) => /[ء-ي]/.test(s);

/* Les décomptes de la règle : lignes, et lignes dont la cellule AR a une lettre arabe. */
export function counts(rows) {
  return { rows: rows.length, arabic: rows.filter((r) => hasArabicLetter(r.cells.ar)).length };
}

/* Les décomptes que la spec elle-même énonce (« By that rule §9.6 has 550 rows
 * and 542 Arabic strings at revision 25 »), pour qu'aucune révision ne les
 * retape dans un test. */
export function statedCounts(text = readSpec()) {
  const m = /By that rule §9\.6 has (\d[\d,]*) rows and (\d[\d,]*) Arabic strings/.exec(text);
  if (!m) return null;
  return { rows: Number(m[1].replace(/,/g, '')), arabic: Number(m[2].replace(/,/g, '')) };
}

const hex = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/* Les paquets : assets/kit/strings/<surface>.<lang>.js (§9.3). Chaque fichier
 * s'enregistre dans self.__kiwiStrings['<surface>.<lang>'] ; on les exécute
 * dans un bac à sable, comme un navigateur, et on lit le registre.
 * → { till: { en: {clé: valeur}, fr: {…}, ar: {…} }, … } */
export function loadBundles(rootDir = ROOT) {
  const dir = path.join(rootDir, 'assets', 'kit', 'strings');
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const m = /^([a-z]+)\.(en|fr|ar)\.js$/.exec(f);
    if (!m) continue;
    const sandbox = {};
    sandbox.self = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
    const reg = sandbox.__kiwiStrings || {};
    (out[m[1]] = out[m[1]] || {})[m[2]] = reg[`${m[1]}.${m[2]}`] || {};
  }
  return out;
}

/* Les chaînes des pages invité (hors paquets) et la table des entrées d'actes :
 * tools/strings-data/. */
export function loadData(name, rootDir = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'tools', 'strings-data', name), 'utf8'));
}

/* Toutes les valeurs de tous les paquets (et des pages invité), tableaux aplatis. */
export function bundleValues(rootDir = ROOT) {
  const out = [];
  const push = (v) => { if (Array.isArray(v)) out.push(...v); else out.push(v); };
  for (const langs of Object.values(loadBundles(rootDir))) {
    for (const lang of LANGS) for (const v of Object.values(langs[lang] || {})) push(v);
  }
  const gf = path.join(rootDir, 'tools', 'strings-data', 'guest.json');
  if (fs.existsSync(gf)) {
    for (const e of Object.values(JSON.parse(fs.readFileSync(gf, 'utf8')))) for (const lang of LANGS) push(e[lang]);
  }
  return out;
}

/* Le moteur de rendu (assets/kit/strings.js), chargé comme un module CommonJS :
 * c'est le même analyseur ICU que celui du navigateur, jamais une copie. */
export function loadRuntime(rootDir = ROOT) {
  const req = createRequire(import.meta.url);
  return req(path.join(rootDir, 'assets', 'kit', 'strings.js'));
}

/* Toutes les chaînes à plat : { surface, key, lang, value, index, text } où
 * `text` est une phrase complète que la valeur peut produire (toutes les
 * branches d'un pluriel, tous les éléments d'une liste). */
export function flatten(bundles, K = loadRuntime()) {
  const out = [];
  for (const [surface, langs] of Object.entries(bundles)) {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(langs[lang] || {})) {
        (Array.isArray(value) ? value : [value]).forEach((v, index) => {
          for (const text of K._expand(v)) out.push({ surface, key, lang, value: v, index, text });
        });
      }
    }
  }
  return out;
}

/* Les chaînes entre guillemets droits de §10 à §18 (de « ## 10. » à « ## 19. »),
 * avec la première ligne où chacune apparaît. C'est ce que
 * strings-coverage-test confronte à la table et à la fixture (§9.6, « Coverage
 * rule »). */
export function quotedStrings(text = readSpec()) {
  const lines = text.split('\n');
  const s = lines.findIndex((l) => /^## 10\. /.test(l));
  const e = lines.findIndex((l) => /^## 19\. /.test(l));
  if (s < 0 || e < 0) throw new Error('bornes de §10 à §18 introuvables');
  const out = new Map();
  for (let i = s; i < e; i++) {
    for (const m of lines[i].matchAll(/"([^"\n]{2,120})"/g)) if (!out.has(m[1])) out.set(m[1], i + 1);
  }
  return { quoted: out, from: s + 1, to: e };
}

const squash = (x) => x.replace(/’/g, "'").replace(/ /g, ' ');
const letters = (v) => v.replace(/\{[a-z_]+\}/g, '').replace(/[^\p{L}]/gu, '').length;

/* Un appariement de chaînes citées avec des valeurs : la citation est une
 * valeur entière (les {arguments} valent « n'importe quoi »), ou un morceau
 * d'une valeur. Une valeur sans trois lettres littérales (« {value} ») ne
 * s'apparie à rien : elle apparierait tout. */
export function makeMatcher(values) {
  const usable = values.filter((v) => typeof v === 'string' && letters(v) >= 3);
  const whole = usable.map((v) => new RegExp('^' + squash(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z_]+\\\}/g, '.+?') + '$', 'u'));
  const parts = usable.map(squash);
  return (q) => {
    const n = squash(q);
    return whole.some((r) => r.test(n)) || parts.some((p) => p.includes(n));
  };
}

/* Le corpus de caractères de font-coverage-test (§6.3) : les paquets et la
 * fixture, si elle existe. */
export function fullCorpus(rootDir = ROOT) {
  const values = bundleValues(rootDir);
  const sources = { strings: values.length, fixture: 0 };
  const fixture = path.join(rootDir, 'tools', 'fixtures', 'worked-example.json');
  if (fs.existsSync(fixture)) {
    const walk = (x) => {
      if (typeof x === 'string') { values.push(x); sources.fixture++; }
      else if (x && typeof x === 'object') Object.values(x).forEach(walk);
    };
    walk(JSON.parse(fs.readFileSync(fixture, 'utf8')));
  }
  const chars = new Set();
  for (const v of values) for (const ch of String(v)) chars.add(ch);
  return { chars, sources };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const text = readSpec();
  const rows = parseTable(text);
  const c = counts(rows);
  const stated = statedCounts(text);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(`§9.6 : ${c.rows} lignes, ${c.arabic} chaînes arabes`);
    if (stated) console.log(`la spec énonce : ${stated.rows} lignes, ${stated.arabic} chaînes arabes ${stated.rows === c.rows && stated.arabic === c.arabic ? '(accord)' : '(DÉSACCORD)'}`);
    const bySurface = {};
    for (const r of rows) bySurface[r.surface] = (bySurface[r.surface] || 0) + r.keys.length;
    console.log('clés par surface : ' + Object.entries(bySurface).map(([k, v]) => `${k} ${v}`).join(' · '));
    if (process.argv.includes('--chars')) {
      const { chars, sources } = fullCorpus();
      const list = [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
      console.log(`corpus : ${list.length} caractères distincts (${sources.strings} valeurs, ${sources.fixture} chaînes de fixture)`);
      console.log(list.map((ch) => hex(ch)).join(' '));
    }
  }
}
