#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Caisse Handover & Closure Accounting Discrepancy Test Suite
 *
 * Direct execution of production functions from kiwi-caisse.html verifying:
 *  1. Unified accounting rollup (voided excluded, refunds do not increment txns,
 *     integer centime arithmetic).
 *  2. Reproduction of Pasta Corner discrepancy on old implementation and
 *     proof of fix on production functions:
 *     - 3 valid cash sales totalling 219.80 + 1 voided 35.00 cash sale:
 *       both rollups return 3 txns, 219.80 cash, expected drawer 1,692.80 with 1,473 float.
 *     - Old implementation reproduces 4 txns, 254.80 cash, 1,727.80 expected drawer.
 *  3. Voided sales with tips & reinstatement:
 *     - Voided sale excludes tips; reinstatement restores without drift.
 *  4. Refunds:
 *     - Reduces net revenue and relevant tender but does not count as a sale.
 *  5. Cash/card mix, tips, centimes and cash movements:
 *     - Fractional centimes, movesIn/movesOut, till expected reconciliation.
 *  6. Multiple cashier postes:
 *     - Correct inclusion at boundary (t >= sinceMs), exclusion of earlier entries,
 *       and preservation of full-service totals.
 *  7. Live modal refresh on void/reconcile:
 *     - reconcileVoids refreshes open handover/cloture modals without clearing entered count.
 *  8. Handover confirmation:
 *     - confirmHandover revalidates fresh expected drawer and persists true ecart.
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

/* Extract helpers and accounting functions verbatim from kiwi-caisse.html */
function extractBody(src, startMarker, endMarker) {
  const sIdx = src.indexOf(startMarker);
  if (sIdx === -1) throw new Error(`Could not find start marker: ${startMarker}`);
  const eIdx = src.indexOf(endMarker, sIdx);
  if (eIdx === -1) throw new Error(`Could not find end marker: ${endMarker}`);
  return src.slice(sIdx, eIdx + endMarker.length);
}

// Extract money helpers (lines ~7211-7218)
const moneyHelpers = extractBody(
  caisseHtml,
  'const money = n =>',
  "fmtMADcents = n => money(n).toFixed(2).replace('.', ',') + ' MAD';"
);

// Extract rollupLedger and journalTotals
const ledgerRollupBlock = extractBody(
  caisseHtml,
  'function rollupLedger(sinceMs) {',
  'function journalTotals() {\n      return rollupLedger();\n    }'
);

// Extract reconcileVoids
const reconcileBlock = extractBody(
  caisseHtml,
  'function reconcileVoids(refs, saleIds) {',
  'return touched;\n    }'
);

// Extract cloture helpers
const clotureBlock = extractBody(
  caisseHtml,
  'let clotureExpected = 0;',
  "el.style.animationDelay = delay + 'ms';\n      });\n    }"
);

// Extract drawerExpected
const drawerBlock = extractBody(
  caisseHtml,
  'function drawerExpected() {',
  'return major(minor(openingFloat) + t.cashC + t.cashTipsC + t.movesInC - t.movesOutC);\n    }'
);

// Extract handover block through window.KiwiCaisseAccounting definition
const handoverBlock = extractBody(
  caisseHtml,
  'function fmtEcart(e) {',
  'window.KiwiCaisseAccounting = Object.freeze({\n      rollupLedger,\n      journalTotals,\n      posteRollup,\n      drawerExpected,\n      renderHandoverCount,\n      confirmHandover,\n      renderCloture,\n      reconcileVoids,\n    });'
);

let controls = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  controls++;
  console.log('  ✓ ' + message);
}

