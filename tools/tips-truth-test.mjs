#!/usr/bin/env node
/* « Pourboires » sur le tableau de bord : ce que la caisse a déclaré, jamais
 * une estimation.
 *
 * La tuile valait CA × 7,2 % (TIP_RATE) chez un vrai commerçant : un montant
 * inventé, affiché sous « Pourboires » sans qu'un dirham de pourboire ait été
 * saisi. Elle lit maintenant les pourboires déclarés à la clôture des journées
 * de la période (KiwiDayReport, synchro « dayreports »). Une journée encore
 * ouverte n'est pas comptée ; aucune journée close : « · ».
 *
 * Comme tools/kpi-ledger-test.js : les tuiles ne sont pas exportées, on extrait
 * donc du VRAI assets/dateRange.js la fonction realClosedTips et la tuile
 * `tips`, et on les exécute telles quelles avec les bornes de jour fournies. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
let failures = 0, passed = 0;
const check = (label, ok, detail) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (detail ? '\n      ' + detail : '')); } };

console.log('■ Pourboires (tools/tips-truth-test.mjs)');
const fnFrom = SRC.indexOf('  function screenBook() {');
const fnTo = SRC.indexOf('  function windowDays(range) {');
const tipFrom = SRC.indexOf('    tips:       { labels:');
const tipTo = SRC.indexOf('    success:    { labels:', tipFrom);
check('realClosedTips and the tips tile are extractable', fnFrom > 0 && fnTo > fnFrom && tipFrom > 0 && tipTo > tipFrom);
if (failures) process.exit(1);

/* Jours de caisse en clair : un horodatage = le jour qu'il porte (UTC midi). */
const DAY = 864e5;
const TODAY = '2026-10-13';
const ts = (day) => Date.parse(day + 'T12:00:00Z');
const keyOf = (t) => new Date(t).toISOString().slice(0, 10);
const bounds = {
  aujourdhui: [Date.parse(TODAY + 'T05:00:00Z'), Infinity],
  septJours: [Date.parse('2026-10-07T05:00:00Z'), Infinity],
  hier: [Date.parse('2026-10-12T05:00:00Z'), Date.parse('2026-10-13T05:00:00Z')],
};
const asked = [];
function run({ real, book, range, revenue = 10000, venueType = 'restaurant', noBook = false, venue = { slug: 'cafe-test', name: 'Café Test' }, custom = true, sales = [] }) {
  const window = {
    KiwiDayReport: noBook ? undefined : { list: (slug) => { asked.push(slug); return slug === 'cafe-test' ? book.slice() : [{ day: '2026-10-12', closed: true, tips: 5000 }]; } },
    KiwiVenue: { isCustom: () => custom, getCurrentVenueData: () => venue },
  };
  const ctx = vm.createContext({
    window, Date: class extends Date { static now() { return ts(TODAY); } }, Math, Number, Infinity,
    ownData: () => real, currentRange: range,
    rangeBounds: (r) => bounds[r], activeMerchantSlug: () => 'cafe-test', merchantDayKey: (t) => keyOf(t),
    TIP_RATE: { restaurant: 0.072, boutique: 0 }, revOf: (d) => (d.revenue ? d.revenue.value : null),
    revDelta: () => 3.2,
    realSalesList: () => sales,
  });
  vm.runInContext(SRC.slice(fnFrom, fnTo) + '\nvar __tile = {' + SRC.slice(tipFrom, tipTo) + '}.tips;', ctx);
  return ctx.__tile.derive({ revenue: { value: revenue } }, { venueType, range });
}
const book = [
  { day: TODAY, closed: false, tips: 50 },         // journée ouverte : rien de déclaré
  { day: '2026-10-12', closed: true, tips: 120 },
  { day: '2026-10-10', closed: true, tips: 80.4 },
  { day: '2026-10-09', closed: true, tips: 0 },    // close, sans pourboire
  { day: '2026-09-01', closed: true, tips: 999 },  // hors fenêtre
  { day: '2026-10-08', closed: true, tips: 'x' },  // illisible : ignoré, pas NaN
];

const week = run({ real: true, book, range: 'septJours' });
check('7 days: the closed days’ declared tips, summed (120 + 80,40)', week && week.value === 200.4 && week.unit === 'MAD', JSON.stringify(week));
check('no comparison is invented for it', week && week.delta === null);
const yesterday = run({ real: true, book, range: 'hier' });
check('yesterday: that day only', yesterday && yesterday.value === 120, JSON.stringify(yesterday));
const today = run({ real: true, book, range: 'aujourdhui' });
check('today, still open and no tip entered: « · », never an amount', today && today.text === '·' && today.value === 0, JSON.stringify(today));
const none = run({ real: true, book: [], range: 'septJours' });
check('no day closed in the window: « · »', none && none.text === '·', JSON.stringify(none));
const zero = run({ real: true, book: [{ day: '2026-10-09', closed: true, tips: 0 }], range: 'septJours' });
check('a closed day with no tips is a real 0, not « · »', zero && zero.value === 0 && zero.text == null, JSON.stringify(zero));
const unloaded = run({ real: true, book, range: 'septJours', noBook: true });
check('report book not loaded: no tile (nothing to say)', unloaded === null, JSON.stringify(unloaded));
const rich = run({ real: true, book, range: 'septJours', revenue: 999999 });
check('the revenue no longer moves the tips of a real store', rich && rich.value === 200.4);

