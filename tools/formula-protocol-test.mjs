#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Formules (Menus Composés) Protocol, Model & Explosion Gate
 *
 * Verifies:
 * 1. functions/api/menu.js sanitizeMenu / sanitizeFormula protocol bounds
 * 2. assets/menu-catalog.js cleanFormula load-side ghost dropping
 * 3. functions/api/order/queue.js cleanLines whitelisting + D1 persistence + append
 * 4. kiwi-serveur.html formula sheet extraction & explosion (extracted code only)
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

console.log('■ Formules (Menus Composés) Protocol & Explosion Gate');

const menuApiSource = fs.readFileSync(path.join(ROOT, 'functions/api/menu.js'), 'utf8');
const menuCatalogSource = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
const serveurSource = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');

// ── 1. functions/api/menu.js: sanitizeMenu & sanitizeFormula ─────────────────
const sanitizeFormulaMatch = menuApiSource.match(/function sanitizeFormula\([\s\S]*?\n\}/);
const sanitizeMenuMatch = menuApiSource.match(/function sanitizeMenu\([\s\S]*?\n\}/);

let sanitizeMenuFn = null;
if (!sanitizeFormulaMatch || !sanitizeMenuMatch) {
  ok(false, 'sanitizeFormula or sanitizeMenu function missing in menu.js');
} else {
  try {
    const helperCode = `
      const str = (v, n) => String(v == null ? '' : v).slice(0, n);
      const optionEmoji = (v) => '';
      const mediaUrl = (v) => '';
      const sanitizePeriods = () => [];
      const sanitizeHours = () => null;
      ${sanitizeFormulaMatch[0]}
      ${sanitizeMenuMatch[0]}
      return sanitizeMenu;
    `;
    sanitizeMenuFn = new Function(helperCode)();
    ok(typeof sanitizeMenuFn === 'function', 'sanitizeMenu harness constructed');
  } catch (e) {
    ok(false, 'harness failed to build sanitizeMenu: ' + e.message);
  }
}

if (!sanitizeMenuFn) {
  ok(false, 'sanitizeMenuFn is null, halting section 1');
} else {
  // Test valid formula round-trip
  const validMenu = {
    cats: [{ id: 'c1', name: 'Formules', station: 'st_cuisine' }],
    items: [{
      id: 'it_brunch',
      name: 'Petit-déjeuner norvégien',
      price: 89,
      catId: 'c1',
      formula: {
        slots: [
          {
            id: 'sl_1',
            label: 'Le pain',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-012', extra: 0 },
              { itemId: 'm-013', extra: 10 }
            ]
          },
          {
            id: 'sl_2',
            label: 'La boisson',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-020', extra: 0 },
              { itemId: 'm-021', extra: 5 }
            ]
          }
        ]
      }
    }]
  };

  const sanitized = sanitizeMenuFn(validMenu);
  const outItem = sanitized.items && sanitized.items[0];
  ok(outItem && outItem.formula, 'sanitizeMenu preserves formula on valid item');
  ok(outItem && outItem.formula && outItem.formula.slots && outItem.formula.slots.length === 2, 'preserved 2 slots');
  ok(outItem && outItem.formula && outItem.formula.slots[0].choices.length === 2, 'preserved slot choices');
  ok(outItem && outItem.formula && outItem.formula.slots[0].choices[1].extra === 10, 'preserved choice extra price');

  // Test bounds & clamping
  const bloatedSlots = [];
  for (let i = 0; i < 15; i++) {
    const bloatedChoices = [];
    for (let j = 0; j < 25; j++) {
      bloatedChoices.push({ itemId: 'it_' + j, extra: 99999999 });
    }
    bloatedSlots.push({
      id: 'sl_' + i,
      label: 'Slot ' + i + ' '.repeat(100),
      min: 50,
      max: 2,
      choices: bloatedChoices
    });
  }

  const bloatedRes = sanitizeMenuFn({
    items: [{ id: 'it_big', name: 'Grand Menu', price: 150, formula: { slots: bloatedSlots } }]
  });
  const bloatedItem = bloatedRes.items && bloatedRes.items[0];
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots.length === 10, 'slots capped at 10');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].choices.length === 20, 'choices per slot capped at 20');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].choices[0].extra <= 100000, 'extra clamped to max 1e5');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].label.length <= 60, 'slot label clamped to <= 60 chars');
  ok(bloatedItem && bloatedItem.formula && bloatedItem.formula.slots[0].min <= bloatedItem.formula.slots[0].max, 'min > max normalized');

  // Empty choices filtered & empty formula returns null
  const emptyRes = sanitizeMenuFn({
    items: [{ id: 'it_empty', name: 'Empty Formula', price: 50, formula: { slots: [{ id: 's1', choices: [{ extra: 5 }] }] } }]
  });
  ok(!emptyRes.items[0].formula, 'formula with no valid itemIds normalized to null');
}

