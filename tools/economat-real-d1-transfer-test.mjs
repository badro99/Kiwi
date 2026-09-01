#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'economat-real-d1-proof-secret';
const MERCHANT = 'hotel-atlas-suite';
const EXPECTED = 20;
let checks = 0;

async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`  ok ${checks} - ${name}\n`);
}

function command(args, options = {}) {
  const result = spawnSync('npx', ['--yes', 'wrangler@4.127.1', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `wrangler ${args.join(' ')} failed (${result.status})`,
      result.stdout || '',
      result.stderr || '',
    ].join('\n'));
  }
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForWorker(baseUrl, child, logs) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`wrangler dev exited early\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/__test__/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`wrangler dev did not become ready\n${logs()}`);
}

async function stop(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
}

const supportSchema = `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  business TEXT NOT NULL
);
CREATE TABLE store_docs (
  merchant TEXT NOT NULL,
  feature TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, feature)
);
CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variant_id TEXT NOT NULL DEFAULT '',
  location_id TEXT NOT NULL DEFAULT 'principal',
  qty_milli INTEGER NOT NULL,
  reason TEXT NOT NULL,
  unit_cost_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'MAD',
  ref_type TEXT NOT NULL DEFAULT '',
  ref_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  occurred_ts INTEGER NOT NULL,
  srv_ts INTEGER NOT NULL,
  reversal_of TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_ts INTEGER NOT NULL
);
CREATE TABLE inventory_sync_sequences (
  merchant TEXT PRIMARY KEY,
  last_ts INTEGER NOT NULL
);
INSERT INTO accounts (id, business) VALUES ('owner-1', 'Hotel Atlas Suite');
INSERT INTO store_docs (merchant, feature, data, updated_ts) VALUES (
  '${MERCHANT}',
  'hotel-units',
  '{"confirmationSide":"recipient","units":[{"id":"economat","name":"Economat","kind":"economat","storeType":"economat","locationId":"u-economat","active":true},{"id":"rooftop","name":"Rooftop","kind":"outlet","storeType":"bar","locationId":"u-bar-rooftop","active":true}]}',
  1
);
INSERT INTO inventory_sync_sequences (merchant, last_ts) VALUES ('${MERCHANT}', 100);
INSERT INTO inventory_movements
  (id, merchant, item_id, location_id, qty_milli, reason, unit_cost_cents,
   occurred_ts, srv_ts, meta, created_ts)
VALUES
  ('opening-cola', '${MERCHANT}', 'cola', 'u-economat', 10000, 'opening', 1200,
   1, 1, '{"batchNum":"C-1","expiresAt":2000000000000}', 1),
  ('opening-whisky', '${MERCHANT}', 'whisky', 'u-economat', 5000, 'opening', 14769,
   2, 2, '{"batchNum":"W-1"}', 2),
  ('opening-verrerie', '${MERCHANT}', 'verrerie', 'u-economat', 5000, 'opening', NULL,
   3, 3, '{"batchNum":"V-1"}', 3);
