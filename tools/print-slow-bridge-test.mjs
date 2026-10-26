#!/usr/bin/env node
import printerTestSource from './printer-test-source.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Un pont lent n'imprime pas deux fois
 *
 * `bridgePrintNow` abandonne après 9 s. Un pont lent (imprimante qui se réveille,
 * file Windows) a pourtant déjà reçu le ticket : l'ancien code traduisait ce
 * délai en « bridge-unreachable », bridgePrintBytes déposait alors le MÊME
 * ticket sur le relais (que le même pont, appairé, relève), printReceipt
 * retombait sur une seconde imprimante et la file cuisine le réessayait. Le
 * ticket sortait deux, trois fois.
 *
 * On exécute le vrai printer-bridge.js avec un pont qui ne répond jamais.
 * ─────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = printerTestSource();
const queueSource = fs.readFileSync(new URL('../assets/kitchen-print-queue.js', import.meta.url), 'utf8');
const CAP = 'kbc_' + 'a'.repeat(64);

function boot(printBehaviour) {
  const calls = { print: 0, relay: 0 };
  const store = new Map([['kiwiPrinterCfg', JSON.stringify({ ip: '192.168.1.50', port: 9100, paper: '80' })]]);
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const fetch = (url, opts = {}) => {
    url = String(url);
    if (url.includes('/kiwi/ping')) return json({ ok: true, name: 'kiwi-printer-bridge', version: '1.5.0', capability: CAP });
    if (url.includes('/kiwi/targets')) return json({ ok: true });
    if (url.includes('/kiwi/print')) {
      calls.print++;
      if (printBehaviour === 'hang') {
        return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (url.includes('/api/print/jobs')) { calls.relay++; return json({ ok: true, id: 'pj_x' }); }
    return json({ ok: false }, 404);
  };
  const listeners = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {} });
  const ctx = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Uint8Array, Error, TypeError, AbortController,
    localStorage, fetch, navigator: {}, location: { origin: 'https://kiwi-os.com' },
    document: { readyState: 'complete', createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el(), head: el() },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    // Les délais de 9 s tombent tout de suite ; les autres restent réels.
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 9000 ? 0 : ms), clearTimeout,
    setInterval: () => 1, clearInterval() {},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, removeEventListener() {},
    dispatchEvent() { return true; },
    KiwiEscPos: { toB64: () => 'AAAA', receipt: () => new Uint8Array([27, 64, 10]), kitchenTicket: () => new Uint8Array([27, 64, 10]), paperWidths: [{ value: '80', label: '80' }] },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'assets/printer-bridge.js' });
  return { P: ctx.KiwiPrinter, calls, ctx };
}

// 1 · pont lent : le ticket est parti, le délai tombe → incertain, rien d'autre.
{
  const { P, calls } = boot('hang');
  const res = await P.printReceipt({ shop: 'Test', lines: [] });
  assert.equal(res.ok, false);
  assert.equal(res.uncertain, true, 'un délai dépassé après envoi est INCERTAIN, pas « injoignable »');
  assert.equal(res.reason, 'bridge-timeout');
  assert.equal(calls.print, 1, 'le pont n\'a reçu le ticket qu\'une fois (aucun repli sur une autre imprimante)');
  assert.equal(calls.relay, 0, 'rien n\'est déposé sur le relais pour le même ticket');
}
// 2 · cuisine : même garantie, et la file ne le réessaie pas seule.
{
  const { P, calls } = boot('hang');
  const res = await P.printKitchen({ title: 'CUISINE', items: [] }, { clientRef: 'kq.ord-1:cuisson' });
  assert.equal(res.uncertain, true);
  assert.equal(calls.print, 1);
  assert.equal(calls.relay, 0);
}
// 3 · pont réellement absent (connexion refusée) : le relais reste le repli.
{
  const { P, calls } = boot('refuse');
  let res = await P.printReceipt({ shop: 'Test', lines: [] });
  assert.ok(!res.uncertain, 'un refus de connexion n\'est pas incertain');
  // Le port du pont est maintenant connu ; il disparaît entre deux tickets.
  res = await P.printReceipt({ shop: 'Test', lines: [] });
  assert.ok(!res.uncertain);
  assert.ok(calls.relay >= 1, 'un pont qui a disparu reprend par le relais (comportement conservé)');
}
// 4 · la file garde le travail « incertain » au lieu de le réessayer seule.
assert.ok(/else if \(result && result\.uncertain\) markUncertain\(job, result\.reason \|\| 'bridge-timeout'\);/.test(queueSource),
  'la file cuisine marque le travail incertain au lieu de planifier une reprise');

console.log('print-slow-bridge-test: ok');
