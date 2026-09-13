#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Kitchen Two-Tier Void Protocol & Waste Tracking
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE, tillToken, TILL_COOKIE, tillActorProof } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import { newSessionId } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'test-secret-kitchen-void-protocol';
const MERCHANT = 'resto-void-test';
const STAFF_ID = 'mem-hamza';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const facade = { _db: db };
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() {
        const r = db.prepare(query).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
    };
    return st;
  };
  facade.prepare = prepare;
  facade.batch = async (statements) => {
    db.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.run());
      db.exec('COMMIT');
      return results;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return facade;
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };
const exec = (sql, ...args) => db._db.prepare(sql).run(...args);

function doc(feature, data) {
  exec('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)',
    MERCHANT, feature, JSON.stringify(data), Date.now());
}

async function setupFloorAndStaff() {
  exec('INSERT INTO merchant_config (merchant, features, updated_ts) VALUES (?, ?, ?)',
    MERCHANT, JSON.stringify({ orderpro: true }), Date.now());
  const member = {
    id: STAFF_ID, firstName: 'Hamza', lastName: 'Serveur', email: 'hamza@example.com',
    pinCode: '5678', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member] });
  doc('attendance', {
    entries: [{
      id: 'att-1', memberId: STAFF_ID, staffId: STAFF_ID, name: 'Hamza Serveur',
      inTs: Date.now() - 3600000, outTs: null, pauseTs: null,
    }],
  });
  doc('floorplan', {
    staff: [{ id: STAFF_ID, name: 'Hamza Serveur' }],
    tables: [
      { id: 'T1', num: '1', covers: 4, servers: [STAFF_ID] },
      { id: 'T2', num: '2', covers: 2, servers: [STAFF_ID] },
    ],
  });
}

