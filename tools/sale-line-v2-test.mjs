#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
import retailSource from './pos-retail-test-source.cjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitBasket, basketCents } from '../functions/api/_sale-truth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => retailSource(coreTestSource.readFileSync(path.join(root, p), 'utf8'));
let pass = 0;
function ok(name, value) {
  if (!value) { console.error('  ✗ ' + name); process.exitCode = 1; return; }
  pass++;
}

/* Execute the real Pages Function with only its auth/suspension dependencies
 * replaced.  The D1 statement captures the exact JSON that production binds. */
let api = read('functions/api/sale.js')
  .replace(/^import .*;$/gm, '')
  .replace("const MAX_AMOUNT_CENTS", `const entitledMerchant = async (_r, _e, asked) => asked;
const activeServiceEmployee = async () => null;
const storeSuspended = async () => false;
const storeSubscriptionPending = async () => false;
const startOfDay = () => 0;
const settleServiceTable = async () => ({ ok: true });
const poke = async () => {};
// Owner custody of refused operations has its own suite (quarantine-settlement-test).
const quarantineGuard = async () => ({ sql: '', args: [] });
// Who sold it (seller commissions) has its own suite; these baskets carry no seller.
const sellerOf = async () => null;
// This harness exercises legacy sale baskets without tender detail. The new
// retail tender validator has its own end-to-end D1 test in check.js.
const validateRetailTenders = () => null;
const retailTenderMethod = () => '';
// The server-truth helpers run for real; only the business-day lookups they import are fixed.
const businessDate = () => '2026-01-01';
const merchantCutoff = async () => 5;
const merchantZone = async () => 'Africa/Casablanca';
${read('functions/api/_sale-truth.js').replace(/^import .*;$/gm, '').replace(/^export /gm, '')}
// The price-list stamp (_price-list-sale.js) has its own suite (price-lists-test); these baskets carry none.
const stampPriceList = async () => {};
${read('functions/api/_sale-stamp.js').replace(/^import .*;$/gm, '').replace(/^export /gm, '')}

const MAX_AMOUNT_CENTS`);
const mod = await import('data:text/javascript;base64,' + Buffer.from(api).toString('base64'));

async function store(body) {
  let insertBound = null;
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          if (/^INSERT OR IGNORE INTO sales\b/.test(sql)) insertBound = args;
          return this;
        },
        async run() { return { success: true }; },
        async first() {
          if (insertBound) {
            return {
              id: insertBound[0],
              amount: insertBound[2],
              amount_cents: insertBound[9] != null ? insertBound[9] : Math.round(Number(insertBound[2]) * 100),
              method: insertBound[3],
            };
          }
          return null;
        },
      };
    },
  };
  const request = { json: async () => body };
  const response = await mod.onRequestPost({ request, env: { DB } });
  ok('sale endpoint accepts the fixture', response.status === 200);
  const parsed = JSON.parse(insertBound[7]);
  parsed._channel = insertBound[8] || '';
  return parsed;
}

const rich = await store({
  id: 'sale-v2-1', merchant: 'pressing-amira', amount: 75, method: 'cash',
  label: 'Chemise', ref: 'P-1', ts: Date.now(),
  lines: [{
    itemId: 'chemise', variantId: 'blanc', name: 'Chemise (Blanc)', baseName: 'Chemise', category: 'hauts',
    quantity: 1.25, total: 75.5, unit: 'piece', kind: 'service', unitCost: 12.345,
    recipeVersionId: 'recipe-7', options: [{ id: 'lavage', qty: 1 }, 'repassage'], supplierId: 'sup_atlas',
  }],
  channel: 'counter',
});
ok('stable item identity survives', rich[0].i === 'chemise');
ok('base menu name snapshot survives without altering receipt label',
  rich[0].bn === 'Chemise' && rich[0].n === 'Chemise (Blanc)');
ok('variant identity survives', rich[0].v === 'blanc');
ok('fractional quantity survives to three decimals', rich[0].q === 1.25);
ok('line money survives to cent precision', rich[0].t === 75.5);
ok('unit and kind survive', rich[0].u === 'piece' && rich[0].kd === 'service');
ok('frozen cost and recipe version survive', rich[0].k === 12.35 && rich[0].r === 'recipe-7');
ok('bounded option deltas survive', rich[0].o.length === 2 && rich[0].o[0].i === 'lavage');
ok('sale channel is written beside the immutable basket', rich._channel === 'counter');

