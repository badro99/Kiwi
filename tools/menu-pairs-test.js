#!/usr/bin/env node
/* « Souvent pris ensemble » (Analyse du menu, assets/restaurant-menu-workspace.js).
 *
 * Les comptes sont refaits ici, ticket par ticket, sans le code testé :
 *   · une paire n'est citée que sur 5 tickets au moins ET plus souvent que le
 *     hasard (lift ≥ 1,2) : deux plats très vendus qui se croisent par hasard
 *     ne sont pas une « paire » ;
 *   · une ligne à 0 MAD (le choix d'une formule) ne fait pas une paire ;
 *   · un ticket annulé, reçu deux fois ou hors période ne compte pas ;
 *   · sous 40 tickets, la section dit qu'elle ne sait pas encore ;
 *   · FR, EN, AR. */
'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

const now = Date.now();
const items = [
  { id: 'cafe', name: 'Café noir', price: 12, catId: 'boissons' },
  { id: 'tajine', name: 'Tajine', price: 70, catId: 'plats' },
  { id: 'dessert', name: 'Dessert du jour', price: 25, catId: 'plats' },
  { id: 'the', name: 'Thé à la menthe', price: 15, catId: 'boissons' },
  { id: 'msemen', name: 'Msemen', price: 8, catId: 'plats' },
  { id: 'jus', name: 'Jus d’orange', price: 18, catId: 'boissons' },
  { id: 'crepe', name: 'Crêpe', price: 20, catId: 'plats' },
];
const price = Object.fromEntries(items.map((x) => [x.id, x.price]));

/* tickets: [[ids], options] */
function build(spec) {
  const out = [];
  let n = 0;
  spec.forEach(([count, ids, extra]) => {
    for (let i = 0; i < count; i++) {
      const id = 't' + (n++);
      const lines = ids.map((x) => ({ itemId: x, name: items.find((y) => y.id === x).name, qty: 1, total: price[x] }));
      if (ids.includes('tajine')) lines.push({ itemId: 'dessert', name: 'Dessert du jour', qty: 1, total: 0 });
      out.push(Object.assign({ id, ts: now - (i % 20) * 3600e3, lines }, extra || {}));
    }
  });
  return out;
}

const BASE = [
  [30, ['cafe']],
  [30, ['cafe', 'tajine']],
  [20, ['tajine']],
  [15, ['the', 'msemen']],
  [5, ['the']],
  [5, ['msemen']],
  [3, ['jus', 'crepe']],
];
let sales = build(BASE);
/* reçu deux fois (même id), annulé, hors période : rien de tout ça ne compte */
const noise = [
  Object.assign({}, sales.find((s) => s.lines.some((l) => l.itemId === 'the'))),
  ...build([[12, ['jus', 'crepe'], { void_ts: now }]]).map((s, i) => Object.assign(s, { id: 'v' + i })),
  ...build([[12, ['jus', 'crepe'], { ts: now - 45 * 864e5 }]]).map((s, i) => Object.assign(s, { id: 'old' + i })),
];

let L = 'fr';
const root = { hidden: true, innerHTML: '' };
const classList = { add() {}, remove() {}, toggle() {}, contains: (x) => x === 'page-menu' };
const node = () => ({ id: '', textContent: '', innerHTML: '', style: {}, classList, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = {
  readyState: 'complete', body: { classList }, head: { appendChild() {} },
  querySelector: (s) => s === '[data-menu-root]' ? root : s === '.breadcrumb' ? { innerHTML: '' } : null,
  querySelectorAll: () => [], createElement: node, addEventListener() {},
};
const data = { cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }], items, stations: [], opts: [] };
let current = sales.concat(noise);
const window = {
  Kiwi: { handlers: {}, pageShell() {}, setActivePage() {} },
  KiwiI18n: { getLang: () => L },
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'resto', name: 'Restaurant test', type: 'restaurant' }), getVenueType: () => 'restaurant', subscribe() {} },
  KiwiMenuStore: { data: () => data, items: () => data.items, subscribe() {}, kitchenId: () => '' },
  KiwiSales: { list: () => current },
  addEventListener() {},
};
const context = { window, document, console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), innerWidth: 1400, innerHeight: 900, Date, Math, Intl, Map, Set, Number, String, Array, Object, RegExp };
window.window = window;
window.document = document;
vm.createContext(context);
require('./kiwi-cost-harness').loadCost(context);
new vm.Script(fs.readFileSync('assets/restaurant-menu-workspace.js', 'utf8')).runInContext(context);
const A = window.KiwiRestaurantMenuWorkspace.analysis;

