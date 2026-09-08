#!/usr/bin/env node
// Real module in an isolated VM; only DOM, storage, clock and external services are faked.
// No customer data, network, filesystem writes or production exports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/pos-hotel.js', import.meta.url), 'utf8');
const recorderSource = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');
const seam = `
  window.audit = { mkStay, stayTotals, staySaleLines, factureHTML, openCheckout,
    renderFolioDetail, openChargeSheet, STAYS, ROOMS, DEPARTURES, state,
    setRoot: (el) => { root = el; state.view = 'test'; },
    sequence: () => factureSeq };
`;
assert(source.trimEnd().endsWith('})();'), 'module closure is available for a test-only seam');
const instrumented = source.replace(/\}\)\(\);\s*$/, seam + '})();');
const copy = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
async function check(name, run) {
  await run();
  console.log(`  ok ${++checks} - ${name}`);
}

function boot({ real = true, record } = {}) {
  const nodes = new Map(), messages = [], calls = [], timers = [], saved = [];
  let spec;
  function node(key) {
    if (nodes.has(key)) return nodes.get(key);
    const classes = new Set();
    const el = {
      innerHTML: '', textContent: '', value: '', dataset: {}, style: {},
      classList: {
        add: (v) => classes.add(v), remove: (v) => classes.delete(v),
        contains: (v) => classes.has(v), toggle: () => {},
      },
      querySelector: node,
      querySelectorAll(selector) {
        if (selector !== '[data-ht-pm]') return [];
        return [...this.innerHTML.matchAll(/data-ht-pm="([^"]+)"/g)].map((m) => {
          const button = node('pay:' + m[1]);
          button.dataset.htPm = m[1];
          return button;
        });
      },
      closest: () => node('#ht-checkout-veil'),
      appendChild: (child) => messages.push(child.textContent), remove() {},
    };
    nodes.set(key, el);
    return el;
  }
  const storage = new Map();
  const window = {
    KiwiEnv: { isReal: () => real },
    KiwiPlatform: { isPaired: () => real, pairedVenue: () => real ? { merchant: 'synthetic-hotel', name: 'Test Hotel' } : null },
    KiwiPosDispatch: { register() {} },
    KiwiVerticalState: { open: (_name, value) => {
      spec = value;
      return { save: () => saved.push(copy(spec.snapshot())) };
    } },
    KiwiPosSale: { record: (...args) => { calls.push(copy(args)); return record(...args); } },
    KiwiHardware: { authorizeCard: async () => ({ approved: true }) },
    KiwiCaisseContext: { current: () => ({ merchant: 'synthetic-hotel', terminalId: 'terminal-test', cashierId: 'staff-test', shiftId: 'shift-test' }) },
    addEventListener() {},
  };
  const context = {
    window, document: { querySelector: node, querySelectorAll: () => [], createElement: () => node('created:' + nodes.size) },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    navigator: { onLine: true },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {}, console, Date, Intl,
    fetch: () => { throw new Error('Network forbidden in billing safety test'); },
  };
  // Default success cases run the actual recorder as well as the actual hotel module.
  if (!record) {
    vm.runInNewContext(recorderSource, context, { filename: 'assets/pos-sale.js' });
    const actualRecord = window.KiwiPosSale.record;
    window.KiwiPosSale.record = (...args) => { calls.push(copy(args)); return actualRecord(...args); };
  }
  vm.runInNewContext(instrumented, context, { filename: 'assets/pos-hotel.js' });
  const api = window.audit;
  api.ROOMS[101] = { n: 101, type: 'test', name: 'Test room', rate: 500, status: 'depart' };
  const stay = api.mkStay(101, { guest: 'Synthetic guest', src: 'booking', pax: 1, nights: 2, day: 1 });
  api.DEPARTURES.push({ room: 101, done: false });
  api.setRoot(node('root'));
  return { api, stay, window, node, messages, calls, saved, spec,
    async timer(delay) {
      const index = timers.findIndex((t) => t.delay === delay);
      assert(index >= 0, `timer ${delay} was scheduled`);
      await timers.splice(index, 1)[0].fn();
      await Promise.resolve();
    },
    checkout(method) {
      api.openCheckout(101);
      assert.equal(typeof node('pay:' + method).onclick, 'function');
      node('pay:' + method).onclick();
      if (method === 'especes') node('#ht-cash-ok').onclick();
    },
  };
}

