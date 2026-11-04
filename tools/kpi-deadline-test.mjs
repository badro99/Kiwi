// Home KPI band: the hotel-performance and table-time reads are bounded (gap r14 #100).
// A server that never answers used to leave the tile loading forever; after the
// deadline the request is aborted and the tile reads « unavailable ».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';

const src = fs.readFileSync('assets/daterange/kpi.js', 'utf8');
const run = (name, ctx) => vm.runInNewContext(split.declaration(src, name) + '\n' + name, ctx);
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }

function harness() {
  const timers = [], cleared = [], calls = [];
  let renders = 0;
  const ctx = {
    URLSearchParams, AbortController, Date,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => cleared.push(id),
    // A server that never answers, unless the request is aborted.
    fetch: (url, init) => { calls.push({ url, init }); return new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }); },
    __state: {
      hotelMerchant: () => 'fixture', HOTEL_PERF_TTL: 0, TABLE_TIME_TTL: 0,
      hotelPerf: new Map(), tableTime: new Map(), renderKpiBand: () => { renders++; },
    },
  };
  return { ctx, timers, cleared, calls, renders: () => renders };
}
const settle = () => new Promise((r) => setImmediate(r));

for (const [name, call] of [['tableTimeEntry', (fn) => fn(1, 2)], ['hotelPerfEntry', (fn) => fn({ from: '2026-11-01', to: '2026-11-02' })]]) {
  await test(name + ': a silent server is cut at 15 s and the tile says unavailable', async () => {
    const h = harness(), fn = run(name, h.ctx);
    const entry = call(fn);
    assert.equal(h.calls.length, 1);
    assert.ok(h.calls[0].init.signal, 'the request carries an abort signal');
    assert.equal(h.timers.length, 1); assert.equal(h.timers[0].ms, 15000);
    assert.equal(entry.loading, true);
    h.timers[0].fn(); await settle(); await settle();
    assert.equal(entry.loading, false, 'the tile is released');
    assert.equal(entry.error, 'unavailable');
    assert.equal(h.renders(), 1, 'and repainted once');
  });
  await test(name + ': a normal answer clears its timer', async () => {
    const h = harness();
    h.ctx.fetch = () => Promise.resolve({ ok: true, json: async () => ({ ok: true, visits: 8, avgMin: 14, occupancyPct: 50 }) });
    const entry = call(run(name, h.ctx)); await settle(); await settle();
    assert.equal(entry.error, '');
    assert.deepEqual(h.cleared, [1]);
  });
}
process.exit(failures ? 1 : 0);
