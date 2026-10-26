import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('✓ ' + name); }
  catch (e) { failures++; console.error('✗ ' + name + ': ' + e.message); }
}
for (const name of ['salle', 'menu']) await test(name + ' timeout, retry and cancellation', async () => {
  const timers = new Map(); let id = 0, response = false, signal;
  const window = { Kiwi: { venue: () => 'fixture' } };
  const c = vm.createContext({ window, document: { documentElement: { lang: "fr" } }, localStorage: { getItem: () => "fr" }, Kiwi: window.Kiwi, AbortController,
    setTimeout(fn, ms) { assert.ok(ms <= 45000); timers.set(++id, fn); return id; },
    clearTimeout(i) { timers.delete(i); },
    fetch: async (url, opts) => { signal = opts.signal; return response ? { ok: true, status: 200, json: async () => ({ ok: true, items: [{ name: 'Fixture' }], tables: [] }) } : new Promise(() => {}); }
  });
  // Expose the actual private entry point, retaining the whole shipped closure.
  vm.runInContext(fs.readFileSync('assets/ai-image-import.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync('assets/' + name + '-scan.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.request = callApi; })();'), c);
  let result = 'pending';
  const p = window.request(name === 'salle' ? 'image' : { kind: 'text', text: 'fixture' }).catch(e => { result = e.message; });
  await settle();
  for (const fn of [...timers.values()]) fn();
  await settle();
  assert.equal(result, 'timeout');
  await p; assert.equal(signal.aborted, true); assert.equal(timers.size, 0);
  response = true; await window.request('retry'); assert.equal(timers.size, 0);
  response = false;
  const cancel = new AbortController();
  const pending = window.request('cancel', cancel.signal).catch(e => e.message);
  cancel.abort(); assert.equal(await pending, 'cancelled'); assert.ok(signal.aborted);
});
await test('visible floor polls within 15 seconds and wakes immediately', async () => {
  const timers = new Map(), listeners = {}; let calls = 0, id = 0;
  const document = { hidden: false, visibilityState: 'visible', addEventListener: (k,f) => listeners[k] = f };
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'fixture' },
    addEventListener: (k,f) => listeners[k] = f };
  vm.runInNewContext(fs.readFileSync('assets/floorplan-live.js', 'utf8'), { window, document,
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimeout(i) { timers.delete(i); },
    fetch: async () => { calls++; return { ok: true, json: async () => ({ ok: true, tables: {} }) }; } });
  window.KiwiFloorLive.watch(() => {}); await settle();
  for (let i = 0; i < 8; i++) {
    const [key,t] = [...timers][0]; assert.ok(t.ms <= 15000, 'visible delay ' + t.ms);
    timers.delete(key); t.fn(); await settle();
  }
  window.KiwiPoll = { delay: () => 600000 };
  const before = calls; listeners.focus(); await settle(); assert.equal(calls, before + 1);
  assert.ok([...timers.values()].every(t => t.ms <= 15000));
  document.hidden = true; document.visibilityState = 'hidden'; listeners.visibilitychange(); await settle();
  assert.equal(timers.size, 0);
  document.hidden = false; document.visibilityState = 'visible'; listeners.visibilitychange(); await settle();
  assert.equal(calls, before + 2);
});
await test('purchase retains event and failure reason until acknowledged', async () => {
  const data = new Map(), stores = {}; let status = 503;
  const define = (name, opts) => stores[name] = { data: {}, get(k) { return this.data[k] || opts.blank(); },
    set(v,k) { this.data[k] = JSON.parse(JSON.stringify(v)); }, subscribe() { return () => {}; } };
  const window = { KiwiStore: { define, currentVenue: () => 'fixture' }, KiwiEnv: { isReal: () => true }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync('assets/clients-store.js', 'utf8'), { window, KiwiStore: window.KiwiStore,
    KiwiEnv: window.KiwiEnv, navigator: { onLine: true }, setInterval: () => 1,
    localStorage: { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v) },
    fetch: async () => { if (!status) throw new Error('offline'); return { ok: status === 200, status, json: async () => ({}) }; } });
  const api = window.KiwiClients, client = api.upsert({ name: 'Fixture' }, 'fixture');
  api.recordPurchase(client.id, { amount: 20, saleId: 'fixture-sale' }, 'fixture'); await settle();
  assert.equal(JSON.parse(data.get('kiwi:clients-purchases:v1:fixture'))[0].lastFailure, status ? 'http-503' : 'offline');
  assert.equal(api.purchaseSyncStatus('fixture').count, 1);
  assert.equal(api.purchaseSyncStatus('fixture').failures[0].reason, 'http-503');
  const snapshot = api.purchaseSyncStatus('fixture'); snapshot.failures[0].reason = 'changed';
  assert.equal(api.purchaseSyncStatus('fixture').failures[0].reason, 'http-503');
  status = 0; api.sync(); await settle();
  assert.equal(api.purchaseSyncStatus('fixture').count, 1);
  assert.equal(api.purchaseSyncStatus('fixture').failures[0].reason, 'offline');
  status = 200; api.sync(); await settle(); assert.equal(api.purchaseSyncStatus('fixture').count, 0);
});
for (const name of ['salle', 'menu']) await test(name + ' modal timeout message, retry and visible cancel', async () => {
  const prefix = name === 'salle' ? 'kss' : 'kms';
  const timers = new Map(), events = {}; let id = 0, signal, success = false, reviewed = 0, toast = '';
  const stage = { innerHTML: '' };
  const modal = { closed: false, close() { this.closed = true; }, el: {
    setAttribute() {}, addEventListener(k, fn) { events[k] = fn; },
    querySelector(q) { if (q === '[data-' + prefix + '-stage]') return stage;
      if (q === '.kiwi-modal-close') return null;
      return { value: 'fixture text' }; }
  } };
  let options;
  const Kiwi = { venue: () => 'fixture', modal(o) { options = o; return modal; },
    toast(t, o) { toast = t + ' ' + o.desc; } };
  const window = { Kiwi, KiwiCatalogImport: { openMenuWithCsv() { reviewed++; } } };
  const c = { window, Kiwi, KiwiCatalogImport: window.KiwiCatalogImport, AbortController,
    localStorage: { getItem: () => 'fr' }, document: { getElementById: () => true, documentElement: { lang: 'fr' },
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'image' }) },
    URL: { createObjectURL: () => 'fixture', revokeObjectURL() {} },
    Image: class { naturalWidth = 100; naturalHeight = 100; set src(v) { this.onload(); } },
    setTimeout(fn, ms) { timers.set(++id, fn); return id; }, clearTimeout(i) { timers.delete(i); },
    fetch: async (_, opts) => { signal = opts.signal; return success ? { ok: true, status: 200,
      json: async () => ({ ok: true, items: [{ name: 'Fixture' }], tables: [{ shape: 'round', seats: 2, count: 1 }] }) } : new Promise(() => {}); }
  };
  vm.runInNewContext(fs.readFileSync('assets/ai-image-import.js', 'utf8'), c);
  vm.runInNewContext(fs.readFileSync('assets/' + name + '-scan.js', 'utf8'), c);
  const api = window[name === 'salle' ? 'KiwiSalleScan' : 'KiwiMenuScan'];
  const click = selector => events.click({ target: { closest: q => q === selector ? {} : null } });
  const run = async () => {
    if (name === 'menu') click('[data-kms-go-text]');
    else events.change({ target: { matches: q => q === '[data-kss-file]', files: [{}] } });
    await settle();
  };
  api.open({ onFacts() { reviewed++; } });
  assert.ok(options.foot.includes('data-' + prefix + '-cancel'));
  await run();
  for (const fn of [...timers.values()]) fn();
  await settle();
  assert.ok(toast.includes('Délai dépassé'));
  assert.ok(toast.includes('réessayer'));
  assert.ok(stage.innerHTML.includes('data-' + prefix + '-pick'));
  success = true; await run(); assert.equal(reviewed, 1);
  success = false; modal.closed = false; api.open(); await run();
  click('[data-' + prefix + '-cancel]'); await settle();
  assert.ok(signal.aborted); assert.ok(modal.closed); assert.equal(reviewed, 1);
});
if (failures) process.exitCode = 1;
