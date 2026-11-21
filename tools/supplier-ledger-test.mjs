#!/usr/bin/env node
/* Fournisseurs et grand livre d'argent signé (functions/api/_ledger.js,
 * functions/api/_suppliers.js, functions/api/suppliers/*, functions/api/cashbook.js,
 * et le branchement des bons de commande dans functions/api/operations.js).
 *
 * Contre le vrai schéma (schema.sql) dans node:sqlite :
 *   · convention de signe : in = le commerçant reçoit, out = il donne ;
 *     solde > 0 = il doit au fournisseur, < 0 = le client lui doit ;
 *   · idempotence : une clé rejouée n'écrit pas deux fois, une clé réutilisée
 *     pour autre chose est refusée ;
 *   · lignes archivées hors des soldes ;
 *   · bon de commande : réception = dette, retour et paiement la réduisent,
 *     rejeu de la commande opérationnelle sans double écriture ;
 *   · cloisonnement : un autre commerçant, une caisse, un employé (gérant
 *     compris), la session du patron rouverte par un gérant, un anonyme ne
 *     lisent ni n'écrivent rien ;
 *   · import du document `procurement`, dépenses liées, livre de caisse,
 *     ancienneté 0–30 / 31–60 / 61–90 / 90+, tableau du fournisseur. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importFresh = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { applySchema } = await importFresh('tools/d1-migrations.mjs');
const L = await importFresh('functions/api/_ledger.js');
const SUP = await importFresh('functions/api/_suppliers.js');
const listRoute = await importFresh('functions/api/suppliers/index.js');
const statementRoute = await importFresh('functions/api/suppliers/statement.js');
const entryRoute = await importFresh('functions/api/suppliers/entry.js');
const expenseRoute = await importFresh('functions/api/suppliers/expense.js');
const scorecardRoute = await importFresh('functions/api/suppliers/scorecard.js');
const cashRoute = await importFresh('functions/api/cashbook.js');
const ops = await importFresh('functions/api/operations.js');
const { makeSession, sessionCookie, tillToken, employeeToken, employeeCookie, operatorToken, operatorIdToken, DEMO_MERCHANTS } = await importFresh('functions/auth/_lib.js');

const SECRET = 'supplier-ledger-secret-0123456789ab';
const SHOP = 'atlas-bench';
const OTHER = 'other-bench';
assert.ok(!DEMO_MERCHANTS[SHOP] && !DEMO_MERCHANTS[OTHER], 'bench stores must not be demo slugs');
const now = Date.now();

const db = new DatabaseSync(':memory:');
applySchema(db);
const D1 = {
  prepare(sql) {
    const params = [];
    const st = {
      bind(...a) { params.push(...a); return st; },
      async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async first() { const r = db.prepare(sql).get(...params); return r === undefined ? null : r; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
    };
    return st;
  },
  async batch(list) {
    db.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB: D1, AUTH_SECRET: SECRET };

const acc = db.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status) VALUES (?, ?, ?, 's', 'h', ?, 'active')`);
acc.run('acc-1', 'o@atlas.ma', 'Atlas Bench', now);
acc.run('acc-2', 'x@other.ma', 'Other Bench', now);
const cfg = db.prepare(`INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, status, updated_ts) VALUES (?, '{}', 'pro', 'boutique', ?, ?, 'active', ?)`);
cfg.run(SHOP, 'acc-1', 'Atlas Bench', now);
cfg.run(OTHER, 'acc-2', 'Other Bench', now);
db.prepare(`INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('op-1', 'Support', '', '', 1)`).run();
db.prepare(`INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'team', ?, 1, ?)`)
  .run(SHOP, JSON.stringify({ members: [{ id: 'm1', name: 'Saad', function: 'Caissier' }, { id: 'm2', name: 'Mehdi', function: 'Gérant' }, { id: 'm3', name: 'Yassine', function: 'Magasinier' }] }), now);

const owner = sessionCookie(await makeSession('acc-1', SECRET));
const stranger = sessionCookie(await makeSession('acc-2', SECRET));
const SID_MGR = 'c'.repeat(32);
db.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?, ?, ?, ?, ?)').run(SID_MGR, 'acc-1', 'manager', 'm2', now);
const ownerAsManager = sessionCookie(await makeSession('acc-1', SECRET, 0, SID_MGR));
const till = `kiwi_till=${await tillToken(SECRET, SHOP)}`;
const cashier = employeeCookie(await employeeToken(SECRET, { merchant: SHOP, staffId: 'm1' }));
const manager = employeeCookie(await employeeToken(SECRET, { merchant: SHOP, staffId: 'm2' }));
const storekeeper = employeeCookie(await employeeToken(SECRET, { merchant: SHOP, staffId: 'm3' }));
/* Un employé agit depuis la caisse appairée : son badge + le cookie du poste. */
const storekeeperAtTill = storekeeper + '; ' + till;
const operator = `kiwi_op=${await operatorToken(SECRET)}; kiwi_op_id=${await operatorIdToken(SECRET, 'op-1')}`;

