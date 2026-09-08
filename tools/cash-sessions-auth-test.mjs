#!/usr/bin/env node
/* Regression for the real pairing/operator boundary. This executes the
 * shipped cash-session client and route; it does not reimplement either auth
 * decision. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as postCashSession } from '../functions/api/cash-sessions.js';
import { operatorIdToken, operatorToken, terminalToken } from '../functions/auth/_lib.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/cash-sessions.js'), 'utf8');
const SECRET = 'cash-session-auth-regression-secret';
const MERCHANT = 'cafe-atlas';

async function clientRun(isPaired, outbox, pending = [], options = {}) {
  const memory = new Map([
    ['kiwi:caisse:terminal-id:v1', 'term-demo-123456'],
    ['kiwi:cash-session-outbox:v1', JSON.stringify(outbox)],
  ]);
  const calls = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  let pairing = isPaired;
  const writes = [];
  let lockActive = 0;
  let maxLockActive = 0;
  let lockQueue = Promise.resolve();
  let failWrites = !!options.failWrites;
  const storage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => {
      if (failWrites && key === 'kiwi:cash-session-outbox:v1') throw new Error('storage-full');
      if (key === 'kiwi:cash-session-outbox:v1') writes.push(JSON.parse(String(value)));
      memory.set(key, String(value));
    },
  };
  const locks = options.locks ? {
    request: (name, action) => {
      calls.push({ lock: name });
      const run = lockQueue.then(async () => {
        lockActive += 1;
        maxLockActive = Math.max(maxLockActive, lockActive);
        try { return await action(); } finally { lockActive -= 1; }
      });
      lockQueue = run.then(() => undefined, () => undefined);
      return run;
    },
  } : undefined;
  function listen(map, type, handler) {
    const list = map.get(type) || [];
    list.push(handler); map.set(type, list);
  }
  function fire(map, event) {
    for (const handler of map.get(event.type) || []) handler(event);
  }
  const window = {
    localStorage: storage,
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => MERCHANT },
    KiwiCaissePairing: { isPaired: () => pairing },
    __kiwiCashSessionPending: pending,
    addEventListener(type, handler) { listen(windowListeners, type, handler); },
    dispatchEvent(event) { calls.push({ event: event.type, detail: event.detail }); fire(windowListeners, event); },
  };
  const document = {
    readyState: 'complete',
    addEventListener(type, handler) { listen(documentListeners, type, handler); },
    dispatchEvent(event) { fire(documentListeners, event); },
  };
  const context = {
    console, Date, Map, JSON, Math, Promise, setTimeout,
    localStorage: storage, navigator: options.locks ? { locks } : {}, document,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    window,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ ready: true, events: [] }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'assets/cash-sessions.js' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { calls, storage, writes, api: window.KiwiCashSessions, pending,
    setPaired(value) { pairing = !!value; },
    setFailWrites(value) { failWrites = !!value; },
    fireOnline() { fire(windowListeners, { type: 'online' }); },
    firePaired() { fire(documentListeners, { type: 'kiwi-paired' }); },
    lockStats: {
    get maxActive() { return maxLockActive; },
  } };
}

const staleEvent = {
  id: 'cash-stale-demo', merchant: MERCHANT, terminalId: 'term-demo-123456',
  sessionId: 'session-demo', eventType: 'open', actorId: 'cashier-1',
  expectedCents: 50000, openedAt: Date.now() - 2000, occurredAt: Date.now() - 2000,
};
const pendingEvent = { ...staleEvent, id: 'cash-pending-boot' };
const foreignEvent = { ...staleEvent, id: 'cash-foreign', merchant: 'other-merchant' };
const operator = await clientRun(false, [staleEvent, foreignEvent], [pendingEvent]);
assert.equal(operator.calls.filter((call) => call.options && call.options.method === 'POST').length, 0,
  'unpaired operator/demo tab does not POST stale cash telemetry');
assert.deepEqual(operator.api._test.readOutbox().map((event) => event.id).sort(), ['cash-foreign', 'cash-pending-boot', 'cash-stale-demo'],
  'boot persists pending events instead of losing them during splice');
assert.ok(operator.calls.some((call) => call.event === 'kiwi:cash-sessions-pending-pairing'),
  'unpaired operator/demo tab surfaces pending pairing status');
assert.deepEqual(JSON.parse(JSON.stringify(operator.api.status())), {
  merchant: MERCHANT, paired: false, pendingPairing: true, pendingCount: 2, storageError: false,
}, 'pending pairing is available through the public status API');
assert.ok(operator.calls.some((call) => call.event === 'kiwi:cash-sessions'
  && call.detail && call.detail.pendingPairing === true),
  'pending pairing is also published on the public cash-session event');
operator.setPaired(true);
operator.fireOnline();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(operator.calls.filter((call) => call.options && call.options.method === 'POST').length, 1,
  'network restoration wakes an initially unpaired cash-session queue');
assert.equal(operator.calls.filter((call) => call.options && call.options.method === 'POST')
  .every((call) => JSON.parse(call.options.body).merchant === MERCHANT), true,
  'transport never submits a foreign-merchant outbox row');
assert.ok(operator.api._test.readOutbox().some((event) => event.id === 'cash-foreign'),
  'foreign-merchant rows remain retained for their own active tenant');

const pairingWake = await clientRun(false, [staleEvent]);
pairingWake.setPaired(true);
pairingWake.firePaired();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(pairingWake.calls.filter((call) => call.options && call.options.method === 'POST').length, 1,
  'published kiwi-paired event wakes an initially unpaired cash-session queue');

const paired = await clientRun(true, [staleEvent]);
assert.equal(paired.calls.filter((call) => call.options && call.options.method === 'POST').length, 1,
  'paired caisse still flushes cash telemetry');

const open = { ...staleEvent, id: 'cash-boot-open', eventType: 'open' };
const movement = { ...staleEvent, id: 'cash-boot-movement', eventType: 'movement', amountCents: 2500 };
const close = { ...staleEvent, id: 'cash-boot-close', eventType: 'close', countedCents: 52500, gapCents: 0 };
const bootOrder = await clientRun(false, [], [open, movement, close], { locks: true });
assert.equal(bootOrder.lockStats.maxActive, 1, 'boot drain never overlaps Web Lock read/modify/write sections');
assert.deepEqual(bootOrder.writes.slice(0, 3).map((rows) => rows.map((row) => row.id)), [
  ['cash-boot-open'],
  ['cash-boot-open', 'cash-boot-movement'],
  ['cash-boot-open', 'cash-boot-movement', 'cash-boot-close'],
], 'boot persists open, movement, close in original order');
assert.deepEqual(bootOrder.pending, [], 'boot removes each pending event only after durable save acknowledgement');

const interleaved = await clientRun(false, [], [], { locks: true });
const concurrentA = { ...staleEvent, id: 'cash-lock-a', eventType: 'open' };
const concurrentB = { ...staleEvent, id: 'cash-lock-b', eventType: 'movement' };
assert.deepEqual(await Promise.all([
  interleaved.api.emit(concurrentA), interleaved.api.emit(concurrentB),
]), [true, true], 'async emit resolves only after its locked durable write');
assert.equal(interleaved.lockStats.maxActive, 1, 'concurrent emit calls share one Web Lock');
assert.deepEqual(interleaved.api._test.readOutbox().map((event) => event.id), ['cash-lock-a', 'cash-lock-b'],
  'locked read/modify/write preserves both concurrent events');

const failedPending = [open, movement, close];
const failedStorage = await clientRun(false, [], failedPending, { failWrites: true });
assert.deepEqual(failedStorage.pending.map((event) => event.id), failedPending.map((event) => event.id),
  'failed storage keeps every pending event for retry');
assert.deepEqual(failedStorage.api._test.readOutbox(), [], 'failed storage does not claim an undurable event');
assert.equal(failedStorage.api.status().storageError, true, 'public status exposes a durable outbox storage failure');

const legacyBoot = { ...open };
delete legacyBoot.id;
const legacyFailure = await clientRun(false, [], [legacyBoot], { failWrites: true });
assert.equal(legacyFailure.pending.length, 1, 'legacy boot failure retains one event, not a raw and generated duplicate');
const legacyId = legacyFailure.pending[0].id;
assert.ok(legacyId, 'legacy boot freezes identity before its first write');
legacyFailure.setFailWrites(false);
legacyFailure.setPaired(true);
legacyFailure.fireOnline();
await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(legacyFailure.pending.length, 0, 'legacy boot leaves memory only after persistence');
assert.deepEqual(legacyFailure.calls.filter(c => c.options?.method === 'POST').map(c => JSON.parse(c.options.body).id), [legacyId], 'legacy boot recovery sends its original ID exactly once');
const directFailure = await clientRun(false, [], [], { failWrites: true });
const directEvent = { ...staleEvent, id: 'cash-direct-retry', merchant: MERCHANT, terminalId: 'term-direct-123456' };
assert.equal(directFailure.api.emit(directEvent), false, 'direct emit reports the failed persistence without pretending it is durable');
assert.deepEqual(directFailure.pending.map((event) => ({ id: event.id, merchant: event.merchant, terminalId: event.terminalId })), [{
  id: directEvent.id, merchant: MERCHANT, terminalId: directEvent.terminalId,
}], 'failed direct emit retains one stable pending row with its original tenant and terminal');
assert.equal(directFailure.api.status().pendingCount, 1, 'public status includes the active direct retry row');
directFailure.setFailWrites(false);
directFailure.setPaired(true);
directFailure.fireOnline();
directFailure.firePaired();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(directFailure.calls.filter((call) => call.options && call.options.method === 'POST').length, 1,
  'direct retry buffer recovers on the online wake path');
assert.deepEqual(directFailure.pending, [], 'direct retry buffer is removed only after durable save');
assert.equal(directFailure.calls.filter((call) => call.options && call.options.method === 'POST')
  .map((call) => JSON.parse(call.options.body).id).filter((id) => id === directEvent.id).length, 1,
  'direct recovery submits exactly one stable event');

function normalize(sql) { return String(sql).replace(/\s+/g, ' ').trim(); }
const db = new DatabaseSync(':memory:');
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
for (const statement of schema.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) db.exec(statement);
db.prepare("INSERT INTO merchant_config (merchant, features, status, till_epoch, updated_ts) VALUES (?, '{}', 'active', 0, ?)").run(MERCHANT, Date.now());
db.prepare("INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('op-demo', 'Demo operator', 's', 'h', ?)").run(Date.now());
const env = {
  DB: {
    prepare(sql) {
      const query = normalize(sql); let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return db.prepare(query).get(...args) || null; },
        async all() { return { results: db.prepare(query).all(...args) }; },
        async run() { const result = db.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
      };
      return statement;
    },
  },
  AUTH_SECRET: SECRET,
};
function request(body, cookie = '') {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request('https://kiwi.test/api/cash-sessions', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}
async function legacyTillToken(secret, merchant) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`kiwi-till-v1:${merchant}`)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
function validEvent(overrides = {}) {
  const now = Date.now() - 2000;
  return {
    id: 'cash-route-open', merchant: MERCHANT, terminalId: 'term-route-123456', sessionId: 'session-route',
    eventType: 'open', actorId: 'cashier-pin-owner', expectedCents: 50000,
    openedAt: now, occurredAt: now, ...overrides,
  };
}

const noProof = await postCashSession({ env, request: request(validEvent()) });
const operatorCookie = `kiwi_op=${await operatorToken(SECRET)}; kiwi_op_id=${await operatorIdToken(SECRET, 'op-demo')}; kiwi_sess=operator-demo-session`;
const operatorNoProof = await postCashSession({ env, request: request(validEvent({ id: 'cash-operator-no-proof' }), operatorCookie) });
assert.equal(noProof.status, 403, 'anonymous/demo without till proof remains write-denied');
assert.equal(operatorNoProof.status, 403, 'named operator without till proof remains write-denied');
const till = await legacyTillToken(SECRET, MERCHANT);
const opened = await postCashSession({
  env,
  request: request(validEvent(), `kiwi_till=${till}`),
});
assert.equal(opened.status, 201, 'paired till token keeps published pairing compatibility');
const terminal = await terminalToken(SECRET, MERCHANT, 'term-route-123456');
const missingTerminal = await postCashSession({
  env,
  request: request(validEvent({ id: 'cash-route-missing-terminal', sessionId: 'session-route-2' }), `kiwi_till=${till}`),
});
assert.equal(missingTerminal.status, 403, 'known terminal cannot continue without its terminal cookie');
const closed = await postCashSession({
  env,
  request: request(validEvent({
    id: 'cash-route-close', eventType: 'close', countedCents: 50000, gapCents: 0,
  }), `kiwi_till=${till}; kiwi_terminal=${terminal}`),
});
assert.equal(closed.status, 201, 'paired till with terminal proof can close the session');
assert.equal(db.prepare("SELECT actor_id FROM cash_session_events WHERE id = 'cash-route-close'").get().actor_id,
  'cashier-pin-owner', 'cash-session route preserves the PIN-attributed actor');

console.log('✓ cash-sessions auth: operator queue held, paired route accepted, PIN actor preserved');
