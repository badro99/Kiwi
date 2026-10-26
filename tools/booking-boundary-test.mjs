import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('../app/node_modules/typescript');
import { bookingSplit as map } from './booking-test-source.mjs';
// No implicit sibling symbols and no undeclared access through browser globals.
const globals = new Set(['window.KiwiPhone', 'globalThis.KiwiZoneLaw']);
function boundary(file, source) {
  const options = { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext };
  const host = ts.createCompilerHost(options), read = host.readFile;
  host.readFile = name => name === file ? source : read(name);
  const program = ts.createProgram([file], options, host);
  const errors = program.getSemanticDiagnostics().filter(d => [2304,2552,2580].includes(d.code));
  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')), [], file + ': undeclared dependency');
  const sf = program.getSourceFile(file);
  function walk(node) {
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && ['window','globalThis','self'].includes(node.expression.getText(sf))) {
      assert.ok(globals.has(node.getText(sf).replaceAll('?.', '.')), file + ': undeclared global ' + node.getText(sf));
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
}
for (const part of map.parts) {
  const source = fs.readFileSync(part.file, 'utf8');
  boundary(part.file, source);
  const context = new Proxy({ owner: { getState: () => ({}) } }, { get(target, key) {
    assert.ok(key === 'owner' || part.deps.includes(key), part.file + ': private dependency ' + String(key));
    return target[key] || (() => {});
  } });
  const sandbox = {};
  vm.runInNewContext(source.replace('export function ', 'function ') + '\nthis.api = createBooking' + part.file.match(/booking-(\w+)\.js$/)[1].replace(/^./, c => c.toUpperCase()) + ';', sandbox);
  assert.deepEqual(Object.keys(sandbox.api(context)).sort(), [...part.names].sort(), 'explicit exports');
}
const part = map.parts[0], source = fs.readFileSync(part.file, 'utf8');
assert.throws(() => boundary(part.file, source + '\nwindow.__bookingSiblingPrivate;'), /undeclared global/);
assert.throws(() => boundary(part.file, source + '\nbookingSiblingPrivate();'), /undeclared dependency/);
console.log('✓ booking boundaries: declared context, exact exports, private sibling/global access rejected');