asked.length = 0;
run({ real: true, book, range: 'septJours' });
check('the report book read is the venue on screen’s, by its slug', asked.length === 1 && asked[0] === 'cafe-test', JSON.stringify(asked));
const unnamed = run({ real: true, book, range: 'septJours', custom: false });
check('a store on screen that cannot be identified: no tile, never another store’s book', unnamed === null, JSON.stringify(unnamed));
const renamed = run({ real: true, book, range: 'septJours', venue: { name: 'Café Test' } });
check('without an engraved slug, the name gives the same book (Café Test → cafe-test)', renamed && renamed.value === 200.4, JSON.stringify(renamed));

/* Les pourboires saisis à l'encaissement (sales.tip_cents → flux → KiwiSales). */
const SALES = [
  { ts: ts(TODAY), amount: 300, tipCents: 2550 },        // aujourd'hui, journée ouverte
  { ts: ts(TODAY), amount: 120, tipCents: 1000 },
  { ts: ts(TODAY), amount: 90 },                          // sans pourboire
  { ts: ts('2026-10-12'), amount: 500, tipCents: 9900 },  // hier, journée close : le Z fait foi
  { ts: ts('2026-10-11'), amount: 200, tipCents: 700 },   // dimanche, jamais clôturé
];
const todayLive = run({ real: true, book, range: 'aujourdhui', sales: SALES });
check('today, still open: the tips entered at payment (25,50 + 10)', todayLive && todayLive.value === 35.5 && todayLive.text == null, JSON.stringify(todayLive));
const weekLive = run({ real: true, book, range: 'septJours', sales: SALES });
check('7 days: closed days as declared, never added to what was entered (200,40 + 35,50 + 7)', weekLive && weekLive.value === 242.9, JSON.stringify(weekLive));
const quiet = run({ real: true, book: [], range: 'aujourdhui', sales: [{ ts: ts(TODAY), amount: 90 }] });
check('an open day with sales but no tip entered stays « · », not an invented 0', quiet && quiet.text === '·', JSON.stringify(quiet));

const LL = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
const SALE = fs.readFileSync(path.join(ROOT, 'functions/api/sale.js'), 'utf8');
const FEED = fs.readFileSync(path.join(ROOT, 'functions/api/feed.js'), 'utf8');
const VEN = fs.readFileSync(path.join(ROOT, 'assets/venues.js'), 'utf8');
check('the till sends the tip beside the amount, the server keeps it, the feed returns it, the store holds it',
  /if \(\+entry\.tip > 0\) body\.tipCents = Math\.round\(\+entry\.tip \* 100\);/.test(LL)
  && /UPDATE sales SET tip_cents = \? WHERE merchant = \? AND id = \? AND tip_cents IS NULL/.test(SALE)
  && /SELECT id, tip_cents FROM sales/.test(FEED) && /tipCents: s\.tipCents/.test(LL)
  && /if \(Number\.isSafeInteger\(tipCents\) && tipCents > 0\) entry\.tipCents = tipCents;/.test(VEN));
check('a tip that cannot be written never undoes the sale', /catch \(_\) \{ \/\* la vente reste ; le Z déclarera le pourboire \*\/ \}/.test(SALE));

const demo = run({ real: false, book, range: 'septJours', revenue: 10000 });
check('the demo keeps its illustration (revenue × rate)', demo && demo.value === 720 && demo.delta === 3.2, JSON.stringify(demo));

const IX = fs.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');
check('no tooltip still calls them estimated', !/Pourboires estimés|Estimated tips|الإكراميات المقدرة|Estimation des pourboires|calculée à partir de votre volume de ventes/.test(IX));
check('the tooltips say where they come from, in three languages',
  /déclarés à la clôture/.test(IX) && /declared when (it closed )?each day/.test(IX) && /عند إغلاق كل يوم/.test(IX)
  && /saisis à l\\'encaissement/.test(IX) && /entered at payment/.test(IX) && /المسجّلة عند الأداء/.test(IX));

check('the band repaints when the day-report book changes (it arrives after the first render)',
  /KiwiDayReport\?\.subscribe\)\s*\{\s*window\.KiwiDayReport\.subscribe\(\(\) => \{ try \{ renderKpiBand\(\)/.test(SRC));

console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ ${passed} tips checks green`);
process.exit(failures ? 1 : 0);
