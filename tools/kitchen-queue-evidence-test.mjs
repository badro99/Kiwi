#!/usr/bin/env node
/* Corrupt local kitchen print queue: raw bytes quarantined and exportable before the next write replaces them. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/kitchen-print-queue.js', import.meta.url), 'utf8');
function boot(initial = {}) {
  const memory = new Map(Object.entries(initial)), events = [];
  const localStorage = { getItem: (k) => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k),
    key: (i) => [...memory.keys()][i] || null, get length() { return memory.size; } };
  const context = { console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, localStorage,
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, addEventListener() {}, dispatchEvent(e) { events.push(e.type); },
    KiwiKitchenRelay: { merchant: () => 'amira-cafe' }, KiwiPrinter: { isConnected: () => false, printKitchen: async () => ({ ok: false }) } };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'assets/kitchen-print-queue.js' });
  return { api: context.KiwiKitchenPrint, memory, events };
}
const QK = 'kiwiKitchenPrintQueueV1:amira-cafe', raw = '[{"id":"order:1:cuisine","payload":{"title":"CUI';
const { api, memory, events } = boot({ [QK]: raw });
assert.equal(api._readQueue().length, 0, 'a corrupt queue still reads as empty');
const copies = api.recoveryCopies();
assert.equal(copies.length, 1, 'the corrupt bytes are listed');
assert.equal(api.recoveryCopies(copies[0].key), raw, 'the raw bytes are exportable verbatim');
assert.ok(events.includes('kiwi:kitchen-print-corrupt'), 'the surface is told');
memory.set(QK, '[]'); // the next write replaces the live key
assert.equal(api.recoveryCopies(copies[0].key), raw, 'the copy survives the overwrite');
const again = boot({ [copies[0].key]: raw });
assert.equal(again.api.recoveryCopies().length, 1, 'a reload still lists the stored copy');
assert.equal(again.api.recoveryCopies(copies[0].key, true), raw);
assert.equal(again.api.recoveryCopies().length, 0, 'acknowledgement removes it');
assert.equal(again.memory.has(copies[0].key), false);
console.log('✓ kitchen queue evidence: corrupt queue quarantined, listed, exported, acknowledged');
