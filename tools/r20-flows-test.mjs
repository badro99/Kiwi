#!/usr/bin/env node
/* r20 flows · a write that may already have happened is "uncertain", never "failed",
 * and nothing a person typed is lost on the way. Every case runs the shipped code
 * (booking, onboarding, OrderPro guest, tickets, landing demo funnel, native sheet).
 *
 *   node tools/r20-flows-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('  ✓ ' + name); }
const tick = () => new Promise((r) => setImmediate(r));

/* ───────────── booking · submission ───────────── */
function bookingSubmission({ deadlineFetch, lang = 'fr' }) {
  const source = read('assets/booking-submission.js').replace('export function ', 'function ').replace(/import\('\.\/request-deadline.mjs'\)/g, 'loadDeadline()');
  const state = { lang, service: { id: 'svc', total: 10 }, slot: 1000, partySize: 2, checkIn: '2026-11-10', checkOut: '2026-11-12' };
  const storage = new Map(), error = { textContent: '' }, button = { disabled: false };
  const form = { querySelector: (s) => (s === '[data-error]' ? error : button) };
  const sent = [];
  const sandbox = {
    FormData: class { get(k) { return { name: 'Test', email: 'test@example.com', note: 'n' }[k] || ''; } },
    crypto: { randomUUID: () => 'ref-' + sent.length + '-' + Math.random() }, window: {}, setTimeout: () => 0, clearTimeout() {},
    loadDeadline: async () => ({ deadlineFetch: async (u, o) => { sent.push(JSON.parse(o.body)); return deadlineFetch(); } }),
  };
  const context = { owner: { getState: () => state }, app: { querySelector: () => ({}) }, merchant: 'test', party: () => 2,
    ssGet: (k) => storage.get(k), ssSet: (k, v) => storage.set(k, v), ssDel: (k) => storage.delete(k), t: (k) => k, ht: (k) => k };
  const api = vm.runInNewContext(source + ';createBookingSubmission', sandbox)(context);
  const submit = (name = 'submit') => api[name]({ preventDefault() {}, currentTarget: form });
  return { api, state, error, button, sent, submit };
}

await test('booking · a dropped connection during the POST says the booking may exist, keeps the reference and re-enables retry', async () => {
  for (const lang of ['fr', 'en', 'ar']) for (const name of ['submit', 'submitHotel']) {
    const b = bookingSubmission({ lang, deadlineFetch: async () => { throw new TypeError('Failed to fetch'); } });
    await b.submit(name);
    assert.notEqual(b.error.textContent, 'error', 'not the availability-loading error');
    assert.match(b.error.textContent, lang === 'fr' ? /peut-être été enregistrée.*même référence/ : lang === 'en' ? /may have been saved.*same reference/ : /قد يكون الحجز قد سُجّل.*بنفس المرجع/);
    assert.equal(b.button.disabled, false);
    await b.submit(name);
    assert.equal(b.sent.length, 2); assert.equal(b.sent[0].ref, b.sent[1].ref, 'the retry carries the same reference');
  }
});

await test('booking · a server refusal (slot taken) is still a plain refusal, not "may exist"', async () => {
  const b = bookingSubmission({ deadlineFetch: async () => ({ ok: false, json: async () => ({ error: 'slot-unavailable' }) }) });
  await b.submit();
  assert.equal(b.error.textContent, 'taken');
});

await test('booking · what the guest typed survives the trip back to the slot list', async () => {
  const source = read('assets/booking-submission.js').replace('export function ', 'function ');
  const state = { lang: 'fr', service: { id: 's', name: 'Soin', price: 0, deposit: 0 }, slot: 1000, partySize: 2 };
  const forms = [];
  const makeForm = () => {
    const listeners = {}, elements = Object.fromEntries(['name', 'phone', 'email', 'note'].map((k) => [k, { value: '' }]));
    const f = { elements, addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); }, fire: (n) => (listeners[n] || []).forEach((fn) => fn()) };
    forms.push(f); return f;
  };
  let back, goneBack = 0, form;
  const app = { querySelector: (s) => (s === '[data-form]' ? (form = makeForm()) : (back = {}, back)) };
  const context = { owner: { getState: () => state }, app, merchant: 'm', takesCovers: () => false, party: () => 2, times: () => { goneBack++; },
    ssGet() {}, ssSet() {}, ssDel() {}, t: (k) => k, ht: (k) => k, esc: String, money: String, fmt: () => '', layout() {}, head: () => '' };
  const api = vm.runInNewContext(source + ';createBookingSubmission', { window: {}, crypto: {} })(context);
  api.details();
  const first = forms[0];
  Object.assign(first.elements.name, { value: 'Amina' }); Object.assign(first.elements.phone, { value: '0612345678' });
  Object.assign(first.elements.email, { value: 'a@b.ma' }); Object.assign(first.elements.note, { value: 'fenêtre' });
  first.fire('input');
  back.onclick();                       // the automatic return after "slot taken" does the same
  assert.equal(goneBack, 1);
  api.details();
  const second = forms[1];
  assert.deepEqual(['name', 'phone', 'email', 'note'].map((k) => second.elements[k].value), ['Amina', '0612345678', 'a@b.ma', 'fenêtre']);
});

