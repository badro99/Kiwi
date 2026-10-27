import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const map = JSON.parse(read('tools/fixtures/pressing/split.json'));
export function violations(source, contract) {
  const errors = [], ast = ts.createSourceFile('part.js', source, ts.ScriptTarget.Latest, true);
  function walk(n) {
    if (ts.isImportDeclaration(n) && !(contract.name === 'custody' ? /^\.\/(deposit|workshop|pickup|rack)\.js\?v=\d+$/ : /^\.\/custody\.js\?v=\d+$/).test(n.moduleSpecifier.text)) errors.push('sibling import');
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(ast) === 'window' && !contract.globals.includes(n.name.text)) errors.push('undeclared window.' + n.name.text);
    if (ts.isIdentifier(n) && n.text === 'window' && !(ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n)) errors.push('aliased window access');
    if (ts.isIdentifier(n) && /^Kiwi[A-Z]/.test(n.text) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !contract.globals.includes(n.text)) errors.push('undeclared ambient ' + n.text);
    if (ts.isElementAccessExpression(n) && n.expression.getText(ast) === 'window') errors.push('computed window access');
    if (ts.isIdentifier(n) && ['globalThis', 'eval', 'Function'].includes(n.text)) errors.push('ambient state escape');
    ts.forEachChild(n, walk);
  }
  walk(ast);
  const input = source.match(/const \{ ([^}]+) \} = owner\.(\w+)Context\(\);/);
  if (contract.name !== 'custody' && (!input || input[2] !== contract.name || input[1] !== contract.inputs.join(', '))) errors.push('owner interface drift');
  return errors;
}
for (const part of map.parts) {
  const source = read(part.file);
  const ast = ts.createSourceFile('part.js', source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).flatMap(n => n.importClause.namedBindings.elements.map(e => e.name.text)).sort();
  assert.deepEqual(imports, part.imports, part.file + ': live presentation imports are declared');
  assert.deepEqual(violations(source, part), [], part.file + ': declared imports, owner context and globals only');
  assert.ok(violations(source + '\nwindow.__siblingPrivateState.orders = [];', part).length, 'reject sibling private window state');
  assert.ok(violations(source + "\nimport './pickup.js?v=1';", part).length, 'reject direct sibling imports');
  assert.match(source, /return Object\.freeze\(/);
}
const owner = read(map.owner.file);
assert.deepEqual(violations(owner, map.owner), [], 'custody declares its browser dependencies');
assert.ok(violations(owner + '\nwindow.__siblingPrivateState = {};', map.owner).length);
assert.match(owner, /const custody = Object\.freeze\(/);
assert.match(owner, /const ui = Object\.freeze\(/);
assert.deepEqual([...owner.matchAll(/^export \{ ([^}]+) \};/gm)].map(m => m[1]), ['custody, root, CATALOG, ITEMS']);
for (const part of map.parts) assert.ok(owner.includes(part.name + 'Context() { return Object.freeze({ ' + part.inputs.join(', ') + ' }); }'));
console.log('✓ pressing boundaries: named custody interfaces, declared globals, no sibling imports or private window access');
