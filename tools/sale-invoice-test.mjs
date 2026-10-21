// tools/sale-invoice-test.mjs — suite de tests pour la facturation des ventes (A4/PDF & D1).
//
// Valide :
// 1. TTC exact au centime près, ventilation HT + TVA = TTC
// 2. Repli si lines null => une ligne « Vente <ref> »
// 3. issuedTs == sale.ts (date exacte de la vente, jamais Date.now())
// 4. Snapshot figé (changer business après build ne mute pas le document)
// 5. Bandeau d'alerte légale si l'ICE de l'établissement est manquant
// 6. Extraction serveur functions/api/invoice.js (validation client ICE 15 chiffres, format F-AAAA-XXXX, idempotence D1)
// 7. Unicité du calcul d'identifiant (window.KiwiLive.saleIdFor)
// 8. open('pdf') pose document.title = number
// 9. Hard count pinning exact

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as ICE from '../functions/api/_ice.js';
import * as SERIES from '../functions/api/_invoice-series.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];

function ok(cond, message) {
  if (cond) {
    passed++;
  } else {
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

console.log('■ Sale Invoice (A4 / PDF & D1 Numbering)');

// ── 1. Client Module (assets/invoice.js) ─────────────────────────────────────
const invoiceSource = fs.readFileSync(path.join(ROOT, 'assets/invoice.js'), 'utf8');

// Extraction de KiwiInvoice dans un contexte isolé
let KiwiInvoice;
{
  const fakeWindow = {
    KiwiReceipt: {
      business: () => ({ name: 'Café de la Gare', city: 'Casablanca', ice: '001234567000089', if: '12345678', rc: '88776' }),
      config: () => ({ vat: { mode: 'included', rate: 20 } }),
    },
    KiwiLive: {
      merchant: () => 'cafe-gare',
      saleIdFor: (s) => `sale-ref-${s.ref}`,
    },
    document: { baseURI: 'https://app.kiwi-pos.com/' },
    localStorage: { getItem: () => null, setItem: () => {} },
  };

  const fn = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`);
  KiwiInvoice = fn(fakeWindow, fakeWindow.document, fakeWindow.localStorage);
}

ok(!!KiwiInvoice, 'KiwiInvoice module loaded');
ok(typeof KiwiInvoice.build === 'function', 'KiwiInvoice.build is a function');
ok(typeof KiwiInvoice.html === 'function', 'KiwiInvoice.html is a function');
ok(typeof KiwiInvoice.open === 'function', 'KiwiInvoice.open is a function');

// Test 1: TTC exact au centime et HT + TVA == TTC avec TVA 20%
const mockSale1 = {
  id: 'sale-001',
  ref: 'T-1042',
  ts: 1771488000000, // Date passée figée (ex: 2026-02-19)
  amountCents: 12550, // 125.50 MAD
  method: 'card',
  lines: [
    { name: 'Menu Burger', qty: 1, total: 95.50 },
    { name: 'Soda 33cl', qty: 2, total: 30.00 },
  ],
};

const doc1 = KiwiInvoice.build(mockSale1, { tvaRate: 20, number: 'F-2026-0001' });
ok(doc1.totals.ttc === 125.50, 'TTC matches sale amount exactly (125.50 MAD)');
ok(Math.abs(doc1.totals.ht + doc1.totals.tva - doc1.totals.ttc) < 0.001, 'HT + TVA == TTC holds true (104.58 + 20.92 = 125.50)');
ok(doc1.totals.ht === 104.58, 'HT computed correctly (104.58 MAD)');
ok(doc1.totals.tva === 20.92, 'TVA 20% computed correctly (20.92 MAD)');

// Test 2: lines null => une ligne « Vente <ref> »
const mockSaleNoLines = {
  id: 'sale-002',
  ref: 'T-9999',
  ts: 1771488000000,
  amount: 450,
  lines: null,
};
const docNoLines = KiwiInvoice.build(mockSaleNoLines);
ok(docNoLines.lines.length === 1, 'lines null produces exactly 1 line');
ok(docNoLines.lines[0].name.includes('T-9999'), 'fallback line contains sale ref');
ok(docNoLines.lines[0].totalTTC === 450, 'fallback line carries full total');

// Test 3: issuedTs == sale.ts (CRITIQUE : date de la vente, jamais Date.now())
const pastTs = 1718000000000;
const mockSalePast = { id: 'sale-past', ref: 'T-001', ts: pastTs, amount: 80 };
const docPast = KiwiInvoice.build(mockSalePast);
ok(docPast.issuedTs === pastTs, 'CRITICAL: issuedTs strictly equals sale.ts, never Date.now()');

// Test 4: Snapshot figé (changer l'objet seller après build ne mute pas le document)
const mutableSeller = { name: 'Ancienne Raison Sociale', ice: '001234567000089' };
const docSnapshot = KiwiInvoice.build(mockSale1, { seller: mutableSeller });
mutableSeller.name = 'Nouvelle Raison Sociale Modifiée';
ok(docSnapshot.seller.name === 'Ancienne Raison Sociale', 'Seller identity is deeply snapshot/frozen at creation');

// Test 5: Alerte ICE manquant
const docNoIce = KiwiInvoice.build(mockSale1, { seller: { name: 'Boutique Sans ICE', ice: '' } });
ok(docNoIce.missingICE === true, 'missingICE flag set when seller has no ICE');
const htmlNoIce = KiwiInvoice.html(docNoIce);
ok(htmlNoIce.includes('Mention obligatoire manquante') && htmlNoIce.includes('ICE'), 'HTML contains visible ICE alert banner');

const docWithIce = KiwiInvoice.build(mockSale1, { seller: { name: 'Boutique Conforme', ice: '001234567000089', logo: 'data:image/png;base64,mocklogo' } });
ok(docWithIce.missingICE === false, 'missingICE is false when seller has valid ICE');
const htmlWithIce = KiwiInvoice.html(docWithIce);
ok(!htmlWithIce.includes('<div class="ice-alert">'), 'HTML omits ICE alert div when ICE is valid');
ok(htmlWithIce.includes('class="seller-logo"'), 'HTML renders store custom logo when provided');
ok(htmlWithIce.includes('class="footer-powered"'), 'HTML includes pretty powered by kiwi badge in footer');
ok(htmlWithIce.includes('Propulsé par'), 'HTML includes Propulsé par text');

// Test 5b: Nested legal object in seller (from KiwiReceipt.business) resolves ice properly
const docWithNestedLegal = KiwiInvoice.build(mockSale1, {
  seller: {
    name: 'Amira Cafe',
    logo: 'data:image/png;base64,amiralogo',
    legal: {
      ice: '530013021033445',
      fiscal: '1234567',
      rc: 'Casablanca 12345',
      patente: '987654',
      address: '10 Rue Hassan II',
      city: 'Casablanca',
    }
  }
});
ok(docWithNestedLegal.missingICE === false, 'missingICE is false when seller has nested legal.ice');
ok(docWithNestedLegal.seller.ice === '530013021033445', 'seller.ice is populated from legal.ice');
const htmlNested = KiwiInvoice.html(docWithNestedLegal);
ok(!htmlNested.includes('<div class="ice-alert">'), 'HTML omits alert banner when legal.ice is provided');
ok(htmlNested.includes('ICE :</strong> 530013021033445') || htmlNested.includes('ICE : 530013021033445'), 'HTML displays the 15-digit ICE');
ok(htmlNested.includes('IF :</strong> 1234567') || htmlNested.includes('IF : 1234567'), 'HTML displays the IF');

// Test 6: open('pdf') pose document.title = number
let lastWin = null;
const mockWindowOpener = {
  open: () => {
    lastWin = {
      document: {
        open: () => {},
        write: (h) => { lastWin.html = h; },
        close: () => {},
        title: '',
      }
    };
    return lastWin;
  }
};
{
  const fnWithOpener = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`);
  const invoiceWithOpener = fnWithOpener(mockWindowOpener, { getElementById: () => null }, {});
  invoiceWithOpener.open({ number: 'F-2026-0042', seller: { name: 'Test' } }, 'pdf');
  ok(lastWin && lastWin.document.title === 'F-2026-0042', 'open() sets win.document.title to invoice number for browser PDF naming');
}

// ── 2. Server Module (functions/api/invoice.js) ──────────────────────────────
const serverSource = fs.readFileSync(path.join(ROOT, 'functions/api/invoice.js'), 'utf8');

// Extraction des validateurs et fonctions pures serveur
const custValMatch = serverSource.match(/export function validateCustomer\([\s\S]*?\n\}/);
const fmtNumMatch = serverSource.match(/export function formatInvoiceNumber\([\s\S]*?\n\}/);
const schemaMatch = serverSource.match(/export async function ensureInvoiceSchema\([\s\S]*?\n\}/);
const getOrCreateMatch = serverSource.match(/export async function getOrCreateSaleInvoice\([\s\S]*?\n\}/);

ok(!!custValMatch, 'validateCustomer exported in functions/api/invoice.js');
ok(!!fmtNumMatch, 'formatInvoiceNumber exported in functions/api/invoice.js');
ok(!!schemaMatch, 'ensureInvoiceSchema exported in functions/api/invoice.js');
ok(!!getOrCreateMatch, 'getOrCreateSaleInvoice exported in functions/api/invoice.js');

let validateCustomer, formatInvoiceNumber, getOrCreateSaleInvoice;
if (custValMatch && fmtNumMatch && schemaMatch && getOrCreateMatch) {
  const code = `
    ${custValMatch[0].replace('export function', 'function')}
    ${fmtNumMatch[0].replace('export function', 'function')}
    ${schemaMatch[0].replace('export async function', 'async function')}
    ${getOrCreateMatch[0].replace('export async function', 'async function')}
    return { validateCustomer, formatInvoiceNumber, getOrCreateSaleInvoice };
  `;
  /* validateCustomer lit la règle ICE partagée (functions/api/_ice.js). */
  /* …et l'allocateur de numéros commun à la caisse et à la saisie
   * (functions/api/_invoice-series.js). */
  const helpers = new Function('iceCompact', 'iceProblem', 'ICE_DETAIL', 'allocateNumber', code)(ICE.iceCompact, ICE.iceProblem, ICE.ICE_DETAIL, SERIES.allocateNumber);
  validateCustomer = helpers.validateCustomer;
  formatInvoiceNumber = helpers.formatInvoiceNumber;
  getOrCreateSaleInvoice = helpers.getOrCreateSaleInvoice;
}

if (validateCustomer) {
  // Test validation client
  ok(validateCustomer(null) === null, 'validateCustomer returns null on null');
  ok(validateCustomer({}) === null, 'validateCustomer returns null on empty object');

  const validCust = validateCustomer({ name: 'Client Pro SARL', ice: '001234567000062', if: '987654' });
  ok(validCust.name === 'Client Pro SARL', 'customer name preserved');
  ok(validCust.ice === '001234567000062', 'valid 15-digit ICE preserved');
  ok(validateCustomer({ name: 'Espaces', ice: '00 1234567 0001 59' }).ice === '001234567000159', 'ICE typed with spaces is compacted');
  let sumThrew = null;
  try { validateCustomer({ name: 'Faute de frappe', ice: '001234567000089' }); } catch (e) { sumThrew = e.message + ':' + e.reason; }
  ok(sumThrew === 'invalid-ice:checksum', 'an ICE that fails its mod-97 check digits is refused');
  ok(validCust.if === '987654', 'IF preserved');

  // Nom bridé à 80 caractères
  const longCust = validateCustomer({ name: 'Z'.repeat(120), ice: '001234567000062' });
  ok(longCust.name.length === 80, 'customer name clamped to 80 chars');

  // ICE invalide => rejet
  let threw = false;
  try { validateCustomer({ name: 'Test', ice: '12345' }); } catch (e) { threw = e.message === 'invalid-ice'; }
  ok(threw, 'validateCustomer throws on non-15-digit ICE');
}

if (formatInvoiceNumber) {
  ok(formatInvoiceNumber(2026, 1) === 'F-2026-0001', 'formats first invoice F-2026-0001');
  ok(formatInvoiceNumber(2026, 42) === 'F-2026-0042', 'formats 42nd invoice F-2026-0042');
  ok(formatInvoiceNumber(2026, 9999) === 'F-2026-9999', 'formats 9999th invoice F-2026-9999');
  ok(formatInvoiceNumber(2026, 10000) === 'F-2026-10000', 'formats 5-digit invoice F-2026-10000');
}

// Test Idempotence serveur sur une vraie base SQLite au schéma réel (schema.sql),
// avec la lecture de la table `sales` et l'allocateur de numéros commun.
if (getOrCreateSaleInvoice) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const insSale = sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insSale.run('sale-A', 'shop-casa', 150, 15000, 'cash', 'R-A', 1771488000000);
  insSale.run('sale-B', 'shop-casa', 200, 20000, 'cash', 'R-B', 1771488000000);
  insSale.run('sale-ref-x', 'shop-casa', 50, 5000, 'cash', 'R-X', 1771488000000);
  const mockDb = {
    prepare(q) {
      const st = sqlite.prepare(q);
      const bound = (p) => ({
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...p) => bound(p) });
    },
    // D1 joue un lot en UNE transaction : tout ou rien.
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  const dbRows = { has: (key) => { const [m, sid] = key.split('|'); return !!sqlite.prepare('SELECT 1 FROM sale_invoices WHERE merchant = ? AND sale_id = ?').get(m, sid); } };
  const mockEnv = { DB: mockDb };

  // Premier appel pour sale-A => F-2026-0001
  const snapA = { issuedTs: 1771488000000, totals: { ttc: 150 } };
  const res1 = await getOrCreateSaleInvoice(mockEnv, 'shop-casa', 'sale-A', { name: 'Client 1' }, snapA);
  ok(res1.existing === false, 'First call creates new invoice');
  ok(res1.number === 'F-2026-0001', 'First invoice receives number F-2026-0001');
  ok(res1.seq === 1, 'First invoice receives seq 1');

  // Second appel pour la MÊME sale-A => renvoie F-2026-0001 (Idempotence)
  const res2 = await getOrCreateSaleInvoice(mockEnv, 'shop-casa', 'sale-A', { name: 'Nouveau Nom Ignoré' }, { totals: { ttc: 999 } });
  ok(res2.existing === true, 'CRITICAL: Second call for same sale returns existing === true');
  ok(res2.number === 'F-2026-0001', 'CRITICAL: Second call keeps exact same invoice number');
  ok(res2.seq === 1, 'CRITICAL: Second call keeps exact same seq');
  ok(res2.snapshot.totals.ttc === 150, 'CRITICAL: Snapshot is strictly frozen and preserved');

  // Troisième appel pour sale-B => F-2026-0002 (Monotone)
  const snapB = { issuedTs: 1771488000000, totals: { ttc: 200 } };
  const res3 = await getOrCreateSaleInvoice(mockEnv, 'shop-casa', 'sale-B', null, snapB);
  ok(res3.existing === false, 'Different sale creates new invoice');
  ok(res3.number === 'F-2026-0002', 'Next invoice receives number F-2026-0002');
  ok(res3.seq === 2, 'Next invoice receives seq 2');

  // Test (d) : ID de vente inconnu => 404 inconnu, rien d'inséré
  let unknownSaleThrew404 = false;
  try {
    await getOrCreateSaleInvoice(mockEnv, 'shop-casa', 'sale-unknown-999', null, { issuedTs: Date.now(), totals: { ttc: 80 } });
  } catch (e) {
    unknownSaleThrew404 = (e.message === 'unknown-sale' || e.status === 404);
  }
  ok(unknownSaleThrew404, 'Test (d): Server getOrCreateSaleInvoice throws 404 unknown-sale when sale ID is absent from D1');
  ok(!dbRows.has('shop-casa|sale-unknown-999'), 'Test (d): No invoice inserted for unknown sale ID');
}

