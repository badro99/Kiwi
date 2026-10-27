/* C1-team: exact live-source reconstruction and declared module boundaries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import owners from './team-owners-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = file => fs.readFileSync(file, 'utf8');
const hash = s => createHash('sha256').update(s).digest('hex');
const { map, originalFile } = owners;
const frozen = gunzipSync(fs.readFileSync('tools/fixtures/team-owners/original.js.gz')).toString();
assert.equal(hash(frozen), map.sha256);
assert.equal(read('tools/fixtures/team-owners/sha256').trim(), map.sha256);
const originals = JSON.parse(frozen);
for (const file of map.files) assert.equal(originalFile(file), originals[file], file + ': byte-exact original reconstructed from live source');
for (const part of map.parts) {
  const source = read(part.file);
  assert.equal(source, part.prefix + part.fragments.map(f => source.slice(f.offset, f.offset + f.length) + '\n').join('') + part.suffix, part.file + ': entire declared wrapper');
  for (const f of part.fragments) {
    const live = source.slice(f.offset, f.offset + f.length);
    assert.equal(live, originals['assets/team.js'].slice(f.start, f.end), part.file + ': moved body unchanged');
    assert.equal(hash(live), f.sha256);
  }
  // AST checks include optional chains and literal bracket access. Computed
  // window access, eval, and globalThis would bypass the declared boundary.
  const ast = ts.createSourceFile(part.file, source, ts.ScriptTarget.Latest, true);
  const globals = new Set(), paths = new Set();
  function chain(node) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return chain(node.expression) + '.' + node.name.text;
    return '';
  }
  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const name = chain(node);
      if (name.startsWith('window.')) paths.add(name);
      if (node.expression.getText(ast) === 'parts') assert.equal(node.name.text, part.name, 'no sibling registry access');
    }
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'window') globals.add(node.name.text);
    if (ts.isElementAccessExpression(node) && node.expression.getText(ast) === 'window') {
      assert.ok(ts.isStringLiteral(node.argumentExpression), 'window access must be literal');
      globals.add(node.argumentExpression.text);
    }
    if (ts.isIdentifier(node)) assert.ok(!['globalThis', 'eval', 'Function'].includes(node.text), 'no boundary escape');
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual([...globals].filter(n => n !== 'KiwiTeamParts').sort(), part.globals, part.file + ': declared window reads only');
  assert.deepEqual([...paths].sort(), part.windowPaths, part.file + ': declared capability paths, including Kiwi private bridges');
  const window = {};
  vm.runInNewContext(source, { window });
  assert.deepEqual(Object.keys(window), ['KiwiTeamParts']);
  assert.ok(Object.isFrozen(window.KiwiTeamParts[part.name]));
  assert.deepEqual(Object.keys(window.KiwiTeamParts), [part.name]);
}
for (const file of map.files) assert.doesNotMatch(read(file), /window\.__kiwiTeamV2/, file + ': all shared state access goes through current()');
// Consumer changes only route existing bodies through named owner methods.
assert.match(read('assets/team/profile-ui.js'), /const memberState = window.Kiwi\?\.__teamMemberState/);
assert.match(read('assets/team-hours.js'), /const memberState = window.Kiwi\?\.__teamMemberState/);
const graph = dashboardDependencies(read('dashboard.html'));
const at = file => graph.indexOf('src="' + file + '?');
let startupTags = '';
vm.runInNewContext(read('assets/pages/dashboard-startup.js'), { document: { readyState: 'loading', write(tags) { startupTags += tags; } } });
assert.match(startupTags, /<script type="module" src="assets\/team\.js\?v=\d+" defer/, 'entry is a parser-ordered module');
for (const part of map.parts) {
  assert.ok(at(part.file) === -1, part.file + ': no new script element');
  assert.ok(read('assets/team.js').includes("import {} from './" + part.file.replace('assets/', '') + '?v='), part.file + ': static dependency before entry body');
  assert.ok(read('kiwi-sw.js').includes("'/" + part.file + '?v='), part.file + ': offline shell');
  assert.ok(require('./stamps.js').scan().get(part.file)?.sites.some(site => site.kind === 'module' && site.file === 'assets/team.js'), part.file + ': import stamp discovery');
}
for (const [file, count] of Object.entries(map.scriptsBefore)) assert.equal((read(file).match(/<script\b[^>]*\bsrc=/gi) || []).length, count, file + ': script count unchanged');
console.log('✓ team owners: byte-exact live reconstruction, body hashes, declared window boundaries, consumer routing, ordered loading, offline stamps and shell counts');