async function postQueue(body, cookieHeader) {
  const req = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await queue.onRequestPost({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('\n■ Kitchen Void Protocol Behavioural Tests (tools/kitchen-void-protocol-test.mjs)');

await setupFloorAndStaff();

const validToken = await employeeToken(
  AUTH_SECRET,
  { memberId: STAFF_ID, staffId: STAFF_ID, merchant: MERCHANT, inTs: Date.now() - 3600000 }
);
const employeeCookie = `${EMPLOYEE_COOKIE}=${validToken}`;

const now = Date.now();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
      VALUES ('ses-v1', ?, '1', 'table', 'open', ?, ?)`, MERCHANT, now - 5000, now - 5000);

const testLines = [
  { id: 'item-burger', name: 'Cheeseburger', qty: 2, unitPrice: 70, stationAccepted: false },
  { id: 'item-pizza', name: 'Pizza Royale', qty: 1, unitPrice: 90, stationAccepted: true },
];

exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-v1', ?, 201, 'table', '1', 230, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(testLines), now - 5000, now - 5000);

// 1. Tier 1: Void unstarted line (Cheeseburger)
const tier1Res = await postQueue({
  merchant: MERCHANT,
  voidLine: {
    orderId: 'ord-v1',
    table: '1',
    itemId: 'item-burger',
    qty: 1,
    reason: 'client_change',
    isWaste: 0,
    actor: 'Hamza',
  },
}, employeeCookie);

check('Tier 1 void succeeds with 200', tier1Res.status === 200 && tier1Res.data.ok === true && tier1Res.data.tier === 1);

const orderAfterTier1 = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterTier1 = JSON.parse(orderAfterTier1.lines);
check('Cheeseburger quantity decremented to 1', linesAfterTier1.find(l => l.id === 'item-burger')?.qty === 1);
check('Order total recalculated (230 - 70 = 160)', orderAfterTier1.total === 160);

const voidAudit1 = db._db.prepare("SELECT reason, is_waste, status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-burger');
check('kitchen_voids row created with status approved', voidAudit1 && voidAudit1.reason === 'client_change' && voidAudit1.is_waste === 0 && voidAudit1.status === 'approved');

// 2. Tier 2: Void cooking line (Pizza Royale)
const tier2Res = await postQueue({
  merchant: MERCHANT,
  voidLine: {
    orderId: 'ord-v1',
    table: '1',
    itemId: 'item-pizza',
    qty: 1,
    reason: 'kitchen_waste',
    isWaste: 1,
    actor: 'Hamza',
  },
}, employeeCookie);

check('Tier 2 void returns alert_dispatched (200)', tier2Res.status === 200 && tier2Res.data.ok === true && tier2Res.data.tier === 2);

const orderAfterTier2 = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterTier2 = JSON.parse(orderAfterTier2.lines);
const pizzaLine = linesAfterTier2.find(l => l.id === 'item-pizza');
check('Pizza line has voidAlert attached', pizzaLine && pizzaLine.voidAlert && pizzaLine.voidAlert.reason === 'kitchen_waste');

const voidAudit2 = db._db.prepare("SELECT status, is_waste FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-pizza');
check('kitchen_voids row created with status pending', voidAudit2 && voidAudit2.status === 'pending' && voidAudit2.is_waste === 1);

// 3. Chef Acknowledges Void: Accept
const ackAcceptRes = await postQueue({
  merchant: MERCHANT,
  ackVoid: {
    orderId: 'ord-v1',
    action: 'accept',
    isWaste: 1,
  },
}, employeeCookie);

check('Chef ack accept succeeds with 200', ackAcceptRes.status === 200 && ackAcceptRes.data.ok === true && ackAcceptRes.data.action === 'accepted');

const orderAfterAckAccept = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-v1');
const linesAfterAckAccept = JSON.parse(orderAfterAckAccept.lines);
check('Pizza line removed from cooking ticket', !linesAfterAckAccept.some(l => l.id === 'item-pizza'));
check('Total updated to 70', orderAfterAckAccept.total === 70);

const voidAuditAfterAccept = db._db.prepare("SELECT status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v1', 'item-pizza');
check('kitchen_voids status updated to approved', voidAuditAfterAccept && voidAuditAfterAccept.status === 'approved');

// 4. Chef Acknowledges Void: Reject (Already plated)
// Create another cooking order for reject testing
const rejectLines = [{ id: 'item-steak', name: 'Steak Grillé', qty: 1, unitPrice: 120, stationAccepted: true }];
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-v2', ?, 202, 'table', '1', 120, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(rejectLines), now, now);

await postQueue({
  merchant: MERCHANT,
  voidLine: { orderId: 'ord-v2', table: '1', itemId: 'item-steak', qty: 1, reason: 'order_error', actor: 'Hamza' },
}, employeeCookie);

const ackRejectRes = await postQueue({
  merchant: MERCHANT,
  ackVoid: { orderId: 'ord-v2', action: 'reject' },
}, employeeCookie);

check('Chef ack reject succeeds with 200', ackRejectRes.status === 200 && ackRejectRes.data.ok === true && ackRejectRes.data.action === 'rejected');

const orderAfterAckReject = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-v2');
const linesAfterAckReject = JSON.parse(orderAfterAckReject.lines);
check('Steak line retained with note marked [DÉJÀ PRÊT]', linesAfterAckReject[0].note.includes('[DÉJÀ PRÊT]') && !linesAfterAckReject[0].voidAlert);

const voidAuditAfterReject = db._db.prepare("SELECT status FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-v2', 'item-steak');
check('kitchen_voids status updated to rejected', voidAuditAfterReject && voidAuditAfterReject.status === 'rejected');

// 5. Security & Boundary: Attack vectors against floor scope
// Seed an order on Table 99 (outside floor plan scope)
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts)
      VALUES ('ord-out', ?, 299, 'table', '99', 100, ?, 'accepted', ?, ?)`,
      MERCHANT, JSON.stringify([{ id: 'item-steak', name: 'Steak', qty: 1, unitPrice: 100 }]), now, now);

// 5a. voidLine with table: '99' outside scope -> 403
const outVoidExplicit = await postQueue({
  merchant: MERCHANT,
  voidLine: { orderId: 'ord-out', table: '99', itemId: 'item-steak', qty: 1 },
}, employeeCookie);
check('voidLine with explicit table outside scope returns 403', outVoidExplicit.status === 403 && outVoidExplicit.data.error === 'floor-table-required');

// 5b. voidLine WITHOUT table field on out-of-scope order -> 403 (resolved table '99' is rejected)
const outVoidNoTable = await postQueue({
  merchant: MERCHANT,
  voidLine: { orderId: 'ord-out', itemId: 'item-steak', qty: 1 },
}, employeeCookie);
check('voidLine with omitted table on out-of-scope order returns 403', outVoidNoTable.status === 403 && outVoidNoTable.data.error === 'floor-table-required');

// 5c. ackVoid on out-of-scope order -> 403
const outAck = await postQueue({
  merchant: MERCHANT,
  ackVoid: { orderId: 'ord-out', action: 'accept' },
}, employeeCookie);
check('ackVoid on out-of-scope order returns 403', outAck.status === 403 && outAck.data.error === 'floor-table-required');

// 5d. voidLine with omitted table on in-scope order Table 1 -> succeeds (table '1' resolved and allowed)
const inScopeNoTable = await postQueue({
  merchant: MERCHANT,
  voidLine: { orderId: 'ord-v2', itemId: 'item-steak', qty: 1 },
}, employeeCookie);
check('voidLine with omitted table on in-scope order resolves and succeeds', inScopeNoTable.status === 200 && inScopeNoTable.data.ok === true);

// 5e. EditLine protocol checks
const editLines = [
  { id: 'item-edit-burger', name: 'Cheeseburger', qty: 2, unitPrice: 70, note: 'bien cuit', stationAccepted: false },
  { id: 'item-edit-tajine', name: 'Tajine Poulet', qty: 3, unitPrice: 100, note: '', stationAccepted: true },
];
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-edit-1', ?, 205, 'table', '1', 440, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(editLines), now - 3000, now - 3000);

const voidsBeforeEdit = db._db.prepare('SELECT COUNT(*) AS total FROM kitchen_voids WHERE order_id = ?').get('ord-edit-1').total;

// Control 1: Pre-accept edit mutates lines in place without a kitchen_voids row
const preEditRes = await postQueue({
  merchant: MERCHANT,
  editLine: {
    orderId: 'ord-edit-1',
    lineId: 'item-edit-burger',
    qty: 1,
    note: 'saignant',
  },
}, employeeCookie);
check('Pre-accept edit succeeds with tier 1 and action mutated', preEditRes.status === 200 && preEditRes.data.ok === true && preEditRes.data.tier === 1 && preEditRes.data.action === 'mutated');

const orderAfterPreEdit = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-edit-1');
const linesAfterPreEdit = JSON.parse(orderAfterPreEdit.lines);
const editedBurger = linesAfterPreEdit.find(l => l.id === 'item-edit-burger');
check('Pre-accept edit mutates qty to 1 and note to saignant in place', editedBurger && editedBurger.qty === 1 && editedBurger.note === 'saignant');
check('Order total recalculated using line unitPrice (70 + 300 = 370)', orderAfterPreEdit.total === 370);

const voidsAfterPreEdit = db._db.prepare('SELECT COUNT(*) AS total FROM kitchen_voids WHERE order_id = ?').get('ord-edit-1').total;
check('Pre-accept edit produces zero kitchen_voids rows', voidsAfterPreEdit === voidsBeforeEdit);

// Control 2: Post-accept qty-down produces exactly one 'pending' void for delta
const postDownRes = await postQueue({
  merchant: MERCHANT,
  editLine: {
    orderId: 'ord-edit-1',
    lineId: 'item-edit-tajine',
    qty: 2, // 3 -> 2 (delta = 1)
    isWaste: 0,
    actor: 'Hamza',
  },
}, employeeCookie);
check('Post-accept qty-down returns tier 2 alert_dispatched', postDownRes.status === 200 && postDownRes.data.ok === true && postDownRes.data.tier === 2 && postDownRes.data.action === 'alert_dispatched');

const tajineVoid = db._db.prepare("SELECT qty, status, reason, is_waste FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-edit-1', 'item-edit-tajine');
check('Post-accept qty-down produces exactly one pending void for delta (qty 1)', tajineVoid && tajineVoid.qty === 1 && tajineVoid.status === 'pending');

// Control 3: Post-accept qty-up produces zero void rows and appends unaccepted line delta
const postUpRes = await postQueue({
  merchant: MERCHANT,
  editLine: {
    orderId: 'ord-edit-1',
    lineId: 'item-edit-tajine',
    qty: 4, // from base 3 to 4 (delta = +1)
  },
}, employeeCookie);
check('Post-accept qty-up returns tier 1 appended', postUpRes.status === 200 && postUpRes.data.ok === true && postUpRes.data.tier === 1 && postUpRes.data.action === 'appended');

const orderAfterPostUp = db._db.prepare('SELECT total, lines FROM orders WHERE id = ?').get('ord-edit-1');
const linesAfterPostUp = JSON.parse(orderAfterPostUp.lines);
const tajineLines = linesAfterPostUp.filter(l => l.id === 'item-edit-tajine');
check('Post-accept qty-up appends unaccepted line fragment with stationAccepted: false',
  tajineLines.length === 2 && tajineLines.some(l => l.stationAccepted === true) && tajineLines.some(l => l.stationAccepted === false && l.qty === 1));

const tajineVoidCount = db._db.prepare("SELECT COUNT(*) AS total FROM kitchen_voids WHERE order_id = ? AND item_id = ?").get('ord-edit-1', 'item-edit-tajine').total;
check('Post-accept qty-up creates zero additional void rows', tajineVoidCount === 1);

// Control 4: Post-accept note change refuses with 409 and tier 2
const postNoteRes = await postQueue({
  merchant: MERCHANT,
  editLine: {
    orderId: 'ord-edit-1',
    lineId: 'item-edit-tajine',
    note: 'sans oignons',
  },
}, employeeCookie);
check('Post-accept note change is refused with 409 and tier 2', postNoteRes.status === 409 && postNoteRes.data.reason === 'accepted' && postNoteRes.data.tier === 2);

// Control 5: CAS race control — chef accepts between read and write
const raceLines = [
  { id: 'item-race-dish', name: 'Pastilla', qty: 2, unitPrice: 85, note: '', stationAccepted: false },
];
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
      VALUES ('ord-race-1', ?, 206, 'table', '1', 170, ?, 'accepted', 'ses-v1', ?, ?)`,
      MERCHANT, JSON.stringify(raceLines), now - 2000, now - 2000);

// Simulate chef acceptance concurrently updating the order on D1
exec(`UPDATE orders SET lines = ?, updated_ts = ? WHERE id = 'ord-race-1'`,
  JSON.stringify([{ id: 'item-race-dish', name: 'Pastilla', qty: 2, unitPrice: 85, note: '', stationAccepted: true }]), now - 1000);

// Waiter submits pre-accept edit (reducing qty 2 -> 1)
const raceEditRes = await postQueue({
  merchant: MERCHANT,
  editLine: {
    orderId: 'ord-race-1',
    lineId: 'item-race-dish',
    qty: 1,
    isWaste: 0,
    actor: 'Hamza',
  },
}, employeeCookie);

check('CAS conflict gracefully re-evaluates and falls through to tier-2 pending void',
  raceEditRes.status === 200 && raceEditRes.data.ok === true && raceEditRes.data.tier === 2 && raceEditRes.data.action === 'alert_dispatched');

const orderAfterRace = db._db.prepare('SELECT lines FROM orders WHERE id = ?').get('ord-race-1');
const raceLinesAfter = JSON.parse(orderAfterRace.lines);
check('Chef acceptance was preserved (stationAccepted remains true)', raceLinesAfter[0].stationAccepted === true && raceLinesAfter[0].voidAlert != null);

// 5f. Waiter Stepper UI Integration Logic Check
// Verify kiwi-serveur.html contains the sent-line stepper wiring
const serveurHtml = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
check('Serveur HTML wires editLine to sent-line stepper',
  serveurHtml.includes('editLine:') && serveurHtml.includes('newQty <= 0') && serveurHtml.includes('openVoidReasonModal') && serveurHtml.includes('appendedLine'));

// 6. Stock Restock & Lot Integrity on Kitchen Voids
import vm from 'node:vm';
const memStore = new Map();
const lsMock = {
  getItem: (k) => memStore.get(k) || null,
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
};
const win = {
  localStorage: lsMock,
  addEventListener: () => {},
  KiwiEnv: { isReal: () => true },
  KiwiPlatform: { isPaired: () => true, pairedMerchant: () => MERCHANT },
  KiwiCost: {
    doc: () => ({
      ingredients: [
        { id: 'stock:patty', stockId: 'patty-beef', useCost: 92 },
      ],
      recipes: {
        'item-burger': {
          status: 'complete', name: 'Cheeseburger', yield: 1,
          lines: [{ ing: 'stock:patty', stock: 'patty-beef', qty: 1, stockQty: 1 }],
        },
      },
    }),
  },
};
win.window = win;
const vmCtx = vm.createContext({
  window: win, localStorage: lsMock, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/inventory-ledger.js'), 'utf8'), vmCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/inventory-consumption.js'), 'utf8'), vmCtx);

const I = win.KiwiInventory;
const C = win.KiwiInventoryConsumption;

const t0 = 1770000000000;
// 6a. Seed initial lot: 10 units of beef patty @ 92 MAD
I.ensureOpening('patty-beef', 10, { unitCost: 92, occurredTs: t0 });
check('Initial opening lot seeded with 10 units @ 92 MAD', I.balance('patty-beef') === 10);

// 6b. Record sale of 2 cheeseburgers (consumed @ frozen cost 92 MAD)
C.record({
  id: 'ord-v1', ref: 'ord-v1', time: t0 + 1000,
  lines: [{ itemId: 'item-burger', name: 'Cheeseburger', qty: 2 }],
});
check('Sale of 2 burgers deducts 2 patties (balance 8)', I.balance('patty-beef') === 8);

// 6c. Receive subsequent receipt lot: 10 units @ 110 MAD (higher cost)
I.add({
  id: 'inv-rec-1', itemId: 'patty-beef', qty: 10, reason: 'receipt', unitCost: 110,
  refType: 'receipt', refId: 'rec-1', occurredTs: t0 + 2000,
  meta: { rank: 1, supplierName: 'Boucherie Atlas' },
});
check('Receipt adds 10 units @ 110 MAD (balance 18)', I.balance('patty-beef') === 18);

// 6d. Execute non-waste void (qty 1): must restore to frozen 92 MAD lot, NOT 110 MAD lot
const voidCount = await C.reverseVoid({
  voidId: 'voi-test-101', orderId: 'ord-v1', itemId: 'item-burger', qty: 1, isWaste: 0, reason: 'client_change',
});
check('reverseVoid writes 1 reversal movement for non-waste void', voidCount === 1);
check('Stock balance restored to 19 (8 + 10 + 1)', I.balance('patty-beef') === 19);

const voidMovements = I.history('patty-beef').filter(r => r.refType === 'kitchen-void');
check('Reversal movement carries frozen unitCost of 92 MAD (not 110)',
  voidMovements.length === 1 && voidMovements[0].unitCost === 92 && voidMovements[0].qty === 1);

const lotsAfterVoid = C.deriveLots('patty-beef');
const lot92 = lotsAfterVoid.find(l => l.unitCost === 92);
const lot110 = lotsAfterVoid.find(l => l.unitCost === 110);
check('Lot 92 MAD restored to 9 units remaining', lot92 && lot92.remainingQty === 9);
check('Lot 110 MAD remains untouched at 10 units', lot110 && lot110.remainingQty === 10);

// 6e. Waste void (isWaste = 1): zero stock movements, loss stands
const wasteVoidCount = await C.reverseVoid({
  voidId: 'voi-test-waste', orderId: 'ord-v1', itemId: 'item-burger', qty: 1, isWaste: 1, reason: 'kitchen_waste',
});
check('Waste void (isWaste = 1) produces zero stock movements', wasteVoidCount === 0);
check('Stock balance remains at 19 after waste void', I.balance('patty-beef') === 19);

// 6f. Idempotency: re-dispatching same voidId produces zero duplicate movements
const dupVoidCount = await C.reverseVoid({
  voidId: 'voi-test-101', orderId: 'ord-v1', itemId: 'item-burger', qty: 1, isWaste: 0,
});
check('Duplicate reverseVoid call is idempotent (0 new rows)', dupVoidCount === 0 || I.history('patty-beef').filter(r => r.id === voidMovements[0].id).length === 1);
check('Stock balance remains 19 without double-restocking', I.balance('patty-beef') === 19);

// 6g. Remote device derivation without local original sale movement
const remoteVoidCount = await C.reverseVoid({
  voidId: 'voi-remote-888', orderId: 'ord-remote-999', itemId: 'item-burger', qty: 1, isWaste: 0, lineIndex: 0,
});
check('Remote device derives recipe reversal with deterministic ID', remoteVoidCount === 1);
const remoteMv = I.history('patty-beef').find(r => r.meta && r.meta.voidId === 'voi-remote-888');
check('Remote void movement created with correct item and qty', remoteMv && remoteMv.itemId === 'patty-beef' && remoteMv.qty === 1);
check('Remote estimate records costSource recipe-estimate and null reversalOf',
  remoteMv && remoteMv.meta && remoteMv.meta.costSource === 'recipe-estimate' && !remoteMv.reversalOf);

function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const expectedRemoteId = 'inv-void-' + fnv1a([MERCHANT, 'voi-remote-888', 'patty-beef', 0].join('|'));
check('Remote void movement ID is deterministic and matches formula', remoteMv && remoteMv.id === expectedRemoteId);

// 7. Multi-device ID agreement and remote D1 cost fetch (Constraints A, B, C)
function makeIsolatedEnv(fetchStub) {
  const store = new Map();
  const mockLs = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const mockWin = {
    localStorage: mockLs,
    addEventListener: () => {},
    fetch: fetchStub || (() => Promise.reject(new Error('offline'))),
    KiwiEnv: { isReal: () => true },
    KiwiPlatform: { isPaired: () => true, pairedMerchant: () => MERCHANT },
    KiwiCost: {
      doc: () => ({
        ingredients: [
          { id: 'stock:patty', stockId: 'patty-beef', useCost: 110 }, // Recipe says 110 today
          { id: 'stock:cheese', stockId: 'cheese-cheddar', useCost: 15 },
        ],
        recipes: {
          'item-deluxe-burger': {
            status: 'complete', name: 'Burger Deluxe', yield: 1,
            lines: [
              { ing: 'stock:patty', stock: 'patty-beef', qty: 1, stockQty: 1 },
              { ing: 'stock:cheese', stock: 'cheese-cheddar', qty: 1, stockQty: 1 },
            ],
          },
        },
      }),
    },
  };
  mockWin.window = mockWin;
  const ctx = vm.createContext({
    window: mockWin, localStorage: mockLs, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp,
    fetch: mockWin.fetch, setTimeout: () => 0, setInterval: () => 0, clearTimeout: () => {},
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/inventory-ledger.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/inventory-consumption.js'), 'utf8'), ctx);
  return { win: mockWin, I: mockWin.KiwiInventory, C: mockWin.KiwiInventoryConsumption };
}

// 7a. Control A: Local sale and remote void generate identical IDs
const envLocal = makeIsolatedEnv();
envLocal.I.ensureOpening('patty-beef', 10, { unitCost: 92, occurredTs: t0 });
envLocal.I.ensureOpening('cheese-cheddar', 10, { unitCost: 12, occurredTs: t0 });
envLocal.C.record({
  id: 'ord-shared-1', ref: 'ord-shared-1', time: t0 + 1000,
  lines: [{ itemId: 'item-deluxe-burger', name: 'Burger Deluxe', qty: 1 }],
});
const localSaleRows = envLocal.I.history().filter(r => r.reason === 'sale');
check('Local sale writes part: 0 and part: 1 into meta',
  localSaleRows.length === 2 && localSaleRows.every(r => r.meta && r.meta.part != null));

await envLocal.C.reverseVoid({
  voidId: 'voi-shared-multi', orderId: 'ord-shared-1', itemId: 'item-deluxe-burger', qty: 1, isWaste: 0,
});
const localVoidIds = envLocal.I.history().filter(r => r.refType === 'kitchen-void').map(r => r.id).sort();

const envRemote = makeIsolatedEnv(); // Empty ledger
await envRemote.C.reverseVoid({
  voidId: 'voi-shared-multi', orderId: 'ord-shared-1', itemId: 'item-deluxe-burger', qty: 1, isWaste: 0,
});
const remoteVoidIds = envRemote.I.history().filter(r => r.refType === 'kitchen-void').map(r => r.id).sort();

check('Control A: Local and remote empty ledger produce exactly identical void IDs',
  localVoidIds.length === 2 && remoteVoidIds.length === 2 && localVoidIds.join(',') === remoteVoidIds.join(','));

// 7b. Control B: Remote path fetches frozen cost from D1 before estimating
const d1StubFetch = async (url) => {
  if (url.includes('/api/inventory/movements') && url.includes('refId=ord-d1-sale')) {
    return {
      ok: true,
      json: async () => ({
        merchant: MERCHANT,
        movements: [
          {
            id: 'inv-sale-d1-1', itemId: 'patty-beef', qty: -1, reason: 'sale',
            unitCost: 92, refType: 'sale', refId: 'ord-d1-sale', occurredTs: t0,
            meta: { sourceItemId: 'item-deluxe-burger', line: 0, part: 0 },
          },
        ],
      }),
    };
  }
  return { ok: false, status: 404 };
};

const envD1 = makeIsolatedEnv(d1StubFetch);
await envD1.C.reverseVoid({
  voidId: 'voi-d1-001', orderId: 'ord-d1-sale', itemId: 'patty-beef', qty: 1, isWaste: 0,
});
const d1VoidMv = envD1.I.history('patty-beef').find(r => r.refType === 'kitchen-void');
check('Control B: D1 remote fetch gets frozen cost (92 MAD) instead of recipe rate (110 MAD)',
  d1VoidMv && d1VoidMv.unitCost === 92 && (!d1VoidMv.meta || d1VoidMv.meta.costSource !== 'recipe-estimate'));

// 7c. Control B fallback: Broken fetch falls back to recipe estimate and stamps meta.costSource
const brokenFetch = () => Promise.reject(new Error('D1 offline'));
const envFallback = makeIsolatedEnv(brokenFetch);
await envFallback.C.reverseVoid({
  voidId: 'voi-fb-001', orderId: 'ord-offline-sale', itemId: 'patty-beef', qty: 1, isWaste: 0,
});
const fbVoidMv = envFallback.I.history('patty-beef').find(r => r.refType === 'kitchen-void');
check('Control B fallback: Offline fetch stamps costSource recipe-estimate @ 110 MAD',
  fbVoidMv && fbVoidMv.unitCost === 110 && fbVoidMv.meta && fbVoidMv.meta.costSource === 'recipe-estimate');

// 8. Restaurant workflow with NO OrderPro: two staff tickets on one table.
const secondVisit = newSessionId();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
  VALUES (?, ?, '2', 'table', 'open', ?, ?)`, secondVisit, MERCHANT, now - 1000, now - 1000);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-old-kitchen', ?, 301, 'table', '2', 140, ?, 'accepted', ?, ?, ?)`,
  MERCHANT, JSON.stringify([{ id: 'item-burger', uid: 'uid-old', name: 'Burger', qty: 2, unitPrice: 70 }]),
  secondVisit, now - 900, now - 900);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-new-kitchen', ?, 302, 'table', '2', 70, ?, 'accepted', ?, ?, ?)`,
  MERCHANT, JSON.stringify([{ id: 'item-burger', uid: 'uid-new', name: 'Burger', qty: 1, unitPrice: 70 }]),
  secondVisit, now - 800, now - 800);