// ── 3. Correction & Traçabilité de l'ID D1 (Tableau de bord vs Caisse) ─────────
const liveLinkSource = fs.readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
const venuesSource = fs.readFileSync(path.join(ROOT, 'assets/venues.js'), 'utf8');

ok(liveLinkSource.includes('saleId: s.id || s.saleId || \'\''), 'assets/live-link.js passes saleId: s.id on feed ingestion');

// Test (a) : Ingestion et conservation de l'id réel dans KiwiSales (venues.js) via le code de live-link.js
let storageMap = new Map();
const fakeVenuesWin = {
  localStorage: {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, v),
    removeItem: (k) => storageMap.delete(k),
  },
  document: {
    addEventListener: () => {},
    body: { classList: { remove: () => {}, add: () => {}, contains: () => false } },
    documentElement: { removeAttribute: () => {}, setAttribute: () => {}, getAttribute: () => null },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  addEventListener: () => {},
  location: { search: '', pathname: '/dashboard.html' },
  setInterval: () => 0,
  setTimeout: () => 0,
  clearInterval: () => {},
  clearTimeout: () => {},
  window: {},
};
fakeVenuesWin.window = fakeVenuesWin;
const venuesFn = new Function('window', 'localStorage', 'document', 'location', `${venuesSource}; return window.KiwiSales;`);
const KiwiSales = venuesFn(fakeVenuesWin, fakeVenuesWin.localStorage, fakeVenuesWin.document, fakeVenuesWin.location);

