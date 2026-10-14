#!/usr/bin/env node
/* discount-reasons-test · the discount reasons, chip to server (stage 4,
 * §10.31, §21.1 row 4).
 *
 *   node tools/discount-reasons-test.mjs
 *
 * What it holds:
 *   · the four reason chips of <k-discount> (assets/kit/till.js REASONS) and
 *     the server's DISCOUNT_REASONS (functions/api/sale.js) are the same set;
 *   · on the till behind the flag, each chip reaches the shipped remise by its
 *     shipped label (kiwi-caisse.html TILL_KIT_REASON), and the shipped
 *     discountReasonCode() brings that label back to the chip's own code;
 *   · one discounted sale per chip, posted to the real POST /api/sale on a
 *     base built from schema.sql: each returns 200 and stores its code;
 *   · a reason outside the set is refused (bad-discount-reason).
 * No network, no real store: a test merchant in an in-memory base. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/sale.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let n = 0;
const ok = (label, fn) => { fn(); n++; console.log('  ✓ ' + label); };

console.log('■ Motifs de remise, de la puce au serveur (tools/discount-reasons-test.mjs)');

const till = read('assets/kit/till.js');
const reasonsSrc = /var REASONS = (\[[^;]+\]);/.exec(till);
assert.ok(reasonsSrc, 'till.js declares REASONS');
const chips = vm.runInNewContext(reasonsSrc[1]).map((r) => r[0]);
const sale = read('functions/api/sale.js');
const serverSrc = /const DISCOUNT_REASONS = new Set\((\[[^\]]+\])\)/.exec(sale);
assert.ok(serverSrc, 'sale.js declares DISCOUNT_REASONS');
const server = vm.runInNewContext(serverSrc[1]);
ok(`the chips and the server's set are the same four (${chips.join(', ')})`, () => {
  assert.deepEqual([...chips].sort(), [...server].sort());
  assert.equal(chips.length, 4);
});

const caisse = read('kiwi-caisse.html');
const mapSrc = /const TILL_KIT_REASON = (\{[^;]+\});/.exec(caisse);
const codeSrc = /function discountReasonCode\(value\) \{[\s\S]*?\n    \}/.exec(caisse);
assert.ok(mapSrc && codeSrc, 'kiwi-caisse.html carries TILL_KIT_REASON and discountReasonCode');
const ctx = vm.createContext({});
vm.runInContext(codeSrc[0] + '; var TILL_KIT_REASON = ' + mapSrc[1] + ';', ctx);
ok('each chip reaches the shipped remise by its label, and comes back as its own code', () => {
  for (const code of chips) {
    const label = ctx.TILL_KIT_REASON[code];
    assert.ok(label, `a shipped label for ${code}`);
    assert.equal(vm.runInContext(`discountReasonCode(${JSON.stringify(label)})`, ctx), code, `${code} → ${label} → ?`);
  }
});

/* The real handler on a base built from schema.sql. */
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('schema.sql'));
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values.map((value) => value === undefined ? null : value); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const merchant = 'discount-reasons-fixture';
const secret = 'synthetic-discount-reasons-only';
const env = { DB, AUTH_SECRET: secret };
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)").run(merchant, '{}', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(id, reason) {
  const gross = 10000, cut = 1000, amountCents = gross - cut;
  const body = { merchant, id, method: 'cash', amountCents, amount: amountCents / 100, label: 'TEST KIWI', ref: id, ts: Date.now(),
    lines: [{ name: 'TEST KIWI', qty: 1, total: gross / 100 }],
    grossAmountCents: gross, discountAmountCents: cut, discountReason: reason, actorId: 'staff:test-manager',
    discountKind: 'percent', discountPercent: 10 };
  const response = await onRequestPost({ request: new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, waitUntil() {} });
  return { status: response.status, body: await response.json() };
}

for (const code of chips) {
  const r = await post('disc-' + code, code);
  ok(`a sale discounted for "${code}" is taken (200) and stores its code`, () => {
    assert.equal(r.status, 200, JSON.stringify(r));
    const row = sqlite.prepare('SELECT amount_cents, gross_amount_cents, discount_amount_cents, discount_reason FROM sales WHERE id = ?').get('disc-' + code);
    assert.deepEqual({ ...row }, { amount_cents: 9000, gross_amount_cents: 10000, discount_amount_cents: 1000, discount_reason: code });
  });
}
const bad = await post('disc-bad', 'birthday');
ok('a reason outside the set is refused (bad-discount-reason)', () => {
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'bad-discount-reason');
});
console.log(`✓ discount-reasons-test · ${n} checks`);
