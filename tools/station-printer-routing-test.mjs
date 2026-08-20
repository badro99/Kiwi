#!/usr/bin/env node
/* Kiwi · station-based printer routing test suite
 * Verifies that client receipts and staff production tickets are cleanly routed
 * to physical printers based on prep stations, with tenant-scoped persistence,
 * fail-soft fallback to caisse on printer outages, and multi-station profile binding. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridgeSource = fs.readFileSync(path.join(ROOT, 'assets/printer-bridge.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const foodPrintSource = fs.readFileSync(path.join(ROOT, 'assets/food-production-print.js'), 'utf8');
const receiptSource = fs.readFileSync(path.join(ROOT, 'assets/receipt.js'), 'utf8');

let pass = 0;
const fail = [];
function ok(label, condition, detail = '') {
  if (condition) {
    pass += 1;
  } else {
    fail.push(label + (detail ? ' — ' + detail : ''));
  }
}

const memory = new Map();
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

let lastToast = null;
const dispatchedToBridge = [];

function createHarness(merchantName = 'amira-resto') {
  const listeners = Object.create(null);
  const context = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Uint8Array,
    AbortController: globalThis.AbortController,
    localStorage,
    document: {
      readyState: 'complete',
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      getElementById: () => null,
      createElement: () => ({ id: '', setAttribute: () => {}, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, remove: () => {} }),
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    dispatchEvent: (event) => { (listeners[event.type] || []).forEach((fn) => fn(event)); },
    fetch: (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      dispatchedToBridge.push({ url, body });
      if (url.includes('/kiwi/ping')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, version: '1.3.0' }) });
      }
      if (url.includes('/kiwi/print')) {
        if (body.printerIp === '192.168.1.99') {
          // Simulate unreachable printer
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false, error: 'EHOSTUNREACH' }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, bytes: 120 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    },
    Kiwi: {
      toast: (msg) => { lastToast = msg; }
    },
    KiwiEscPos: {
      toB64: (bytes) => Buffer.from(bytes || []).toString('base64'),
      receipt: (doc) => new Uint8Array([0x1B, 0x40, ...Buffer.from('RECEIPT:' + (doc.shop || 'KIWI'))]),
      kitchenTicket: (doc) => new Uint8Array([0x1B, 0x40, ...Buffer.from('KITCHEN:' + (doc.title || 'CUISINE'))]),
      testSlip: (doc) => new Uint8Array([0x1B, 0x40, ...Buffer.from('TEST:' + (doc.title || 'TEST'))]),
      dayReport: (doc) => new Uint8Array([0x1B, 0x40, ...Buffer.from('DAYREPORT')]),
    },
    KiwiKitchenRelay: {
      merchant: () => merchantName
    },
  };
  context.window = context;
  context.navigator = { bluetooth: null, usb: null };

  vm.runInNewContext(bridgeSource, context, { filename: 'assets/printer-bridge.js' });
  vm.runInNewContext(queueSource, context, { filename: 'assets/kitchen-print-queue.js' });
  vm.runInNewContext(foodPrintSource, context, { filename: 'assets/food-production-print.js' });
  vm.runInNewContext(receiptSource, context, { filename: 'assets/receipt.js' });
  return context;
}

// ── Test 1: Binding Persistence & Tenant Scoping ───────────────────────────
localStorage.clear();
let app1 = createHarness('tenant-alpha');
const KP1 = app1.KiwiPrinter;

ok('KiwiPrinter exports station routing methods',
  typeof KP1.getStationConfig === 'function' &&
  typeof KP1.setStationConfig === 'function' &&
  typeof KP1.resolveStationTarget === 'function' &&
  typeof KP1.hasStationBindings === 'function');

const sampleConfigAlpha = {
  profiles: [
    { id: 'p_caisse', name: 'Comptoir USB', type: 'os', osPrinter: 'EPSON TM-T20', paper: '80' },
    { id: 'p_cuisine', name: 'Cuisine Réseau', type: 'ip', ip: '192.168.1.50', port: 9100, paper: '80' },
    { id: 'p_bar', name: 'Bar Réseau', type: 'ip', ip: '192.168.1.51', port: 9100, paper: '80' },
  ],
  bindings: {
    caisse: 'p_caisse',
    cuisson: 'p_cuisine',
    bar: 'p_bar',
  }
};

KP1.setStationConfig(sampleConfigAlpha);
const readAlpha = KP1.getStationConfig();
ok('Station routing configuration saves and loads properly',
  readAlpha.profiles.length === 3 && readAlpha.bindings.cuisson === 'p_cuisine');

ok('Station routing is tenant-namespaced in localStorage',
  localStorage.getItem('kiwiStationPrinters:tenant-alpha') !== null);

// Switch to tenant-beta — verify tenant isolation
let app2 = createHarness('tenant-beta');
const KP2 = app2.KiwiPrinter;
const readBeta = KP2.getStationConfig();
ok('Tenant beta does not see tenant alpha printer bindings (no leakage across shops)',
  readBeta.profiles.length === 0 && Object.keys(readBeta.bindings).length === 0);

// ── Test 2: Station Target Resolution ──────────────────────────────────────
const targetCaisse = KP1.resolveStationTarget('caisse');
ok('Station caisse resolves to caisse printer profile',
  targetCaisse && targetCaisse.id === 'p_caisse' && targetCaisse.osPrinter === 'EPSON TM-T20');

const targetCuisson = KP1.resolveStationTarget('cuisson');
ok('Station cuisson resolves to cuisine printer profile with IP',
  targetCuisson && targetCuisson.id === 'p_cuisine' && targetCuisson.ip === '192.168.1.50');

const targetBar = KP1.resolveStationTarget('bar');
ok('Station bar resolves to bar printer profile with IP',
  targetBar && targetBar.id === 'p_bar' && targetBar.ip === '192.168.1.51');

const targetUnrouted = KP1.resolveStationTarget('patisserie');
ok('Unbound station gracefully falls back to caisse profile',
  targetUnrouted && targetUnrouted.id === 'p_caisse');

// ── Test 3: Receipt vs Production Format Separation & Routing ───────────────
dispatchedToBridge.length = 0;
await KP1.printReceipt({ shop: 'CAFE ATLAS', total: '25.00' });
const printReqs1 = dispatchedToBridge.filter((r) => r.url.includes('/kiwi/print'));
ok('printReceipt sends to bridge targeting caisse printer (EPSON TM-T20)',
  printReqs1.length > 0 && printReqs1[0].body.printerName === 'EPSON TM-T20');

dispatchedToBridge.length = 0;
await KP1.printKitchen({ title: 'CUISINE', items: [{ name: 'Tajine', qty: 1 }] }, { station: 'cuisson' });
const printReqs2 = dispatchedToBridge.filter((r) => r.url.includes('/kiwi/print'));
ok('printKitchen sends to cuisine IP target (192.168.1.50)',
  printReqs2.length > 0 && printReqs2[0].body.printerIp === '192.168.1.50');

dispatchedToBridge.length = 0;
await KP1.printKitchen({ title: 'BAR', items: [{ name: 'Thé à la menthe', qty: 2 }] }, { station: 'bar' });
const printReqs3 = dispatchedToBridge.filter((r) => r.url.includes('/kiwi/print'));
ok('printKitchen sends to bar IP target (192.168.1.51)',
  printReqs3.length > 0 && printReqs3[0].body.printerIp === '192.168.1.51');

// ── Test 4: Category → Station Multi-Ticket Planning ───────────────────────
const foodPlan = app1.KiwiFoodProductionPrint.plan({
  trade: 'fastfood',
  ref: '42',
  lines: [
    { name: 'Burger Atlas', qty: 2, station: 'cuisson' },
    { name: 'Frites Maison', qty: 2, station: 'cuisson' },
    { name: 'Soda Citron', qty: 2, station: 'bar' },
  ],
});

ok('Multi-station order generates distinct ticket jobs per station',
  foodPlan.length === 2 && foodPlan.some(j => j.station === 'cuisson') && foodPlan.some(j => j.station === 'bar'));

ok('Job payload carries matching station identifier',
  foodPlan.find(j => j.station === 'cuisson').payload.station === 'cuisson');

// ── Test 5: Same Printer Profile on Multiple Stations ──────────────────────
const multiStationConfig = {
  profiles: [
    { id: 'p_single_kitchen', name: 'Imprimante Cuisine Unique', type: 'ip', ip: '192.168.1.88', port: 9100, paper: '80' }
  ],
  bindings: {
    cuisson: 'p_single_kitchen',
    bar: 'p_single_kitchen',
  }
};
KP1.setStationConfig(multiStationConfig);

const targetCuisson2 = KP1.resolveStationTarget('cuisson');
const targetBar2 = KP1.resolveStationTarget('bar');
ok('Same printer profile can be bound to both cuisson and bar stations',
  targetCuisson2 && targetBar2 && targetCuisson2.id === targetBar2.id && targetCuisson2.ip === '192.168.1.88');

dispatchedToBridge.length = 0;
await KP1.printKitchen({ title: 'CUISSON #42', items: [] }, { station: 'cuisson' });
await KP1.printKitchen({ title: 'BAR #42', items: [] }, { station: 'bar' });
ok('Same printer bound to two stations receives two separate print requests',
  dispatchedToBridge.length === 2 &&
  dispatchedToBridge[0].body.printerIp === '192.168.1.88' &&
  dispatchedToBridge[1].body.printerIp === '192.168.1.88');

// ── Test 6: Fail-Soft Fallback When Station Printer is Unreachable ─────────
const brokenStationConfig = {
  profiles: [
    { id: 'p_caisse_ok', name: 'Caisse OK', type: 'os', osPrinter: 'EPSON-CAISSE', paper: '80' },
    { id: 'p_offline_station', name: 'Cuisine Offline', type: 'ip', ip: '192.168.1.99', port: 9100, paper: '80' },
  ],
  bindings: {
    caisse: 'p_caisse_ok',
    cuisson: 'p_offline_station',
  }
};
KP1.setStationConfig(brokenStationConfig);

dispatchedToBridge.length = 0;
lastToast = null;
const failSoftResult = await KP1.printKitchen({ title: 'CUISINE', items: [{ name: 'Tajine', qty: 1 }] }, { station: 'cuisson' });

ok('When station printer fails, printKitchen falls back to caisse printer profile',
  dispatchedToBridge.some(req => req.body.printerName === 'EPSON-CAISSE'));

ok('Fail-soft fallback informs cashier with French toast notification',
  typeof lastToast === 'string' && lastToast.includes('indisponible') && lastToast.includes('caisse'));

ok('Fail-soft fallback resolves successfully and never throws or blocks sale',
  failSoftResult && failSoftResult.ok === true && failSoftResult.fallback === true);

// ── Test 7: Default Behavior When No Bindings Configured ────────────────────
localStorage.clear();
let appDefault = createHarness('tenant-default');
const KPDefault = appDefault.KiwiPrinter;

ok('hasStationBindings returns false when unconfigured',
  !KPDefault.hasStationBindings());

ok('resolveStationTarget returns null when unconfigured',
  KPDefault.resolveStationTarget('cuisson') === null);

// ── Summary ────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`\x1b[31mFAIL: ${fail.length} test(s) failed:\x1b[0m`);
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
} else {
  console.log(`\x1b[32mPASS: ${pass} station printer routing checks passed.\x1b[0m`);
  process.exit(0);
}
