import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const venueStoreSource = fs.readFileSync(new URL('../assets/venue-store.js', import.meta.url), 'utf8');
const verticalSource = fs.readFileSync(new URL('../assets/vertical-state.js', import.meta.url), 'utf8');
const dispatchSource = fs.readFileSync(new URL('../assets/pos-dispatch.js', import.meta.url), 'utf8');

function events() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn); listeners.set(name, rows);
    },
    dispatch(name, detail) {
      for (const fn of listeners.get(name) || []) fn({ type: name, detail });
    },
  };
}

function storage(initial = []) {
  const rows = new Map(initial);
  return {
    rows,
    api: {
      getItem: (key) => rows.has(key) ? rows.get(key) : null,
      setItem: (key, value) => rows.set(key, String(value)),
      removeItem: (key) => rows.delete(key),
      key: (i) => Array.from(rows.keys())[i] || null,
      get length() { return rows.size; },
    },
  };
}

function verticalRuntime(local) {
  const winEvents = events();
  const docEvents = events();
  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    addEventListener: docEvents.addEventListener,
  };
  const window = { addEventListener: winEvents.addEventListener };
  const context = {
    console,
    Map, Set,
    setTimeout: () => 1,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: local.api,
    document,
    window,
  };
  window.window = window;
  window.localStorage = local.api;
  window.document = document;
  vm.createContext(context);
  /* This is deliberately the production venue store, with KiwiVenue absent —
   * exactly the specialist-caisse load graph that the old stub test missed. */
  vm.runInContext(venueStoreSource, context, { filename: 'venue-store.js' });
  vm.runInContext(verticalSource, context, { filename: 'vertical-state.js' });
  return { context, pair: (detail) => docEvents.dispatch('kiwi-paired', detail) };
}

function register(runtime, stateRef) {
  return runtime.context.window.KiwiVerticalState.register({
    vertical: 'pressing',
    snapshot: () => stateRef.value,
    restore: (saved) => { stateRef.value = saved; },
  });
}

const local = storage([['kiwiPairedVenue', JSON.stringify({ merchant: 'pressing-amira', venueId: 'device-only-id' })]]);
const first = verticalRuntime(local);
assert.equal(first.context.window.KiwiStore.currentVenue(), null, 'specialist caisse has no implicit KiwiVenue');
const firstState = { value: { orders: [], seq: 0 } };
const firstHandle = register(first, firstState);
assert.equal(firstHandle.venue(), 'pressing-amira', 'paired merchant slug is the explicit venue key');
assert.equal(firstHandle.hydrate(), false, 'new paired merchant starts empty');
firstState.value.orders.push({ id: 'P-1' });
firstState.value.seq = 4;
assert.equal(firstHandle.save('new order'), true, 'actual venue store persists a domain change');
assert.equal(firstHandle.save('same state'), false, 'unchanged snapshots are deduplicated');
const amiraKey = 'kiwi:verticalops:v1:pressing-amira';
assert.ok(local.rows.has(amiraKey), 'write is materialised under the paired merchant, without KiwiVenue');
assert.equal(JSON.parse(local.rows.get(amiraKey)).verticals.pressing.data.orders[0].id, 'P-1');

/* A brand-new JS realm models a hard reload, while retaining browser storage. */
const reload = verticalRuntime(local);
const reloadState = { value: { orders: [], seq: 0 } };
const reloadHandle = register(reload, reloadState);
assert.equal(reloadHandle.hydrate(), true, 'saved specialist state hydrates after reload');
assert.equal(reloadState.value.orders[0].id, 'P-1');
assert.equal(reloadState.value.seq, 4);

/* Same-tab merchant changes must discard A before reading B, and keep the two
 * documents physically separate even when the vertical id is the same. */
local.api.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'pressing-bahia', venueId: 'other-device-id' }));
reload.pair({ merchant: 'pressing-bahia', venueId: 'other-device-id' });
assert.equal(reloadHandle.venue(), 'pressing-bahia');
assert.equal(reloadState.value.orders.length, 0, 'new tenant cannot inherit the previous tenant snapshot');
reloadState.value.orders.push({ id: 'B-1' });
assert.equal(reloadHandle.save('tenant-b-order'), true);
const bahiaKey = 'kiwi:verticalops:v1:pressing-bahia';
assert.equal(JSON.parse(local.rows.get(bahiaKey)).verticals.pressing.data.orders[0].id, 'B-1');
assert.equal(JSON.parse(local.rows.get(amiraKey)).verticals.pressing.data.orders[0].id, 'P-1', 'tenant A remains untouched');

local.api.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'pressing-amira', venueId: 'device-only-id' }));
reload.pair({ merchant: 'pressing-amira', venueId: 'device-only-id' });
assert.equal(reloadState.value.orders[0].id, 'P-1', 'switching back hydrates tenant A, not tenant B');

function dispatchRuntime(initialMerchant) {
  const docEvents = events();
  const localDispatch = storage(initialMerchant
    ? [['kiwiPairedVenue', JSON.stringify({ merchant: initialMerchant })]]
    : []);
  let reloads = 0;
  const document = { readyState: 'loading', addEventListener: docEvents.addEventListener };
  const window = {
    location: { reload: () => { reloads++; } },
    addEventListener: () => {},
  };
  const context = { console, localStorage: localDispatch.api, document, window, setTimeout: () => 1 };
  window.window = window; window.document = document; window.localStorage = localDispatch.api;
  vm.createContext(context);
  vm.runInContext(dispatchSource, context, { filename: 'pos-dispatch.js' });
  return { pair: (detail) => docEvents.dispatch('kiwi-paired', detail), reloads: () => reloads };
}

const switched = dispatchRuntime('pressing-amira');
switched.pair({ merchant: 'pressing-bahia' });
assert.equal(switched.reloads(), 1, 'same-tab merchant switch restarts long-lived vertical closures');
const same = dispatchRuntime('pressing-amira');
same.pair({ merchant: 'pressing-amira' });
assert.equal(same.reloads(), 0, 'same-merchant pairing does not reload');
const fresh = dispatchRuntime('');
fresh.pair({ merchant: 'pressing-amira' });
assert.equal(fresh.reloads(), 0, 'first pairing does not reload');

const verticalFiles = [
  'pressing-caisse.js', 'pos-spa.js', 'pos-hotel.js', 'pos-fastfood.js',
  'pos-boulangerie.js', 'pos-pizzeria.js', 'pos-traiteur.js', 'pos-foodtruck.js',
  'pos-epicerie.js', 'pos-pharmacie.js', 'pos-librairie.js', 'pos-fleuriste.js',
  'pos-coiffure.js', 'pos-gym.js',
];
for (const file of verticalFiles) {
  const body = fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), 'utf8');
  assert.match(body, /KiwiVerticalState/, `${file} registers durable operational state`);
  assert.match(body, /\.hydrate(?:\?\.)?\(\)/, `${file} hydrates before rendering`);
  assert.match(body, /\.save(?:\?\.)?\(/, `${file} persists operational changes`);
}

console.log(`✓ vertical state (${verticalFiles.length + 20} controls)`);