const olderLineVoid = await postQueue({ merchant: MERCHANT,
  voidLine: { table: '2', lineId: 'uid-old', itemId: 'item-burger', qty: 1, actor: 'Hamza' } }, employeeCookie);
check('Staff can cancel a sent line from the OLDER of two table tickets without OrderPro',
  olderLineVoid.status === 200 && olderLineVoid.data.orderId === 'ord-old-kitchen');
check('UID picks the older ticket even when both tickets contain the same product',
  JSON.parse(db._db.prepare("SELECT lines FROM orders WHERE id='ord-old-kitchen'").get().lines)[0].qty === 1
  && JSON.parse(db._db.prepare("SELECT lines FROM orders WHERE id='ord-new-kitchen'").get().lines)[0].qty === 1);
const wholeVisit = await postQueue({ merchant: MERCHANT,
  cancelTable: { table: '2', expectedSession: secondVisit } }, employeeCookie);
check('Staff cancels the whole unpaid visit including both kitchen tickets',
  wholeVisit.status === 200 && wholeVisit.data.ordersCancelled === 2);
check('Cancelled visit closes with neither order marked paid',
  db._db.prepare("SELECT COUNT(*) AS n FROM orders WHERE session_id=? AND status='rejected' AND paid_ts IS NULL").get(secondVisit).n === 2
  && db._db.prepare('SELECT status FROM table_sessions WHERE id=?').get(secondVisit).status === 'closed');