/* Environment setup factory for testing production functions */
function createCaisseEnvironment(initialState = {}) {
  const elements = new Map();
  class MockElement {
    constructor(sel) {
      this.selector = sel;
      this._classList = new Set();
      this.classList = {
        add: (...cs) => cs.forEach((c) => this._classList.add(c)),
        remove: (...cs) => cs.forEach((c) => this._classList.delete(c)),
        contains: (c) => this._classList.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (this._classList.has(c)) this._classList.delete(c);
            else this._classList.add(c);
          } else if (force) this._classList.add(c);
          else this._classList.delete(c);
        },
      };
      this.attributes = new Map();
      this.style = {};
      this.value = '';
      this.textContent = '';
      this.innerHTML = '';
      this.hidden = false;
      this.disabled = false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    focus() {}
    addEventListener() {}
    remove() {}
  }

  const $ = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new MockElement(sel));
    return elements.get(sel);
  };
  const $$ = (sel) => [$(sel)];

  const emittedSessions = [];
  const toasts = [];

  const ctx = {
    $,
    $$,
    document: {
      querySelector: $,
      querySelectorAll: $$,
      getElementById: (id) => $(id.startsWith('#') ? id : '#' + id),
      addEventListener() {},
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    window: {},
    console,
    Date,
    Math,
    Number,
    String,
    parseFloat,
    Intl,
    Set,
    Map,
    Array,
    Object,
    // State variables
    journal: initialState.journal || [],
    cashMovements: initialState.cashMovements || [],
    handovers: initialState.handovers || [],
    openingFloat: initialState.openingFloat ?? 1000,
    posteOpeningFloat: initialState.posteOpeningFloat ?? (initialState.openingFloat ?? 1000),
    shiftOpenedAt: initialState.shiftOpenedAt || new Date(Date.now() - 3600000),
    posteOpenedAt: initialState.posteOpenedAt || null,
    currentCashier: initialState.currentCashier || { id: 'othmane', name: 'Othmane N.', role: 'Caissier' },
    CASHIER_ROSTER: initialState.CASHIER_ROSTER || [
      { id: 'othmane', name: 'Othmane N.', role: 'Caissier' },
      { id: 'nora', name: 'Nora B.', role: 'Responsable' },
      { id: 'samir', name: 'Samir K.', role: 'Caissier' },
    ],
    shift: { tablesPaid: 0, discounts: 0, discountsCount: 0, cancels: 0, refunds: 0 },
    authorizations: [],
    DAILY_OBJECTIF: 5000,
    dafrDays: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    monthsEn: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
    // Mocked domain functions
    storeName: () => 'Pasta Corner',
    currentMerchantSlug: () => 'pasta-corner',
    storeIsReal: () => true,
    isFeatureOff: () => false,
    toast: (m) => toasts.push(m),
    fmtDur: (min) => `${min} mn`,
    renderShiftStats() {},
    persistShift() {},
    saveProvisional() {},
    renderCashierCard() {},
    cashSessionId: () => 'sess-pasta-001',
    cashActorId: (id) => id || 'othmane',
    cashActorRef: (id) => id || 'nora',
    emitCashSession: (evt) => emittedSessions.push(evt),
    toasts,
    emittedSessions,
    elements,
  };

  vm.createContext(ctx);

  // Run extracted production code in the context
  const fullProductionCode = `
    ${moneyHelpers}
    ${ledgerRollupBlock}
    ${reconcileBlock}
    ${clotureBlock}
    ${drawerBlock}
    ${handoverBlock}
    Object.defineProperty(globalThis, 'clotureExpected', { get: () => clotureExpected });
    Object.defineProperty(globalThis, 'handoverState', { get: () => handoverState });
    globalThis.fmtMAD = fmtMAD;
    globalThis.fmtMADcents = fmtMADcents;
    globalThis.fmtEcart = fmtEcart;
    globalThis.money = money;
    globalThis.minor = minor;
    globalThis.major = major;
  `;
  vm.runInContext(fullProductionCode, ctx, { filename: 'kiwi-caisse-accounting.js' });

  return ctx;
}