const req = (url, cookie, body) => new Request('https://k' + url, {
  method: body ? 'POST' : 'GET',
  headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '10.0.0.7' },
  body: body ? JSON.stringify(body) : undefined,
});
const call = async (fn, url, cookie, body) => { const r = await fn({ request: req(url, cookie, body), env }); return { status: r.status, data: await r.json() }; };
let n = 0;
const ok = (name) => { n++; console.log('  ✓ ' + name); };

/* ── 1 · convention de signe et soldes ─────────────────────────────── */
{
  const a = await L.postLedgerEntry(env, SHOP, { idemKey: 't:sup:1', amountCents: 450000, direction: 'in', partyType: 'supplier', partyId: 'sup-x', kind: 'purchase', date: '2026-11-01' });
  assert.ok(a.ok && !a.duplicate);
  const b = await L.postLedgerEntry(env, SHOP, { idemKey: 't:sup:2', amountCents: 200000, direction: 'out', partyType: 'supplier', partyId: 'sup-x', kind: 'payment', method: 'transfer', date: '2026-11-05' });
  assert.ok(b.ok);
  const bal = await L.partyBalance(env, SHOP, 'supplier', 'sup-x');
  assert.equal(bal.balanceCents, 250000, 'received 4 500, paid 2 000: we owe 2 500');
  assert.deepEqual(L.owedView('supplier', bal.balanceCents), { who: 'merchant', cents: 250000 });
  await L.postLedgerEntry(env, SHOP, { idemKey: 't:cus:1', amountCents: 30000, direction: 'out', partyType: 'customer', partyId: 'cli-1', kind: 'sale-credit' });
  const cus = await L.partyBalance(env, SHOP, 'customer', 'cli-1');
  assert.equal(cus.balanceCents, -30000, 'sold on credit: customer owes us, balance negative');
  assert.deepEqual(L.owedView('customer', cus.balanceCents), { who: 'party', cents: 30000 });
  ok('sign convention: in = merchant received, out = merchant gave; supplier +, customer debt −');
}

/* ── 2 · validation et idempotence ─────────────────────────────────── */
{
  for (const [bad, err] of [[{ amountCents: 0 }, 'bad-amount'], [{ amountCents: -5 }, 'bad-amount'], [{ amountCents: 12.5 }, 'bad-amount'], [{ direction: 'up' }, 'bad-direction'], [{ partyType: 'bank' }, 'bad-party'], [{ partyId: '' }, 'bad-party'], [{ date: '2026-02-30' }, 'bad-date'], [{ idemKey: '' }, 'bad-idem']]) {
    const r = await L.postLedgerEntry(env, SHOP, { idemKey: 't:v', amountCents: 100, direction: 'in', partyType: 'supplier', partyId: 'sup-v', ...bad });
    assert.equal(r.error, err, JSON.stringify(bad));
  }
  const first = await L.postLedgerEntry(env, SHOP, { idemKey: 't:idem', amountCents: 1000, direction: 'in', partyType: 'supplier', partyId: 'sup-i' });
  const again = await L.postLedgerEntry(env, SHOP, { idemKey: 't:idem', amountCents: 1000, direction: 'in', partyType: 'supplier', partyId: 'sup-i' });
  assert.ok(first.ok && !first.duplicate && again.ok && again.duplicate && again.entry.id === first.entry.id);
  const clash = await L.postLedgerEntry(env, SHOP, { idemKey: 't:idem', amountCents: 9999, direction: 'in', partyType: 'supplier', partyId: 'sup-i' });
  assert.equal(clash.error, 'idempotency-conflict');
  const otherShop = await L.postLedgerEntry(env, OTHER, { idemKey: 't:idem', amountCents: 9999, direction: 'in', partyType: 'supplier', partyId: 'sup-i' });
  assert.ok(otherShop.ok && !otherShop.duplicate, 'the same key in another shop is another line');
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-i')).balanceCents, 1000);
  assert.equal((await L.partyBalance(env, OTHER, 'supplier', 'sup-i')).balanceCents, 9999);
  ok('idempotent posting: replay = one row, reused key refused, keys scoped per merchant');
}