check('Every remaining kitchen line gets an auditable cancellation',
  db._db.prepare("SELECT COUNT(*) AS n FROM kitchen_voids WHERE order_id IN ('ord-old-kitchen','ord-new-kitchen') AND reason='table_cancelled'").get().n === 2);
const staleVisit = await postQueue({ merchant: MERCHANT,
  cancelTable: { table: '2', expectedSession: secondVisit } }, employeeCookie);
check('Old tablet cannot cancel the next party after this visit closes',
  staleVisit.status === 409 && staleVisit.data.error === 'stale-table-visit');

const partiallyPaidVisit = newSessionId();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
  VALUES (?, ?, '2', 'table', 'open', ?, ?)`, partiallyPaidVisit, MERCHANT, now, now);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, paid_ts, created_ts, updated_ts)
  VALUES ('ord-paid-part', ?, 303, 'table', '2', 70, ?, 'served', ?, ?, ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-burger', uid: 'uid-paid-part', name: 'Burger', qty: 1, unitPrice: 70 }]),
  partiallyPaidVisit, now, now, now);
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-due-part', ?, 304, 'table', '2', 70, ?, 'accepted', ?, ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-burger', uid: 'uid-due-part', name: 'Burger', qty: 1, unitPrice: 70 }]),
  partiallyPaidVisit, now, now);
const partialCancel = await postQueue({ merchant: MERCHANT,
  cancelTable: { table: '2', expectedSession: partiallyPaidVisit } }, employeeCookie);
check('Partly paid visits refuse whole-table cancellation and require refund workflow',
  partialCancel.status === 409 && partialCancel.data.error === 'partially-paid-requires-refund');
check('A rejected whole-table cancellation preserves the unpaid order and open visit',
  db._db.prepare("SELECT status FROM orders WHERE id='ord-due-part'").get().status === 'accepted'
  && db._db.prepare('SELECT status FROM table_sessions WHERE id=?').get(partiallyPaidVisit).status === 'open');

exec("UPDATE table_sessions SET status='closed', closed_ts=? WHERE id=?", now, partiallyPaidVisit);
const mixedStateVisit = newSessionId();
exec(`INSERT INTO table_sessions (id, merchant, table_no, mode, status, opened_ts, seen_ts)
  VALUES (?, ?, '2', 'table', 'open', ?, ?)`, mixedStateVisit, MERCHANT, now, now);
for (const [id, status] of [['ord-mixed-live', 'accepted'], ['ord-mixed-unknown', 'held']]) {
  exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
    VALUES (?, ?, 306, 'table', '2', 70, ?, ?, ?, ?, ?)`, id, MERCHANT,
    JSON.stringify([{ id: 'item-burger', name: 'Burger', qty: 1, unitPrice: 70 }]), status,
    mixedStateVisit, now, now);
}
const mixedCancel = await postQueue({ merchant: MERCHANT,
  cancelTable: { table: '2', expectedSession: mixedStateVisit } }, employeeCookie);
