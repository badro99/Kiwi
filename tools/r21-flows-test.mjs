#!/usr/bin/env node
/* r21 flows · a write that may already have happened is "uncertain", never "failed",
 * and nothing a person typed is lost. Every case runs the shipped code.
 *
 *   node tools/r21-flows-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('  ✓ ' + name); }
const dl = (s) => s.replace(/import\('\.\/request-deadline.mjs'\)/g, 'loadDeadline()');

/* ───────────── booking · submission ───────────── */
function submission(reply, lang = 'fr') {
  const source = dl(read('assets/booking-submission.js').replace('export function ', 'function '));
  const state = { lang, service: { id: 'svc', total: 10 }, slot: 1000, partySize: 2, checkIn: '2026-11-10', checkOut: '2026-11-12' };
  const storage = new Map(), error = { textContent: '' }, button = { disabled: false };
  const form = { querySelector: (s) => (s === '[data-error]' ? error : button) };
  const log = { success: 0, remembered: 0 };
  const sandbox = {
    FormData: class { get(k) { return { name: 'Test', email: 'test@example.com', note: 'n' }[k] || ''; } },
    crypto: { randomUUID: () => 'ref-' + Math.random() }, window: {}, setTimeout: () => 0, clearTimeout() {},
    loadDeadline: async () => ({ deadlineFetch: async () => reply() }),
  };
  const context = { owner: { getState: () => state }, app: { querySelector: () => ({}) }, merchant: 'test', party: () => 2,
    rememberManage: () => { log.remembered++; }, manageBlock: () => '', wireManageBlock() {}, hotelSummary: () => '',
    ssGet: (k) => storage.get(k), ssSet: (k, v) => storage.set(k, v), ssDel: (k) => storage.delete(k), t: (k) => k, ht: (k) => k,
    esc: String, money: String, fmt: () => '', layout: () => { log.success++; }, head: () => '', takesCovers: () => false };
  const api = vm.runInNewContext(source + ';createBookingSubmission', sandbox)(context);
  return { api, state, error, button, storage, log, submit: (n = 'submit') => api[n]({ preventDefault() {}, currentTarget: form }) };
}

await test('booking · a 2xx without a booking code is uncertain: no false confirmation, retry identity kept', async () => {
  for (const body of [{}, { ok: true }, { code: '' }, { code: 42 }, null, []]) {
    for (const name of ['submit', 'submitHotel']) {
      const b = submission(async () => ({ ok: true, json: async () => body }));
      await b.submit(name);
      assert.equal(b.log.success, 0, 'no confirmation screen for ' + JSON.stringify(body));
      assert.equal(b.log.remembered, 0);
      assert.match(b.error.textContent, /Confirmation illisible/);
      assert.ok([...b.storage.keys()].some((k) => !k.endsWith('Intent')), 'the retry reference is kept');
      assert.equal(b.button.disabled, false);
    }
  }
});

await test('booking · a real confirmation still clears the retry identity and renders', async () => {
  const b = submission(async () => ({ ok: true, json: async () => ({ code: 'KW-1', status: 'confirmed', startAt: 5 }) }));
  await b.submit('submit');
  assert.equal(b.log.success, 1);
  assert.equal(b.storage.size, 0);
});

/* ───────────── booking · retry identity storage ───────────── */
function view(store, { now = () => 1000, search = '?merchant=amira' } = {}) {
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const D = class extends Date { static now() { return now(); } };
  const state = { lang: 'fr' };
  const source = read('assets/booking-view.js').replace('export function ', 'function ');
  return { state, api: vm.runInNewContext(source + ';createBookingView', { localStorage, Date: D, JSON, Object, URLSearchParams, location: { search }, document: {}, window: {}, navigator: {} })({ owner: { getState: () => state }, app: {} }) };
}

await test('booking · the retry reference survives closing the tab, is scoped to the booking page and expires', async () => {
  const store = new Map();
  let t = 1000;
  view(store, { now: () => t }).api.ssSet('kiwiBookingRef', 'web_abc');
  assert.equal(view(store, { now: () => t + 5000 }).api.ssGet('kiwiBookingRef'), 'web_abc', 'a fresh page load (new tab) finds it');
  assert.equal(view(store, { now: () => t, search: '?merchant=other' }).api.ssGet('kiwiBookingRef'), null, 'another venue never sees it');
  assert.equal(view(store, { now: () => t + 25 * 3600 * 1000 }).api.ssGet('kiwiBookingRef'), null, 'expired after a day');
  assert.equal(store.size, 0, 'the expired entry is removed');
  const v = view(store); v.api.ssSet('k', 'x'); v.api.ssDel('k'); assert.equal(v.api.ssGet('k'), null);
});

