#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const briefing = readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
const stock = readFileSync(new URL('../assets/stock.js', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../assets/agent-truth.js', import.meta.url), 'utf8');
const memory = {}, callbacks = {};
const storage = { getItem: (k) => memory[k] || null, setItem: (k, v) => { memory[k] = String(v); } };
const document = { readyState: 'loading', documentElement: { lang: 'fr' }, head: { appendChild() {} }, querySelector() { return null; }, createElement() { return { setAttribute() {}, addEventListener() {} }; }, addEventListener(n, fn) { callbacks[n] = fn; } };
let requested = null, opened = 0;
const window = {
  document, localStorage: storage, KiwiEnv: { isReal: () => true }, KiwiMe: { accountId: 'account-a' },
  KiwiCloudDoc: { currentSlug: () => 'venue-a' }, KiwiDayReport: { businessDay: () => '2026-08-21', cutoff: () => 5 },
  KiwiAgentTier: () => 'manager', KiwiAgentActions: { request(name, args) { requested = { name, args }; return { ok: true, confirmationRequired: true, token: 't' }; } },
  KiwiActionCenter: { open() { opened++; } }, addEventListener() {}
};
window.window = window;
vm.runInNewContext(briefing, { window, document, localStorage: storage, console, Date, setTimeout, clearTimeout }, { filename: 'assets/briefing.js' });
const T = window.KiwiBriefing._test;

const items = Array.from({ length: 40 }, (_, i) => ({
  id: 'item-' + i, name: 'Article ' + i, unit: 'kg', supplier: i === 0 ? 'Fournisseur A' : '',
  tracked: i < 12, balance: i === 0 ? 2 : 20, threshold: i < 12 ? 5 : null, par: 12
}));
let line = T.lowStockRule({ items });
assert.ok(line, 'a ledger-tracked item below its explicit threshold emits');
assert.match(line.copy.fr, /12 articles suivis sur 40/, 'coverage is stated in the line');
assert.equal(line.evidence.count, 12, 'evidence count equals tracked coverage');
assert.equal(line.evidence.source, 'KiwiInventory.balance', 'evidence names the ledger balance');
assert.equal(T.visibleLines([line], 'staff').length, 0, 'staff does not receive procurement briefing lines');
assert.equal(T.visibleLines([line], 'manager').length, 1, 'manager receives the line');

assert.equal(T.lowStockRule({ items: [{ id: 'x', tracked: true, balance: 0, threshold: null }] }), null, 'missing threshold suppresses');
assert.equal(T.lowStockRule({ items: [{ id: 'x', tracked: false, balance: 0, threshold: 5 }] }), null, 'untracked item suppresses');
assert.equal(T.lowStockRule({ items: [{ id: 'x', tracked: true, balance: 8, threshold: 5 }] }), null, 'healthy stock stays silent');

T.compute([() => line]);
const proposed = T.proposeLine(line.id);
assert.equal(proposed.confirmationRequired, true, 'Proposer creates a confirmation draft');
assert.equal(requested.name, 'create-po', 'the draft uses the existing PO action path');
assert.equal(requested.args.lines[0].itemId, 'item-0', 'the proposal carries the measured item id');
assert.equal(opened, 1, 'the Action Center opens for merchant review');

assert.match(stock, /window\.KiwiStockBriefing = \{ items: briefingStockItems \}/, 'Stock exposes a read-only briefing projection');
assert.match(stock, /window\.KiwiInventory\.history\(it\.id\)/, 'tracking requires durable ledger history');
assert.match(actions, /name === 'create-po'/, 'audited agent actions validate create-po');
assert.match(actions, /O\.agentRun\('create-po'/, 'confirmation opens a server-audited PO command');

console.log('briefing-low-stock-test: 17 controls passed');