check('Unsupported ticket state refuses whole-table cancellation before changing any ticket',
  mixedCancel.status === 409 && mixedCancel.data.error === 'unsupported-order-state'
  && db._db.prepare("SELECT status FROM orders WHERE id='ord-mixed-live'").get().status === 'accepted'
  && db._db.prepare('SELECT status FROM table_sessions WHERE id=?').get(mixedStateVisit).status === 'open');
const kitchenSource = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
check('Kitchen retains a served ticket while its line-cancellation alert needs a decision',
  /o\.status === 'served' && !\(o\.lines \|\| \[\]\)\.some\(function \(line\) \{ return line && line\.voidAlert; \}\)/.test(kitchenSource));

exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-one-cancel', ?, 305, 'table', '1', 45, ?, 'accepted', 'ses-v1', ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-soup', uid: 'uid-one-cancel', name: 'Soupe', qty: 1, unitPrice: 45 }]), now, now);
const tillCookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;
const oneOrderCancel = await postQueue({ merchant: MERCHANT, id: 'ord-one-cancel',
  status: 'rejected', server: 'Caisse' }, tillCookie);
check('Caisse can cancel one sent kitchen order without closing the table',
  oneOrderCancel.status === 200 && oneOrderCancel.data.status === 'rejected'
  && db._db.prepare("SELECT status FROM orders WHERE id='ord-one-cancel'").get().status === 'rejected'
  && db._db.prepare("SELECT status FROM table_sessions WHERE id='ses-v1'").get().status === 'open');
