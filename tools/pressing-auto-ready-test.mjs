#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let n = 0;
function check(name, condition, extra = '') {
  if (!condition) {
    console.error(`  ✗ ${name}${extra ? ' · ' + extra : ''}`);
    process.exitCode = 1;
    return;
  }
  n++;
  console.log(`  ✓ ${name}`);
}

const caisseCode = read('assets/pressing-caisse.js');
const opsCode = read('assets/pressing-ops.js');

/* ── 1 · Extract and test caisse functions in isolated sandbox ─────────────── */
function makeCaisseContext() {
  const store = new Map();
  const queue = [];
  const toasts = [];
  const ctx = {
    console,
    Date,
    Set,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    CustomEvent: function (name, init) {
      this.type = name;
      this.detail = init && init.detail;
    },
    addEventListener() {},
    dispatchEvent() {},
    KiwiVenue: {
      getCurrentVenueData: () => ({ id: 'v1', slug: 'pressing-test', subtype: 'pressing' }),
      getVenue: () => 'v1',
    },
  };
  ctx.window = ctx;
  return { ctx, store, queue, toasts };
}

/* ── 2 · Direct derivation logic tests from pressing-caisse.js ───────────── */
console.log('\n■ Pressing Auto-Ready & Early Retrait Test Suite');

// Test effectiveStatus and orderStatus isolated evaluation
const evalScope = {};
const statusSnippet = `
${caisseCode.slice(caisseCode.indexOf('function effectiveStatus'), caisseCode.indexOf('const NOW = Date.now();'))}
exports.effectiveStatus = effectiveStatus;
exports.orderStatus = orderStatus;
exports.isLate = isLate;
`;
const script = new vm.Script(`(function(exports) { ${statusSnippet} })(evalScope)`);
script.runInNewContext({ evalScope, Date, Array });

const { effectiveStatus, orderStatus, isLate } = evalScope;

// 1. Auto-ready fires exactly at readyAt and not a second before
const T = 1700000000000;
const orderRecu = { readyAt: new Date(T), pieces: [{ pid: '1', status: 'recu' }] };
const orderTrait = { readyAt: new Date(T), pieces: [{ pid: '1', status: 'trait' }, { pid: '2', status: 'trait' }] };

check('piece is not ready 1ms before readyAt', effectiveStatus(orderTrait, orderTrait.pieces[0], T - 1) === 'trait');
check('piece is not ready 1s before readyAt', effectiveStatus(orderTrait, orderTrait.pieces[0], T - 1000) === 'trait');
check('order is trait 1ms before readyAt', orderStatus(orderTrait, T - 1) === 'trait');
check('order is recu 1s before readyAt when status is recu', orderStatus(orderRecu, T - 1000) === 'recu');

check('piece becomes pret exactly at readyAt', effectiveStatus(orderTrait, orderTrait.pieces[0], T) === 'pret');
check('order becomes pret exactly at readyAt', orderStatus(orderTrait, T) === 'pret');

check('piece remains pret after readyAt', effectiveStatus(orderTrait, orderTrait.pieces[0], T + 5000) === 'pret');
check('order remains pret after readyAt', orderStatus(orderTrait, T + 5000) === 'pret');

// 2. livre and manual pret both survive the derivation
const orderManualPretFuture = {
  readyAt: new Date(T + 100000), // future
  pieces: [{ pid: '1', status: 'pret' }, { pid: '2', status: 'recu' }],
};
check('manual pret survives even when readyAt is in the future', effectiveStatus(orderManualPretFuture, orderManualPretFuture.pieces[0], T) === 'pret');
check('manual pret + future recu gives trait order status', orderStatus(orderManualPretFuture, T) === 'trait');

const orderDelivered = {
  readyAt: new Date(T - 10000), // past
  pieces: [{ pid: '1', status: 'livre' }, { pid: '2', status: 'livre' }],
};
check('livre status is never converted to pret in past', effectiveStatus(orderDelivered, orderDelivered.pieces[0], T) === 'livre');
check('delivered order retains livre orderStatus', orderStatus(orderDelivered, T) === 'livre');

