#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../assets/hotel.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../assets/hotel.css', import.meta.url), 'utf8');
// Execute the complete production module, including register(). Only expose
// references at its final IIFE boundary; never extract/reimplement its functions.
assert.match(source, /\}\)\(\);\s*$/);
const instrumented = source.replace(/\}\)\(\);\s*$/, `
  window.__journalTest = {
    cuReceptionBuckets, cuReceptionJournal, cuReceptionSelection,
    cuAllStays, cuStayCache, cuFetchStaysForWindow, cuFetchInHouseStays,
    cuRefreshReception, cuSubmitStay, cuStayScope,
    cuState, cuHydrate, cuDocument, cuMerge, nowLabel,
    cuCommercialState, cuCommercialBody, cuQuoteRows, cuStayQuoteSignature, cuWireStayCommercial, cuLoadCommercial,
    cuProductionState, cuProductionBody, cuLoadProduction,cuSejoursBody
  };
})();`);
const TODAY = '2026-09-08';
const clone = (value) => JSON.parse(JSON.stringify(value));
const ids = (rows) => Array.from(rows, (row) => row.id).sort();
const response = (stays) => ({ ok: true, json: async () => ({ stays: clone(stays) }) });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function stay(id, status = 'confirmed', checkIn = TODAY, checkOut = '2026-09-10', extra = {}) {
  return {
    id, status, code: 'RES-' + id, updatedAt: 100, resourceId: 'room:1',
    customer: { name: 'Guest ' + id }, partySize: 2,
    ...extra,
    hotel: { checkIn, checkOut, channel: 'direct', roomTypeName: 'Chambre', ...extra.hotel },
  };
}

function boot({ venue = 'scoped', merchant = 'journal-alpha' } = {}) {
  let activeVenue = venue, activeMerchant = merchant;
  let now = Date.parse(TODAY + 'T13:24:00Z');
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const data = new Map(), docs = new Map(), handlers = {}, requests = [], replies = [];
  const forms = [], modals = [], unexpected = [];
  const localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const docKey = () => activeMerchant || activeVenue;
  const getDoc = () => clone(docs.get(docKey()) || { bookings: [] });
  const window = {
    localStorage, addEventListener() {},
    Kiwi: {
      handlers, toast() {},
      appPage() { return { el: { querySelector() { return null; } }, close() {} }; },
      modal(options) {
        const form = forms.shift();
        assert.ok(form, 'an editor form must be supplied to the modal fixture');
        const modal = { options, closed: 0, el: { querySelector: () => form }, close() { this.closed++; } };
        // Production stores an unbound close callback.
        modal.close = () => { modal.closed++; };
        modals.push(modal);
        return modal;
      },
    },
    KiwiVenue: {
      getVenue: () => activeVenue,
      getCurrentVenueData: () => ({ id: activeVenue, slug: activeMerchant, name: 'Synthetic hotel', type: 'hotel', custom: true, profileInfo: { rooms: 2 } }),
      getVenueType: () => 'hotel', isCustom: () => true, subscribe: () => () => {},
    },
    KiwiStore: { slugFor: () => activeMerchant },
    KiwiReservations: { get: getDoc, set: (doc) => docs.set(docKey(), clone(doc)), subscribe: () => () => {} },
  };
  const context = {
    window, localStorage, console, document: { addEventListener() {} },
    setTimeout() { return 0; }, clearTimeout() {},
    Date: FixtureDate, Math, JSON, Object, Array, String, Number, Map, Set, URL, URLSearchParams, Intl,
    crypto: { randomUUID },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form.elements[key]?.value ?? ''; } },
    fetch(url, options = {}) {
      requests.push({ url: new URL(url, 'https://synthetic.invalid'), options });
      if (!replies.length) {
        unexpected.push(String(url));
        return Promise.reject(new Error('Unexpected fixture request: ' + url));
      }
      return Promise.resolve(replies.shift());
    },
  };
  vm.runInNewContext(instrumented, context, { filename: 'assets/hotel.js', timeout: 5000 });
  return {
    api: window.__journalTest, window, handlers, requests, modals, forms, data,
    tick(ms = 1) { now += ms; return now; },
    reply: (...items) => replies.push(...items),
    switchTenant(slug, id = activeVenue) { activeMerchant = slug; activeVenue = id; },
    setDoc(bookings) { docs.set(docKey(), { bookings: clone(bookings) }); },
    getDoc,
    assertNetwork() { assert.deepEqual(unexpected, [], 'every fetch uses an explicit synthetic reply'); assert.equal(replies.length, 0, 'all expected requests were made'); },
  };
}