/* ── 3 · archivées et internes hors des soldes ─────────────────────── */
{
  const p = await L.postLedgerEntry(env, SHOP, { idemKey: 't:arch:1', amountCents: 5000, direction: 'out', partyType: 'supplier', partyId: 'sup-x', kind: 'payment' });
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-x')).balanceCents, 245000);
  const ar = await L.archiveLedgerEntry(env, SHOP, p.entry.id, { by: 'Propriétaire' });
  assert.ok(ar.ok);
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-x')).balanceCents, 250000, 'archived payment leaves the balance');
  await L.postLedgerEntry(env, SHOP, { idemKey: 't:int:1', amountCents: 7000, direction: 'in', partyType: 'supplier', partyId: 'sup-x', internal: true });
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-x')).balanceCents, 250000, 'internal rows never count');
  const st = await L.partyStatement(env, SHOP, 'supplier', 'sup-x');
  assert.equal(st.lines.length, 2);
  assert.deepEqual(st.lines.map((l) => l.runningCents), [450000, 250000]);
  const tail = await L.partyStatement(env, SHOP, 'supplier', 'sup-x', { limit: 1 });
  assert.ok(tail.truncated && tail.openingCents === 450000 && tail.closingCents === 250000, 'opening = what precedes the first shown line');
  ok('archived and internal rows excluded from balance and statement; running balance and opening exact');
}

/* ── 4 · ancienneté FIFO ───────────────────────────────────────────── */
{
  const rows = [
    { party_id: 's', entry_date: '2026-07-01', created_at: 1, direction: 'in', amount_cents: 10000 },
    { party_id: 's', entry_date: '2026-09-15', created_at: 2, direction: 'in', amount_cents: 20000 },
    { party_id: 's', entry_date: '2026-11-10', created_at: 3, direction: 'in', amount_cents: 5000 },
    { party_id: 's', entry_date: '2026-11-12', created_at: 4, direction: 'out', amount_cents: 15000 },
  ];
  const age = L.ageBuckets(rows, 'supplier', '2026-11-21');
  /* 15 000 paid clears the July 10 000 then 5 000 of September: 15 000 left from 15 Sept (67 days), 5 000 from 10 Nov (11 days). */
  assert.deepEqual(age.buckets.map((b) => b.cents), [5000, 0, 15000, 0]);
  assert.equal(age.totalCents, 20000);
  assert.equal(age.oldestDays, 67);
  const cust = L.ageBuckets([{ party_id: 'c', entry_date: '2026-06-01', created_at: 1, direction: 'out', amount_cents: 8000 }], 'customer', '2026-11-21');
  assert.deepEqual(cust.buckets.map((b) => b.cents), [0, 0, 0, 8000], 'a customer debt is out, aged 90+');
  ok('ageing 0–30 / 31–60 / 61–90 / 90+ applies payments to the oldest debt first');
}