console.log('--- Test 1: Pasta Corner Defect Reproduction & Fix ---');
{
  // Setup: opening time 10:37, opening float 1,473 MAD
  const openTime = new Date('2026-09-07T10:37:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T11:00:00Z'), amount: 70.00, method: 'cash', ref: 'KW-01', kind: 'sale' },
    { id: 's2', time: new Date('2026-09-07T11:30:00Z'), amount: 84.80, method: 'cash', ref: 'KW-02', kind: 'sale' },
    { id: 's3', time: new Date('2026-09-07T12:00:00Z'), amount: 65.00, method: 'cash', ref: 'KW-03', kind: 'sale' },
    // Voided 35 MAD cash sale
    { id: 's4', time: new Date('2026-09-07T12:15:00Z'), amount: 35.00, method: 'cash', ref: 'KW-04', kind: 'sale', voided: true },
  ];

  // Demonstrate that the OLD implementation produces the exact Pasta Corner defect
  function oldPosteRollup(journal, sinceMs) {
    let revenue = 0, card = 0, cash = 0, tips = 0, cashTips = 0, txns = 0;
    for (const e of journal) {
      const t = (e.time instanceof Date ? e.time : new Date(e.time)).getTime();
      if (t < sinceMs) continue;
      revenue += e.amount;
      if (e.method === 'cash') cash += e.amount; else card += e.amount;
      const tip = e.tip || 0;
      tips += tip;
      if (e.method === 'cash') cashTips += tip;
      txns++;
    }
    return { revenue, card, cash, tips, cashTips, txns, movesIn: 0, movesOut: 0 };
  }

  const oldHandoverRollup = oldPosteRollup(sales, openTime.getTime());
  const oldExpectedDrawer = 1473 + oldHandoverRollup.cash;
  ok(oldHandoverRollup.txns === 4, 'Old implementation defect: counts 4 transactions (includes voided sale)');
  ok(oldHandoverRollup.cash === 254.80, 'Old implementation defect: sums 254.80 MAD cash (includes 35 MAD voided)');
  ok(oldExpectedDrawer === 1727.80, 'Old implementation defect: expected drawer is 1,727.80 MAD (exact screenshot discrepancy)');

  // Now execute PRODUCTION code
  const env = createCaisseEnvironment({
    openingFloat: 1473,
    posteOpeningFloat: 1473,
    shiftOpenedAt: openTime,
    posteOpenedAt: openTime,
    journal: sales,
  });

  const cloTotals = env.journalTotals();
  const hoTotals = env.posteRollup(openTime.getTime());

  ok(cloTotals.txns === 3, 'Production journalTotals excludes voided sale: 3 transactions');
  ok(cloTotals.cash === 219.80, 'Production journalTotals cash is exactly 219.80 MAD');
  ok(hoTotals.txns === 3, 'Production posteRollup excludes voided sale: 3 transactions');
  ok(hoTotals.cash === 219.80, 'Production posteRollup cash is exactly 219.80 MAD');

  // Verify renderHandoverCount and renderCloture expected drawer
  env.renderCloture(false);
  ok(env.clotureExpected === 1692.80, 'Closure expected drawer is 1,692.80 MAD (1,473 + 219.80)');

  env.renderHandoverCount(false);
  ok(env.handoverState.expected === 1692.80, 'Handover expected drawer is 1,692.80 MAD (1,473 + 219.80)');
  ok(env.handoverState.expected === env.clotureExpected, 'Handover and Closure expected drawer match perfectly for identical window');
}

