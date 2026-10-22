#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../functions/api/agent/query.js';
import { hash } from '../functions/api/agent/_core.js';

process.env.TZ = 'Europe/Berlin';
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'agent-day-test', now = Date.now();
const id = crypto.randomUUID(), token = `kwa.${id}.${'a'.repeat(43)}`;
sql.prepare('INSERT INTO accounts (id,email,salt,hash,created_ts) VALUES (?,?,?,?,?)')
  .run('owner', 'day@example.test', 'fixture', 'fixture', now);
sql.prepare('INSERT INTO merchant_config (merchant,features,account_id,status,updated_ts) VALUES (?,?,?,?,?)')
  .run(merchant, '{}', 'owner', 'active', now);
sql.prepare(`INSERT INTO agent_keys (id,merchant,account_id,account_epoch,label,token_hash,scopes,created_ts,expires_ts)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(id, merchant, 'owner', 0, 'fixture', await hash(token),
    JSON.stringify(['sales:read', 'payments:read']), now, now + 3600000);
for (const [id, time, cents] of [
  ['early', '2026-10-21T01:15:00+00:00', 1200],
  ['late', '2026-10-21T10:00:00+00:00', 3400],
  ['before', '2026-10-20T04:59:59+00:00', 5600],
  ['boundary', '2026-10-21T05:00:00+00:00', 7800],
]) sql.prepare('INSERT INTO sales (id,merchant,amount,amount_cents,method,ts) VALUES (?,?,?,?,?,?)')
  .run(id, merchant, cents / 100, cents, 'cash', Date.parse(time));
const env = { AUTH_SECRET: 'fixture-only', DB: { prepare(query) {
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return sql.prepare(query).get(...args) ?? null; },
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { sql.prepare(query).run(...args); return { success: true }; },
  };
} } };
async function query(tool, from = '2026-10-20', to = from) {
  const response = await onRequestPost({ env, request: new Request('https://kiwi.test/api/agent/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool, from, to }),
  }) });
  return { status: response.status, data: await response.json() };
}
try {
  let result = await query('sales_summary');
  assert.equal(result.status, 200);
  assert.equal(result.data.rows.reduce((sum, row) => sum + row.amount_cents, 0), 1200,
    '01:15 on October 21 belongs to October 20; 10:00 and the next cutoff do not');
  assert.deepEqual(result.data.rows, [{ day: '2026-10-20', method: 'cash', count: 1, amount_cents: 1200 }]);
  result = await query('payment_events');
  assert.deepEqual(result.data.payments.map(row => row.id), ['early']);
  // Several days in one query: each sale is labelled with its own business day.
  result = await query('sales_summary', '2026-10-19', '2026-10-21');
  assert.deepEqual(result.data.rows, [
    { day: '2026-10-19', method: 'cash', count: 1, amount_cents: 5600 },
    { day: '2026-10-20', method: 'cash', count: 1, amount_cents: 1200 },
    { day: '2026-10-21', method: 'cash', count: 2, amount_cents: 11200 },
  ], 'a multi-day summary labels each sale with its business day');
  for (const [from, to] of [['2026-02-30', '2026-02-30'], ['bad', '2026-10-20'],
    ['2026-10-21', '2026-10-20'], ['2026-09-01', '2026-10-20']]) {
    assert.equal((await query('sales_summary', from, to)).status, 400);
  }
  assert.equal((await query('sales_summary', '2026-09-19', '2026-10-20')).status, 200);
  // The same merchant settings used by the server reports override both defaults.
  sql.prepare('UPDATE merchant_config SET timezone = ?, business_cutoff = ? WHERE merchant = ?')
    .run('Asia/Tokyo', 11, merchant);
  result = await query('payment_events');
  assert.deepEqual(result.data.payments.map(row => row.id), ['early', 'before']);
  sql.prepare('UPDATE merchant_config SET timezone = ?, business_cutoff = ? WHERE merchant = ?')
    .run('invalid/zone', 99, merchant);
  assert.deepEqual((await query('payment_events')).data.payments.map(row => row.id), ['early']);
  console.log('agent-business-day-test: green (Casablanca overnight sales, exclusive cutoff, merchant settings, validation)');
} finally { sql.close(); }
