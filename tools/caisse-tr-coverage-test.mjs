#!/usr/bin/env node
/* The till translates by looking a French phrase up in assets/caisse-lang.js.
 * A phrase missing from the dictionary does not fail: it silently stays
 * French under EN and AR. This suite runs the real dictionary over every
 * string literal the till code hands to its translator (tr, say, t,
 * KiwiCaisseLang.tr/t) in the files that use KiwiCaisseLang, and pins the
 * untranslated count per file in tools/caisse-tr-coverage-baseline.json.
 * A pin only goes down: KIWI_UPDATE_TR_BASELINE=1 lowers it after a fix.
 * A file that is not pinned must translate every literal it passes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'tools/caisse-tr-coverage-baseline.json');

const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, attributes: [], childNodes: [], children: [],
  setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const store = new Map();
const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const context = { window, console, localStorage: window.localStorage,
  document: { readyState: 'complete', documentElement: el(), body: el(), head: el(), createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }) },
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/caisse-lang.js'), 'utf8'), context, { filename: 'caisse-lang.js' });
const L = window.KiwiCaisseLang;
L.set('ar');

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) { if (!/vendor|icons|landing|fonts/.test(entry.name)) walkFiles(rel, out); }
    else if (/\.m?js$/.test(entry.name) && !/\.min\.js$/.test(entry.name)) out.push(rel);
  }
  return out;
}
// The till's own translator only: files that reach KiwiCaisseLang. The caisse-lang dictionary itself is the oracle, not a caller.
const files = walkFiles('assets').filter((f) => f !== 'assets/caisse-lang.js' && fs.readFileSync(path.join(ROOT, f), 'utf8').includes('KiwiCaisseLang'));
const CALLS = /^(?:tr|say|t)$/;
const letters = /[A-Za-zÀ-ÿ]{2}/;
// Not a phrase: a CSS selector handed to a local t(sel) helper, or a lowercase code word (« body », « reload »).
const notPhrase = /^[\[.#]|^[a-z]+$/;
const missing = {};
let literals = 0;
for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const seen = new Set();
  // A file may carry its own FR -> [EN, AR] table (const PHRASES = {...}) in front of KiwiCaisseLang.
  let own = {};
  ast.statements.forEach((st) => {
    if (!ts.isVariableStatement(st)) return;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === 'PHRASES' && d.initializer && ts.isObjectLiteralExpression(d.initializer)) own = vm.runInNewContext('(' + d.initializer.getText(ast) + ')');
  });
  (function visit(n) {
    if (ts.isCallExpression(n) && n.arguments.length >= 1 && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      const e = n.expression;
      const called = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) && /KiwiCaisseLang$/.test(e.expression.getText(ast)) ? e.name.text : '';
      const phrase = n.arguments[0].text;
      // tr('pay.title', 'Encaisser', vars) is a keyed lookup with its own copy, not a dictionary phrase.
      const keyed = n.arguments.length >= 2 && /^[a-z][\w-]*(?:\.[\w-]+)+$/i.test(phrase);
      if (CALLS.test(called) && !keyed && letters.test(phrase) && !notPhrase.test(phrase) && !seen.has(phrase)) {
        seen.add(phrase); literals++;
        const local = own[phrase];
        if (!(Array.isArray(local) && local[1]) && L.tr(phrase) === phrase) (missing[file] ||= []).push(phrase);
      }
    }
    ts.forEachChild(n, visit);
  })(ast);
}
assert.ok(files.length > 20 && literals > 200, `the scan reaches the till code (${files.length} files, ${literals} phrases)`);

if (process.env.KIWI_TR_LIST) for (const [f, l] of Object.entries(missing)) console.log(f, JSON.stringify(l));
const counts = Object.fromEntries(Object.entries(missing).map(([f, list]) => [f, list.length]));
if (process.env.KIWI_UPDATE_TR_BASELINE === '1' || !fs.existsSync(BASE)) {
  const old = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')).files : null;
  const next = Object.fromEntries(Object.entries(counts).filter(([f, n]) => !old || (old[f] != null && n <= old[f])).sort());
  if (old) for (const [f, n] of Object.entries(counts)) assert.ok(old[f] != null && n <= old[f], f + ': cannot raise a pin while lowering');
  fs.writeFileSync(BASE, JSON.stringify({ note: 'Untranslated till phrases per file (caisse-tr-coverage-test.mjs). Pins only go down; KIWI_UPDATE_TR_BASELINE=1 after adding translations to assets/caisse-lang.js.', files: next }, null, 2) + '\n');
  console.log('caisse-tr-coverage baseline written');
}
const pins = JSON.parse(fs.readFileSync(BASE, 'utf8')).files;
const problems = [];
for (const [file, n] of Object.entries(counts)) {
  const pin = pins[file] ?? 0;
  if (n > pin) problems.push(`${file}: ${n} phrases stay French under AR, pinned at ${pin}. Add them to assets/caisse-lang.js: ${missing[file].slice(0, 4).map((p) => JSON.stringify(p)).join(', ')}`);
}
for (const [file, pin] of Object.entries(pins)) if ((counts[file] || 0) < pin) console.log(`  ↓ ${file}: ${counts[file] || 0} < pin ${pin}, lower it with KIWI_UPDATE_TR_BASELINE=1`);
if (problems.length) { console.error('✗ caisse-tr-coverage\n  ' + problems.join('\n  ')); process.exit(1); }
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`✓ caisse-tr-coverage · ${literals} till phrases in ${files.length} files run through the real dictionary; ${total} still French, none above its pin`);