/* Le compte indépendant : tickets uniques, dans la fenêtre, non annulés,
 * lignes payées seulement. */
function recount(list) {
  const seen = new Set(), tickets = [];
  list.forEach((s) => {
    if (s.void_ts || s.ts < now - 30 * 864e5 || seen.has(s.id)) return;
    seen.add(s.id);
    tickets.push(new Set(s.lines.filter((l) => l.total > 0).map((l) => l.itemId)));
  });
  const N = tickets.length, n = (x) => tickets.filter((t) => t.has(x)).length, nn = (x, y) => tickets.filter((t) => t.has(x) && t.has(y)).length;
  return { N, n, nn, lift: (x, y) => nn(x, y) * N / (n(x) * n(y)) };
}

console.log('\n■ Souvent pris ensemble');
{
  const R = recount(current);
  const q = A.pairs();
  ok(q.tickets === R.N && R.N === 108, `tickets counted once, voided and out-of-period ones left out (${q.tickets})`);
  ok(q.enough, '108 tickets are enough to speak');
  ok(q.pairs.length === 1, `one pair only qualifies (${q.pairs.map((p) => p.from + '+' + p.to).join(', ')})`);
  const p = q.pairs[0];
  ok(p.from === 'msemen' && p.to === 'the' && p.together === R.nn('the', 'msemen'), `Msemen and Thé: together on ${p.together} tickets`);
  ok(Math.abs(p.lift - R.lift('the', 'msemen')) < 1e-9 && Math.abs(p.share - R.nn('the', 'msemen') / R.n('msemen')) < 1e-9, `lift ${p.lift.toFixed(2)} and share ${Math.round(p.share * 100)} % recomputed independently`);
  ok(R.nn('cafe', 'tajine') === 30 && R.lift('cafe', 'tajine') < 1.2 && !q.pairs.some((x) => x.from === 'cafe' || x.to === 'cafe'),
    `Café + Tajine share 30 tickets but only at chance (lift ${R.lift('cafe', 'tajine').toFixed(2)}): not cited`);
  ok(!q.pairs.some((x) => x.from === 'dessert' || x.to === 'dessert'), 'the dessert inside the formula (0 MAD) makes no pair with the tajine');
  ok(R.nn('jus', 'crepe') === 3 && !q.pairs.some((x) => x.from === 'jus' || x.from === 'crepe'), 'Jus + Crêpe on 3 tickets only: too few, not cited');

  root.innerHTML = A.performance();
  const html = root.innerHTML;
  ok(/<h3>Souvent pris ensemble<\/h3>/.test(html), 'the section shows in Performance');
  ok(html.includes('75 % des tickets avec <bdi>Msemen</bdi> prennent aussi <bdi>Thé à la menthe</bdi>'), 'it reads as a sentence: 75 % of tickets with Msemen also have Thé, each name isolated for right-to-left');
  ok(/ensemble sur 15 tickets · 4,[01]× le hasard/.test(html), 'with how many tickets and how far above chance');
  ok(!/[—]/.test(html.slice(html.indexOf('data-pairs'))), 'no em dash in the section');

  L = 'en';
  ok(A.performance().includes('75 % of tickets with <bdi>Msemen</bdi> also have'), 'English');
  L = 'ar';
  const ar = A.performance();
  ok(ar.includes('يُطلب معاً غالباً') && ar.includes('من التذاكر التي فيها'), 'Arabic');
  L = 'fr';
}
{
  current = build([[30, ['cafe']], [5, ['the', 'msemen']]]);
  const q = A.pairs();
  ok(!q.enough && q.pairs.length === 0, `35 tickets: not enough, nothing claimed (${q.tickets} of ${q.min})`);
  const html = A.performance();
  ok(html.includes('Pas encore assez de tickets pour le dire : 35 sur les 40 nécessaires.'), 'and it says so, with the count');
}
{
  current = build([[30, ['cafe']], [30, ['cafe', 'tajine']], [20, ['tajine']]]);
  const html = A.performance();
  ok(A.pairs().enough && html.includes('Aucune paire ne revient plus souvent que le hasard sur cette période.'), 'enough tickets, no real pair: it says none, it invents none');
}

console.log(`\nmenu-pairs: ${pass} passed`);
