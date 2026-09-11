// tools/invoice-receipt-test.mjs — suite de tests pour la réception de factures fournisseur (PDF/OCR).
//
// Valide :
// 1. Extraction et validation de l'endpoint serveur /api/ai/invoice
// 2. Mappage et matching pur des lignes de facture (EAN, Ref fournisseur, nom normalisé, overlap)
// 3. Conversion d'unité (facteur d'achat vs unité de stock) et calcul d'évolution de prix
// 4. Protection stricte : prix de vente inviolable, mise à jour de defaultPrice conditionnée à la case cochée
// 5. Hard count pinning exact

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

console.log('■ Invoice Receipt (PDF OCR & Price Protection)');

// ── 1. Server Validator (functions/api/ai/invoice.js) ────────────────────────
const invoiceServerSource = fs.readFileSync(path.join(ROOT, 'functions/api/ai/invoice.js'), 'utf8');

// Extraction de validateInvoiceData
const validateMatch = invoiceServerSource.match(/export function validateInvoiceData\([\s\S]*?\n\}/);
ok(!!validateMatch, 'validateInvoiceData function exported in functions/api/ai/invoice.js');

let validateInvoiceData;
if (validateMatch) {
  const code = `
    ${validateMatch[0].replace('export function', 'function')}
    return validateInvoiceData;
  `;
  validateInvoiceData = new Function(code)();
}

if (validateInvoiceData) {
  // Test invalid input
  ok(validateInvoiceData(null) === null, 'validateInvoiceData returns null on null');
  ok(validateInvoiceData('invalid') === null, 'validateInvoiceData returns null on string');

  // Test valid structure
  const rawSample = {
    supplier: { name: 'Metro Cash & Carry Casablanca', ice: '001234567000089' },
    number: 'FAC-2026-9812',
    date: '2026-08-19',
    currency: 'MAD',
    lines: [
      { label: 'Lait UHT Demi-Écrémé 1L', qty: 24, unit: 'brique', unitCost: 9.5, total: 228, ref: 'SKU-LAIT-01', ean: '6111234567890' },
      { label: 'Farine T55 25kg', qty: 4, unit: 'sac', unitCost: 150, total: 600, ref: 'FAR-T55' },
    ],
    total: 828,
  };
  const validated = validateInvoiceData(rawSample);
  ok(validated != null, 'valid sample parsed successfully');
  ok(validated.supplier.name === 'Metro Cash & Carry Casablanca', 'supplier name preserved');
  ok(validated.supplier.ice === '001234567000089', 'supplier ICE preserved');
  ok(validated.number === 'FAC-2026-9812', 'invoice number preserved');
  ok(validated.lines.length === 2, 'all 2 lines preserved');
  ok(validated.lines[0].total === 228, 'line total computed / verified');
  ok(validated.lines[0].ean === '6111234567890', 'line EAN preserved');
  ok(validated.total === 828, 'invoice total verified');

  // Test clamping and sanitization
  const oversizedSample = {
    supplier: { name: 'A'.repeat(200) },
    lines: [
      { label: 'B'.repeat(300), qty: -5, unitCost: -10 },
      { label: '', qty: 10, unitCost: 5 }, // empty label -> should be filtered
    ],
  };
  const clamped = validateInvoiceData(oversizedSample);
  ok(clamped.supplier.name.length === 120, 'supplier name clamped to 120 chars');
  ok(clamped.lines.length === 1, 'empty label line filtered out');
  ok(clamped.lines[0].label.length === 120, 'line label clamped to 120 chars');
  ok(clamped.lines[0].qty === 0, 'negative qty clamped to 0');
  ok(clamped.lines[0].unitCost === 0, 'negative unitCost clamped to 0');

  // Test max 200 lines
  const hugeLinesSample = {
    supplier: { name: 'Grossiste' },
    lines: Array.from({ length: 350 }, (_, i) => ({ label: `Article ${i}`, qty: 1, unitCost: 10 })),
  };
  const clampedHuge = validateInvoiceData(hugeLinesSample);
  ok(clampedHuge.lines.length === 200, 'lines array capped at 200 items');
}

// ── 2. Client Matcher & Comparison (assets/stock.js) ─────────────────────────
const stockSource = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');