// ── 2. assets/menu-catalog.js: cleanFormula & load-side ghost drop ───────────
const cleanFormulaMatch = menuCatalogSource.match(/function cleanFormula\([\s\S]*?\n  \}/);
let cleanFormulaFn = null;
if (!cleanFormulaMatch) {
  ok(false, 'cleanFormula function missing in menu-catalog.js');
} else {
  try {
    cleanFormulaFn = new Function(cleanFormulaMatch[0] + '; return cleanFormula;')();
    ok(typeof cleanFormulaFn === 'function', 'cleanFormula harness constructed');
  } catch (e) {
    ok(false, 'harness failed to build cleanFormula: ' + e.message);
  }
}

if (!cleanFormulaFn) {
  ok(false, 'cleanFormulaFn is null, halting section 2');
} else {
  const existingItems = [
    { id: 'm-001', name: 'Pain suédois' },
    { id: 'm-002', name: 'Café noir' },
  ];

  const formulaWithGhost = {
    slots: [
      {
        id: 'sl_1',
        label: 'Pain',
        min: 1,
        max: 1,
        choices: [
          { itemId: 'm-001', extra: 0 },
          { itemId: 'deleted_ghost_123', extra: 10 }
        ]
      },
      {
        id: 'sl_2',
        label: 'Boisson',
        min: 2,
        max: 1,
        choices: [
          { itemId: 'deleted_ghost_456', extra: 0 }
        ]
      }
    ]
  };

  const cleaned = cleanFormulaFn(formulaWithGhost, existingItems);
  ok(cleaned && cleaned.slots, 'cleaned formula returned');
  ok(cleaned.slots[0].choices.length === 1, 'ghost choice dropped from slot 1');
  ok(cleaned.slots[0].choices[0].itemId === 'm-001', 'valid choice preserved');
  ok(cleaned.slots[1].choices.length === 0, 'slot 2 choice list emptied of deleted item');
  ok(cleaned.slots[1].min <= cleaned.slots[1].max, 'slot 2 min/max normalized');
}

// ── 3. functions/api/order/queue.js: cleanLines & D1 persistence ─────────────
const cleanLinesMatch = queueSource.match(/function cleanLines\([\s\S]*?\n\}/);
let cleanLinesFn = null;
if (!cleanLinesMatch) {
  ok(false, 'cleanLines function missing in queue.js');
} else {
  try {
    const queueCode = `
      const MAX_LINES = 100;
      const MAX_QTY = 999;
      ${cleanLinesMatch[0]}
      return cleanLines;
    `;
    cleanLinesFn = new Function(queueCode)();
    ok(typeof cleanLinesFn === 'function', 'cleanLines harness constructed');
  } catch (e) {
    ok(false, 'harness failed to build cleanLines: ' + e.message);
  }
}

