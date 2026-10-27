/* Closed module interfaces: registration is inert; sibling state is private. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/menu-catalog/split.json'));
export function checkBoundary(source, part) {
  const reads = [...new Set([...source.matchAll(/window\.([\w$]+)/g)].map(m => m[1]))].sort();
  assert.deepEqual(reads, part.reads, part.file + ': undeclared window capability');
  assert.doesNotMatch(source, /\bwindow\b(?!\.)/, 'window capabilities cannot be aliased');
  assert.doesNotMatch(source, /\b(?:window|globalThis|self)\s*\[/, 'computed global access is not an interface');
  assert.doesNotMatch(source, /\b(?:globalThis|self)\./, 'alternate global access is not an interface');
  assert.equal((source.match(/window\.KiwiMenuCatalogParts/g) || []).length, 2, 'registry is registration only, never sibling lookup');
  assert.deepEqual([...source.matchAll(/\bparts\.([\w$]+)/g)].map(m => m[1]), [part.name], 'factory can register only its own slot');
  assert.equal((source.match(/\bparts\b/g) || []).length, 2, 'registry cannot be captured or aliased by a factory');
  const win = {};
  vm.runInNewContext(source, { window: win });
  assert.deepEqual(Object.keys(win), ['KiwiMenuCatalogParts']);
  assert.deepEqual(Object.keys(win.KiwiMenuCatalogParts), [part.name]);
  assert.equal(typeof win.KiwiMenuCatalogParts[part.name], 'function');
}
for (const part of map.parts) {
  const source = read(part.file);
  checkBoundary(source, part);
  assert.throws(() => checkBoundary(source + '\nwindow.__siblingPrivateState;', part), /undeclared window capability/);
  assert.throws(() => checkBoundary(source + '\nwindow.KiwiMenuCatalogParts.sibling;', part), /registry/);
  assert.throws(() => checkBoundary(source + '\nconst siblingWindow = window;', part), /cannot be aliased/);
  assert.throws(() => checkBoundary(source.replace('    return {', '    parts.sibling.privateState;\n    return {'), part), /own slot/);
}
const state = read('assets/menu-catalog/state.js');
for (const privateName of ['clouds', 'applyingServer', 'syncTimer']) {
  assert.ok(!map.parts[0].exports.includes(privateName), privateName + ' stays inside state owner');
  for (const part of map.parts.filter(p => p.name !== 'state')) assert.doesNotMatch(read(part.file), new RegExp('\\b' + privateName + '\\b'));
}
console.log('✓ menu boundaries: declared window capabilities, inert factories, closed registry, private revision/timer state; negative probes rejected');
