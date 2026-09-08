#!/usr/bin/env node
/* Focused behavioural regression for audit findings I01-I05.
 *
 * These checks call the production handlers/helpers over node:sqlite. The D1
 * facade below runs batch() inside BEGIN IMMEDIATE/COMMIT so transaction faults
 * and guarded stock writes are exercised by SQLite itself, not by a copied
 * model of the handler.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie, employeeToken, employeeCookie } from '../functions/auth/_lib.js';
import { onRequestPost as movementPost } from '../functions/api/inventory/movements.js';
import { onRequestGet as clientsGet, onRequestPost as clientsPost } from '../functions/api/clients.js';
import { onRequestPost as employeeClientsPost } from '../functions/api/employee-clients.js';
import { createHotelRequestHarness } from './fixtures/hotel-request-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'audit-remediation-inventory-loyalty-secret';
const MERCHANT = 'audit-remediation-merchant';
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

function facade(raw) {
  const DB = {
    prepare(sql) {
      let args = [];
      const statement = {
        sql,
        get boundArgs() { return args; },
        bind(...values) { args = values.map((value) => value === undefined ? null : value); return statement; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        async run() {
          const result = raw.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes || 0) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return DB;
}

function fullDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  return { raw, DB: facade(raw) };
}

async function body(response) { return response.json(); }

const owner = sessionCookie(await makeSession('audit-owner', SECRET)).split(';')[0];

// I02 — the same movement id is idempotent only for the same immutable payload.
{
  const { raw, DB } = fullDb();
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', now);
  const env = { DB, AUTH_SECRET: SECRET };
  const post = (movement) => movementPost({
    env,
    request: new Request('https://kiwi.test/api/inventory/movements', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, movement }),
    }),
  });
  const movement = { id: 'audit-movement-1', itemId: 'coffee', locationId: 'principal', qty: 1.25,
    reason: 'opening', unitCost: 0.0045, occurredTs: now };
  check((await post(movement)).status === 200, 'I02 first inventory movement is accepted');
  check((await post(movement)).status === 200, 'I02 identical movement replay is accepted');
  const changed = await post({ ...movement, qty: 1.5 });
  check(changed.status === 409 && (await body(changed)).error === 'id-conflict',
    'I02 changed payload with the same movement id is rejected');
  raw.prepare(`INSERT INTO inventory_movements
    (id,merchant,item_id,location_id,qty_milli,reason,occurred_ts,srv_ts,created_ts)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('audit-cross-tenant-id', 'other-merchant', 'x', 'principal', 1, 'opening', now, 1, now);
  const cross = await post({ ...movement, id: 'audit-cross-tenant-id' });
  check(cross.status === 409, 'I02 an id owned by another merchant cannot be acknowledged');
}

// I01 + I03 — actual internal-request handler, SQLite batch, durable reservation and rate.
{
  const h = await createHotelRequestHarness();
  h.addMovement({ id: 'audit-stock-deplete', itemId: 'verrerie', qty: -39, reason: 'sale' });
  await h.createSubmitted('audit-stock-a', 'verrerie', 1);
  await h.createSubmitted('audit-stock-b', 'verrerie', 1);
  const movementCountBeforeLoser = h.one('SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ?', 'hotel-atlas-suite').n;
  const [reviewA, reviewB] = await Promise.all([
    h.post({ action: 'review', merchant: 'hotel-atlas-suite', id: 'audit-stock-a', revision: 2,
      idempotencyKey: 'review:a', data: { lines: [{ itemId: 'verrerie', qtyApproved: 1, resolution: 'approved' }] } }),
    h.post({ action: 'review', merchant: 'hotel-atlas-suite', id: 'audit-stock-b', revision: 2,
      idempotencyKey: 'review:b', data: { lines: [{ itemId: 'verrerie', qtyApproved: 1, resolution: 'approved' }] } }),
  ]);
  const winnerId = reviewA.status === 200 ? 'audit-stock-a' : 'audit-stock-b';
  const loserId = winnerId === 'audit-stock-a' ? 'audit-stock-b' : 'audit-stock-a';
  check(new Set([reviewA.status, reviewB.status]).size === 2 && [reviewA.status, reviewB.status].includes(200)
    && [reviewA.status, reviewB.status].includes(409),
  `I01 competing shared-stock requests elect one winner (statuses ${reviewA.status}/${reviewB.status})`);
  const hold = h.one('SELECT qty_milli FROM inventory_request_reservations WHERE request_id = ?', winnerId);
  check(hold && Number(hold.qty_milli) === 1000, 'I01 reservation is durable and tied to request identity');
  check(Number(h.one('SELECT COUNT(*) AS n FROM inventory_movements WHERE merchant = ?', 'hotel-atlas-suite').n) === Number(movementCountBeforeLoser)
    && Number(h.one('SELECT COUNT(*) AS n FROM inventory_request_reservations WHERE merchant = ?', 'hotel-atlas-suite').n) === 1
    && !h.one('SELECT request_id FROM inventory_request_reservations WHERE request_id = ?', loserId),
  'I01 losing request creates neither a stock movement nor a reservation');

  const legacy = await createHotelRequestHarness();
  await legacy.createSubmitted('audit-legacy-confirm', 'cola', 1);
  legacy.raw.prepare(`UPDATE hotel_internal_requests
    SET state = 'open', revision = 4, last_command_key = 'prepare:legacy', review_revision = 3
    WHERE merchant = ? AND id = ?`).run('hotel-atlas-suite', 'audit-legacy-confirm');
  legacy.raw.prepare(`UPDATE hotel_internal_request_lines
    SET qty_approved = 1, qty_prepared = 1, resolution = 'approved'
    WHERE merchant = ? AND request_id = ?`).run('hotel-atlas-suite', 'audit-legacy-confirm');
  const legacyConfirm = await legacy.post({ action: 'confirm', merchant: 'hotel-atlas-suite', id: 'audit-legacy-confirm',
    revision: 4, idempotencyKey: 'confirm:legacy', data: { lines: [{ itemId: 'cola', qtyReceived: 1 }] } });
  check(legacyConfirm.status === 200, 'I01 approved pre-migration request is safely adopted at confirmation');
  check(Number(legacy.one('SELECT COUNT(*) AS n FROM inventory_request_reservations WHERE request_id = ?', 'audit-legacy-confirm').n) === 0
    && Number(legacy.one("SELECT COUNT(*) AS n FROM inventory_movements WHERE ref_id LIKE 'request:audit-legacy-confirm:%'").n) === 2,
  'I01 legacy adoption consumes its temporary guarded hold and emits one transfer pair');

  const precise = await createHotelRequestHarness();
  precise.raw.exec('ALTER TABLE inventory_movements ADD COLUMN unit_cost_rate INTEGER');
  precise.raw.prepare(`INSERT INTO inventory_movements
    (id,merchant,item_id,location_id,qty_milli,reason,unit_cost_cents,unit_cost_rate,occurred_ts,srv_ts,meta,created_ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('deplete-verrerie', 'hotel-atlas-suite', 'verrerie', 'u-economat', -40000, 'sale', 0, null, 100, 100, '{}', 100);
  precise.raw.prepare(`INSERT INTO inventory_movements
    (id,merchant,item_id,location_id,qty_milli,reason,unit_cost_cents,unit_cost_rate,occurred_ts,srv_ts,meta,created_ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('precise-verrerie', 'hotel-atlas-suite', 'verrerie', 'u-economat', 1000, 'receipt', 0, 45, 200, 200, '{}', 200);
  await precise.createSubmitted('audit-precise', 'verrerie', 1);
  let response = await precise.post({ action: 'review', merchant: 'hotel-atlas-suite', id: 'audit-precise', revision: 2,
    idempotencyKey: 'review:precise', data: { lines: [{ itemId: 'verrerie', qtyApproved: 1, resolution: 'approved' }] } });
  check(response.status === 200, 'I03 precise-cost request passes review');
  response = await precise.post({ action: 'prepare', merchant: 'hotel-atlas-suite', id: 'audit-precise', revision: 3,
    idempotencyKey: 'prepare:precise', data: { lines: [{ itemId: 'verrerie', qtyPrepared: 1 }] } });
  check(response.status === 200, 'I03 precise-cost request passes preparation');
  response = await precise.post({ action: 'confirm', merchant: 'hotel-atlas-suite', id: 'audit-precise', revision: 4,
    idempotencyKey: 'confirm:precise', data: { lines: [{ itemId: 'verrerie', qtyReceived: 1 }] } });
  check(response.status === 200, 'I03 precise-cost transfer is committed through the route');
  const transfer = precise.one("SELECT unit_cost_cents, unit_cost_rate FROM inventory_movements WHERE ref_id LIKE 'request:audit-precise:%' AND reason = 'transfer-in'");
  check(transfer && Number(transfer.unit_cost_cents) === 0 && Number(transfer.unit_cost_rate) === 45,
    'I03 transfer preserves 0.0045 MAD/g instead of collapsing it to zero');
}

// I04 — trigger a failure in the second statement and prove SQLite rolls back the balance update.
{
  const { raw, DB } = fullDb();
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', now);
  const putDoc = raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)');
  putDoc.run(MERCHANT, 'employee-access', JSON.stringify({ members: [{ id: 'staff-1', firstName: 'Amina', lastName: 'Cashier', role: 'Serveur', function: 'Serveur' }] }), 1, now);
  putDoc.run(MERCHANT, 'team', JSON.stringify({ members: [{ id: 'staff-1', firstName: 'Amina', lastName: 'Cashier', role: 'Serveur', function: 'Serveur' }] }), 1, now);
  putDoc.run(MERCHANT, 'attendance', JSON.stringify({ entries: [{ memberId: 'staff-1', staffId: 'staff-1', inTs: now - 1000, outTs: 0 }] }), 1, now);
  putDoc.run(MERCHANT, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 2 } }), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'client-1', 'Client', 10, 0, 1, 80, now, now);
  const cookie = employeeCookie(await employeeToken(SECRET, { merchant: MERCHANT, staffId: 'staff-1' })).split(';')[0];
  const env = { DB, AUTH_SECRET: SECRET };
  const post = (ref) => employeeClientsPost({ env, request: new Request('https://kiwi.test/api/employee-clients', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, clientId: 'client-1', amount: 80, ref }),
  }) });
  raw.exec("CREATE TRIGGER audit_loyalty_failure BEFORE INSERT ON employee_loyalty_events BEGIN SELECT RAISE(ABORT, 'audit fault'); END");
  const failed = await post('employee-audit-fault');
  check(failed.status === 503, 'I04 injected event-write failure is reported as unavailable');
  const afterFailure = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(afterFailure.points) === 10 && Number(afterFailure.visits) === 1 && Number(raw.prepare('SELECT COUNT(*) AS n FROM employee_loyalty_events').get().n) === 0,
    'I04 event failure rolls back the balance mutation and leaves no replay marker');
  raw.exec('DROP TRIGGER audit_loyalty_failure');
  check((await post('employee-audit-ok')).status === 200, 'I04 successful employee loyalty event accrues atomically');
  check((await post('employee-audit-ok')).status === 200, 'I04 identical employee retry is replayed safely');
  const final = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(final.points) === 170 && Number(final.visits) === 2 && Number(final.spend) === 160,
    'I04 balance is accrued exactly once after retry');
}

// I05 — additive purchase events preserve both offline tills, unlike snapshot replacement.
{
  const { raw, DB } = fullDb();
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', now);
  raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 2, threshold: 40 } }), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'client-1', 'Client', 0, 0, 0, 0, now, now);
  const env = { DB, AUTH_SECRET: SECRET };
  const purchase = (ref, amount, clientId = 'client-1') => clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, purchase: { clientId, ref, amount } }),
  }) });
  check((await purchase('offline-till-a', 10.25)).status === 200, 'I05 first additive purchase event preserves centime precision');
  check((await purchase('offline-till-b', 20)).status === 200, 'I05 second additive purchase event is accepted');
  check((await purchase('offline-till-a', 10.25)).status === 200, 'I05 purchase retry is idempotent');
  check((await purchase('offline-till-a', 11)).status === 409, 'I05 same purchase ref with a changed amount is rejected');
  const totals = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(totals.points) === 61 && Number(totals.visits) === 2 && Number(totals.spend) === 30.25,
    'I05 two purchases accumulate points, visits and spend without last-writer loss');
  check(Number(raw.prepare('SELECT COUNT(*) AS n FROM client_purchase_events').get().n) === 2,
    'I05 durable purchase event ledger contains exactly two unique events');
  const syncCreate = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, id: 'sync-first-create', name: 'Offline first sale', source: 'caisse',
      points: 20, stamps: 0, visits: 1, spend: 10, updated: now + 1 }),
  }) });
  check(syncCreate.status === 200, 'I05 first sync-client snapshot is accepted');
  check((await purchase('sync-first-purchase', 10, 'sync-first-create')).status === 200,
    'I05 purchase event can follow an in-flight first client snapshot');
  const syncTotals = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?')
    .get(MERCHANT, 'sync-first-create');
  check(Number(syncTotals.points) === 20 && Number(syncTotals.visits) === 1 && Number(syncTotals.spend) === 10,
    'I05 normal sync-created rows ignore optimistic financial snapshot values and count the event once');
  const imported = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, id: 'legitimate-import', name: 'Imported history', source: 'import',
      financialImport: true, points: 7, stamps: 2, visits: 3, spend: 42.5, updated: now + 2 }),
  }) });
  const importedTotals = raw.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?')
    .get(MERCHANT, 'legitimate-import');
  check(imported.status === 200 && Number(importedTotals.points) === 7 && Number(importedTotals.stamps) === 2
    && Number(importedTotals.visits) === 3 && Number(importedTotals.spend) === 42.5,
  'I05 explicit financial imports retain their supplied opening totals');
  const delayedSnapshot = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, id: 'client-1', name: 'Old till edit', points: 0,
      stamps: 0, visits: 0, spend: 0, updated: now + 999999 }),
  }) });
  check(delayedSnapshot.status === 200, 'I05 delayed legacy full snapshot remains accepted as a profile write');
  const afterSnapshot = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(afterSnapshot.points) === 61 && Number(afterSnapshot.visits) === 2 && Number(afterSnapshot.spend) === 30.25,
    'I05 delayed snapshot cannot overwrite ledger-derived purchase totals');
  const redeem = (ref) => clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
    method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ merchant: MERCHANT, redemption: { clientId: 'client-1', ref } }),
  }) });
  check((await redeem('reward-1')).status === 200, 'I05 reward redemption is an atomic event write');
  const afterRedeem = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(afterRedeem.points) === 21 && Number(afterRedeem.visits) === 2 && Number(afterRedeem.spend) === 30.25,
    'I05 explicit redemption decrements points without changing purchase totals');
  check((await redeem('reward-1')).status === 200, 'I05 reward retry is idempotent');
  const afterRedeemRetry = raw.prepare('SELECT points, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'client-1');
  check(Number(afterRedeemRetry.points) === 21 && Number(raw.prepare('SELECT COUNT(*) AS n FROM client_reward_events').get().n) === 1,
    'I05 delayed/retried redemption cannot double-decrement the balance');
  const pulled = await clientsGet({ env, request: new Request(`https://kiwi.test/api/clients?merchant=${MERCHANT}&since=0`, {
    headers: { cookie: owner },
  }) });
  const pulledBody = await body(pulled);
  const pulledClient = pulledBody.clients.find((row) => row.id === 'client-1');
  check(pulledClient && pulledClient.reward_refs.includes('reward-1'),
    'I05 client GET exposes acknowledged reward references for reconciliation');
}

// I05 client surface — recordPurchase emits an additive event, not a mutable snapshot.
{
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', MERCHANT]]);
  const requests = [];
  const stores = {};
  function define(name, options) {
    const store = stores[name] || { data: {}, listeners: [] };
    store.get = (key) => store.data[key] || (options.blank ? options.blank() : null);
    store.set = (value, key) => { store.data[key] = value; store.listeners.forEach((fn) => fn(key)); };
    store.subscribe = (fn) => { store.listeners.push(fn); return () => {}; };
    stores[name] = store;
    return store;
  }
  const localStorage = { getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) };
  const window = { localStorage, KiwiStore: { define, currentVenue: () => MERCHANT },
    KiwiEnv: { isReal: () => true }, addEventListener: () => {} };
  let vmFetchMode = 'offline';
  let vmEnv;
  const context = { window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage,
    console, Math, Date, JSON, setInterval: () => 1, clearInterval: () => {},
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const method = String(options.method || 'GET').toUpperCase();
      const payload = JSON.parse(options.body || '{}');
      if (vmFetchMode === 'lost' && method === 'POST' && payload.redemption) {
        const response = await clientsPost({ env: vmEnv, request: new Request('https://kiwi.test' + url, {
          method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' }, body: options.body,
        }) });
        throw new Error('lost redemption acknowledgement');
      }
      if (vmFetchMode === 'lost' && method === 'GET' && String(url).indexOf('/api/clients?') === 0) {
        return clientsGet({ env: vmEnv, request: new Request('https://kiwi.test' + url, { headers: { cookie: owner } }) });
      }
      return { ok: false, json: async () => ({ clients: [], cursor: 0 }) };
    } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8'), context, { filename: 'assets/clients-store.js' });
  const { raw: vmRaw, DB: vmDB } = fullDb();
  const vmNow = Date.now();
  vmRaw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', vmNow);
  vmRaw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', vmNow);
  vmRaw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 1, threshold: 5 } }), 1, vmNow);
  vmEnv = { DB: vmDB, AUTH_SECRET: SECRET };
  context.window.KiwiClients.setConfig({ model: 'amount', amount: { perMad: 1, threshold: 5 } }, MERCHANT);
  const client = context.window.KiwiClients.upsert({ name: 'Client', phone: '0612345678' }, MERCHANT);
  context.window.KiwiClients.recordPurchase(client.id, { amount: 10.25 }, MERCHANT);
  const purchaseRequest = requests.map((entry) => JSON.parse(entry.options.body || '{}')).find((payload) => payload.purchase);
  check(!!purchaseRequest && purchaseRequest.purchase.clientId === client.id && purchaseRequest.purchase.amount === 10.25,
    'I05 client purchase sync sends a stable additive centime-precise event');
  for (let index = 0; index < 501; index += 1) {
    context.window.KiwiClients.recordPurchase(client.id, { amount: 1 }, MERCHANT);
  }
  const queuedPurchases = JSON.parse(storage.get(`kiwi:clients-purchases:v1:${MERCHANT}`) || '[]');
  check(queuedPurchases.length >= 502, 'I05 offline purchase queue retains all unacknowledged events beyond 500');

  /* Reproduce a lost redemption acknowledgement against the real production
   * POST/GET handlers: the server commits, the VM sees a transport failure,
   * then pulls the canonical row. reward_refs must clear only that event before
   * any local pending delta is applied, or the same redemption is subtracted
   * twice after reload. */
  const localBeforeRedemption = context.window.KiwiClients.get(client.id, MERCHANT);
  const queuedPurchaseEvents = JSON.parse(storage.get(`kiwi:clients-purchases:v1:${MERCHANT}`) || '[]');
  const purchaseEventInsert = vmRaw.prepare(`INSERT INTO client_purchase_events
    (merchant,ref,client_id,amount,points,stamps,visits,created_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)`);
  queuedPurchaseEvents.forEach((event, index) => purchaseEventInsert.run(
    MERCHANT, event.ref, event.clientId, event.amount, event.points || 0, event.stamps || 0,
    event.visits || 1, event.created || vmNow, vmNow + index + 1,
  ));
  vmRaw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, client.id, 'Client', localBeforeRedemption.points, localBeforeRedemption.stamps,
      localBeforeRedemption.visits, localBeforeRedemption.spend, localBeforeRedemption.updated,
      vmNow + queuedPurchaseEvents.length + 10);
  vmRaw.prepare('UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = \'fidelity\'')
    .run(JSON.stringify({ model: 'amount', amount: { perMad: 1, threshold: 5 } }), MERCHANT);
  vmFetchMode = 'lost';
  context.window.KiwiClients.redeem(client.id, MERCHANT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const redemptionRequest = requests.map((entry) => JSON.parse(entry.options.body || '{}')).find((payload) => payload.redemption);
  check(!!redemptionRequest && redemptionRequest.redemption.clientId === client.id,
    'I05 client redemption sync sends an explicit additive redemption event');
  const pendingRewardBeforePull = JSON.parse(storage.get(`kiwi:clients-redemptions:v1:${MERCHANT}`) || '[]');
  check(pendingRewardBeforePull.length === 1, 'I05 lost redemption acknowledgement remains pending locally');
  await new Promise((resolve) => context.window.KiwiClients.pull(MERCHANT, resolve));
  const afterLostAckPull = context.window.KiwiClients.get(client.id, MERCHANT);
  const pendingRewardAfterPull = JSON.parse(storage.get(`kiwi:clients-redemptions:v1:${MERCHANT}`) || '[]');
  const canonical = vmRaw.prepare('SELECT points FROM clients WHERE merchant=? AND id=?').get(MERCHANT, client.id);
  check(pendingRewardAfterPull.length === 0 && Number(afterLostAckPull.points) === Number(canonical.points),
    'I05 lost redemption ACK plus pull clears the reward once without double-subtracting');
}