/* ── 5 · cloisonnement des routes ──────────────────────────────────── */
{
  const made = await call(listRoute.onRequestPost, '/api/suppliers', owner, { merchant: SHOP, action: 'create', id: 'sup-atlas-1', supplier: { name: 'Distrib Frais SARL', phone: '0661 23 45 67', ice: '001-525487-000045', rib: '011 780 0000123456789 01', termsDays: 30 } });
  assert.equal(made.status, 200);
  assert.equal(made.data.supplier.ice, '001525487000045', 'ICE keeps digits only');
  const list = await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, owner);
  assert.equal(list.status, 200);
  assert.ok(list.data.suppliers.some((s) => s.id === 'sup-atlas-1'));
  assert.equal((await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, operator)).status, 200, 'operator reads for support');
  for (const [who, c] of [['till', till], ['cashier', cashier], ['manager', manager], ['owner device unlocked by a manager', ownerAsManager], ['another merchant', stranger], ['anonymous', '']]) {
    const r = await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, c);
    assert.equal(r.status, 403, who + ' list');
    assert.ok(!JSON.stringify(r.data).includes('Distrib'), who + ' sees nothing');
    const s = await call(statementRoute.onRequestGet, `/api/suppliers/statement?merchant=${SHOP}&id=sup-atlas-1`, c);
    assert.equal(s.status, 403, who + ' statement');
    const w = await call(entryRoute.onRequestPost, '/api/suppliers/entry', c, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amountCents: 100, idemKey: 'evil-' + who.replace(/\W/g, '') });
    assert.equal(w.status, 403, who + ' write');
    const cb = await call(cashRoute.onRequestPost, '/api/cashbook', c, { merchant: SHOP, type: 'out', amountCents: 100, idemKey: 'evil-cash-0001' });
    assert.equal(cb.status, 403, who + ' cash book');
  }
  /* The other owner, on HIS shop, cannot reach a supplier id of ours. */
  const cross = await call(statementRoute.onRequestGet, `/api/suppliers/statement?merchant=${OTHER}&id=sup-atlas-1`, stranger);
  assert.equal(cross.status, 404);
  const crossPay = await call(entryRoute.onRequestPost, '/api/suppliers/entry', stranger, { merchant: OTHER, supplierId: 'sup-atlas-1', type: 'payment', amountCents: 100, idemKey: 'cross-pay-0001' });
  assert.equal(crossPay.status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM money_ledger WHERE idem_key LIKE 'sup:evil-%' OR idem_key LIKE 'cash:evil-%' OR idem_key = 'sup:cross-pay-0001'").get().n, 0);
  /* A suspended shop still reads its debts, but writes nothing. */
  db.prepare("UPDATE merchant_config SET status = 'suspended' WHERE merchant = ?").run(SHOP);
  assert.equal((await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, owner)).status, 200);
  assert.equal((await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amountCents: 100, idemKey: 'suspended-01' })).status, 403);
  db.prepare("UPDATE merchant_config SET status = 'active' WHERE merchant = ?").run(SHOP);
  ok('tenant isolation: owner + operator only; till, staff, manager, manager-unlocked owner, other merchant, anonymous refused; suspended shop read-only');
}