function journal(f, rows, selection = {}) {
  Object.assign(f.api.cuReceptionSelection(), { date: TODAY, view: 'arrivals', q: '' }, selection);
  return f.api.cuReceptionJournal(rows, TODAY);
}
function rowIds(html) {
  return Array.from(html.matchAll(/data-action="hx-stay-edit" data-arg="([^"]*)"/g), (m) => m[1]).sort();
}
function formFixture() {
  const values = { name: 'Retry Guest', checkIn: TODAY, checkOut: '2026-09-10', roomTypeId: 'type:chambre', resourceId: '', partySize: '2', channel: 'direct', status: 'confirmed', stayMode:'overnight',dayUsePrice:'',arrivalTime:'09:00',departureTime:'18:00' };
  const elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, addEventListener() {} }]));
  elements.resourceId.options = [{ value: '', dataset: {} }];
  elements.resourceId.selectedOptions = elements.resourceId.options;
  const submit = { disabled: false }, error = { textContent: '' }, events = {};
  return {
    elements, submit, error, events,
    querySelector: (selector) => ({ '[type="submit"]': submit, '[data-hx-stay-error]': error })[selector] || null,
    querySelectorAll: () => [],
    addEventListener(name, callback) { events[name] = callback; },
  };
}

test('commercial directory renders typed filters, navigation and escaped identities', () => {
  const f = boot(), st = f.api.cuCommercialState();
  st.accounts = [{ id: 'account-test', kind: 'agency', name: '<script>unsafe()</script>', legalName: 'Test', paymentDays: 30 }, { id: 'company-test', kind: 'company', name: 'Company', paymentDays: 0 }];
  st.kind = 'agency';
  const html = f.api.cuCommercialBody();
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /hx-account-stays/); assert.match(html, /hx-account-edit/);
  assert.doesNotMatch(html, /data-arg="company-test"/);
  for (const action of ['hx-commercial', 'hx-account-new', 'hx-contract-new', 'hx-account-stays']) assert.equal(typeof f.handlers[action], 'function');
});
test('calendar separates same-day hourly occupancy from the following overnight stay',()=>{
  const f=boot();
  const st=f.api.cuState();st.rooms={101:{id:'room:101',n:101,typeId:'type:chambre',status:'libre'}};
  f.setDoc([stay('day-use','confirmed',TODAY,TODAY,{resourceId:'room:101',hotel:{dayUse:true,arrivalTime:'09:00',departureTime:'14:00'}}),stay('night','confirmed',TODAY,'2026-09-09',{resourceId:'room:101',hotel:{arrivalTime:'15:00',departureTime:'11:00'}})]);
  const html=f.api.cuSejoursBody(),bars=[...html.matchAll(/style="left:([\d.]+)%;width:calc\(([\d.]+)% - 1px\)" data-action="hx-stay-edit" data-arg="([^"]+)"/g)];
  assert.equal(bars.length,2);assert.equal(bars[0][3],'day-use');
  assert.ok(Number(bars[0][1])+Number(bars[0][2])<=Number(bars[1][1]),'day-use and overnight bars do not cover one another');
  assert.match(html,/Day-use · 09:00–14:00/);
});
test('contract cards follow the account filter and monthly reporting stays reachable', () => {
  const f = boot(), st = f.api.cuCommercialState();
  st.accounts = [{ id: 'account-agency', kind: 'agency', name: 'Agency', paymentDays: 0 }, { id: 'account-company', kind: 'company', name: 'Company', paymentDays: 0 }];
  st.contracts = [{ id: 'rate-company', accountId: 'account-company', name: 'Company only', occupancy: 1, board: 'bb', amountCents: 10000 }];
  st.kind = 'agency';
  assert.doesNotMatch(f.api.cuCommercialBody(), /Company only/);
  assert.match(f.api.cuCommercialBody(), /hx-production/);
  assert.equal(typeof f.handlers['hx-production'], 'function');
});
test('monthly report discards out-of-order replies and isolates hotels', async () => {
  const f = boot(), first = deferred(), second = deferred();
  f.reply(first.promise, second.promise);
  f.api.cuProductionState().month = '2027-01'; const a = f.api.cuLoadProduction();
  f.api.cuProductionState().month = '2027-02'; const b = f.api.cuLoadProduction();
  second.resolve({ ok: true, json: async () => ({ month: '2027-02', groups: [], totals: [] }) }); await b;
  first.resolve({ ok: true, json: async () => ({ month: '2027-01', groups: [{ name: 'Stale month' }], totals: [] }) }); await a;
  assert.equal(f.api.cuProductionState().report.month, '2027-02');
  assert.doesNotMatch(f.api.cuProductionBody(), /Stale month/);
  f.switchTenant('journal-beta'); assert.equal(f.api.cuProductionState().report, null);
  f.assertNetwork();
});
test('monthly report does not retain stale totals after failure and escapes account labels', async () => {
  const f = boot(), st = f.api.cuProductionState();
  st.report = { month: st.month, nights: 2, reservations: 1, unassigned: 0, totals: [2], groups: [{ name: '<script>bad()</script>', kind: 'company', nights: 2, days: [2] }] };
  assert.match(f.api.cuProductionBody(), /&lt;script&gt;/); assert.match(f.api.cuProductionBody(), /scope="col"/);
  f.reply({ ok: false, json: async () => ({ error: 'production-limit' }) });
  await f.api.cuLoadProduction();
  assert.equal(st.report, null); assert.match(st.error, /total partiel/);
  assert.doesNotMatch(f.api.cuProductionBody(), /<table/);
  f.assertNetwork();
});
test('late commercial reads cannot expose another hotel directory', async () => {
  const f = boot(), pending = deferred(); f.reply(pending.promise);
  const load = f.api.cuLoadCommercial(); f.switchTenant('journal-beta');
  pending.resolve({ ok: true, json: async () => ({ rev: 1, accounts: [{ id: 'private-alpha', kind: 'agency', name: 'Alpha agency' }], contracts: [] }) });
  await load;
  assert.equal(f.api.cuCommercialState().accounts.length, 0);
  assert.doesNotMatch(f.api.cuCommercialBody(), /Alpha agency/);
  f.switchTenant('journal-alpha'); assert.equal(f.api.cuCommercialState().accounts.length, 1);
  f.assertNetwork();
});
test('commercial quote view keeps cents, escapes labels and calls itself a simulation', () => {
  const f = boot();
  const html = f.api.cuQuoteRows({ totalCents: 10005, taxBasis: 'inclusive', rows: [{ date: TODAY, label: '<img src=x>', quantity: 1, unitCents: 10005, amountCents: 10005 }] });
  assert.match(html, /100\.05 MAD/); assert.match(html, /pas une facture/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
});
test('quote response after a date edit cannot become an accepted price', async () => {
  const f = boot(), form = formFixture(), click = {}, result = { textContent: '', innerHTML: '' }, button = { addEventListener(type, fn) { click[type] = fn; } };
  const box = { innerHTML: '', querySelector(s) { return s === '[data-hx-quote]' ? button : result; } };
  const original = form.querySelector;
  form.querySelector = s => s === '[data-hx-commercial-stay]' ? box : original(s);
  Object.assign(form.elements, { accountId: { value: 'agency-test' }, board: { value: 'bb' }, priceMode: { value: 'contract' } });
  f.reply({ ok: true, json: async () => ({ rev: 1, accounts: [], contracts: [] }) });
  await f.api.cuWireStayCommercial(form, null);
  const delayed = deferred(); f.reply(delayed.promise);
  const loading = click.click(); form.elements.checkOut.value = '2026-09-20';
  delayed.resolve({ ok: true, json: async () => ({ rev: 1, quote: { totalCents: 10000, rows: [] } }) });
  await loading; assert.equal(form.__commercialQuote, null); assert.equal(button.disabled, false); f.assertNetwork();
});
test('daily movements use the selected day; presence and overdue use current status', () => {
  const f = boot();
  const rows = [
    stay('arrival'), stay('arrived', 'checked_in'),
    stay('departure', 'checked_in', '2026-09-05', TODAY),
    stay('departed', 'completed', '2026-09-05', TODAY),
    stay('overdue-house', 'checked_in', '2026-08-01', '2026-08-03'),
    stay('overdue-arrival', 'confirmed', '2026-09-07'),
    stay('overdue-request', 'requested', '2026-09-07'),
    stay('future', 'confirmed', '2026-09-09'),
    stay('cancelled', 'cancelled', TODAY, TODAY), stay('no-show', 'no_show', TODAY, TODAY),
    stay('old-cancelled', 'cancelled', '2026-09-01', '2026-09-02'),
    stay('old-no-show', 'no_show', '2026-09-01', '2026-09-02'),
    { id: 'non-hotel', status: 'checked_in' },
  ];
  const buckets = f.api.cuReceptionBuckets(rows, TODAY, TODAY);
  assert.deepEqual(ids(buckets.arrivals), ['arrival', 'arrived']);
  assert.deepEqual(ids(buckets.departures), ['departed', 'departure']);
  assert.deepEqual(ids(buckets.inhouse), ['arrived', 'departure', 'overdue-house']);
  assert.deepEqual(ids(buckets.attention), ['overdue-arrival', 'overdue-house', 'overdue-request']);
  const future = f.api.cuReceptionBuckets(rows, '2026-09-09', TODAY);
  assert.deepEqual(ids(future.arrivals), ['future']);
  assert.deepEqual(ids(future.inhouse), ids(buckets.inhouse));
  assert.deepEqual(ids(future.attention), ids(buckets.attention));
  for (const view of ['arrivals', 'departures', 'inhouse', 'attention']) {
    assert.deepEqual(rowIds(journal(f, rows, { view })), ids(buckets[view]), view + ' renders exactly its bucket');
  }
});

test('journal search matches accent-insensitive names, internal/OTA references and assigned room numbers', () => {
  const f = boot();
  const rows = [stay('elodie', 'confirmed', TODAY, undefined, { customer: { name: 'Élodie Atlas' }, code: 'KIWI-742', hotel: { externalRef: 'OTA-982' } }), stay('other', 'confirmed', TODAY, undefined, { resourceId: 'room:2' })];
  for (const q of ['ELODIE', 'kiwi-742', 'ota-982', '1']) assert.deepEqual(rowIds(journal(f, rows, { q })), ['elodie'], q);
  assert.deepEqual(rowIds(journal(f, rows, { q: '2' })), ['elodie', 'other']);
  assert.deepEqual(rowIds(journal(f, rows, { q: 'absent' })), []);
});

test('journal escapes guest text, references, notes, dates, statuses and action attributes', () => {
  const f = boot(), attack = `<img src=x onerror="alert('x')">&`;
  const escaped = '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;';
  const row = stay(attack, attack, TODAY, attack, { customer: { name: attack }, code: attack, note: attack, partySize: attack, hotel: { externalRef: attack, roomTypeName: attack } });
  const html = journal(f, [row]);
  assert.ok(!html.includes(attack));
  assert.ok(!/<img\b|<script\b/i.test(html));
  assert.ok(html.includes(`data-arg="${escaped}"`));
  assert.ok(html.includes(`<b>${escaped}</b>`));
  assert.ok(html.split(escaped).length >= 9, 'all independent untrusted row fields are escaped');
  const filtered = journal(f, [row], { q: attack, date: attack });
  assert.ok(filtered.includes(`value="${escaped}"`));
  assert.ok(!filtered.includes(attack));
});

test('journal actions are registered by the whole module and controls have accessible labels', () => {
  const f = boot(), html = journal(f, [stay('sample')]);
  for (const name of ['hx-daily-apply', 'hx-daily-refresh', 'hx-stay-new', 'hx-stay-edit', 'hx-stay-cancel-confirm']) assert.equal(typeof f.handlers[name], 'function', name);
  for (const [, action] of html.matchAll(/data-action="([^"]+)"/g)) assert.equal(typeof f.handlers[action], 'function', action);
  for (const control of ['date', 'view', 'search']) assert.match(html, new RegExp(`<label[^>]*>[^<]+<(?:input|select)[^>]*data-hx-daily-${control}`));
  assert.match(html, /aria-label="Ouvrir le dossier RES-sample"/);
});

test('date/view/search apply handler updates filters and refreshes both server reads', async () => {
  const f = boot();
  let reported = 0;
  const controls = {
    '[data-hx-daily-date]': { value: '', checkValidity: () => false, reportValidity() { reported++; } },
    '[data-hx-daily-view]': { value: 'inhouse' },
    '[data-hx-daily-search]': { value: 'Atlas' },
  };
  const button = { closest: () => ({ querySelector: (selector) => controls[selector] }) };
  f.handlers['hx-daily-apply'](button);
  assert.equal(reported, 1);
  assert.equal(f.requests.length, 0);
  Object.assign(controls['[data-hx-daily-date]'], { value: '2026-10-03', checkValidity: () => true });
  f.reply(response([]), response([]));
  f.handlers['hx-daily-apply'](button);
  await new Promise(setImmediate);
  assert.deepEqual(clone(f.api.cuReceptionSelection()), { date: '2026-10-03', view: 'inhouse', q: 'Atlas' });
  const windowRead = f.requests.find((r) => r.url.searchParams.has('from'));
  const presenceRead = f.requests.find((r) => r.url.searchParams.get('status') === 'checked_in');
  assert.equal(windowRead.url.searchParams.get('from'), '2026-10-03');
  assert.equal(windowRead.url.searchParams.get('to'), '2026-10-03');
  assert.ok(presenceRead);
  assert.equal(presenceRead.url.searchParams.has('from'), false, 'overdue presence is not bounded by the movement date');
  f.assertNetwork();
});

test('window fetch retains returned cancellations and a newer document cancellation beats a stale network stay', async () => {
  const f = boot();
  f.setDoc([stay('newer-doc', 'cancelled', TODAY, undefined, { updatedAt: 900 }), stay('server-cancelled')]);
  f.reply(response([stay('newer-doc'), stay('server-cancelled', 'cancelled', TODAY, undefined, { updatedAt: 800 })]));
  const returned = await f.api.cuFetchStaysForWindow(TODAY, TODAY);
  assert.equal(f.requests[0].url.searchParams.get('includeCancelled'), '1');
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(returned.find((s) => s.id === 'server-cancelled').status, 'cancelled');
  assert.equal(f.api.cuStayCache().get('server-cancelled').status, 'cancelled');
  assert.equal(f.api.cuAllStays().get('newer-doc').status, 'cancelled');
  assert.equal(f.api.cuAllStays().get('server-cancelled').status, 'cancelled');
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()))), []);
  f.assertNetwork();
});

