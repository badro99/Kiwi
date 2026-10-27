#!/usr/bin/env node
/* The food-cost calculator is split by concern (tenth blind rating, analysis#2):
 *   strings · calc · sheets · network · export · editor
 * The page still loads assets/simple-food-cost.js, the exact concatenation of
 * its parts, so no page and no stamp moves; a change is made in the part that
 * owns the concern, then the bundle is rebuilt (cat, recorded in the fixture).
 * The proof: byte equality, every part parses inside the bundle's closure, each
 * part declares exactly the names recorded for it (moving a function between
 * concerns is a reviewed change of tools/fixtures/simple-food-cost/split.json),
 * and the calculation part stays pure: no window, document, storage, network
 * or page state of its own, so compute() is the same rule on every screen. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = (f) => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/simple-food-cost/split.json'));

function declared(text) {
  const ast = ts.createSourceFile('part.js', text, ts.ScriptTarget.Latest, true);
  let body = null;
  ts.forEachChild(ast, function visit(n) { if (!body && ts.isFunctionExpression(n)) body = n.body; else if (!body) ts.forEachChild(n, visit); });
  const names = [];
  for (const s of body.statements) {
    if (ts.isFunctionDeclaration(s)) names.push(s.name.text);
    else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) names.push(d.name.getText(ast));
    else if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && /^window\.\w+$/.test(s.expression.left.getText(ast))) names.push(s.expression.left.getText(ast));
  }
  return names;
}
function identifiers(text) {
  const ast = ts.createSourceFile('part.js', text, ts.ScriptTarget.Latest, true);
  const out = new Set();
  (function walk(n) {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) out.add(n.text);
    ts.forEachChild(n, walk);
  })(ast);
  return out;
}

const [bundle] = map.bundles;
assert.equal(map.bundles.length, 1);
const parts = bundle.parts.map((p) => read(p.file));
assert.equal(read(bundle.file), parts.join(''), bundle.file + ' = concaténation exacte de ses parties ; la refaire : cat '
  + bundle.parts.map((p) => p.file).join(' ') + ' > ' + bundle.file);
new vm.Script(read(bundle.file), { filename: bundle.file });
const all = new Set(), byPart = {};
bundle.parts.forEach((p, k) => {
  const open = k === 0 ? '' : '(function () {\n', close = k === parts.length - 1 ? '' : '\n})();';
  const wrapped = open + parts[k] + close;
  new vm.Script(wrapped, { filename: p.file });
  const names = declared(wrapped);
  assert.deepEqual(names, p.declares, p.file + ' : déclarations du domaine « ' + p.concern + ' »');
  for (const n of names) { assert.ok(!all.has(n), n + ' déclaré dans deux parties'); all.add(n); }
  byPart[p.file.split('/').pop()] = new Set(names);
});
for (const [part, names] of Object.entries({
  'strings.js': ['T', 'tr', 'money'], 'calc.js': ['compute'], 'sheets.js': ['S', 'rememberDraft', 'restoreDraft', 'blankSheet', 'toRecipe'],
  'network.js': ['api', 'load', 'save', 'estimates'], 'export.js': ['cell', 'sheetRows', 'exportAll'], 'editor.js': ['paint', 'panel', 'bind', 'window.KiwiSimpleFoodCost'],
})) for (const n of names) assert.ok(byPart[part].has(n), `${part} owns ${n}`);
const calcIds = identifiers(read('assets/simple-food-cost/calc.js'));
for (const ambient of ['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator', 'S']) {
  assert.ok(!calcIds.has(ambient), `calc.js stays pure: it reads no ${ambient} (conversions and today come in through opts)`);
}
const at = bundle.sha256AtSplit === createHash('sha256').update(read(bundle.file)).digest('hex');
console.log('✓ simple-food-cost-split-test : textes, calcul pur, fiches, réseau, export et éditeur découpés par domaine, fichier livré identique à ses parties' + (at ? ', octets du découpage' : ''));
