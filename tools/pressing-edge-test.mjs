import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../assets/pressing-caisse.js', import.meta.url), 'utf8');
let registered = null;
const local = new Map();
const fixtureServices = ['sec', 'lavage', 'repassage', 'detache', 'retouche'].map((id) => ({ id, code: id.toUpperCase(), short: id, label: id }));
const fixtureIds = ['chemise', 'tshirt', 'pull', 'veste', 'costume', 'manteau', 'pantalon', 'jean', 'jupe', 'short', 'robe', 'robe_soiree', 'caftan', 'drap', 'housse', 'couverture', 'nappe', 'rideaux', 'tapis', 'veste_cuir', 'daim', 'doudoune', 'chaussures', 'baskets', 'babouches'];
const fixtureItems = fixtureIds.map((id) => ({
  id, label: id, cat: 'test', prices: { sec: 25, lavage: 18, repassage: 10, detache: 30, retouche: 35 },
  ...(id === 'costume' ? { variants: [{ id: '2p', prices: { sec: 25, repassage: 10 }, pieces: ['veste', 'pantalon'] }, { id: '3p', prices: { sec: 35, repassage: 15 }, pieces: ['veste', 'pantalon', 'gilet'] }] } : {}),
}));
const context = {
  console,
  setTimeout: () => 1,
  clearTimeout: () => {},
  requestAnimationFrame: () => 1,
  localStorage: {
    getItem: (key) => local.get(key) || null,
    setItem: (key, value) => local.set(key, String(value)),
    removeItem: (key) => local.delete(key),
  },
  navigator: { onLine: true },
  document: {},
  window: {
    addEventListener: () => {},
    KiwiPosDispatch: {
      register: (spec) => { registered = spec; },
      unlockById: () => {},
      lock: () => {},
    },
    KiwiPressingCatalog: {
      read: () => ({ services: fixtureServices, categories: [{ id: 'test', label: 'Test' }], items: fixtureItems }),
    },
  },
};
context.window.window = context.window;
context.window.localStorage = context.localStorage;
context.window.navigator = context.navigator;
context.window.document = context.document;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'pressing-caisse.js' });

assert.equal(registered?.id, 'pressing', 'pressing module still registers');
const rules = context.window.KiwiPressing.rules;
assert.ok(rules, 'operational rules are exposed for focused regression tests');

const validPhones = new Map([
  ['0612345678', '06 12 34 56 78'],
  ['06 12 34 56 78', '06 12 34 56 78'],
  ['+212 6 12 34 56 78', '06 12 34 56 78'],
  ['00212-7-12-34-56-78', '07 12 34 56 78'],
  ['212539334455', '05 39 33 44 55'],
  ['612345678', '06 12 34 56 78'],
]);
for (const [input, expected] of validPhones) {
  assert.equal(rules.normalizeMoroccanPhone(input), expected, `normalizes ${input}`);
}
for (const input of ['', '1234', '+33 6 12 34 56 78', '0812345678', '06ABC345678', '061234567890']) {
  assert.equal(rules.normalizeMoroccanPhone(input), '', `rejects ${input || 'empty phone'}`);
}
assert.equal(rules.whatsappPhone('+212 6 12 34 56 78'), '212612345678');

assert.equal(rules.validDeposit(10, 10), true, '10 MAD minimum is accepted');
assert.equal(rules.validDeposit(10, 100), true);
assert.equal(rules.validDeposit(100, 100), true, 'deposit may equal total');
assert.equal(rules.validDeposit(9, 100), false, 'deposit below 10 is rejected');
assert.equal(rules.validDeposit(101, 100), false, 'deposit above total is rejected');
assert.equal(rules.validDeposit(Number.NaN, 100), false);

assert.equal(rules.maxQty, 99);
assert.equal(rules.clampQty(1000000), 99, 'extreme quantity is capped');
assert.equal(rules.clampQty(-4), 1, 'negative quantity is repaired');
assert.equal(rules.clampQty(7.9), 7, 'quantity is integral');

const now = Date.now();
assert.equal(rules.validReady(new Date(now + 60000), now), true);
assert.equal(rules.validReady(new Date(now - 1), now), false, 'past promise is rejected');
assert.equal(rules.validReady(new Date('invalid'), now), false);

assert.equal(rules.findScannedOrder('P-1037')?.id, 'P-1037', 'order barcode resolves exact order');
assert.equal(rules.findScannedOrder('*p-1037-1*')?.id, 'P-1037', 'garment barcode resolves its order');
assert.equal(rules.findScannedOrder('unknown'), null, 'unknown scan never selects a fallback order');
const code39 = rules.barcode('P-1037-1', 22);
assert.match(code39, /^<svg /);
assert.ok((code39.match(/<rect /g) || []).length > 20, 'label contains real Code 39 bars');

assert.match(source, /const paymentCommits = new Set\(\)/, 'payment commits have a shared idempotency guard');
assert.match(source, /if \(committed \|\| paymentCommits\.has\(commitKey\)\) return false/, 'rapid duplicate commits are refused atomically');
assert.match(source, /try \{\s*authorization = hw\.authorizeCard/, 'synchronous reader failures are handled without leaving payment pending');
assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/, 'scanner uses real camera capability detection');
assert.match(source, /new window\.BarcodeDetector/, 'scanner uses BarcodeDetector when supported');
assert.doesNotMatch(source, /state\.offline\s*=\s*!state\.offline/, 'network status cannot be manually faked');
assert.doesNotMatch(source, /action.*synchronis[ée]/i, 'UI does not claim unconfirmed synchronization success');

console.log(`✓ pressing edges (${validPhones.size + 31} controls)`);
