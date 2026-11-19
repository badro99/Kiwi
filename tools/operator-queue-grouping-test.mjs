#!/usr/bin/env node
/* Console opérateur · la file du jour regroupe les signaux répétés.
 *
 * 19 nov. 2026 : « Votre file de travail » comptait 233 cartes, dont 111
 * « Livraison non encaissée · Santos Store », 37 « Synchronisation à examiner
 * · Maison 121 » et 32 « Horloge de la caisse décalée » (le même ticket huit
 * fois). Les vrais incidents disparaissaient dessous. Dans la file de tous
 * les clients, trois signaux ou plus du même type pour le même client, non
 * suivis, deviennent une seule carte qui mène aux suivis du client ; le
 * dossier du client garde chaque signal, un par un. Runs the real queue().
 *   node tools/operator-queue-grouping-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../assets/admin-workspace-copy.js', import.meta.url), 'utf8') + ';' + fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const policy = require('../assets/admin-policy.js');

function boot() {
  const element = () => ({ innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {}, contains: () => false, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, addEventListener() {} });
  const elements = new Map();
  const document = {
    documentElement: { lang: 'fr', dir: 'ltr' }, body: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} }, activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => null, querySelectorAll: () => [],
    createElement() { return { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, showModal() {} }; },
  };
  const window = { KiwiAdminPolicy: policy, KiwiOperator: { close() {}, snapshot: () => ({}), api: async () => ({}) }, KiwiAdminI18n: { lang: 'fr' } };
  const context = vm.createContext({ window, document, Intl, Date, URLSearchParams, CSS: { escape: String }, crypto: { randomUUID: () => 'x' }, location: { search: '', hash: '' }, localStorage: { getItem: () => null } });
  vm.runInContext(source.slice(0, source.indexOf("  document.addEventListener('click'")) + ';window.test={state,queue};})();', context);
  return window.test;
}

const now = Date.now(), DAY = 86400000;
const t = boot();
const shop = (merchant, name) => ({ merchant, name, type: 'boutique', today_amount: 0, today_count: 0, access: 'active' });
t.state.clients = [shop('santos-store', 'Santos Store'), shop('pasta-corner', 'Pasta Corner')];
const receivables = Array.from({ length: 111 }, (_, i) => ({ merchant: 'santos-store', id: 'd' + i, ticket_ref: 'L-' + i, total_cents: 30000, remaining_cents: 30000, created_ts: now - (i + 1) * DAY }));
receivables.push({ merchant: 'pasta-corner', id: 'p1', ticket_ref: 'P-1', total_cents: 5000, remaining_cents: 5000, created_ts: now - DAY });
const tracked = { merchant: 'santos-store', id: 'task1', signal_key: 'receivable:d0', title: 'Livraison non encaissée', status: 'open', priority: 2 };
t.state.data = { now, actor: { id: 'op1' }, sources: {
  receivables: { available: true, rows: receivables },
  tasks: { available: true, rows: [tracked] },
  caisseSync: { available: true, rows: [] },
} };

const day = JSON.parse(JSON.stringify(t.queue('', 'all')));
const santos = day.filter(x => x.merchant === 'santos-store' && /Livraison non encaissée/.test(x.title));
assert.equal(santos.length, 2, 'one tracked follow-up + one grouped card, not 111 cards');
const group = santos.find(x => x.grouped);
assert.ok(group, 'the untracked ones fold into one card');
assert.equal(group.grouped, 110, 'it counts the 110 untracked signals');
assert.match(group.title, /110/, 'the card says how many');
assert.equal(group.tab, 'tasks', 'it opens the client’s follow-ups, where each one is listed');
assert.equal(group.source_ts, Math.max(...receivables.slice(1, 111).map(r => r.created_ts)), 'it is as recent as its newest signal');
console.log('  ✓ 110 untracked deliveries of one client fold into one card');

const pasta = day.filter(x => x.merchant === 'pasta-corner' && /Livraison non encaissée/.test(x.title));
assert.equal(pasta.length, 1); assert.ok(!pasta[0].grouped, 'a single signal stays itself');
console.log('  ✓ a client with one or two such signals keeps them as they are');

const dossier = t.queue('santos-store', 'all').filter(x => /Livraison non encaissée/.test(x.title));
assert.equal(dossier.length, 111, 'the client dossier still lists each delivery');
console.log('  ✓ the client dossier keeps every signal, one by one');
console.log('operator-queue-grouping: 3 passed');
