#!/usr/bin/env node
/* Execute the real entry router, not a copied predicate. A fresh local demo
 * must keep its trade-selection keypad; a real unpaired account must not
 * silently open the restaurant underneath the pairing gate. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');

async function entry({ demosAllowed, real, paired = false }) {
  const nodes = new Map();
  const callbacks = new Map();
  const values = new Map();
  const calls = { restaurant: 0, boutique: 0, config: 0, reset: 0 };
  const venue = { merchant: 'entry-boutique-fixture', type: 'boutique', name: 'Boutique fixture' };
  if (paired) {
    values.set('kiwiPaired', '1');
    values.set('kiwiPairedVenue', JSON.stringify(venue));
  }
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  function node() {
    return { style: {}, classList: { add() {}, remove() {} },
      setAttribute() {}, innerHTML: '', textContent: '', id: '' };
  }
  const document = {
    readyState: 'loading',
    addEventListener: (name, callback) => callbacks.set(name, callback),
    getElementById: id => nodes.get(id) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: node,
    body: { appendChild: el => nodes.set(el.id, el) },
    head: { appendChild: el => nodes.set(el.id, el) },
  };
  nodes.set('pin-screen', node());
  const window = {
    KiwiEnv: { demosAllowed, isReal: () => typeof real === 'function' ? real() : real },
    KiwiPosDispatch: {
      registry: { fixture: { id: 'boutique' } },
      unlockById(id) { assert.equal(id, 'boutique'); calls.boutique++; },
    },
    __kiwiUnlockApp() { calls.restaurant++; },
    __kiwiPinReset() { calls.reset++; },
    KiwiReportError(error) { throw error; },
  };
  window.window = window;
  const context = vm.createContext({
    window, document, localStorage: storage, sessionStorage: storage,
    location: { search: '', pathname: '/kiwi-caisse.html' },
    navigator: { onLine: true },
    fetch: async url => {
      assert.match(url, /^\/api\/config\?/);
      calls.config++;
      return Response.json({ pins: [], pinGateConfigured: true });
    },
    AbortController, Response, URLSearchParams, Promise, JSON, Date, Math,
    String, Number, Boolean, Object, Array, Error, setTimeout, clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'assets/caisse-pairing.js' });
  callbacks.get('DOMContentLoaded')();
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, calls, window };
}

const demo = await entry({ demosAllowed: true, real: false });
assert.equal(demo.calls.restaurant, 0, 'fresh local demo preserves the trade-selection PIN screen');
assert.equal(demo.nodes.get('pin-screen').style.display, undefined);
assert.equal(demo.nodes.has('cp-screen'), false, 'a demo has no unsatisfiable production pairing gate');

for (const demosAllowed of [false, true]) {
  const actual = await entry({ demosAllowed, real: true });
  assert.equal(actual.calls.restaurant, 0, 'real unpaired entry never auto-opens the restaurant');
  assert.ok(actual.nodes.has('cp-screen'), 'hosted and native real-account entries require pairing');
  assert.match(actual.nodes.get('cp-screen').innerHTML, /Appairer cette caisse/);
}

for (const demosAllowed of [false, true]) {
  const actual = await entry({ demosAllowed, real: true, paired: true });
  assert.equal(actual.calls.config, 1, 'paired entry checks the bound merchant staff configuration');
  assert.equal(actual.calls.restaurant + actual.calls.boutique, 0, 'configured staff gate remains locked');
  assert.ok(actual.nodes.has('cp-pin-screen'), 'the same staff pad protects a hosted or native pairing');
  assert.equal(actual.nodes.has('cp-screen'), false, 'an existing pairing is not discarded');
}

const uncertain = await entry({ demosAllowed: true, real: () => { throw new Error('identity unavailable'); } });
assert.ok(uncertain.nodes.has('cp-screen'), 'an unreadable identity fails closed at the pairing gate');
assert.equal(uncertain.calls.restaurant, 0);

console.log('Caisse entry routing: local trade selection and real pairing/staff gates verified.');
