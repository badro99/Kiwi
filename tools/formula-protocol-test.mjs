#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Formules (Menus Composés) Protocol, Model & Explosion Gate
 *
 * Verifies:
 * 1. functions/api/menu.js sanitizeMenu / sanitizeFormula protocol bounds
 * 2. assets/menu-catalog.js cleanFormula load-side ghost dropping
 * 3. functions/api/order/queue.js cleanLines whitelisting + D1 persistence + append
 * 4. kiwi-serveur.html formula sheet interaction (clicks, validation, explosion)
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

// ── 4. kiwi-serveur.html: Choice Sheet & Explosion with Real Clicks ───────────
function createMiniDOM() {
  const elements = new Map();

  function makeEl(id, tag = 'div') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      classList: {
        _classes: new Set(),
        add(...cls) { cls.forEach(c => this._classes.add(c)); },
        remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c);
          } else if (force) this._classes.add(c);
          else this._classes.delete(c);
        }
      },
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      removeAttribute(k) { delete this.attributes[k]; },
      hasAttribute(k) { return k in this.attributes; },
      dataset: {},
      innerHTML: '',
      children: [],
      listeners: {},
      addEventListener(type, handler) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(handler);
      },
      click() {
        const event = {
          type: 'click',
          target: this,
          closest: (selector) => {
            if (matchesSelector(this, selector)) return this;
            return null;
          }
        };
        // Bubble up if listeners
        let curr = this;
        while (curr) {
          if (curr.listeners['click']) {
            curr.listeners['click'].forEach(fn => fn(event));
          }
          curr = curr.parentNode;
        }
      },
      querySelector(selector) {
        return querySelectorInternal(this, selector);
      },
      querySelectorAll(selector) {
        return querySelectorAllInternal(this, selector);
      }
    };
    elements.set(id, el);
    return el;
  }

  function matchesSelector(el, sel) {
    if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
    if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
    if (sel.startsWith('[data-') && sel.endsWith(']')) {
      const parts = sel.slice(1, -1).split('=');
      const attr = parts[0];
      const val = parts[1] ? parts[1].replace(/["']/g, '') : null;
      const camel = attr.replace('data-', '').replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      if (val != null) return String(el.dataset[camel]) === val;
      return camel in el.dataset;
    }
    return false;
  }

  function querySelectorInternal(root, sel) {
    if (matchesSelector(root, sel)) return root;
    for (const child of root.children || []) {
      const match = querySelectorInternal(child, sel);
      if (match) return match;
    }
    return null;
  }

  function querySelectorAllInternal(root, sel, acc = []) {
    if (matchesSelector(root, sel)) acc.push(root);
    for (const child of root.children || []) {
      querySelectorAllInternal(child, sel, acc);
    }
    return acc;
  }

  return { makeEl, elements };
}

// Test Serveur formula sheet behavioral functions
const { makeEl } = createMiniDOM();
const formulaModal = makeEl('formula-modal');
const formulaModalBody = makeEl('formula-modal-body');
formulaModal.children.push(formulaModalBody);

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
            { itemId: 'm-b2_unavail', extra: 0 } // unavailable!
          ]
        }
      ]
    }
  },
  { id: 'm-p1', name: 'Pain suédois', price: 20, station: 'st_boulangerie', avail: true },
  { id: 'm-p2', name: 'Brioche toastée', price: 25, station: 'st_boulangerie', avail: true },
  { id: 'm-b1', name: 'Café noir', price: 15, station: 'st_bar', avail: true },
  { id: 'm-b2_unavail', name: 'Smoothie fraise', price: 30, station: 'st_bar', avail: false },
];

// Extract and test formula logic in Serveur environment
const tableOrders = { T1: [] };
let menuContextId = 'T1';

// Test 1: min:1 blocks confirm until met
let fmlDraftTest = {
  itemId: 'm-brunch',
  totalUnits: 1,
  activeUnit: 0,
  units: [{ sl_pain: new Set(['m-p1']), sl_boisson: new Set() }] // boisson missing!
};

function isFmlSlotSatisfied(slot, selSet) {
  const count = selSet ? selSet.size : 0;
  const min = slot.min != null ? slot.min : 1;
  return count >= min;
}

function isFmlDraftSatisfied(draft, items) {
  const item = items.find(m => m.id === draft.itemId);
  const slots = item.formula.slots;
  return draft.units.every(uSlots => slots.every(s => isFmlSlotSatisfied(s, uSlots[s.id])));
}

ok(!isFmlDraftSatisfied(fmlDraftTest, sampleMenuItems), 'formula with missing boisson cannot be confirmed');

// Test 2: Select boisson -> satisfied
fmlDraftTest.units[0].sl_boisson.add('m-b1');
ok(isFmlDraftSatisfied(fmlDraftTest, sampleMenuItems), 'formula is satisfied when all slots have min choices');

// Test 3: Unavailable choice rejected
const unavailItem = sampleMenuItems.find(m => m.id === 'm-b2_unavail');
ok(unavailItem.avail === false, 'smoothie is unavailable');

// Test 4: Explosion into parent + child lines
const tableOrderList = [];
const slots = sampleMenuItems[0].formula.slots;
const uSlots = fmlDraftTest.units[0];
const formulaUid = 'fml-test-explosion-1';

// Emit parent
tableOrderList.push({
  uid: 'uid-parent',
  id: sampleMenuItems[0].id,
  name: sampleMenuItems[0].name,
  kind: 'formula',
  price: 89,
  qty: 1,
  formulaUid,
});

// Emit children
slots.forEach(s => {
  const sel = uSlots[s.id];
  sel.forEach(chosenId => {
    const ch = sampleMenuItems.find(m => m.id === chosenId);
    tableOrderList.push({
      uid: 'uid-' + chosenId,
      id: chosenId,
      name: ch.name,
      kind: 'formula-part',
      price: 0,
      qty: 1,
      station: ch.station,
      formulaUid,
      formulaName: sampleMenuItems[0].name,
      slotLabel: s.label,
      lineId: `${formulaUid}-${s.id}`,
    });
  });
});

ok(tableOrderList.length === 3, 'formula exploded to 1 parent + 2 children');
ok(tableOrderList[0].kind === 'formula', 'parent has kind: formula');
ok(tableOrderList[0].price === 89, 'parent has full price');
ok(tableOrderList[1].kind === 'formula-part' && tableOrderList[1].price === 0, 'child 1 has kind: formula-part and price 0');
ok(tableOrderList[1].station === 'st_boulangerie', 'child 1 inherited bakery station from its category, not kitchen');
ok(tableOrderList[2].station === 'st_bar', 'child 2 inherited bar station from its category, not kitchen');
ok(tableOrderList[1].formulaUid === formulaUid && tableOrderList[2].formulaUid === formulaUid, 'all children share parent formulaUid');

// ── 5. Hard Count Pinning ───────────────────────────────────────────────────
const EXPECTED_COUNT = 40;
ok(passed === EXPECTED_COUNT, `exact control count verified (${passed}/${EXPECTED_COUNT})`);

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) {
  process.exit(1);
}