// Extraction des fonctions pures de matching et comparaison
const normMatch = stockSource.match(/function normalizeMatchStr\([\s\S]*?\n  \}/);
const tokMatch = stockSource.match(/function tokenizeMatchStr\([\s\S]*?\n  \}/);
const scoreMatch = stockSource.match(/function tokenOverlapScore\([\s\S]*?\n  \}/);
const matcherMatch = stockSource.match(/function matchInvoiceLines\([\s\S]*?\n  \}/);
const compMatch = stockSource.match(/function compareLineCost\([\s\S]*?\n  \}/);

ok(!!normMatch, 'normalizeMatchStr found in stock.js');
ok(!!tokMatch, 'tokenizeMatchStr found in stock.js');
ok(!!scoreMatch, 'tokenOverlapScore found in stock.js');
ok(!!matcherMatch, 'matchInvoiceLines found in stock.js');
ok(!!compMatch, 'compareLineCost found in stock.js');

let matchInvoiceLines;
let compareLineCost;

if (normMatch && tokMatch && scoreMatch && matcherMatch && compMatch) {
  const code = `
    ${normMatch[0]}
    ${tokMatch[0]}
    ${scoreMatch[0]}
    ${matcherMatch[0]}
    ${compMatch[0]}
    return { matchInvoiceLines, compareLineCost };
  `;
  const helpers = new Function(code)();
  matchInvoiceLines = helpers.matchInvoiceLines;
  compareLineCost = helpers.compareLineCost;
}

if (matchInvoiceLines) {
  const mockInventory = [
    {
      id: 'inv-lait',
      name: 'Lait UHT Demi-Écrémé 1L',
      unit: 'brique',
      costPerUnit: 10,
      barcode: '6111234567890',
      sku: 'SKU-LAIT-STORE',
      suppliers: [
        { id: 'sup-card-1', supplierName: 'Metro', defaultPrice: 10, purchaseUnit: 'carton de 12', factor: 12, ref: 'METRO-L12' }
      ]
    },
    {
      id: 'inv-farine',
      name: 'Farine de Blé T55',
      unit: 'kg',
      costPerUnit: 6,
      sku: 'SKU-FAR-55',
      suppliers: [
        { id: 'sup-card-2', supplierName: 'Moulins du Maghreb', defaultPrice: 150, purchaseUnit: 'sac 25kg', factor: 25, ref: 'MM-T55-25' }
      ]
    },
    {
      id: 'inv-cafe',
      name: 'Café Grain Arabica 1kg',
      unit: 'kg',
      costPerUnit: 120,
      barcode: '6119999999999',
    },
  ];

  // Matcher Test 1: By EAN
  const eanLine = [{ label: 'Quelconque libellé', ean: '6111234567890', qty: 12, unitCost: 10 }];
  const matchEan = matchInvoiceLines(eanLine, mockInventory);
  ok(matchEan[0].itemId === 'inv-lait' && matchEan[0].confidence === 1.0, 'match by EAN has 1.0 confidence');

  // Matcher Test 2: By Supplier Card Ref
  const refLine = [{ label: 'Ref inconnue du nom', ref: 'METRO-L12', qty: 12, unitCost: 10 }];
  const matchRef = matchInvoiceLines(refLine, mockInventory);
  ok(matchRef[0].itemId === 'inv-lait' && matchRef[0].confidence === 0.95, 'match by supplier card ref has 0.95 confidence');

  // Matcher Test 3: By Exact Normalized Name (accents & case insensitive)
  const nameLine = [{ label: 'lait uht demi-ecreme 1l', qty: 10, unitCost: 10 }];
  const matchName = matchInvoiceLines(nameLine, mockInventory);
  ok(matchName[0].itemId === 'inv-lait' && matchName[0].confidence === 0.9, 'match by normalized exact name has 0.9 confidence');

  // Matcher Test 4: By Token Overlap (>= 0.6)
  const fuzzyLine = [{ label: 'Farine Ble T55 Sac Pro', qty: 2, unitCost: 150 }];
  const matchFuzzy = matchInvoiceLines(fuzzyLine, mockInventory);
  ok(matchFuzzy[0].itemId === 'inv-farine' && matchFuzzy[0].confidence >= 0.6, 'match by token overlap >= 0.6 finds item');

  // Matcher Test 5: Unknown item
  const unknownLine = [{ label: 'Papier Toilette Jumbo 2 Plis', qty: 1, unitCost: 80 }];
  const matchUnknown = matchInvoiceLines(unknownLine, mockInventory);
  ok(matchUnknown[0].itemId === null && matchUnknown[0].confidence === 0, 'unknown item yields itemId: null');
}

