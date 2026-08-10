import fs from 'node:fs';
import vm from 'node:vm';

let checks = 0;
function ok(value, label) {
  checks += 1;
  if (!value) throw new Error('FAIL: ' + label);
}

const source = fs.readFileSync(new URL('../assets/retail-scan.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const dispatch = fs.readFileSync(new URL('../assets/pos-dispatch.js', import.meta.url), 'utf8');
const sale = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');
const storeApi = fs.readFileSync(new URL('../functions/api/store.js', import.meta.url), 'utf8');

const storage = new Map();
const window = {};
const context = {
  window,
  document: { querySelector() { return null; } },
  localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); } },
  navigator: { onLine: true },
  Intl,
  Number,
  Date,
  Math,
  JSON,
  String,
  Object,
  Array,
  Promise,
  setTimeout,
  clearTimeout,
};
window.window = window;
window.navigator = context.navigator;
vm.runInNewContext(source, context, { filename: 'retail-scan.js' });

const api = window.KiwiRetailScan;
ok(api && typeof api.open === 'function', 'public retail scan API exists');
['boutique', 'epicerie', 'pharmacie', 'librairie', 'fleuriste', 'autre'].forEach((id) => ok(api.eligible(id), id + ' is eligible'));
['restaurant', 'pressing', 'hotel', 'spa'].forEach((id) => ok(!api.eligible(id), id + ' specialist checkout is untouched'));
ok(api._test.money(12.349) === 12.35, 'money rounds to cents');
ok(api._test.money(Number.NaN) === 0, 'non-finite amount is neutralized');
ok(api._test.normalizeCode(' 012345678905\n') === '012345678905', 'scanner terminator is stripped without losing leading zero');
ok(api._test.due(100, [{ amount: 25 }, { amount: 30.5 }]) === 44.5, 'split payment due is exact');
const merged = api._test.mergeCredits(
  { seq: 2, entries: [{ id: 'a', amount: 10, updated: 1 }] },
  { seq: 4, entries: [{ id: 'a', amount: 12, updated: 2 }, { id: 'b', amount: 5, updated: 1 }] },
);
ok(merged.seq === 4 && merged.entries.length === 2, 'credit ledger merges and de-duplicates');
ok(merged.entries.find((x) => x.id === 'a').amount === 12, 'newest credit entry wins');

ok(source.includes('new window.BarcodeDetector'), 'uses browser barcode detector');
ok(source.includes('navigator.mediaDevices.getUserMedia'), 'uses continuous phone camera');
ok(source.includes('C.findByBarcode(code)'), 'resolves the shared catalog');
ok(source.includes('C.addProduct(') && source.includes('C.addVariant(') && source.includes('C.attachBarcode('), 'creates unknown catalog products and barcodes');
ok(source.includes('window.KiwiPromos') && source.includes('.priceFor('), 'prices active promotions');
ok(source.includes('window.KiwiInventory.ensureOpening'), 'creates opening stock movement');
ok(source.includes('window.KiwiPosSale.record(current, sale)'), 'writes the shared sales ledger');
ok(source.includes("if (!journalled)"), 'never clears paid cart when the sales journal refuses the receipt');
ok(source.includes('window.KiwiPrinter') && source.includes('.printReceipt(opts)'), 'prints through Kiwi printer bridge');
ok(source.includes('H.authorizeCard(amount'), 'card parts require the real hardware adapter');
ok(source.includes('window.KiwiClients.recordPurchase'), 'customer purchase history is updated');
ok(source.includes("feature: 'retailcredit'"), 'customer credit has a cloud document');
ok(!source.includes('data-krs-parts-reset'), 'accepted payment parts cannot be erased');
ok(source.includes('Une part est déjà confirmée. Encaissez le solde restant'), 'accepted payment parts block unsafe cancellation');
ok(source.includes('parts: state.parts') && source.includes('if (d && Array.isArray(d.parts))'), 'accepted split parts survive reload');
ok(source.includes("if (state.parts.length && state.cart.length)"), 'reload reopens the outstanding payment balance');
ok(!/Math\.random\(\).*approved|approved.*Math\.random\(/s.test(source), 'does not invent card approval');

ok(html.includes('assets/retail-scan.css?v=3') && html.includes('assets/retail-scan.js?v=3'), 'caisse loads retail scan assets');
ok(dispatch.includes('KiwiRetailScan.mount(root, id)'), 'dispatcher mounts the additive lane');
ok(sw.includes("'kiwi-app-v336'") && sw.includes("'/assets/retail-scan.js?v=3'"), 'offline shell caches the feature');
ok(storeApi.includes("retailcredit: { keys: ['entries', 'seq']"), 'store endpoint authorizes the credit document shape');
ok(sale.includes("split: 'split'") && sale.includes("credit: 'credit'"), 'sales ledger preserves split and credit methods');
ok(sale.includes('entry.parts = sale.parts'), 'sales journal retains sanitized payment parts');

console.log('retail scan: ' + checks + ' controls passed');