const orderPartiallyDelivered = {
  readyAt: new Date(T - 10000), // past
  pieces: [{ pid: '1', status: 'livre' }, { pid: '2', status: 'recu' }],
};
check('partial delivery: piece 1 is livre, piece 2 auto-readies to pret in past',
  effectiveStatus(orderPartiallyDelivered, orderPartiallyDelivered.pieces[0], T) === 'livre' &&
  effectiveStatus(orderPartiallyDelivered, orderPartiallyDelivered.pieces[1], T) === 'pret');
check('partial delivery with remaining auto-ready piece derives to pret orderStatus',
  orderStatus(orderPartiallyDelivered, T) === 'pret');

// 3. isLate redefinition (promised time passed and not yet collected)
check('isLate is false when readyAt is in future', !isLate(orderTrait, T - 1000));
check('isLate is false exactly at readyAt (t === readyAt)', !isLate(orderTrait, T));
check('isLate is true when readyAt has passed and order is not collected', isLate(orderTrait, T + 1));
check('isLate is false when order is delivered even if readyAt has passed', !isLate(orderDelivered, T + 1000));

// 4. Parity between caisse and pressing-ops.js dashboard
const { ctx: opsCtx } = makeCaisseContext();
vm.runInNewContext(opsCode, opsCtx, { filename: 'pressing-ops.js' });

const mockOrders = [
  { id: 'O-PAST-TRAIT', droppedAt: new Date(T - 3600000), readyAt: new Date(T - 60000), pay: { mode: 'pickup', paid: 0 }, pieces: [{ pid: '1', status: 'trait' }] },
  { id: 'O-FUTURE-RECU', droppedAt: new Date(T - 1800000), readyAt: new Date(T + 3600000), pay: { mode: 'pickup', paid: 0 }, pieces: [{ pid: '2', status: 'recu' }] },
  { id: 'O-FUTURE-PRET', droppedAt: new Date(T - 1800000), readyAt: new Date(T + 3600000), pay: { mode: 'pickup', paid: 50 }, rack: 'R-01', pieces: [{ pid: '3', status: 'pret' }] },
  { id: 'O-LIVRE', droppedAt: new Date(T - 7200000), readyAt: new Date(T - 3600000), collectedAt: new Date(T - 1800000), pay: { mode: 'pickup', paid: 40 }, pieces: [{ pid: '4', status: 'livre' }] },
];

opsCtx.KiwiPressingOps.replace(mockOrders, {
  customer: () => ({ name: 'Test Customer', phone: '0600000000' }),
  total: () => 50,
});

// Run summary at time T
const nowReal = Date.now;
Date.now = () => T;
try {
  const summary = opsCtx.KiwiPressingOps.summary();
  check('dashboard summary counts 3 active orders', summary.active === 3);
  check('dashboard summary auto-derives past trait order into ready count', summary.ready === 2); // O-PAST-TRAIT + O-FUTURE-PRET
  check('dashboard summary keeps future recu order in received count', summary.received === 1);
  check('dashboard summary records 0 treating when past order has flipped', summary.treating === 0);
  check('dashboard summary counts 1 delivered order', summary.delivered === 1);
  check('dashboard summary counts 1 uncollected late order', summary.late === 1); // O-PAST-TRAIT
  check('dashboard summary counts due balance only on active orders', summary.due === 100); // 50 + 50
} finally {
  Date.now = nowReal;
}

// 5. Early retrait UI generation and delivery guards
// Test rtCard and deliverOrder logic directly from pressing-caisse.js
check('rtCard source renders early warning badge when status is not pret',
  caisseCode.includes("early ? `<span class=\"px-pill warn\">Pas encore prêt, promis ${fmtDT(o.readyAt)}</span>`"));
check('rtCard source enables early collection action buttons',
  caisseCode.includes('data-px-rt-give="${o.id}"') && caisseCode.includes('Remettre au client'));
check('rtCard source disables Remettre when balance is due',
  caisseCode.includes('${due > 0 ? \'disabled title="Encaissez le solde d’abord"\' : \'\'}'));
