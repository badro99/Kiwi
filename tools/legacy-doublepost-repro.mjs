#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · legacy double-post repro (AUDIT ARTIFACT — not a gate).
 *
 * Reproduces docs/audits/LEGACY_SCAN_DOUBLEPOST_2026-09-03.md finding 1 with
 * synthetic fixtures only: on the NON-FLAG scan path, one human confirmation
 * posts TWO ledger movements per line (receiveDirect's `inv-<grn>-<idx>` plus
 * the handler moveStock loop's fresh UUID), bypassing both dedup layers.
 *
 * Executes the REAL inventory-ledger.js and the REAL procurement.js in a vm
 * context, driving them with the exact argument shapes the non-flag confirm
 * handler in assets/stock.js uses (call sites pinned statically below).
 * No network, no production data, no writes outside this process.
 * This is not wired into the gate, but a failed pin exits non-zero so a manual
 * run cannot be mistaken for proof. Run manually:
 *
 *   node tools/legacy-doublepost-repro.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');
const ledgerSrc = fs.readFileSync(path.join(root, 'assets/inventory-ledger.js'), 'utf8');
const procurementSrc = fs.readFileSync(path.join(root, 'assets/procurement.js'), 'utf8');

let failures = 0;
const say = (ok, msg) => {
  process.stdout.write((ok ? '  [=] ' : '  [X] ') + msg + '\n');
  if (!ok) failures++;
};

/* ── 1 · Pin the two call sites in the NON-FLAG branch of the handler ───── */
const confirmZone = stockSrc.slice(stockSrc.indexOf("querySelector('[data-stock-scan-confirm]')"));
const flagSplit = confirmZone.indexOf('} else {');
const legacyBranch = confirmZone.slice(confirmZone.indexOf('} else {'), confirmZone.indexOf('} // fin chemin historique'));
say(legacyBranch.includes('window.KiwiProcurement?.receiveDirect') && legacyBranch.includes('.receiveDirect({'), 'non-flag branch calls receiveDirect (procurement writes movements)');
say(legacyBranch.includes("moveStock(it, line.qty, 'receipt', 'receipt', receiptRef,"), 'non-flag branch then calls moveStock per line (second movement)');
say(!legacyBranch.includes('skipMovements') && !legacyBranch.includes('movementId'), 'neither call carries an idempotency key on the legacy path');
say(!/disabled|dataset\.busy|__busy|inflight/i.test(confirmZone.slice(0, confirmZone.indexOf('stSaveOverlay();'))), 'no re-entrancy guard on the confirm button');

/* ── 2 · Execute both real callees with synthetic fixtures ──────────────── */
const ls = new Map();
const localStorage = {
  getItem: (k) => (ls.has(String(k)) ? ls.get(String(k)) : null),
  setItem: (k, v) => { ls.set(String(k), String(v)); },
  removeItem: (k) => { ls.delete(String(k)); },
};
const costs = [];
const procState = { suppliers: [], orders: [], receipts: [], invoices: [], seq: 0 };
const win = {
  KiwiEnv: { isReal: () => true }, // simulateur de commerçant réel (la démo n'est pas affectée)
  KiwiCloudDoc: { currentSlug: () => 'repro-merchant' },
  KiwiStore: { define() { return { get: () => procState, update: (fn) => fn(procState) }; } },
  KiwiVenue: { getPlan: () => 'basic' },
  KiwiConfig: { plan: 'basic' },
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
  fetch: async () => { throw new Error('offline repro: no sync'); },
  navigator: { onLine: false },
});
vm.runInContext(ledgerSrc, ctx, { filename: 'inventory-ledger.js' });
vm.runInContext(procurementSrc, ctx, { filename: 'procurement.js' });

// Exactement ce que le handler non-flag fait par ligne confirmée :
//  1. receiveDirect({ supplierId, externalRef, receivedAt, lines }) — SANS receiptId/skipMovements
//  2. moveStock(it, qty, 'receipt', 'receipt', receiptRef, note, cost, meta) — SANS movementId
const receiptRef = 'receipt-FAKE';
await vm.runInContext(`window.KiwiProcurement.receiveDirect({
  supplierId: 'sup-repro', externalRef: 'BL-REPRO', receivedAt: 1788000000000,
  lines: [{ itemId: 'flour', name: 'Farine T55', qty: 5, unit: 'sac', unitCost: 150 }]
})`, ctx);
await vm.runInContext(`window.KiwiInventory.add({
  itemId: 'flour', qty: 5, reason: 'receipt', refType: 'receipt', refId: ${JSON.stringify(receiptRef)},
  note: 'Fournisseur Repro', unitCost: 150, occurredTs: 1788000000000,
  meta: { supplierId: 'sup-x', supplierName: 'Fournisseur Repro' }
})`, ctx);

const moves = vm.runInContext(`window.KiwiInventory.history('flour')`, ctx);
const balance = vm.runInContext(`window.KiwiInventory.balance('flour')`, ctx);
say(moves.length === 2, `one confirmation posted ${moves.length} ledger movement(s) for a single 5-sac line (expected 1)`);
say(new Set(moves.map((m) => m.id)).size === 2, 'the two rows carry different ids, so local + server dedup both pass them through');
say(moves.some((m) => String(m.id).startsWith('inv-grn-')), 'row A comes from receiveDirect (inv-<grn>-<idx>)');
say(moves.some((m) => String(m.id).startsWith('inv-') && !String(m.id).includes('grn')), 'row B comes from moveStock (fresh UUID)');
say(balance === 10, `reconstructed stock is ${balance} sacs for a 5-sac delivery (2x inflation)`);
say(procState.receipts.length === 1, 'exactly one receipt document (documents do NOT duplicate per write — rows do)');

process.stdout.write(failures
  ? `\nrepro INCOMPLETE (${failures} pin(s) unmet — re-check against stock.js)\n`
  : '\nrepro COMPLETE: non-flag confirm double-posts every receipt line on real merchants\n');
if (failures) process.exitCode = 1;