/* ───────────── booking · management links ───────────── */
function manageHarness(initial = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const source = read('assets/booking-manage.js').replace('export function ', 'function ');
  const state = { lang: 'fr' };
  const api = vm.runInNewContext(source + ';createBookingManage', { localStorage, Date, JSON, Object, console, location: { origin: 'https://x', pathname: '/booking' }, encodeURIComponent })({
    owner: { getState: () => state }, app: {}, merchant: 'v', manageToken: 't', t: (k) => k, ht: (k) => k, esc: String, money: String, fmt: () => '', layout() {}, closed() {} });
  return { api, saved: () => JSON.parse(store.get('kiwiBookingManage') || '{}') };
}

await test('booking · the 20-per-venue cap drops an e-mailed link before an unsent one', () => {
  const seed = {};
  for (let i = 0; i < 20; i++) seed['v:C' + i] = { merchant: 'v', code: 'C' + i, token: 'tk' + i, at: 1000 + i, sent: i % 2 === 0 };
  const h = manageHarness({ kiwiBookingManage: JSON.stringify(seed) });
  h.api.rememberManage({ code: 'NEW', manageToken: 'tn', confirmationSent: false });
  const kept = h.saved();
  assert.equal(Object.keys(kept).length, 20);
  assert.ok(kept['v:NEW']);
  assert.equal(kept['v:C0'], undefined, 'the oldest e-mailed link made room');
  for (let i = 1; i < 20; i += 2) assert.ok(kept['v:C' + i], 'the unsent link C' + i + ' survived');
  assert.equal(h.api.rememberManage.evictedUnsent, 0);
});

await test('booking · when only unsent links remain, the oldest goes and the guest is told', () => {
  const seed = {};
  for (let i = 0; i < 20; i++) seed['v:C' + i] = { merchant: 'v', code: 'C' + i, token: 'tk' + i, at: 1000 + i, sent: false };
  const h = manageHarness({ kiwiBookingManage: JSON.stringify(seed) });
  const j = { code: 'NEW', manageToken: 'tn', confirmationSent: false };
  h.api.rememberManage(j);
  const kept = h.saved();
  assert.equal(kept['v:C0'], undefined); assert.ok(kept['v:NEW']);
  assert.equal(h.api.rememberManage.evictedUnsent, 1);
  assert.match(h.api.manageBlock(j), /non envoyé par e-mail a été retiré/);
  h.api.rememberManage({ code: 'NEXT', manageToken: 'tm', confirmationSent: true });
  assert.equal(h.api.rememberManage.evictedUnsent, 1, 'one more unsent link had to go');
});

/* ───────────── onboarding draft ───────────── */
const onboarding = createRequire(import.meta.url)('../assets/onboarding-data.js');
function draftHarness({ failDelete = 0, shared } = {}) {
  const values = shared || new Map();
  const storage = { get: (k) => values.get(k), set: (k, v) => { values.set(k, v); return true; }, del: (k) => values.delete(k) };
  const server = { draft: { revision: 7, typeId: 'boutique', ownerName: 'Old' }, deletes: 0, fail: failDelete };
  const draft = onboarding.createDraft(storage, ['boutique'], ['sales']);
  draft.transport = async (value) => {
    if (value === undefined) return server.draft;
    if (value === null) { if (server.fail > 0) { server.fail--; throw Error('offline'); } server.deletes++; server.draft = null; return null; }
    server.draft = value; return value;
  };
  return { draft, values, server, storage };
}

await test('onboarding · a lost deletion of the server draft is reported, remembered and retried', async () => {
  const h = draftHarness({ failDelete: 1 });
  assert.equal(await h.draft.clear(), false);
  assert.equal(h.draft.clearPending(), true);
  assert.equal(h.draft.saved(), false);
  assert.match(h.draft.warning('fr'), /n’a pas pu être supprimé du serveur/);
  assert.equal(h.server.draft.ownerName, 'Old', 'the old server draft is still there');
  assert.equal(await h.draft.sync(), true, 'the next sync retries the deletion');
  assert.equal(h.server.draft, null); assert.equal(h.draft.clearPending(), false);
  assert.equal(h.values.has('kiwiOnboardingDraft:clear'), false, 'the debt is paid');
});

