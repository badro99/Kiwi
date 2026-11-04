import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
import { deadlineFetch } from '../assets/request-deadline.mjs';
for (const file of ['assets/employee-live.js', 'assets/clients-store.js', 'assets/invoicing/transport.js']) {
  let imported = 0, timeout;
  const source = split.declaration(fs.readFileSync(file, 'utf8'), 'fetchDeadline')
    .replace(/import\('[^']+'\)/g, 'loadDeadline()');
  const timers = new Map(); let next = 0;
  const oldFetch = globalThis.fetch, oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout;
  globalThis.fetch = async () => ({ json: () => new Promise(() => {}) });
  globalThis.setTimeout = (fn, ms) => { timeout = ms; timers.set(++next, fn); return next; };
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    const call = vm.runInNewContext(source + ';fetchDeadline', {
      loadDeadline: async () => { imported++; return { deadlineFetch }; },
      fetch: globalThis.fetch, AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    });
    const pending = call('/test', {});
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(imported, 1, file + ' uses the shared transport');
    assert.ok(timeout <= 12000 && timeout > 11900, 'keeps 12 second deadline');
    for (const fire of [...timers.values()]) fire();
    await assert.rejects(pending, error => error.code === 'timeout');
    assert.equal(timers.size, 0, 'clears deadline after body timeout');
  } finally { globalThis.fetch = oldFetch; globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; }
}
console.log('✓ three callers use deadlineFetch, bound stalled JSON and preserve timeout mapping');