await test('booking · English amounts use an English number format', async () => {
  const { state, api } = view(new Map());
  state.lang = 'en'; assert.equal(api.money(1234567.5), '1,234,567.5 MAD');
  state.lang = 'fr'; assert.match(api.money(1234567), /^1\s234\s567 MAD$/);
});

/* ───────────── booking · cancellation ───────────── */
function manage(handler) {
  const source = dl(read('assets/booking-manage.js').replace('export function ', 'function '));
  const state = { lang: 'fr' }, screens = [], calls = [];
  const sandbox = { localStorage: { getItem() {}, setItem() {}, removeItem() {} }, Date, JSON, Object, console, location: { origin: 'https://x', pathname: '/b' }, encodeURIComponent,
    loadDeadline: async () => ({ deadlineFetch: async (u, o) => { calls.push((o && o.method) || 'GET'); return handler(u, o); } }) };
  const api = vm.runInNewContext(source + ';createBookingManage', sandbox)({ owner: { getState: () => state }, app: { querySelector: () => null }, merchant: 'v', manageToken: 't',
    t: (k) => k, ht: (k) => k, esc: String, money: String, fmt: () => '', layout: (h) => screens.push(h), closed() {} });
  const data = () => ({ booking: { status: 'confirmed', code: 'C1' }, cancellableUntil: Date.now() + 1e6, name: 'N' });
  return { api, screens, calls, data, state };
}

await test('booking · a lost answer to the cancellation is uncertain (or confirmed on re-read), never "could not be saved"', async () => {
  const lost = manage(async (u, o) => { if (o && o.method === 'DELETE') throw new TypeError('Failed to fetch'); return { ok: true, json: async () => ({ booking: { status: 'confirmed', code: 'C1' }, cancellableUntil: Date.now() + 1e6 }) }; });
  await lost.api.cancelBooking(lost.data());
  assert.match(lost.screens.at(-1), /peut-être été enregistrée/);
  assert.doesNotMatch(lost.screens.at(-1), /n’a pas pu être enregistrée/);
  const done = manage(async (u, o) => { if (o && o.method === 'DELETE') throw new TypeError('Failed to fetch'); return { ok: true, json: async () => ({ booking: { status: 'cancelled', code: 'C1' }, cancellableUntil: 0 }) }; });
  await done.api.cancelBooking(done.data());
  assert.deepEqual(done.calls, ['DELETE', 'GET'], 'the booking is re-read after the lost answer');
  assert.match(done.screens.at(-1), /Réservation annulée/);
  const bad = manage(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }));
  await bad.api.cancelBooking(bad.data());
  assert.match(bad.screens.at(-1), /peut-être été enregistrée/, 'unreadable 2xx on a write is uncertain');
});

await test('booking · a server answer that refuses the cancellation is still a plain failure', async () => {
  const m = manage(async () => ({ ok: false, json: async () => ({ error: 'write-failed' }) }));
  await m.api.cancelBooking(m.data());
  assert.match(m.screens.at(-1), /n’a pas pu être enregistrée/);
  assert.deepEqual(m.calls, ['DELETE']);
});

/* ───────────── tickets ───────────── */
function tickets({ deadlineFetch, files = [] }) {
  const source = dl(read('assets/tickets-data.js').replace(/^export /gm, ''));
  const elements = new Map();
  const $ = (id) => { if (!elements.has(id)) elements.set(id, { value: id === 'ticketBody' ? 'La caisse plante' : '', checked: false, hidden: true, textContent: '', focus() {} }); return elements.get(id); };
  const state = { tickets: [], files, filters: {}, publishAttempt: null, saving: false, loading: true };
  const bodies = [], urls = [], toasts = [];
  const sandbox = { FormData, Uint8Array, Promise, JSON, Object, Array, Error, Date, Math, String, encodeURIComponent, window: {}, globalThis: { crypto: globalThis.crypto },
    loadDeadline: async () => ({ deadlineFetch: async (u, o) => { urls.push(u); if (o && o.body instanceof FormData) bodies.push(o.body); return deadlineFetch(u, o); } }) };
  const api = vm.runInNewContext(source + ';createData', sandbox)({ $, API: '/tickets', state, lists: {}, renderLoading() {}, render() {}, t: (k) => k, friendlyError: (c) => 'msg:' + c,
    showToast: (m) => toasts.push(m), draft: { save: async () => {}, restore: async () => {} }, draftController: Promise.resolve({ store: { clear() {} } }),
    composer: { close() {} }, resetComposer() {}, activateTab() {}, configureComposerClassification() {}, make: () => ({ append() {}, setAttribute() {}, addEventListener() {} }) });
  return { api, state, $, bodies, urls, toasts };
}
const okJson = (b) => ({ ok: true, json: async () => b });
const taxonomy = { version: 1, kinds: [{ id: 'bug' }], areas: [{ id: 'till' }] };

