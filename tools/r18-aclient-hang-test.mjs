#!/usr/bin/env node
/* Round 18, lane aclient: a client request that never settles must not freeze a
 * queue, hide a warning or look like success, and a write cut off after commit
 * is uncertain, never "offline". Each case runs the shipped code in a vm with a
 * transport that hangs (or answers with an unreadable body) and a fake clock
 * for the shared request deadline (assets/request-deadline.mjs). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
import splitFunctions from './split-functions.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const never = () => new Promise(() => {});
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); } catch (error) { failed += 1; console.error('  ✗ ' + name + '\n    ' + (error && error.message)); }
}
/* A clock the test drives: nothing fires until fire(ms) is called. */
function fakeClock() {
  const timers = [];
  return {
    setTimeout(fn, ms) { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].live = false; },
    fire(ms) { timers.filter((t) => t.live && t.ms === ms).forEach((t) => { t.live = false; t.fn(); }); },
    timers,
  };
}
/* Resolves with the settled value, or the marker when it is still pending. */
const STILL = Symbol('still-pending');
async function settled(promise) {
  const result = await Promise.race([promise.then((v) => ({ v }), (e) => ({ e })), tick().then(tick).then(() => STILL)]);
  return result;
}

console.log('r18 aclient · requêtes qui ne reviennent pas');

await test('dayreport#0 · une requête de caisse muette libère le verrou et la file repart', async () => {
  const clock = fakeClock(), storage = new Map(), pending = [];
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'r18-cash' },
    KiwiCaissePairing: { isPaired: () => true }, addEventListener() {}, dispatchEvent() {} };
  const context = deadlineVmContext({
    window, localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v) },
    document: { readyState: 'loading', addEventListener() {} }, crypto, Date, Math, JSON, Promise,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval() {},
    fetch(_url, options) { pending.push(JSON.parse(options.body)); return never(); },
  });
  vm.runInNewContext(deadlineVmSource(read('assets/cash-sessions.js')), context, { filename: 'assets/cash-sessions.js' });
  const api = window.KiwiCashSessions;
  api.emit({ id: 'cash-hung-1', sessionId: 's1', eventType: 'open', occurredAt: 1 });
  await tick();
  assert.equal(pending.length, 1, 'le premier envoi part');
  api._test.flush();
  await tick();
  assert.equal(pending.length, 1, 'tant que la requête est en vol, pas de second envoi');
  clock.fire(12000);
  await tick(); await tick();
  api._test.flush();
  await tick();
  assert.ok(pending.length >= 2 && pending.at(-1).id === 'cash-hung-1', 'après l\'échéance la même ouverture repart sous le même identifiant');
  assert.equal(api._test.readOutbox().length, 1, 'l\'événement reste durable dans la file');
});

await test('print#0 / kitchen#0 · le sondage des bons non imprimés a une échéance', async () => {
  const clock = fakeClock(), memory = new Map(), toasts = [];
  memory.set('kiwiKitchenPrintLabelsV1:amira-cafe', JSON.stringify({ pj_abcdef01: { l: 'Table 7', t: Date.now() } }));
  let served = false;
  const listeners = Object.create(null);
  const context = deadlineVmContext({
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage: { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) },
    document: { readyState: 'complete', hidden: false, getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, dispatchEvent() {},
    KiwiKitchenRelay: { merchant: () => 'amira-cafe' }, KiwiCaisseToast: (title) => toasts.push(title), KiwiCaisseLang: { tr: (s) => s },
    fetch: () => (served ? Promise.resolve({ json: () => Promise.resolve({ ok: true, jobs: [{ id: 'pj_abcdef01', kind: 'kitchen', status: 'expired' }] }) }) : never()),
  });
  context.window = context;
  vm.runInNewContext(deadlineVmSource(read('assets/kitchen-print-queue.js')), context, { filename: 'assets/kitchen-print-queue.js' });
  const first = context.KiwiKitchenPrint.pollUnprinted();
  assert.equal((await settled(first)) === STILL, true, 'avant l\'échéance le sondage est encore en cours');
  clock.fire(10000);
  const out = await settled(first);
  assert.ok(out !== STILL && Array.isArray(out.v) && out.v.length === 0, 'à l\'échéance le sondage rend la main');
  served = true;
  const next = await settled(context.KiwiKitchenPrint.pollUnprinted());
  assert.ok(next !== STILL && next.v.length === 1 && toasts.length === 1, 'le sondage suivant découvre le bon expiré et prévient');
});

