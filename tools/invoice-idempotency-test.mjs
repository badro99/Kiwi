#!/usr/bin/env node
import { migrated } from './fixtures/migrated-tables.cjs';
/* Invoicing idempotency (r19 invoices#B0, #B1). A write whose reply was lost is retried by the
 * merchant ("peut-être enregistré", decision of 4 November); the retry must not book a second
 * payment or open a second draft. The client mints one key per write intent; the server derives
 * the row id from (merchant, key), so the primary key is the dedupe. Real routes, schema.sql
 * migrations on node:sqlite, no browser. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const lib = await import('../functions/auth/_lib.js');
const invoices = await import('../functions/api/invoices.js');

const SECRET = 'invoice-idempotency-secret-0123456789', SHOP = 'idem-shop', now = Date.now();
const db = new DatabaseSync(':memory:');
migrated(db);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-a','a@idem.test','Idem Shop','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','boutique','acc-a','Idem Shop','active',0,?)`).run(SHOP, now);
db.prepare(`INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'business',?,1,?)`).run(SHOP, JSON.stringify({ name: 'Idem Shop', legal: { legalName: 'IDEM SARL', address: '1 rue A', city: 'Casablanca', ice: '001234567000062' } }), now);
const env = { AUTH_SECRET: SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    const bound = (p) => ({
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: Number(r.changes) }, success: true }; },
    });
    return Object.assign(bound([]), { bind: (...p) => bound(p) });
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
} };
const owner = lib.sessionCookie(await lib.makeSession('acc-a', SECRET)).split(';')[0];
let ip = 10;
async function post(body) {
  const request = new Request('https://kiwi-os.com/api/invoices', {
    method: 'POST', headers: { Cookie: owner, 'CF-Connecting-IP': `10.9.0.${ip++ % 250}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: SHOP, ...body }),
  });
  const res = await invoices.onRequestPost({ request, env });
  const parsed = await res.json().catch(() => null);
  return { status: res.status, json: parsed };
}
const CUST = { name: 'SARL Atlas', address: '1 av. Hassan II', ice: '001234567000062', if: '987', email: 'achats@atlas.test', phone: '0600000000' };
const line = (description, unitHT) => ({ description, qty: 1, unitHT, vatRate: 20, discountPct: 0 });
const count = (sql, ...a) => db.prepare(sql).get(...a).n;
async function issued(label, unitHT) {
  const saved = await post({ action: 'save', type: 'invoice', customer: CUST, lines: [line(label, unitHT)] });
  return (await post({ action: 'issue', id: saved.json.doc.id })).json.doc;
}

// Payments
const inv = await issued('Prestation', 10000);
const KEY = 'pay-key-aaaaaaaa-0001';
let r = await post({ action: 'payment', id: inv.id, amountCents: 5000, method: 'cash', clientKey: KEY });
assert.equal(r.status, 200);
assert.equal(r.json.balanceCents, 7000, 'first send books the payment');
const first = r.json.payment.id;
r = await post({ action: 'payment', id: inv.id, amountCents: 5000, method: 'cash', clientKey: KEY });
assert.equal(r.status, 200, 'a retry after a lost reply is answered, not refused');
assert.equal(r.json.payment.id, first, 'the retry returns the payment already booked');
assert.equal(r.json.balanceCents, 7000, 'the balance did not move twice');
assert.equal(count('SELECT COUNT(*) n FROM invoice_payments WHERE doc_id = ?', inv.id), 1, 'one payment row');
r = await post({ action: 'payment', id: inv.id, amountCents: 5000, method: 'cash', clientKey: 'pay-key-aaaaaaaa-0002' });
assert.equal(r.json.balanceCents, 2000, 'another intent (another key) is booked');
const other = await issued('Autre', 10000);
r = await post({ action: 'payment', id: other.id, amountCents: 100, clientKey: KEY });
assert.deepEqual([r.status, r.json.error], [409, 'key-reused'], 'a key already used on another invoice is refused');
r = await post({ action: 'payment', id: inv.id, amountCents: 100, clientKey: 'short' });
assert.deepEqual([r.status, r.json.error], [400, 'invalid-clientKey'], 'a malformed key is refused');
const both = await Promise.all([1, 2].map(() => post({ action: 'payment', id: other.id, amountCents: 3000, clientKey: 'pay-key-concurrent-01' })));
assert.ok(both.every((x) => x.status === 200), 'two simultaneous sends of one key both answer');
assert.equal(count('SELECT COUNT(*) n FROM invoice_payments WHERE doc_id = ?', other.id), 1, 'and book once');

// Drafts
const body = { action: 'save', type: 'invoice', customer: CUST, lines: [line('Brouillon', 100)], clientKey: 'draft-key-bbbbbbbb-0001' };
const before = count('SELECT COUNT(*) n FROM invoice_docs');
const d1 = await post(body), d2 = await post(body);
assert.equal(d1.status, 200); assert.equal(d2.status, 200);
assert.equal(d2.json.doc.id, d1.json.doc.id, 'a draft created twice with one key is one document');
assert.equal(count('SELECT COUNT(*) n FROM invoice_docs'), before + 1, 'one draft more in the database');
const d3 = await post({ ...body, type: 'quote' });
assert.deepEqual([d3.status, d3.json.error], [409, 'key-reused'], 'the same key for another document type is refused');
const d4 = await post({ ...body, clientKey: undefined });
assert.notEqual(d4.json.doc.id, d1.json.doc.id, 'without a key every send still creates a draft (old clients)');
console.log('✓ invoice idempotency · a retried payment or draft lands on the row already written');