// Simulation de l'ingestion live-link avec le fragment de code réel de live-link.js
/* The bridge queues each new sale (fresh.push) and stores the batch with KiwiSales.addMany. */
const addCallMatch = liveLinkSource.match(/fresh\.push\(\s*(\{[\s\S]*?\})\s*\)/);
const feedRow = { id: 'sale-ref-x', ref: 'T-1', orderRef: 'Table 4', amount: 50, ts: 1770000000000, cursor: 42 };
let mappedSale = null;
if (addCallMatch) {
  const mapFn = new Function('s', 'amt', 'amtCents', 'cur', `return ${addCallMatch[1]};`);
  mappedSale = mapFn(feedRow, 50, 5000, 42);
}

KiwiSales.add('v1', mappedSale);
const storedList = KiwiSales.list('v1');
const ingestedEntry = storedList && storedList[0];
ok(ingestedEntry && ingestedEntry.saleId === 'sale-ref-x', 'Test (a): Feed row with id "sale-ref-x" yields entry with saleId === "sale-ref-x"');

// Test (b) : invoice.js résout cette entrée en 'sale-ref-x' SANS appeler saleIdFor
let saleIdForSpyCalled = false;
const fakeWindowSpy = {
  KiwiReceipt: { business: () => ({ name: 'Test' }), config: () => ({}) },
  KiwiLive: {
    merchant: () => 'm1',
    saleIdFor: () => { saleIdForSpyCalled = true; return 'wrong-hash'; },
  },
  document: { baseURI: 'https://app.kiwi-pos.com/' },
  localStorage: { getItem: () => null, setItem: () => {} },
};
const invoiceWithSpy = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`)(fakeWindowSpy, fakeWindowSpy.document, fakeWindowSpy.localStorage);

const docResolved = invoiceWithSpy.build(ingestedEntry);
ok(docResolved.saleId === 'sale-ref-x', 'Test (b): invoice.js build() resolves doc.saleId to "sale-ref-x"');
ok(!saleIdForSpyCalled, 'Test (b): CRITICAL: saleIdFor was NOT called when saleId is present');

// Test (c) : Entrée sans saleId côté tableau de bord => pas d'appel serveur, bouton désactivé
let fetchCalledOnMissingId = false;
fakeWindowSpy.fetch = async () => { fetchCalledOnMissingId = true; return { ok: true, json: async () => ({}) }; };
const unsyncedSale = { ref: 'T-local-unsynced', amount: 30, ts: Date.now() }; // no saleId, no id
const genMissingResult = await invoiceWithSpy.generate(unsyncedSale, 'pdf');
ok(genMissingResult === null, 'Test (c): invoice.js generate() returns null immediately when saleId is missing');
ok(!fetchCalledOnMissingId, 'Test (c): invoice.js generate() makes zero network fetch when saleId is missing');

// ── 4. Surface Ventes (assets/pages-pro.js) ──────────────────────────────────
const pagesProSource = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
ok(pagesProSource.includes('data-action="sale-invoice-pdf"'), 'pages-pro.js contains sale-invoice-pdf action button');
ok(pagesProSource.includes('data-action="sale-invoice-print"'), 'pages-pro.js contains sale-invoice-print action button');
ok(pagesProSource.includes("H['sale-invoice-pdf']"), "pages-pro.js registers H['sale-invoice-pdf'] handler");
ok(pagesProSource.includes("H['sale-invoice-print']"), "pages-pro.js registers H['sale-invoice-print'] handler");
ok(pagesProSource.includes('disabled aria-disabled="true"'), 'pages-pro.js renders disabled button when saleId is missing');
ok(pagesProSource.includes('Facture disponible après synchronisation de la vente'), 'pages-pro.js sets correct tooltip when saleId is missing');

// ── 5. Invoicing module delegation (assets/invoicing.js) ─────────────────────
const invoicingSource = fs.readFileSync(path.join(ROOT, 'assets/invoicing.js'), 'utf8');
/* Plus de délégation : le gabarit des ventes de comptoir est acquitté et TTC, celui d'une
 * facture saisie est en HT avec échéance (916be864). tools/invoicing-print-test.mjs l'exécute. */
ok(!/KiwiInvoice\??\.html\(/.test(invoicingSource), 'invoicing.js prints with its own template, never KiwiInvoice.html (a till receipt is paid, prices incl. VAT)');
ok(invoicingSource.includes('getSaleInvoices()'), 'invoicing.js contains getSaleInvoices helper');
ok(invoicingSource.includes('data-inv-sale-open'), 'invoicing.js handles data-inv-sale-open');
ok(invoicingSource.includes("['sales',t.sales]") || invoicingSource.includes("['sales', t.sales]"), 'invoicing.js contains sales filter tab');

// ── 6. Caisse reprint invoice action (assets/pos-reprint.js) ─────────────────
const posReprintSource = fs.readFileSync(path.join(ROOT, 'assets/pos-reprint.js'), 'utf8');
ok(posReprintSource.includes('data-kx-rp-invoice'), 'pos-reprint.js contains data-kx-rp-invoice action button');
ok(posReprintSource.includes('KiwiInvoice.generate'), 'pos-reprint.js invokes KiwiInvoice.generate on invoice button click');

// ── 7. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 74;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);


// 2026-10-11 · Seller identity belongs to THIS store only, and "·" is not an ICE.
// Measured on the local stack: a café with no ICE got "ICE : ·" printed and no
// missing-mention warning, because the venue record carries the display dash.
// The fallbacks also swept every store's business doc in localStorage.
{
  const store = {
    'kiwi:business:v1:autre-commerce': JSON.stringify({ name: 'Autre Commerce', legal: { ice: '009999999000011', address: '1 rue Ailleurs' } }),
    'kiwiSet:biz:v-autre:ice': '008888888000022',
  };
  const keys = Object.keys(store);
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: () => {}, get length() { return keys.length; }, key: (i) => keys[i] };
  const w = {
    KiwiReceipt: { business: () => ({ name: 'Café Local Test' }), config: () => ({}) },
    KiwiVenue: { getVenue: () => 'cafe-local-test', getCurrentVenueData: () => ({ id: 'cafe-local-test', ice: '·' }) },
    KiwiLive: { merchant: () => 'cafe-local-test' },
    document: { baseURI: 'http://localhost/' },
    localStorage: ls,
  };
  const Inv = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice;`)(w, w.document, ls);
  const seller = Inv.getSellerBusiness();
  ok(seller.ice === '', 'a "·" placeholder is not taken for an ICE, nor another store\'s ICE');
  ok(!/Ailleurs/.test(seller.address || ''), 'another store\'s address never reaches this store\'s invoice');
  const doc = Inv.build(mockSale1, { seller: { name: 'Café Local Test', ice: '·' } });
  const out = Inv.html(doc);
  ok(doc.missingICE === true && out.includes('Mention obligatoire manquante'), 'an invalid ICE raises the missing-mention warning');
  ok(!/ICE :<\/strong> ·/.test(out) && !/ICE : ·/.test(out), 'the invoice never prints "ICE : ·"');
  const frozen = Inv.html(Object.assign({}, doc, { missingICE: false }));
  ok(frozen.includes('Mention obligatoire manquante'), 'a snapshot frozen with missingICE:false and a bad ICE still warns');
  store['kiwi:business:v1:cafe-local-test'] = JSON.stringify({ legal: { ice: '001 234 567 000 089' } });
  ok(Inv.getSellerBusiness().ice === '001234567000089', 'this store\'s own ICE is read, spaces normalised');
}