// I05 cursor/page races: event writes allocate srv_ts inside their atomic
// batch, and GET only acknowledges events covered by the returned row page.
{
  const { raw, DB } = fullDb();
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', now);
  raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 1 } }), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'cursor-client', 'Cursor Client', 0, 0, 0, 0, now, 100);
  const env = { DB, AUTH_SECRET: SECRET };
  const purchase = (ref, clientId = 'cursor-client', dbEnv = env) => clientsPost({ env: dbEnv,
    request: new Request('https://kiwi.test/api/clients', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, purchase: { clientId, ref, amount: 1 } }),
    }) });

  let releaseA;
  const releasedA = new Promise((resolve) => { releaseA = resolve; });
  let enteredA;
  const entered = new Promise((resolve) => { enteredA = resolve; });
  let heldA = false;
  const realBatch = DB.batch.bind(DB);
  DB.batch = async (statements) => {
    const isA = statements.some((statement) => (statement.boundArgs || []).includes('cursor-a'));
    if (isA && !heldA) {
      heldA = true;
      enteredA();
      await releasedA;
    }
    return realBatch(statements);
  };
  const delayedA = purchase('cursor-a');
  await entered;
  const committedB = await purchase('cursor-b');
  releaseA();
  const committedA = await delayedA;
  check(committedA.status === 200 && committedB.status === 200,
    'I05 delayed event writers both commit through the production route');
  const events = raw.prepare('SELECT ref, srv_ts FROM client_purchase_events WHERE merchant=? ORDER BY srv_ts').all(MERCHANT);
  const clientAfterRace = raw.prepare('SELECT points, visits, spend, srv_ts FROM clients WHERE merchant=? AND id=?')
    .get(MERCHANT, 'cursor-client');
  const sequenceAfterRace = raw.prepare('SELECT last_ts FROM client_sync_sequences WHERE merchant=?').get(MERCHANT);
  check(events.length === 2 && Number(events[0].srv_ts) < Number(events[1].srv_ts)
    && Number(clientAfterRace.srv_ts) === Number(events[1].srv_ts)
    && Number(sequenceAfterRace.last_ts) === Number(events[1].srv_ts)
    && Number(clientAfterRace.points) === 2 && Number(clientAfterRace.visits) === 2,
  'I05 delayed batch allocation stays monotonic and cannot move the client cursor backwards');

  const readRaw = new DatabaseSync(':memory:');
  readRaw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  readRaw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('audit-owner', 'audit@example.test', 'Audit Owner', 'Audit', 's', 'h', now);
  readRaw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Audit', 'audit-owner', now);
  readRaw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify({ model: 'amount', amount: { perMad: 1 } }), 1, now);
  readRaw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'read-race-client', 'Read Race Client', 0, 0, 0, 0, now, 100);
  const readBase = facade(readRaw);
  const readEnv = { DB: readBase, AUTH_SECRET: SECRET };
  let injectedPurchase;
  const readDB = {
    prepare(sql) {
      const inner = readBase.prepare(sql);
      const statement = {
        bind(...args) { inner.bind(...args); return statement; },
        async first() { return inner.first(); },
        async run() { return inner.run(); },
        async all() {
          const result = await inner.all();
          if (!injectedPurchase && String(sql).includes('FROM clients') && String(sql).includes('srv_ts > ?')) {
            injectedPurchase = await purchase('read-race-purchase', 'read-race-client', readEnv);
          }
          return result;
        },
      };
      return statement;
    },
    batch: readBase.batch.bind(readBase),
  };
  const readRequest = (since) => new Request(`https://kiwi.test/api/clients?merchant=${MERCHANT}&since=${since}`, {
    headers: { cookie: owner },
  });
  const firstPage = await clientsGet({ env: { DB: readDB, AUTH_SECRET: SECRET }, request: readRequest(0) });
  const firstBody = await body(firstPage);
  const firstClient = firstBody.clients.find((row) => row.id === 'read-race-client');
  check(injectedPurchase && injectedPurchase.status === 200 && firstClient && Number(firstClient.points) === 0
    && !firstClient.purchase_refs.includes('read-race-purchase') && Number(firstBody.cursor) === 100,
  'I05 GET does not acknowledge a purchase committed after its row snapshot');
  const secondPage = await clientsGet({ env: { DB: readDB, AUTH_SECRET: SECRET }, request: readRequest(firstBody.cursor) });
  const secondBody = await body(secondPage);
  const secondClient = secondBody.clients.find((row) => row.id === 'read-race-client');
  check(secondClient && Number(secondClient.points) === 1 && secondClient.purchase_refs.includes('read-race-purchase')
    && Number(secondBody.cursor) > Number(firstBody.cursor),
  'I05 next pull sees the delayed purchase balance and its acknowledgement together');

  const failingRefsDB = {
    prepare(sql) {
      const inner = readBase.prepare(sql);
      const statement = {
        bind(...args) { inner.bind(...args); return statement; },
        async first() { return inner.first(); },
        async run() { return inner.run(); },
        async all() {
          if (String(sql).includes('json_each')) throw new Error('injected reference read failure');
          return inner.all();
        },
      };
      return statement;
    },
    batch: readBase.batch.bind(readBase),
  };
  const failedPage = await clientsGet({ env: { DB: failingRefsDB, AUTH_SECRET: SECRET }, request: readRequest(0) });
  const failedBody = await body(failedPage);
  check(failedPage.status === 503 && failedBody.error === 'sync-unavailable'
    && failedBody.cursor === 0 && !Array.isArray(failedBody.clients),
  'I05 reference-read failure returns retryable unavailable without a partial page or cursor advance');
}

console.log(`audit-remediation-inventory-loyalty-test: ${checks} checks passed`);
