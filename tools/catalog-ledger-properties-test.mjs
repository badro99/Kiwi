#!/usr/bin/env node
// Propriété inter-surfaces : vrais handlers D1/SQLite et scripts navigateur livrés.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import * as catalog from '../functions/api/catalog.js';
import * as movements from '../functions/api/inventory/movements.js';
import * as counts from '../functions/api/inventory/counts.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const ROOT = new URL('../', import.meta.url).pathname;
const fc = createRequire(ROOT + 'app/package.json')('fast-check');
const runs = Number(process.env.KIWI_PROPERTY_RUNS) || 100;
const seed = Number(process.env.KIWI_PROPERTY_SEED) || 20261026;
const f = await fixture(ROOT);
const cookie = SESS_COOKIE + '=' + await makeSession('money-owner', f.env.AUTH_SECRET);
const clone = value => JSON.parse(JSON.stringify(value));
async function call(route, method, body = {}, raw = false) {
  const url = new URL('https://kiwi.test/api/' + route);
  if (method === 'GET') for (const [key, value] of Object.entries({ merchant: f.merchant, ...body })) url.searchParams.set(key, value);
  const handler = { catalog, movements, counts }[route]['onRequest' + (method === 'GET' ? 'Get' : 'Post')];
  const response = await handler({ env: f.env, waitUntil() {}, request: new Request(url, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ merchant: f.merchant, ...body }) } : {}),
  }) });
  if (raw) return response;
  const data = await response.json();
  assert.equal(response.status, 200, route + ': ' + JSON.stringify(data));
  return data;
}
function browser() {
  const memory = new Map(), timers = new Map(), requests = new Set();
  let timer = 0;
  const localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const w = { localStorage, console, crypto: globalThis.crypto,
    navigator: { onLine: true }, KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => f.merchant },
    document: { readyState: 'complete', visibilityState: 'visible', addEventListener() {}, dispatchEvent() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: el(), body: el() },
    addEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); }, setInterval() {},
    async fetch(input, options = {}) {
      if (!w.navigator.onLine) throw Error('hors ligne');
      const url = new URL(input, 'https://kiwi.test');
      const route = url.pathname.endsWith('/catalog') ? 'catalog' : 'movements';
      const method = options.method || 'GET';
      const body = method === 'POST' ? JSON.parse(options.body) : Object.fromEntries(url.searchParams);
      return call(route, method, body, true);
    },
  };
  const fetchRoute = w.fetch;
  w.fetch = (...args) => {
    const pending = fetchRoute(...args); requests.add(pending);
    pending.then(() => requests.delete(pending), () => requests.delete(pending));
    return pending;
  };
  w.window = w; w.self = w;
  vm.createContext(w);
  for (const file of ['color-palette', 'boutique-catalog-parts', 'boutique-catalog', 'inventory-ledger']) {
    vm.runInContext(fs.readFileSync(ROOT + 'assets/' + file + '.js', 'utf8'), w, { filename: file + '.js' });
  }
  // Exécuter les tâches planifiées, y compris les promesses des handlers réels.
  async function drain() {
    for (let i = 0; i < 50; i++) {
      const pending = [...timers.values()]; timers.clear();
      pending.forEach(fn => fn());
      await Promise.allSettled([...requests]);
      await new Promise(resolve => setImmediate(resolve));
      if (!timers.size) {
        await new Promise(resolve => setImmediate(resolve));
        if (!timers.size) return;
      }
    }
    throw Error('La synchronisation ne termine pas');
  }
  w.KiwiBoutiqueCatalog.use(f.merchant);
  return { C: w.KiwiBoutiqueCatalog, I: w.KiwiInventory, w, drain };
}
const kinds = ['sale', 'return', 'manual', 'count', 'receipt', 'delete-restore', 'replay'];
const operation = fc.record({ kind: fc.constantFrom(...kinds), surface: fc.constantFrom('catalog', 'ledger'), product: fc.integer({ min: 0, max: 1 }), qty: fc.integer({ min: 1, max: 4 }) });
async function play(ops) {
  f.sql.exec('DELETE FROM catalogs; DELETE FROM inventory_movements; DELETE FROM inventory_counts; DELETE FROM inventory_count_events; DELETE FROM inventory_sync_sequences');
  const at = Date.now() - 10000;
  const doc = { v: 1, seq: 0, categories: [], removed: {}, moves: [],
    products: [0, 1].map(i => ({ id: 'p' + i, name: 'Article ' + i, priceMAD: 10, metaAt: at })),
    variants: [0, 1].map(i => ({ id: 'v' + i, productId: 'p' + i, colorId: 'noir', size: 'M', stock: 20, base: 20, baseAt: at, metaAt: at, barcodes: [] })),
  };
  await call('catalog', 'POST', { data: doc, baseRev: 0 });
  // Les deux livres commencent volontairement égaux : on teste les gestes,
  // pas l'absence d'import initial d'un ancien catalogue.
  await call('movements', 'POST', { movements: [0, 1].map(i => ({ id: 'opening-' + i, itemId: 'p' + i, variantId: 'v' + i, qty: 20, reason: 'opening', occurredTs: at })) });
  const a = browser(), b = browser();
  const devices = [a, b];
  async function sync() {
    for (let round = 0; round < 2; round++) for (const device of devices) {
      device.w.navigator.onLine = true;
      await device.C.sync(); await device.drain();
      await device.drain();
      const synced = await device.I.sync();
      assert.equal(synced, true, 'synchronisation registre ' + JSON.stringify(device.I.status()));
    }
  }
  async function agree(label) {
    const remote = await call('movements', 'GET', { summary: 1 });
    for (const device of devices) for (let i = 0; i < 2; i++) {
      const ledger = remote.balances.filter(row => row.itemId === 'p' + i).reduce((sum, row) => sum + row.qty, 0);
      assert.equal(device.I.balance('p' + i), ledger, label + ' : registre navigateur');
      assert.equal(device.C.productStock('p' + i), ledger, label + ' : catalogue p' + i);
    }
  }
  await sync(); await agree('état initial');
  let last = null;
  for (const [index, op] of ops.entries()) {
    const device = op.surface === 'catalog' ? a : b;
    const pid = 'p' + op.product, vid = 'v' + op.product;
    const available = Math.min(a.C.productStock(pid), b.I.balance(pid));
    const qty = Math.min(op.qty, Math.max(0, available));
    if (op.kind === 'count') {
      const id = 'count-' + index;
      await call('counts', 'POST', { action: 'submit', id, engine: op.surface === 'catalog' ? 'boutique' : 'ledger', lines: [{ itemId: pid, variantId: vid, countedQty: op.qty }] });
      await call('counts', 'POST', { action: 'review', id, decision: 'approved' });
    } else if (op.kind === 'delete-restore') {
      // Le produit propose la restauration d'une archive ; la suppression
      // définitive porte un tombstone et n'a pas de geste « restaurer ».
      device.C.archiveProduct(pid, true);
      await sync(); await agree('archivage ' + index);
      device.C.archiveProduct(pid, false);
    } else if (op.kind === 'replay' && last) {
      device.w.navigator.onLine = false;
      if (last.surface === 'catalog') {
        // Rejeu du même UUID, pas un deuxième clic générant un mouvement neuf.
        const server = await call('catalog', 'GET');
        await call('catalog', 'POST', { data: device.C._merge(clone(server.data), last.doc), baseRev: server.rev });
      } else {
        await call('movements', 'POST', { movements: [last.row] });
      }
    } else if (op.kind !== 'replay') {
      const delta = op.kind === 'sale' ? -qty : op.kind === 'manual' ? op.qty - 2 : op.qty;
      if (delta) {
        device.w.navigator.onLine = false;
        if (op.surface === 'catalog') {
          device.C.adjustStock(vid, delta, { sale: 'vente', return: 'retour', manual: 'ajust', receipt: 'reception' }[op.kind]);
          last = { surface: op.surface, doc: clone(device.C._doc()) };
        } else {
          const row = { id: 'move-' + index, itemId: pid, variantId: vid, qty: delta, reason: { sale: 'sale', return: 'return', manual: 'manual', receipt: 'receipt' }[op.kind], occurredTs: Date.now() };
          device.I.add(row); last = { surface: op.surface, row };
        }
      }
    }
    await sync();
    await agree('étape ' + index + ' ' + JSON.stringify(op));
  }
}
let failed = 0;
try {
  // Contre-exemple fixe : stock initial 20, vente catalogue d'une unité,
  // deux tours de synchronisation, catalogue 19 mais registre 20.
  for (const [kind, surface] of [['history', null], ...kinds.flatMap(kind => ['catalog', 'ledger'].map(surface => [kind, surface]))]) {
    const history = op => kind === 'replay'
      ? [{ ...op, surface, kind: 'sale' }, { ...op, surface, kind: 'replay' }]
      : [{ ...op, surface, kind }];
    const arbitrary = kind === 'history'
      ? fc.array(operation, { minLength: 1, maxLength: 30 })
      : operation.map(history);
    const examples = kind === 'history'
      ? [[[{ kind: 'sale', surface: 'catalog', product: 0, qty: 1 }]]]
      : [[history({ surface, product: 0, qty: 1 })]];
    const result = await fc.check(fc.asyncProperty(arbitrary, play), { numRuns: runs, seed, examples });
    if (result.failed) {
      failed++;
      console.error('✗ catalogue/registre ' + kind + '/' + (surface || 'mixte') + ': ' + fc.stringify(result.counterexample));
      console.error(result.errorInstance?.message);
    } else console.log('✓ catalogue/registre ' + kind + '/' + (surface || 'mixte'));
  }
} finally { f.close(); }
if (failed) process.exitCode = 1;
