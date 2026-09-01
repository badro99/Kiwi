#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { deriveRequestLabel } from '../functions/api/inventory/_internal-request.js';
import { onRequestGet, onRequestPost } from '../functions/api/inventory/internal-requests.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'internal-request-test-secret-32b';
const MERCHANT = 'hotel-atlas';
const EXPECTED = 9;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const units = { units: [
  { id: 'economat', name: 'Economat', kind: 'economat', locationId: 'loc-economat', active: true },
  { id: 'rooftop', name: 'Rooftop', kind: 'outlet', storeType: 'bar', locationId: 'loc-rooftop', active: true },
] };
const central = { items: [
  {
    itemId: 'water', name: 'Eau', baseUnit: 'bouteille', active: true,
    purchaseUnit: 'caisse', purchaseToBase: 12, issueUnit: 'bouteille', issueToBase: 1,
    consumptionUnit: 'bouteille', consumptionToBase: 1,
  },
  {
    itemId: 'flour', name: 'Farine', baseUnit: 'g', active: true,
    purchaseUnit: 'kg', purchaseToBase: 1000, issueUnit: 'kg', issueToBase: 1000,
    consumptionUnit: 'g', consumptionToBase: 1,
  },
] };
const department = { unitId: 'rooftop', items: [
  { itemId: 'water', visibility: 'visible', active: true, countingUnit: 'bouteille', packaging: { unit: 'caisse', quantity: 1 }, countingFrequency: 'daily', recipeUse: false },
  { itemId: 'flour', visibility: 'visible', active: true, countingUnit: 'kg', packaging: { unit: 'kg', quantity: 1 }, countingFrequency: 'weekly', recipeUse: true },
] };

