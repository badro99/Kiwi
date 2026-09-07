import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const drain = async () => { for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r)); };
function harness({ support = false, online = false } = {}) {
  const requests = [], timers = new Map(), values = new Map(); let timer = 0, clock = 1000000;
  const state = { status: 201, hold: null };
  const target = () => {
    const handlers = new Map();
    return { addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      dispatchEvent(event) { (handlers.get(event.type) || []).forEach(fn => fn(event)); } };
  };
  const row = { id: 'sale-offline', merchant: 'sync-fixture', amount: 35, method: 'cash', ts: clock };
  values.set('kiwiSaleQueue', JSON.stringify([row])); values.set('kiwiLive', '1');
  const localStorage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
  const document = Object.assign(target(), { readyState: 'complete', hidden: false, createElement: () => ({}) });
  const window = Object.assign(target(), { localStorage, KiwiEnv: { isReal: () => true } });
  class Clock extends Date { static now() { return clock; } }
  const context = vm.createContext({ window, document, localStorage, navigator: { onLine: online }, Date: Clock,
    location: { pathname: '/kiwi-caisse', hostname: 'kiwi.test', search: `?merchant=sync-fixture${support ? '&op=1' : ''}` },
    URLSearchParams, AbortController, CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init?.detail; } },
    setTimeout(fn, ms) { timers.set(++timer,{fn,ms}); return timer; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, opts) => {
      if (url.startsWith('/api/feed')) return Response.json({ sales: [], voided: [] });
      requests.push(JSON.parse(opts.body));
      if (state.hold) await state.hold;
      if (state.bodyHold) return { ok: true, status: 201, json: () => new Promise((_resolve,reject) => opts.signal.addEventListener('abort', () => reject(new Error('body-timeout')))) };
      return state.status === 201 ? Response.json({ ok: true }, { status: 201 }) : new Response('', { status: state.status });
    },
  });
  vm.runInContext(source, context);
  return { window, document, requests, state, timers, context, values,
    wake(type, where = window) { clock += 1500; where.dispatchEvent({type}); },
    online() { context.navigator.onLine = true; },
  };
}
let n = 0;
const check = (name, fn) => { fn(); n++; console.log('✓ '+name); };
let h = harness(); await drain();
check('offline startup retains pending commands without attempting a POST', () => assert.equal(h.requests.length,0));
h.online(); h.wake('online'); await drain();
check('Wi-Fi restoration automatically drains the durable legacy queue under its original ID', () => {
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].id,'sale-offline'); assert.equal(h.window.KiwiLive.pending(),0);
});
h = harness({support:true,online:true}); await drain();
check('support inspection does not replay an existing merchant outbox', () => assert.equal(h.requests.length,0));
h.wake('kiwi:caisse-service-ready',h.document); await drain();
check('explicit support service start enables automatic recovery without a dashboard sales store', () => assert.equal(h.requests.length,1));
h = harness(); h.state.status=403; h.online(); h.wake('online'); await drain();
check('403 remains pending and is exposed as an authentication failure', () => {
  assert.equal(h.window.KiwiLive.pending(),1); assert.equal(h.window.KiwiLive.queueStatus().lastStatus,403);
});
h.wake('focus'); h.wake('visibilitychange',h.document); await drain();
check('focus/visibility do not hammer an authentication denial', () => assert.equal(h.requests.length,1));
h.state.status=201; h.wake('kiwi-paired',h.document); await drain();
check('pairing repair retries immediately and never changes receipt identity', () => {
  assert.equal(h.window.KiwiLive.pending(),0); assert.ok(h.requests.every(r=>r.id==='sale-offline'));
});
h = harness(); let release; h.state.hold=new Promise(r=>release=r); h.online(); h.wake('online'); await drain();
h.wake('online'); h.window.KiwiLive.flush(true); await drain();
check('reconnect plus manual retry cannot steal an in-flight send lock', () => assert.equal(h.requests.length,1));
release(); await drain();
h = harness(); h.state.bodyHold=true; h.online(); h.wake('online'); await drain();
const deadline = [...h.timers.values()].find(t=>t.ms===12000);
assert.ok(deadline,'request deadline remains active while reading the response body'); deadline.fn(); await drain();
check('a stalled acknowledgement times out, releases the sender and preserves the receipt for replay', () => {
  assert.equal(h.window.KiwiLive.pending(),1);
});
h.state.bodyHold=false; h.wake('online'); await drain(); assert.equal(h.window.KiwiLive.pending(),0);
h = harness(); h.state.status=422; h.online(); h.wake('online'); await drain(); h.wake('online'); await drain();
check('structurally invalid commands stay retained and blocked across reconnects', () => {
  assert.equal(h.requests.length,1); assert.equal(h.window.KiwiLive.queueStatus().blocked,1);
});
console.log(`Caisse reconnect: ${n} behavioral checks passed.`);