// ── 3. Precision 2: Conversion factor & Price Increase Protection ────────────
if (compareLineCost) {
  const itemWithBox = {
    id: 'it-jus',
    name: 'Jus d’orange 1L',
    costPerUnit: 10,
    suppliers: [
      {
        id: 'card-1',
        supplierName: 'Grossiste Boissons',
        defaultPrice: 10, // 10 MAD par pièce
        purchaseUnit: 'carton de 12',
        factor: 12, // 12 pièces par carton
      }
    ]
  };

  // Precision 2 Case A: Invoiced at 120 MAD for a box of 12 (10 MAD/unit) -> equal, NO CHECKBOX
  const compEqual = compareLineCost(itemWithBox, 120, 'Grossiste Boissons');
  ok(compEqual.invoicedPerUnit === 10, 'conversion: 120 MAD / 12 factor = 10 MAD/unit');
  ok(compEqual.currentCost === 10, 'current ref price is 10 MAD');
  ok(compEqual.isRise === false, 'no price rise detected');
  ok(compEqual.isDrop === false, 'no price drop detected');
  ok(compEqual.pct === 0, 'percentage diff is 0%');
  ok(compEqual.isChecked === false, 'CRITICAL: update checkbox is UNCHECKED when price equals reference');

  // Precision 2 Case B: Invoiced at 144 MAD for a box of 12 (12 MAD/unit) -> +20% RISE -> CHECKBOX CHECKED
  const compRise = compareLineCost(itemWithBox, 144, 'Grossiste Boissons');
  ok(compRise.invoicedPerUnit === 12, 'conversion: 144 MAD / 12 factor = 12 MAD/unit');
  ok(compRise.isRise === true, 'price rise detected');
  ok(compRise.pct === 20, 'percentage diff is +20%');
  ok(compRise.isChecked === true, 'CRITICAL: update checkbox is PRE-CHECKED on genuine price rise');

  // Precision 2 Case C: Invoiced at 96 MAD for a box of 12 (8 MAD/unit) -> -20% DROP -> CHECKBOX UNCHECKED
  const compDrop = compareLineCost(itemWithBox, 96, 'Grossiste Boissons');
  ok(compDrop.invoicedPerUnit === 8, 'conversion: 96 MAD / 12 factor = 8 MAD/unit');
  ok(compDrop.isDrop === true, 'price drop detected');
  ok(compDrop.pct === -20, 'percentage diff is -20%');
  ok(compDrop.isChecked === false, 'CRITICAL: update checkbox is UNCHECKED on price drop');

  // Case D: Item with 0 default price -> checked if invoiced > 0
  const itemNoPrice = { id: 'it-new', name: 'Nouveau', costPerUnit: 0 };
  const compNew = compareLineCost(itemNoPrice, 45, 'Fournisseur');
  ok(compNew.isChecked === true, 'new item without reference cost is checked by default');

  // ── 3bis. Recompute Checkbox Behavior (Dynamic sync with input) ─────────────
  // (a) Ligne manuelle, saisie d'un coût inférieur à la référence -> case décochée
  const mockItem = { id: 'it-cafe', name: 'Café', costPerUnit: 50 };
  const syncCbBlock = stockSource.match(/const cb = row\.querySelector\('\[data-stock-receive-update-cost\]'\);[\s\S]*?cb\.checked = ([\s\S]*?);\s*\}/);
  ok(!!syncCbBlock, 'found active cb.checked assignment block in stock.js');

  const recomputeRowFn = (rowState, item, cost, sup) => {
    const comp = compareLineCost(item, cost, sup);
    if (syncCbBlock) {
      new Function('row', 'item', 'comp', 'cost', `${syncCbBlock[0]}`)(rowState, item, comp, cost);
    }
    const cb = rowState.querySelector('[data-stock-receive-update-cost]');
    return { comp, checked: cb ? cb.checked : false };
  };

  const createMockRow = (initialChecked, userSet) => {
    const cbEl = { checked: initialChecked, dataset: userSet ? { userSet: '1' } : {} };
    return {
      querySelector: (sel) => (sel === '[data-stock-receive-update-cost]' ? cbEl : null)
    };
  };

  const rowA = createMockRow(true, false);
  const resA = recomputeRowFn(rowA, mockItem, 40, 'Fournisseur');
  ok(resA.checked === false, '(a) manual entry of lower cost unchecks update checkbox');

  // (b) Saisie supérieure -> cochée
  const rowB = createMockRow(false, false);
  const resB = recomputeRowFn(rowB, mockItem, 60, 'Fournisseur');
  ok(resB.checked === true, '(b) manual entry of higher cost checks update checkbox');

  // (c) Case décochée manuellement puis saisie supérieure -> reste décochée (userSet)
  const rowC = createMockRow(false, true);
  const resC = recomputeRowFn(rowC, mockItem, 65, 'Fournisseur');
  ok(resC.checked === false, '(c) userSet flag preserves manual uncheck even on higher cost');
}