class FakeDb {
  constructor() {
    this.requests = new Map();
    this.lines = new Map();
    this.events = new Map();
    this.inventoryWrites = 0;
    this.docs = new Map([
      ['hotel-units', { data: JSON.stringify(units), rev: 1, updated_ts: 1 }],
      ['economat-catalogue', { data: JSON.stringify(central), rev: 1, updated_ts: 1 }],
      ['hotel-dept:rooftop', { data: JSON.stringify(department), rev: 1, updated_ts: 1 }],
    ]);
  }
  requestByCreate(merchant, createKey) {
    return [...this.requests.values()].find((row) => row.merchant === merchant && row.create_key === createKey) || null;
  }
  prepare(sql) {
    const db = this;
    const query = String(sql).replace(/\s+/g, ' ').trim();
    const stmt = {
      args: [], bind(...args) { stmt.args = args; return stmt; },
      async first() {
        if (query.startsWith('SELECT account_id FROM merchant_config')) return { account_id: 'owner-1' };
        if (query.startsWith('SELECT business FROM accounts')) return { business: MERCHANT };
        if (query.startsWith('SELECT data FROM store_docs')) return db.docs.get(stmt.args[1]) || null;
        if (query.startsWith('SELECT request_id FROM hotel_internal_request_events')) {
          const event = db.events.get(`${stmt.args[0]}|${stmt.args[1]}`);
          return event ? { request_id: event.request_id } : null;
        }
        if (query.startsWith('SELECT * FROM hotel_internal_requests')) {
          if (query.includes('create_key = ?')) return db.requestByCreate(stmt.args[0], stmt.args[1]);
          return db.requests.get(`${stmt.args[0]}|${stmt.args[1]}`) || null;
        }
        return null;
      },
      async all() {
        if (query.startsWith('SELECT * FROM hotel_internal_request_lines')) {
          return { results: (db.lines.get(`${stmt.args[0]}|${stmt.args[1]}`) || []).map((row) => ({ ...row })) };
        }
        return { results: [] };
      },
      async run() {
        if (query.startsWith('CREATE TABLE') || query.startsWith('CREATE INDEX')) {
          return { success: true, meta: { changes: 0 } };
        }
        if (query.startsWith('INSERT OR IGNORE INTO hotel_internal_requests')) {
          const [merchant, id, unitId, createKey, lastKey, requesterId, requesterName, createdTs, updatedTs] = stmt.args;
          if (db.requestByCreate(merchant, createKey) || db.requests.has(`${merchant}|${id}`)) {
            return { success: true, meta: { changes: 0 } };
          }
          db.requests.set(`${merchant}|${id}`, {
            merchant, id, unit_id: unitId, state: 'draft', cancelled: 0, revision: 1,
            create_key: createKey, last_command_key: lastKey, requester_id: requesterId,
            requester_name: requesterName, review_revision: 0, accepted_revision: 0,
            fulfilment_method: 'pickup', delivery_started_ts: null, disputed: 0,
            created_ts: createdTs, updated_ts: updatedTs, submitted_ts: null, closed_ts: null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('INSERT OR IGNORE INTO hotel_internal_request_lines')) {
          const [merchant, requestId, lineNo, itemId, unit, snapshot, requestedBaseMilli,
            qtyRequested, qtyApproved, qtyPrepared, qtyReceived, resolution, substituteFor, note,
            guardMerchant, guardId, createKey] = stmt.args;
          const request = db.requests.get(`${guardMerchant}|${guardId}`);
          if (!request || request.create_key !== createKey) return { success: true, meta: { changes: 0 } };
          const key = `${merchant}|${requestId}`;
          const rows = db.lines.get(key) || [];
          if (!rows.some((row) => row.line_no === lineNo)) rows.push({
            merchant, request_id: requestId, line_no: lineNo, item_id: itemId, unit,
            conversion_snapshot: snapshot, qty_requested_base_milli: requestedBaseMilli,
            qty_requested: qtyRequested, qty_approved: qtyApproved, qty_prepared: qtyPrepared,
            qty_received: qtyReceived, resolution, substitute_for: substituteFor, note,
          });
          db.lines.set(key, rows.sort((a, b) => a.line_no - b.line_no));
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE hotel_internal_requests')) {
          const [state, cancelled, revision, lastKey, reviewRevision, acceptedRevision,
            deliveryStarted, disputed, updatedTs, submittedTs, closedTs, merchant, id, expected] = stmt.args;
          const row = db.requests.get(`${merchant}|${id}`);
          if (!row || row.revision !== expected) return { success: true, meta: { changes: 0 } };
          Object.assign(row, {
            state, cancelled, revision, last_command_key: lastKey,
            review_revision: reviewRevision, accepted_revision: acceptedRevision,
            delivery_started_ts: deliveryStarted, disputed, updated_ts: updatedTs,
            submitted_ts: submittedTs, closed_ts: closedTs,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE hotel_internal_request_lines')) {
          const [approved, prepared, received, resolution, substituteFor, note,
            merchant, requestId, lineNo, guardMerchant, guardId, commandKey] = stmt.args;
          const request = db.requests.get(`${guardMerchant}|${guardId}`);
          if (!request || request.last_command_key !== commandKey) return { success: true, meta: { changes: 0 } };
          const line = (db.lines.get(`${merchant}|${requestId}`) || []).find((row) => row.line_no === lineNo);
          if (!line) return { success: true, meta: { changes: 0 } };
          Object.assign(line, { qty_approved: approved, qty_prepared: prepared, qty_received: received, resolution, substitute_for: substituteFor, note });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('INSERT OR IGNORE INTO hotel_internal_request_events')) {
          if (query.includes("'created'")) {
            const [merchant, id, createKey, actorId, actorName, ts, guardMerchant, guardCreateKey] = stmt.args;
            const request = db.requestByCreate(guardMerchant, guardCreateKey);
            if (!request) return { success: true, meta: { changes: 0 } };
            const key = `${merchant}|${createKey}`;
            if (!db.events.has(key)) db.events.set(key, { merchant, id, request_id: request.id, revision: request.revision, event: 'created', idempotency_key: createKey, actor_id: actorId, actor_name: actorName, ts });
            return { success: true, meta: { changes: 1 } };
          }
          const [merchant, id, requestId, event, idempotencyKey, actorId, actorName, payload, ts,
            guardMerchant, guardId, commandKey] = stmt.args;
          const request = db.requests.get(`${guardMerchant}|${guardId}`);
          if (!request || request.last_command_key !== commandKey) return { success: true, meta: { changes: 0 } };
          const key = `${merchant}|${idempotencyKey}`;
          if (!db.events.has(key)) db.events.set(key, { merchant, id, request_id: requestId, revision: request.revision, event, idempotency_key: idempotencyKey, actor_id: actorId, actor_name: actorName, payload, ts });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.includes('inventory_movements')) db.inventoryWrites += 1;
        return { success: true, meta: { changes: 0 } };
      },
    };
    return stmt;
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const db = new FakeDb();
const cookie = `${SESS_COOKIE}=${await makeSession('owner-1', SECRET)}`;
function post(body) {
  return onRequestPost({
    request: new Request('https://kiwi.test/api/inventory/internal-requests', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    env: { AUTH_SECRET: SECRET, DB: db },
  });
}
function get(id) {
  return onRequestGet({
    request: new Request(`https://kiwi.test/api/inventory/internal-requests?merchant=${MERCHANT}&id=${id}`, { headers: { cookie } }),
    env: { AUTH_SECRET: SECRET, DB: db },
  });
}

const createBody = {
  action: 'create', merchant: MERCHANT, id: 'req-001', unitId: 'rooftop', idempotencyKey: 'create-001',
  lines: [
    { itemId: 'water', unit: 'bouteille', qtyRequested: 2 },
    { itemId: 'flour', unit: 'kg', qtyRequested: 1 },
  ],
};
const createdResponse = await post(createBody);
const created = await createdResponse.json();
await check('create persists an exact draft line model', () => {
  assert.equal(createdResponse.status, 200);
  assert.equal(created.request.state, 'draft');
  assert.deepEqual(Object.keys(created.lines[0]), [
    'itemId', 'unit', 'conversionSnapshot', 'qtyRequestedBase', 'qtyRequested',
    'qtyApproved', 'qtyPrepared', 'qtyReceived', 'resolution', 'substituteFor', 'note',
  ]);
});
await check('drafts survive a fresh GET reload', async () => {
  const response = await get('req-001');
  const body = await response.json();
  assert.equal(body.request.revision, 1);
  assert.equal(body.lines.length, 2);
});
const submittedResponse = await post({
  action: 'submit', merchant: MERCHANT, id: 'req-001', revision: 1, idempotencyKey: 'submit-001',
});
const submitted = await submittedResponse.json();
await check('submit opens the request and writes zero stock movements', () => {
  const source = fs.readFileSync(path.join(root, 'functions/api/inventory/internal-requests.js'), 'utf8');
  assert.equal(submittedResponse.status, 200);
  assert.equal(submitted.request.state, 'open');
  assert.equal(db.inventoryWrites, 0);
  assert.doesNotMatch(source, /inventory_movements|movements\.js/);
});
await check('derived labels follow line progress instead of a stored 14-state enum', () => {
  const base = submitted.lines.map((line) => ({ ...line }));
  assert.equal(deriveRequestLabel({ state: 'draft' }, base), 'draft');
  assert.equal(deriveRequestLabel({ state: 'open' }, base), 'submitted');
  const partialReview = base.map((line, index) => ({ ...line, resolution: index ? 'pending' : 'approved', qtyApproved: index ? 0 : line.qtyRequested }));
  assert.equal(deriveRequestLabel({ state: 'open' }, partialReview), 'under-review');
  const changed = base.map((line) => ({ ...line, resolution: 'reduced', qtyApproved: line.qtyRequested / 2 }));
  assert.equal(deriveRequestLabel({ state: 'open', reviewRevision: 3, acceptedRevision: 0 }, changed), 'changes-proposed');
  assert.equal(deriveRequestLabel({ state: 'open', reviewRevision: 3, acceptedRevision: 3 }, changed), 'approved');
  assert.equal(deriveRequestLabel({ state: 'closed' }, changed), 'received');
  assert.equal(deriveRequestLabel({ state: 'closed', cancelled: true }, changed), 'cancelled');
});
const reviewPayload = {
  lines: [
    { itemId: 'water', qtyApproved: 2, resolution: 'approved' },
    { itemId: 'flour', qtyApproved: 0.5, resolution: 'reduced' },
  ],
};
const firstReview = await post({
  action: 'review', merchant: MERCHANT, id: 'req-001', revision: 2,
  idempotencyKey: 'review-winner', data: reviewPayload,
});
const staleReview = await post({
  action: 'review', merchant: MERCHANT, id: 'req-001', revision: 2,
  idempotencyKey: 'review-loser', data: reviewPayload,
});
await check('two reviewers on one revision produce one winner and one 409', () => {
  assert.equal(firstReview.status, 200);
  assert.equal(staleReview.status, 409);
});
await check('later catalogue edits cannot alter an open request conversion snapshot', async () => {
  const before = (await (await get('req-001')).json()).lines[0].qtyRequestedBase;
  central.items[0].issueToBase = 2;
  db.docs.set('economat-catalogue', { data: JSON.stringify(central), rev: 2, updated_ts: 2 });
  const after = (await (await get('req-001')).json()).lines[0].qtyRequestedBase;
  assert.equal(before, 2);
  assert.equal(after, 2);
});
await check('an item outside the requesting unit catalogue is rejected', async () => {
  const response = await post({
    action: 'create', merchant: MERCHANT, id: 'req-ghost', unitId: 'rooftop', idempotencyKey: 'create-ghost',
    lines: [{ itemId: 'ghost', unit: 'bouteille', qtyRequested: 1 }],
  });
  assert.equal(response.status, 422);
});
await check('mixed-unit lines are evaluated individually and never summed into one state', () => {
  const mixed = [
    { ...submitted.lines[0], resolution: 'approved', qtyApproved: 2, qtyPrepared: 2, qtyReceived: 2 },
    { ...submitted.lines[1], resolution: 'approved', qtyApproved: 1, qtyPrepared: 1, qtyReceived: 0 },
  ];
  assert.equal(deriveRequestLabel({ state: 'open', reviewRevision: 3, acceptedRevision: 3 }, mixed), 'partially-received');
});
await check('schema and migration name the same three transactional tables', () => {
  const migration = fs.readFileSync(path.join(root, 'migrations/2026-09-01-hotel-internal-requests.sql'), 'utf8');
  for (const table of ['hotel_internal_requests', 'hotel_internal_request_lines', 'hotel_internal_request_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} executed checks, got ${checks}`);
process.stdout.write(`internal-request-test: ${checks} checks passed\n`);