check('Single-order cancellation leaves an immutable kitchen cancellation trace',
  db._db.prepare("SELECT COUNT(*) AS n FROM kitchen_voids WHERE order_id='ord-one-cancel' AND reason='order_rejected' AND status='approved'").get().n === 1);

/* The live D1 table was created by the first migration, where table_no is
 * NOT NULL. Keep the behavioural suite production-shaped even though a fresh
 * schema now permits NULL. */
exec(`CREATE TRIGGER legacy_kitchen_void_table_no
  BEFORE INSERT ON kitchen_voids WHEN NEW.table_no IS NULL
  BEGIN SELECT RAISE(ABORT, 'NOT NULL constraint failed: kitchen_voids.table_no'); END`);

// A paired cashier may still have a service cookie from the same browser.
// The employee floor restriction must not override the verified till identity.
exec(`INSERT INTO orders (id, merchant, number, mode, total, lines, status, created_ts, updated_ts)
  VALUES ('ord-shared-tablet', ?, 307, 'takeout', 55, ?, 'accepted', ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-coffee', uid: 'uid-shared-tablet', name: 'Café', qty: 1, unitPrice: 55 }]), now, now);
const takeawayVoid = { merchant: MERCHANT, voidLine: {
  orderId: 'ord-shared-tablet', lineId: 'uid-shared-tablet', reason: 'client_change', qty: 1 } };
const serviceOnlyVoid = await postQueue(takeawayVoid, employeeCookie);
check('Service cookie alone cannot void a table-less takeaway', serviceOnlyVoid.status === 403);
const sharedTabletVoid = await postQueue(takeawayVoid, `${employeeCookie}; ${tillCookie}`);
check('Paired till can void takeaway despite a lingering service cookie',
  sharedTabletVoid.status === 200 && sharedTabletVoid.data.directVoid
  && db._db.prepare("SELECT total FROM orders WHERE id='ord-shared-tablet'").get().total === 0);

exec(`INSERT INTO orders (id, merchant, number, mode, total, lines, status, created_ts, updated_ts)
  VALUES ('ord-takeaway-cancel', ?, 312, 'takeout', 35, ?, 'ready', ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-dessert', uid: 'uid-takeaway-cancel', name: 'Dessert', qty: 1, unitPrice: 35 }]), now, now);
const takeawayProof = await tillActorProof(AUTH_SECRET, MERCHANT,
  { id: 'test-cashier', name: 'Test cashier', role: 'Caissier' });
const takeawayCancel = await postQueue({ merchant: MERCHANT, actorProof: takeawayProof,
  id: 'ord-takeaway-cancel', status: 'rejected', server: 'Caisse' }, tillCookie);
check('Whole takeaway cancellation works against the legacy NOT NULL audit schema',
  takeawayCancel.status === 200 && takeawayCancel.data.status === 'rejected'
  && db._db.prepare("SELECT table_no FROM kitchen_voids WHERE order_id='ord-takeaway-cancel'").get()?.table_no === '');

exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-multi-alert', ?, 308, 'table', '1', 130, ?, 'accepted', 'ses-v1', ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-a', uid: 'uid-a', name: 'A', qty: 1, unitPrice: 60, stationAccepted: true },
    { id: 'item-b', uid: 'uid-b', name: 'B', qty: 1, unitPrice: 70, stationAccepted: true }]), now, now);