`;

function requestSeed(id, lines) {
  const request = `INSERT INTO hotel_internal_requests
    (merchant, id, unit_id, state, cancelled, revision, create_key, last_command_key,
     requester_id, requester_name, review_revision, accepted_revision,
     fulfilment_method, disputed, created_ts, updated_ts)
   VALUES ('${MERCHANT}', '${id}', 'rooftop', 'open', 0, 4, 'create:${id}',
           'prepare:${id}', 'manager', 'Hotel manager', 2, 0, 'pickup', 0, 10, 10);`;
  const inserts = lines.map((line, index) => `INSERT INTO hotel_internal_request_lines
    (merchant, request_id, line_no, item_id, unit, conversion_snapshot,
     qty_requested_base_milli, qty_requested, qty_approved, qty_prepared,
     qty_received, resolution, note)
   VALUES ('${MERCHANT}', '${id}', ${index}, '${line.itemId}', 'piece',
           '{"unit":"piece","baseUnit":"piece","basePerUnit":1}',
           ${line.qty * 1000}, ${line.qty}, ${line.qty}, ${line.qty}, 0, 'approved', '');`).join('\n');
  return `${request}\n${inserts}`;
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-economat-d1-'));
  const persist = path.join(temp, 'state');
  const config = path.join(temp, 'wrangler.toml');
  const support = path.join(temp, 'support.sql');
  const requests = path.join(temp, 'requests.sql');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const worker = path.join(ROOT, 'tools/fixtures/economat-real-d1-worker.mjs');
  fs.writeFileSync(config, `name = "kiwi-economat-real-d1-proof"\nmain = ${JSON.stringify(worker)}\ncompatibility_date = "2026-09-01"\ncompatibility_flags = ["nodejs_compat"]\n\n[vars]\nAUTH_SECRET = ${JSON.stringify(SECRET)}\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "kiwi-economat-proof"\ndatabase_id = "00000000-0000-0000-0000-000000000001"\n`);
  fs.writeFileSync(support, supportSchema);
  fs.writeFileSync(requests, [
    requestSeed('req-pair', [{ itemId: 'cola', qty: 2 }]),
    requestSeed('req-multi', [{ itemId: 'cola', qty: 1 }, { itemId: 'whisky', qty: 1 }]),
    requestSeed('req-rollback', [{ itemId: 'cola', qty: 1 }]),
    requestSeed('req-null', [{ itemId: 'verrerie', qty: 1 }]),
  ].join('\n'));

  const execute = (file) => command([
    'd1', 'execute', 'kiwi-economat-proof', '--local', '--persist-to', persist,
    '--config', config, '--file', file,
  ]);
  execute(support);
  execute(path.join(ROOT, 'migrations/2026-09-01-hotel-internal-requests.sql'));
  execute(path.join(ROOT, 'migrations/2026-09-01-hotel-request-substitutions.sql'));
  execute(requests);

  let stdout = '';
  let stderr = '';
  const child = spawn('npx', [
    '--yes', 'wrangler@4.127.1', 'dev', '--local', '--config', config,
    '--persist-to', persist, '--ip', '127.0.0.1', '--port', String(port),
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });

  try {
    await waitForWorker(baseUrl, child, () => `${stdout}\n${stderr}`);
    const token = await makeSession('owner-1', SECRET);
    const headers = {
      'content-type': 'application/json',
      cookie: `${SESS_COOKIE}=${token}`,
    };
    const confirm = async (id, idempotencyKey, lines) => {
      const response = await fetch(`${baseUrl}/api/inventory/internal-requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          merchant: MERCHANT,
          id,
          action: 'confirm',
          revision: 4,
          idempotencyKey,
          data: { lines },
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const snapshot = async () => {
      const response = await fetch(`${baseUrl}/__test__/snapshot`);
      assert.equal(response.status, 200);
      return response.json();
    };
    const requestRows = (state, id) => state.requests.find((row) => row.id === id);
    const transferRows = (state, id) => state.movements.filter((row) =>
      String(row.ref_id || '').startsWith(`request:${id}:`));

    const initial = await snapshot();
    await check('both request substitution migration columns exist in real D1', () => {
      const names = new Set(initial.requestLineColumns.map((column) => column.name));
      assert(names.has('substitute_unit'));
      assert(names.has('substitute_conversion_snapshot'));
      assert(names.has('substitute_reason'));
    });

    const pairResult = await confirm('req-pair', 'confirm-pair', [
      { itemId: 'cola', qtyReceived: 2 },
    ]);
    await check('production confirmation accepts a prepared single-line request', () => {
      assert.equal(pairResult.status, 200);
      assert.equal(pairResult.body.ok, true);
    });
    const afterPair = await snapshot();
    const pair = transferRows(afterPair, 'req-pair');
    await check('single-line confirmation emits exactly one transfer pair', () => {
      const expected = process.env.KIWI_D1_MUTATION === '1' ? 3 : 2;
      assert.equal(pair.length, expected);
      assert.deepEqual(pair.map((row) => row.reason).sort(), ['transfer-in', 'transfer-out']);
    });
    await check('the pair shares one deterministic transfer reference', () => {
      assert.equal(new Set(pair.map((row) => row.ref_id)).size, 1);
    });
    await check('the pair conserves quantity across source and destination', () => {
      assert.equal(pair.reduce((sum, row) => sum + Number(row.qty_milli), 0), 0);
      assert.deepEqual(pair.map((row) => [row.location_id, row.qty_milli]).sort(), [
        ['u-bar-rooftop', 2000],
        ['u-economat', -2000],
      ]);
    });

    const pairReplay = await confirm('req-pair', 'confirm-pair', [
      { itemId: 'cola', qtyReceived: 2 },
    ]);
    const afterPairReplay = await snapshot();
    await check('same-key confirmation is reported as a server-side replay', () => {
      assert.equal(pairReplay.status, 200);
      assert.equal(pairReplay.body.replayed, true);
    });
    await check('same-key replay creates no movement or balance delta', () => {
      assert.equal(transferRows(afterPairReplay, 'req-pair').length, pair.length);
      assert.equal(afterPairReplay.movements.length, afterPair.movements.length);
    });

    const beforeMultiSequence = Number(afterPairReplay.sequences[0].last_ts);
    const multiResult = await confirm('req-multi', 'confirm-multi', [
      { itemId: 'cola', qtyReceived: 1 },
      { itemId: 'whisky', qtyReceived: 1 },
    ]);
    await check('production confirmation accepts a two-line request', () => {
      assert.equal(multiResult.status, 200);
      assert.equal(multiResult.body.ok, true);
    });
    const afterMulti = await snapshot();
    const multi = transferRows(afterMulti, 'req-multi');
    await check('two fulfilled lines emit four movements', () => assert.equal(multi.length, 4));
    await check('reserved cursors are contiguous and ordered for all four movements', () => {
      const cursors = multi.map((row) => Number(row.srv_ts));
      assert.deepEqual(cursors, [cursors[0], cursors[0] + 1, cursors[0] + 2, cursors[0] + 3]);
    });
    await check('the sequence advances by N equals four', () => {
      assert.equal(Number(afterMulti.sequences[0].last_ts) - beforeMultiSequence, 4);
    });
    await check('each two-line transfer reference conserves total quantity', () => {
      assert.equal(multi.reduce((sum, row) => sum + Number(row.qty_milli), 0), 0);
    });

    const priorCursors = afterMulti.movements.map((row) => [row.id, row.srv_ts]);
    const multiReplay = await confirm('req-multi', 'confirm-multi', [
      { itemId: 'cola', qtyReceived: 1 },
      { itemId: 'whisky', qtyReceived: 1 },
    ]);
    const afterMultiReplay = await snapshot();
    await check('two-line replay is idempotent', () => {
      assert.equal(multiReplay.status, 200);
      assert.equal(multiReplay.body.replayed, true);
      assert.equal(afterMultiReplay.movements.length, afterMulti.movements.length);
    });
    await check('replay leaves every prior cursor readable and unchanged', () => {
      assert.deepEqual(afterMultiReplay.movements.map((row) => [row.id, row.srv_ts]), priorCursors);
    });

    const triggerResponse = await fetch(`${baseUrl}/__test__/fail-transfer-in`, { method: 'POST' });
    await check('the real D1 fixture installs a second-movement failure trigger', () => {
      assert.equal(triggerResponse.status, 200);
    });
    const rollbackResult = await confirm('req-rollback', 'confirm-rollback', [
      { itemId: 'cola', qtyReceived: 1 },
    ]);
    const afterRollback = await snapshot();
    await check('a second-movement failure returns write-failed', () => {
      assert.equal(rollbackResult.status, 503);
      assert.equal(rollbackResult.body.error, 'write-failed');
    });
    await check('D1 batch rolls back the first transfer movement', () => {
      assert.equal(transferRows(afterRollback, 'req-rollback').length, 0);
    });
    await check('D1 batch also rolls back request state, revision, and confirmation event', () => {
      assert.deepEqual(requestRows(afterRollback, 'req-rollback'), requestRows(afterMultiReplay, 'req-rollback'));
      assert.equal(afterRollback.events.filter((row) => row.request_id === 'req-rollback').length, 0);
    });

    const beforeNullCount = afterRollback.movements.length;
    const beforeNullSequence = Number(afterRollback.sequences[0].last_ts);
    const nullResult = await confirm('req-null', 'confirm-null', [
      { itemId: 'verrerie', qtyReceived: 1 },
    ]);
    const afterNull = await snapshot();
    await check('a null source cost refuses confirmation with the specific 409', () => {
      assert.equal(nullResult.status, 409);
      assert.equal(nullResult.body.error, 'source-cost-unknown:verrerie');
    });
    await check('null-cost refusal writes no movement, state, event, or cursor', () => {
      assert.equal(afterNull.movements.length, beforeNullCount);
      assert.equal(transferRows(afterNull, 'req-null').length, 0);
      assert.deepEqual(requestRows(afterNull, 'req-null'), requestRows(afterRollback, 'req-null'));
      assert.equal(afterNull.events.filter((row) => row.request_id === 'req-null').length, 0);
      assert.equal(Number(afterNull.sequences[0].last_ts), beforeNullSequence);
    });

    if (checks !== EXPECTED) throw new Error(`expected ${EXPECTED} checks, ran ${checks}`);
    process.stdout.write(`ok ${checks} checks\n`);
  } finally {
    await stop(child);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

await main();