for (const reader of ['cuFetchStaysForWindow', 'cuFetchInHouseStays']) {
  test(`${reader}: late replies stay with their originating merchant across a shared venue id`, async () => {
    const f = boot(), pending = deferred();
    const alphaCache = f.api.cuStayCache();
    Object.assign(f.api.cuReceptionSelection(), { q: 'Alpha private', date: TODAY });
    f.reply(pending.promise);
    const work = f.api[reader](TODAY, TODAY);
    assert.equal(f.requests[0].url.searchParams.get('merchant'), 'journal-alpha');
    f.switchTenant('journal-beta');
    f.setDoc([stay('beta-doc')]);
    const betaCache = f.api.cuStayCache();
    assert.notEqual(alphaCache, betaCache);
    assert.equal(f.api.cuReceptionSelection().q, '');
    pending.resolve(response([stay('alpha-private', 'checked_in')]));
    await work;
    assert.deepEqual(ids(f.api.cuAllStays().values()), ['beta-doc']);
    assert.equal(betaCache.size, 0);
    assert.ok(!journal(f, Array.from(f.api.cuAllStays().values())).includes('alpha-private'));
    f.switchTenant('journal-alpha');
    assert.equal(f.api.cuStayCache(), alphaCache);
    assert.equal(alphaCache.get('alpha-private').id, 'alpha-private');
    assert.equal(f.api.cuReceptionSelection().q, 'Alpha private');
    f.assertNetwork();
  });

  test(`${reader}: older overlapping response cannot overwrite a newer cancellation`, async () => {
    const f = boot(), pending = deferred();
    f.reply(pending.promise);
    const work = f.api[reader](TODAY, TODAY);
    f.api.cuStayCache().set('race', stay('race', 'cancelled', TODAY, undefined, { updatedAt: 500 }));
    pending.resolve(response([stay('race', 'checked_in', TODAY, undefined, { updatedAt: 100 })]));
    await work;
    assert.equal(f.api.cuAllStays().get('race').status, 'cancelled');
    f.assertNetwork();
  });
}