await test('onboarding · a later session settles the owed deletion instead of restoring the old draft', async () => {
  const first = draftHarness({ failDelete: 1 });
  await first.draft.clear();
  const later = draftHarness({ shared: first.values });
  later.server.draft = first.server.draft;     // the same server
  const S = {};
  await later.draft.restore(S);
  assert.equal(later.server.draft, null, 'the old draft was deleted');
  assert.equal(S.ownerName, undefined, 'and not loaded into the wizard');
  const stuck = draftHarness({ shared: new Map([['kiwiOnboardingDraft:clear', '1']]), failDelete: 5 });
  const T = {};
  await stuck.draft.restore(T);
  assert.equal(T.ownerName, undefined, 'a deletion still failing never resurrects the old answers');
  assert.match(stuck.draft.warning('en'), /could not be deleted from the server/);
});

await test('onboarding · an export the browser refused is not counted as delivered and shows the text to copy', () => {
  const h = draftHarness();
  const S = { step: 1, ownerName: 'Zed', bizName: 'Shop', typeId: 'boutique', pins: [] };
  const made = [];
  const el = (tag) => { const e = { tag, children: [], setAttribute(k, v) { this[k] = v; }, appendChild(c) { this.children.push(c); }, remove() {}, click() { if (tag === 'a') throw Error('blocked'); } }; made.push(e); return e; };
  const browser = { URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: class {}, setTimeout() {}, document: { createElement: el, body: { appendChild() {} } } };
  assert.equal(h.draft.exportFile(S, browser), false);
  const dead = { set: () => { throw Error('full'); }, get: () => null, del() {} };
  const stuck = onboarding.createDraft(dead, ['boutique'], ['sales']);
  stuck.save(S);
  assert.equal(stuck.exportFile(S, browser), false);
  assert.equal(stuck.saved(), false, 'storage full + export blocked: the warning stays');
  const container = { children: [], appendChild(c) { this.children.push(c); } };
  onboarding.mountRecovery(container, stuck, S, 'fr', browser, () => {}, false);
  container.children[0].onclick();
  assert.ok(container.children.some((c) => c.tag === 'textarea' && /Zed/.test(c.value)), 'the draft text is offered to copy');
  const ok = { ...browser, document: { createElement: (tag) => ({ tag, setAttribute() {}, click() {}, remove() {} }), body: { appendChild() {} } } };
  assert.equal(h.draft.exportFile(S, ok), true);
});

/* ───────────── OrderPro guest ───────────── */
function orderProPart(file, replaceImport) {
  let part;
  const sandbox = { KiwiOrderMenu: { orderProParts: { run: (n, fn) => { part = fn(); } } }, URLSearchParams, Object, JSON, String, Number, Math, Array, Promise, Date, Error, loadDeadline: null };
  vm.runInNewContext(read(file).replace(/import\('\.\.\/request-deadline.mjs'\)/g, 'loadDeadline()'), sandbox);
  return { part, sandbox };
}

await test('orderpro · a guest order timeout and a lost connection are both uncertain but stay distinct', async () => {
  const { part, sandbox } = orderProPart('assets/orderpro/transport.js');
  let failure;
  sandbox.loadDeadline = async () => ({ deadlineFetch: async () => { throw failure; } });
  const net = part.create({ location: { search: '?s=cafe' }, fetch: null, demo: () => null });
  failure = Object.assign(new Error('request-timeout'), { code: 'request-timeout' });
  assert.deepEqual({ ...(await net.placeOrder({ lines: [] })) }, { ok: false, error: 'request-timeout', uncertain: true });
  failure = new TypeError('Failed to fetch');
  assert.deepEqual({ ...(await net.placeOrder({ lines: [] })) }, { ok: false, error: 'network', uncertain: true });
  assert.deepEqual({ ...(await net.openSession('table', '4')) }, { ok: false, error: 'network', uncertain: true });
  const dict = read('assets/orderpro-page.js');
  assert.equal((dict.match(/order_timeout:/g) || []).length, 3, 'the timeout advice exists in FR, EN and AR');
});