for (const method of ['especes', 'online', 'carte']) {
  for (const failure of ['missing', 'null', 'false', 'throw', 'ok-false', 'empty', 'ok-only', 'true', 'wrong-total']) {
    await check(`${method}: ${failure} recorder preserves stay, payment list, departure and invoice sequence`, async () => {
      const h = boot({ record: () => {
        if (failure === 'throw') throw new Error('synthetic recording failure');
        if (failure === 'ok-false') return { ok: false, reason: 'queue-storage-full', id: 'failed-id' };
        if (failure === 'empty') return {};
        if (failure === 'ok-only') return { ok: true, queued: true, id: 'queue-id' };
        if (failure === 'true') return true;
        if (failure === 'wrong-total') return { ts: Date.now(), total: 1, m: 'synthetic-hotel', method: 'cash', ref: 'wrong-total' };
        return failure === 'false' ? false : null;
      } });
      if (failure === 'missing') delete h.window.KiwiPosSale;
      const before = copy(h.spec.snapshot());
      h.checkout(method);
      if (method === 'carte') { await h.timer(1900); await h.timer(900); }
      assert.deepEqual(copy(h.spec.snapshot()), before);
      assert.equal(h.api.ROOMS[101].status, 'depart');
      assert(h.node('#ht-checkout-veil').classList.contains('is-open'));
      assert(!h.node('#ht-facture-veil').classList.contains('is-open'));
      assert(h.messages.some((m) => m.includes('Paiement non enregistré') && m.includes('déjà reçu')));
    });
  }
}

await check('retry after a failed recording closes once; a repeated completion cannot record twice', () => {
  let accepted = false;
  const h = boot();
  const actualRecord = h.window.KiwiPosSale.record;
  h.window.KiwiPosSale.record = (...args) => {
    if (accepted) return actualRecord(...args);
    h.calls.push(copy(args)); return null;
  };
  h.checkout('especes');
  accepted = true;
  const confirm = h.node('#ht-cash-ok').onclick;
  confirm(); confirm();
  assert.equal(h.calls.length, 2); // One rejected attempt, one local entry, no third call.
  assert.equal(h.stay.payments.length, 1);
  assert.equal(h.stay.payments[0].amount, 1054);
  assert.equal(h.api.STAYS[101], undefined);
  assert.equal(h.api.ROOMS[101].status, 'menage');
  assert.equal(h.api.DEPARTURES.find((d) => d.room === 101).done, true);
  assert(h.saved.length > 0);
  assert(!h.messages.some((m) => /serveur|synchronis/i.test(m)));
});

await check('a zero-balance departure needs no new sale; demo null recorder still closes', () => {
  const h = boot();
  h.stay.payments.push({ amount: 1054, method: 'carte', label: 'Earlier payment' });
  h.checkout('zero');
  assert.equal(h.calls.length, 0);
  assert.equal(h.stay.payments.length, 1);
  assert.equal(h.api.STAYS[101], undefined);
  const demo = boot({ real: false, record: () => null });
  demo.checkout('especes');
  assert.equal(demo.api.STAYS[101], undefined);
});

await check('new stay rate survives catalogue changes and restore in totals, journal lines and rendered bill', () => {
  const h = boot();
  assert.equal(h.stay.nightlyRate, 500);
  const snapshot = copy(h.spec.snapshot());
  h.api.ROOMS[101].rate = 700;
  h.spec.restore(snapshot);
  const restored = h.api.STAYS[101];
  assert.equal(h.api.stayTotals(restored).nuitees, 1000);
  const lines = h.api.staySaleLines(restored, 1054);
  assert.equal(lines.find((l) => l.category === 'nuitees').total, 1000);
  assert.equal(lines.reduce((sum, l) => sum + l.total, 0), 1054);
  h.api.state.folioRoom = 101;
  h.api.renderFolioDetail();
  assert(h.node('[data-ht-panel="folios"]').innerHTML.includes('500 MAD/nuit'));
  assert(h.api.factureHTML(restored, true).includes('<span>1000</span>'));
});

await check('zero is a valid frozen rate; legacy or invalid snapshots retain the catalogue fallback', () => {
  const h = boot();
  h.api.ROOMS[101].rate = 0;
  const free = h.api.mkStay(101, { guest: 'Synthetic guest', src: 'direct', pax: 1, nights: 1, day: 1 });
  h.api.ROOMS[101].rate = 700;
  assert.equal(h.api.stayTotals(free).nuitees, 0);
  for (const value of [undefined, null, -1, NaN, Infinity]) {
    const legacy = { ...h.stay, nightlyRate: value };
    assert.equal(h.api.stayTotals(legacy).nuitees, 1400);
  }
});