for (const lineId of ['uid-a', 'uid-b']) {
  const alerted = await postQueue({ merchant: MERCHANT,
    voidLine: { orderId: 'ord-multi-alert', table: '1', lineId,
      reason: lineId === 'uid-b' ? 'kitchen_waste' : 'client_change', isWaste: lineId === 'uid-b' ? 1 : 0 } }, employeeCookie);
  check(`Cooking ${lineId} receives an alert`, alerted.status === 200 && alerted.data.alertSent);
}
const multiAck = await postQueue({ merchant: MERCHANT,
  ackVoid: { orderId: 'ord-multi-alert', action: 'accept' } }, employeeCookie);
check('Kitchen confirmation removes both pending items and their balance',
  multiAck.status === 200 && multiAck.data.lines.length === 0 && multiAck.data.total === 0);
check('Every kitchen void audit is approved, not only the last one',
  db._db.prepare("SELECT COUNT(*) AS n FROM kitchen_voids WHERE order_id='ord-multi-alert' AND status='approved'").get().n === 2);
check('Chef response preserves each item waste flag for stock accounting',
  multiAck.data.voids.length === 2 && multiAck.data.voids[0].isWaste === 0
  && multiAck.data.voids[1].isWaste === 1 && multiAck.data.voids[0].voidId !== multiAck.data.voids[1].voidId);
const replayAck = await postQueue({ merchant: MERCHANT,
  ackVoid: { orderId: 'ord-multi-alert', action: 'accept' } }, employeeCookie);
check('Repeat kitchen acknowledgement cannot create a second cancellation',
  replayAck.status === 409 && replayAck.data.error === 'no-pending-kitchen-void');

exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, paid_ts, created_ts, updated_ts)
  VALUES ('ord-paid-alert', ?, 309, 'table', '1', 50, ?, 'served', 'ses-v1', ?, ?, ?)`, MERCHANT,
  JSON.stringify([{ id: 'item-paid', uid: 'uid-paid', qty: 1, unitPrice: 50, voidAlert: { id: 'voi-paid', qty: 1 } }]), now, now, now);
const paidAck = await postQueue({ merchant: MERCHANT,
  ackVoid: { orderId: 'ord-paid-alert', action: 'accept' } }, employeeCookie);
check('Paid bill cannot be voided by a late kitchen acknowledgement',
  paidAck.status === 404 && db._db.prepare("SELECT total FROM orders WHERE id='ord-paid-alert'").get().total === 50);

// Regression: an authorised till must not wait for a kitchen-screen approval.
const proof = await tillActorProof(AUTH_SECRET, MERCHANT, { id: 'test-cashier', name: 'Test cashier', role: 'Caissier' });
const immediateLines = [
  { id: 'shawarma', uid: 'uid-cancel-a', name: 'Shawarma', qty: 2, unitPrice: 25, stationAccepted: true },
  { id: 'shawarma', uid: 'uid-cancel-b', name: 'Shawarma sans sauce', qty: 1, unitPrice: 25, stationAccepted: true },
];
exec(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, session_id, created_ts, updated_ts)
  VALUES ('ord-immediate', ?, 310, 'table', '1', 75, ?, 'accepted', 'ses-v1', ?, ?)`, MERCHANT, JSON.stringify(immediateLines), now, now);
