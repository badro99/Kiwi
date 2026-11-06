import invoicingSourceHelper from './invoicing-test-source.cjs';
/* Facturation · le document imprimé suit la langue, charge ses polices et attend
 * qu'elles soient là avant d'imprimer.
 *
 * r20 : le gabarit gardait « Tél » et la virgule décimale française pour les
 * quantités et les remises en anglais et en arabe, ouvrait une fenêtre vierge qui
 * nommait « Inter Tight » et « IBM Plex Sans Arabic » sans les déclarer (sur un
 * autre appareil, Arial), puis imprimait après 150 ms fixes. Ce banc exécute le
 * vrai printable() et le vrai script d'impression qu'il écrit dans la fenêtre. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = invoicingSourceHelper.invoicingTestSource(ROOT);
const slice = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + from.length); if (a < 0 || b < 0) throw new Error('repère : ' + from); return src.slice(a, b); };
const code = [slice('  const VAT_RATES', '  /* ── erreurs d\'API'), slice('  function getSeller()', '  /* ── libellés de documents'), slice('  /* print:start */', '  /* print:end */'), 'globalThis.__printable = printable;'].join('\n');
let lang = 'fr';
const seller = { name: 'Atelier Test', legalName: 'Atelier Test SARL', ice: '001234567000089', address: '12 rue des Tests', city: 'Casablanca', phone: '0522000000' };
const window = { KiwiI18n: { getLang: () => lang }, KiwiMe: { business: 'Atelier Test' }, KiwiInvoice: { getSellerBusiness: () => seller } };
const ctx = vm.createContext({ window, document: { documentElement: { lang: 'fr' }, baseURI: 'https://kiwi-os.com/dashboard' }, localStorage: { getItem: () => null }, Intl, Date, Math, Number, String, JSON, Set, Map, URLSearchParams, isFinite });
vm.runInContext(code, ctx);
const flat = (s) => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const doc = { type: 'invoice', status: 'issued', number: 'F-2026-0042', issueDate: '2026-10-13', dueDate: '2026-11-12', termsDays: 30, seller,
  customer: { name: 'Riad Test' }, lines: [{ description: 'Farine', qty: 1.5, unitHT: 10000, discountPct: 12.5, vatRate: 20 }, { description: 'Sel', qty: 2, unitHT: 500, discountPct: 0, vatRate: 7 }] };

lang = 'fr';
let html = ctx.__printable(doc), f = flat(html);
assert.match(f, /Tél : 0522000000/, 'fr : libellé Tél');
assert.match(f, /<td>1,5<\/td>/, 'fr : quantité à virgule');
assert.match(f, /<td>12,5 %<\/td><td>20 %<\/td>/, 'fr : remise et TVA à la française');
lang = 'en'; html = ctx.__printable(doc); f = flat(html);
assert.ok(!/Tél/.test(html) && /Tel : 0522000000/.test(f), 'en : « Tel » et non « Tél »');
assert.match(f, /<td>1\.5<\/td>/, 'en : quantité 1.5 (point décimal)');
assert.match(f, /<td>12\.5%<\/td><td>20%<\/td>/, 'en : remise 12.5% et TVA 20%');
lang = 'ar'; html = ctx.__printable(doc); f = flat(html);
assert.ok(!/Tél/.test(html) && /الهاتف : 0522000000/.test(f), 'ar : libellé arabe');
assert.match(f, /<td>1,5<\/td>/, 'ar : chiffres latins, virgule (règle de la maison)');
assert.match(f, /<td>12,5 %<\/td>/, 'ar : remise');

/* Polices : déclarées dans le document, par des URL relatives à <base>. */
lang = 'fr'; html = ctx.__printable(doc);
for (const [family, file] of [['Inter Tight', 'inter-tight-latin.woff2'], ['IBM Plex Sans Arabic', 'plex-arabic-400.woff2'], ['IBM Plex Sans Arabic', 'plex-arabic-600.woff2'], ['IBM Plex Sans Arabic', 'plex-arabic-700.woff2']]) {
  assert.ok(new RegExp('@font-face\\{font-family:"' + family + '";src:url\\("assets/fonts/' + file.replace('.', '\\.') + '"\\)').test(html), 'police déclarée : ' + file);
}
assert.ok(html.indexOf('@font-face') < html.indexOf('@page'), 'les polices précèdent les règles de page');

/* Le script d'impression attend les polices (pas de délai fixe). */
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
function run({ fontsResolve, never }) {
  let printed = 0, timers = [], loaded = [];
  let release; const gate = new Promise((r) => { release = r; });
  const fonts = { load: (spec) => { loaded.push(spec); return never ? new Promise(() => {}) : gate.then(() => []); }, ready: gate };
  const listeners = {};
  const sandbox = { document: { fonts, readyState: 'complete' }, addEventListener: (n, fn) => { listeners[n] = fn; }, print: () => { printed++; }, setTimeout: (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.done = true; } };
  vm.runInNewContext(script, sandbox);
  const fire = () => { for (const t of timers.filter((x) => !x.done && x.ms <= 100)) { t.done = true; t.fn(); } };
  return { get printed() { return printed; }, loaded, timers, release, fire, fireAll: () => { for (const t of timers.filter((x) => !x.done)) { t.done = true; t.fn(); } } };
}
let r = run({});
r.fire();
assert.equal(r.printed, 0, 'rien n’est imprimé tant que les polices chargent (l’ancien script imprimait à 150 ms quoi qu’il arrive)');
assert.ok(r.loaded.some((s) => /Inter Tight/.test(s)) && r.loaded.some((s) => /IBM Plex Sans Arabic/.test(s)), 'les deux familles sont demandées');
r.release(); await new Promise((res) => setImmediate(res)); await new Promise((res) => setImmediate(res)); r.fire();
assert.equal(r.printed, 1, 'puis l’impression part une seule fois');
r = run({ never: true }); r.fire(); assert.equal(r.printed, 0);
const safety = r.timers.find((t) => !t.done && t.ms >= 1000);
assert.ok(safety, 'un garde-fou borne l’attente si une police ne vient jamais');
r.fireAll(); r.fire(); assert.equal(r.printed, 1, 'le garde-fou imprime tout de même, une seule fois');
console.log('✓ invoicing print locale: labels and numbers follow the language, fonts embedded, print waits for fonts');