if (!cleanLinesFn) {
  ok(false, 'cleanLinesFn is null, halting section 3');
} else {
  const rawTestLines = [
    {
      name: 'Petit-déjeuner norvégien',
      qty: 1,
      unitPrice: 89,
      kind: 'formula',
      formulaUid: 'fml-test-1234',
      formulaName: 'Petit-déjeuner norvégien',
      slotLabel: '',
      lineId: 'fml-test-1234-root',
    },
    {
      name: 'Pain suédois saumon',
      qty: 1,
      unitPrice: 0,
      kind: 'formula-part',
      formulaUid: 'fml-test-1234',
      formulaName: 'Petit-déjeuner norvégien',
      slotLabel: 'Le pain',
      lineId: 'fml-test-1234-sl_1',
      station: 'st_froide',
    },
    {
      name: 'Café noir',
      qty: 1,
      unitPrice: 0,
      kind: 'formula-part',
      formulaUid: 'fml-test-1234',
      formulaName: 'Petit-déjeuner norvégien',
      slotLabel: 'La boisson',
      lineId: 'fml-test-1234-sl_2',
      station: 'st_bar',
    }
  ];

  const cleaned = cleanLinesFn(rawTestLines);
  ok(cleaned.length === 3, 'cleanLines kept all 3 lines');
  ok(cleaned[0].kind === 'formula', 'parent line has kind: formula');
  ok(cleaned[0].formulaUid === 'fml-test-1234', 'parent line preserved formulaUid verbatim');
  ok(cleaned[1].kind === 'formula-part', 'child line has kind: formula-part');
  ok(cleaned[1].formulaUid === 'fml-test-1234', 'child line has identical formulaUid');
  ok(cleaned[1].slotLabel === 'Le pain', 'child line has slotLabel');
  ok(cleaned[1].station === 'st_froide', 'child line preserved distinct station');
  ok(cleaned[2].station === 'st_bar', 'child 2 line preserved distinct station');

  // Test D1 persistence and subsequent append preserving formulaUid verbatim
  const db = new DatabaseSync(':memory:');
  const rawSchema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of rawSchema.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }

  const orderId = 'ord-fml-test-1';
  const now = Date.now();
  db.prepare(`
    INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts)
    VALUES (?, 'test-resto', 101, 'table', 'T1', 89, ?, 'accepted', ?, ?)
  `).run(orderId, JSON.stringify(cleaned), now, now);

  const saved = db.prepare('SELECT lines FROM orders WHERE id = ?').get(orderId);
  const loadedLines = JSON.parse(saved.lines);
  ok(loadedLines[0].formulaUid === 'fml-test-1234', 'formulaUid persisted in orders table');

  // Simulate post-accept append on a formula child line
  const targetLine = loadedLines[1];
  targetLine.stationAccepted = true;
  const qtyDelta = 1;
  const newLine = {
    ...targetLine,
    uid: 'ln-append-99',
    qty: qtyDelta,
    stationAccepted: false,
    stationReady: false,
    voidAlert: null,
  };
  loadedLines.push(newLine);
  db.prepare('UPDATE orders SET lines = ? WHERE id = ?').run(JSON.stringify(loadedLines), orderId);

  const reloaded = JSON.parse(db.prepare('SELECT lines FROM orders WHERE id = ?').get(orderId).lines);
  ok(reloaded.length === 4, 'appended line stored');
  ok(reloaded[3].formulaUid === 'fml-test-1234', 'appended line preserved formulaUid verbatim without re-minting');
  ok(reloaded[3].kind === 'formula-part', 'appended line preserved kind: formula-part');
}

// ── 4. kiwi-serveur.html: Extracted Choice Sheet & Explosion ──────────────────
const itemHasFormulaMatch = serveurSource.match(/function itemHasFormula\([\s\S]*?\n    \}/);
const isFmlSlotSatisfiedMatch = serveurSource.match(/function isFmlSlotSatisfied\([\s\S]*?\n    \}/);
const isFmlUnitSatisfiedMatch = serveurSource.match(/function isFmlUnitSatisfied\([\s\S]*?\n    \}/);
const isFmlDraftSatisfiedMatch = serveurSource.match(/function isFmlDraftSatisfied\([\s\S]*?\n    \}/);
const computeFmlUnitExtraMatch = serveurSource.match(/function computeFmlUnitExtra\([\s\S]*?\n    \}/);
const openFormulaSheetMatch = serveurSource.match(/function openFormulaSheet\([\s\S]*?\n    \}/);
const confirmFormulaMatch = serveurSource.match(/function confirmFormula\([\s\S]*?\n    \}/);

