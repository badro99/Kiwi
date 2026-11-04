import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { idb, settle } from './fixtures/resilience-idb.mjs';
const source = fs.readFileSync('assets/venues/helpers.js', 'utf8');
const disk = new Map();
process.on('unhandledRejection', error => { assert.match(error.message, /^kiwi-ledger-storage-refused:/); });
function boot(refuse = false) {
  const window = { indexedDB: idb(disk, refuse) };
  const localStorage = { getItem: () => null, setItem() { throw new Error('quota'); } };
  vm.runInNewContext(source, { window, localStorage });
  const cache = window.__kiwiVenueParts.cache({ salesSubs: new Set() });
  return cache;
}
const key = 'kiwiSales:scoped@synthetic-a', other = 'kiwiSales:scoped@synthetic-b';
const a = boot(); await a.ledgerReady;
a.ledgerWrite(key, [{ cursor: 1, amount: 12.34 }]); await settle();
assert.ok(disk.has(key), 'refused ledger is written to durable IDB');
assert.equal(a.ledgerFreshness.get(key).saved, true, 'IDB transaction accepts refused localStorage write');
const b = boot(); await b.ledgerReady;
assert.equal(b.cachedLedger(key)[0].amount, 12.34, 'boot restores ledger exactly to the centime');
assert.equal(b.cachedLedger(other).length, 0, 'another tenant never reads this ledger');
const c = boot(true); await c.ledgerReady;
c.ledgerWrite(key, [{ cursor: 2, amount: 4.56 }]); await settle();
assert.equal(c.ledgerFreshness.get(key).saved, false, 'neither store accepted this write');
assert.equal(c.cachedLedger(key)[0].amount, 4.56, 'unsaved rows remain available this session');
console.log('PASS ledger IDB fallback, reload, tenant isolation and freshness');
const uiSource = fs.readFileSync('assets/dashboard-ledger-state.js', 'utf8');
for (const [lang, label] of [['fr', 'Données locales non enregistrées'], ['en', 'Local data not saved'], ['ar', 'البيانات المحلية غير محفوظة']]) {
  let state = { saved: false, pending: false }, paint, node;
  const window = { KiwiSales: { freshness: () => state, subscribe(fn) { paint = fn; } }, KiwiVenue: { getVenue: () => 'synthetic', subscribe() {} }, addEventListener() {} };
  const document = { documentElement: { lang }, querySelector: () => ({ appendChild(el) { node = el; } }), getElementById: () => node, createElement: () => ({ setAttribute() {}, remove() { node = null; } }) };
  vm.runInNewContext(uiSource, { window, document });
  assert.equal(node.textContent, label, 'home KPI notice uses the surface language');
  state = { saved: true, pending: false }; paint(); assert.equal(node, null);
}
console.log('PASS home KPI unsaved notice FR/EN/AR and recovery removal');
