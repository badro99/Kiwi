import invoicingSourceHelper from './invoicing-test-source.cjs';
/* Factures de vente · une seule clé de cache, celle du commerce.
 *
 * invoice.js lit et écrit le cache sous `kiwi:sale_invoices:v1:<commerce>`
 * (cacheKey()). Le registre des factures (invoicing.js) rapatriait celles du
 * serveur sous la clé NUE `kiwi:sale_invoices:v1`, que personne ne relit : les
 * factures numérotées sur une autre caisse n'apparaissaient jamais, et le cache
 * du commerce partait, tel quel, dans une clé orpheline. Les deux fichiers
 * passent maintenant par la même fonction (KiwiInvoice.setCachedInvoice).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; console.log('  ✓ ' + message); };

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
};
const fakeWindow = {
  KiwiReceipt: { business: () => ({ name: 'Café de la Gare' }), config: () => ({ vat: { mode: 'included', rate: 20 } }) },
  KiwiLive: { merchant: () => 'cafe-gare', saleIdFor: (s) => `sale-${s.ref}` },
  document: { baseURI: 'https://kiwi.test/' },
  localStorage,
};
const invoiceSource = fs.readFileSync(path.join(ROOT, 'assets/invoice.js'), 'utf8');
const KiwiInvoice = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`)(
  fakeWindow, fakeWindow.document, localStorage);
fakeWindow.KiwiInvoice = KiwiInvoice;

console.log('■ Factures de vente · clé de cache');

ok(typeof KiwiInvoice.setCachedInvoice === 'function', 'invoice.js exporte l\'écriture du cache, à côté de sa lecture');
KiwiInvoice.setCachedInvoice('sale-1', { number: 'F-2026-0001', seq: 1 });
ok(KiwiInvoice.getCachedInvoices()['sale-1'].number === 'F-2026-0001' && store.has('kiwi:sale_invoices:v1:cafe-gare'),
  'ce qui s\'écrit se relit, sous la clé du commerce');

/* invoicing.js : la synchronisation serveur, exécutée */
const invoicing = invoicingSourceHelper.invoicingTestSource(ROOT);
const from = invoicing.indexOf('  function syncServerInvoices() {');
const to = invoicing.indexOf('  /* ── vendeur');
ok(from > 0 && to > from, 'la synchronisation des factures serveur est localisée dans invoicing.js');
let repainted = 0;
let currentMerchant = 'cafe-gare';
const sandbox = {
  window: fakeWindow, merchantSlug: () => currentMerchant, overlay: {}, tab: 'sales', currentView: 'list',
  paintRegister: () => { repainted += 1; },
  fetch: async () => ({ ok: true, json: async () => ({ invoices: [
    { saleId: 'sale-2', number: 'F-2026-0002', seq: 2, snapshot: { totals: { ttc: 120 } }, customer: { name: 'Société X', ice: '001234567000089' } },
    { saleId: 'sale-3', number: 'F-2026-0003', seq: 3, snapshot: { totals: { ttc: 60 } } },
    { saleId: 'sale-4', number: 'F-2026-0004', seq: 4 },
  ] }) }),
  Object, JSON, Array, Promise,
};
vm.createContext(sandbox);
vm.runInContext(`${invoicing.slice(from, to)}\n;this.sync = syncServerInvoices;`, sandbox);
sandbox.sync();
await new Promise((resolve) => setTimeout(resolve, 20));
const cached = KiwiInvoice.getCachedInvoices();
ok(cached['sale-2'] && cached['sale-2'].number === 'F-2026-0002' && cached['sale-2'].seq === 2
  && cached['sale-2'].customer.name === 'Société X' && cached['sale-3'].number === 'F-2026-0003',
  'les factures rapatriées du serveur se lisent par getCachedInvoices()');
ok(cached['sale-1'] && cached['sale-1'].number === 'F-2026-0001', 'celles déjà en cache restent');
ok(!cached['sale-4'], 'une facture sans instantané n\'entre pas au cache');
ok(!store.has('kiwi:sale_invoices:v1'), 'plus rien n\'est écrit sous la clé nue, que personne ne lit');
ok(repainted === 1, 'le registre se repeint une fois synchronisé');

/* le commerce change pendant la réponse : on n'écrit pas chez le suivant */
store.clear();
currentMerchant = 'cafe-gare';
sandbox.fetch = async () => { currentMerchant = 'boutique-voisine'; return { ok: true, json: async () => ({ invoices: [
  { saleId: 'sale-9', number: 'F-2026-0009', seq: 9, snapshot: { totals: { ttc: 10 } } }] }) }; };
sandbox.sync();
await new Promise((resolve) => setTimeout(resolve, 20));
ok(store.size === 0, 'une réponse arrivée après un changement de commerce n\'écrit rien');

console.log(`\n✓ ${controls} contrôles : une seule clé de cache pour les factures de vente.`);
