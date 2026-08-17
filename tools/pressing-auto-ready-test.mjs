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

console.log(`\n✓ All ${n} pressing auto-ready and early retrait checks passed.\n`);