// 2026-10-13 · Facturation v2 : la série F est UNE pour la caisse (sale_invoices)
// et pour la saisie (invoices.js), via le même allocateur. Jamais le même
// numéro, et l'historique de sale_invoices est respecté quand invoice_series est
// encore vide (un commerçant qui n'a jamais saisi de facture).
{
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const env = { DB: {
    prepare(q) {
      const st = sqlite.prepare(q);
      const bound = (p) => ({
        async first() { const row = st.get(...p); return row === undefined ? null : row; },
        async all() { return { results: st.all(...p) }; },
        async run() { const r = st.run(...p); return { meta: { changes: Number(r.changes) }, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...p) => bound(p) });
    },
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  } };
  const M = 'shop-serie';
  const oldInv = sqlite.prepare('INSERT INTO sale_invoices (merchant, seq, number, sale_id, customer, snapshot, created_ts) VALUES (?,?,?,?,?,?,?)');
  for (let i = 1; i <= 3; i++) oldInv.run(M, i, `F-2026-000${i}`, `hist-${i}`, null, '{}', 1771488000000);
  ok(sqlite.prepare('SELECT COUNT(*) n FROM invoice_series').get().n === 0, 'v2: invoice_series starts empty for a merchant with till history');

  const manual = (docRef) => SERIES.allocateNumber(env, M, 'F', 2026, { docRef });
  const sale = (id, cents) => {
    sqlite.prepare('INSERT OR IGNORE INTO sales (id, merchant, amount, amount_cents, method, ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, M, cents / 100, cents, 'cash', 'R-' + id, Date.now() - 1000);
    return getOrCreateSaleInvoice(env, M, id, null, { issuedTs: Date.now(), totals: { ttc: cents / 100 } });
  };
  const m1 = await manual('doc-1');
  ok(m1.seq === 4 && m1.number === 'F-2026-0004', 'v2: a manual invoice continues after the till history (F-2026-0004)');
  const t1 = await sale('s-1', 5000);
  ok(t1.seq === 5 && t1.number.endsWith('-0005'), 'v2: the next till invoice takes the following number');
  const m2 = await manual('doc-2');
  const t2 = await sale('s-2', 7000);
  ok(m2.seq === 6 && t2.seq === 7, 'v2: interleaved till and manual invoices take consecutive numbers');
  const till = new Set(sqlite.prepare('SELECT seq FROM sale_invoices').all().map((r) => r.seq));
  const manualSeqs = sqlite.prepare("SELECT seq, doc_ref FROM invoice_series WHERE prefix = 'F' AND doc_ref LIKE 'doc-%'").all();
  ok(manualSeqs.length === 2 && manualSeqs.every((r) => !till.has(r.seq)), 'v2: a till invoice and a manual invoice never share an F number');
  ok(sqlite.prepare("SELECT COUNT(*) n FROM invoice_series WHERE doc_ref IN ('s-1', 's-2')").get().n === 2, 'v2: the till reserves its number in invoice_series in the same batch');
  const again = await sale('s-1', 5000);
  ok(again.existing === true && again.seq === 5 && sqlite.prepare("SELECT COUNT(*) n FROM invoice_series WHERE doc_ref = 's-1'").get().n === 1, 'v2: re-invoicing a sale keeps its number and reserves nothing more');
  const av = await SERIES.allocateNumber(env, M, 'AV', 2026, { docRef: 'cn-1' });
  const dv = await SERIES.allocateNumber(env, M, 'D', 2026, { docRef: 'q-1' });
  ok(av.number === 'AV-2026-0001' && dv.number === 'D-2026-0001', 'v2: credit notes and quotes have their own series');
}

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
} else {
  process.exit(0);
}
