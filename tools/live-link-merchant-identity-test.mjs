#!/usr/bin/env node
import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
import vm from 'node:vm';

const asset = name => fs.readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
function harness({ real = true, search = '', slug = 'matrix-real', name = 'Matrix Kitchen', custom = true } = {}) {
  const data = new Map([['kiwiLiveMerchant', slug]]);
  const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  const venue = { id: 'v-' + slug, slug, name, custom };
  const window = {
    KiwiEnv: { isReal: () => real }, KiwiMe: { business: 'Account Business' },
    KiwiVenue: { isCustom: () => custom, getCurrentVenueData: () => venue, slugOf: () => venue.slug },
    addEventListener() {}, dispatchEvent() {},
  };
  const document = { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => [], querySelector: () => null };
  const requests = [];
  const ctx = vm.createContext({ window, document, localStorage, location: { search, pathname: '/dashboard.html' },
    URLSearchParams, CustomEvent: function () {}, console, setTimeout: () => 1, clearTimeout() {},
    fetch: url => new Promise(resolve => requests.push({ url, resolve })) });
  vm.runInContext(asset('merchant-config.js'), ctx);
  vm.runInContext(asset('live-link.js'), ctx);
  return { window, data, venue, requests };
}

for (const [slug, name] of [['matrix-real', 'Matrix Kitchen'], ['second-store', 'Établissement rénové'], ['shop-arabic-id', 'مطعم']]) {
  const h = harness({ slug, name });
  const loading = h.window.KiwiConfig.reload();
  assert.equal(h.requests[0].url, '/api/config?merchant=' + slug);
  assert.equal(h.window.KiwiLive.merchant(), slug, 'live feed must use canonical venue identity');
  assert.equal(h.data.get('kiwiLiveMerchant'), slug, 'pin must survive display-name changes');
  h.requests[0].resolve({ ok: true, json: async () => ({ features: { stock: false }, pins: [{ name: 'Test Owner', role: 'owner' }], plan: 'pro' }) });
  assert.equal(await loading, true);
  assert.equal(h.window.KiwiConfig.loaded, true);
  assert.equal(h.window.KiwiConfig.features.stock, false);
  assert.equal(h.window.KiwiConfig.pins.length, 1);
  assert.equal(h.window.KiwiConfig.plan, 'pro');
}
const scoped = harness({ search: '?merchant=operator-client' });
assert.equal(scoped.window.KiwiLive.merchant(), 'operator-client');
assert.equal(scoped.data.get('kiwiLiveMerchant'), 'matrix-real');
scoped.window.KiwiLive.confirmScope('operator-client');
assert.equal(scoped.data.get('kiwiLiveMerchant'), 'operator-client');
const demo = harness({ real: false, custom: false });
demo.window.KiwiMe = null;
assert.equal(demo.window.KiwiLive.merchant(), 'matrix-real');
demo.data.delete('kiwiLiveMerchant');
assert.equal(demo.window.KiwiLive.merchant(), 'cafe-atlas');
console.log('✓ live-link merchant identity: canonical pins, config boot, demo and operator scope');
