import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const drain = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
for (const indexed of [false, true]) test(`${indexed ? 'IndexedDB' : 'legacy'} retains pending settlement and retries on timer after reload`, async () => {
  let now = Date.now(), pending = true, timerId = 0;
  const timers = new Map(), rows = new Map(), sent = [], events = [];
  const values = new Map([['kiwiLive', '1'], ['kiwiPairedVenue', JSON.stringify({ merchant: 'recovery-test' })]]);
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const O = {
    available: () => true, subscribe() {}, migrateLegacy: async () => {},
    stats: async () => ({ pending: rows.size, total: rows.size }),
    enqueue: async (_channel, _tenant, payload) => { rows.set(payload.id, { id: payload.id, payload, nextAt: 0 }); },
    claim: async (_channel, _tenant, opts) => [...rows.values()].find(r => opts.force || r.nextAt <= now) || null,
    acknowledge: async id => { rows.delete(id); },
    reject: async id => { rows.get(id).nextAt = now + 2000; },
  };
  function boot() {
    const document = { readyState: 'complete', hidden: false, addEventListener() {}, dispatchEvent() {}, createElement: () => ({}) };
    const window = { document, localStorage: storage, KiwiEnv: { isReal: () => true },
      addEventListener() {}, dispatchEvent: e => events.push(e), ...(indexed ? { KiwiOffline: O } : {}) };
    vm.runInNewContext(source, { window, document, localStorage: storage, navigator: { onLine: true },
      location: { search: '', hostname: 'kiwi.test' }, URLSearchParams,
      Date: class extends Date { static now() { return now; } },
      CustomEvent: function(type, init) { this.type = type; this.detail = init?.detail; },
      setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
      fetch: async (url, opts) => {
        if (url !== '/api/sale') return new Response(JSON.stringify({ sales: [], voided: [] }));
        sent.push(JSON.parse(opts.body));
        return new Response(JSON.stringify({ ok: true, id: sent.at(-1).id, ...(pending ? { settlementPending: true } : {}) }));
      }, console,
    });
    return window.KiwiLive;
  }
  let api = boot(); await drain();
  api.postSale({ id: 'visit-recovery-emp', amount: 60, method: 'cash', session: 'recovery' }); await drain();
  const size = () => indexed ? rows.size : JSON.parse(values.get('kiwiSaleQueue') || '[]').length;
  assert.equal(size(), 1, 'receipt accepted but incomplete settlement must remain durable');
  assert.ok(sent.length <= 2, 'pending response must not spin immediate retries');
  timers.clear(); api = boot(); await drain();
  pending = false; now += 10000;
  for (const [id, timer] of [...timers]) if (timer.ms === 3000) { timers.delete(id); timer.fn(); }
  await drain();
  assert.equal(size(), 0, 'scheduled recovery acknowledges only after complete response');
  assert.ok(sent.length >= 2);
  assert.ok(sent.every(body => body.id === sent[0].id && body.amountCents === 6000));
});