const immediateBody = { merchant: MERCHANT, actorProof: proof, voidLine: {
  orderId: 'ord-immediate', lineId: 'uid-cancel-a', itemId: 'shawarma', qty: 1,
  immediate: true, requestId: 'voi-test-immediate-0001', reason: 'client_change · erreur client', actor: 'Spoofed' } };
const unproved = await postQueue({ ...immediateBody, actorProof: undefined }, tillCookie);
check('Immediate item cancellation requires a verified operator', unproved.status === 403);
const immediateResult = await postQueue(immediateBody, tillCookie);
check('Cashier cancels a cooking item immediately, without a kitchen approval', immediateResult.status === 200
  && immediateResult.data.directVoid && !immediateResult.data.alertSent && immediateResult.data.total === 50);
check('Only the selected UID loses a unit', immediateResult.data.remainingLines?.every(l => l.qty === 1));
check('Immediate cancellation records the verified cashier and typed reason',
  db._db.prepare('SELECT actor, reason FROM kitchen_voids WHERE id=?').get(immediateBody.voidLine.requestId)?.actor === 'Test cashier');
const repeatImmediate = await postQueue(immediateBody, tillCookie);
check('Lost-response retry does not cancel another unit', repeatImmediate.data.replayed && repeatImmediate.data.total === 50);
const staleUid = await postQueue({ ...immediateBody, voidLine: { ...immediateBody.voidLine,
  requestId: 'voi-test-stale-uid-0001', lineId: 'uid-missing' } }, tillCookie);
check('Stale UID never falls back to another variant of the product', staleUid.status === 404);
await postQueue({ merchant: MERCHANT, voidLine: { orderId: 'ord-immediate', lineId: 'uid-cancel-b', qty: 1 } }, tillCookie);
const finishPending = await postQueue({ ...immediateBody, voidLine: { ...immediateBody.voidLine,
  requestId: 'voi-test-finish-pending-0001', lineId: 'uid-cancel-b' } }, tillCookie);
check('Cashier can finish a previously stuck kitchen request', finishPending.data.directVoid && finishPending.data.total === 25);
check('Replaced kitchen approval is no longer pending',
  db._db.prepare("SELECT COUNT(*) n FROM kitchen_voids WHERE order_id='ord-immediate' AND status='pending'").get().n === 0);
// Payment racing between the read and the atomic write must win safely.
const originalBatch = db.batch;
db.batch = async statements => {
  exec("UPDATE orders SET paid_ts=? WHERE id='ord-immediate'", now);
  return originalBatch(statements);
};
const racedVoid = await postQueue({ ...immediateBody, voidLine: { ...immediateBody.voidLine,
  requestId: 'voi-test-payment-race-0001' } }, tillCookie);
db.batch = originalBatch;
check('Racing payment preserves the paid bill', racedVoid.status === 409
  && db._db.prepare("SELECT total FROM orders WHERE id='ord-immediate'").get().total === 25);
check('Racing payment leaves no false cancellation audit',
  !db._db.prepare("SELECT id FROM kitchen_voids WHERE id='voi-test-payment-race-0001'").get());

const formulaVoidLines = [
  { id: 'menu', uid: 'f-parent', name: 'Menu', kind: 'formula', formulaUid: 'f-test', qty: 2, unitPrice: 40, stationAccepted: true },
  { id: 'drink', uid: 'f-child', name: 'Boisson', kind: 'formula-part', formulaUid: 'f-test', qty: 2, unitPrice: 0, stationAccepted: true },
  { id: 'drink', uid: 'f-other', name: 'Boisson seule', qty: 1, unitPrice: 10 },
];
exec(`INSERT INTO orders (id, merchant, number, mode, total, lines, status, created_ts, updated_ts)
  VALUES ('ord-formula-immediate', ?, 311, 'takeout', 90, ?, 'ready', ?, ?)`, MERCHANT, JSON.stringify(formulaVoidLines), now, now);
const formulaBody = { ...immediateBody, voidLine: { ...immediateBody.voidLine, orderId: 'ord-formula-immediate',
  lineId: 'f-parent', itemId: 'menu', isWaste: 1, requestId: 'voi-formula-immediate-0001' } };
const formulaImmediate = await postQueue(formulaBody, tillCookie);
check('One ready formula cancels with its components, keeping standalone drinks', formulaImmediate.data.total === 50
  && formulaImmediate.data.remainingLines?.every(l => l.qty === 1));
check('Each formula component has exactly one approved waste audit',
  db._db.prepare("SELECT COUNT(*) n FROM kitchen_voids WHERE order_id='ord-formula-immediate' AND qty=1 AND is_waste=1 AND status='approved'").get().n === 2);
exec("CREATE TRIGGER fail_void_audit BEFORE INSERT ON kitchen_voids BEGIN SELECT RAISE(ABORT, 'test audit unavailable'); END");
const auditFailure = await postQueue({ ...formulaBody, voidLine: { ...formulaBody.voidLine, requestId: 'voi-audit-failure-0001' } }, tillCookie);
exec('DROP TRIGGER fail_void_audit');
check('Audit failure rolls back the bill instead of silently removing food', auditFailure.status === 503
  && db._db.prepare("SELECT total FROM orders WHERE id='ord-formula-immediate'").get().total === 50);

const cashierSource = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const relaySource = fs.readFileSync(path.join(ROOT, 'assets', 'kitchen-relay.js'), 'utf8');
check('Cashier and server cancellation calls are bounded instead of freezing indefinitely',
  cashierSource.includes('async function postCaisseCancellation')
  && fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8').includes('async function postServiceCancellation'));
check('Kitchen acknowledgement waits for authoritative server lines and has a timeout',
  kitchenSource.includes('if (!result || !result.ok || !Array.isArray(result.lines))')
  && relaySource.includes('controller.abort(); }, 12000)')
  && relaySource.includes('entries.forEach(function (entry)'));

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All kitchen void protocol behavioural checks green.\n`);
process.exitCode = failures ? 1 : 0;