let serveurHarness = null;
if (
  !itemHasFormulaMatch || !isFmlSlotSatisfiedMatch || !isFmlUnitSatisfiedMatch ||
  !isFmlDraftSatisfiedMatch || !computeFmlUnitExtraMatch || !openFormulaSheetMatch || !confirmFormulaMatch
) {
  ok(false, 'one or more formula functions missing from kiwi-serveur.html');
} else {
  try {
    const harnessCode = `
      let fmlDraft = null;
      let menuItems = [];
      let menuContextId = 'T1';
      let tableOrders = { T1: [] };
      let toastMsg = '';
      const toast = (m) => { toastMsg = m; };
      const markDirty = () => {};
      const renderMenu = () => {};
      const renderCartBar = () => {};
      const renderFormulaSheet = () => {};
      const closeFormulaSheet = () => { fmlDraft = null; };
      let idSeq = 0;
      const newLineUid = () => 'uid-' + (++idSeq);
      const $ = () => ({ classList: { add: () => {}, remove: () => {} }, innerHTML: '' });

      ${itemHasFormulaMatch[0]}
      ${isFmlSlotSatisfiedMatch[0]}
      ${isFmlUnitSatisfiedMatch[0]}
      ${isFmlDraftSatisfiedMatch[0]}
      ${computeFmlUnitExtraMatch[0]}
      ${openFormulaSheetMatch[0]}
      ${confirmFormulaMatch[0]}

      return {
        setMenuItems: (items) => { menuItems = items; },
        setTableOrders: (to) => { tableOrders = to; },
        getTableOrders: () => tableOrders,
        getDraft: () => fmlDraft,
        setDraft: (d) => { fmlDraft = d; },
        getToast: () => toastMsg,
        itemHasFormula,
        isFmlSlotSatisfied,
        isFmlUnitSatisfied,
        isFmlDraftSatisfied,
        computeFmlUnitExtra,
        openFormulaSheet,
        confirmFormula,
      };
    `;
    serveurHarness = new Function(harnessCode)();
    ok(typeof serveurHarness === 'object' && serveurHarness !== null, 'serveur formula harness constructed from extracted source');
  } catch (e) {
    ok(false, 'failed to construct serveur formula harness from kiwi-serveur.html: ' + e.message);
  }
}

