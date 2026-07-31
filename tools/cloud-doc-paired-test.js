#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'cloud-doc.js'), 'utf8');
let pass = 0;
const fail = [];
const ok = (name, value) => value ? pass++ : fail.push(name);

function load(paired) {
  const calls = [];
  const store = new Map();
  if (paired) store.set('kiwiPairedVenue', JSON.stringify(paired));
  const localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    key: (i) => Array.from(store.keys())[i],
    get length() { return store.size; },
  };
  const document = { visibilityState: 'visible', addEventListener() {} };
  const window = {
    document, localStorage,
    KiwiEnv: { isReal: () => false },
    KiwiCaissePairing: { pairedVenue: () => paired || null },
    addEventListener() {},
  };
  window.window = window;
  const ctx = {
    window, document, localStorage, console, JSON, Date, Math, Object, Array, String,
    setTimeout, clearTimeout,
    fetch: (url) => {
      calls.push(String(url));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ merchant: paired && paired.merchant, data: null, rev: 0 }) });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'cloud-doc.js' });
  return { cloud: window.KiwiCloudDoc, calls };
}

{
  const { cloud, calls } = load({ merchant: 'santos-store', name: 'Santos Store' });
  const h = cloud.attach({ feature: 'hours', read: () => ({}), write() {}, isEmpty: () => true });
  ok('la caisse appairée est reconnue comme appareil réel', h.enabled());
  h.bind();
  ok('elle demande les horaires du magasin appairé', calls.some((u) => u.includes('/api/store?feature=hours&merchant=santos-store')));
}

{
  const { cloud, calls } = load(null);
  const h = cloud.attach({ feature: 'hours', slug: () => 'santos-store', read: () => ({}), write() {} });
  ok('une démo non appairée reste hors du cloud', !h.enabled());
  h.bind();
  ok('une démo ne lit aucun document privé', calls.length === 0);
}

if (fail.length) {
  fail.forEach((name) => console.error('  ✗ ' + name));
  process.exit(1);
}
console.log(`  ✓ documents caisse appairée (${pass} contrôles : horaires partagés, démo isolée)`);
