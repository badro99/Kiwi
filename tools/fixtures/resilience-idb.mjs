/* Transaction-completion double, shared across page reloads by its disk Map. */
export function idb(disk, refuse = false) {
  return { open() {
    const request = {};
    setImmediate(() => {
      if (refuse) { request.onerror?.(); return; }
      request.result = { createObjectStore() {}, close() {}, transaction() {
        const tx = {}, work = [];
        tx.objectStore = () => ({
          put(value, key) { work.push(() => disk.set(key, structuredClone(value))); },
          getAllKeys() { const result = {}; work.push(() => { result.result = [...disk.keys()]; }); return result; },
          getAll() { const result = {}; work.push(() => { result.result = [...disk.values()].map(v => structuredClone(v)); }); return result; },
        });
        setImmediate(() => { work.forEach(fn => fn()); tx.oncomplete?.(); });
        return tx;
      } };
      request.onupgradeneeded?.(); request.onsuccess?.();
    });
    return request;
  } };
}
export const settle = () => new Promise(resolve => setImmediate(() => setImmediate(() => setImmediate(resolve))));
