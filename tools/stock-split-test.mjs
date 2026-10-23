/* Preuve du déplacement : reconstruction stricte et exécution du vrai chargeur. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import stockSource from './stock-test-source.cjs';
const require = createRequire(import.meta.url);
const map = require('./fixtures/stock/split.json');
const read = p => fs.readFileSync(p, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/stock/original.js.gz')).toString();
const core = read('assets/stock.js');
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(stockSource(), original, 'reconstruction exacte depuis les sources de production');
let identical = 0;
for (const m of stockSource.functions()) {
  assert.equal(m.body, original.slice(m.start, m.end), m.name + ' : corps et qualifications réversibles');
  if (!m.edits.length) identical++;
}
assert.ok(!map.moved.some(m => m.name === 'cancelWasteMovement'), 'annulation inchangée, fusion indépendante');
const html = read('dashboard.html');
assert.equal((html.match(/<script\b[^>]*\bsrc=/gi) || []).length, 161, 'aucune balise ajoutée');
assert.equal(JSON.parse(read('tools/file-size-baseline.json')).scripts['dashboard.html'], 159, 'plafond de 162 avec marge 3');
const scanned = require('./stamps.js').scan();
for (const g of map.groups) {
  const file = `assets/stock/${g}.js`;
  assert.ok(scanned.get(file)?.sites.some(s => s.file === 'assets/stock.js' && s.kind === 'lazy'), file + ' découvert pour estampillage');
  assert.ok(require('./stamps.js').referenceFiles(file).includes('assets/stock.js'));
  new vm.Script(read(file), { filename: file });
}
function realm(source, real) {
  const calls = [], listeners = new Map(), scripts = [], storage = new Map();
  const document = {
    readyState: 'loading', querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (n, fn) => { listeners.set(n, fn); calls.push(['document', n]); },
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => scripts.push(script) },
    body: { classList: { add() {}, remove() {}, contains: () => false } },
  };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [1800000000000])); } static now() { return 1800000000000; } }
  const context = vm.createContext({ document, console, Date: Clock, URL, URLSearchParams,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    location: { search: '', hostname: 'localhost' },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout: (_fn, ms) => { calls.push(['timeout', ms]); return 1; }, clearTimeout() {},
    addEventListener: n => calls.push(['window', n]), dispatchEvent: e => calls.push(['event', e.type]),
    scrollTo() {}, Kiwi: { handlers: {}, toast: (...args) => calls.push(['toast', ...args]) },
    KiwiEnv: { isReal: () => real },
    KiwiVenue: { getVenue: () => 'own', getVenueType: () => 'restaurant', getInventory: () => [], getSuppliers: () => [], subscribe: () => calls.push(['venue-subscribe']) },
    KiwiI18n: { getLang: () => 'fr' }, KiwiInventory: { history: () => [], subscribe: () => calls.push(['inventory-subscribe']) },
  });
  context.window = context;
  vm.runInContext(source, context);
  listeners.get('DOMContentLoaded')();
  return { context, calls, scripts, storage };
}
// Le banc expose les accesseurs dans sa seule copie de référence, pas en production.
const exposed = [...new Set([...map.moved.map(m => m.name), 'stCurrentTab'])];
const expose = '  window.__scope = { ' + exposed.map(n => `get ${n}() { return ${n}; }`).join(', ') + ' };\n';
const seam = '  /* Private bridge used by restaurant recipes.';
const baseline = original.replace(seam, expose + seam);
const actual = core.replace(seam, expose + seam);
for (const real of [false, true]) {
  const before = realm(baseline, real), after = realm(actual, real);
  assert.deepEqual(after.calls, before.calls, 'démarrage et inscriptions inchangés');
  assert.deepEqual(Object.keys(after.context).filter(k => k !== 'KiwiStockInternal').sort(), Object.keys(before.context).sort(), 'un seul namespace global ajouté');
  assert.deepEqual(Object.keys(after.context.Kiwi.handlers), Object.keys(before.context.Kiwi.handlers));
  assert.equal(JSON.stringify(after.context.KiwiRestaurantStock.rows()), JSON.stringify(before.context.KiwiRestaurantStock.rows()), 'pont recettes disponible avant les parties');
  assert.equal(after.scripts.length, 5, 'les cinq parties se préchargent au démarrage, un premier clic n’attend pas le réseau');
  let scope;
  const install = after.context.KiwiStockInternal.install;
  after.context.KiwiStockInternal.install = (name, factory) => install(name, s => { scope = s; return factory(s); });
  const one = after.context.Kiwi.handlers['stock-tab']({ dataset: { tab: 'orders' } });
  const two = after.context.Kiwi.handlers['stock-tab']({ dataset: { tab: 'suppliers' } });
  assert.equal(after.scripts.length, 5, 'appels concurrents : un seul chargement par partie');
  for (const script of [...after.scripts].reverse()) {
    vm.runInContext(read(script.src.split('?')[0]), after.context, { filename: script.src });
    script.onload();
  }
  await Promise.all([one, two]);
  scope = after.context.__scope;
  assert.equal(scope.stCurrentTab, 'suppliers', 'les deux intentions sont transmises dans leur ordre');
  assert.equal(after.context.Kiwi.handlers['stock-tab']({ dataset: { tab: 'overview' } }), undefined, 'après chargement, retour synchrone conservé');
  for (const name of ['renderSuppliers', 'renderOrders', 'renderWasteJournal', 'renderCountsHistory', 'renderScanStage1']) {
    assert.equal(scope[name](), before.context.__scope[name](), name + ' : rendu identique');
  }
  assert.equal(scope.normalizeMatchStr(' Café  Atlas '), before.context.__scope.normalizeMatchStr(' Café  Atlas '));
  // Une date lue sur une facture (PDF, modèle) ne sort jamais de son attribut.
  const hostile = scope.renderRealReceiptReview({ parsed: { date: '"><img src=x onerror=alert(1)>', lines: [{ name: 'x', qty: '1"><b>', unitCost: '2"><i>' }] } });
  assert.ok(!/<img|<b>|<i>/.test(hostile), 'réception : date et lignes lues échappées');
  assert.match(hostile, /type="date" value="\d{4}-\d{2}-\d{2}"/, 'une date invalide retombe sur aujourd’hui');
  for (const s of [scope, before.context.__scope]) {
    assert.equal(s.stReviewBusyTake([], null), true);
    assert.equal(s.stReviewBusyTake([], null), false);
    s.stReviewBusyRelease([], null);
    assert.equal(s.stReviewBusyTake([], null), true);
  }
  assert.deepEqual([...after.storage], [...before.storage]);
}
// Une erreur réseau libère la tentative ; les wrappers de garde restent autour.
{
  const r = realm(core, false), H = r.context.Kiwi.handlers;
  const captured = H['stock-tab']; let guarded = 0;
  H['stock-tab'] = function (...args) { guarded++; return captured.apply(this, args); };
  const first = H['stock-tab']({ dataset: { tab: 'orders' } });
  const failed = r.scripts[0];
  failed.onerror();
  for (const script of r.scripts.slice(1)) {
    vm.runInContext(read(script.src.split('?')[0]), r.context);
    script.onload();
  }
  await first;
  const retry = H['stock-tab']({ dataset: { tab: 'overview' } });
  assert.equal(r.scripts.length, 6, 'seule la partie en échec est retentée');
  const script = r.scripts.at(-1);
  vm.runInContext(read(script.src.split('?')[0]), r.context); script.onload();
  await retry;
  assert.equal(guarded, 2, 'la garde installée après reste en place');
}
console.log(`✓ stock-split-test : 138 corps reconstruits, ${identical} identiques ; démarrage démo/réel, pont recettes, rendus, état vivant, concurrence, reprise et gardes`);
