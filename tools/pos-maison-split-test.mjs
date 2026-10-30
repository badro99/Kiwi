import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { retailCoreUrl } from './pos-retail-module-url-check.mjs';
if (!vm.SourceTextModule) {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/pos-maison/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/pos-maison/split.json'));
const pristine = Object.entries(map.splitFiles).every(([file, hash]) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === hash);
if (pristine) {
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
// Every body fragment is identical, including whitespace, comments and strings.
const joined = [];
for (const chunk of map.chunks) {
  const source = read(chunk.file);
  const lead = source.match(/^(?:import .*;\n)+/)[0];
  const tail = source.match(/\nexport \{[^\n]+\};\n$/)[0];
  const expected = chunk.fragments.map(f => original.slice(f.start, f.end)).join('');
  assert.equal(source.slice(lead.length, -tail.length), expected, chunk.file + ': byte-identical body');
  for (const f of chunk.fragments) joined.push(f);
}
joined.sort((a,b) => a.start-b.start);
assert.equal(map.prefix + joined.map(f => original.slice(f.start,f.end)).join('') + map.suffix, original);
} else console.log('○ Maison split proven at split time; files edited since, proof archived');
function realm(real) {
  const calls = [], values = new Map(), registered = [];
  const product = { price: 100, sizes: { TU: 5 }, colors: ['ivoire'] };
  const target = () => ({ addEventListener(name) { calls.push(['event',name]); }, removeEventListener() {} });
  const window = { ...target(), KiwiEnv: { isReal: () => real }, KiwiPosDispatch: { register(s) { registered.push(s); }, lock() {} },
    KiwiPosReprint: { provide(id, fn) { calls.push(['reprint',id]); this.provider = fn; } },
    KiwiBoutiqueCatalog: { compat: () => ({ P: new Proxy({}, { get: () => product }), RAYONS: [], BY_EAN: {} }) } };
  const document = { ...target(), documentElement: {}, querySelector: () => null, querySelectorAll: () => [] };
  const localStorage = { getItem(k) { calls.push(['read',k]); return values.get(k) ?? null; }, setItem(k,v) { calls.push(['write',k,String(v)]); values.set(k,String(v)); } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [1800000000000])); } static now() { return 1800000000000; } }
  const context = vm.createContext({ window, document, localStorage, Date: Clock, console, navigator: { onLine: true },
    location: { hostname: real ? 'kiwi-os.com' : 'localhost', search: '' },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    fetch: async url => { calls.push(['fetch',url]); return { ok: true, json: async () => ({ credits: [] }) }; } });
  return { context, window, calls, registered, values };
}
async function modules(context) {
  const cache = new Map();
  function get(url) {
    if (!cache.has(url.href)) cache.set(url.href, new vm.SourceTextModule(read(fileURLToPath(url)), { context, identifier: url.href }));
    return cache.get(url.href);
  }
  const url = retailCoreUrl('maison');
  const entry = get(url);
  await entry.link((specifier, owner) => get(new URL(specifier, owner.identifier)));
  await entry.evaluate();
  /* Le cœur, ses trois modules, assets/refund-split.js (la règle du
     remboursement que checkout.js partage avec functions/api/sale/refund.js) et
     assets/money-cents.js (les centimes, comme la caisse boutique). */
  /* Plus les livraisons partagées avec la boutique : la fiche destinataire
     (Maison et boutique), le Z en deux tickets et la page Livraisons. */
  assert.equal(cache.size, 15, 'exactly one instance per stamped module, including cyclic imports (the shared product photos are the seventh, the till inventory access the eighth, then delivery.js, delivery-card.js, z-split.js, livraisons.js, the 2027 kit, pos-maison/kit-2027.js, Ozon Express, pos-boutique/ozon.js, and the ticket discount, pos-maison/ticket-remise.js)');
}
for (const real of [false,true]) {
  const a = realm(real), b = realm(real);
  if (pristine) vm.runInContext(original, a.context);
  await modules(b.context);
  await new Promise(r => setImmediate(r));
  assert.equal(b.registered.length,1);
  assert.equal(b.registered[0].id, 'maison');
  for (const key of ['mount', 'onShow']) assert.equal(typeof b.registered[0][key], 'function');
  assert.equal(typeof b.window.KiwiPosReprint.provider, 'function');
  if (pristine) {
  assert.deepEqual(Object.keys(a.window).sort(), Object.keys(b.window).sort());
  const globals = w => JSON.stringify(w, (_key, value) => typeof value === 'function' ? value.toString() : value);
  assert.equal(globals(a.window), globals(b.window), 'global values and public function sources');
  assert.deepEqual(a.calls, b.calls, 'initialization order and persistence');
  assert.deepEqual([...a.values], [...b.values]);
  assert.equal(a.registered.length,1); assert.equal(b.registered.length,1);
  assert.equal(JSON.stringify(a.registered[0].greet), JSON.stringify(b.registered[0].greet));
  assert.equal(a.registered[0].id,b.registered[0].id);
  for (const name of ['mount','onShow']) assert.equal(a.registered[0][name].toString(),b.registered[0][name].toString());
  assert.equal(JSON.stringify(a.window.KiwiPosReprint.provider()), JSON.stringify(b.window.KiwiPosReprint.provider()));
  }
}
if (pristine) console.log('PASS Maison split: exact body reconstruction; demo/real globals, registration, initialization, storage and reprint parity');
// Dispatcher waits for registration after the complete module graph loads.
const dispatch = read('assets/pos-dispatch.js');
const loader = dispatch.slice(dispatch.indexOf('  function ensureLoaded('), dispatch.indexOf('  function rootFor('));
for (const module of [false, true]) {
  const tags = [], apps = {}, loading = {};
  const context = vm.createContext({ apps, loading, Promise, Error, encodeURIComponent,
    document: { createElement: tag => ({ tag }), head: { appendChild: el => tags.push(el) } } });
  vm.runInContext(loader + '\nthis.load = ensureLoaded;', context);
  const entry = { id: 'maison', file: 'pos-maison', rev: retailCoreUrl('maison').searchParams.get('v'), module };
  const pending = context.load(entry);
  assert.equal(context.load(entry), pending, 'deduplicated load');
  const script = tags.find(t => t.tag === 'script');
  assert.equal(script.type, module ? 'module' : undefined);
  let resolved = false; pending.then(() => { resolved = true; });
  await Promise.resolve(); assert.equal(resolved, false);
  apps.maison = {}; script.onload(); await pending;
  assert.equal(resolved, true);
}
console.log('PASS Maison loader: classic/module paths, deduplication and registration barrier');