test('unconnected hotels isolate fallback cache and filter scope by the selected merchant slug', () => {
  const f = boot({ merchant: '' });
  f.window.KiwiVenue.getCurrentVenueData = () => ({ slug: 'offline-alpha', type: 'hotel' });
  const alpha = f.api.cuStayCache();
  alpha.set('private', stay('private'));
  f.api.cuReceptionSelection().q = 'private';
  f.window.KiwiVenue.getCurrentVenueData = () => ({ slug: 'offline-beta', type: 'hotel' });
  assert.notEqual(f.api.cuStayCache(), alpha);
  assert.equal(f.api.cuAllStays().size, 0);
  assert.equal(f.api.cuReceptionSelection().q, '');
});

test('complete in-house snapshots remove departed guests even when a stale document and date cache retain them', async () => {
  const f = boot();
  const departed = stay('departed-elsewhere', 'checked_in', '2026-08-01', '2026-08-03');
  const present = stay('still-here', 'checked_in', '2026-09-01', '2026-09-12');
  f.setDoc([departed, present]);
  f.reply(response([departed, present]), response([departed, present]), response([present]));
  await f.api.cuFetchStaysForWindow('2026-08-01', '2026-09-12');
  await f.api.cuFetchInHouseStays();
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' })), ['departed-elsewhere', 'still-here']);
  await f.api.cuFetchInHouseStays();
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' })), ['still-here']);
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'attention' })), []);
  f.reply(response([]));
  await f.api.cuFetchInHouseStays();
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' })), [], 'an empty successful snapshot is authoritative too');
  f.assertNetwork();
});

