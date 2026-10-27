/* C1-stock: strict live reconstruction, explicit factory boundaries and owner behaviour. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import source from './stock-controller-test-source.cjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const read = f => fs.readFileSync(f, 'utf8');
const map = JSON.parse(read('tools/fixtures/stock-controller/split.json'));
const hash = s => createHash('sha256').update(s).digest('hex');
for (const [file, fixture] of Object.entries(map.files)) {
  const original = gunzipSync(fs.readFileSync(fixture.fixture)).toString();
  assert.equal(hash(original), fixture.sha256, file + ': frozen original hash');
  assert.equal(source(file), original, file + ': reconstructed byte for byte from live files');
}
const platform = new Set(['window', 'document', 'localStorage', 'console', 'Date', 'Math', 'Object', 'Array', 'String', 'Number', 'Set', 'Map', 'JSON', 'Promise', 'Error', 'Uint8Array', 'TextEncoder', 'fetch', 'encodeURIComponent', 'requestAnimationFrame', 'Boolean', 'CustomEvent']);
for (const part of map.parts) {
  const text = read(part.file);
  assert.ok(text.startsWith(part.prefix) && text.endsWith(part.suffix), part.file + ': explicit wrapper');
  const globals = [...new Set([...text.matchAll(/window\.([\w$]+)/g)].map(m => m[1]))].sort();
  assert.deepEqual(globals, part.globals, part.file + ': declared window services only');
  assert.ok(!/window\s*\[|globalThis|\beval\s*\(|\bFunction\s*\(/.test(text), 'no indirect access to sibling state');
  const program = ts.createProgram([part.file], { allowJs: true, noResolve: true, noLib: true });
  const ast = program.getSourceFile(part.file), checker = program.getTypeChecker();
  function visit(node) {
    if (ts.isIdentifier(node) && !checker.getSymbolAtLocation(node)) {
      const parent = node.parent;
      const property = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node);
      if (!property) assert.ok(platform.has(node.text), part.file + ': undeclared dependency ' + node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (part.group !== 'state') {
    assert.match(text, new RegExp('const \\{ ' + part.deps.join(', ') + ' \\} = S;'));
    assert.ok(!/\bS\s*(?:\.|\[)/.test(text), 'UI module cannot inspect the shared bridge beyond its declared imports');
  }
}
// Legacy factories retain their declared adapters; no sibling namespace can leak in.
for (const [file, boundary] of Object.entries(map.legacyBoundaries)) {
  const text = read(file);
  assert.deepEqual([...new Set([...text.matchAll(/window\.([\w$]+)/g)].map(m => m[1]))].sort(), boundary.globals, file + ': declared browser services');
  assert.deepEqual([...new Set([...text.matchAll(/\bS\.([\w$]+)/g)].map(m => m[1]))].sort(), boundary.state, file + ': declared live state adapters');
  assert.ok(!/window\s*\[|globalThis|\bS\s*\[/.test(text), file + ': no indirect sibling access');
}
const graph = dashboardDependencies(read('dashboard.html'));
assert.ok(graph.indexOf('assets/stock/state.js?') < graph.indexOf('assets/stock.js?'), 'owner factory available before recipe entry points');
for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'booking.html']) {
  assert.ok(!/<script\b[^>]*src=["']assets\/stock\/(?:state|overview|alerts|movements)\.js/.test(read(shell)), shell + ': no new script tags');
}
const stamps = require('./stamps.js').scan();
for (const part of map.parts) {
  assert.ok(stamps.has(part.file), part.file + ': stamp discoverable');
  assert.ok(read('kiwi-sw.js').includes('/' + part.file + '?v='), part.file + ': offline shell');
}
// Owner methods preserve demo arithmetic and use the existing real ledger paths.
for (const real of [false, true]) {
  const writes = [], window = { KiwiInventory: { isReal: () => real, ensureOpening() {}, balance: () => 12, add: payload => { writes.push(payload); return payload; } } };
  vm.runInNewContext(read('assets/stock/state.js'), { window, Date, Math, Object, Array, String, Number, TextEncoder, fetch: async () => ({ json: async () => ({ counts: [{ id: 'server-count' }] }) }) });
  let owner;
  owner = window.KiwiStockState(() => ({ currentStockFor: item => owner.ledgerOpeningFor(item), retailCatalog: () => null, stShowReal: () => real, stockLocationId: () => 'principal', stockUnitId: () => 'unit', retailSetProductStock() {} }));
  const item = { id: 'flour', currentStock: 10, costPerUnit: 4 };
  owner.moveStock(item, 2, 'receipt', 'receipt', 'r1');
  assert.equal(owner.ledgerOpeningFor(item), 12);
  assert.equal(owner.countStock(item, 9, 'count1'), -3);
  if (real) {
    assert.equal(writes.length, 2);
    assert.equal(writes[0].reason, 'receipt');
    assert.equal(writes[1].refType, 'count');
  } else assert.equal(owner.ledgerOpeningFor(item), 9);
  owner.replaceCounts([{ id: 'c1' }]); owner.markCountsFetched(123);
  assert.equal(owner.counts()[0].id, 'c1'); assert.equal(owner.countsFetchedAt(), 123);
  const countBridge = {
    get stCountsCache() { return owner.counts(); }, set stCountsCache(value) { owner.replaceCounts(value); },
    get stCountsLastFetched() { return owner.countsFetchedAt(); }, set stCountsLastFetched(value) { owner.markCountsFetched(value); },
  };
  await owner.fetchServerCounts(countBridge, {})();
  assert.equal(owner.counts()[0].id, 'server-count');
  assert.ok(owner.countsFetchedAt() > 123);
  const receiptHelpers = {
    stIntakePostingCanonical: value => value,
    stIntakePostingLines: value => value.lines,
    stIntakePostingIds: async () => ({ receiptId: 'r1', invoiceId: 'i1', movementIds: ['m1'] }),
    stIntakePrepare: async () => true, stSha256Hex: async () => 'hash',
    stIntakeSupplierId: () => 'supplier',
  };
  const receipt = owner.stIntakePostAll({}, receiptHelpers);
  await assert.rejects(receipt({}), /intake-doc-required/);
  window.KiwiInventory.merchant = () => 'fixture-merchant';
  window.KiwiInventory.sync = async () => true;
  const posted = await receipt({ docId: 'doc1', receivedAt: 100, issuedAt: 100, lines: [{ itemId: 'flour', qty: 2, unitCost: 4 }] });
  assert.equal(posted.receiptId, 'r1');
  assert.equal(writes.at(-1).id, 'm1');
  window.KiwiInventory.sync = async () => false;
  await assert.rejects(receipt({ docId: 'doc1', lines: [{ itemId: 'flour', qty: 2 }] }), /intake-movement-sync-required/);
  assert.ok(Object.isFrozen(owner));
}
console.log('✓ C1 stock: four originals rebuilt byte for byte; module boundaries, load order, offline shell and real/demo owner methods');
