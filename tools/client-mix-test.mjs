#!/usr/bin/env node
/* « Clients réguliers », « Taux de fidélité », « Nouveaux clients » : lus au
 * carnet clients, plus jamais devinés.
 *
 * Chez un vrai commerçant les trois tuiles valaient « · » (aucune source), et
 * avant ça « Nouveaux clients » valait ventes − réguliers : un nombre de
 * TICKETS présenté comme un nombre de personnes, avec une variation inventée
 * (a − b × 0,3). Elles lisent maintenant l'historique d'achats daté que la
 * caisse écrit sur chaque client rattaché (KiwiClients, synchronisé par D1).
 *
 * Comme tools/kpi-ledger-test.js : on extrait du VRAI assets/dateRange.js la
 * fonction realClientMix et les tuiles, et on les exécute telles quelles. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
let failures = 0, passed = 0;
const check = (label, ok, detail) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (detail ? '\n      ' + detail : '')); } };

console.log('■ Clients du carnet (tools/client-mix-test.mjs)');
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); return i > 0 && j > i ? SRC.slice(i, j) : ''; };
const fnSrc = cut('  function screenBook() {', '  /* Les pourboires déclarés') + cut('  function realClientMix(from, to) {', '  function windowDays(range) {');
const tilesSrc = cut('    regulars:   { labels:', '    txPerDay:   { labels:');
check('realClientMix and the three client tiles are extractable', !!fnSrc && !!tilesSrc);
if (failures) process.exit(1);

const DAY = 864e5;
const FROM = Date.parse('2026-10-07T05:00:00Z'), TO = Date.parse('2026-10-14T05:00:00Z');
const at = (iso) => Date.parse(iso + 'T12:00:00Z');
const asked = [];
function load(list, { throws = false, missing = false, custom = true, venue = { slug: 'riad-test' } } = {}) {
  const window = { KiwiVenue: { isCustom: () => custom, getCurrentVenueData: () => venue } };
  if (!missing) window.KiwiClients = { list: (b) => { asked.push(b); if (throws) throw new Error('boom'); return b === 'riad-test' ? list : [{ id: 'x', visits: 1, history: [{ ts: FROM + 1 }] }]; } };
  const ctx = vm.createContext({ window, Number, Array, Math, withDelta: (ds, f) => ds.reduce(f) });
  vm.runInContext(fnSrc + '\nvar __tiles = {' + tilesSrc + '};', ctx);
  return ctx;
}
const visit = (iso) => ({ ts: at(iso), amount: 50 });
const book = [
  { id: 'a', visits: 3, history: [visit('2026-10-12'), visit('2026-10-01'), visit('2026-09-20')] }, // venue avant : régulière
  { id: 'b', visits: 2, history: [visit('2026-10-13'), visit('2026-10-08')] },                      // première fois cette semaine
  { id: 'c', visits: 1, history: [visit('2026-10-09')] },                                           // nouvelle
  { id: 'd', visits: 60, history: [visit('2026-10-10')] },                                          // historique tronqué : déjà venue
  { id: 'e', visits: 4, history: [visit('2026-09-02')] },                                           // pas venue cette semaine
  { id: 'f', visits: 0, history: [], firstSeen: at('2026-10-09'), lastSeen: at('2026-10-09') },     // créée sans achat
  { id: 'g', visits: 7, firstSeen: at('2026-01-01'), lastSeen: at('2026-10-10') },                  // fiche ancienne, sans historique daté
  { id: 'h', visits: 1, history: [{ ts: 'x' }, null, { ts: at('2026-10-14') + DAY }] },             // illisible / après la fenêtre
  null,
];
const ctx = load(book);
const mix = ctx.realClientMix(FROM, TO);
check('identified clients who came in the window: a, b, c, d', mix.visitors === 4, JSON.stringify(mix));
check('regulars: a (seen before) and d (more visits than its dated history)', mix.regulars === 2, JSON.stringify(mix));
check('newcomers: b and c, even with two visits this week', mix.newcomers === 2, JSON.stringify(mix));
check('a client created without a purchase did not come, nor an old card with no dated history',
  load([book[5], book[6]]).realClientMix(FROM, TO).visitors === 0);
check('the window end is exclusive (a visit at « to » is not in it)',
  load([{ id: 'z', visits: 1, history: [{ ts: TO }] }]).realClientMix(FROM, TO).visitors === 0);
check('the window start is inclusive', load([{ id: 'z', visits: 1, history: [{ ts: FROM }] }]).realClientMix(FROM, TO).newcomers === 1);
check('empty book: nobody', JSON.stringify(load([]).realClientMix(FROM, TO)) === '{"visitors":0,"regulars":0,"newcomers":0}');
check('no client store loaded: nobody, no crash', load([], { missing: true }).realClientMix(FROM, TO).visitors === 0);
check('a store that throws: nobody, no crash', load([], { throws: true }).realClientMix(FROM, TO).visitors === 0);

check('the client book read is the venue on screen’s, by its slug', asked.length > 0 && asked.every((b) => b === 'riad-test'), JSON.stringify([...new Set(asked)]));
check('a store on screen that cannot be identified: nobody, never another store’s book',
  load(book, { custom: false }).realClientMix(FROM, TO).visitors === 0);

const T = ctx.__tiles;
const real = { tx: { value: 140 }, regulars: { value: 2, unit: '/ 4' },
  clientMix: { visitors: 4, regulars: 2, newcomers: 2, deltaNew: 100, deltaRate: -12.5 } };
const ret = T.retention.derive(real);
check('loyalty = regulars ÷ clients who came (50 %), never ÷ tickets', ret.value === 50 && ret.unit === '%', JSON.stringify(ret));
check('loyalty carries the period comparison of the same rate', ret.delta === -12.5);
const nc = T.newClients.derive(real);
check('new customers = people, not tickets (2, not 140 − 2)', nc.value === 2 && nc.delta === 100, JSON.stringify(nc));
const dash = { tx: { value: 140 }, regulars: { text: '·', value: 0 } };
check('no identified client in the period: loyalty stays « · »', T.retention.derive(dash).text === '·');
check('no identified client in the period: new customers stays « · »', T.newClients.derive(dash).text === '·');
const demo = T.newClients.derive({ tx: { value: 182, delta: 10 }, regulars: { value: 47, delta: 26 } });
check('the demo keeps its illustration', demo.value === 135);

console.log('\n■ Wiring');
check('the real branch reads the book for the window on screen', /const mix = realClientMix\(wFrom, wTo\);/.test(SRC));
check('regulars shows « n / clients who came », compared with the previous period',
  /value: mix\.regulars, unit: `\/ \$\{mix\.visitors\}`/.test(SRC) && /realDeltaPct\(rng, \(s\) => s\.regulars, undefined, realClientMix\)/.test(SRC));
check('and keeps « · » when nobody identified came', /: \{ \.\.\.data\.regulars, text: '·', value: 0, unit: '', delta: null \}\) : data\.regulars/.test(SRC));
check('the band repaints when the client book changes',
  /KiwiClients\?\.subscribe\)\s*\{\s*window\.KiwiClients\.subscribe\(\(\) => \{ try \{ renderKpiBand\(\)/.test(SRC));
const IX = fs.readFileSync(path.join(ROOT, 'assets/interactive.js'), 'utf8');
check('no tooltip still calls them estimated or divides by sales',
  !/Premières visites estimées|Estimated first visits|الزيارات الأولى المقدرة|Estimation du nombre de premières|parmi vos ventes|among your sales|share of your sales made/.test(IX));

console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ ${passed} client-book checks green`);
process.exit(failures ? 1 : 0);