check('deliverOrder source has no readiness guard and delivers any order',
  caisseCode.includes("o.pieces.forEach((p) => { p.status = 'livre'; });") &&
  caisseCode.includes('o.collectedAt = new Date();') &&
  caisseCode.includes('releaseSlot(o);'));

/* ── 6 · the stale-snapshot case ──────────────────────────────────────────────
 * sanitizeOrder() freezes `status` when the till syncs. If the till then sits
 * idle while an order crosses its readyAt — a shop closed for the evening — the
 * owner dashboard used to read that frozen field and show "En traitement" under
 * a ready count that had already moved. These checks pin the write-then-read
 * gap: the snapshot stays frozen (it is a record of a moment), and every
 * dashboard consumer derives on read instead. */
const dashCode = read('assets/pressing-dashboard.js');
const { ctx: staleCtx } = makeCaisseContext();
vm.runInNewContext(opsCode, staleCtx, { filename: 'pressing-ops.js' });

const staleOrders = [
  { id: 'O-CROSSES', droppedAt: new Date(T - 7200000), readyAt: new Date(T),
    pay: { mode: 'pickup', paid: 50 }, rack: 'R-04', pieces: [{ pid: '9', status: 'trait' }] },
];

const nowReal6 = Date.now;
Date.now = () => T - 3600000;                    // sync an hour BEFORE the promise
try {
  staleCtx.KiwiPressingOps.replace(staleOrders, {
    customer: () => ({ name: 'Soir Client', phone: '0600000001' }),
    total: () => 50,
  });
} finally { Date.now = nowReal6; }

const frozen = staleCtx.KiwiPressingOps.summary().orders.find((o) => o.id === 'O-CROSSES');
check('snapshot freezes status at sync time (record of a moment, not a live value)',
  frozen && frozen.status === 'trait');
check('exported orderStatus derives pret once readyAt has passed',
  staleCtx.KiwiPressingOps.orderStatus(frozen.pieces, frozen.readyAt, T + 1) === 'pret');

/* Run the dashboard's own effStatus against the real ops module rather than
   asserting on source text — a source match cannot prove the helper works. */
const effSrc = dashCode.match(/function effStatus\(o\)\s*\{[\s\S]*?\n {2}\}/);
check('pressing-dashboard.js defines effStatus', !!effSrc);
if (effSrc) {
  const effCtx = { window: { KiwiPressingOps: staleCtx.KiwiPressingOps }, Date };
  effCtx.KiwiPressingOps = staleCtx.KiwiPressingOps;
  vm.runInNewContext(effSrc[0] + '\n; globalThis.__eff = effStatus;', effCtx, { filename: 'eff.js' });
  const nowReal7 = Date.now;
  Date.now = () => T + 1;
  try {
    check('dashboard effStatus reads pret from a snapshot frozen at trait',
      effCtx.__eff(frozen) === 'pret');
  } finally { Date.now = nowReal7; }
  const nowReal8 = Date.now;
  Date.now = () => T - 1;
  try {
    check('dashboard effStatus still reads trait one ms before readyAt',
      effCtx.__eff(frozen) === 'trait');
  } finally { Date.now = nowReal8; }
}

/* Regression guard: every consumer that used to read the frozen field. */
check('dashboard active list derives status', dashCode.includes("return effStatus(o) !== 'livre'; }).sort("));
check('dashboard cancel guard derives status', dashCode.includes("var canCancel = effStatus(o) !== 'livre';"));
check('dashboard rack ready list derives status', dashCode.includes("return effStatus(o) === 'pret'; }).sort("));
check('dashboard delivered history derives status', dashCode.includes("return effStatus(o)==='livre';"));
check('dashboard status label derives status', dashCode.includes('var st = effStatus(o);'));
check('no dashboard consumer still reads the frozen o.status field',
  (dashCode.match(/o\.status/g) || []).length === 1); // the fallback inside effStatus itself

console.log(`\n✓ All ${n} pressing auto-ready, early retrait and snapshot-freshness checks passed.\n`);
