#!/usr/bin/env node
/* Wave 13 · lane L · l'argent des caisses en centimes entiers, et la fidélité de la librairie.
 *
 *   boutiquetill#1  un seul module (assets/money-cents.js) pour passer du dirham saisi
 *                   ou affiché au centime entier, et la caisse boutique l'utilise
 *   loyalty#1       pos-librairie lit le programme du commerçant et gagne ses points par
 *                   le chemin commun (KiwiPosSale.attachClient -> /api/clients)
 *   loyalty#2       /api/clients calcule les points sur le montant du livre des ventes, en
 *                   centimes ; l'appareil n'est qu'un repli, et la réponse le dit
 *
 *   node tools/device-money-loyalty-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { server, ROOT as HARNESS_ROOT } from './customer-balance-harness.mjs';

const ROOT = HARNESS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let fc;
try { fc = createRequire(path.join(ROOT, 'app', 'package.json'))('fast-check'); }
catch (_) { console.log('  ○ skip  fast-check unavailable (npm --prefix app ci), device money not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 200;
let passed = 0;
async function strict(label, property) { await fc.assert(property, { numRuns: RUNS, seed: 20261028 }); passed++; console.log(`  ✓ ${label}`); }
function ok(label, fn) { return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${label}`); }); }

/* ── 1. KiwiMoney ─────────────────────────────────────────────────────────── */
const window = {};
vm.runInNewContext(read('assets/money-cents.js'), { globalThis: window, Intl, Number, Math, String, Array, Object });
const M = window.KiwiMoney;
assert.ok(M, 'KiwiMoney est publié');
/* La formule d'avant, recopiée de pos-boutique/sales.js, pour prouver que l'affichage ne change pas. */
const oldFmt = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true, minimumFractionDigits: Math.round(Number(Math.abs(n).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))) % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
const cents = fc.integer({ min: -100000000, max: 100000000 });

