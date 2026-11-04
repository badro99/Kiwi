import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync('assets/stock/intake.js', 'utf8').replaceAll('S.stockState.stIntakeRequest', 'stIntakeRequest') + fs.readFileSync('assets/stock/state.js', 'utf8');
const names = ['stIntakeRequest', 'stIntakeMerchant', 'stIntakePrepare', 'stIntakeCommit', 'stIntakeUpload', 'stIntakeServerStatus', 'stIntakeMarkOnce', 'stIntakeOutboxKey', 'stIntakeOutboxRead', 'stIntakeOutboxWrite', 'stIntakeFlushOutbox', 'stIntakeFetchRecorded', 'stIntakeArchiveList'];
const extract = name => src.match(new RegExp('  (?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))?.[0] || '';
const invoice = src.match(/const res = await (?:fetch|stIntakeRequest)\('\/api\/ai\/invoice',[\s\S]*?\n          \}\);/)[0];
const storage = new Map(), delays = [], calls = [];
let mode = 'fetch', serverStatus = 'received', now = 1000;
class Clock extends Date { static now() { return now; } }
const ctx = vm.createContext({ AbortController, Date: Clock, TextEncoder, encodeURIComponent,
  setTimeout: (fn, ms) => { delays.push(ms); return setTimeout(fn, 2); }, clearTimeout,
  window: { Kiwi: { venue: () => 'shop' }, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) } },
  fetch: async (url, options) => {
    calls.push([url, options]);
    if (mode === 'fetch') return new Promise(() => {});
    if (mode === 'elapsed') now += 6000;
    if (!options?.method && serverStatus === 'missing') return { ok: false, status: 404 };
    return { ok: true, status: 200, json: () => mode === 'body' ? new Promise(() => {}) : Promise.resolve({ ok: true, prepared: true, doc: { status: serverStatus }, list: [], docs: [], movements: [] }) };
  },
});
vm.runInContext(names.map(extract).join('\n') + '\nasync function invoiceCall() { const venue = "shop", text = "invoice"; ' + invoice + ' return res.json(); }', ctx);
const cases = [['stIntakePrepare("doc", "hash", 1)', 90000], ['stIntakeCommit({sha256:"doc"})', 15000], ['stIntakeUpload("doc", new Uint8Array())', 90000], ['stIntakeServerStatus("doc")', 15000], ['stIntakeMarkOnce("doc")', 15000], ['stIntakeFetchRecorded("doc")', 15000], ['invoiceCall()', 90000], ['stIntakeArchiveList("")', 15000]];
for (const failure of ['fetch', 'body']) for (const [call, limit] of cases) {
  mode = failure; storage.clear(); delays.length = 0;
  const settled = await Promise.race([vm.runInContext(call, ctx).then(value => ({ value }), error => ({ error })), new Promise(resolve => setTimeout(() => resolve(null), 100))]);
  assert.ok(settled, mode + ': ' + call + ' settles');
  assert.ok(delays.length && delays.every(ms => ms <= limit && ms > limit - 100), call + ': correct deadline');
  if (call.startsWith('stIntakeServerStatus')) assert.equal(settled.value, '');
  if (call.startsWith('stIntakeUpload')) assert.equal(settled.value, mode === 'body'); // PUT does not consume a body
  if (call.startsWith('stIntakeMarkOnce') || call.startsWith('stIntakeCommit')) {
    assert.equal(vm.runInContext('stIntakeOutboxRead().length', ctx), 1, 'uncertain write retained');
    mode = 'fetch'; calls.length = 0;
    await vm.runInContext(call, ctx).catch(() => {});
    assert.equal(calls.length, 1, 'unreachable status prevents retry');
    assert.equal(calls[0][1]?.method, undefined, 'status checked before retry');
    mode = failure;
  }
}
mode = 'ok'; storage.clear();
assert.equal(await vm.runInContext('stIntakeMarkOnce("done")', ctx), true);
assert.equal(vm.runInContext('stIntakeOutboxRead().length', ctx), 0);

for (const status of ['missing', 'received', 'confirmed']) {
  storage.clear(); calls.length = 0; mode = 'ok'; serverStatus = status;
  vm.runInContext('stIntakeOutboxWrite([{docId:"doc",phase:"commit"}])', ctx);
  const result = await vm.runInContext('stIntakeCommit({sha256:"doc"})', ctx);
  assert.equal(calls[0][1]?.method, undefined, 'commit retry checks status');
  assert.equal(calls.length, status === 'confirmed' ? 1 : 2, 'confirmed writes are never reposted');
  assert.equal(result.status, 200);
  assert.equal(vm.runInContext('stIntakeOutboxRead().length', ctx), 0, 'resolved commit leaves outbox');
}

mode = 'elapsed'; serverStatus = 'received'; delays.length = 0;
await vm.runInContext('stIntakeServerStatus("doc")', ctx);
assert.deepEqual(delays, [15000, 9000], 'body shares the original transport deadline');
console.log('PASS intake deadlines: eight call sites, transport/body bounds, contracts, uncertain writes and status-before-retry');