test('failed and malformed reads keep known records and show an explicit unverified warning', async () => {
  for (const reader of ['cuFetchStaysForWindow', 'cuFetchInHouseStays']) {
    for (const bad of [{ ok: false }, { ok: true, json: async () => ({ stays: null }) }]) {
      const f = boot();
      f.api.cuStayCache().set('known', stay('known', 'checked_in'));
      f.reply(bad);
      await f.api[reader](TODAY, TODAY);
      const html = journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' });
      assert.deepEqual(rowIds(html), ['known']);
      assert.match(html, /role="status"/);
      f.assertNetwork();
    }
  }
});

test('a capped in-house response warns without treating omitted guests as departed', async () => {
  const f = boot();
  f.setDoc([stay('outside-page', 'checked_in')]);
  const rows = Array.from({ length: 1000 }, (_, i) => stay('page-' + i, 'checked_in'));
  f.reply(response(rows));
  await f.api.cuFetchInHouseStays();
  const html = journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' });
  assert.ok(rowIds(html).includes('outside-page'));
  assert.match(html, /role="status"/);
  f.assertNetwork();
});

test('editor-generated clientRef survives an ambiguous submit retry and blocks concurrent double submission', async () => {
  const f = boot(), form = formFixture(), pending = deferred();
  f.forms.push(form);
  f.handlers['hx-stay-new']();
  assert.ok(form.__hxClientRef, 'the actual editor generates the reference');
  assert.equal(typeof form.events.submit, 'function');
  f.reply(pending.promise);
  const first = f.api.cuSubmitStay(form, null, f.modals[0]);
  assert.equal(form.submit.disabled, true);
  await f.api.cuSubmitStay(form, null, f.modals[0]);
  assert.equal(f.requests.length, 1);
  pending.reject(new Error('Synthetic lost response after possible server commit'));
  await first;
  assert.equal(form.submit.disabled, false);
  assert.ok(form.error.textContent);
  const saved = stay('saved-on-retry');
  f.reply({ ok: true, json: async () => ({ booking: saved }) });
  await f.api.cuSubmitStay(form, null, f.modals[0]);
  const payloads = f.requests.map((r) => JSON.parse(r.options.body));
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].clientRef, form.__hxClientRef);
  assert.deepEqual(payloads[1], payloads[0]);
  assert.deepEqual(ids(f.getDoc().bookings), ['saved-on-retry']);
  assert.equal(f.modals[0].closed, 1);
  assert.equal(form.submit.disabled, false);
  f.assertNetwork();
});

