import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync('assets/serveur/payment-support.js', 'utf8');
const disk = new Map(); let mode = '401', toasts = [], calls = [];
function world() {
  const ctx = vm.createContext({ window: { addEventListener() {} }, navigator: { onLine: true }, svSlug: () => 'shop',
    setInterval() {}, setTimeout: (fn, ms) => ms === 12000 ? setTimeout(fn, 5) : 0, clearTimeout,
    console: { warn() {} }, toast: (m) => toasts.push(m), employeePick: (fr) => fr,
    localStorage: { getItem: k => disk.get(k), setItem: (k, v) => disk.set(k, v) },
    async fetch(url, options) {
      calls.push(JSON.parse(options.body).saleId);
      if (mode === '401') return { ok: false, status: 401, json: async () => ({}) };
      if (mode === 'hang') return await new Promise(() => {});
      if (mode === 'hangbody') return { ok: true, status: 200, json: () => new Promise(() => {}) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    } });
  vm.runInContext(code, ctx); return ctx.serveurPaymentSupport();
}
const key = 'kiwi:serveur:loyalty:shop';
const api = world();
api.enqueue({ merchant: 'shop', clientId: 'c', saleId: 'p1', amount: 10 });
await new Promise(r => setTimeout(r, 20));
assert.match(disk.get(key), /employee-sale:p1/, '401 keeps the purchase under its key');
assert.equal(api.status('shop').authNeeded, true);
assert.ok(toasts.length, 'a visible pending outcome is announced');
mode = 'ok'; await api.flush('shop');
assert.equal(disk.get(key), '{}', 'after reauthentication the same entry is sent and cleared');
assert.equal(calls.filter(c => c === 'p1').length, 2);
for (const m of ['hang', 'hangbody']) {
  mode = m; const a = world();
  a.enqueue({ merchant: 'shop', clientId: 'c', saleId: 'h-' + m, amount: 1 });
  await new Promise(r => setTimeout(r, 40));
  mode = 'ok'; await a.flush('shop');
  assert.equal(disk.get(key), '{}', m + ': a transport ignoring abort does not keep flush busy forever');
}
console.log('✓ serveur loyalty: 401 kept, hanging transport bounded');