console.log('--- Test 2: Voided Sale with Tips & Reinstatement ---');
{
  const openTime = new Date('2026-09-07T10:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T10:15:00Z'), amount: 100.00, method: 'cash', tip: 15.00, ref: 'KW-10', kind: 'sale' },
    { id: 's2', time: new Date('2026-09-07T10:30:00Z'), amount: 50.00, method: 'cash', tip: 5.00, ref: 'KW-11', kind: 'sale' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 500,
    shiftOpenedAt: openTime,
    journal: sales,
  });

  let tot = env.journalTotals();
  ok(tot.txns === 2 && tot.cash === 150.00 && tot.cashTips === 20.00, 'Initial active sales include cash tips');

  // Void sale 1 with tip
  sales[0].voided = true;
  tot = env.journalTotals();
  let ho = env.posteRollup(openTime.getTime());
  ok(tot.txns === 1 && tot.cash === 50.00 && tot.cashTips === 5.00, 'Voided sale drops tip from journalTotals');
  ok(ho.txns === 1 && ho.cash === 50.00 && ho.cashTips === 5.00, 'Voided sale drops tip from posteRollup');

  // Reconcile / reinstate sale 1
  sales[0].voided = false;
  tot = env.journalTotals();
  ho = env.posteRollup(openTime.getTime());
  ok(tot.txns === 2 && tot.cash === 150.00 && tot.cashTips === 20.00, 'Reinstated sale restores cash and tips in journalTotals');
  ok(ho.txns === 2 && ho.cash === 150.00 && ho.cashTips === 20.00, 'Reinstated sale restores cash and tips in posteRollup');
}

console.log('--- Test 3: Refunds Reduce Revenue and Tender without Incrementing Txns ---');
{
  const openTime = new Date('2026-09-07T10:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T10:10:00Z'), amount: 120.00, method: 'cash', ref: 'KW-20', kind: 'sale' },
    { id: 's2', time: new Date('2026-09-07T10:20:00Z'), amount: 200.00, method: 'card', ref: 'KW-21', kind: 'sale' },
    // Cash refund of 30 MAD
    { id: 'r1', time: new Date('2026-09-07T10:30:00Z'), amount: -30.00, method: 'cash', ref: 'KW-22', kind: 'refund', refundOf: 'KW-20' },
    // Card refund of 50 MAD
    { id: 'r2', time: new Date('2026-09-07T10:40:00Z'), amount: -50.00, method: 'card', ref: 'KW-23', kind: 'refund', refundOf: 'KW-21' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 600,
    shiftOpenedAt: openTime,
    journal: sales,
  });

  const tot = env.journalTotals();
  const ho = env.posteRollup(openTime.getTime());

  ok(tot.txns === 2, 'Refunds do not increment journalTotals transaction count (2 sales, 2 refunds -> txns = 2)');
  ok(ho.txns === 2, 'Refunds do not increment posteRollup transaction count (txns = 2)');
  ok(tot.revenue === 240.00, 'Net revenue is 240.00 MAD (320 gross - 80 refunds)');
  ok(tot.cash === 90.00, 'Cash tender reflects cash refund: 120 - 30 = 90.00 MAD');
  ok(tot.card === 150.00, 'Card tender reflects card refund: 200 - 50 = 150.00 MAD');
  ok(ho.cash === 90.00 && ho.card === 150.00, 'posteRollup reflects tender refunds symmetrically');
}

console.log('--- Test 4: Cash/Card Mix, Tips, Fractional Centimes and Cash Movements ---');
{
  const openTime = new Date('2026-09-07T09:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T09:15:00Z'), amount: 123.45, method: 'card', tip: 10.00, ref: 'KW-30' },
    { id: 's2', time: new Date('2026-09-07T09:30:00Z'), amount: 67.85, method: 'cash', tip: 5.50, ref: 'KW-31' },
    { id: 's3', time: new Date('2026-09-07T09:45:00Z'), amount: -12.35, method: 'cash', kind: 'refund', ref: 'KW-32' },
  ];
  const cashMovements = [
    { id: 'm1', time: new Date('2026-09-07T10:00:00Z'), type: 'in', amount: 50.25, reason: 'Appoint monnaie' },
    { id: 'm2', time: new Date('2026-09-07T10:15:00Z'), type: 'out', amount: 25.50, reason: 'Achat fournisseur' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 1000.15,
    shiftOpenedAt: openTime,
    journal: sales,
    cashMovements,
  });

  const tot = env.journalTotals();
  ok(tot.revenue === 178.95, 'Net revenue computed in exact integer centimes: 123.45 + 67.85 - 12.35 = 178.95');
  ok(tot.card === 123.45, 'Card tender is 123.45');
  ok(tot.cash === 55.50, 'Cash tender is 67.85 - 12.35 = 55.50');
  ok(tot.cashTips === 5.50, 'Cash tips is 5.50');
  ok(tot.movesIn === 50.25, 'Movements in is 50.25');
  ok(tot.movesOut === 25.50, 'Movements out is 25.50');

  // Expected drawer:
  // 1000.15 (float) + 55.50 (cash) + 5.50 (cash tips) + 50.25 (in) - 25.50 (out)
  // = 1085.90 MAD
  const exp = env.drawerExpected();
  ok(exp === 1085.90, `drawerExpected matches exact centime sum (got ${exp}, expected 1085.90)`);
}