test('an editor cannot submit to a newly active tenant and a late save cannot alter its document', async () => {
  const f = boot(), form = formFixture(), pending = deferred();
  f.forms.push(form);
  f.handlers['hx-stay-new']();
  f.switchTenant('journal-beta');
  await f.api.cuSubmitStay(form, null, f.modals[0]);
  assert.equal(f.requests.length, 0);
  assert.ok(form.error.textContent);
  f.switchTenant('journal-alpha');
  f.reply(pending.promise);
  const work = f.api.cuSubmitStay(form, null, f.modals[0]);
  f.switchTenant('journal-beta');
  f.setDoc([stay('beta-only')]);
  pending.resolve({ ok: true, json: async () => ({ booking: stay('alpha-save') }) });
  await work;
  assert.deepEqual(ids(f.getDoc().bookings), ['beta-only']);
  assert.deepEqual(ids(f.api.cuAllStays().values()), ['beta-only']);
  f.switchTenant('journal-alpha');
  assert.ok(f.api.cuAllStays().has('alpha-save'));
  f.assertNetwork();
});

test('secondary styling: daily controls have responsive layout and visible keyboard focus', () => {
  assert.match(styles, /\.hx-daily-controls\b/);
  assert.match(styles, /\.hx-daily[^{}]*:focus(?:-visible)?[^{}]*\{[^}]+(?:outline|box-shadow|border-color)\s*:/);
  assert.match(styles, /@media[^{}]*(?:max-width|width\s*<=)[\s\S]*?\.hx-daily(?:-controls|-row)\b/);
});

test('a late older in-house snapshot cannot resurrect a departure after a newer complete snapshot', async () => {
  const f = boot(), older = deferred(), newer = deferred();
  const row = stay('departed-between-reads', 'checked_in');
  f.setDoc([row]);
  f.reply(older.promise, newer.promise);
  const first = f.api.cuFetchInHouseStays();
  f.tick();
  const second = f.api.cuFetchInHouseStays();
  newer.resolve(response([]));
  await second;
  older.resolve(response([row]));
  await first;
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' })), []);
  f.assertNetwork();
});

test('a check-in recorded after the in-house read starts survives that snapshot omission', async () => {
  const f = boot(), pending = deferred();
  f.reply(pending.promise);
  const work = f.api.cuFetchInHouseStays();
  f.setDoc([stay('just-arrived', 'checked_in', TODAY, undefined, { updatedAt: f.tick() })]);
  pending.resolve(response([]));
  await work;
  assert.deepEqual(rowIds(journal(f, Array.from(f.api.cuAllStays().values()), { view: 'inhouse' })), ['just-arrived']);
  f.assertNetwork();
});