await test('print#1 · un reçu imprimé efface l\'entrée « tickets non imprimés » ouverte par un échec', async () => {
  const listeners = {}, nodes = new Map();
  const stack = { appendChild(el) { nodes.set(el.id, el); } };
  const document = { body: stack, getElementById: (id) => (id === 'toast-stack' ? stack : nodes.get(id)),
    createElement: () => ({ style: {}, addEventListener(name, fn) { this[name] = fn; }, remove() { nodes.delete(this.id); } }) };
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; }, KiwiCaisseLang: { tr: (s) => 'tr:' + s }, KiwiPrinter: { openSetup() {} } };
  vm.runInNewContext(read('assets/caisse-print-recovery.js'), { window, document });
  listeners['kiwi:receipt-print']({ detail: { ok: false } });
  assert.equal(nodes.get('caisse-print-recovery').textContent, 'tr:Voir les tickets non imprimés (1)');
  listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 2 } });
  assert.equal(nodes.get('caisse-print-recovery').textContent, 'tr:Voir les tickets non imprimés (3)', 'le reçu et les bons du relais se comptent chacun');
  listeners['kiwi:receipt-print']({ detail: { ok: true } });
  assert.equal(nodes.get('caisse-print-recovery').textContent, 'tr:Voir les tickets non imprimés (2)', 'le reçu réimprimé sort du compte, pas les bons du relais');
  listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 0 } });
  assert.equal(nodes.has('caisse-print-recovery'), false, 'plus rien à reprendre, plus d\'entrée');
});

await test('pairing#1 · un code vérifié sur un transport muet retombe sur la vérification hors ligne', async () => {
  const clock = fakeClock();
  const bundle = read('assets/caisse-pairing.js');
  const code = 'var lastVerify = {};\n' + splitFunctions.declaration(bundle, 'fetchDeadline') + '\n' + splitFunctions.declaration(bundle, 'verifyCode') + ';verifyCode';
  const verifyCode = vm.runInNewContext(code, deadlineVmContext({
    AbortController, Promise, JSON, Object, String, Number, Math, Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    window: {}, activeVenue: () => ({ merchant: 'r18-till' }), fetch: () => never(),
    verifyOfflinePin: async () => ({ id: 'offline-staff', name: 'Hors ligne' }), rememberOfflinePin() {}, offlinePinRows() {},
  }));
  const attempt = verifyCode('2468');
  assert.equal((await settled(attempt)) === STILL, true, 'la requête est en vol');
  clock.fire(12000);
  const out = await settled(attempt);
  assert.ok(out !== STILL && out.v && out.v.id === 'offline-staff', 'à l\'échéance le code est jugé hors ligne');
});

await test('employee#0 · un 200 au corps illisible est un résultat incertain, pas un succès vide', async () => {
  const window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {} };
  vm.runInNewContext(deadlineVmSource(read('assets/employee-live.js')), deadlineVmContext({
    window, navigator: {}, location: { protocol: 'file:' }, console,
    document: { addEventListener() {}, dispatchEvent() {} },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw SyntaxError('Unexpected end of JSON'); } }),
  }));
  const live = window.KiwiEmployeeLive;
  const read1 = await live.refresh().then(() => null, (e) => e);
  assert.ok(read1 && read1.code === 'response-unreadable' && read1.uncertain === true, 'la lecture illisible est signalée');
  const write = await live.requestPlanning({ day: '2026-11-05' }).then(() => null, (e) => e);
  assert.ok(write && write.uncertain === true && !write.status, 'l\'écriture illisible est incertaine et sans statut (la file garderait le geste)');
});

await test('boutiquetill#0 · une liste de notes qui ne répond pas rend quand même le journal local', async () => {
  const clock = fakeClock(), memory = new Map();
  memory.set('kiwi:retailBalances:r18-shop', JSON.stringify([{ id: 'n1', customerId: 'c1', ticketRef: 'T-1', totalCents: 5000, paidCents: 1000, pendingCents: 0, receipts: [] }]));
  const window = {};
  vm.runInNewContext(deadlineVmSource(read('assets/retail-balances.js')), deadlineVmContext({
    window, localStorage: { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) },
    navigator: { onLine: true }, Date, JSON, Math, Number, String, Array, Map, Set, Object, Promise,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, fetch: () => never(),
  }));
  const listing = window.KiwiRetailBalances.list('r18-shop', '');
  assert.equal((await settled(listing)) === STILL, true, 'la requête est en vol');
  clock.fire(6000);
  const out = await settled(listing);
  assert.ok(out !== STILL && out.v.length === 1 && out.v[0].id === 'n1', 'à l\'échéance la note locale est rendue');
});

if (failed) { console.error(failed + ' cas rouge(s)'); process.exit(1); }
console.log('r18-aclient-hang-test: tous les cas passent');