/* ── 6 · bon de commande : réception = dette, paiement et retour la réduisent ── */
const opsPost = async (cookie, id, action, payload, extra) => {
  const r = await ops.onRequestPost({ request: new Request('https://k/api/operations', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: SHOP, id, idempotencyKey: id, domain: 'procurement', action, payload, ...(extra || {}) }) }), env });
  return { status: r.status, data: await r.json() };
};
{
  const created = await opsPost(owner, 'op:po-lait-0001', 'create-po', { supplier: '  distrib frais sarl ', lines: [{ sku: 'LAIT-1L', label: 'Lait 1 L', qty: 100, unitPrice: 8.5 }, { sku: 'BEURRE', label: 'Beurre', qty: 20, unitPrice: 25 }] });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const number = created.data.command.result.number;
  assert.equal(created.data.command.result.supplierId, 'sup-atlas-1', 'a known name links the existing supplier');
  const po = db.prepare('SELECT * FROM purchase_orders WHERE merchant = ? AND number = ?').get(SHOP, number);
  assert.equal(po.supplier_id, 'sup-atlas-1');
  assert.equal(po.supplier, 'Distrib Frais SARL', 'the printed name is the supplier card name');

  const fresh = await opsPost(owner, 'op:po-new-00001', 'create-po', { supplier: 'Coopérative Souss', lines: [{ sku: 'ARGAN', qty: 2, unitPrice: 120 }] });
  const newId = fresh.data.command.result.supplierId;
  assert.ok(newId && db.prepare('SELECT name, source FROM suppliers WHERE merchant = ? AND id = ?').get(SHOP, newId).source === 'purchase-order', 'an unknown name creates the supplier card');
  const ghost = await opsPost(owner, 'op:po-ghost-001', 'create-po', { supplierId: 'sup-nope-404', lines: [{ sku: 'X', qty: 1, unitPrice: 1 }] });
  assert.equal(ghost.data.command.lastError, 'supplier-not-found');

  assert.equal((await opsPost(owner, 'op:po-lait-0002', 'submit-po', { po: number }, { confirmed: true })).status, 200);
  const before = (await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents;
  const recv = await opsPost(owner, 'op:po-lait-0003', 'receive-po', { po: number, lines: [{ sku: 'LAIT-1L', qty: 60 }] });
  assert.equal(recv.data.command.status, 'completed', JSON.stringify(recv.data));
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents - before, 51000, 'receiving 60 × 8.50 = we owe 510.00');
  const replay = await opsPost(owner, 'op:po-lait-0003', 'receive-po', { po: number, lines: [{ sku: 'LAIT-1L', qty: 60 }] });
  assert.ok(replay.data.duplicate, 'operations replay');
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents - before, 51000, 'a replayed receipt never double-posts');
  const line = db.prepare("SELECT * FROM money_ledger WHERE merchant = ? AND kind = 'purchase' AND party_id = 'sup-atlas-1'").get(SHOP);
  assert.equal(line.purchase_order_id, po.id);

  const ret = await opsPost(owner, 'op:po-lait-0004', 'supplier-return', { po: number, lines: [{ sku: 'LAIT-1L', qty: 4 }] }, { confirmed: true });
  assert.equal(ret.data.command.status, 'completed', JSON.stringify(ret.data));
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents - before, 51000 - 3400, 'a return reduces what we owe');

  const pay = await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amount: '300,00', method: 'cheque', note: 'Chèque 448812', idemKey: 'pay-lait-0001', po: number });
  assert.equal(pay.status, 200, JSON.stringify(pay.data));
  const payAgain = await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amount: '300,00', method: 'cheque', idemKey: 'pay-lait-0001', po: number });
  assert.ok(payAgain.data.duplicate, 'double click on Pay = one payment');
  assert.equal(pay.data.balance.balanceCents - before, 51000 - 3400 - 30000, 'a payment reduces what we owe');
  assert.equal(pay.data.entry.createdBy, 'Propriétaire', 'signed by the proven session, not the body');
  assert.equal(pay.data.entry.purchaseOrderId, po.id);
  assert.equal((await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amount: '0', idemKey: 'pay-zero-0001' })).status, 400);
  assert.equal((await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, supplierId: 'sup-atlas-1', type: 'payment', amount: '10', idemKey: '' })).status, 400);
  const voided = await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, action: 'archive', id: pay.data.entry.id });
  assert.equal(voided.status, 200);
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents - before, 51000 - 3400, 'a voided payment comes back as owed');

  /* A PO written before supplier cards (free-text supplier, no supplier_id) links itself by name on receipt. */
  db.prepare(`INSERT INTO purchase_orders (id, merchant, seq, number, supplier, status, currency, expected_date, total_cents, invoiced_cents, command_id, created_ts, updated_ts, supplier_id)
    VALUES ('legacy-po', ?, 99, 'BC-2026-000099', 'DISTRIB FRAIS SARL', 'submitted', 'MAD', '', 5000, 0, 'legacy-po', ?, ?, '')`).run(SHOP, now, now);
  db.prepare(`INSERT INTO purchase_order_lines (id, merchant, number, line_no, sku, label, qty, unit_cents, created_ts) VALUES ('legacy-po:0', ?, 'BC-2026-000099', 1, 'SUCRE', 'Sucre', 10, 500, ?)`).run(SHOP, now);
  await opsPost(owner, 'op:po-legacy-01', 'receive-po', { po: 'BC-2026-000099', lines: [{ sku: 'SUCRE', qty: 10 }] });
  assert.equal(db.prepare("SELECT supplier_id FROM purchase_orders WHERE id = 'legacy-po'").get().supplier_id, 'sup-atlas-1');
  ok('PO: name links the card (or creates one), receive → owed, return and payment reduce, replays never double-post, legacy free text links itself');

  const card = await call(scorecardRoute.onRequestGet, `/api/suppliers/scorecard?merchant=${SHOP}&id=sup-atlas-1`, owner);
  const sc = card.data.scorecard;
  assert.equal(sc.orderCount, 2);
  assert.equal(sc.orderedCents, 100 * 850 + 20 * 2500 + 5000);
  assert.equal(sc.receivedCents, 51000 + 5000);
  assert.equal(sc.notReceivedCents, sc.orderedCents - sc.receivedCents);
  assert.equal(sc.returnedCents, 3400);
  assert.equal(sc.unpaidCents, Math.max(0, sc.balanceCents));
  assert.ok(sc.receivedPct > 0 && sc.receivedPct < 100 && sc.returnRatePct > 0);
  ok('scorecard aggregated in SQL: ordered, received %, returned, unpaid, average order');
}