/* Rolling schema: a deployed DB may have lines but not channel for a few
 * seconds. The fallback must retain the basket, not silently downgrade it. */
{
  let attempts = 0;
  let fallbackBound = null;
  const DB = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          // Only the sale INSERT counts: the customer and clock stamp that
          // follows it (functions/api/_sale-stamp.js) is a separate UPDATE.
          if (!/INSERT (OR IGNORE )?INTO sales\b/.test(sql)) return { success: true };
          attempts++;
          if (/lines, channel/.test(sql)) throw new Error('no such column: channel');
          fallbackBound = this.args;
          return { success: true };
        },
        async first() {
          if (fallbackBound) {
            return {
              id: fallbackBound[0],
              amount: fallbackBound[2],
              amount_cents: fallbackBound[9] != null ? fallbackBound[9] : Math.round(Number(fallbackBound[2]) * 100),
              method: fallbackBound[3],
            };
          }
          return null;
        },
      };
    },
  };
  const request = { json: async () => ({
    id: 'sale-rolling', merchant: 'amira-cafe', amount: 42, method: 'cash', channel: 'dining',
    lines: [{ name: 'Harira', qty: 1, total: 42 }],
  }) };
  const response = await mod.onRequestPost({ request, env: { DB } });
  ok('channel migration fallback still accepts the sale', response.status === 200 && attempts === 2);
  ok('channel migration fallback preserves line truth', JSON.parse(fallbackBound[7])[0].n === 'Harira');
}

const legacy = await store({
  id: 'sale-v1-1', merchant: 'legacy-shop', amount: 20, method: 'cash',
  lines: [{ name: 'Pain', qty: 2, total: 20 }],
});
ok('legacy name/qty/total remains accepted', legacy[0].n === 'Pain' && legacy[0].q === 2 && legacy[0].t === 20);

ok('supplier at sale time survives', rich[0].sp === 'sup_atlas');
ok('legacy line carries no supplier key', !('sp' in legacy[0]));
const blank = await store({ id: 'sale-v2-sp0', merchant: 'pressing-amira', amount: 10, method: 'cash', label: 'X', ref: 'P-9', ts: Date.now(),
  lines: [{ itemId: 'x', name: 'X', quantity: 1, total: 10, supplierId: '   ' }] });
ok('blank supplier is omitted, not stored empty', !('sp' in blank[0]));
{
  // A basket at the size limit sheds the supplier (optional detail) before it folds lines, and keeps every centime.
  const rows = Array.from({ length: 40 }, () => ({ n: 'x'.repeat(60), q: 1, t: 1, i: 'i'.repeat(80), v: 'v'.repeat(80), c: 'c'.repeat(40), sp: 's'.repeat(80) }));
  const fit = fitBasket(rows, JSON.stringify(rows).length - 1);
  ok('oversized basket keeps every centime', basketCents(fit.rows) === 4000);
  ok('oversized basket drops the supplier first', fit.folded && fit.rows.every((r) => !('sp' in r)) && fit.rows.length === 40);
}

const live = read('assets/live-link.js');
/* The offline queue's real line mapper and the shared journal's real cleanLine,
 * lifted out of their modules and run: what a sale line keeps is behaviour. */
