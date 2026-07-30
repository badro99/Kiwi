#!/usr/bin/env node
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/sale/cancel.js';
import { tillToken } from '../functions/auth/_lib.js';

const secret = 'cancel-test-secret';
const merchant = 'amira-cafe';

function db(pinWorks) {
  const batches = [];
  return {
    batches,
    prepare(sql) {
      return {
        sql, args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('FROM staff_pins')) return pinWorks ? { id: 'staff-7', name: 'Sara', role: 'Caisse' } : null;
          if (sql.includes('FROM sales')) return {
            id: 'sale-42', amount: 250, method: 'cash', label: 'Vente', ref: '1042',
            ts: Date.now() - 60000, lines: '[{"n":"Jean noir","q":1,"t":250}]', void_ts: null,
          };
          return null;
        },
      };
    },
    async batch(stmts) { batches.push(stmts); return stmts.map(() => ({ success: true })); },
  };
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
  assert.equal(database.batches.length, 0, 'wrong PIN must not write anything');
}

{
  const database = db(true);
  const res = await call(database, '2819');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.actor, 'Sara');
  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0].length, 2, 'void and audit must be written together');
  assert.match(database.batches[0][0].sql, /UPDATE sales SET void_ts/);
  assert.match(database.batches[0][1].sql, /INSERT INTO sale_audit/);
  assert.equal(database.batches[0][1].args[5], 'Sara');
  assert.equal(database.batches[0][1].args[7], 250);
}

console.log('  ✓ annulation caisse (PIN serveur, vente neutralisée, audit employé)');
