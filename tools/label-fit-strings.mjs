/* Kiwi · label-fit-strings.mjs : where label-fit-test gets its strings.
 *
 * Design 2027 §6.6: "label-fit-test repeats every row from the strings bundles
 * on every capture run". The strings slice of stage 1 builds those bundles
 * (strings/*.json, §9.6). Until they exist, the same strings are read from the
 * place they are written first: the §9.6 table in the spec, which is the
 * bundles' seed. The test says which source it used, so a green run never
 * hides that it measured the spec and not the shipped bundles.
 *
 * Accepted bundle shapes (strings/*.json), both read as {key: {en, fr, ar}}:
 *   { "<key>": { "en": "...", "fr": "...", "ar": "..." }, ... }
 *   { "en": { "<key>": "..." }, "fr": { ... }, "ar": { ... } }
 * A value may be a string or an object with `other` (a plural); the `other`
 * form is the one the label table measures unless the entry names a category.
 */
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['en', 'fr', 'ar'];

function fromBundles(root) {
  const dir = path.join(root, 'strings');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) return null;
  const map = new Map();
  const put = (key, lang, v) => {
    if (v && typeof v === 'object') v = v.other ?? v.many ?? Object.values(v)[0];
    if (typeof v !== 'string') return;
    if (!map.has(key)) map.set(key, {});
    map.get(key)[lang] = v;
  };
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (LANGS.every((l) => j[l] && typeof j[l] === 'object')) { for (const l of LANGS) for (const [k, v] of Object.entries(j[l])) put(k, l, v); }
    else for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object') for (const l of LANGS) put(k, l, v[l]);
  }
  return map.size ? { source: `strings/*.json (${files.length} file${files.length > 1 ? 's' : ''})`, map } : null;
}

/* The row's value cell, as the label table means it: a plural row keeps its
   `other` form, which is the text before " (one: ..." */
function baseValue(cell) {
  let v = cell.trim();
  const at = v.search(/ \((?:one|zero|two|few|many|other)\b/);
  if (at > 0) v = v.slice(0, at);
  return v.trim();
}

function fromSpec(root) {
  const file = path.join(root, 'docs', 'specs', 'kiwi-design-2027.md');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => /^### 9\.6 /.test(l));
  let end = lines.findIndex((l, i) => i > start && /^## 10\b/.test(l));
  if (start < 0) return null;
  if (end < 0) end = lines.length;
  const map = new Map();
  let rows = 0, arabic = 0;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!/^\| `/.test(line)) continue;
    const cells = line.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').split(/\s+\|\s+/);
    if (cells.length < 4) continue;
    const [first, ...rest] = cells;
    const vals = rest.slice(-3).map(baseValue);
    const head = first.split(' (')[0];
    const keys = [...head.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (!keys.length) continue;
    rows++;
    if (/[ء-ي]/.test(vals[2])) arabic++;
    if (keys.length === 1) { map.set(keys[0], { en: vals[0], fr: vals[1], ar: vals[2] }); continue; }
    /* "`a` / `b`" with values "x / y": split them when the counts agree. */
    const parts = vals.map((v) => v.split(' / '));
    if (parts.every((p) => p.length === keys.length)) keys.forEach((k, j) => map.set(k, { en: parts[0][j], fr: parts[1][j], ar: parts[2][j] }));
  }
  return { source: 'docs/specs/kiwi-design-2027.md §9.6 (the bundles do not exist yet)', map, rows, arabic };
}

export function loadStrings(root) {
  return fromBundles(root) || fromSpec(root) || { source: 'none', map: new Map(), rows: 0, arabic: 0 };
}

/* Fill {name} arguments from `args` (a plain object of strings). Throws on a
   missing argument, so a row that gains an argument fails loudly. */
export function fill(template, args = {}) {
  return template.replace(/\{([a-z_]+)\}/g, (m, name) => {
    if (!(name in args)) throw new Error(`argument {${name}} has no sample value`);
    return args[name];
  });
}

export function argumentsOf(template) {
  return [...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
}

export { LANGS };
