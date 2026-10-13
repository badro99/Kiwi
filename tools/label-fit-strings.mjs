/* Kiwi · label-fit-strings.mjs : where label-fit-test gets its strings.
 *
 * Design 2027 §6.6: "label-fit-test repeats every row from the strings bundles
 * on every capture run". The bundles are assets/kit/strings/<surface>.<lang>.js
 * (§9.3), seven surfaces by three languages; each file registers itself on
 * globalThis.__kiwiStrings['<surface>.<lang>'], and assets/kit/strings.js
 * (KiwiStrings) renders them. This loader evaluates those files, and the
 * runtime, in a vm context, exactly as a page would, and asks KiwiStrings.raw()
 * for the text, so an ICU plural is resolved by the product's own code and not by
 * a regular expression here.
 *
 * Until that folder exists the same strings are read from where they are
 * written first: the §9.6 table in the spec, the bundles' seed. The test says
 * which source it used, so a green run never hides that it measured the spec and
 * not the shipped bundles.
 *
 * What a source gives the test (the same for both):
 *   source        a sentence for the log
 *   size          how many keys
 *   has(key)      the key exists in all three languages
 *   render(key, lang, args)   the text with its arguments filled, as one string;
 *                 a list key (several questions, several chips) is joined with
 *                 " / ", which is how §9.6 writes it and how a row's `split`
 *                 reads it
 *   argsOf(key, lang)         the argument names in every branch of the message
 *   rows, arabic  (spec source only) the row count and Arabic-string count
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const LANGS = ['en', 'fr', 'ar'];

/* ── assets/kit/strings/*.js, evaluated ── */

function fromBundles(root) {
  const dir = path.join(root, 'assets', 'kit', 'strings');
  const runtime = path.join(root, 'assets', 'kit', 'strings.js');
  if (!fs.existsSync(dir) || !fs.existsSync(runtime)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^[a-z][a-z0-9-]*\.(?:en|fr|ar)\.js$/.test(f)).sort();
  if (!files.length) return null;
  const warnings = [];
  const ctx = vm.createContext({ console: { warn: (m) => warnings.push(String(m)), log() {}, error() {} } });
  vm.runInContext(fs.readFileSync(runtime, 'utf8'), ctx, { filename: 'assets/kit/strings.js' });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: `assets/kit/strings/${f}` });
  const KS = ctx.KiwiStrings;
  if (!KS || typeof KS.raw !== 'function' || typeof KS._table !== 'function') throw new Error('assets/kit/strings.js did not register KiwiStrings with raw() and _table()');
  const tables = Object.fromEntries(LANGS.map((l) => [l, KS._table(l)]));
  const keys = new Set(Object.keys(tables.en));
  const stringOf = (key, lang) => {
    const v = tables[lang][key];
    return v == null ? null : (Array.isArray(v) ? v.join(' / ') : v);
  };
  return {
    source: `assets/kit/strings/*.js (${files.length} bundles evaluated with assets/kit/strings.js)`,
    size: keys.size,
    keys,
    has: (key) => LANGS.every((l) => tables[l][key] != null),
    render(key, lang, args = {}) {
      if (tables[lang][key] == null) throw new Error(`key ${key} has no ${lang} string`);
      KS.setLocale(lang);
      const out = KS.raw(key, args);
      return Array.isArray(out) ? out.join(' / ') : out;
    },
    argsOf(key, lang) {
      const v = tables[lang][key];
      if (v == null) return [];
      const msgs = Array.isArray(v) ? v : [v];
      return [...new Set(msgs.flatMap((m) => KS._args(m)))];
    },
    stringOf,
    warnings,
  };
}

/* ── the spec's §9.6 table ── */

/* The row's value cell, as the label table means it: a plural row keeps its
   `other` form, which is the text before " (one: ..." */
function baseValue(cell) {
  let v = cell.trim();
  const at = v.search(/ \((?:one|zero|two|few|many|other)\b/);
  if (at > 0) v = v.slice(0, at);
  return v.trim();
}

export function fill(template, args = {}) {
  return template.replace(/\{([a-z_]+)\}/g, (m, name) => {
    if (!(name in args)) throw new Error(`argument {${name}} has no sample value`);
    return args[name];
  });
}

export function argumentsOf(template) {
  return [...template.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
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
    const keys = [];
    for (const m of head.matchAll(/`([^`]+)`/g)) {
      /* "`kds.station.hot` / `.cold`": a key that starts with a dot is a sibling of the one before it */
      if (m[1].startsWith('.') && keys.length) keys.push(keys[keys.length - 1].replace(/\.[^.]*$/, '') + m[1]);
      else keys.push(m[1]);
    }
    if (!keys.length) continue;
    rows++;
    if (/[ء-ي]/.test(vals[2])) arabic++;
    if (keys.length === 1) { map.set(keys[0], { en: vals[0], fr: vals[1], ar: vals[2] }); continue; }
    /* "`a` / `b`" with values "x / y": split them when the counts agree. */
    const parts = vals.map((v) => v.split(' / '));
    if (parts.every((p) => p.length === keys.length)) keys.forEach((k, j) => map.set(k, { en: parts[0][j], fr: parts[1][j], ar: parts[2][j] }));
  }
  return {
    source: 'docs/specs/kiwi-design-2027.md §9.6 (assets/kit/strings/ does not exist yet)',
    size: map.size, keys: new Set(map.keys()), rows, arabic,
    has: (key) => map.has(key),
    render(key, lang, args = {}) {
      const e = map.get(key);
      if (!e || typeof e[lang] !== 'string') throw new Error(`key ${key} has no ${lang} string`);
      return fill(e[lang], args);
    },
    argsOf: (key, lang) => [...new Set(argumentsOf(map.get(key)?.[lang] || ''))],
    stringOf: (key, lang) => map.get(key)?.[lang] ?? null,
  };
}

/* `prefer: 'spec'` forces the table (the equality proof runs both). */
export function loadStrings(root, { prefer = null } = {}) {
  if (prefer === 'spec') return fromSpec(root) || { source: 'none', size: 0, keys: new Set(), has: () => false, render() { throw new Error('no strings'); }, argsOf: () => [], stringOf: () => null };
  return fromBundles(root) || fromSpec(root) || { source: 'none', size: 0, keys: new Set(), has: () => false, render() { throw new Error('no strings'); }, argsOf: () => [], stringOf: () => null };
}

export { LANGS };