await test('tickets · a repeating cursor ends the walk as a visible partial-load failure', async () => {
  const h = tickets({ deadlineFetch: async () => okJson({ tickets: [{ id: 1 }], taxonomy, nextCursor: 'same' }) });
  await h.api.loadTickets({ quiet: true });
  assert.ok(h.urls.length <= 3, 'stopped after the first repeat, made ' + h.urls.length + ' requests');
  assert.equal(h.state.stale, true);
  assert.equal(h.state.loading, false);
  assert.ok(h.toasts.some((m) => m.includes('msg:partial-load')), 'the guest-visible message names the incomplete load');
});

await test('tickets · an endless stream of fresh cursors stops at the page budget', async () => {
  let n = 0;
  const h = tickets({ deadlineFetch: async () => okJson({ tickets: [{ id: ++n }], taxonomy, nextCursor: 'c' + n }) });
  await h.api.loadTickets({ quiet: true });
  assert.ok(h.urls.length <= 202, 'made ' + h.urls.length + ' requests');
  assert.equal(h.state.stale, true);
});

await test('tickets · a normal multi-page list still loads in full', async () => {
  const pages = { '/tickets': { tickets: [{ id: 1 }], taxonomy, nextCursor: 'p2' }, '/tickets?cursor=p2': { tickets: [{ id: 2 }], nextCursor: null } };
  const h = tickets({ deadlineFetch: async (u) => okJson(pages[u]) });
  await h.api.loadTickets({ quiet: true });
  assert.equal(h.state.tickets.length, 2);
  assert.equal(h.state.stale, false);
});

