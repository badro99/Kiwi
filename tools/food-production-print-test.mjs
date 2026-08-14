import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let controls = 0;
function ok(value, message) { controls++; if (!value) throw new Error(message); }
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

const calls = [];
const window = { KiwiKitchenPrint: { enqueue(jobs, options) { calls.push({ jobs, options }); return { accepted: jobs.length }; } } };
vm.runInNewContext(source('assets/food-production-print.js'), { window, Date, Number, String, Object, Array, Math });
const api = window.KiwiFoodProductionPrint;
ok(api && typeof api.plan === 'function', 'shared production print planner is exposed');
ok(typeof api.install === 'function' && typeof api.eligible === 'function', 'specialist tills expose printer setup in their native rail');
ok(api.eligible('boulangerie'), 'dispatcher bakery id is recognized by the production adapter');
ok(api.trades.join(',') === 'fastfood,pizzeria,bakery,traiteur,foodtruck', 'only supported production trades are registered');
ok(api.plan({ trade: 'restaurant', ref: '1', lines: [{ name: 'X' }] }).length === 0, 'unsupported trades are ignored');
ok(api.plan({ trade: 'fastfood', ref: '', lines: [{ name: 'X' }] }).length === 0, 'reference is mandatory');
ok(api.plan({ trade: 'fastfood', ref: '1', committed: false, lines: [{ name: 'X' }] }).length === 0, 'uncommitted orders never print');
ok(api.plan({ trade: 'fastfood', ref: '1', lines: [] }).length === 0, 'empty orders never print');

const input = { trade: 'fastfood', ref: 'FF 42', destination: 'Comptoir', at: 1700000000000, lines: [
  { qty: 2, name: 'Burger', station: 'Cuisine', note: 'sans oignon' },
  { qty: 1, name: 'Cola', station: 'Boissons' },
] };
const planned = api.plan(input);
ok(planned.length === 2, 'one durable job is planned per production station');
ok(planned[0].id === 'food:fastfood:FF-42:Boissons', 'job id is stable and station-scoped');
ok(planned[1].payload.items[0].note === 'sans oignon', 'production notes survive normalization');
ok(planned[1].payload.order === '#FF 42', 'operator order reference is retained');
ok(planned[1].payload.table === 'Comptoir', 'destination is retained');
ok(JSON.stringify(api.plan(input).map((job) => job.id)) === JSON.stringify(planned.map((job) => job.id)), 'replanning is idempotent');
ok(api.enqueue(input, { merchant: 'demo' }).accepted === 2, 'adapter delegates jobs to the durable restaurant queue');
ok(calls.length === 1 && calls[0].options.merchant === 'demo', 'queue options are preserved');

const integrations = {
  'assets/pos-fastfood.js': 'fastfood',
  'assets/pos-pizzeria.js': 'pizzeria',
  'assets/pos-boulangerie.js': 'bakery',
  'assets/pos-traiteur.js': 'traiteur',
  'assets/pos-foodtruck.js': 'foodtruck',
};
for (const [file, trade] of Object.entries(integrations)) {
  const text = source(file);
  ok(text.includes('KiwiFoodProductionPrint.enqueue'), `${trade} uses the shared production queue`);
  ok(text.includes(`trade: '${trade}'`), `${trade} identifies its workflow explicitly`);
}
ok(source('kiwi-caisse.html').includes('assets/food-production-print.js?v=1'), 'caisse loads the adapter before specialist modules');
ok(source('assets/pos-dispatch.js').includes('KiwiFoodProductionPrint.install(root, id)'), 'dispatcher mounts printer setup for eligible specialist tills');
ok(source('kiwi-sw.js').includes("'/assets/food-production-print.js?v=1'"), 'adapter is available offline');
console.log(`✓ Food production printing — ${controls} controls`);