console.log('--- Test 5: Multiple Cashier Postes & Window Boundaries ---');
{
  const t0 = new Date('2026-09-07T08:00:00Z');
  const t1 = new Date('2026-09-07T08:30:00Z');
  const t2 = new Date('2026-09-07T09:00:00Z');
  const t3 = new Date('2026-09-07T09:30:00Z');
  const t4 = new Date('2026-09-07T10:00:00Z'); // Handover 1: Othmane -> Nora
  const t5 = new Date('2026-09-07T10:30:00Z');
  const t6 = new Date('2026-09-07T11:00:00Z');
  const t7 = new Date('2026-09-07T11:30:00Z');
  const t8 = new Date('2026-09-07T12:00:00Z'); // Handover 2: Nora -> Samir

  const journal = [
    // Poste 1 (Othmane)
    { id: 's1', time: t1, amount: 150.00, method: 'cash', ref: 'KW-P1-1', kind: 'sale' },
    { id: 's2', time: t2, amount: 200.00, method: 'card', ref: 'KW-P1-2', kind: 'sale' },
    // Poste 2 (Nora)
    { id: 's3', time: t5, amount: 300.00, method: 'cash', ref: 'KW-P2-1', kind: 'sale' },
    { id: 's4', time: t6, amount: 100.00, method: 'card', ref: 'KW-P2-2', kind: 'sale' },
    { id: 's5', time: new Date(t6.getTime() + 60000), amount: 40.00, method: 'cash', ref: 'KW-P2-3', kind: 'sale', voided: true },
  ];

  const cashMovements = [
    // Poste 1
    { id: 'm1', time: t3, type: 'out', amount: 50.00, reason: 'Avance personnel' },
    // Poste 2
    { id: 'm2', time: t7, type: 'in', amount: 100.00, reason: 'Appoint monnaie' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 1000.00,
    posteOpeningFloat: 1000.00,
    shiftOpenedAt: t0,
    posteOpenedAt: t0,
    journal,
    cashMovements,
  });

  // Check boundary: entries since t4 for Poste 2
  const p2 = env.posteRollup(t4.getTime());

  ok(p2.txns === 2, 'Poste 2 rollup excludes earlier entries and voided: exactly 2 txns');
  ok(p2.revenue === 400.00, 'Poste 2 revenue is 400.00 (300 cash + 100 card, s5 voided excluded)');
  ok(p2.cash === 300.00, 'Poste 2 cash is 300.00');
  ok(p2.card === 100.00, 'Poste 2 card is 100.00');
  ok(p2.movesIn === 100.00 && p2.movesOut === 0.00, 'Poste 2 includes only its own cash movements (m2 in, excludes m1 out)');

  // Handover 1 at t4: Othmane counted 1,100 (1000 float + 150 cash - 50 out)
  // Nora starts with posteOpeningFloat = 1,100, posteOpenedAt = t4
  env.posteOpenedAt = t4;
  env.posteOpeningFloat = 1100.00;
  env.currentCashier = { id: 'nora', name: 'Nora B.', role: 'Responsable' };

  env.renderHandoverCount(false);
  // Expected drawer for Nora: 1100 float + 300 cash + 100 in = 1500 MAD
  ok(env.handoverState.expected === 1500.00, 'Nora handover expected drawer is 1,500.00 MAD');

  // Verify Closure preserves FULL service totals
  const fullService = env.journalTotals();
  ok(fullService.txns === 4, 'Full service total txns is 4 (2 from Othmane + 2 from Nora, 1 voided excluded)');
  ok(fullService.revenue === 750.00, 'Full service revenue is 750.00 MAD (150+200+300+100)');
  ok(fullService.cash === 450.00, 'Full service cash is 450.00 MAD (150+300)');
  ok(fullService.card === 300.00, 'Full service card is 300.00 MAD (200+100)');
  ok(fullService.movesIn === 100.00 && fullService.movesOut === 50.00, 'Full service includes all movements (100 in, 50 out)');

  env.renderCloture(false);
  // Full service expected drawer: 1000 initial float + 450 cash + 100 in - 50 out = 1500 MAD
  ok(env.clotureExpected === 1500.00, 'Closure expected drawer is 1,500.00 MAD, tying out with the till');
}