await strict('a centime amount survives MAD and back, whatever the float', fc.property(cents, (c) => M.toCents(M.toMad(c)) === c));
await strict('typed amounts: comma, dot and spaces give the same centimes', fc.property(fc.integer({ min: 0, max: 99999999 }), (c) => {
  const whole = Math.floor(c / 100), frac = String(c % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return [`${whole},${frac}`, `${whole}.${frac}`, `${grouped},${frac}`, `${whole}.${frac}`].every((t) => M.parseCents(t) === c);
}));
await strict('a sum of MAD amounts is the sum of their centimes, with no drift', fc.property(fc.array(fc.integer({ min: 0, max: 1999999 }), { maxLength: 40 }), (list) =>
  M.sumCents(list.map((c) => c / 100)) === list.reduce((a, b) => a + b, 0)));
await strict('format prints exactly what the old fmtMAD printed', fc.property(cents, (c) => M.format(c / 100) === oldFmt(c / 100)));
await ok('typed amounts that are not amounts are refused, extra decimals round half up', () => {
  assert.equal(M.parseCents('1 250,5'), 125050);
  assert.equal(M.parseCents('1.250,50'), 125050);
  assert.equal(M.parseCents('1,250.50'), 125050);
  assert.equal(M.parseCents('12.999'), 1300);
  assert.equal(M.parseCents('12.994'), 1299);
  assert.equal(M.parseCents('-3,5'), -350);
  for (const bad of ['', ' ', 'abc', '12x', '1,2,3,4,5.6.7', null, undefined]) assert.equal(M.parseCents(bad), null, String(bad));
  assert.equal(M.toCents(4.35), 435);
  assert.equal(M.toCents(1.005), 101);
  assert.equal(M.toCents('29,9') * 1, 2990);
});

/* ── 2. La caisse boutique passe par ce module ────────────────────────────── */
await ok('the boutique till converts through KiwiMoney, no ad hoc Math.round(x * 100) is left in checkout', () => {
  const checkout = read('assets/pos-boutique/checkout.js');
  assert.match(checkout, /import '\.\.\/money-cents\.js\?v=\d+'/);
  assert.deepEqual(checkout.match(/Math\.round\([^()]*\*\s*100\)|Math\.round\([^;\n]*\*\s*100\)\s*\/\s*100/g) || [], []);
  assert.doesNotMatch(read('assets/pos-boutique/sales.js'), /toExponential/);
});
await ok('the shell registry and the service worker know the new files at the same stamp', () => {
  const sw = read('kiwi-sw.js'), dispatch = read('assets/pos-dispatch.js');
  for (const f of ['money-cents', 'librairie-loyalty']) {
    const rev = dispatch.match(new RegExp(`file: '${f}', rev: '(\\d+)'`))[1];
    assert.ok(sw.includes(`'/assets/${f}.js?v=${rev}'`), f + ' precached at the dispatcher stamp');
  }
});

/* ── 3. /api/clients : les points sur le livre des ventes, en centimes ─────── */
const f = await server();
const purchase = async (saleCents, claimedCents, { sale = true, ref = 'purchase:client-fixture:s1', saleRef = 's1', cfg } = {}) => {
  await f.reset(cfg || { model: 'amount', amount: { perMad: 1, threshold: 100 } });
  if (sale) f.insert('s1', saleCents);
  const r = await f.clients({ purchase: { clientId: 'client-fixture', ref, saleRef, amount: claimedCents / 100 } });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
};
await strict('points come from centimes capped by the sale ledger: a device can declare less, never more', fc.asyncProperty(fc.integer({ min: 100, max: 1999999 }), fc.integer({ min: 1, max: 1999999 }), async (ledger, claimed) => {
  const body = await purchase(ledger, claimed);
  const expected = Math.min(ledger, claimed);
  assert.equal(body.amountSource, 'ledger');
  assert.equal(Math.round(body.spend * 100), expected);
  assert.equal(body.points, Math.floor(expected / 100));
  const row = f.rowClient();
  assert.equal(Math.round(row.spend * 100), expected);
  assert.equal(row.points, Math.floor(expected / 100));
}));
await ok('a sale not yet at the server falls back to the device amount and says so', async () => {
  const body = await purchase(0, 1299, { sale: false });
  assert.equal(body.amountSource, 'device');
  assert.equal(body.points, 12);
  assert.equal(Math.round(body.spend * 100), 1299);
});
await ok('a replay of the same purchase is still a replay when the ledger differs from the claim', async () => {
  await purchase(1000, 500);
  const again = await f.clients({ purchase: { clientId: 'client-fixture', ref: 'purchase:client-fixture:s1', saleRef: 's1', amount: 5 } });
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(f.rowClient().points, 5);
});

/* ── 4. La librairie : le programme du commerçant, le chemin commun ───────── */
function librairie({ real, config, loyaltyOn = true, book = {} }) {
  const attached = [];
  const clients = {
    list: () => Object.values(book),
    get: (id) => book[id] || null,
    config: () => config,
    loyaltyOn: () => loyaltyOn,
    upsert: (c) => { const rec = { id: 'k' + (Object.keys(book).length + 1), points: 0, stamps: 0, visits: 0, ...c }; book[rec.id] = rec; return rec; },
    redeem: (id) => { const rec = book[id]; rec.redeemed = (rec.redeemed || 0) + 1; rec.points -= config.amount ? config.amount.threshold : 0; return rec; },
  };
  const sale = { attachClient: (c) => { attached.push(c); sale.cur = c; }, attachedClient: () => sale.cur };
  const ctx = { window: {}, Math, Number, String, Array, Object, JSON, Intl, RegExp };
  ctx.window.KiwiClients = clients; ctx.window.KiwiPosSale = sale; ctx.globalThis = ctx.window;
  vm.runInNewContext(read('assets/librairie-loyalty.js'), ctx);
  const loy = ctx.window.KiwiLibrairieLoyalty.create({ real: () => real });
  return { loy, attached, book, sale };
}
await ok('a real librairie reads the merchant programme: no hard-coded 500 points, no hard-coded -5 %', () => {
  const book = { a: { id: 'a', name: 'Naima', phone: '0661', points: 250, stamps: 0, visits: 3 } };
  const { loy } = librairie({ real: true, book, config: { model: 'amount', amount: { perMad: 1, threshold: 200, reward: '−12 %' } } });
  assert.equal(loy.live(), true);
  assert.equal(loy.ready(loy.get('a')), true, '250 points reach a 200-point goal');
  assert.equal(loy.rewardFor(loy.get('a')).value, 12);
  assert.equal(loy.discount(loy.get('a'), 100, []), 12);
  assert.match(loy.rule(), /−12 %.*200 points/);
  const { loy: tough } = librairie({ real: true, book, config: { model: 'amount', amount: { perMad: 1, threshold: 800, reward: '−5 %' } } });
  assert.equal(tough.ready(tough.get('a')), false, '250 points do not reach 800');
  assert.equal(tough.discount(tough.get('a'), 100, []), 0);
});
await ok('no programme chosen by the merchant: nothing is promised or earned', () => {
  const book = { a: { id: 'a', name: 'Naima', points: 999, stamps: 0, visits: 3 } };
  const { loy } = librairie({ real: true, book, loyaltyOn: false, config: { model: 'amount', auto: true, amount: { perMad: 1, threshold: 100 } } });
  assert.equal(loy.ready(loy.get('a')), false);
  assert.match(loy.rule(), /Aucun programme/);
});
await ok('a stamp card gives the cheapest article, not a percentage', () => {
  const book = { a: { id: 'a', name: 'Naima', points: 0, stamps: 10, visits: 10 } };
  const { loy } = librairie({ real: true, book, config: { model: 'visit', visit: { target: 10, reward: 'un cahier offert' } } });
  assert.equal(loy.discount(loy.get('a'), 90, [30, 60]), 30);
});
await ok('a real sale earns through the shared path: client attached to the sale, points read back from the book, reward spent', () => {
  const book = { a: { id: 'a', name: 'Naima', phone: '0661', points: 250, stamps: 0, visits: 3 } };
  const { loy, attached, sale } = librairie({ real: true, book, config: { model: 'amount', amount: { perMad: 1, threshold: 200, reward: '−10 %' } } });
  const cu = loy.get('a');
  const mark = loy.begin(cu);
  assert.deepEqual(attached.map((c) => c.id), ['a'], 'pos-sale credits this client when the sale is recorded');
  book.a.points += 90;                       // what pos-sale -> recordPurchase credited
  const msg = loy.finish(cu, mark, { total: 90, rewardUsed: true, items: [] });
  assert.match(msg, /\+90 pts/);
  assert.equal(book.a.redeemed, 1, 'the reward was spent from the shared book');
  assert.equal(sale.cur, null, 'the client does not stay attached to the next sale');
});
await ok('the librairie never writes points on the device when it is real', () => {
  const src = read('assets/pos-librairie.js');
  assert.doesNotMatch(src, /cu\.points \+= total/);
  assert.doesNotMatch(src, /FID_TIER|FID_RATE/);
  assert.doesNotMatch(src, /GENERATED SHARED/);
  assert.match(src, /KiwiLibrairieLoyalty\.create/);
  const { loy, book } = librairie({ real: true, config: { model: 'amount', amount: { perMad: 1, threshold: 100 } }, book: { a: { id: 'a', name: 'N', points: 5, stamps: 0, visits: 1 } } });
  const cu = loy.get('a');
  loy.finish(cu, loy.begin(cu), { total: 40, rewardUsed: false, items: [] });
  assert.equal(book.a.points, 5, 'the till itself added nothing, the book decides');
});
await ok('the demo keeps its six clients and sample programme, spends points, and never touches the real book', () => {
  const { loy, attached, book } = librairie({ real: false, config: { model: 'amount', amount: { perMad: 1, threshold: 1 } }, book: { a: { id: 'a', points: 0 } } });
  assert.equal(loy.live(), false);
  assert.equal(loy.list(), null);
  const cu = { id: 'c1', name: 'Naima', points: 640, visits: 19 };
  assert.equal(loy.ready(cu), true, 'demo goal is the sample 500 points');
  assert.equal(loy.discount(cu, 100, []), 5);
  const msg = loy.finish(cu, loy.begin(cu), { total: 100, rewardUsed: true, items: [] });
  assert.equal(attached.length, 0);
  assert.equal(cu.points, 640 + 100 - 500);
  assert.equal(cu.visits, 20);
  assert.match(msg, /\+100 pts/);
  assert.equal(book.a.points, 0);
});
await ok('the dispatcher loads the librairie dependencies, in order, before its script', () => {
  const dispatch = read('assets/pos-dispatch.js');
  assert.match(dispatch, /file: 'pos-librairie'[^}]*deps: \[\{ file: 'money-cents'[^\]]*file: 'librairie-loyalty'/);
  assert.match(dispatch, /function loadDep\(/);
});

await ok('the dispatcher really loads deps first, in order, and a failed dep is not cached as loaded', async () => {
  const dispatch = read('assets/pos-dispatch.js');
  const loader = dispatch.slice(dispatch.indexOf('  function loadDep('), dispatch.indexOf('  function rootFor('));
  const tags = [], apps = {}, loading = {};
  const context = vm.createContext({ apps, loading, Promise, Error, encodeURIComponent,
    document: { createElement: (tag) => ({ tag, remove() {} }), head: { appendChild: (el) => tags.push(el) } } });
  vm.runInContext(loader + '\nthis.load = ensureLoaded;', context);
  const entry = { id: 'librairie', file: 'pos-librairie', rev: '1', deps: [{ file: 'money-cents', rev: '1' }, { file: 'librairie-loyalty', rev: '1' }] };
  const pending = context.load(entry);
  assert.equal(context.load(entry), pending, 'deduplicated');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(tags.map((t) => t.src), ['assets/money-cents.js?v=1'], 'only the first dep until it is loaded');
  tags[0].onload(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(tags.filter((t) => t.tag === 'script').map((t) => t.src), ['assets/money-cents.js?v=1', 'assets/librairie-loyalty.js?v=1']);
  tags.find((t) => t.src === 'assets/librairie-loyalty.js?v=1').onload(); await new Promise((r) => setImmediate(r));
  const main = tags.find((t) => t.src === 'assets/pos-librairie.js?v=1');
  assert.ok(main, 'the vertical script comes last');
  apps.librairie = {}; main.onload(); await pending;
  // a dep that fails to load rejects the vertical and is retried next time
  const failing = { id: 'x', file: 'pos-x', rev: '1', deps: [{ file: 'gone', rev: '1' }] };
  const p2 = context.load(failing);
  await new Promise((r) => setImmediate(r));
  tags.filter((t) => t.src === 'assets/gone.js?v=1')[0].onerror();
  await assert.rejects(p2, /introuvable/);
  assert.ok(!loading['dep:gone'] && !loading['pos-x'], 'nothing cached after a failure');
});

console.log(`✓ ${passed} device money and loyalty checks green`);
