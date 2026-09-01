#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const db = new DatabaseSync(workerData.file);
  db.exec('PRAGMA busy_timeout=5000');
  const row = db.prepare(
    'UPDATE request_race SET revision = revision + 1, winner = ? WHERE id = ? AND revision = 1 RETURNING revision'
  ).get(workerData.winner, 'request-1');
  db.close();
  parentPort.postMessage(Boolean(row));
} else {
  const { allocateTransferAllocation } = await import('../functions/api/inventory/internal-requests.js');
  const EXPECTED = 4;
  let checks = 0;
  process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
  async function check(name, fn) {
    await fn();
    checks += 1;
    process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
  }

  let seed = 0x51f15e;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  }
  function integer(min, max) { return min + Math.floor(random() * (max - min + 1)); }

  await check('300 randomized FEFO allocations conserve quantity and provenance', () => {
    for (let caseNo = 0; caseNo < 300; caseNo += 1) {
      const rows = [];
      const count = integer(1, 8);
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        const qty = integer(1, 20) * 1000;
        total += qty;
        rows.push({
          id: 'case-' + caseNo + '-lot-' + i,
          qty_milli: qty,
          unit_cost_cents: integer(1, 500),
          occurred_ts: i + 1,
          srv_ts: i + 1,
          meta: JSON.stringify({
            expiresAt: integer(1, 5000),
            batchNum: 'B' + i,
            supplierName: 'S' + i,
          }),
        });
      }
      const requested = integer(1, total);
      const result = allocateTransferAllocation(rows, requested);
      assert.ok(result);
      assert.equal(result.allocations.reduce((sum, row) => sum + row.qtyMilli, 0), requested);
      assert.equal(result.expiresAt, Math.min(...result.allocations.map((row) => row.expiresAt)));
      const expectedOrder = rows.slice().sort((a, b) =>
        JSON.parse(a.meta).expiresAt - JSON.parse(b.meta).expiresAt
          || a.occurred_ts - b.occurred_ts
      ).map((row) => row.id);
      const actualOrder = result.allocations.map((row) => row.sourceMovementId);
      assert.deepEqual(actualOrder, expectedOrder.slice(0, actualOrder.length));
    }
  });

  await check('every transfer pair conserves consolidated quantity and booked value', () => {
    for (let i = 0; i < 300; i += 1) {
      const qty = integer(1, 100000) / 1000;
      const rate = integer(1, 50000) / 100;
      const movements = [
        { qty: -qty, unitCost: rate },
        { qty: qty, unitCost: rate },
      ];
      assert.equal(movements.reduce((sum, row) => sum + row.qty, 0), 0);
      assert.equal(movements.reduce((sum, row) => sum + row.qty * row.unitCost, 0), 0);
    }
  });

  await check('32 concurrent writers produce exactly one revision winner', async () => {
    const file = '/tmp/kiwi-economat-race-' + process.pid + '.sqlite';
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE request_race (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, winner TEXT NOT NULL);');
    db.prepare('INSERT INTO request_race (id, revision, winner) VALUES (?, 1, ?)').run('request-1', '');
    db.close();
    const winners = await Promise.all(Array.from({ length: 32 }, (_, index) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { file, winner: 'writer-' + index },
      });
      worker.once('message', resolve);
      worker.once('error', reject);
    })));
    assert.equal(winners.filter(Boolean).length, 1);
    const verify = new DatabaseSync(file, { readOnly: true });
    const row = verify.prepare('SELECT revision, winner FROM request_race WHERE id = ?').get('request-1');
    verify.close();
    assert.equal(row.revision, 2);
    assert.match(row.winner, /^writer-/);
  });

  await check('every new R and D suite is fail-closed and registered', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const names = [
      'economat-substitution-test.mjs',
      'economat-unit-deactivation-test.mjs',
      'economat-transfer-provenance-test.mjs',
      'economat-procurement-location-test.mjs',
      'economat-custody-contract-test.mjs',
      'economat-rd-invariants-test.mjs',
    ];
    const checker = fs.readFileSync(path.join(root, 'tools/check.js'), 'utf8');
    for (const name of names) {
      const source = fs.readFileSync(path.join(root, 'tools', name), 'utf8');
      assert.match(source, /process\.on\('unhandledRejection'/, name);
      assert.match(source, /await check\(/, name);
      assert.match(source, /assert\.equal\(checks, EXPECTED/, name);
      assert.ok(checker.includes("'" + name + "'"), name);
    }
  });

  assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
  process.stdout.write('economat-rd-invariants-test: ' + checks + ' checks passed\n');
}
