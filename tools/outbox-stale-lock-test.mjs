#!/usr/bin/env node
/* A hung send must not hold every later sale hostage.
 *   node tools/outbox-stale-lock-test.mjs
 *
 * Browse, 21 Nov 2026: four table payments rung up on the till between 13:56
 * and 14:21 reached the server together at 14:43:43-46, 22 to 47 minutes late.
 * Until each sale arrived, its table stayed lit as occupied on the waiters'
 * phones. The till's outbox keeps one `flushing` lock while it sends; every
 * trigger (a new sale, the feed poll, the retry timer) returns at once while
 * that lock is held. `flushStartedAt` was written and never read: if one step
 * of a send never settled (an IndexedDB call, a request), nothing ever released
 * the lock, and the sales waited for the page to reload.
 *
 * Held here, on the shipped assets/live-link/queue-store.js in a VM, with an
 * offline store whose first claim never answers:
 *   · a young lock is respected (no second sender while the first may finish);
 *   · past the stale limit, the next trigger takes the lock and sends the sale;
 *   · the old send, when it finally answers, cannot release the new owner's lock.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/live-link/queue-store.js', import.meta.url), 'utf8');
let passed = 0;
const ok = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); passed++; console.log('  ✓ ' + msg); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

let clock = 1795219200000;
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }

const row = { id: 'sale-ref-1', tenant: 'fixture-cafe', payload: { id: 'sale-ref-1', merchant: 'fixture-cafe', amountCents: 6800, method: 'cash', ts: clock } };
let claims = 0, claimCalls = 0, firstClaimAnswer = null, acked = false;
const sent = [], acks = [];
const O = {
  available: () => true,
  subscribe() {},
  migrateLegacy: () => Promise.resolve(),
  stats: () => Promise.resolve({ pending: acked ? 0 : 1, blocked: 0, sending: 0, total: acked ? 0 : 1, storageError: false, lastStatus: 0, lastError: '', lastAttemptAt: 0 }),
  claim() {
    claimCalls++;
    if (acked && claims >= 2) return Promise.resolve(null);
    claims++;
    const leased = Object.assign({}, row, { leaseToken: 'lease-' + claims });
    if (claims === 1) return new Promise((resolve) => { firstClaimAnswer = () => resolve(leased); }); // never answers on its own
    return Promise.resolve(leased);
  },
  acknowledge: (id, lease) => { acks.push(lease); acked = true; return Promise.resolve(true); },
  reject: () => Promise.resolve(true),
};
const store = new Map();
const window = { KiwiOffline: O, dispatchEvent() {} };
const context = {
  window, Date: FakeDate, Promise, JSON, Math, Object, Array, Number, String,
  navigator: { onLine: true },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, console,
};
vm.runInNewContext(src, context);

let hangSend = -1; // index of the one request that never answers
const ctx = {
  merchant: () => 'fixture-cafe', on: () => true, tenantHold: () => null, serverSession: () => '',
  stableId: (m, e) => e.id, scheduleRecovery() {}, refundApprovalRefused: () => false, recoverTillProof() {},
  moneySignal() {}, pingLocal() {}, flushQueue() {},
  moneyRequest(body) {
    sent.push(body.id);
    if (sent.length - 1 === hangSend) return new Promise(() => {});
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ ok: true, id: body.id }) });
  },
  paymentCompletion: (r) => r.json().then((d) => ({ complete: !!d.ok, pending: false, error: '', id: d.id })),
};
const q = window.KiwiSaleQueueStore.create(ctx);
await q.migrateLegacy();

q.flush();
await settle();
ok(claims === 1 && sent.length === 0, 'the first send hangs inside the offline store', `claims=${claims} sent=${sent.length}`);

clock += 10000;
q.flush();
await settle();
ok(claims === 1, 'ten seconds later the lock is still respected (no second sender)', `claims=${claims}`);

clock += 50000;
q.flush();
await settle();
ok(claims === 2, 'past the stale limit the next trigger takes the lock', `claims=${claims}`);
ok(sent.length === 1 && sent[0] === row.id, 'and the waiting sale is sent', JSON.stringify(sent));
ok(acks.includes('lease-2'), 'the server acceptance is acknowledged under the new lease', JSON.stringify(acks));

/* A third sender now hangs on its request. The first send finally answers:
   it must not hand the lock back while the third still holds it. */
clock += 1000;
acked = false; hangSend = sent.length; // a new sale; the live sender's request hangs, the abandoned one will answer
q.flush();
await settle();
const claimsBefore = claimCalls;
firstClaimAnswer();
await settle();
q.flush();
await settle();
ok(claimCalls === claimsBefore, 'a late answer from the abandoned send does not release the live sender\'s lock', `claim calls ${claimsBefore} → ${claimCalls}`);

/* A healthy sender keeps going: one trigger sends every waiting sale, not
   just the first (the chain re-enters after each acknowledged sale). */
{
  const rows = ['sale-a', 'sale-b', 'sale-c'].map((id) => ({ id, tenant: 'fixture-cafe', payload: { id, merchant: 'fixture-cafe', amountCents: 100, method: 'cash', ts: clock } }));
  const left = new Set(rows.map((r) => r.id)), sentB = [];
  let n = 0;
  const O2 = {
    available: () => true, subscribe() {}, migrateLegacy: () => Promise.resolve(),
    stats: () => Promise.resolve({ pending: left.size, blocked: 0, sending: 0, total: left.size, storageError: false, lastStatus: 0, lastError: '', lastAttemptAt: 0 }),
    claim: () => { const r = rows.find((x) => left.has(x.id) && !x.leased); if (!r) return Promise.resolve(null); r.leased = true; return Promise.resolve(Object.assign({}, r, { leaseToken: 'l' + (++n) })); },
    acknowledge: (id) => { left.delete(id); return Promise.resolve(true); },
    reject: () => Promise.resolve(true),
  };
  const win2 = { KiwiOffline: O2, dispatchEvent() {} };
  vm.runInNewContext(src, Object.assign({}, context, { window: win2 }));
  const q2 = win2.KiwiSaleQueueStore.create(Object.assign({}, ctx, {
    moneyRequest(body) { sentB.push(body.id); return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ ok: true, id: body.id }) }); },
  }));
  await q2.migrateLegacy();
  q2.flush();
  await settle(); await settle();
  ok(sentB.length === 3 && left.size === 0, 'one trigger sends every waiting sale in turn', JSON.stringify(sentB));
}

console.log(`outbox-stale-lock: ${passed} passed`);