console.log('--- Test 6: Displayed Totals and Persisted Handover Record ---');
{
  const openTime = new Date('2026-09-07T10:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T10:30:00Z'), amount: 200.00, method: 'cash', tip: 10.00, ref: 'KW-40' },
  ];
  const movements = [
    { id: 'm1', time: new Date('2026-09-07T10:45:00Z'), type: 'in', amount: 50.00, reason: 'Appoint' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 800.00,
    posteOpeningFloat: 800.00,
    shiftOpenedAt: openTime,
    posteOpenedAt: openTime,
    journal: sales,
    cashMovements: movements,
    currentCashier: { id: 'othmane', name: 'Othmane N.', role: 'Caissier' },
  });

  env.renderHandoverCount(false);
  // Expected: 800 + 200 + 10 + 50 = 1060 MAD
  ok(env.handoverState.expected === 1060.00, 'Handover expected drawer includes float + cash + cash tips + movements');
  ok(env.$('#ho-recon').innerHTML.includes(env.fmtMAD(1060)), 'Handover reconciliation UI displays formatted expected total');

  // Step 1: Outgoing cashier enters 1060 MAD counted
  env.$('#ho-count').value = '1060';
  env.updateHandoverEcart();
  ok(env.handoverState.counted === 1060.00, 'Handover state records 1060.00 counted');
  ok(env.$('#ho-ecart-val').textContent === '0 MAD', 'Handover ecart display is 0 MAD');

  // Step 2: Incoming cashier picks Nora and verifies 1060
  env.handoverState.incoming = { id: 'nora', name: 'Nora B.', role: 'Responsable' };
  env.$('#ho-verify').value = '1060';
  env.updateHandoverVerdict();
  ok(env.$('#ho-verify-confirm').disabled === false, 'Verification matches: confirm button enabled');

  // Step 3: Confirm handover
  env.confirmHandover();
  ok(env.handovers.length === 1, 'Handover is recorded in handovers array');
  const hRec = env.handovers[0];
  ok(hRec.expected === 1060.00, 'Persisted handover expected amount is 1060.00 MAD');
  ok(hRec.counted === 1060.00, 'Persisted handover counted amount is 1060.00 MAD');
  ok(hRec.ecart === 0, 'Persisted handover ecart is 0');
  ok(hRec.fromName === 'Othmane N.' && hRec.toName === 'Nora B.', 'Handover records outgoing and incoming cashier names');

  // Check emitted cash session event
  ok(env.emittedSessions.length === 1, 'Cash session handover event was emitted');
  const evt = env.emittedSessions[0];
  ok(evt.eventType === 'handover', 'Event type is handover');
  ok(evt.expectedCents === 106000, 'Emitted expected cents is 106000');
  ok(evt.countedCents === 106000, 'Emitted counted cents is 106000');
  ok(evt.gapCents === 0, 'Emitted gap cents is 0');

  // Incoming cashier took over
  ok(env.currentCashier.id === 'nora', 'Nora is now current cashier');
  ok(env.posteOpeningFloat === 1060.00, 'Nora took over 1060.00 as posteOpeningFloat');
}