const queueSrc = fs.readFileSync(path.join(root, 'assets/live-link/queue-store.js'), 'utf8');
const qFrom = queueSrc.indexOf('.map(function (l) {', queueSrc.indexOf('boundedLines.slice(0, 40)')) + 5;
const qTo = queueSrc.indexOf('return o;\n        })', qFrom) + 'return o;\n        }'.length;
const queueLine = vm.runInNewContext('(' + queueSrc.slice(qFrom, qTo) + ')');
const journalSrc = fs.readFileSync(path.join(root, 'assets/pos-sale.js'), 'utf8');
const jFrom = journalSrc.indexOf('  function foldedLine(line)');
const journalLine = vm.runInNewContext(journalSrc.slice(jFrom, journalSrc.indexOf('\n  /* A settled caisse sale', jFrom)) + ';cleanLine', { localStorage: { getItem: () => null } });
const queued = queueLine({ name: 'Caftan', qty: 1, total: 450, itemId: 'p-caftan', baseName: 'Caftan brodé', supplierId: ' sup_atlas ' });
const feed = read('functions/api/feed.js');
const config = read('functions/api/config.js');
const storeApi = read('functions/api/store.js');
const pressing = read('assets/pressing-caisse.js');
const costs = read('assets/cost.js');
const venues = read('assets/venues.js');
const consumption = read('assets/inventory-consumption.js');
ok('offline queue keeps stable item identity', queued.i === 'p-caftan');
ok('offline queue keeps base menu name snapshot', queued.bn === 'Caftan brodé');
ok('feed expands v2 identity for consumers', /itemId: \(l && l\.i\)/.test(feed));
ok('feed expands base menu name for the Z report', /baseName: \(l && l\.bn\)/.test(feed));
ok('real config returns the server plan', /return json\(\{ features, pins, [\s\S]*?plan[\s\S]*?suspended/.test(config));
ok('private costs and targets are accepted by one server vault declaration',
  (storeApi.match(/^  costs:\s*\{ keys:/gm) || []).length === 1
  && /costs:\s*\{ keys: \['items', 'ingredients', 'recipes', 'charges', 'targets'\]/.test(storeApi));
ok('pressing allocates deposits without duplicating full order value', /function saleLines\(o, received\)/.test(pressing) && /factor = full > 0/.test(pressing));
ok('margin engine consumes server-expanded stable identity',
  /const lineIdOf = \(l\) => String\(\(l && \(l\.itemId != null \? l\.itemId : l\.id != null \? l\.id : l\.i\)\)/.test(costs)
  && /const itemId = lineIdOf\(l\)/.test(costs) && /id: itemId, variantId: \(l && l\.variantId\)/.test(costs));
ok('dashboard sales cache preserves v2 identity and fractional quantities',
  /if \(itemId\) o\.itemId = itemId/.test(venues) && /Math\.round\(Math\.max\(0, \+\(l && \(l\.qty/.test(venues));
ok('dashboard sales cache keeps the base menu name snapshot', /if \(baseName\) o\.baseName = baseName/.test(venues));
ok('accepted caisse sales feed the idempotent inventory consumer',
  /KiwiInventoryConsumption\?\.record/.test(read('assets/pos-sale.js')) && /inv-sale-/.test(consumption));
ok('shared POS journal preserves and forwards an explicit channel',
  /if \(saleChannel\) entry\.channel = saleChannel/.test(read('assets/pos-sale.js'))
  && /channel: entry\.channel \|\| ''/.test(read('assets/pos-sale.js')));
ok('fast-food checkout maps its operational modes onto reporting channels',
  /const channel = state\.ticket[\s\S]{0,180}delivery[\s\S]{0,100}counter[\s\S]{0,100}takeaway/.test(read('assets/pos-fastfood.js')));

const verticals = [
  'boulangerie', 'coiffure', 'epicerie', 'fastfood', 'fleuriste', 'foodtruck',
  'gym', 'hotel', 'librairie', 'pharmacie', 'pizzeria', 'spa', 'traiteur',
];
verticals.forEach((vertical) => {
  const source = read(`assets/pos-${vertical}.js`);
  ok(`${vertical} forwards line truth to the journal`,
    new RegExp(`KiwiPosSale\\.record\\('${vertical}', \\{ total, method, label, ref, lines(?:, channel, received, change|, tipCents: Math[.]round\\(tip \\* 100\\))? \\}\\)`).test(source));
});
ok('boutique basket keeps stable identity and variants',
  /itemId: ln\.pid/.test(read('assets/pos-boutique.js')) && /variantId: \[ln\.pid, ln\.size/.test(read('assets/pos-boutique.js')));

ok('till product map carries the supplier', /supplierId: p\.supplierId \|\| ''/.test(read('assets/boutique-catalog.js')));
ok('boutique and maison lines stamp the supplier at sale time', ['boutique', 'maison'].every((v) => (read(`assets/pos-${v}.js`).match(/supplierId: \(P\[(ln|line)\.pid\] && P\[(ln|line)\.pid\]\.supplierId\) \|\| ''/g) || []).length === 2));
ok('offline queue keeps the supplier, trimmed', queued.sp === 'sup_atlas');
ok('offline queue drops a blank supplier', !('sp' in queueLine({ name: 'X', qty: 1, total: 1, supplierId: '  ' })));
ok('shared journal keeps the supplier', journalLine({ name: 'Caftan', qty: 1, total: 450, supplierId: 'sup_atlas' }).supplierId === 'sup_atlas'
  && journalLine({ name: 'X', qty: 1, total: 1, sp: 'sup_b' }).supplierId === 'sup_b');

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ sale-line v2 (${pass} controls: legacy compatibility, stable truth, offline transport, every caisse producer)`);
