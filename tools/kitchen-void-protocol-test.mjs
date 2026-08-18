#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BEHAVIOURAL TEST: Kitchen Two-Tier Void Protocol & Waste Tracking
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

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

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All kitchen void protocol behavioural checks green.\n`);
process.exitCode = failures ? 1 : 0;
