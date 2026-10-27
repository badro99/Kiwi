import assert from 'node:assert/strict';
import fs from 'node:fs';
import boundary from './orderpro-boundary-lib.cjs';
const contracts = JSON.parse(fs.readFileSync('tools/fixtures/orderpro/interfaces.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('tools/fixtures/orderpro/split.json', 'utf8'));
const builtins = new Set('Array Boolean CSS Date Intl Error Infinity IntersectionObserver JSON Map Math Notification Number Object Promise ReferenceError Set String Symbol TextEncoder Uint8Array clearInterval clearTimeout document fetch encodeURIComponent globalThis isFinite localStorage navigator parseInt requestAnimationFrame setInterval setTimeout undefined window KiwiOrderMenu allItems'.split(' '));
for (const part of [...map.parts, ...map.extensions]) {
  const source = fs.readFileSync(part.file, 'utf8'), contract = contracts[part.file];
  assert.deepEqual(boundary.violations(source, contract), [], part.file);
  for (const name of contract.free) assert.ok(builtins.has(name) || part.reads.includes(name), part.file + ': undeclared scope input ' + name);
  for (const injection of ['window.siblingPrivateState', 'globalThis.siblingPrivateState', 'siblingPrivateState', 'window[privateKey]']) {
    assert.ok(boundary.violations(source.replace('with (scope) {', 'with (scope) { void ' + injection + ';'), contract).length, 'boundary rejects ' + injection);
  }
  // The registry is for registration only, never for obtaining sibling internals.
  const body = source.slice(part.header.length, -part.footer.length);
  assert.doesNotMatch(body, /\bKiwiOrderMenu\.orderProParts\b/);
}
console.log('✓ orderpro boundaries: explicit lexical inputs and browser globals; sibling and computed-global mutations rejected');