function folioFixture({ paid = false } = {}) {
  const f = boot();
  const st = f.api.cuState();
  Object.assign(st.rooms[1], { status: 'occ', hk: 'clean', guest: 'Synthetic Folio Guest', updatedAt: 100 });
  st.folios[1] = {
    room: 1, guest: 'Synthetic Folio Guest', src: 'direct', pax: 1, nights: 1, updatedAt: 100,
    lines: [{ label: 'Nuit déjà réglée', amt: 600, src: 'room', paid: true }, { label: 'Taxe de séjour', amt: 25, src: 'taxe', paid }],
  };
  return f;
}

for (const result of [{ ok: false }, undefined, false, {}, { ok: 'true' }]) {
  test(`checkout preserves the complete room and folio when postSale returns ${JSON.stringify(result)}`, () => {
    const f = folioFixture(), sales = [];
    f.window.KiwiLive = { isOn: () => true, postSale: (sale) => { sales.push(sale); return result; } };
    const before = clone(f.window.KiwiHotelRooms.current()), storage = Array.from(f.data);
    f.handlers['hx-checkout-pay'](null, '1');
    assert.equal(sales.length, 1);
    assert.equal(sales[0].amount, 25, 'only the unpaid balance is submitted');
    assert.deepEqual(clone(f.window.KiwiHotelRooms.current()), before);
    assert.deepEqual(Array.from(f.data), storage, 'no rejected checkout state is persisted');
  });
}

test('zero-balance checkout persists a closure through hydration and both stale merge directions', () => {
  const f = folioFixture({ paid: true });
  const stale = clone(f.window.KiwiHotelRooms.current());
  let sales = 0;
  f.window.KiwiLive = { isOn: () => true, postSale() { sales++; return { ok: false }; } };
  f.handlers['hx-checkout-pay'](null, '1');
  assert.equal(sales, 0, 'zero balance does not create another sale');
  const closed = clone(f.window.KiwiHotelRooms.current());
  const room = closed.rooms.find((r) => r.n === 1), folio = closed.folios.find((r) => r.room === 1);
  assert.equal(room.status, 'sale');
  assert.equal(room.hk, 'dirty');
  assert.equal(room.guest, null);
  assert.ok(folio.closedAt > stale.folios[0].updatedAt);
  assert.equal(folio.settlementAmount, 0);
  assert.deepEqual(folio.lines, stale.folios[0].lines);
  const persisted = JSON.parse(f.data.get('kiwi:hotel-rooms:v2:scoped:journal-alpha'));
  assert.ok(persisted.folios.find((x) => x.room === 1).closedAt);
  for (const doc of [persisted, f.api.cuMerge(closed, stale), f.api.cuMerge(stale, closed)]) {
    const hydrated = f.api.cuHydrate(doc);
    assert.equal(hydrated.folios[1], undefined, 'closed folio never reappears in the open ledger');
    assert.equal(hydrated.rooms[1].status, 'sale');
    const roundTrip = f.api.cuDocument(hydrated);
    assert.equal(roundTrip.folios.find((x) => x.room === 1).closedAt, folio.closedAt);
    assert.deepEqual(clone(roundTrip.folios.find((x) => x.room === 1).lines), stale.folios[0].lines);
  }
  f.handlers['hx-checkout-pay'](null, '1');
  assert.equal(sales, 0);
  assert.deepEqual(clone(f.window.KiwiHotelRooms.current()), closed, 'repeated closure is a no-op');
});

test('accepted checkout queues only the outstanding balance and closes once', () => {
  const f = folioFixture(), sales = [];
  f.window.KiwiLive = { isOn: () => true, postSale: (sale) => { sales.push(sale); return { ok: true }; } };
  f.handlers['hx-checkout-pay'](null, '1');
  f.handlers['hx-checkout-pay'](null, '1');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].amount, 25);
  const folio = f.window.KiwiHotelRooms.current().folios.find((x) => x.room === 1);
  assert.equal(folio.settlementAmount, 25);
  assert.equal(folio.settlementState, 'queued');
  assert.ok(folio.closedAt);
});

test('rejected walk-in leaves room availability, folios and sold count unchanged', () => {
  for (const result of [{ ok: false }, undefined]) {
    const f = boot();
    f.api.cuState().roomTypes['type:chambre'].rate = 600;
    f.window.KiwiLive = { isOn: () => true, postSale: () => result };
    const before = clone(f.window.KiwiHotelRooms.current()), storage = Array.from(f.data);
    f.handlers['hx-walkin-room'](null, '1');
    assert.deepEqual(clone(f.window.KiwiHotelRooms.current()), before);
    assert.deepEqual(Array.from(f.data), storage);
  }
});

