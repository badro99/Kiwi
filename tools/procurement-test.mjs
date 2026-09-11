#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'assets/procurement.js'), 'utf8');
let pass = 0;
function ok(name, value) { if (!value) { console.error('  ✗ ' + name); process.exitCode = 1; } else pass++; }

let state = null; const movements = []; const costs = [];
const storeHandle = {
  get() { return state; },
  update(fn) { const next = fn(state); state = next === undefined ? state : next; return state; },
};
const window = {
  KiwiConfig: { plan: 'basic' },
  KiwiVenue: { getPlan() { return window.KiwiConfig.plan; } },
  KiwiStore: { define(_name, opts) { state = opts.blank(); return storeHandle; } },
  KiwiInventory: { add(m) { movements.push(m); return m; } },
  KiwiCost: { setItemCost(id, cost, by) { costs.push({ id, cost, by }); } },
};
window.window = window;
vm.runInContext(src, vm.createContext({ window, console, Date, Math, Map, Set, String, Number, Object, Array }), { filename: 'procurement.js' });
const P = window.KiwiProcurement;
const supplier = P.addSupplier({ name: 'Coopérative Atlas', phone: '0600000000', leadDays: 2 });
ok('basic tier owns a real supplier directory', supplier && P.doc().suppliers.length === 1);
ok('basic cannot create Ultra purchase orders', P.createOrder({ supplierId: supplier.id, lines: [{ itemId: 'flour', qty: 2 }] }).error === 'ultra-required');
const direct = P.receiveDirect({ supplierId: supplier.id, externalRef: 'BL-7', lines: [{ itemId: 'flour', name: 'Farine', qty: 5.5, unit: 'kg', unitCost: 8 }] });
ok('basic direct receipt creates a goods-received document', direct.number.startsWith('BR-') && P.doc().receipts.length === 1);
ok('receipt writes stock truth and refreshes last cost', movements[0].qty === 5.5 && movements[0].reason === 'receipt' && costs[0].cost === 8);

window.KiwiConfig.plan = 'ultra';
const po = P.createOrder({ supplierId: supplier.id, expectedDate: '2026-08-15', lines: [{ itemId: 'flour', name: 'Farine', qty: 10, unit: 'kg', unitCost: 8 }] });
ok('Ultra creates an auditable draft PO number', po.number.startsWith('BC-') && po.status === 'draft');
P.markSent(po.id);
ok('PO follows draft to sent state', P.doc().orders[0].status === 'sent');
const grn1 = P.receiveOrder(po.id, { externalRef: 'BL-8A', lines: [{ itemId: 'flour', qty: 4, unit: 'kg', unitCost: 8 }] });
ok('partial delivery remains explicitly partial', grn1.id && P.doc().orders[0].status === 'partial' && P.doc().orders[0].lines[0].receivedQty === 4);
const grn2 = P.receiveOrder(po.id, { externalRef: 'BL-8B', lines: [{ itemId: 'flour', qty: 6, unit: 'kg', unitCost: 8 }] });
ok('remaining delivery closes PO as received', grn2.id && P.doc().orders[0].status === 'received');
const bad = P.attachInvoice({ supplierId: supplier.id, orderId: po.id, receiptId: grn2.id, number: 'FA-8', lines: [{ itemId: 'flour', qty: 7, unit: 'kg', unitCost: 9 }] });
ok('three-way match exposes price and quantity exceptions', bad.match && !bad.match.ok && bad.match.issues.some(x => x.type === 'price') && bad.match.issues.some(x => x.type === 'quantity'));
ok('supplier message is generated from the actual PO lines', P.message(po.id).includes(po.number) && P.message(po.id).includes('Farine'));

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ procurement (${pass} controls: Basic receipts, Ultra PO lifecycle, ledger posting, three-way matching)`);