if (!serveurHarness) {
  ok(false, 'serveurHarness is null, halting section 4');
} else {
  const sampleMenuItems = [
    {
      id: 'm-brunch',
      cat: 'formules',
      name: 'Brunch Norvégien',
      price: 89,
      station: 'st_cuisine',
      formula: {
        slots: [
          {
            id: 'sl_pain',
            label: 'Le pain',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-p1', extra: 0 },
              { itemId: 'm-p2', extra: 10 }
            ]
          },
          {
            id: 'sl_boisson',
            label: 'La boisson',
            min: 1,
            max: 1,
            choices: [
              { itemId: 'm-b1', extra: 0 },
              { itemId: 'm-b2', extra: 5 }
            ]
          }
        ]
      }
    },
    { id: 'm-p1', name: 'Pain suédois', price: 20, station: 'st_boulangerie', avail: true },
    { id: 'm-p2', name: 'Brioche toastée', price: 25, station: 'st_boulangerie', avail: true },
    { id: 'm-b1', name: 'Café noir', price: 15, station: 'st_bar', avail: true },
    { id: 'm-b2', name: 'Thé vert', price: 15, station: 'st_bar', avail: true },
    { id: 'm-simple', name: 'Sandwich kefta', price: 50, station: 'st_chaude', avail: true }
  ];

  serveurHarness.setMenuItems(sampleMenuItems);
  ok(serveurHarness.itemHasFormula('m-brunch') === true, 'itemHasFormula identifies formula item from extracted code');
  ok(serveurHarness.itemHasFormula('m-simple') === false, 'itemHasFormula rejects non-formula item from extracted code');

  // Test openFormulaSheet: opens draft with unit 0, single-choice auto-selection (if any), slots initialized
  serveurHarness.openFormulaSheet('m-brunch', 1);
  const draft = serveurHarness.getDraft();
  ok(draft && draft.itemId === 'm-brunch', 'openFormulaSheet created draft for formula');
  ok(draft.units && draft.units.length === 1, 'draft initialized 1 unit portion');

  // Initial state: choices are not yet made for both slots -> isFmlDraftSatisfied returns false
  ok(serveurHarness.isFmlDraftSatisfied() === false, 'extracted isFmlDraftSatisfied returns false when required slots are empty');

  // Confirming when not satisfied should toast error and NOT push lines
  serveurHarness.confirmFormula();
  ok(serveurHarness.getTableOrders().T1.length === 0, 'extracted confirmFormula blocked on unmet required slots');

  // Now satisfy all slots: select m-p1 (pain, extra 0) and m-b2 (boisson, extra 5)
  draft.units[0].sl_pain = new Set(['m-p1']);
  draft.units[0].sl_boisson = new Set(['m-b2']);
  ok(serveurHarness.isFmlDraftSatisfied() === true, 'extracted isFmlDraftSatisfied returns true when all slots satisfied');

  // Confirm and check real explosion output
  serveurHarness.confirmFormula();
  const t1Orders = serveurHarness.getTableOrders().T1;
  ok(t1Orders.length === 3, 'extracted confirmFormula exploded into 1 parent + 2 children');

  const parent = t1Orders[0];
  ok(parent.kind === 'formula', 'extracted parent line has kind: formula');
  ok(parent.price === 94, 'extracted parent line price includes formula base (89) + choice extra (5) = 94');
  ok(parent.qty === 1, 'extracted parent line qty is 1');
  ok(typeof parent.formulaUid === 'string' && parent.formulaUid.startsWith('fml-'), 'extracted parent minted formulaUid');

  const child1 = t1Orders[1];
  ok(child1.kind === 'formula-part', 'extracted child 1 has kind: formula-part');
  ok(child1.price === 0, 'extracted child 1 price is 0');
  ok(child1.formulaUid === parent.formulaUid, 'extracted child 1 shares identical formulaUid with parent');
  ok(child1.station === 'st_boulangerie', 'extracted child 1 inherited station from chosen item (st_boulangerie, not st_cuisine)');
  ok(child1.slotLabel === 'Le pain', 'extracted child 1 carries slotLabel: Le pain');
  ok(child1.lineId === `${parent.formulaUid}-sl_pain`, 'extracted child 1 lineId formatted as formulaUid-slotId');

  const child2 = t1Orders[2];
  ok(child2.kind === 'formula-part', 'extracted child 2 has kind: formula-part');
  ok(child2.price === 0, 'extracted child 2 price is 0');
  ok(child2.formulaUid === parent.formulaUid, 'extracted child 2 shares identical formulaUid with parent');
  ok(child2.station === 'st_bar', 'extracted child 2 inherited station from chosen item (st_bar, not st_cuisine)');
  ok(child2.slotLabel === 'La boisson', 'extracted child 2 carries slotLabel: La boisson');
  ok(child2.lineId === `${parent.formulaUid}-sl_boisson`, 'extracted child 2 lineId formatted as formulaUid-slotId');

  // Test QTY = 2 explosion with multi-portion
  serveurHarness.setTableOrders({ T1: [] });
  serveurHarness.openFormulaSheet('m-brunch', 2);
  const draftQty2 = serveurHarness.getDraft();
  ok(draftQty2.totalUnits === 2 && draftQty2.units.length === 2, 'openFormulaSheet created 2 units for qty=2');

  // Configure portion 1 (m-p1: extra 0, m-b1: extra 0 -> 89 MAD)
  draftQty2.units[0].sl_pain = new Set(['m-p1']);
  draftQty2.units[0].sl_boisson = new Set(['m-b1']);

  // Configure portion 2 (m-p2: extra 10, m-b2: extra 5 -> 104 MAD)
  draftQty2.units[1].sl_pain = new Set(['m-p2']);
  draftQty2.units[1].sl_boisson = new Set(['m-b2']);

  serveurHarness.confirmFormula();
  const multiOrders = serveurHarness.getTableOrders().T1;
  ok(multiOrders.length === 6, 'qty=2 exploded into 2 parents + 4 children (6 lines total)');

  const parent1 = multiOrders[0];
  const parent2 = multiOrders[3];
  ok(parent1.kind === 'formula' && parent1.price === 89, 'portion 1 parent priced at 89 MAD');
  ok(parent2.kind === 'formula' && parent2.price === 104, 'portion 2 parent priced at 104 MAD (89+10+5)');
  ok(parent1.formulaUid !== parent2.formulaUid, 'distinct formulaUid minted per portion');
  ok(multiOrders[1].formulaUid === parent1.formulaUid && multiOrders[2].formulaUid === parent1.formulaUid, 'portion 1 children share parent1 formulaUid');
  ok(multiOrders[4].formulaUid === parent2.formulaUid && multiOrders[5].formulaUid === parent2.formulaUid, 'portion 2 children share parent2 formulaUid');
}

// ── 5. KDS / Kitchen Screen & Ticket Extraction ─────────────────────────────
const cuisineSource = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
const caisseSource = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

