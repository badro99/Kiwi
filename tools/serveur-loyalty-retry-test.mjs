import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync('assets/serveur/payment-support.js', 'utf8');
const disk = new Map(), credited = new Set(); let credits = 0, lostReply = true, warnings = 0, quota = false, refuse = 0;
function world(online) {
  const events = {};
  const ctx = vm.createContext({ window: { addEventListener: (name, fn) => events[name] = fn },
    navigator: { onLine: online }, svSlug: () => 'shop', setInterval() {}, setTimeout() {}, clearTimeout() {},
    console: { warn() { warnings++; } },
    localStorage: { getItem: k => disk.get(k), setItem(k, v) { if (quota) throw Error('quota'); disk.set(k, v); } },
    async fetch(url, options) {
      if (refuse) return { ok: false, status: refuse, json: async () => ({ error: 'refused' }) };
      const body = JSON.parse(options.body), key = body.merchant + ':' + (body.saleId || body.ref);
      if (!credited.has(key)) { credits++; credited.add(key); }
      if (lostReply) { lostReply = false; throw Error('reply lost'); }
      return { ok: true, json: async () => ({ ok: true, replayed: true }) };
    } });
  vm.runInContext(code, ctx); return { api: ctx.serveurPaymentSupport(), events, navigator: ctx.navigator };
}
const body = { merchant: 'shop', clientId: 'client', saleId: 'payment-1', amount: 12.34 };
world(false).api.enqueue(body);
assert.equal(credits, 0);
assert.match(disk.get('kiwi:serveur:loyalty:shop'), /payment-1/);
let w = world(true); w.events.online();
await new Promise(resolve => setImmediate(resolve));
assert.equal(credits, 1);
assert.match(disk.get('kiwi:serveur:loyalty:shop'), /payment-1/);
w = world(true); await w.api.flush('shop');
assert.equal(credits, 1); assert.equal(disk.get('kiwi:serveur:loyalty:shop'), '{}');
quota = true; w = world(false); assert.doesNotThrow(() => w.api.enqueue({ ...body, saleId: 'payment-2' }));
assert.ok(warnings); quota = false; w.navigator.onLine = true; await w.api.flush('shop');
assert.equal(credits, 2); assert.equal(disk.get('kiwi:serveur:loyalty:shop'), '{}');
const splitBody = { merchant: 'shop', clientId: 'client', amount: 12.34, ref: 'employee-split:flow-1' };
w = world(false); w.api.enqueue(splitBody); w.api.enqueue(splitBody);
w = world(true); await w.api.flush('shop'); assert.equal(credits, 3);
w.api.enqueue(splitBody); await new Promise(resolve => setImmediate(resolve)); assert.equal(credits, 3);
for (const status of [503, 429]) { refuse = status; w = world(false); w.api.enqueue({ ...body, saleId: 'kept-' + status }); w.navigator.onLine = true; await w.api.flush('shop'); assert.match(disk.get('kiwi:serveur:loyalty:shop'), new RegExp('kept-' + status), status + ' stays queued for retry'); }
refuse = 422; w = world(true); await w.api.flush('shop'); assert.equal(disk.get('kiwi:serveur:loyalty:shop'), '{}', 'a definitive refusal leaves the queue instead of retrying forever'); refuse = 0;
const payments = fs.readFileSync('assets/serveur/payments.js', 'utf8');
assert.equal((payments.match(/serveurPaymentSupport\(\).enqueue/g) || []).length, 2);
const route = fs.readFileSync('functions/api/employee-clients.js', 'utf8');
assert.match(route, /if \(saleId\) ref = \('employee-sale:'/);
assert.match(route, /NOT EXISTS \(SELECT 1 FROM employee_loyalty_events/);
console.log('✓ loyalty: offline, reload, online, lost response, idempotent replay, quota retained');
