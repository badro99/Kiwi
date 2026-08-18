#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Tests des actions fournisseurs (tools/supplier-actions-test.mjs)
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('\n■ Supplier Table Actions & Rating Tests (tools/supplier-actions-test.mjs)');

const stockSource = fs.readFileSync(path.join(ROOT, 'assets', 'stock.js'), 'utf8');

// Mock browser environment
let lastNavHref = '';
let lastWindowOpen = null;
const toasts = [];
const modals = [];
let editSupplierOpenedWith = null;

const fakeWindow = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: {
    get href() { return lastNavHref; },
    set href(v) { lastNavHref = v; }
  },
  open: (url, target, features) => {
    lastWindowOpen = { url, target, features };
  },
  Kiwi: {
    handlers: {},
    toast: (msg, opts) => toasts.push({ msg, opts }),
    modal: (opts) => {
      modals.push(opts);
      return { el: { querySelector: () => null, querySelectorAll: () => [] } };
    }
  },
  KiwiEnv: { isReal: () => true },
  KiwiVenue: {
    isCustom: () => true,
    getCurrentVenueData: () => ({ name: 'Test Shop' }),
    getSuppliers: () => [
      { id: 'sup-1', name: 'Boucherie Errazi', contact: '06 12 34 56 78', category: 'viandes', rating: 4.8 },
      { id: 'sup-2', name: 'Fournisseur Inconnu', contact: '—', category: 'epicerie', rating: null },
      { id: 'sup-3', name: 'Atlas Maraîcher', contact: '07 98 76 54 32', category: 'legumes', rating: 4.2 },
      { id: 'sup-4', name: 'Fournisseur Sans Numéro', contact: '', category: 'laitiers', rating: null },
    ],
    getInventory: () => [
      { id: 'it-1', name: 'Viande hachée', unit: 'kg', costPerUnit: 85, suppliers: [{ id: 'sup-1', supplierName: 'Boucherie Errazi', defaultPrice: 85 }] },
      { id: 'it-2', name: 'Tomates', unit: 'kg', costPerUnit: 12, suppliers: [{ id: 'sup-3', supplierName: 'Atlas Maraîcher', defaultPrice: 12 }] }
    ]
  },
  KiwiI18n: { getLang: () => 'fr' },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  setTimeout: (fn) => fn(),
  requestAnimationFrame: (fn) => fn(),
};

const sandbox = {
  window: fakeWindow,
  document: fakeWindow.document,
  location: fakeWindow.location,
  localStorage: fakeWindow.localStorage,
  setTimeout: fakeWindow.setTimeout,
  requestAnimationFrame: fakeWindow.requestAnimationFrame,
  console: console,
  Date: Date,
  Math: Math,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  RegExp: RegExp,
  encodeURIComponent: encodeURIComponent,
};

vm.createContext(sandbox);
vm.runInContext(stockSource, sandbox);

const H = fakeWindow.Kiwi.handlers;

// 1. Phone Call handler tests
H['stock-call-supplier']({ dataset: { name: 'Boucherie Errazi', phone: '06 12 34 56 78', supplierId: 'sup-1' } });
check('Valid phone formats tel: URI and sets location.href', lastNavHref === 'tel:0612345678');
check('No fake toast on valid call', toasts.length === 0);

lastNavHref = '';
toasts.length = 0;
H['stock-call-supplier']({ dataset: { name: 'Fournisseur Inconnu', phone: '—', supplierId: 'sup-2' } });
check('Invalid phone does not navigate tel:', lastNavHref === '');
check('Invalid phone displays warning toast', toasts.length === 1 && toasts[0].msg.includes('Pas de numéro'));

// 2. WhatsApp handler tests
lastWindowOpen = null;
toasts.length = 0;
H['stock-wa-supplier']({ dataset: { name: 'Errazi', phone: '0612345678', supplierId: 'sup-1' } });
check('WhatsApp formats Moroccan 06 to 2126 in wa.me link',
  lastWindowOpen && lastWindowOpen.url.startsWith('https://wa.me/212612345678') && lastWindowOpen.url.includes('Bonjour%20Errazi'));

lastWindowOpen = null;
H['stock-wa-supplier']({ dataset: { name: 'Atlas Maraîcher', phone: '07 98 76 54 32', supplierId: 'sup-3' } });
check('WhatsApp formats Moroccan 07 to 2127 in wa.me link',
  lastWindowOpen && lastWindowOpen.url.startsWith('https://wa.me/212798765432'));

lastWindowOpen = null;
toasts.length = 0;
H['stock-wa-supplier']({ dataset: { name: 'Fournisseur Sans Numéro', phone: '', supplierId: 'sup-4' } });
check('WhatsApp on empty phone triggers warning toast', toasts.length === 1 && toasts[0].msg.includes('Pas de numéro'));
check('WhatsApp does not open window on empty phone', lastWindowOpen === null);

// 3. New PO button handler test
modals.length = 0;
H['stock-new-po']({ dataset: { supplierId: 'sup-1' } });
check('stock-new-po opens reception modal', modals.length > 0);
const poModalBody = modals[modals.length - 1]?.body || '';
check('Reception modal preselects supplier name in readonly field', poModalBody.includes('readonly') && poModalBody.includes('data-stock-receive-supplier') && poModalBody.includes('value="Boucherie Errazi"'));
check('Reception modal filters items to supplier subcategories', poModalBody.includes('value="it-1"') && !poModalBody.includes('value="it-2"'));
check('Reception modal attaches defaultPrice on item options', poModalBody.includes('data-default-cost="85"'));

// 4. Rating checks in source
check('4.5 default rating removed from supplier creation', !stockSource.includes('const rating = isNaN(ratingRaw) ? 4.5 :'));
check('Supplier row renders dash when rating is null', stockSource.includes('st-sup-rate') && stockSource.includes('—'));

if (failures > 0) {
  console.error(`\n✗ ${failures} failure(s) in supplier actions test.`);
  process.exit(1);
}
console.log('\n✓ All supplier actions test checks passed.\n');
