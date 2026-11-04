#!/usr/bin/env node
/* Kiwi · simple-food-cost-parity-test.mjs · analysis#2.
 *
 * What the cook reads on screen (line cost, total, cost per portion, in the
 * editor and in the sheet list) must be the same number the CSV carries, for
 * ANY sheet, not only the one fixed fixture of simple-food-cost-test.mjs.
 * fast-check draws multi-line sheets (food and packaging, kg/g/L/ml/unité,
 * decimals in prices and pack sizes, yields 1 to 100 %, 1 to 12 portions, an
 * incompatible unit now and then), the REAL assets/simple-food-cost.js renders
 * them in a vm document and exports them, and the visible text is parsed back
 * and compared with the CSV cell by cell. An unknown stays unknown on both
 * sides: the CSV never writes a number the screen does not show.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { deadlineVmSource } from './deadline-vm-source.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fc;
try { fc = createRequire(path.join(ROOT, 'app', 'package.json'))('fast-check'); }
catch (_) { console.log('  ○ skip  fast-check unavailable (npm --prefix app ci), food cost parity not executed'); process.exit(0); }
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 150;

const stub = () => ({ innerHTML: '', getAttribute: () => null, querySelector: () => null });
const root = stub();
const listeners = {};
const document = {
  documentElement: { lang: 'fr' }, head: { appendChild() {} }, body: { appendChild() {} }, getElementById: () => null,
  createElement: () => ({ click() {}, remove() {}, set href(v) {}, set download(v) {} }),
  querySelector: (sel) => (sel === '[data-sfc-root]' ? root : null),
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
};
const disk = new Map([['kiwiAccountKey', 'owner@resto.ma']]);
let sheets = [];
const fetch = async () => ({ status: 200, json: async () => ({ enabled: true, canEdit: true, sheets }) });
const win = {
  KiwiEnv: { isReal: () => true }, KiwiConfig: { features: { simple_food_cost: true } }, KiwiI18n: { getLang: () => 'fr' },
  KiwiCloudDoc: { currentSlug: () => 'resto-test' }, KiwiMenuStore: { items: () => [] },
  KiwiReceipt: { config: () => ({ vat: { mode: 'rate', rate: 10, included: true } }) }, KiwiDayReport: { today: () => '2026-10-11' },
  addEventListener() {}, Kiwi: { modal: () => ({ close() {}, el: { querySelector: () => null } }) },
};
win.window = win;
const exported = [];
const ctx = vm.createContext({ window: win, document, navigator: { onLine: true }, fetch,
  localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); } },
  console, setTimeout: (fn, ms) => (ms ? 0 : fn()), clearTimeout() {}, Intl,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class { constructor(p) { exported.push(String(p[0])); } } });
vm.runInContext(R('assets/restaurant-units.js'), ctx, { filename: 'restaurant-units.js' });
vm.runInContext(deadlineVmSource(R('assets/simple-food-cost.js')), ctx, { filename: 'simple-food-cost.js' });
const flush = () => new Promise((r) => setImmediate(r));
const click = async (attrs) => { const el = { getAttribute: (k) => attrs[k], closest: (s) => (s === '[data-sfc]' ? el : s === '[data-sfc-root]' ? root : null) }; for (const fn of listeners.click || []) await fn({ target: el }); await flush(); };
win.KiwiSimpleFoodCost.panel();
await flush(); await flush();

/* what the screen says: "12,34 MAD" -> "12,34"; an unknown -> null */
const shown = (html) => {
  const text = html.replace(/<small[^>]*>[\s\S]*?<\/small>/g, '');
  if (/sfc-unknown/.test(text)) return null;
  const m = text.replace(/<[^>]+>/g, '').replace(/[  \s]/g, '').match(/^(\d+,\d{2})MAD$/);
  return m ? m[1] : undefined;
};
const csvRows = (text) => text.replace(/^﻿/, '').split('\r\n').map((r) => r.split(';'));

const PAIRS = [['kg', 'g'], ['g', 'g'], ['kg', 'kg'], ['L', 'ml'], ['ml', 'ml'], ['L', 'L'], ['unité', 'unité'], ['kg', 'ml']];
const line = fc.record({
  type: fc.constantFrom('food', 'packaging'),
  packPrice: fc.integer({ min: 1, max: 80000 }).map((c) => c / 100),
  packQty: fc.integer({ min: 1, max: 500 }).map((q) => q / 10),
  pair: fc.constantFrom(...PAIRS),
  useQty: fc.integer({ min: 1, max: 50000 }).map((q) => q / 10),
  yieldPct: fc.integer({ min: 1, max: 100 }),
});
const sheetArb = fc.record({ lines: fc.array(line, { minLength: 1, maxLength: 6 }), portions: fc.integer({ min: 1, max: 12 }), price: fc.option(fc.integer({ min: 100, max: 30000 }).map((c) => c / 100), { nil: null }) });
const toSheet = (g) => ({ id: 'fc-1', name: 'Fiche', kind: 'sheet', version: 1, archived: false, updatedTs: Date.UTC(2026, 9, 10), updatedBy: 'x',
  data: { name: 'Fiche', sellingPrice: g.price, vatIncluded: true, vatRate: 10, portions: g.portions, targetPct: 30,
    lines: g.lines.map((l, i) => ({ id: 'l' + i, name: 'Ligne' + i, type: l.type, packPrice: l.packPrice, packQty: l.packQty, packUnit: l.pair[0], useQty: l.useQty, useUnit: l.pair[1], yieldPct: l.yieldPct, priceDate: '2026-10-01' })) } });

