#!/usr/bin/env node
'use strict';
/* Restaurant MixMax, septembre 2026. « Performance des articles · 30 derniers
 * jours » affichait 20 980 MAD alors que le registre de la même période portait
 * 28 767 MAD de ventes brutes, 205 MAD de remboursements et 28 562 MAD net.
 * Causes confirmées :
 *   1. les lignes « Article libre » (7 787 MAD) disparaissaient sans un mot ;
 *   2. la fenêtre glissait sur now − 30×24 h, dans le fuseau du navigateur,
 *      au lieu des journées commerciales du commerce ;
 *   3. un même règlement arrivé sous plusieurs ids était compté plusieurs fois ;
 *   4. un sous-ensemble (les plats de la carte) était présenté comme LE
 *      chiffre d'affaires, et rien ne disait si l'historique était chargé.
 * Ce test rejoue ces cas avec la forme réelle des données du tableau de bord
 * (KiwiSales + KiwiRefunds) et le vrai calendrier commercial (day-report.js). */

process.env.TZ = 'Europe/Berlin'; // navigateur hors du Maroc : le calcul doit rester en heure de Casablanca

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const items = [
  { id: 'it_30', name: 'King Shawarma', price: 60, catId: 'shawarma' },
  { id: 'it_17', name: 'Shawarma', price: 25, catId: 'shawarma' },
  { id: 'it_kids', name: 'Shawarma', price: 20, catId: 'kids' },
  { id: 'it_87', name: 'Soda', price: 10, catId: 'boissons' },
];
const root = { hidden: true, innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = {
  readyState: 'complete', body: { classList }, head: { appendChild() {} },
  querySelector: (s) => s === '[data-menu-root]' ? root : s === '.breadcrumb' ? { innerHTML: '' } : null,
  querySelectorAll: () => [], createElement: node, addEventListener() {},
};
const data = { cats: [{ id: 'shawarma', name: 'Shawarma' }, { id: 'kids', name: 'Menu Enfants' }, { id: 'boissons', name: 'Boissons' }], items, stations: [], opts: [] };
const memory = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'restaurant-test', type: 'restaurant' })]]);
const localStorage = { getItem: (k) => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

let salesRows = [];
let refundRows = [];
let liveStatus = { backfillComplete: true };
const window = {
  localStorage,
  Kiwi: { handlers: {}, pageShell() {}, setActivePage() {} },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant test', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
  KiwiMenuStore: { data: () => data, subscribe() {}, kitchenId: () => '' },
  KiwiSales: { list: () => salesRows },
  KiwiRefunds: { list: () => refundRows },
  KiwiLive: { status: () => liveStatus },
  KiwiRestaurantRecipes: {
    get: (id) => id === 'it_30' ? { itemId: id, ingredients: [{}] } : null,
    metrics: () => ({ costComplete: true, theoreticalCost: 20, actualCost: null }),
  },
  addEventListener() {},
};
const context = { window, document, localStorage, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900, Date, Math, Intl, Map, Set, Number, String, Array, Object, RegExp, JSON };
window.window = window;
window.document = document;
vm.createContext(context);
new vm.Script(fs.readFileSync('assets/day-report.js', 'utf8')).runInContext(context);
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);

const DR = window.KiwiDayReport;
const today = DR.today();
const firstDay = DR.shiftDay(today, -29);
const start = DR.dayBounds(firstDay).from;           // 05:00 Casablanca, 30 business days ago
const inside = start + 3600e3;                        // well inside the first business day
const line = (i, n, q, t) => ({ i, n, q, t });

let cursor = 0;
const sale = (o) => Object.assign({ cursor: ++cursor, method: 'cash', label: 'Vente' }, o);
salesRows = [
  /* Just before the first business day: outside, even though it is < 30×24 h
     before the end of today for most of the day. */
  sale({ saleId: 's-before', ts: start - 1000, amount: 999, amountCents: 99900, ref: 'B', lines: [line('it_30', 'King Shawarma', 1, 999)] }),
  sale({ saleId: 's1', ts: inside, amount: 145, amountCents: 14500, ref: '1',
    lines: [line('it_30', 'King Shawarma', 1, 60), line('it_17', 'Shawarma (Pain Pita · Fromage)', 2, 60), line('libre', 'Article libre', 1, 25)] }),
  /* The same settlement three times: same ticket, same millisecond, same basket. */
  sale({ saleId: 'visit-tsx-A-emp', ts: inside + 5000, amount: 85, amountCents: 8500, ref: '94', lines: [line('it_30', 'King Shawarma', 1, 60), line('it_17', 'Shawarma (Pain Pita)', 1, 25)] }),
  sale({ saleId: 'visit-tsx-B-emp', ts: inside + 5000, amount: 85, amountCents: 8500, ref: '94', lines: [line('it_30', 'King Shawarma', 1, 60), line('it_17', 'Shawarma (Pain Pita)', 1, 25)] }),
  sale({ saleId: 'visit-tsx-C-emp', ts: inside + 5000, amount: 85, amountCents: 8500, ref: '94', lines: [line('it_30', 'King Shawarma', 1, 60), line('it_17', 'Shawarma (Pain Pita)', 1, 25)] }),
  /* Same basket and ticket, different time: a real second sale. */
  sale({ saleId: 'visit-tsx-D-emp', ts: inside + 9000, amount: 85, amountCents: 8500, ref: '94', lines: [line('it_30', 'King Shawarma', 1, 60), line('it_17', 'Shawarma (Pain Pita)', 1, 25)] }),
  /* A kids product with the same name as the adult one: stays on its own id. */
  sale({ saleId: 's3', ts: inside + 20000, amount: 20, amountCents: 2000, ref: '3', lines: [line('it_kids', 'Shawarma', 1, 20)] }),
  /* A deleted product and a discounted ticket (lines 50, paid 45). */
  sale({ saleId: 's4', ts: inside + 30000, amount: 45, amountCents: 4500, ref: '4', lines: [line('it_old', 'Pizza Fruits de Mer', 1, 50)] }),
  /* A ticket without line detail. */
  sale({ saleId: 's5', ts: inside + 40000, amount: 30, amountCents: 3000, ref: '5' }),
  /* A voided sale never counts. */
  sale({ saleId: 's6', ts: inside + 50000, amount: 500, amountCents: 50000, ref: '6', void_ts: inside + 60000, lines: [line('it_30', 'King Shawarma', 1, 500)] }),
];
refundRows = [
  { cursor: 900, saleId: 'r1', ts: inside + 70000, amount: 40, method: 'cash', ref: 'R1' },
  { cursor: 901, saleId: 'r-before', ts: start - 5000, amount: 70, method: 'cash', ref: 'R0' },
];

