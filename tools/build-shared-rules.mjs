/* One rule, one source (structure plan, track A).
 *
 * A shared rule is a pure ES module under functions/ (no imports, no DOM, no
 * storage, no clock, no network). The server imports it directly. Browser
 * files cannot add a script tag (the shells are at their ratchet), so this tool
 * copies the module into each browser target between two markers:
 *
 *     /* GENERATED SHARED KiwiLoyaltyRules BEGIN *\/
 *     /* GENERATED SHARED KiwiLoyaltyRules END *\/
 *
 * The copy becomes `var KiwiLoyaltyRules = (function () { ...; return { a, b }; })();`
 * at the marker's indentation. Put the two marker lines where the rule is
 * needed, list the target in tools/shared-rules.json, then run this tool.
 * `--check` changes nothing and fails when a copy is stale: the gate runs it
 * through tools/shared-rules-test.mjs. Same idea as tools/build-menu-formula.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

export function registry() {
  return JSON.parse(read('tools/shared-rules.json')).rules || [];
}

const IMPURE = [/\bimport\b\s*[\w{*'"(]/, /\brequire\s*\(/, /\bwindow\b/, /\bdocument\b/, /\blocalStorage\b/,
  /\bsessionStorage\b/, /\bindexedDB\b/, /\bfetch\s*\(/, /\bnavigator\b/, /\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/,
  /\bMath\.random\s*\(/, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/, /\bprocess\./];

/* Strip comments and string bodies before the purity scan, so a word in a
   comment or a message does not count as a use. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''");
}

export function exportsOf(source) {
  const names = [];
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  return names;
}

export function checkPure(file, source) {
  const problems = [];
  const code = codeOnly(source);
  for (const re of IMPURE) if (re.test(code)) problems.push(file + ': not pure (' + re.source + ')');
  if (/^export\s+(?:default|\{|\*)/m.test(source)) problems.push(file + ': use named `export function` / `export const` only');
  if (!exportsOf(source).length) problems.push(file + ': exports nothing');
  return problems;
}

export function generated(rule, indent) {
  const source = read(rule.source);
  const body = source.replace(/^export\s+/gm, '');
  const pad = (line) => (line ? indent + '  ' + line : '');
  return indent + '/* GENERATED SHARED ' + rule.name + ' BEGIN */\n' +
    indent + '/* Copy of ' + rule.source + ' made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */\n' +
    indent + 'var ' + rule.name + ' = (function () {\n' +
    body.replace(/\s+$/, '').split('\n').map(pad).join('\n') + '\n' +
    indent + '  return { ' + exportsOf(source).join(', ') + ' };\n' +
    indent + '})();\n' +
    indent + '/* GENERATED SHARED ' + rule.name + ' END */\n';
}

function blockPattern(name) {
  const n = name.replace(/[$]/g, '\\$');
  return new RegExp('^([ \\t]*)\\/\\* GENERATED SHARED ' + n + ' BEGIN \\*\\/\\n[\\s\\S]*?^[ \\t]*\\/\\* GENERATED SHARED ' + n + ' END \\*\\/\\n', 'm');
}

/* Returns the list of problems; writes fresh copies unless `check`. */
export function build({ check = false } = {}) {
  const problems = [];
  const names = new Set();
  for (const rule of registry()) {
    if (!/^Kiwi[A-Z]\w+$/.test(rule.name || '')) { problems.push('bad rule name: ' + rule.name); continue; }
    if (names.has(rule.name)) problems.push('duplicate rule name: ' + rule.name);
    names.add(rule.name);
    if (!/^functions\//.test(rule.source || '') || !fs.existsSync(path.join(ROOT, rule.source))) { problems.push(rule.name + ': source missing under functions/: ' + rule.source); continue; }
    problems.push(...checkPure(rule.source, read(rule.source)));
    for (const target of rule.targets || []) {
      if (!fs.existsSync(path.join(ROOT, target))) { problems.push(rule.name + ': target missing: ' + target); continue; }
      const text = read(target);
      const re = blockPattern(rule.name);
      const m = text.match(re);
      if (!m) { problems.push(target + ': no GENERATED SHARED ' + rule.name + ' markers'); continue; }
      const next = text.replace(re, () => generated(rule, m[1]));
      if (next === text) continue;
      if (check) problems.push(target + ': stale copy of ' + rule.name + ', run `node tools/build-shared-rules.mjs`');
      else fs.writeFileSync(path.join(ROOT, target), next);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const problems = build({ check });
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log((check ? 'shared rules current: ' : 'shared rules written: ') + registry().length + ' rule(s)');
}