/* ── 7 · relevé, liste et ancienneté par fournisseur ───────────────── */
{
  const st = await call(statementRoute.onRequestGet, `/api/suppliers/statement?merchant=${SHOP}&id=sup-atlas-1`, owner);
  assert.equal(st.status, 200);
  const lines = st.data.statement.lines;
  assert.equal(lines[lines.length - 1].runningCents, st.data.balance.balanceCents, 'last running balance = balance');
  assert.ok(st.data.orders.length >= 1 && st.data.owed.who === 'merchant');
  const list = await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, owner);
  const row = list.data.suppliers.find((s) => s.id === 'sup-atlas-1');
  assert.equal(row.balanceCents, st.data.balance.balanceCents);
  assert.equal(row.ageing.totalCents, row.balanceCents, 'everything owed is aged');
  assert.ok(list.data.totals.weOweCents >= row.balanceCents);
  ok('statement running balance, list balances and ageing agree');
}

/* ── 8 · import du document procurement : identité seulement ─────────── */
{
  /* Le document est modifiable par un gérant ou une caisse : il propose des
     fournisseurs, jamais une dette, et ne réécrit jamais une fiche D1. */
  const balancesBefore = JSON.stringify(db.prepare("SELECT party_id, SUM(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END) AS b FROM money_ledger WHERE merchant = ? GROUP BY party_id ORDER BY party_id").all(SHOP));
  const linesBefore = db.prepare('SELECT COUNT(*) AS n FROM money_ledger').get().n;
  const doc = {
    suppliers: [{ id: 'sup-doc-77', name: 'Grossiste du Souk', phone: '0600000000', taxId: '002233', active: true, createdAt: 9e15, updatedAt: 9e15 },
      { id: 'sup-atlas-1', name: 'Hijacked name', phone: '0699999999', taxId: '999', active: false, updatedAt: 9e15 }],
    receipts: [{ id: 'grn-forged', number: 'BR-00002', supplierId: 'sup-atlas-1', lines: [{ qty: 1000, unitCost: 999 }], createdAt: 9e15, receivedAt: 9e15 },
      { id: 'grn-new', number: 'BR-00003', supplierId: 'sup-doc-77', lines: [{ qty: 5, unitCost: 8 }], createdAt: Date.now() + 5000 }],
    returns: [{ id: 'ret-forged', supplierId: 'sup-atlas-1', lines: [{ qty: 1, unitCost: 5000 }], createdAt: 9e15 }],
    orders: [], invoices: [], seq: 3,
  };
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'procurement', ?, 7, ?) ON CONFLICT (merchant, feature) DO UPDATE SET data = excluded.data, rev = 7")
    .run(SHOP, JSON.stringify(doc), now);
  const list = await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, owner);
  const imported = list.data.suppliers.find((s) => s.id === 'sup-doc-77');
  assert.ok(imported && imported.name === 'Grossiste du Souk' && imported.ice === '002233', 'doc supplier identity imported with its own id');
  assert.ok(imported.createdAt < 9e15 && imported.updatedAt < 9e15, 'client timestamps are not trusted');
  assert.equal(imported.balanceCents, 0, 'a receipt in the doc never becomes a debt');
  const kept = list.data.suppliers.find((s) => s.id === 'sup-atlas-1');
  assert.ok(kept && kept.name === 'Distrib Frais SARL' && kept.phone !== '0699999999' && kept.ice === '001525487000045' && !kept.archived, 'the doc never overwrites or archives a D1 card');
  await SUP.syncProcurement(env, SHOP, { force: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM money_ledger').get().n, linesBefore, 'import writes no ledger line');
  assert.equal(JSON.stringify(db.prepare("SELECT party_id, SUM(CASE WHEN direction='in' THEN amount_cents ELSE -amount_cents END) AS b FROM money_ledger WHERE merchant = ? GROUP BY party_id ORDER BY party_id").all(SHOP)), balancesBefore, 'no balance moved');
  const mirrored = JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'procurement'").get(SHOP).data);
  assert.ok(Array.isArray(mirrored.suppliers));
  ok('procurement doc: supplier identity imported once, never overwrites D1, never changes a balance');
}

/* ── 8b · réception par un employé : en attente jusqu'à l'accord du patron ── */
{
  const tillPo = await opsPost(till, 'op:po-till-0001', 'create-po', { supplier: 'Fournisseur Fantôme', lines: [{ sku: 'X', qty: 1, unitPrice: 1 }] });
  assert.equal(tillPo.status, 403, 'a paired till cannot create a purchase order');
  const ghost = await opsPost(storekeeperAtTill, 'op:po-stk-0001', 'create-po', { supplier: 'Fournisseur Fantôme', lines: [{ sku: 'X', qty: 1, unitPrice: 1 }] });
  assert.equal(ghost.status, 200, JSON.stringify(ghost.data));
  assert.equal(ghost.data.command.result.supplierId, '', 'staff cannot create a supplier card');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM suppliers WHERE merchant = ? AND name = 'Fournisseur Fantôme'").get(SHOP).n, 0);
  const linked = await opsPost(storekeeperAtTill, 'op:po-stk-0002', 'create-po', { supplier: 'Distrib Frais SARL', lines: [{ sku: 'FARINE', qty: 10, unitPrice: 12 }] });
  assert.equal(linked.data.command.result.supplierId, 'sup-atlas-1', 'staff may link an existing card');
  const number = linked.data.command.result.number;
  await opsPost(storekeeperAtTill, 'op:po-stk-0003', 'submit-po', { po: number }, { confirmed: true });
  const before = (await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents;
  const recv = await opsPost(storekeeperAtTill, 'op:po-stk-0004', 'receive-po', { po: number, lines: [{ sku: 'FARINE', qty: 10 }] });
  assert.equal(recv.data.command.status, 'completed', JSON.stringify(recv.data));
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents, before, 'a staff receipt does not move the balance');
  const pend = await L.pendingEntries(env, SHOP, 'supplier', 'sup-atlas-1');
  assert.equal(pend.length, 1);
  assert.equal(pend[0].amountCents, 12000);
  const list = await call(listRoute.onRequestGet, `/api/suppliers?merchant=${SHOP}`, owner);
  assert.equal(list.data.suppliers.find((s) => s.id === 'sup-atlas-1').pending, 1, 'the list shows N pending');
  assert.ok(list.data.totals.pending >= 1);
  const st = await call(statementRoute.onRequestGet, `/api/suppliers/statement?merchant=${SHOP}&id=sup-atlas-1`, owner);
  assert.equal(st.data.pending.length, 1);
  assert.ok(!st.data.statement.lines.some((l) => l.id === pend[0].id), 'pending stays out of the statement');
  for (const [who, c] of [['storekeeper', storekeeper], ['storekeeper at the till', storekeeperAtTill], ['manager', manager], ['till', till]]) {
    const r = await call(entryRoute.onRequestPost, '/api/suppliers/entry', c, { merchant: SHOP, action: 'approve', id: pend[0].id });
    assert.equal(r.status, 403, who + ' cannot approve');
  }
  const ap = await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, action: 'approve', id: pend[0].id });
  assert.equal(ap.status, 200);
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents, before + 12000, 'approved: now we owe it');
  assert.equal((await L.pendingEntries(env, SHOP, 'supplier', 'sup-atlas-1')).length, 0);
  /* A rejected pending line never counts. */
  const ret = await opsPost(storekeeperAtTill, 'op:po-stk-0005', 'supplier-return', { po: number, lines: [{ sku: 'FARINE', qty: 2 }] }, { confirmed: true });
  assert.equal(ret.data.command.status, 'completed');
  const pr = (await L.pendingEntries(env, SHOP, 'supplier', 'sup-atlas-1'))[0];
  assert.ok(pr && pr.direction === 'out' && pr.amountCents === 2400);
  await call(entryRoute.onRequestPost, '/api/suppliers/entry', owner, { merchant: SHOP, action: 'archive', id: pr.id });
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-atlas-1')).balanceCents, before + 12000, 'rejected return never counts');
  ok('staff receive: cannot create a supplier, posts pending (no balance change) until the owner approves; till refused');
}