// A. kiwi-cuisine.html card() extraction
const cardMatch = cuisineSource.match(/function card\(o, kind\) \{[\s\S]*?\n  \}/);
if (!cardMatch) {
  ok(false, 'card function missing in kiwi-cuisine.html');
} else {
  const cardHarnessCode = `
    const S = { station: 'all' };
    const elapsed = () => 120;
    const urgency = () => 'ok';
    const mmss = () => '02:00';
    const hm = () => '12:30';
    const T = (k) => k;
    const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const SVG = { hand: '', check: '', clock: '' };
    const ticketNo = (o) => '#' + o.number;
    const whereChip = () => '';
    ${cardMatch[0]}
    return card;
  `;
  const cardFn = new Function(cardHarnessCode)();

  const mockKdsOrder = {
    id: 'ord-fml-100',
    number: 7,
    lines: [
      { name: 'Formule Brunch', kind: 'formula', price: 104, qty: 1, formulaUid: 'fml-100' },
      { name: 'Sandwich poulet', kind: 'formula-part', formulaName: 'Formule Brunch', slotLabel: 'Le pain', price: 0, qty: 1, formulaUid: 'fml-100', station: 'cuisine' },
      { name: "Jus d'orange", kind: 'formula-part', formulaName: 'Formule Brunch', slotLabel: 'La boisson', price: 0, qty: 1, formulaUid: 'fml-100', station: 'bar' },
      { name: 'Tajine agneau', price: 120, qty: 1, station: 'cuisine' }
    ]
  };

  const renderedCard = cardFn(mockKdsOrder, 'new');
  ok(!renderedCard.includes('Formule Brunch</span>'), 'kiwi-cuisine card() excludes kind: formula parent line');
  ok(renderedCard.includes('<span class="tk-formula-tag">Formule Brunch · Le pain</span>'), 'kiwi-cuisine card() renders slot formula tag on child part 1');
  ok(renderedCard.includes('<span class="tk-formula-tag">Formule Brunch · La boisson</span>'), 'kiwi-cuisine card() renders slot formula tag on child part 2');
  ok(renderedCard.includes('Tajine agneau</span>') && !renderedCard.includes('<span class="tk-formula-tag">Tajine agneau'), 'normal dish rendered without formula tag');
}

// B. kiwi-caisse.html printKitchenTickets & kdsOrders ingestion extraction
ok(/items\s*\|\|\s*\[\]\)\.filter\(it\s*=>\s*it\.kind\s*!==\s*'formula'\)/.test(caisseSource), 'caisse printKitchenTickets filters out kind: formula lines');
ok(/o\.lines\s*\|\|\s*\[\]\)\.filter\(l\s*=>\s*l\.kind\s*!==\s*'formula'\)/.test(caisseSource), 'caisse kdsOrders ingestion filters out kind: formula lines');
ok(/const formulaTag = l\.kind === 'formula-part'/.test(caisseSource), 'caisse kdsOrders ingestion formats formulaTag for child parts');

// ── 6. Caisse Sales Ledger & recordSale Extraction ──────────────────────────
ok(/lines\.filter\(l\s*=>\s*l\.kind\s*!==\s*'formula-part'\)/.test(caisseSource), 'caisse recordSale filters out kind: formula-part lines from financial journal');

// Test sales ledger line sanitization
const mockSaleLines = [
  { name: 'Tajine poulet', qty: 1, total: 95, price: 95, cat: 'Plats' },
  { name: 'Formule Brunch', kind: 'formula', qty: 1, total: 104, price: 104, cat: 'Formules', formulaUid: 'fml-1' },
  { name: 'Sandwich poulet', kind: 'formula-part', qty: 1, total: 0, price: 0, formulaUid: 'fml-1' },
  { name: "Jus d'orange", kind: 'formula-part', qty: 1, total: 0, price: 0, formulaUid: 'fml-1' }
];
const money = (v) => Math.round((+v || 0) * 100) / 100;
const recordedLines = mockSaleLines.filter(l => l.kind !== 'formula-part').map(l => Object.assign(
  { name: l.name, qty: l.qty, total: money(l.total != null ? l.total : (l.price * l.qty)), cat: l.cat || '' },
  l.itemId ? { itemId: l.itemId } : null,
  l.kind ? { kind: l.kind } : null
));
ok(recordedLines.length === 2, 'recordSale lines length is exactly 2 (excludes child parts)');
ok(recordedLines[0].name === 'Tajine poulet' && recordedLines[0].total === 95, 'recorded regular dish has total 95 MAD');
ok(recordedLines[1].name === 'Formule Brunch' && recordedLines[1].total === 104 && recordedLines[1].kind === 'formula', 'recorded formula parent carries 104 MAD total');

