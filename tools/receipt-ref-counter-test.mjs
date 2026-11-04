/* Receipt numbers stay distinct when the till's storage refuses writes (full or
   private mode). Before, every ticket of the session was numbered -0001. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/receipt.js', 'utf8');
function boot(refuse) {
  const data = new Map();
  const localStorage = {
    get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { if (refuse) throw new Error('quota'); data.set(k, String(v)); },
    removeItem: (k) => data.delete(k),
  };
  const window = { localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  window.window = window;
  const document = { readyState: 'complete', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, documentElement: { lang: 'fr', getAttribute: () => null } };
  const ctx = vm.createContext({ window, document, localStorage, navigator: { userAgent: 'node' }, console, setTimeout, clearTimeout, Date, Math, JSON, Intl });
  vm.runInContext(source, ctx, { filename: 'receipt.js' });
  assert.equal(typeof window.KiwiReceipt?.nextRef, 'function', 'receipt.js exposes nextRef');
  return window.KiwiReceipt;
}
const at = new Date(2026, 10, 4, 12, 0, 0);
for (const refuse of [false, true]) {
  const R = boot(refuse);
  const refs = [R.nextRef('venue-a', at), R.nextRef('venue-a', at), R.nextRef('venue-a', at)];
  const seq = refs.map((r) => r.split('-')[1]);
  assert.deepEqual(seq, ['0001', '0002', '0003'], (refuse ? 'storage refused' : 'storage ok') + ': consecutive numbers, never all -0001');
}
console.log('✓ receipt ref counter: distinct consecutive numbers with and without storage');