test('real hotel charge labels use the Casablanca clock even when the demo clock exists', () => {
  const f = boot();
  f.window.KiwiDemoClock = { getSimState: () => ({ simHourLabel: '03h', simMinute: 7 }) };
  const expected = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(TODAY + 'T13:24:00Z'));
  assert.equal(f.api.nowLabel(), expected);
});

test('guest identity, birth date and accompanying minors survive editor submission', async () => {
  const f = boot(), form = formFixture();
  const guest = { id: 'synthetic-guest-1', name: 'Synthetic Guest', sex: 'F', nationality: 'MA', birthDate: '1990-02-12', minorsUnder18: 2, residenceCountry: 'MA', idDocType: 'passeport', idDocNumber: 'TEST-ONLY-001' };
  const booking = stay('guest-fields', 'confirmed', TODAY, undefined, { guests: [guest] });
  f.setDoc([booking]);
  f.forms.push(form);
  f.handlers['hx-stay-edit'](null, booking.id);
  const html = f.modals[0].options.body;
  assert.match(html, /data-hx-guest-id="synthetic-guest-1"/);
  assert.match(html, /data-hx-guest-birth[^>]*value="12\/02\/1990"/);
  assert.match(html, /data-hx-guest-minors[^>]*value="2"/);
  const fields = { name: guest.name, sex: guest.sex, nationality: guest.nationality, birth: guest.birthDate, minors: '2', residence: guest.residenceCountry, 'id-type': guest.idDocType, 'id-num': guest.idDocNumber };
  form.querySelectorAll = () => [{
    getAttribute: (key) => key === 'data-hx-guest-id' ? guest.id : null,
    querySelector: (selector) => ({ value: fields[selector.replace('[data-hx-guest-', '').replace(']', '')] }),
  }];
  f.reply({ ok: true, json: async () => ({ booking }) });
  await f.api.cuSubmitStay(form, booking, f.modals[0]);
  assert.deepEqual(JSON.parse(f.requests[0].options.body).guests, [guest]);
  f.assertNetwork();
});

// Opt-in, synthetic visual fixture only. The browser receives production journal
// markup and inline styles, with no production script, credentials or network API.
if (process.argv.includes('--preview')) {
  const f = boot();
  const names = [
    'Élodie de Saint-Germain et Alexandre Montfort, famille de démonstration',
    'ليلى وعبد الرحمن، عائلة تجريبية للاختبار فقط',
    'SyntheticGuestWithAnUnbrokenVeryLongNameForNarrowScreenOverflowInspection',
    'Maya & Noé, invités fictifs',
  ];
  const rows = Array.from({ length: 20 }, (_, i) => stay('preview-' + (i + 1), i % 5 === 0 ? 'checked_in' : 'confirmed', TODAY, '2026-09-12', {
    resourceId: i % 7 === 0 ? '' : 'room:' + (i % 2 + 1),
    customer: { name: names[i % names.length] + ' · ' + (i + 1) },
    code: 'DEMO-2026-' + String(i + 1).padStart(4, '0'),
    note: i % 2 ? 'ملاحظة تجريبية طويلة: الوصول في المساء، غرفة هادئة وسرير إضافي للأطفال، لا توجد بيانات ضيوف حقيقية.' : 'Note fictive de réception : arrivée prévue en soirée, chambre calme souhaitée, deux bagages à conserver et confirmation du petit-déjeuner pour toute la famille.',
    hotel: { channel: ['direct', 'booking', 'airbnb', 'expedia'][i % 4], externalRef: 'SYNTHETIC-LONG-REFERENCE-' + (i + 1), roomTypeName: 'Chambre familiale avec terrasse et vue sur le jardin' },
  }));
  const markup = journal(f, rows);
  assert.equal(rowIds(markup).length, 20);
  const tokens = fs.readFileSync(new URL('../assets/tokens.css', import.meta.url), 'utf8');
  const output = '/tmp/kiwi-chellah-reception-preview.html';
  fs.writeFileSync(output, `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Réception · aperçu synthétique</title>
<style>${tokens}</style><style>${styles}</style>
<style>body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans,Arial,sans-serif)}main{max-width:1180px;margin:auto;padding:16px}body>p{margin:16px;font-size:13px}</style>
</head><body><p>Aperçu statique · 20 dossiers fictifs · aucune donnée client réelle. Les boutons ne déclenchent aucune opération.</p>
<main class="hx-page">${markup}</main></body></html>`, 'utf8');
  console.log('Synthetic reception preview: ' + output);
}