await check('posted extras render disabled with explanation and resist delegated plus/minus events', () => {
  const h = boot();
  h.stay.charges.push({ uid: 'linked', cid: 'diner', qty: 1, at: '08/09/2026 12:00', saleId: 'sale-test' });
  h.api.state.folioRoom = 101;
  h.api.renderFolioDetail();
  const html = h.node('[data-ht-panel="folios"]').innerHTML;
  for (const op of ['plus', 'minus']) {
    assert(new RegExp(`<button data-ht-c${op}="linked"[^>]*disabled`).test(html));
    const before = copy(h.stay);
    h.node('#ht-fp-lines').onclick({ target: { closest: (selector) => selector === `[data-ht-c${op}]` ? { dataset: { [op === 'plus' ? 'htCplus' : 'htCminus']: 'linked' } } : null } });
    assert.deepEqual(copy(h.stay), before);
  }
  assert(html.includes('annulation liée à la vente'));
  assert.equal(h.calls.length, 0);
});

await check('unposted extras remain editable, including removal at zero', () => {
  const h = boot();
  h.stay.charges.push({ uid: 'draft', cid: 'diner', qty: 1, at: '' });
  h.api.state.folioRoom = 101;
  h.api.renderFolioDetail();
  const click = (op) => h.node('#ht-fp-lines').onclick({ target: { closest: (selector) => selector === `[data-ht-c${op}]` ? { dataset: { [op === 'plus' ? 'htCplus' : 'htCminus']: 'draft' } } : null } });
  click('plus'); assert.equal(h.stay.charges[0].qty, 2);
  click('minus'); click('minus'); assert.equal(h.stay.charges.length, 0);
});

await check('new extras record calendar timestamps; invoice preserves and escapes timestamps and notes', async () => {
  const h = boot({ record: () => ({ saleId: 'sale-extra-test' }) });
  h.api.openChargeSheet(101, 'diner');
  h.node('#ht-ch-reveal').onclick();
  h.node('#ht-ch-match').onclick();
  await h.node('#ht-ch-add').onclick();
  assert.equal(h.stay.charges.length, 1);
  const charge = h.stay.charges[0];
  assert(charge.at.includes(String(new Date().getFullYear())));
  assert(!charge.at.includes('auj.'));
  assert(h.api.factureHTML(h.stay, true).includes(charge.at));
  charge.at = '<date>'; charge.note = '<note>';
  const html = h.api.factureHTML(h.stay, true);
  assert(html.includes('&lt;date&gt;') && html.includes('&lt;note&gt;'));
  assert(!html.includes('<date>') && !html.includes('<note>'));
  delete charge.at;
  assert(!h.api.factureHTML(h.stay, true).includes('undefined'));
});

await check('actual recorder returns entry without ok; failed mirror queue is not a server acceptance signal', () => {
  const h = boot();
  h.window.KiwiLive = { isOn: () => true, postSale: () => ({ ok: false, reason: 'queue-storage-full', id: 'refused-sale' }) };
  const entry = h.window.KiwiPosSale.record('hotel', { total: 10, method: 'especes', ref: 'contract-test' });
  assert.equal(entry.ok, undefined);
  assert.equal(entry.total, 10);
  assert.equal(entry.method, 'cash');
  assert.equal(entry.m, 'synthetic-hotel');
  assert(entry.ts > 0 && entry.ref.startsWith('contract-test-'));
  // Current upstream behavior: even a refused mirror result supplies this ID.
  // It must never be described as evidence of successful queueing or persistence.
  assert.equal(entry.saleId, 'refused-sale');
  assert.equal(h.window.KiwiPosSale.record('hotel', { total: 0 }), null);
  const demo = boot({ real: false });
  assert.equal(demo.window.KiwiPosSale.record('hotel', { total: 10 }), null);
});

await check('explicit failure overrides otherwise valid entry fields', () => {
  const h = boot();
  const actualRecord = h.window.KiwiPosSale.record;
  h.window.KiwiPosSale.record = (...args) => ({ ...actualRecord(...args), ok: false });
  h.checkout('especes');
  assert.equal(h.api.STAYS[101], h.stay);
  assert.equal(h.stay.payments.length, 0);
  assert.equal(h.api.ROOMS[101].status, 'depart');
});

console.log(`hotel-pos-billing-safety-test: ${checks} checks passed`);