/* ── 9 · dépenses liées ────────────────────────────────────────────── */
{
  const base = { merchant: SHOP, expenseId: 'xp_bench01', supplier: 'grossiste du souk', amountCents: 25000, date: '2026-11-20', method: 'cash' };
  const docBalance = (await L.partyBalance(env, SHOP, 'supplier', 'sup-doc-77')).balanceCents;
  const v1 = await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, version: 100 });
  assert.ok(v1.data.linked && v1.data.supplierId === 'sup-doc-77', JSON.stringify(v1.data));
  const live = () => db.prepare("SELECT kind, amount_cents FROM money_ledger WHERE merchant = ? AND expense_id = 'xp_bench01' AND archived = 0 ORDER BY kind").all(SHOP);
  assert.deepEqual(live().map((r) => [r.kind, r.amount_cents]), [['expense', 25000], ['expense-payment', 25000]]);
  assert.equal((await L.partyBalance(env, SHOP, 'supplier', 'sup-doc-77')).balanceCents, docBalance, 'a paid expense leaves the balance unchanged');
  await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, version: 100 });
  assert.equal(live().length, 2, 'replay of the same version');
  await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, amountCents: 30000, version: 200 });
  assert.deepEqual(live().map((r) => r.amount_cents), [30000, 30000], 'an edit replaces the lines');
  const late = await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, version: 150 });
  assert.ok(late.data.stale);
  assert.deepEqual(live().map((r) => r.amount_cents), [30000, 30000], 'a late older version changes nothing');
  await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, supplier: 'Marjane', version: 300 });
  assert.equal(live().length, 0, 'an unknown supplier name unlinks, and creates no supplier');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM suppliers WHERE merchant = ? AND lower(name) = 'marjane'").get(SHOP).n, 0);
  await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, version: 400 });
  await call(expenseRoute.onRequestPost, '/api/suppliers/expense', owner, { ...base, version: 500, deleted: true });
  assert.equal(live().length, 0, 'a deleted expense removes its lines');
  assert.equal((await call(expenseRoute.onRequestPost, '/api/suppliers/expense', manager, { ...base, version: 600 })).status, 403);
  ok('expenses: known supplier posts bill + payment, edits replace, late versions ignored, unknown names and deletes unlink');
}

