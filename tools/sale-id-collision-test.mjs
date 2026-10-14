#!/usr/bin/env node
/* Kiwi · un ticket n°1 de demain n'est pas le ticket n°1 d'aujourd'hui.
 *
 * Le compteur d'une caisse de métier (nextSeq, assets/pos-sale.js) ne lit que le
 * journal du jour : il repart à 1 chaque matin. L'identifiant serveur d'une
 * vente (stableId, assets/live-link.js) était un FNV-1a de « marchand | réf »,
 * sans date : le ticket 1 de demain recevait donc l'identifiant du ticket 1 d'hier,
 * et /api/sale le rejouait (vente perdue) ou le refusait en 409 (montant autre).
 *
 * Ce test exécute les VRAIS modules : l'identifiant doit différer d'un jour à
 * l'autre, rester le même à chaque nouvel essai de la même vente, et ne pas
 * bouger pour tout ce qui est déjà stocké ou en file (sans `idDay`). */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed++; };
const eq = (a, b, label) => { assert.equal(a, b, label); passed++; };
const ne = (a, b, label) => { assert.notEqual(a, b, label); passed++; };

/* ── live-link.js : la formule d'identifiant ─────────────────────────────── */
function bootLive() {
  const values = new Map([['kiwiLive', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant: 'sale-id-test' })]]);
  const storage = { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
  const document = { readyState: 'complete', hidden: false, addEventListener() {}, dispatchEvent() {}, createElement: () => ({}) };
  const window = { document, localStorage: storage, KiwiEnv: { isReal: () => true }, addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(read('assets/live-link.js'), {
    window, document, localStorage: storage, navigator: { onLine: true },
    location: { search: '', hostname: 'kiwi.test' }, URLSearchParams,
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async () => new Response(JSON.stringify({ sales: [], voided: [] })), console,
  });
  return window.KiwiLive;
}
/* La formule d'AVANT, recopiée : ce qui est déjà stocké doit y rester fidèle. */
function legacyId(merchant, source) {
  let h = 2166136261;
  const s = String(merchant) + '|' + source;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'sale-ref-' + (h >>> 0).toString(16) + '-' + source.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
}

const live = bootLive();
const M = 'sale-id-test';
const today = { ref: 'A-1-X1', amount: 40, method: 'cash', idDay: '20261014' };
const tomorrow = { ref: 'A-1-X1', amount: 55, method: 'cash', idDay: '20261015' };

ne(live.saleIdFor(today, M), live.saleIdFor(tomorrow, M), 'ticket 1 of two business days gets two different ids');
eq(live.saleIdFor(today, M), live.saleIdFor({ ...today }, M), 'a retry of the same sale keeps one id');
eq(live.saleIdFor(today, M), live.saleIdFor({ ...today, amount: 99, time: new Date() }, M), 'the id depends on the ref and the day only, not on later fields');
eq(live.saleIdFor({ ref: 'A-1-X1' }, M), legacyId(M, 'A-1-X1'), 'an entry with no idDay (already stored or queued) keeps its old id byte for byte');
eq(live.saleIdFor({ id: 'sale-local-77', ref: 'A-1', idDay: '20261014' }, M), live.saleIdFor({ id: 'sale-local-77', ref: 'A-1' }, M), 'an entry that already owns an id is not re-keyed by the day');
ne(live.saleIdFor(today, 'other-shop'), live.saleIdFor(today, M), 'the tenant is still part of the id');
ok(live.saleIdFor(today, M).length <= 64, 'the id still fits the 64-character key');
ok(/^sale-ref-[0-9a-f]+-[A-Za-z0-9_-]+$/.test(live.saleIdFor(today, M)), 'the id keeps the sale-ref-<hash>-<ref> shape');

/* ── pos-sale.js : le jour d'activité est posé UNE fois, à l'encaissement ── */
function bootPosSale() {
  const rows = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'amira-snack' })], ['kiwi:posDevice', 'A7']]);
  const localStorage = {
    getItem: (k) => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, String(v)),
    removeItem: (k) => rows.delete(k), key: (i) => [...rows.keys()][i] || null, get length() { return rows.size; },
  };
  const posted = [];
  const document = { hidden: false, addEventListener() {}, dispatchEvent() { return true; } };
  const window = {
    localStorage, document, KiwiEnv: { isReal: () => true }, addEventListener() {},
    KiwiLive: { isOn: () => true, merchant: () => 'amira-snack', postSale(p) { posted.push(p); return { ok: true, queued: true, id: 'sale-ref-' + posted.length }; } },
  };
  window.window = window;
  const context = {
    console, window, document, localStorage, Date, Map, Set, Uint8Array,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    crypto: { getRandomValues(a) { a[0] = 1; a[1] = 2; return a; } },
    setTimeout: () => 1, clearTimeout() {}, fetch: async () => ({ ok: true, json: async () => ({ sales: [], voided: [] }) }),
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pos-sale.js'), context, { filename: 'pos-sale.js' });
  return { api: window.KiwiPosSale, posted };
}
const { api, posted } = bootPosSale();
const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min);

eq(api.businessDayKey(at(2026, 10, 14, 12, 0)), '20261014', 'a noon sale belongs to its own calendar day');
eq(api.businessDayKey(at(2026, 10, 15, 2, 30)), '20261014', 'a 02:30 sale still belongs to the previous business day (5 h boundary)');
eq(api.businessDayKey(at(2026, 10, 15, 5, 0)), '20261015', 'the business day turns over at 05:00');

const day1 = api.record('autre', { total: 40, method: 'especes', label: 'Café', ref: 'A-1', at: at(2026, 10, 14, 11, 0) });
const day2 = api.record('autre', { total: 55, method: 'especes', label: 'Thé', ref: 'A-1', at: at(2026, 10, 15, 11, 0) });
eq(day1.idDay, '20261014', 'the journal row keeps the day it was rung in');
eq(posted[0].idDay, '20261014', 'the mirrored sale carries the day to Live Link');
eq(posted[1].idDay, '20261015', 'the next day carries its own day');
eq(day1.ref, day2.ref, 'both tickets really do share the same printed reference');
ne(live.saleIdFor(posted[0], M), live.saleIdFor(posted[1], M), 'so their server ids differ and neither sale replays the other');
eq(live.saleIdFor(day1, M), live.saleIdFor(posted[0], M), 'the journal row (reprint, reconciliation) rebuilds the very id that was posted');

/* ── les références d'encaissements multiples ───────────────────────────── */
const hotel = read('assets/pos-hotel.js');
ok(/`Ch-\$\{a\.room\}-\$\{Date\.now\(\)\.toString\(36\)\.slice\(-5\)\}`/.test(hotel), 'hotel: each deposit event has its own ref, not Ch-<room> for every stay of that room');
ok(!/`Ch-\$\{a\.room\}`/.test(hotel), 'hotel: the bare Ch-<room> ref is gone');
const bakery = read('assets/pos-boulangerie.js');
ok(bakery.includes('`${cake.id}-A`') && bakery.includes('`${c.id}-S`'), 'boulangerie: cake deposit and balance carry distinct refs');
ok(!/postDay\(acompte, method, `Acompte gâteau · \$\{cake\.name\}`, cake\.id,/.test(bakery)
  && !/postDay\(due, method, `Solde gâteau · \$\{c\.name\}`, c\.id,/.test(bakery), 'boulangerie: neither payment reuses the bare cake id');

console.log(`✓ sale id collision (${passed} controls)`);