await test('orderpro · the guest preview adds centimes, not floats', () => {
  const { part } = orderProPart('assets/orderpro/draft.js');
  const cart = new Map([['a', { qty: 3, unitPrice: 0.1 }], ['b', { qty: 1, unitPrice: 0.2 }], ['c', { qty: 2, unitPrice: 14.55 }]]);
  const scope = { cart, customizerItem: { price: 10.1, options: [
    { key: 'size', type: 'single', choices: [{ id: 'l', delta: 0.2 }] },
    { key: 'extras', type: 'multi', choices: [{ id: 'x', delta: 0.1 }, { id: 'y', delta: 0.2 }] } ] },
    customizerSelections: { size: 'l', extras: ['x', 'y'] } };
  const draft = part.create(scope);
  assert.deepEqual({ ...draft.totals() }, { count: 6, total: 29.6 });
  assert.equal(draft.totals().total, 29.6, '0.1×3 + 0.2 + 2×14.55 is exactly 29.60');
  assert.equal(draft.customizerUnitPrice(), 10.6);
  scope.customizerSelections = { size: '', extras: [] };
  assert.equal(draft.customizerUnitPrice(), 10.1);
});

/* ───────────── tickets ───────────── */
function ticketsHarness({ deadlineFetch, files = [] }) {
  const source = read('assets/tickets-data.js').replace(/^export /gm, '').replace(/import\('\.\/request-deadline.mjs'\)/g, 'loadDeadline()');
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, { value: id === 'ticketBody' ? 'La caisse plante' : '', checked: false, hidden: true, textContent: '', focus() {} }); return elements.get(id); };
  const state = { tickets: [], files, filters: {}, publishAttempt: null, saving: false };
  const bodies = [];
  const sandbox = { FormData, Uint8Array, Promise, JSON, Object, Array, Error, Date, Math, String, window: {}, globalThis: { crypto: globalThis.crypto },
    loadDeadline: async () => ({ deadlineFetch: async (u, o) => { if (o.body instanceof FormData) bodies.push(o.body); return deadlineFetch(); } }) };
  const api = vm.runInNewContext(source + ';createData', sandbox)({ $, API: '/tickets', state, lists: {}, renderLoading() {}, t: (k) => k, friendlyError: (c) => 'msg:' + c, showToast() {}, draft: { save: async () => {} },
    draftController: Promise.resolve({ store: { clear() {} } }), composer: { close() {} }, resetComposer() {}, activateTab() {} });
  return { api, state, $, bodies };
}
const png = (bytes, name = 'photo.png') => new File([new Uint8Array(bytes)], name, { type: 'image/png' });

await test('tickets · a write that loses its connection is an uncertain write, a read is not', async () => {
  const h = ticketsHarness({ deadlineFetch: async () => { throw new TypeError('Failed to fetch'); } });
  await h.api.publish({ preventDefault() {} });
  assert.equal(h.$('formError').textContent, 'msg:uncertain-write');
  assert.ok(h.state.publishAttempt, 'the retry key is kept');
  const key = h.state.publishAttempt.key;
  await h.api.publish({ preventDefault() {} });
  assert.equal(h.state.publishAttempt.key, key, 'the same report retried keeps its key');
  assert.equal(h.bodies.at(-1).get('idempotency_key'), key);
  await h.api.loadTickets({ quiet: true });
  assert.equal(h.state.stale, true, 'a failed read is just stale');
});

await test('tickets · an image replaced by different bytes of the same name and size gets a new key', async () => {
  const files = [png([1, 2, 3])];
  const h = ticketsHarness({ deadlineFetch: async () => { throw new TypeError('offline'); }, files });
  await h.api.publish({ preventDefault() {} });
  const first = h.bodies.at(-1).get('idempotency_key');
  h.state.files = [png([1, 2, 3])];
  await h.api.publish({ preventDefault() {} });
  assert.equal(h.bodies.at(-1).get('idempotency_key'), first, 'identical bytes keep the key');
  h.state.files = [png([9, 9, 9])];
  await h.api.publish({ preventDefault() {} });
  assert.notEqual(h.bodies.at(-1).get('idempotency_key'), first, 'different bytes cannot reuse the old attachment');
});

/* ───────────── landing demo funnel ───────────── */
function funnel({ session = {}, local = {}, fetchImpl }) {
  const sess = new Map(Object.entries(session)), loc = new Map(Object.entries(local)), window = {};
  const ctx = { window, console, JSON, Object, Array, String, Number, Date, Math, RegExp, encodeURIComponent, setTimeout, clearTimeout, AbortController, Promise,
    requestAnimationFrame: (f) => f(), location: { pathname: '/fr/', search: '', hash: '' }, fetch: fetchImpl,
    localStorage: { getItem: (k) => (loc.has(k) ? loc.get(k) : null), setItem: (k, v) => loc.set(k, String(v)), removeItem: (k) => loc.delete(k) },
    sessionStorage: { getItem: (k) => (sess.has(k) ? sess.get(k) : null), setItem: (k, v) => sess.set(k, String(v)), removeItem: (k) => sess.delete(k) },
    document: { documentElement: { getAttribute: (a) => (a === 'lang' ? 'fr' : null) }, addEventListener() {}, currentScript: null } };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(read('assets/trades.js'), ctx);
  vm.runInContext(read('assets/landing-demo-funnel.js'), ctx);
  return { api: window.KiwiDemoFunnel, loc, sess };
}

