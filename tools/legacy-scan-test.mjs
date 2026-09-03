#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · legacy scan test — le chemin historique n'écrit qu'une fois.
 *
 * Régression du double-post : sur le chemin NON-guérite, receiveDirect()
 * postait un mouvement par ligne PUIS la boucle moveStock() en postait un
 * second (ids différents, déduplication contournée). Depuis le correctif
 * avant, stLegacyPostAll est l'unique écrivain : receiveDirect ne fait que
 * la pièce comptable (skipMovements) et aucun coût (skipCosts), la boucle
 * moveStock reste seule à écrire les mouvements, coûts à cases près.
 * Cette suite exécute le VRAI code livré (stLegacyPostAll + moveStock +
 * stUpsertSupplierCard extraits de assets/stock.js, jamais réimplémentés)
 * avec le VRAI inventory-ledger.js et le VRAI procurement.js en vm.
 *
 *   node tools/legacy-scan-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 8;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
function jseq(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledgerSrc = fs.readFileSync(path.join(root, 'assets/inventory-ledger.js'), 'utf8');
const procurementSrc = fs.readFileSync(path.join(root, 'assets/procurement.js'), 'utf8');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

const LEGACY_FNS = ['stShowReal', 'stockLocationId', 'stockUnitId', 'ledgerOpeningFor', 'moveStock', 'stUpsertSupplierCard', 'stLegacyPostAll', 'stClaimConfirmBusy', 'stReleaseConfirmBusy'];
function extractStock(name) {
  const m = stockSrc.match(new RegExp('  (?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'stock helper extractable: ' + name);
  return m[0];
}
/* currentStockFor est un passe-plat d'une ligne vers ledgerOpeningFor ; on le
 * reprend à l'identique (même expression) pour brancher l'état stubé. */
const stockPrelude = [
  'const stItemOverrides = {};',
  'const stStockOverrides = {};',
  'function currentVenueId() { return "demo-tenant"; }',
  'const currentStockFor = (it) => ledgerOpeningFor(it);',
].join('\n');
const legacySrc = stockPrelude + '\n' + LEGACY_FNS.map(extractStock).join('\n');

function makeDevice({ real = true, plan = 'basic' } = {}) {
  const ls = new Map();
  const localStorage = {
    getItem: (k) => (ls.has(String(k)) ? ls.get(String(k)) : null),
    setItem: (k, v) => { ls.set(String(k), String(v)); },
    removeItem: (k) => { ls.delete(String(k)); },
  };
  const costs = [];
  const procState = { suppliers: [], orders: [], receipts: [], invoices: [], seq: 0 };
  const win = {
    KiwiEnv: { isReal: () => real },
    KiwiCloudDoc: { currentSlug: () => 'demo-tenant' },
    Kiwi: { venue: () => 'demo-tenant' },
    KiwiStore: { define() { return { get: () => procState, update: (fn) => fn(procState) }; } },
    KiwiVenue: { getPlan: () => plan },
    KiwiConfig: { plan },
    KiwiCost: { setItemCost: (id, cost, by) => { costs.push({ id, cost, by }); } },
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  win.window = win;
  win.crypto = globalThis.crypto;
  const ctx = vm.createContext({
    window: win, localStorage, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise, TextEncoder,
    setTimeout: () => 0, setInterval: () => 0,
    CustomEvent: function (t, d) { this.type = t; this.detail = d && d.detail; },
    crypto: globalThis.crypto,
    fetch: async () => { throw new Error('offline: no sync in legacy suite'); },
    navigator: { onLine: false },
  });
  vm.runInContext(ledgerSrc, ctx, { filename: 'inventory-ledger.js' });
  vm.runInContext(procurementSrc, ctx, { filename: 'procurement.js' });
  vm.runInContext(legacySrc + '\n;window.__legacy = { ' + LEGACY_FNS.join(',') + ' }; window.__legacyMaps = { stStockOverrides, stItemOverrides };', ctx, { filename: 'stock-legacy-core.js' });
  return {
    ctx, win, costs, procState,
    K: win.KiwiInventory,
    run: (code) => vm.runInContext(code, ctx),
  };
}

function catalog() {
  return [
    { id: 'flour', name: 'Farine T55', unit: 'sac', costPerUnit: 140, currentStock: 0, suppliers: [] },
    { id: 'safran', name: 'Safran', unit: 'g', costPerUnit: 0.004, currentStock: 0, suppliers: [] },
  ];
}
function legacyCtx(items) {
  return {
    supplier: 'Coopérative Taliouine', externalRef: 'BL-77', date: '2026-09-03',
    receivedAt: 1788000000000, receiptRef: 'receipt-test-1',
    lines: [
      { itemId: 'flour', qty: 5, cost: 150, updateCost: true, dlc: '' },
      { itemId: 'safran', qty: 1000, cost: 0.0045, updateCost: false, dlc: '' },
    ],
    items,
  };
}
async function postLegacy(dev, ctx) {
  return dev.run(`window.__legacy.stLegacyPostAll(${JSON.stringify(ctx).replace(/</g, '\\u003c')})`);
}
function fakeBtn() {
  const attrs = {};
  return {
    dataset: {},
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; },
    hasAttribute: (k) => k in attrs,
  };
}

await check('one confirmation writes one receipt and one movement per line', async () => {
  const dev = makeDevice({ real: true });
  await postLegacy(dev, legacyCtx(catalog()));
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.K.history('flour').length, 1);
  assert.equal(dev.K.history('safran').length, 1);
  const [m] = dev.K.history('flour');
  assert.equal(m.reason, 'receipt');
  assert.equal(m.refId, 'receipt-test-1');
});

await check('stock increases exactly once per line', async () => {
  const dev = makeDevice({ real: true });
  await postLegacy(dev, legacyCtx(catalog()));
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('costs update only for checked lines', async () => {
  const dev = makeDevice({ real: true });
  await postLegacy(dev, legacyCtx(catalog()));
  jseq(dev.costs, [{ id: 'flour', cost: 150, by: 'Coopérative Taliouine' }]);
});

await check('busy guard refuses concurrent confirms and releases on demand', async () => {
  const dev = makeDevice({ real: true });
  const btn = fakeBtn();
  dev.ctx.BTN = btn;
  assert.equal(await dev.run('window.__legacy.stClaimConfirmBusy(BTN)'), true);
  assert.equal(btn.dataset.busy, '1');
  assert.equal(btn.hasAttribute('disabled'), true);
  assert.equal(await dev.run('window.__legacy.stClaimConfirmBusy(BTN)'), false);
  await dev.run('window.__legacy.stReleaseConfirmBusy(BTN)');
  assert.equal(btn.dataset.busy, undefined);
  assert.equal(btn.hasAttribute('disabled'), false);
  assert.equal(await dev.run('window.__legacy.stClaimConfirmBusy(BTN)'), true);
  await dev.run('window.__legacy.stReleaseConfirmBusy(BTN)');
  assert.equal(await dev.run('window.__legacy.stClaimConfirmBusy(null)'), false);
});

await check('error paths release the busy flag in the wired handler', async () => {
  const zone = stockSrc.slice(stockSrc.indexOf("querySelector('[data-stock-scan-confirm]')"));
  const releases = zone.split('releaseBusy()').length - 1;
  assert.ok(releases >= 3, 'release on guard refusal, conflict, fallback and legacy failure (' + releases + ' calls)');
  assert.ok(zone.includes('if (!stClaimConfirmBusy(confirmBtn)) return;'), 'concurrent taps are dropped before any write');
});

await check('demo behavior stays intact without ledger writes', async () => {
  const dev = makeDevice({ real: false });
  await postLegacy(dev, legacyCtx(catalog()));
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 0);
  const ov = await dev.run('JSON.stringify(window.__legacyMaps.stStockOverrides)');
  jseq(JSON.parse(ov), { flour: 5, safran: 1000 });
});

await check('flagged deterministic intake path is untouched by the legacy fix', async () => {
  assert.ok(stockSrc.includes('await stIntakePostAll({'), 'intake branch still calls its own writer');
  assert.ok(stockSrc.includes('skipMovements: true,') === true, 'skip flags present');
  const intakeZone = stockSrc.slice(stockSrc.indexOf('if (intakeDocId) {'), stockSrc.indexOf('} else {'));
  assert.ok(!intakeZone.includes('stLegacyPostAll('), 'intake branch never touches the legacy writer');
  const legacyFn = stockSrc.match(/  function stLegacyPostAll\(ctx\) \{[\s\S]*?\n  \}/)[0];
  assert.ok(!legacyFn.includes('intakeDocId') && !legacyFn.includes('stIntakePostAll'), 'legacy writer knows nothing of intake');
});

await check('ultra invoice still files against the real receipt', async () => {
  const dev = makeDevice({ real: true, plan: 'ultra' });
  const out = await postLegacy(dev, legacyCtx(catalog()));
  assert.equal(dev.procState.invoices.length, 1);
  const inv = dev.procState.invoices[0];
  assert.equal(inv.receiptId, dev.procState.receipts[0].id);
  assert.equal(out.receiptId, dev.procState.receipts[0].id);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('legacy-scan-test: ' + checks + ' checks passed\n');
