/* MOVE proof: reconstruct the frozen controller from every live production byte. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import owners from './team-owners-test-source.cjs';
import sourceHelper from './planning-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/planning/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/planning/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(sourceHelper.planningTestSource(), original, 'all live bytes rebuild the original');
for (const p of map.parts) {
  let expected = p.prefix;
  for (const f of p.fragments) {
    assert.equal(f.offset, expected.length);
    expected += original.slice(f.start, f.end) + '\n';
  }
  assert.equal(read(p.file), expected + p.suffix, p.file + ': entire moved blocks unchanged');
  const mod = await import('../' + p.file);
  assert.deepEqual(Object.keys(mod), [p.create]);
}
// Explicit window capabilities: a sibling modal or new global cannot be reached
// by adding an undeclared property access, alias, computed access or globalThis.
for (const p of map.parts) {
  const ast = ts.createSourceFile(p.file, read(p.file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const seen = new Set();
  function visit(n) {
    if (ts.isIdentifier(n) && ['window', 'globalThis', 'self'].includes(n.text)) {
      assert.equal(n.text, 'window', p.name + ': use only declared window capabilities');
      assert.ok(ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n, p.name + ': no window alias or computed escape');
      assert.ok(p.windows.includes(n.parent.name.text), p.name + ': undeclared window.' + n.parent.name.text);
      seen.add(n.parent.name.text);
    }
    if (ts.isCallExpression(n)) assert.ok(!['eval', 'Function'].includes(n.expression.getText(ast)), 'no dynamic scope escape');
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.deepEqual([...seen].sort(), p.windows);
  const factory = ast.statements.find(ts.isFunctionDeclaration);
  assert.deepEqual(factory.parameters[0].name.elements.map(e => e.name.text), p.deps, 'explicit injected interface');
  assert.equal(ast.statements.length, 1, 'one factory, no sibling state at module scope');
}
// A bare global identifier must not bypass the window capability list.
const program = ts.createProgram(map.parts.map(p => p.file), { allowJs: true, checkJs: true, noLib: true, noResolve: true });
const ambient = new Set(['Math', 'Number', 'window', 'Array', 'Date', 'JSON', 'Error', 'Object', 'String', 'NaN', 'isNaN', 'setTimeout', 'parseFloat', 'matchMedia', 'Boolean', 'document', 'Map', 'Set']);
for (const d of ts.getPreEmitDiagnostics(program).filter(d => [2304, 2552, 2583, 2584].includes(d.code))) {
  const name = d.file.text.slice(d.start, d.start + d.length);
  assert.ok(ambient.has(name), d.file.fileName + ': undeclared ambient read ' + name);
}
const graph = dashboardDependencies.eager(read('dashboard.html'));
let startupTags = '';
vm.runInNewContext(read('assets/pages/dashboard-startup.js'), { document: { readyState: 'loading', write: tags => { startupTags = tags; } } });
assert.match(startupTags, /<script type="module" src="assets\/team-hours.js\?v=\d+" defer/);
for (const p of map.parts) {
  assert.ok(!graph.includes('src="' + p.file), 'pieces loaded only through entry imports');
  assert.ok(read('kiwi-sw.js').includes('/' + p.file + '?v='), 'offline shell includes piece');
  const sites = require('./stamps.js').scan().get(p.file);
  assert.ok(sites.sites.some(s => s.kind === 'module' && s.file === 'assets/team-hours.js'), 'entry import is stamp-discoverable');
  assert.equal(sites.stamps.size, 1, 'import and offline stamp agree');
}
// Run the live factories in the same dashboard harness as the existing split.
const suite = read('tools/team-split-test.mjs');
const harness = suite.slice(suite.indexOf('function realm('), suite.indexOf("\nfor (const lang of ['fr'"));
const realm = vm.runInNewContext('(' + harness + ')', { vm, console });
const team = read('assets/team/catalog.js') + '\n' + owners.runtimeSource(false);
for (const lang of ['fr', 'en', 'ar']) {
  const a = realm(team + '\n' + original, lang);
  const b = realm(team + '\n' + sourceHelper.planningRuntimeSource(), lang);
  assert.deepEqual([...b.events].sort(), [...a.events].sort(), 'same input/touch listeners');
  assert.deepEqual(Object.keys(b.context.Kiwi.handlers).sort(), Object.keys(a.context.Kiwi.handlers).sort());
  assert.deepEqual(Object.keys(b.context.Kiwi.__teamCore.hours), Object.keys(a.context.Kiwi.__teamCore.hours));
  for (const r of [a,b]) r.context.Kiwi.handlers['nav-equipe']();
  assert.equal(b.root.innerHTML, a.root.innerHTML);
  for (const r of [a,b]) {
    const core = r.context.Kiwi.__teamCore;
    const members = core.getMembers('boutique');
    r.markup = core.hours.renderPayrollBody(core.t(), r.venue, 'boutique', members);
  }
  assert.equal(b.markup, a.markup, 'payroll and planning markup ' + lang);
  assert.equal(b.context.Kiwi.__teamCore.hours.isShiftPopOpen(), false);
}
console.log('✓ planning split: exact live reconstruction, factory boundaries, module loading and FR/EN/AR runtime parity');