// ── 4. UI & Gating Invariants in assets/stock.js ─────────────────────────────
ok(stockSource.includes("cb.dataset.userSet !== '1'"), "stock.js guards recompute checkbox update with userSet check");
ok(stockSource.includes('assets/vendor/pdfjs/pdf.min.js'), 'stock.js references vendored pdf.min.js');
ok(stockSource.includes('assets/vendor/pdfjs/pdf.worker.min.js'), 'stock.js references vendored pdf.worker.min.js');
ok(!stockSource.includes('cdn.jsdelivr.net') && !stockSource.includes('cdnjs.cloudflare.com'), 'no CDN references in stock.js (CSP compliant)');
ok(stockSource.includes('line.updateCost'), 'stock.js gates defaultPrice updates on line.updateCost checkbox');
ok(!stockSource.includes('it.price = line.cost') && !stockSource.includes('it.priceMAD = line.cost'), 'selling price / menu price is NEVER modified by receipt');

// Verify vendor files exist and have non-zero size
const pdfMinPath = path.join(ROOT, 'assets/vendor/pdfjs/pdf.min.js');
const pdfWorkerPath = path.join(ROOT, 'assets/vendor/pdfjs/pdf.worker.min.js');
const pdfLicensePath = path.join(ROOT, 'assets/vendor/pdfjs/LICENSE');

ok(fs.existsSync(pdfMinPath) && fs.statSync(pdfMinPath).size > 100000, 'pdf.min.js exists and is > 100KB');
ok(fs.existsSync(pdfWorkerPath) && fs.statSync(pdfWorkerPath).size > 500000, 'pdf.worker.min.js exists and is > 500KB');
ok(fs.existsSync(pdfLicensePath), 'pdfjs LICENSE file exists');

// ── 4b. Réponse modèle : TROIS formes, et le net de remise ─────────────────
// Vérifié sur une vraie facture le 2026-08-19 : Qwen3 via Workers AI renvoie
// `response` déjà parsé (objet). La première version faisait `.trim()` dessus
// → « unparsed » sur toutes les factures. Le parseur est extrait du fichier
// serveur et exécuté tel quel.
{
  const pmMatch = invoiceServerSource.match(/export function parseModelResponse\([\s\S]*?\n\}/);
  ok(!!pmMatch, 'parseModelResponse exported in functions/api/ai/invoice.js');
  const parseModelResponse = new Function(pmMatch[0].replace(/^export /, '') + '\nreturn parseModelResponse;')();
  ok(JSON.stringify(parseModelResponse({ response: { a: 1 } })) === '{"a":1}', 'model response as OBJECT is accepted as-is');
  ok(JSON.stringify(parseModelResponse({ response: '```json\n{"a":2}\n```' })) === '{"a":2}', 'model response as fenced STRING is parsed');
  ok(JSON.stringify(parseModelResponse({ choices: [{ message: { content: 'x {"a":3} y' } }] })) === '{"a":3}', 'OpenAI-style choices[0].message.content is parsed');
  ok(parseModelResponse({ response: 'pas du json' }) === null && parseModelResponse(null) === null, 'non-JSON and empty → null (unparsed)');

  // Remise de ligne : 2 × 780 HT, remise 5 %, total 1 482 → le prix retenu est le net 741.
  const v = validateInvoiceData({ lines: [
    { label: 'Service 18 pièces', qty: 2, unit: 'pièce', unitCost: 780, total: 1482 },
    { label: 'Assiette', qty: 24, unit: 'pièce', unitCost: 48, total: 1152 },
    { label: 'Sans total', qty: 3, unit: 'pièce', unitCost: 10 },
  ] });
  ok(v.lines[0].unitCost === 741 && v.lines[0].grossUnitCost === 780, 'line discount → unitCost is the NET paid (741), gross kept (780)');
  ok(v.lines[1].unitCost === 48 && v.lines[1].grossUnitCost == null, 'no discount → unitCost unchanged, no gross field');
  ok(v.lines[2].unitCost === 10 && v.lines[2].total === 30 && v.lines[2].grossUnitCost == null, 'missing total → recomputed, net = gross');
}

// ── 5. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 64;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}