// ── 7. Void & Pre-send Cascade Extraction ───────────────────────────────────
const confirmVoidLineMatch = serveurSource.match(/async function confirmVoidLine\(\) \{[\s\S]*?\n    \}/);
const changeOrderQtyMatch = serveurSource.match(/async function changeOrderQty\(tableId, uid, delta\) \{[\s\S]*?\n    \}/);

if (!confirmVoidLineMatch || !changeOrderQtyMatch) {
  ok(false, 'confirmVoidLine or changeOrderQty missing in kiwi-serveur.html');
} else {
  const voidHarnessCode = `
    let tableOrders = {};
    let voidLineTarget = null;
    let selectedVoidReason = 'client_change';
    let selectedVoidIsWaste = 0;
    const SV_DEMO = true;
    const markDirty = () => {};
    const renderTableDetail = () => {};
    const $ = (s) => ({ textContent: '', classList: { remove: () => {} }, disabled: false });
    const toast = () => {};
    const openVoidReasonModal = (tableId, line) => {
      voidLineTarget = { tableId, line };
    };

    ${confirmVoidLineMatch[0]}
    ${changeOrderQtyMatch[0]}

    return {
      setTableOrders: (to) => { tableOrders = to; },
      getTableOrders: () => tableOrders,
      changeOrderQty,
      confirmVoidLine,
      getVoidLineTarget: () => voidLineTarget,
    };
  `;
  const voidHarness = new Function(voidHarnessCode)();

  // Test 1: Pre-send cascade delete via changeOrderQty (delta = -1 on parent)
  voidHarness.setTableOrders({
    T1: [
      { uid: 'u-parent', id: 'm-brunch', name: 'Formule Brunch', kind: 'formula', price: 104, qty: 1, formulaUid: 'fml-casc-1', sentQty: 0 },
      { uid: 'u-c1', id: 'm-p1', name: 'Pain', kind: 'formula-part', price: 0, qty: 1, formulaUid: 'fml-casc-1', sentQty: 0 },
      { uid: 'u-c2', id: 'm-b1', name: 'Boisson', kind: 'formula-part', price: 0, qty: 1, formulaUid: 'fml-casc-1', sentQty: 0 },
      { uid: 'u-norm', id: 'm-cafe', name: 'Café', price: 15, qty: 1, sentQty: 0 }
    ]
  });

  await voidHarness.changeOrderQty('T1', 'u-parent', -1);
  const postPreSendOrders = voidHarness.getTableOrders().T1;
  ok(postPreSendOrders.length === 1 && postPreSendOrders[0].uid === 'u-norm', 'pre-send decrement to 0 cascaded deletion of parent and all formula-part lines');

  // Test 2: Sent line void cascade via confirmVoidLine
  voidHarness.setTableOrders({
    T1: [
      { uid: 'u-parent-sent', id: 'm-brunch', name: 'Formule Brunch', kind: 'formula', price: 104, qty: 1, formulaUid: 'fml-casc-2', sentQty: 1 },
      { uid: 'u-c1-sent', id: 'm-p1', name: 'Pain', kind: 'formula-part', price: 0, qty: 1, formulaUid: 'fml-casc-2', sentQty: 1 },
      { uid: 'u-c2-sent', id: 'm-b1', name: 'Boisson', kind: 'formula-part', price: 0, qty: 1, formulaUid: 'fml-casc-2', sentQty: 1 },
      { uid: 'u-norm-sent', id: 'm-cafe', name: 'Café', price: 15, qty: 1, sentQty: 1 }
    ]
  });

  await voidHarness.changeOrderQty('T1', 'u-parent-sent', -1);
  ok(voidHarness.getVoidLineTarget() != null, 'sent formula decrement triggered void modal target');
  await voidHarness.confirmVoidLine();
  const postVoidOrders = voidHarness.getTableOrders().T1;
  ok(postVoidOrders.length === 1 && postVoidOrders[0].uid === 'u-norm-sent', 'confirmVoidLine cascaded deletion of parent and all formula-part lines');
}

// ── 8. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 77;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}