function render() {
  window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'performance' } });
  return root.innerHTML;
}
const money = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n) + ' MAD';
const has = (html, text, msg) => assert.ok(html.includes(text), `${msg}\n  expected to find: ${text}`);

let html = render();
/* gross = 145 + 85 + 85 + 20 + 45 + 30 = 410 ; duplicates excluded = 2 × 85 */
assert.match(html, /data-ledger-gross="410\.00"/, 'gross sales cover every live settlement once, including free-amount and unitemised tickets');
assert.match(html, /data-ledger-net="370\.00"/, 'net = gross minus refunds from KiwiRefunds inside the window');
has(html, money(410), 'gross sales are displayed');
has(html, '− ' + money(40), 'refunds are displayed separately');
has(html, money(370), 'net revenue is displayed');
has(html, '2 règlement(s) en double exclu(s) (' + money(170) + ')', 'duplicate settlements are excluded AND disclosed');
has(html, 'Article libre', 'free-amount items stay visible');
has(html, 'Pizza Fruits de Mer', 'a deleted product keeps its historical sales');
has(html, 'Hors de la carte actuelle', 'the deleted product is labelled as off-menu');
/* itemised = 145 + 85 + 85 + 20 + 50 = 385 ; unitemised = 410 − 385 = 25 (discount −5, ticket without detail +30) */
has(html, money(25) + ' de ventes ne sont pas expliqués', 'the gap between sales and item lines is named, never spread');
/* recipe-eligible = menu lines only = (60+60) + 85 + 85 + 20 = 310 */
has(html, 'CA analysable en recettes', 'recipe-eligible revenue has its own label');
assert.match(html, /CA analysable en recettes<\/span><b>310 MAD<\/b>/, 'recipe-eligible revenue excludes free-amount and off-menu lines');
assert.match(html, /<b>Shawarma<\/b><small>Menu Enfants<\/small><\/td><td>1<\/td><td>20 MAD/, 'kids Shawarma keeps its own id and sale');
assert.match(html, /<b>Shawarma<\/b><small>Shawarma<\/small><\/td><td>4<\/td><td>110 MAD/, 'adult Shawarma sums its option variants by id');
assert.match(html, /<b>King Shawarma<\/b><small>Shawarma<\/small><\/td><td>3<\/td><td>180 MAD/, 'duplicates are not counted in product quantities');
assert.ok(!html.includes('999 MAD') && !html.includes(money(999)), 'a sale one second before the first business day is outside the window');
assert.ok(!html.includes(money(500)), 'a voided sale is not counted');
assert.match(html, /Du .+ au .+ · journées commerciales/, 'the exact business-day range is displayed');
assert.ok(!html.includes('en cours de chargement'), 'a complete feed is not flagged as partial');

liveStatus = { backfillComplete: false };
html = render();
has(html, 'Ces chiffres sont partiels, pas 30 jours complets', 'an incomplete history is never presented as 30 days');

/* Peak hours: a sale at 20:30 UTC is 21:30 in Casablanca (UTC+1) and 22:30 in
   this process's Berlin clock. It must land in the 21h bucket. */
liveStatus = { backfillComplete: true };
window.KiwiHours = { isConfigured: () => false, get: () => null, subscribe() {} };
const evening = DR.dayBounds(DR.shiftDay(today, -1)).from + 16.5 * 3600e3; // yesterday 05:00 + 16h30 = 21:30 Casablanca
salesRows = [sale({ saleId: 'h1', ts: evening, amount: 60, amountCents: 6000, ref: 'H1', lines: [line('it_30', 'King Shawarma', 1, 60)] })];
refundRows = [];
window.Kiwi.handlers['rmw-tab']({ dataset: { tab: 'hours' } });
assert.match(root.innerHTML, /21h-22h/, 'peak hours bucket sales in the merchant timezone, not the browser timezone');
assert.doesNotMatch(root.innerHTML, /22h-23h/, 'no bucket at the Berlin wall-clock hour');

console.log('✓ menu performance reconciles gross, refunds, net, duplicates, free-amount and off-menu lines over exact business days');
