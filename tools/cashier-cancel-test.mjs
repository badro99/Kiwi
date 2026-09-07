#!/usr/bin/env node
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/sale/cancel.js';
import { tillToken } from '../functions/auth/_lib.js';

const secret = 'cancel-test-secret';
const merchant = 'amira-cafe';

function db(pinWorks, role = 'Caisse') {
  const operations = [];
  return {
    operations,
    prepare(sql) {
      return {
        sql, args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('FROM staff_pins')) return pinWorks ? { id: 'staff-7', name: 'Sara', role } : null;
          if (sql.includes('FROM sales')) return {
            id: 'sale-42', amount: 250, method: 'cash', label: 'Vente', ref: '1042',
            ts: Date.now() - 60000, lines: '[{"n":"Jean noir","q":1,"t":250}]', void_ts: null,
          };
          return null;
        },
        async run() {
          operations.push({ sql, args: this.args });
          return { meta: { changes: 1 }, changes: 1, success: true };
        },
      };
    },
  };
}

{
  const database = db(true, 'Serveur');
  const res = await call(database, '2819');
  assert.equal(res.status, 403, 'a waiter PIN must never authorize a till operation');
  assert.equal(database.operations.filter(op => /sales|sale_audit/i.test(op.sql)).length, 0, 'unauthorized roles must not void a sale');
}

{
  const database = db(true, 'Caisse');
  const res = await call(database, '2819');
  const body = await res.json();
  assert.equal(res.status, 403, 'a cashier PIN cannot void a completed sale');
  assert.equal(body.error, 'manager-required');
  assert.equal(database.operations.filter(op => /sales|sale_audit/i.test(op.sql)).length, 0, 'cashier must not void a sale');
}

async function call(database, pin) {
  const token = await tillToken(secret, merchant);
  const request = new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `kiwi_till=${token}` },
    body: JSON.stringify({ merchant, id: 'sale-42', pin }),
  });
  return onRequestPost({ request, env: { DB: database, AUTH_SECRET: secret } });
}

{
  const database = db(false);
  const res = await call(database, '9999');
  assert.equal(res.status, 401);
  assert.equal(database.operations.filter(op => /sales|sale_audit/i.test(op.sql)).length, 0, 'wrong PIN must not modify sales or write audit records');
}

{
  const database = db(true, 'Manager');
  const res = await call(database, '2819');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.actor, 'Sara');
  assert.equal(database.operations.length >= 2, true, 'void and audit must be written');
  assert.match(database.operations[0].sql, /UPDATE sales SET void_ts/);
  assert.match(database.operations[1].sql, /INSERT INTO sale_audit/);
  assert.equal(database.operations[1].args[5], 'Sara');
  assert.equal(database.operations[1].args[7], 250);
}

console.log('  ✓ annulation vente (PIN manager/propriétaire requis, caisse et serveur rejetés, audit employé)');
