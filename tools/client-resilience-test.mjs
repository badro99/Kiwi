import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { declaration } = require('./split-functions.cjs');
const root = process.env.KIWI_CLIENT_SOURCE_ROOT || path.resolve('.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fn = (file, name, globals = {}) => vm.runInNewContext(declaration(read(file), name) + '\n' + name, globals, { filename: path.join(root, file), importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
let failures = 0;
async function test(name, work) { try { await work(); console.log('✓ ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
const realTimer = setTimeout;
const settle = promise => Promise.race([promise, new Promise((_, reject) => realTimer(() => reject(Error('still pending')), 200))]);
await test('#11 stalled onboarding response body settles', async () => {
  const oldFetch = globalThis.fetch, oldTimer = globalThis.setTimeout;
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  globalThis.setTimeout = (cb, ms) => oldTimer(cb, Math.min(ms, 10));
  let failed = false, draft;
  const data = { createDraft: () => (draft = { load() {}, async restore() { try { await this.transport(); } catch (_) { failed = true; } } }) };
  try {
    const open = fn('assets/onboarding.js', 'open', { window: { KiwiMe: { email: 'test' } }, loadData: async () => data,
      draft: null, LS: {}, TYPES: [], GOALS: [], opened: true, S: {}, dataFailure() { failed = true; },
      fetch: globalThis.fetch, AbortController, setTimeout: globalThis.setTimeout, clearTimeout });
    await settle(open()); assert.equal(failed, true);
  } finally { globalThis.fetch = oldFetch; globalThis.setTimeout = oldTimer; }
});
await test('#12 missing onboarding data shows retryable failure', async () => {
  const notices = [], scripts = [];
  const document = { readyState: 'loading', addEventListener() {}, createElement: () => ({ remove() {} }), head: { appendChild(s) { scripts.push(s); queueMicrotask(() => s.onerror()); } } };
  const window = { Kiwi: { handlers: {}, toast: message => notices.push(message) } };
  const context = { window, document, Kiwi: window.Kiwi, localStorage: { getItem: () => 'ar' }, setTimeout, clearTimeout };
  vm.runInNewContext(read('assets/onboarding.js'), context);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(notices.length); assert.ok(notices[0].includes('تعذر'));
  await window.KiwiOnboarding.open(); assert.equal(scripts.length, 2);
});
await test('#15 stalled IDB open and transaction release later saves', async () => {
  for (const opened of [false, true]) {
    let timeout, request = {}, closed = 0, aborted = 0;
    const db = { close() { closed++; }, transaction: () => ({ objectStore: () => ({ put() {} }), abort() { aborted++; } }) };
    const idb = fn('assets/employee-live.js', 'idb', { window: { indexedDB: { open: () => request } }, QUEUE_PREFIX: 'queue:', valid: x => x,
      setTimeout(cb) { timeout = cb; }, clearTimeout() {} });
    const first = idb('a', []);
    if (opened) { request.result = db; request.onsuccess(); }
    timeout(); assert.equal(await settle(first), null);
    if (!opened) { request.result = db; request.onsuccess(); }
    assert.ok(closed); if (opened) assert.equal(aborted, 1);
    const next = idb('a', []); timeout(); assert.equal(await settle(next), null);
  }
});
await test('#16 #17 real directory filter shares phone identities', () => {
  const window = {};
  vm.runInNewContext(read('assets/phone.js'), { window, document: { addEventListener() {} } });
  const state = { q: '', seg: 'all' }, all = [{ name: 'Salma', phone: '06 61 42 18 30' }, { name: 'Visitor', phone: '+33 6 61 42 18 30' }];
  const filter = fn('assets/clients-directory.js', 'filtered', { window, state, all, hotel: false });
  for (const q of ['0661421830', '+212661421830', '00212 (661) 42-18-30', '06.61.42.18.30']) {
    state.q = q; assert.equal(filter().length, 1, q); assert.equal(filter()[0].name, 'Salma');
  }
  state.q = 'sal'; assert.equal(filter()[0].name, 'Salma');
  state.q = '+33661421830'; assert.equal(filter()[0].name, 'Visitor');
});
await test('#24 #33 Arabic invoice names match without losing Latin accents', () => {
  let intake;
  vm.runInNewContext(read('assets/stock/intake.js'), { window: { KiwiStockInternal: { install(_, factory) { intake = factory({}); } } } });
  assert.equal(intake.matchInvoiceLines([{ label: 'حليب طازج' }], [{ id: 'milk', name: 'حليب طازج' }])[0].itemId, 'milk');
  assert.equal(intake.normalizeMatchStr('Crème-fraîche 10%'), 'creme fraiche 10');
  assert.equal(intake.normalizeMatchStr('Æsir Ø Café'), 'sir cafe');
  assert.equal(intake.matchInvoiceLines([{ label: 'زبدة' }], [{ id: 'milk', name: 'حليب' }])[0].itemId, null);
});
await test('#34 unknown supplier cannot borrow another pack factor', () => {
  const compare = fn('assets/stock/intake.js', 'compareLineCost');
  const item = { costPerUnit: 4, suppliers: [{ supplierName: 'A', factor: 12, defaultPrice: 36 }] };
  const unmatched = compare(item, 6, 'B'); assert.equal(unmatched.card == null, true); assert.equal(unmatched.factor, 1); assert.equal(unmatched.currentCost, 4);
  assert.equal(compare(item, 48, 'A').factor, 12);
});
await test('#28 auxiliary reference storage failure is visible and translated', () => {
  const messages = [];
  const write = fn('assets/serveur/payments.js', 'empPayRefsWrite', { localStorage: { setItem() { throw Error('quota'); } }, EMP_PAY_REFS_KEY: 'refs', console,
    employeePick: (fr, en, ar) => ar, toast: s => messages.push(s) });
  write({}); assert.ok(messages.length); assert.ok(messages[0].includes('مرجع'));
});
await test('#29 kitchen action explains journal failure', async () => {
  const messages = [];
  const create = fn('assets/caisse-kitchen/kitchen-paper.js', 'createTakeawayKitchenOrder', { kdsOrderSeq: 0, kdsOrders: [], window: { KiwiCaisseLang: { tr: () => 'translated failure' } },
    kitchenItemsFromLines: x => x, relayLinesFromCaisse: x => x, relayToKitchen: async () => {}, printKitchenTickets() {},
    persistShift() { throw Error('quota'); }, toast: s => messages.push(s), updateKdsCount() {}, kdsEl: { classList: { contains: () => false } } });
  assert.ok(create([{ qty: 1, price: 1 }])); await Promise.resolve(); assert.ok(messages.includes('translated failure'));
});
await test('#25 transfer and merge explain failed local persistence or publication', async () => {
  for (const name of ['confirmCaisseTransfer', 'confirmCaisseMerge']) for (const failing of ['persistShift', 'publishServiceFloor']) {
    const messages = [], node = { classList: { remove() {} } };
    const globals = { window: { KiwiCaisseLang: { tr: () => 'translated failure' } }, IS_DEMO: true,
      ctrfFromId: 'A', ctrfSelectedToId: 'B', cmrgSourceId: 'A', cmrgSelectedTargetId: 'B', tables: { A: {}, B: {} },
      tableOrders: {}, orders: {}, kdsOrders: [], $: () => node, liveTableSplit: () => null,
      tableSettlement: () => ({ transfer() {}, merge() {} }), applyCaisseMovedVisit() {},
      persistShift() {}, publishServiceFloor() {}, refreshTableNode() {}, openTable() {}, selectedId: '', toast: s => messages.push(s) };
    globals[failing] = () => { throw Error('storage'); };
    await fn('assets/caisse-floor/transfer-merge.js', name, globals)();
    assert.ok(messages.includes('translated failure'), name + ' ' + failing);
  }
});
await test('#22 PDF renders every scanned page up to the disclosed bound', async () => {
  let requested = [], cancelled = 0, destroyed = 0, timers = new Map(), sequence = 0;
  const pdf = { numPages: 15, async getPage(i) { requested.push(i); return { getTextContent: async () => ({ items: [] }), getViewport: () => ({ width: 10, height: 10 }), render: () => ({ promise: Promise.resolve(), cancel() { cancelled++; } }) }; } };
  const window = { pdfjsLib: { getDocument: () => ({ promise: Promise.resolve(pdf), destroy() { destroyed++; } }) } };
  vm.runInNewContext(read('assets/menu-scan-reader.js'), { window, document: { createElement: () => ({ getContext() {}, toDataURL: () => 'image' }) },
    setTimeout(cb) { timers.set(++sequence, cb); return sequence; }, clearTimeout(id) { timers.delete(id); } });
  const reader = window.KiwiMenuScanReader, file = { arrayBuffer: async () => new ArrayBuffer(0) };
  const scan = await reader.pdfFirstPageImage(file, true); assert.equal(scan.pagesRead, 12); assert.equal(scan.images.length, 12); assert.equal(scan.truncated, true); assert.equal(requested.at(-1), 12);

});
await test('#23 PDF preparation deadline and cancellation stop worker stages', async () => {
  let destroyed = 0, cancelled = 0, timers = new Map(), sequence = 0;
  const window = { pdfjsLib: {} };
  const scripts = [];
  const document = { head: { appendChild(s) { scripts.push(s); } }, createElement: () => ({ getContext() {} }) };
  vm.runInNewContext(read('assets/menu-scan-reader.js'), { window, document,
    setTimeout(cb) { timers.set(++sequence, cb); return sequence; }, clearTimeout(id) { timers.delete(id); } });
  const reader = window.KiwiMenuScanReader, file = { arrayBuffer: async () => new ArrayBuffer(0) };
  for (const stage of ['open', 'page', 'text', 'render', 'file']) {
    const pending = new Promise(() => {});
    window.pdfjsLib.getDocument = () => ({ promise: stage === 'open' ? pending : Promise.resolve({ numPages: 1, getPage: () => stage === 'page' ? pending : Promise.resolve({ getTextContent: () => pending, getViewport: () => ({ width: 1, height: 1 }), render: () => ({ promise: pending, cancel() { cancelled++; } }) }) }), destroy() { destroyed++; } });
    const controller = new AbortController();
    const work = stage === 'render' ? reader.pdfFirstPageImage(file, true, controller.signal) : reader.pdfText(stage === 'file' ? { arrayBuffer: () => pending } : file, true, controller.signal);
    for (let i=0;i<10;i++) await Promise.resolve();
    if (stage === 'text') controller.abort(); else for (const cb of [...timers.values()]) cb();
    await assert.rejects(settle(work), /pdf-(timeout|cancelled)/);
  }
  assert.ok(destroyed); assert.ok(cancelled);
  delete window.pdfjsLib;
  const work = reader.pdfText(file);
  for (let i=0;i<10;i++) await Promise.resolve();
  for (const cb of [...timers.values()]) cb();
  await assert.rejects(settle(work), /pdf-timeout/);
});
await test('#44 archive preserves binary files without reading attachment buffers', async () => {
  const file = new Blob(['original image bytes'], { type: 'image/jpeg' }); file.name = 'صورة.jpg'; file.arrayBuffer = () => { throw Error('whole attachment read'); };
  let button, blob, link;
  const fields = { formError: { appendChild(b) { button = b; } }, ticketBody: { value: 'draft' }, ticketKind: {}, ticketArea: {}, ticketSubkind: {}, ticketMoneyRisk: {} };
  const fallback = vm.runInNewContext(read('assets/tickets-recovery.js').replace(/^export /gm, '') + '\ndraftFallback', {
    Blob, TextEncoder, Uint8Array, document: { createElement(tag) { return tag === 'a' ? (link = { click() {} }) : {}; } },
    URL: { createObjectURL(value) { blob = value; return 'blob:export'; }, revokeObjectURL() {} }, setTimeout() {},
  });
  fallback({ $: id => fields[id], state: { files: [file] }, t: key => 'translated:' + key }).saveDraft();
  await button.onclick(); assert.equal(link.download, 'kiwi-ticket-draft.tar');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new TextDecoder(); let offset = 0, entries = new Map();
  while (bytes[offset]) { const name = decoder.decode(bytes.slice(offset, offset+100)).split('\0')[0]; const size = parseInt(decoder.decode(bytes.slice(offset+124,offset+136)),8); entries.set(name, bytes.slice(offset+512,offset+512+size)); offset += 512 + Math.ceil(size/512)*512; }
  assert.equal(decoder.decode(entries.get('attachments/0')), 'original image bytes');
  assert.equal(JSON.parse(decoder.decode(entries.get('draft.json'))).files[0].name, 'صورة.jpg');
  assert.ok(blob.size < 4096);
});
if (failures) process.exitCode = 1;