await test('tickets · attachments whose bytes cannot be read never reuse an earlier attempt key', async () => {
  const unreadable = () => { const f = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png', lastModified: 5 }); Object.defineProperty(f, 'arrayBuffer', { value: async () => { throw new Error('read failed'); } }); return f; };
  const h = tickets({ deadlineFetch: async () => { throw new TypeError('offline'); }, files: [unreadable()] });
  await h.api.publish({ preventDefault() {} });
  const first = h.bodies.at(-1).get('idempotency_key');
  h.state.files = [unreadable()];
  await h.api.publish({ preventDefault() {} });
  assert.notEqual(h.bodies.at(-1).get('idempotency_key'), first, 'same name, size and date but unreadable bytes: fresh key');
});

/* ───────────── vision · image preparation ───────────── */
function imageHarness({ width = 4000, height = 3000, stall = false } = {}) {
  const calls = { objectUrls: 0, revoked: 0, canvases: 0, drawn: 0 }; let timer = null, timerMs = 0;
  const window = {};
  const context = vm.createContext({ window, AbortController, Promise, Error, Number, Math,
    document: { createElement: () => { calls.canvases++; return { getContext: () => ({ drawImage: () => { calls.drawn++; } }), toDataURL: () => 'data:image/jpeg;base64,x' }; } },
    URL: { createObjectURL: () => { calls.objectUrls++; return 'blob:x'; }, revokeObjectURL: () => { calls.revoked++; } },
    Image: class { set src(v) { if (!stall && v) Promise.resolve().then(() => this.onload && this.onload()); } get naturalWidth() { return width; } get naturalHeight() { return height; } },
    setTimeout: (fn, ms) => { timer = fn; timerMs = ms; return 1; }, clearTimeout: () => { timer = null; } });
  vm.runInContext(read('assets/ai-image-import.js'), context);
  return { api: window.KiwiAiImageImport, calls, fire: () => timer && timer(), ms: () => timerMs };
}

await test('vision · a file over the byte cap is refused before it is decoded', async () => {
  const h = imageHarness();
  await assert.rejects(h.api.downscaleImage({ size: 200 * 1024 * 1024 }), /image-too-large/);
  assert.equal(h.calls.objectUrls, 0, 'no object URL, no decode');
});

await test('vision · an image over the pixel cap is refused before any canvas is made', async () => {
  const h = imageHarness({ width: 20000, height: 20000 });
  await assert.rejects(h.api.downscaleImage({ size: 5e6 }), /image-too-large/);
  assert.equal(h.calls.canvases, 0);
  assert.equal(h.calls.revoked, 1, 'the object URL is released');
  const ok = imageHarness({ width: 4000, height: 3000 });
  assert.match(await ok.api.downscaleImage({ size: 5e6 }), /^data:image\/jpeg/);
});

await test('vision · a decode that never answers ends at the deadline and releases its URL', async () => {
  const h = imageHarness({ stall: true });
  const p = h.api.downscaleImage({ size: 5e6 }).then(() => 'resolved', (e) => e.message);
  await Promise.resolve();
  assert.ok(h.ms() > 0 && h.ms() <= 60000, 'a deadline is armed');
  h.fire();
  assert.equal(await p, 'timeout');
  assert.equal(h.calls.revoked, 1);
});

await test('vision · closing the import aborts a stalled decode', async () => {
  const h = imageHarness({ stall: true });
  const stop = new AbortController();
  const p = h.api.downscaleImage({ size: 5e6 }, stop.signal).then(() => 'resolved', (e) => e.message);
  await Promise.resolve(); stop.abort();
  assert.equal(await p, 'cancelled');
  assert.equal(h.calls.revoked, 1);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(imageHarness().api.downscaleImage({ size: 1 }, pre.signal), /cancelled/);
});

/* ───────────── clients · audit export ───────────── */
await test('clients · a history longer than the limit is exported in parts that join without gaps or duplicates', async () => {
  const { exportAudit } = await import('../assets/clients-audit.js');
  const all = Array.from({ length: 25 }, (_, i) => ({ id: 'e' + i }));
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const before = new URL('https://x' + url).searchParams.get('auditBefore'), start = before ? Number(before) : 0;
    const events = all.slice(start, start + 10);
    return { ok: true, json: async () => ({ events, next: start + 10 < all.length ? String(start + 10) : null }) };
  };
  try {
    const files = [];
    const run = (from) => exportAudit({ book: 'a', clientId: 'c', controller: new AbortController(), current: () => true, progress() {}, limit: 12, from,
      download: async (blob) => files.push(JSON.parse(await blob.text())) });
    let result = await run(null);
    assert.equal(result.partial, true);
    result = await run(result.continuation);
    assert.equal(result.partial, true, 'the second part is itself bounded');
    result = await run(result.continuation);
    assert.equal(result.partial, false);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(files.flatMap((f) => f.events.map((e) => e.id)), all.map((e) => e.id));
    assert.equal(files[0].partial, true); assert.ok(files[0].continuation);
    assert.equal(files.at(-1).partial, undefined);
    await assert.rejects(exportAudit({ book: 'a', clientId: 'c', controller: new AbortController(), current: () => true, progress() {}, limit: 5, download() { assert.fail(); } }), /audit-limit/);
  } finally { globalThis.fetch = original; }
});

/* ───────────── tickets · triage accuracy on a labelled FR/AR corpus ───────────── */
await test('tickets · triage agrees with an independently labelled FR/AR/Darija/EN corpus and never demotes an urgent report', async () => {
  const { classify } = await import('../functions/api/_support.js');
  const corpus = JSON.parse(read('tools/fixtures/tickets/triage-corpus.json'));
  assert.ok(corpus.length >= 35 && corpus.some((c) => /[؀-ۿ]/.test(c.text)) && corpus.some((c) => /^[A-Za-z' ]+$/.test(c.text)));
  const wrong = corpus.filter((c) => { const r = classify(c.text); return r.category !== c.category || r.priority !== c.priority; }).map((c) => c.text);
  assert.deepEqual(wrong, [], 'misclassified reports');
  const urgent = corpus.filter((c) => c.priority === 'urgent');
  assert.ok(urgent.length >= 12 && urgent.every((c) => classify(c.text).priority === 'urgent'), 'every labelled urgent report surfaces as urgent');
  const falseAlarms = corpus.filter((c) => c.priority === 'normal' && classify(c.text).priority === 'urgent');
  assert.equal(falseAlarms.length, 0, 'ordinary reports (volume, download, ...) are not raised to urgent');
});

console.log(`r21-flows: ${passed} passed`);