/* found by the generator on 4 Nov: 328,11 per 21,3 ml, 1540,7 ml used at 40 % yield costs 59 333,225: the screen said ,23 and the CSV (toFixed) ,22 */
const HALF_CENT = { lines: [{ type: 'food', packPrice: 328.11, packQty: 21.3, pair: ['ml', 'ml'], useQty: 1540.7, yieldPct: 40 }], portions: 1, price: null };
let lastWhy = '';
let failed = 0, ran = 0, unknownSeen = 0, knownSeen = 0;
const bad = (why) => { throw new Error(why); };
async function oneSheet(g) {
  sheets = [toSheet(g)];
  if (/data-sfc="back"/.test(root.innerHTML)) await click({ 'data-sfc': 'back' });
  await click({ 'data-sfc': 'retry' });
  /* the list says the cost per portion, and exports it */
  const listPortion = shown((root.innerHTML.match(/data-sfc-row="fc-1"><td>[\s\S]*?<\/td><td>([\s\S]*?)<\/td>/) || [])[1] || '');
  exported.length = 0;
  await click({ 'data-sfc': 'export-all' });
  const allCsv = csvRows(exported[0] || '');
  await click({ 'data-sfc': 'open', 'data-id': 'fc-1' });
  const html = root.innerHTML;
  exported.length = 0;
  await click({ 'data-sfc': 'export-sheet' });
  const rows = csvRows(exported[0] || bad('no CSV produced'));
  const lineRows = rows.slice(2, 2 + g.lines.length);
  const total = rows.find((r) => r[0] === 'Total du lot'), portion = rows.find((r) => r[0] === 'Par portion');
  if (!total || !portion || lineRows.length !== g.lines.length) bad('CSV shape: ' + JSON.stringify(rows.slice(-4)));
  let allKnown = true;
  g.lines.forEach((l, i) => {
    const cellHtml = (html.match(new RegExp('<td data-sfc-linecost="' + i + '">([\\s\\S]*?)</td>')) || [])[1] || bad('line cost cell ' + i);
    const v = shown(cellHtml), csv = lineRows[i][9];
    if (v === undefined) bad('unreadable line cell ' + cellHtml);
    if (v === null) { allKnown = false; if (csv !== 'Inconnu') bad(`line ${i}: screen says unknown, CSV says ${csv}`); }
    else if (csv !== v) bad(`line ${i}: screen ${v}, CSV ${csv}`);
  });
  const sum = (label) => (html.match(new RegExp('<span>' + label + '</span><b>([\\s\\S]*?)</b></div>')) || [])[1];
  const sTotal = shown(sum('Total du lot') ?? bad('no total on screen')), sPortion = shown(sum('Par portion') ?? bad('no portion on screen'));
  if (allKnown) {
    knownSeen++;
    if (sTotal === null || sPortion === null) bad('every line known but the screen hides the total');
    if (total[1] !== sTotal) bad(`total: screen ${sTotal}, CSV ${total[1]}`);
    if (portion[1] !== sPortion) bad(`portion: screen ${sPortion}, CSV ${portion[1]}`);
    if (listPortion !== sPortion) bad(`list says ${listPortion}, editor says ${sPortion}`);
    const row = allCsv.slice(1).find((r) => r[0] === 'Fiche');
    if (!row || row[2] !== sPortion) bad(`export-all portion ${row && row[2]}, editor ${sPortion}`);
  } else {
    unknownSeen++;
    if (sTotal !== null || sPortion !== null) bad('an unknown line, yet the screen shows a full total');
    if (total[1] !== 'Inconnu' || portion[1] !== 'Inconnu') bad(`an unknown line, yet CSV writes ${total[1]} / ${portion[1]}`);
    const row = allCsv.slice(1).find((r) => r[0] === 'Fiche');
    if (!row || row[2] !== 'Inconnu') bad('export-all writes a portion for an incomplete sheet');
  }
}

console.log('■ Coût simple · écran et CSV disent les mêmes chiffres');
try {
  await fc.assert(fc.asyncProperty(sheetArb, async (g) => { ran++; try { await oneSheet(g); } catch (e) { lastWhy = e.message; throw e; } return true; }), { numRuns: RUNS, examples: [[HALF_CENT]], ...(process.env.KIWI_PROPERTY_SEED ? { seed: Number(process.env.KIWI_PROPERTY_SEED) } : {}) });
  if (!knownSeen || !unknownSeen) bad(`generator never reached both outcomes (known ${knownSeen}, unknown ${unknownSeen})`);
  console.log(`  ✓ ${ran} fiches tirées (${knownSeen} complètes, ${unknownSeen} avec un inconnu) : chaque ligne, le total et la portion de l'écran sont ceux du CSV`);
} catch (e) { failed++; console.log('  ✗ parité écran / CSV (' + lastWhy + ')\n      ' + String((e && e.message) || e).split('\n').filter(Boolean).slice(0, 12).join(" | ")); }
process.exit(failed ? 1 : 0);
