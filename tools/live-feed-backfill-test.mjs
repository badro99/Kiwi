import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
async function scenario(total, pageSize, echoLimit) {
  const timers = [];
  let timerId = 0;
  const batches = [];
  for (let offset = 0; offset < total; offset += pageSize) {
    batches.push(Array.from({ length: Math.min(pageSize, total - offset) }, (_, i) => ({ cursor: offset + i + 1, amount: 10 })));
  }
  if (total % pageSize === 0) batches.push([]);
  batches.push([{ cursor: total + 1, amount: 44 }]);
  const requests = [];
  const seen = [];
  let fetches = 0;

  const storage = new Map([['kiwiLive', '1']]);
  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const window = {
    localStorage,
    KiwiEnv: { isReal: () => true },
    KiwiMe: { business: 'Amira Boutique' },
    addEventListener() {},
    dispatchEvent() {},
  };
  const document = {
    readyState: 'loading', hidden: false,
    addEventListener() {},
    createElement: () => ({ setAttribute() {}, appendChild() {} }),
  };
  const context = {
    window, document, localStorage,
    location: { search: '', hostname: 'kiwi-os.com' },
    URLSearchParams,
    CustomEvent: function (type, init) { this.type = type; this.detail = init?.detail; },
    fetch: async (url) => {
      requests.push(url);
      const sales = batches[Math.min(fetches++, batches.length - 1)];
      return { ok: true, json: async () => ({ sales, cursor: sales.at(-1)?.cursor || total, voided: [], ...(echoLimit ? { limit: pageSize } : {}) }) };
    },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, ms }); return id; },
    clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    console,
  };

  vm.runInNewContext(source, context, { filename: 'assets/live-link.js' });
  window.KiwiLive.watchFeed((sales, backfill) => {
    seen.push({ cursors: sales.map((sale) => sale.cursor), backfill });
  });

  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  };
  const runNextTimer = async () => {
    assert.ok(timers.length, 'the feed should schedule its next poll');
    timers.shift().fn();
    await settle();
  };

  await settle();
  const historyPages = Math.floor(total / pageSize) + 1;
  for (let i = 0; i < historyPages; i++) {
    if (i) await runNextTimer();
    assert.equal(seen[i].backfill, true, 'every historical page suppresses notifications');
    assert.match(requests[i], /&limit=500(&|$)/, 'backfill opts in');
    assert.equal(window.KiwiLive.status().backfillComplete, i === historyPages - 1);
    if (i < historyPages - 1) assert.equal(timers[0]?.ms, 0, 'full page drains immediately');
  }
  assert.equal(fetches, historyPages);
  assert.equal(seen.reduce((n, p) => n + p.cursors.length, 0), total);
  await runNextTimer();
  assert.equal(seen.at(-1).backfill, false, 'only new sales notify');
  assert.equal(seen.at(-1).cursors[0], total + 1);
  assert.ok(!requests.at(-1).includes('limit='), 'live polling omits opt-in');
}
await scenario(2848, 500, true); // Six round trips.
await scenario(2848, 50, false); // Old server: 57 round trips.
await scenario(1000, 500, true); // Exact final page requires an empty proof.
console.log('live-feed-backfill-test: negotiated and legacy pagination passed');
