#!/usr/bin/env node
/* Kiwi · promo-price-freeze-test.mjs · promos#2.
 *
 * "Une commande prise avant le début d'une promotion garde son prix." The
 * monotonic / bounded assertions in money-properties-test.mjs say a promotion
 * never charges MORE than the shelf; they do not say a price already given
 * stays given. This runs the real chain, in the order the till runs it:
 *   assets/promos.js (real store, real rules)  ->  promoFor
 *   assets/pos-boutique/sales.js addToTicket   ->  stamps the line
 *   assets/pos-boutique.js lineDeal/lineTotal  ->  what the line is charged
 * and then moves the clock and the promotion list underneath an open ticket.
 *
 * What the till promises (comment in addToTicket, owner rule 2026-10-19):
 *   · a line taken while an offer runs is stamped with that price and keeps it,
 *     whatever happens to the promotion afterwards (deeper, paused, deleted);
 *   · a line taken with NO offer in force carries no stamp and follows the rule
 *     in force when the ticket is paid. That is deliberate, pinned here so a
 *     change of it is a decision, not an accident.
 *   · a line taken under a shallower offer is never re-priced by a deeper one.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharedRules from './shared-rules-source.cjs';
import maisonSource from './pos-maison-test-source.cjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fc;
try { fc = createRequire(path.join(ROOT, 'app', 'package.json'))('fast-check'); }
catch (_) { console.log('  ○ skip  fast-check unavailable (npm --prefix app ci), promo price freeze not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 200;
let passed = 0, failed = 0;
async function strict(label, property) {
  try { await fc.assert(property, { numRuns: RUNS }); passed++; console.log('  ✓ ' + label); }
  catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String((e && e.message) || e).split('\n').filter(Boolean).slice(0, 3).join(' | ')); }
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function grabFn(src, start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(start + ' not found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

/* The real promotion store, on its own localStorage. */
function makeStore() {
  const mem = new Map();
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const window = { localStorage };
  vm.runInNewContext(maisonSource(read('assets/promo-rules.js') + '\n' + read('assets/promos.js')),
    { window, localStorage, console, Set, Map, Math, Date, JSON, Number, Object, Array, String, Intl }, { filename: 'promos.js' });
  return window.KiwiPromos;
}

/* The real till functions, lifted, wired to that store and a movable clock. */
const POS = maisonSource(read('assets/pos-boutique.js'));
const SALES_SRC = read('assets/pos-boutique/sales.js');
function till(PR, item) {
  const clock = { now: 0 };
  const P = { p1: item };
  const ticket = { lines: [] };
  const state = { ticket };
  const ctx = vm.createContext({
    Math, Number, Array, Date, String, Object, JSON, P, state, clock,
    promoFor: (pid) => PR.priceFor(P[pid], { now: clock.now }),
    availableStock: () => 99, stockAdd: () => {}, colorLabel: () => '', toast: () => {},
    renderTicket: () => {}, renderGrid: () => {}, renderBadges: () => {}, icons: () => {},
    ticketOwner: { addLine: (t, line) => { t.lines.push(line); } },
  });
  vm.runInContext([
    sharedRules(POS),
    POS.match(/const shelf = [^\n]+\n/)[0],
    grabFn(POS, 'function lineDeal('),
    POS.match(/const linePromo = [^\n]+\n/)[0],
    POS.match(/const lineBase {0,2}= [^\n]+\n/)[0],
    POS.match(/const lineUnit {0,2}= \(ln\) => [^\n]+\n/)[0],
    POS.match(/const lineTotal = [^\n]+\n/)[0],
    grabFn(SALES_SRC, 'function addToTicket('),
    'this.api = { lineDeal, lineUnit, lineTotal, addToTicket };',
  ].join('\n'), ctx);
  return { api: ctx.api, clock, ticket };
}

const cents = fc.integer({ min: 200, max: 400000 });
const percent = fc.integer({ min: 1, max: 90 });
const T0 = Date.UTC(2026, 10, 3, 12, 0, 0);   /* a Tuesday noon, Casablanca */
const HOUR = 3600 * 1000;

console.log('■ Une promotion qui démarre après la prise de la ligne');

await strict('ligne prise AVANT le début : sans tampon, elle suit la règle en vigueur, jamais un prix inventé', fc.property(cents, percent, (c, pct) => {
  const PR = makeStore();
  const shelf = c / 100;
  PR.save({ id: 'later', kind: 'percent', value: pct, scope: { type: 'tout' }, from: T0 + HOUR });
  const t = till(PR, { id: 'p1', price: shelf, rayon: 'r' });
  t.clock.now = T0;
  t.api.addToTicket('p1', { size: 'U', color: '', qty: 1, remise: 0 }, { quiet: true });
  const line = t.ticket.lines[0];
  const before = t.api.lineDeal(line).price;
  t.clock.now = T0 + 2 * HOUR;
  const after = t.api.lineDeal(line).price;
  return line.promo === null && before === Math.floor(shelf * 100 + 1e-6) / 100 && after <= before
    && after === PR.priceFor({ id: 'p1', price: shelf, rayon: 'r' }, { now: t.clock.now }).price;
}));

await strict('ligne prise PENDANT une offre : le prix tamponné ne bouge plus quand une offre plus forte démarre, quand elle est mise en pause ou supprimée', fc.property(cents, percent, percent, fc.constantFrom('deeper', 'pause', 'delete', 'expire'), (c, p1, p2, what) => {
  const PR = makeStore();
  const shelf = c / 100;
  PR.save({ id: 'now', kind: 'percent', value: p1, scope: { type: 'tout' }, to: T0 + 3 * HOUR });
  const t = till(PR, { id: 'p1', price: shelf, rayon: 'r' });
  t.clock.now = T0;
  t.api.addToTicket('p1', { size: 'U', color: '', qty: 2, remise: 0 }, { quiet: true });
  const line = t.ticket.lines[0];
  const frozen = t.api.lineDeal(line).price, total = t.api.lineTotal(line);
  if (what === 'deeper') PR.save({ id: 'deep', kind: 'percent', value: 95, scope: { type: 'tout' }, from: T0 + HOUR });
  if (what === 'pause') PR.setPaused('now', true);
  if (what === 'delete') PR.remove('now');
  t.clock.now = what === 'expire' ? T0 + 5 * HOUR : T0 + 2 * HOUR;
  return line.promo && line.promo.price === frozen && t.api.lineDeal(line).price === frozen && t.api.lineTotal(line) === total;
}));

await strict('la même règle vaut pour la ligne tamponnée et le ticket payé : total = unité tamponnée × quantité, remise de ligne comprise', fc.property(cents, percent, fc.constantFrom(0, 5, 10, 20), fc.integer({ min: 1, max: 9 }), (c, pct, remise, qty) => {
  const PR = makeStore();
  const shelf = c / 100;
  PR.save({ id: 'a', kind: 'percent', value: pct, scope: { type: 'tout' } });
  const t = till(PR, { id: 'p1', price: shelf, rayon: 'r' });
  t.clock.now = T0;
  t.api.addToTicket('p1', { size: 'U', color: '', qty, remise }, { quiet: true });
  const line = t.ticket.lines[0];
  PR.remove('a');
  t.clock.now = T0 + HOUR;
  return t.api.lineTotal(line) === Math.round(t.api.lineUnit(line) * 100) * qty / 100 && t.api.lineUnit(line) <= line.promo.price;
}));

console.log(`\n  ${failed ? '✗' : '✓'} promo price freeze: ${passed} properties green${failed ? ', ' + failed + ' failed' : ''}`);
process.exit(failed ? 1 : 0);