await test('landing · a request the server refused to take survives closing the tab, and a sent one is forgotten', async () => {
  const down = funnel({ fetchImpl: async () => { throw new TypeError('offline'); } });
  Object.assign(down.api._state(), { firstName: 'Salma', business: 'Boutique Salma', family: 'boutique', phone: '0612345678', note: 'rappel après 18h' });
  await down.api._send();
  assert.equal(down.api._phase(), 'failed');
  assert.ok(down.loc.has('kiwiDemoFunnelPending'), 'kept on this device, not only in the tab');
  const back = funnel({ local: Object.fromEntries(down.loc) });          // new tab: sessionStorage is empty
  assert.equal(back.api._state().business, 'Boutique Salma');
  assert.equal(back.api._state().note, 'rappel après 18h');
  const ok = funnel({ local: Object.fromEntries(down.loc), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, reference: 'D-1' }) }) });
  await ok.api._send();
  assert.equal(ok.api._phase(), 'done'); assert.equal(ok.loc.has('kiwiDemoFunnelPending'), false);
  const old = funnel({ local: { kiwiDemoFunnelPending: JSON.stringify({ at: Date.now() - 30 * 86400000, state: { business: 'Stale' } }) } });
  assert.equal(old.api._state().business, '', 'a month-old request is not resurrected');
  assert.ok(Object.values(down.api.STR).every((s) => s.failKept && s.failCopy && s.failCopied), 'every language has the new strings');
});

/* ───────────── native sheet ───────────── */
await test('app · an expired native sheet is closed by the host, a late tap still lands, and a silent host releases the waiter', async () => {
  const timers = []; let nowId = 0;
  const sent = [], listeners = new Map();
  const window = { Capacitor: { isNativePlatform: () => true, Plugins: {} }, addEventListener: (n, f) => listeners.set(n, f), removeEventListener: (n) => listeners.delete(n),
    webkit: { messageHandlers: { kiwiShell: { postMessage: (m) => sent.push(m) } } } };
  const document = { documentElement: { classList: { add() {} }, getAttribute: () => null }, querySelector() {}, addEventListener() {} };
  const setTimeoutFake = (fn, ms) => { timers.push({ id: ++nowId, fn, ms, live: true }); return nowId; };
  const clearTimeoutFake = (id) => { const t = timers.find((x) => x.id === id); if (t) t.live = false; };
  vm.runInNewContext(read('app/src/native-runtime.js'), { window, document, setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake, performance: { now: () => 0 } });
  const api = window.__kiwiNativeRuntime;
  const fire = (ms) => { const t = timers.find((x) => x.live && x.ms === ms); assert.ok(t, 'timer ' + ms); t.live = false; t.fn(); };
  // 1 · expiry while the sheet is still up: the host is asked to close it, the person's late tap still wins
  let settled; const first = api.nativeSheet({ title: 'Supprimer ?' }).then((v) => { settled = v; });
  const id = sent.at(-1).sheet.id;
  fire(60000); await tick();
  assert.equal(JSON.stringify(sent.at(-1)), JSON.stringify({ sheetDismiss: id }), 'the host is told to close the sheet');
  assert.equal(settled, undefined, 'the waiter is not abandoned yet');
  window.KiwiNativeSheetResult({ id, action: 'confirm' }); await first;
  assert.equal(settled, 'confirm', 'a tap that raced the expiry is honoured');
  // 2 · the host answers the dismissal
  let second; const p2 = api.nativeSheet({}).then((v) => { second = v; });
  const id2 = sent.at(-1).sheet.id; fire(60000); window.KiwiNativeSheetResult({ id: id2, action: 'dismiss' }); await p2;
  assert.equal(second, 'dismiss');
  // 3 · a host that never answers still releases the waiter after the grace period
  let third; const p3 = api.nativeSheet({}).then((v) => { third = v; });
  fire(60000); await tick(); assert.equal(third, undefined);
  fire(3000); await p3; assert.equal(third, 'dismiss'); assert.equal(listeners.has('pagehide'), false);
});

console.log(`\nr20-flows: ${passed} passed`);
