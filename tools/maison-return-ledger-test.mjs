import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as postSale } from '../functions/api/sale.js';
import { onRequestGet as getCredits, onRequestPost as postCredit } from '../functions/api/store-credits.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const merchant = 'amira-return-ledger';
const secret = 'amira-return-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: result.changes } }; },
      first() { return sqlite.prepare(sql).get(...values) || null; },
      all() { return { results: sqlite.prepare(sql).all(...values) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = statements.map((statement) => statement.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: secret };
sqlite.prepare(`INSERT INTO merchant_config (merchant,features,name,type,status,till_epoch,updated_ts)
  VALUES (?, '{}', 'Amira Maison', 'maison', 'active', 0, ?)`).run(merchant, Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); }

const saleResponse = await postSale({ env, request: new Request('https://kiwi.test/api/sale', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    id: 'sale-consigned-2001', merchant, amountCents: 0, amount: 0, method: 'card',
    settlementKind: 'consignment', ticketAmountCents: 120000, consignedAmountCents: 120000,
    label: 'Vase', ref: '2001', ts: Date.now(), lines: [{ itemId: 'vase-1', name: 'Vase', qty: 1, total: 1200 }],
  }),
}) });
ok(saleResponse.status === 200, 'a fully consigned ticket is durably accepted at zero owner revenue');
const sale = sqlite.prepare('SELECT amount_cents FROM sales WHERE merchant=? AND id=?').get(merchant, 'sale-consigned-2001');
const receipt = sqlite.prepare('SELECT gross_ticket_cents,consigned_cents FROM sale_receipts WHERE merchant=? AND sale_id=?').get(merchant, 'sale-consigned-2001');
ok(Number(sale.amount_cents) === 0, 'the receipt does not inflate merchant revenue');
ok(Number(receipt.gross_ticket_cents) === 120000 && Number(receipt.consigned_cents) === 120000,
  'the customer-facing gross receipt remains available for returns');

async function issue(id, cents) {
  const response = await postCredit({ env, request: new Request('https://kiwi.test/api/store-credits', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant, action: 'issue', id, originalSaleId: 'sale-consigned-2001', originalRef: '2001',
      amountCents: cents, customerId: 'amira-client', customerName: 'Amira Test', reason: 'Retour',
      lines: [{ name: 'Vase', qty: 1, unitCents: 120000 }], resellable: true }),
  }) });
  return { status: response.status, body: await response.json() };
}
let issued = await issue('credit-consigned-1', 120000);
ok(issued.status === 200 && issued.body.credit.balanceCents === 120000,
  'the full valid customer value can become store credit');
issued = await issue('credit-consigned-over', 1);
ok(issued.status === 409 && issued.body.error === 'sale-credit-exceeds-available',
  'a second issue cannot exceed the receipt after the first consumed its return value');

const listedResponse = await getCredits({ env, request: new Request(`https://kiwi.test/api/store-credits?merchant=${merchant}&customerId=amira-client`, { headers: { cookie } }) });
const listed = await listedResponse.json();
const credit = listed.credits[0];
ok(credit.events.length === 1 && credit.events[0].lines[0].name === 'Vase'
  && credit.events[0].actor === 'Caisse' && credit.originalRef === '2001',
  'customer history returns the original sale, products, employee, date and balance event');

sqlite.close();
console.log(`\n✓ ${checks} Maison return-ledger checks passed`);