/* ── 10 · livre de caisse ──────────────────────────────────────────── */
{
  const a = await call(cashRoute.onRequestPost, '/api/cashbook', owner, { merchant: SHOP, type: 'in', amount: '5 000', note: 'Apport', idemKey: 'cash-in-0001' });
  const b = await call(cashRoute.onRequestPost, '/api/cashbook', owner, { merchant: SHOP, type: 'out', amountCents: 80000, note: 'Réparation frigo', idemKey: 'cash-out-001' });
  await call(cashRoute.onRequestPost, '/api/cashbook', owner, { merchant: SHOP, type: 'out', amountCents: 80000, idemKey: 'cash-out-001' });
  assert.equal(a.status, 200);
  assert.equal(b.data.balance.balanceCents, 500000 - 80000);
  const got = await call(cashRoute.onRequestGet, `/api/cashbook?merchant=${SHOP}`, owner);
  assert.deepEqual(got.data.statement.lines.map((l) => l.runningCents), [500000, 420000]);
  const notCash = await call(cashRoute.onRequestPost, '/api/cashbook', owner, { merchant: SHOP, action: 'archive', id: db.prepare("SELECT id FROM money_ledger WHERE party_type = 'supplier' LIMIT 1").get().id });
  assert.equal(notCash.status, 404, 'the cash book cannot void a supplier line');
  ok('cash book: in/out, replay-safe, running balance, cannot touch supplier lines');
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ supplier ledger (${n} groups)`);
