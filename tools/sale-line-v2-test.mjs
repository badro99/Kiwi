#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
function ok(name, value) {
  if (!value) { console.error('  ✗ ' + name); process.exitCode = 1; return; }
  pass++;
}

/* Execute the real Pages Function with only its auth/suspension dependencies
 * replaced.  The D1 statement captures the exact JSON that production binds. */
let api = read('functions/api/sale.js')
  .replace(/^import .*;$/gm, '')
  .replace("const MAX_AMOUNT", `const entitledMerchant = async (_r, _e, asked) => asked;
const activeServiceEmployee = async () => null;
const storeSuspended = async () => false;
const startOfDay = () => 0;
const settleServiceTable = async () => ({ ok: true });
const poke = async () => {};

const MAX_AMOUNT`);
const mod = await import('data:text/javascript;base64,' + Buffer.from(api).toString('base64'));

async function store(body) {
  let bound = null;
  const DB = {
    prepare() {
      return {
        bind(...args) { bound = args; return this; },
        async run() { return { success: true }; },
      };
    },
  };
  const request = { json: async () => body };
  const response = await mod.onRequestPost({ request, env: { DB } });
  ok('sale endpoint accepts the fixture', response.status === 200);
  return JSON.parse(bound[7]);
}

const rich = await store({
  id: 'sale-v2-1', merchant: 'pressing-amira', amount: 75, method: 'cash',
  label: 'Chemise', ref: 'P-1', ts: Date.now(),
  lines: [{
    itemId: 'chemise', variantId: 'blanc', name: 'Chemise', category: 'hauts',
    quantity: 1.25, total: 75.5, unit: 'piece', kind: 'service', unitCost: 12.345,
    recipeVersionId: 'recipe-7', options: [{ id: 'lavage', qty: 1 }, 'repassage'],
  }],
});
ok('stable item identity survives', rich[0].i === 'chemise');
ok('variant identity survives', rich[0].v === 'blanc');
ok('fractional quantity survives to three decimals', rich[0].q === 1.25);
ok('line money survives to cent precision', rich[0].t === 75.5);
ok('unit and kind survive', rich[0].u === 'piece' && rich[0].kd === 'service');
ok('frozen cost and recipe version survive', rich[0].k === 12.35 && rich[0].r === 'recipe-7');
ok('bounded option deltas survive', rich[0].o.length === 2 && rich[0].o[0].i === 'lavage');

const legacy = await store({
  id: 'sale-v1-1', merchant: 'legacy-shop', amount: 20, method: 'cash',
  lines: [{ name: 'Pain', qty: 2, total: 20 }],
});
ok('legacy name/qty/total remains accepted', legacy[0].n === 'Pain' && legacy[0].q === 2 && legacy[0].t === 20);

const live = read('assets/live-link.js');
const feed = read('functions/api/feed.js');
const config = read('functions/api/config.js');
const storeApi = read('functions/api/store.js');
const pressing = read('assets/pressing-caisse.js');
const costs = read('assets/cost.js');
const venues = read('assets/venues.js');
const consumption = read('assets/inventory-consumption.js');
ok('offline queue keeps stable item identity', /if \(i\) o\.i = i/.test(live));
ok('feed expands v2 identity for consumers', /itemId: \(l && l\.i\)/.test(feed));
ok('real config returns the server plan', /return json\(\{ features, pins, [^}]*plan[^}]*suspended \}\)/.test(config));
ok('private costs are accepted by the server vault', /costs:\s*\{ keys: \['items', 'ingredients', 'recipes', 'charges'\]/.test(storeApi));
ok('pressing allocates deposits without duplicating full order value', /function saleLines\(o, received\)/.test(pressing) && /factor = full > 0/.test(pressing));
ok('margin engine consumes server-expanded stable identity',
  /const itemId = l\.itemId \|\| l\.id \|\| ''/.test(costs) && /id: itemId, variantId: l\.variantId/.test(costs));
ok('dashboard sales cache preserves v2 identity and fractional quantities',
  /if \(itemId\) o\.itemId = itemId/.test(venues) && /Math\.round\(Math\.max\(0, \+\(l && \(l\.qty/.test(venues));
ok('accepted caisse sales feed the idempotent inventory consumer',
  /KiwiInventoryConsumption\?\.record/.test(read('assets/pos-sale.js')) && /inv-sale-/.test(consumption));

const verticals = [
  'boulangerie', 'coiffure', 'epicerie', 'fastfood', 'fleuriste', 'foodtruck',
  'gym', 'hotel', 'librairie', 'pharmacie', 'pizzeria', 'spa', 'traiteur',
];
verticals.forEach((vertical) => {
  const source = read(`assets/pos-${vertical}.js`);
  ok(`${vertical} forwards line truth to the journal`,
    new RegExp(`KiwiPosSale\\.record\\('${vertical}', \\{ total, method, label, ref, lines \\}\\)`).test(source));
});
ok('boutique basket keeps stable identity and variants',
  /itemId: ln\.pid/.test(read('assets/pos-boutique.js')) && /variantId: \[ln\.pid, ln\.size/.test(read('assets/pos-boutique.js')));

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ sale-line v2 (${pass} controls: legacy compatibility, stable truth, offline transport, every caisse producer)`);
