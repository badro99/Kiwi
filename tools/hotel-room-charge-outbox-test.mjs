// r20 hotel B0/B1/B2: the hotel till's room-charge outbox never drops, never overwrites, never hangs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
const source = fs.readFileSync(new URL('../assets/pos-hotel.js', import.meta.url), 'utf8');
const seam = 'window.audit = { flushRoomCharges, enqueueRoomCharge, roomChargeRows, state, flushing: () => roomChargeFlushing };';
const instrumented = source.replace(/\}\)\(\);\s*$/, seam + '})();');
const KEY = 'kiwi:hotelRoomChargeOutbox:v1';

function boot({ fetchImpl }) {
  const storage = new Map(), timers = [];
  const window = {
    KiwiEnv: { isReal: () => true }, KiwiPlatform: { isPaired: () => true, pairedVenue: () => ({ merchant: 'm', name: 'H' }) },
    KiwiPosDispatch: { register() {} }, KiwiVerticalState: { open: () => ({ save() {} }) },
    KiwiCaisseContext: { current: () => ({ merchant: 'm', terminalId: 't', cashierId: 'c', shiftId: 's' }) }, addEventListener() {},
  };
  const context = { window, document:{ querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}) },
    localStorage:{ getItem:k => storage.get(k) ?? null, setItem:(k, v) => storage.set(k, v) }, navigator:{ onLine:true },
    setTimeout:(fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout(i) { if (timers[i - 1]) timers[i - 1].dead = true; }, console, Date, Intl, Promise,
    fetch:(...args) => fetchImpl(...args) };
  vm.runInNewContext(deadlineVmSource(instrumented), deadlineVmContext(context), { filename:'assets/pos-hotel.js' });
  return { audit: window.audit, storage, timers };
}
const rows = h => JSON.parse(h.storage.get(KEY) || '[]');
const charge = n => ({ merchant:'m', terminalId:'t', saleId:'sale-' + String(n).padStart(4, '0'), roomId:'101', shiftId:'s', cashierId:'c' });
const reply = (status, body) => ({ ok:status < 300, status, json:async () => body || {} });

// B0: more than 300 unacknowledged charges are all kept.
{
  const h = boot({ fetchImpl: async () => { throw Error('offline'); } });
  for (let n = 0; n < 340; n++) assert.equal(h.audit.enqueueRoomCharge(charge(n)), true);
  assert.equal(rows(h).length, 340, 'no unsent charge is trimmed');
  assert.equal(rows(h)[0].saleId, 'sale-0000', 'the oldest unsent charge is still queued');
}

// B1: a charge queued while a flush is awaiting survives it; only acknowledged sales leave.
{
  let h, release;
  const gate = new Promise(resolve => { release = resolve; });
  h = boot({ fetchImpl: async () => { await gate; return reply(200, { ok:true }); } });
  h.audit.enqueueRoomCharge(charge(1));
  const flush = h.audit.flushRoomCharges();
  await new Promise(resolve => setImmediate(resolve));
  h.audit.enqueueRoomCharge(charge(2));
  release();
  await flush;
  assert.deepEqual(rows(h).map(r => r.saleId), ['sale-0002'], 'the first is acknowledged and gone, the one queued mid-flush stays');
  assert.equal(h.audit.state.queued, 1);
}
// A refusal marks its row without touching the others; a 5xx keeps it as is.
{
  const h = boot({ fetchImpl: async (_, o) => JSON.parse(o.body).saleId === 'sale-0001' ? reply(422, { error:'room-closed' }) : reply(503) });
  h.audit.enqueueRoomCharge(charge(1)); h.audit.enqueueRoomCharge(charge(2));
  await h.audit.flushRoomCharges();
  const left = rows(h);
  assert.equal(left.length, 2);
  assert.equal(left[0].blocked, 'room-closed');
  assert.equal(left[1].blocked, undefined);
}

// A sale the server has not received yet (404 sale-not-found) keeps its charge queued, unmarked.
{
  const h = boot({ fetchImpl: async () => reply(404, { error:'sale-not-found' }) });
  h.audit.enqueueRoomCharge(charge(5));
  await h.audit.flushRoomCharges();
  assert.deepEqual(rows(h).map(r => [r.saleId, r.blocked]), [['sale-0005', undefined]]);
}

// B2: a request that never answers ends at its deadline; the flush flag is released and the charge stays queued.
{
  const h = boot({ fetchImpl: () => new Promise(() => {}) });
  h.audit.enqueueRoomCharge(charge(7));
  const flush = h.audit.flushRoomCharges();
  await new Promise(resolve => setImmediate(resolve));
  const deadline = h.timers.find(t => t.delay > 19000 && t.delay <= 20000 && !t.dead);
  assert.ok(deadline, 'the request is bounded by a 20 s deadline');
  assert.equal(h.audit.flushing(), true);
  await deadline.fn();
  await Promise.race([flush, new Promise((_, no) => setTimeout(() => no(Error('HANG: flush never ended')), 1000))]);
  assert.equal(h.audit.flushing(), false, 'a hung request no longer blocks later charges');
  assert.deepEqual(rows(h).map(r => r.saleId), ['sale-0007'], 'the unanswered charge stays queued for replay');
}
// A body that never finishes is bounded too.
{
  const h = boot({ fetchImpl: async () => ({ ok:false, status:409, json:() => new Promise(() => {}) }) });
  h.audit.enqueueRoomCharge(charge(8));
  const flush = h.audit.flushRoomCharges();
  await new Promise(resolve => setImmediate(resolve));
  const deadline = h.timers.find(t => t.delay > 19000 && t.delay <= 20000 && !t.dead);
  assert.ok(deadline, 'the body read is inside the same deadline');
  await deadline.fn();
  await Promise.race([flush, new Promise((_, no) => setTimeout(() => no(Error('HANG: body read')), 1000))]);
  assert.equal(h.audit.flushing(), false);
  assert.equal(rows(h)[0].blocked, undefined, 'a body that timed out is uncertain, not a refusal');
}
console.log('PASS hotel room-charge outbox: never trimmed, never overwritten mid-flush, bounded requests');