console.log('--- Test 7: Void/Reconcile Refresh Preserves Entered Count ---');
{
  const openTime = new Date('2026-09-07T10:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T10:15:00Z'), amount: 100.00, method: 'cash', ref: 'KW-50' },
    { id: 's2', time: new Date('2026-09-07T10:30:00Z'), amount: 50.00, method: 'cash', ref: 'KW-51' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 500.00,
    posteOpeningFloat: 500.00,
    shiftOpenedAt: openTime,
    posteOpenedAt: openTime,
    journal: sales,
  });

  // Open handover modal and type physical count 650
  env.$('#handover-modal').classList.add('is-open');
  env.renderHandoverCount(false);
  ok(env.handoverState.expected === 650.00, 'Initial handover expected is 650');
  env.$('#ho-count').value = '650';
  env.updateHandoverEcart();
  ok(env.handoverState.counted === 650.00, 'Counted is 650');

  // A void arrives for s2 while handover modal is open
  env.reconcileVoids(['KW-51'], ['s2']);

  // Verify that reconcileVoids refreshed expected to 600 WITHOUT clearing entered count 650
  ok(env.handoverState.expected === 600.00, 'Handover expected refreshed to 600.00 on void');
  ok(env.$('#ho-count').value === '650', 'Entered physical count was NOT erased by modal refresh');
  ok(env.handoverState.counted === 650.00, 'Counted state retained 650.00');
  ok(env.$('#ho-ecart-val').textContent === '+ 50 MAD', 'Ecart updated accurately (+50 MAD difference with new expected)');

  // Cloture modal refresh preservation test
  env.$('#cloture-modal').classList.add('is-open');
  env.renderCloture(false);
  ok(env.clotureExpected === 600.00, 'Cloture expected is 600.00');
  env.$('#clo-count').value = '600';
  env.updateEcart();

  // Re-instate s2
  env.reconcileVoids([], []); // clear voids
  sales[1].voided = false;
  env.renderCloture(true); // preserve count
  ok(env.clotureExpected === 650.00, 'Cloture expected updated to 650.00');
  ok(env.$('#clo-count').value === '600', 'Entered count in cloture was NOT erased');
}

console.log('--- Test 8: confirmHandover Revalidates Stale Expected Drawer ---');
{
  const openTime = new Date('2026-09-07T10:00:00Z');
  const sales = [
    { id: 's1', time: new Date('2026-09-07T10:15:00Z'), amount: 100.00, method: 'cash', ref: 'KW-60' },
  ];

  const env = createCaisseEnvironment({
    openingFloat: 500.00,
    posteOpeningFloat: 500.00,
    shiftOpenedAt: openTime,
    posteOpenedAt: openTime,
    journal: sales,
  });

  env.renderHandoverCount(false);
  ok(env.handoverState.expected === 600.00, 'Initial expected is 600');
  env.$('#ho-count').value = '600';
  env.updateHandoverEcart();

  // Switch to verify step
  env.handoverState.incoming = { id: 'nora', name: 'Nora B.', role: 'Responsable' };
  env.$('#ho-verify').value = '600';
  env.updateHandoverVerdict();

  // Simulate a late sale arriving or being voided right before clicking confirm,
  // making handoverState.expected stale
  sales.push({ id: 's2', time: new Date('2026-09-07T10:45:00Z'), amount: 50.00, method: 'cash', ref: 'KW-61' });
  // handoverState.expected is still 600.00 here

  env.confirmHandover();
  const rec = env.handovers[0];
  ok(rec.expected === 650.00, 'confirmHandover revalidated fresh expected drawer (650.00, not stale 600.00)');
  ok(rec.ecart === -50.00, 'Persisted ecart accurately reflects recount against fresh expected (-50.00 MAD)');
}

console.log(`\ncaisse-accounting-handover-test: ${controls} controls passed`);
