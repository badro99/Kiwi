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
  const helpers = new Function(code)();
  validateCustomer = helpers.validateCustomer;
  formatInvoiceNumber = helpers.formatInvoiceNumber;
  getOrCreateSaleInvoice = helpers.getOrCreateSaleInvoice;
}

if (validateCustomer) {
  // Test validation client
  ok(validateCustomer(null) === null, 'validateCustomer returns null on null');
  ok(validateCustomer({}) === null, 'validateCustomer returns null on empty object');

  const validCust = validateCustomer({ name: 'Client Pro SARL', ice: '001234567000089', if: '987654' });
  ok(validCust.name === 'Client Pro SARL', 'customer name preserved');
  ok(validCust.ice === '001234567000089', 'valid 15-digit ICE preserved');
  ok(validCust.if === '987654', 'IF preserved');

  // Nom bridé à 80 caractères
  const longCust = validateCustomer({ name: 'Z'.repeat(120), ice: '001234567000089' });
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

// Test Idempotence serveur avec Mock D1 DB & vérification de la table sales
if (getOrCreateSaleInvoice) {
  const knownSales = new Set(['shop-casa|sale-A', 'shop-casa|sale-B', 'shop-casa|sale-ref-x']);
  const dbRows = new Map(); // key: merchant|sale_id
  const seqMap = new Map(); // key: merchant -> max seq

  const mockDb = {
    prepare: (query) => {
      return {
        bind: (...args) => ({
          first: async () => {
            if (query.includes('FROM sales WHERE merchant = ? AND id = ?')) {
              const [m, sid] = args;
              return knownSales.has(`${m}|${sid}`) ? { 1: 1 } : null;
            }
            if (query.includes('FROM sale_invoices WHERE merchant = ? AND sale_id = ?')) {
              const [m, sid] = args;
              return dbRows.get(`${m}|${sid}`) || null;
            }
            if (query.includes('SELECT COALESCE(MAX(seq), 0) AS max_seq FROM sale_invoices WHERE merchant = ?')) {
              const [m] = args;
              const maxSeq = seqMap.get(m) || 0;
              return { max_seq: maxSeq };
            }
            return null;
          },
          run: async () => {
            if (query.includes('INSERT INTO sale_invoices')) {
              const [m, seq, num, sid, cust, snap, created] = args;
              const key = `${m}|${sid}`;
              if (dbRows.has(key)) {
                throw new Error('UNIQUE constraint failed: sale_invoices.merchant, sale_invoices.sale_id');
              }
              const row = { merchant: m, seq, number: num, sale_id: sid, customer: cust, snapshot: snap, created_ts: created };
              dbRows.set(key, row);
              seqMap.set(m, Math.max(seqMap.get(m) || 0, seq));
              return { success: true };
            }
            return { success: true };
          },
        }),
      };
    },
  };

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
const addCallMatch = liveLinkSource.match(/window\.KiwiSales\.add\(vid,\s*(\{[\s\S]*?\})\s*\)/);
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
ok(invoicingSource.includes('window.KiwiInvoice.html(doc)'), 'invoicing.js delegates printable() layout to KiwiInvoice.html');
ok(invoicingSource.includes('getSaleInvoices()'), 'invoicing.js contains getSaleInvoices helper');
ok(invoicingSource.includes('data-inv-sale-open'), 'invoicing.js handles data-inv-sale-open');
ok(invoicingSource.includes("['sales',t.sales]") || invoicingSource.includes("['sales', t.sales]"), 'invoicing.js contains sales filter tab');

// ── 6. Caisse reprint invoice action (assets/pos-reprint.js) ─────────────────
const posReprintSource = fs.readFileSync(path.join(ROOT, 'assets/pos-reprint.js'), 'utf8');
ok(posReprintSource.includes('data-kx-rp-invoice'), 'pos-reprint.js contains data-kx-rp-invoice action button');
ok(posReprintSource.includes('KiwiInvoice.generate'), 'pos-reprint.js invokes KiwiInvoice.generate on invoice button click');

// ── 7. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 72;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
} else {
  process.exit(0);
}
