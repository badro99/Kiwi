import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const dateSource = fs.readFileSync(new URL('../assets/dateRange.js', import.meta.url), 'utf8');
const tenant = 'santos-store', ts = Date.now();
const sale = (cursor, amount = 10) => ({ cursor, amount, ts });
const full = () => Array.from({ length: 50 }, (_, i) => sale(i + 1));
const page = (sales = [], cursor = sales.at(-1)?.cursor || 0) => ({ sales, cursor, merchant: tenant, voided: [] });
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(pages, { identity = { operator: true }, store = true, brokenStore = false, cached = [], delayedVenue = false, realStore = false } = {}) {
  const timers = new Map(), requests = [], events = [], ids = new Map(), selectors = new Map();
  let timerId = 0, reloads = 0, posts = 0, outboxCalls = 0;
  let venueId = delayedVenue ? null : 'custom-santos', venueSlug = delayedVenue ? '' : tenant;
  const venueSubscribers = [];
  function target() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(x => x !== fn)); },
      dispatchEvent(e) { events.push(e); (listeners.get(e.type) || []).slice().forEach(fn => fn(e)); },
    };
  }
  function node() {
    return { children: [], attrs: {}, style: {}, textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      appendChild(child) { this.children.push(child); if (child.id) ids.set(child.id, child); },
    };
  }
  const queued = JSON.stringify([{ id: 'old-operator-outbox', merchant: tenant, amount: 99, ts }]);
  const storage = new Map([['kiwiLive', '1'], ['kiwiSaleQueue', queued]]);
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
  const ledger = cached.slice(), refunds = [];
  function salesStore(rows) {
    return {
      list: () => rows.slice(), add: (_vid, s) => { if (!brokenStore) rows.push({ ...s }); },
      retainCursors: (_vid, cursors) => {
        if (brokenStore) return;
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].cursor && !cursors.includes(rows[i].cursor)) rows.splice(i, 1);
      },
    };
  }
  const window = Object.assign(target(), {
    localStorage, KiwiEnv: { isReal: () => true }, KiwiMe: { business: 'Santos Store' },
    KiwiIdentity: { ready: identity instanceof Error ? Promise.reject(identity) : Promise.resolve(identity) },
    KiwiVenue: { getVenue: () => venueId, getCurrentVenueData: () => venueId ? { slug: venueSlug } : null,
      isCustom: () => true, subscribe(fn) { venueSubscribers.push(fn); } },
    KiwiRefunds: salesStore(refunds),
    KiwiOffline: {
      available: () => true,
      subscribe() { outboxCalls++; },
      migrateLegacy() { outboxCalls++; return Promise.resolve(); },
      stats() { outboxCalls++; return Promise.resolve({ total: 1 }); },
    },
  });
  if (store) window.KiwiSales = salesStore(ledger);
  const document = Object.assign(target(), {
    hidden: false, readyState: 'loading', body: node(), createElement: node,
    createTextNode: text => ({ textContent: text }), getElementById: id => ids.get(id),
    querySelector: selector => selectors.get(selector) || null,
    querySelectorAll: selector => selector.split(',').map(s => selectors.get(s.trim())).filter(Boolean),
  });
  const context = vm.createContext({
    window, document, localStorage, URLSearchParams, console,
    location: { search: '?op=1&privacy=1&merchant=' + tenant, hostname: 'kiwi-os.com', reload() { reloads++; } },
    getComputedStyle: () => ({ paddingTop: '0' }),
    CustomEvent: function (type, init) { this.type = type; this.detail = init?.detail; },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (init?.method && init.method !== 'GET') { posts++; throw new Error('unexpected write'); }
      const response = pages[requests.length - 1];
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response();
      if (!response) throw new Error('unexpected poll');
      return { ok: true, json: async () => response };
    },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source, context, { filename: 'assets/live-link.js' });
  if (realStore) {
    // Execute the actual persistent store, including any retention/list limits.
    const venues = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');
    const start = venues.indexOf('  const salesSubs = new Set();');
    const end = venues.indexOf('  function salesTotals(', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext("const TRANSIENT_IDS = []; const currentVenue = 'custom-santos'; const slugOf = () => 'santos-store';\n" +
      venues.slice(start, end) + '\nwindow.KiwiSales = { add: salesAdd, list: salesList, retainCursors: salesRetainCursors };' +
      '\nwindow.KiwiRefunds = { add: refundsAdd, list: refundsList, retainCursors: refundsRetainCursors };', context);
  }
  return {
    window, document, context, timers, requests, events, ids, selectors, node, ledger,
    state: () => window.KiwiLive.status().snapshot,
    boot: async () => { document.dispatchEvent({ type: 'DOMContentLoaded' }); await settle(); },
    next: async () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); await settle(); },
    resolveVenue(slug = tenant) { venueId = 'custom-santos'; venueSlug = slug; venueSubscribers.forEach(fn => fn()); },
    assertReadOnly() {
      assert.equal(posts, 0, 'snapshot never POSTs');
      assert.ok(requests.every(r => r.url.startsWith('/api/feed?merchant=')), 'only the read feed is requested');
      assert.equal(storage.get('kiwiSaleQueue'), queued, 'outbox untouched');
      assert.equal(outboxCalls, 0, 'operator never initializes or polls IndexedDB outbox');
    },
    get reloads() { return reloads; },
  };
}

// Execute the actual renderers with a small DOM: verify visible text and
// accessibility before initialization and after failures, without a CSS mock.
function renderers(h) {
  const select = (from, to) => {
    const start = dateSource.indexOf(from), end = dateSource.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start, 'renderer extraction: ' + from);
    return dateSource.slice(start, end);
  };
  vm.runInContext([
    select('  function operatorLedgerPending()', '  function renderHero()'),
    select('  function renderHero()', '  function renderHeroAi()'),
    select('  function renderGoal()', '  function intensityClass('),
    select('  function renderKpiBand()', '  function openKpiCustomizer('),
    select('  function renderRevChart()', '  function renderMix()'),
  ].join('\n'), h.context);
  for (const key of ['[data-hero-amount]', '[data-hero-label]', '.hero-breakdown', '.hero-left-today .greet',
    '[data-kpi-band]', '[data-goal-label]', '[data-goal-pct]', '[data-goal-fill]', '[data-rev-svg]',
    '[data-rev-legend]', '[data-rev-hero-val]', '[data-rev-hero-delta]', '[data-rev-sub]']) {
    const el = h.node(); el.textContent = '0 MAD'; h.selectors.set(key, el);
  }
  h.context.getLang = () => 'fr';
  return {
    render: () => vm.runInContext('renderHero(); renderGoal(); renderKpiBand(); renderRevChart();', h.context),
    pending: () => vm.runInContext('operatorLedgerPending()', h.context),
  };
}

let cases = 0;
async function terminalFailure(label, pages, expected, error) {
  const h = harness(pages), r = renderers(h);
  r.render();
  assert.equal(h.selectors.get('[data-hero-amount]').textContent, '…', label + ': no initial zero');
  await h.boot();
  while (h.timers.size) await h.next();
  assert.equal(h.state().phase, expected, label);
  assert.equal(h.state().error, error, label);
  assert.equal(h.window.KiwiLive.status().backfillComplete, false, label);
  assert.equal(h.state().completedAt, 0);
  r.render();
  assert.equal(h.selectors.get('[data-hero-amount]').textContent, '…');
  assert.match(h.selectors.get('[data-hero-amount]').attrs['aria-label'], /indisponibles/);
  assert.match(h.selectors.get('[data-kpi-band]').textContent, /indisponibles/);
  assert.equal(h.selectors.get('[data-rev-svg]').textContent, '');
  assert.equal(h.selectors.get('[data-goal-pct]').textContent, '');
  const banner = h.ids.get('kiwi-op-snapshot');
  assert.equal(banner.attrs.role, 'status');
  assert.equal(banner.attrs['aria-live'], 'polite');
  assert.equal(banner.attrs['aria-busy'], 'false');
  assert.equal(banner.attrs['data-state'], expected);
  assert.match(banner.textContent, /chiffres indisponibles/);
  const count = h.requests.length;
  for (const type of ['focus', 'pageshow', 'online', 'storage']) h.window.dispatchEvent({ type });
  h.document.dispatchEvent({ type: 'visibilitychange' }); await settle();
  assert.equal(h.requests.length, count, 'failure does not resume polling on wake');
  assert.equal(h.timers.size, 0);
  const refresh = h.ids.get('kiwi-op-banner').children.find(c => c.type === 'button');
  assert.equal(refresh.attrs['aria-label'], 'Actualiser les données du client');
  refresh.onclick(); assert.equal(h.reloads, 1);
  h.assertReadOnly(); cases++;
}

await terminalFailure('network', [new Error('offline')], 'error', 'network-json');
await terminalFailure('HTTP', [() => ({ ok: false, status: 500 })], 'error', 'http');
for (const status of [401, 403]) await terminalFailure('auth ' + status, [() => ({ ok: false, status })], 'error', 'auth');
await terminalFailure('HTML/login JSON parse', [() => ({ ok: true, json: async () => { throw new SyntaxError('HTML'); } })], 'error', 'network-json');
for (const data of [null, {}, { ...page(), sales: {} }, { ...page(), error: 'db' }, { sales: [], cursor: 0 }, { ...page(), voided: [null] }]) {
  await terminalFailure('malformed response', [data === null ? () => ({ ok: true, json: async () => null }) : data], 'error', 'invalid-feed');
}
for (const merchant of ['', 'other-store', undefined]) await terminalFailure('wrong scope', [{ ...page(), merchant }], 'error', 'scope');
for (const bad of [null, { ...sale(1), amount: '10' }, { ...sale(1), amount: NaN }, { ...sale(1), ts: null }, { ...sale(1), cursor: 0 }]) {
  await terminalFailure('invalid sale', [page([bad], 1)], 'error', 'invalid-sales');
}
await terminalFailure('failed second page', [page(full()), new Error('offline')], 'incomplete', 'network-json');
await terminalFailure('stuck full page cursor', [page(full(), 0)], 'error', 'cursor');
await terminalFailure('repeated full page', [page(full()), page(full())], 'incomplete', 'invalid-sales');
await terminalFailure('malformed final page', [page(full()), {}], 'incomplete', 'invalid-feed');

for (const pages of [[page()], [page([sale(1)])], [page(full()), page([sale(51)])], [page(full()), page([], 50)],
  [page([sale(1, 100), sale(2, -20)])]]) {
  const h = harness(pages), r = renderers(h); await h.boot();
  if (h.timers.size) {
    assert.equal(h.state().phase, 'loading'); assert.equal(h.state().rows, 50); assert.equal(h.state().completedAt, 0);
    assert.equal(h.ids.get('kiwi-op-snapshot').attrs['aria-busy'], 'true');
    assert.equal(r.pending(), true); assert.equal(h.ledger.length, 0, 'partial page is not bridged');
  }
  while (h.timers.size) {
    assert.equal(h.timers.values().next().value.ms, 0, 'only immediate pagination'); await h.next();
  }
  assert.equal(h.state().phase, 'complete'); assert.equal(h.state().pages, pages.length);
  assert.equal(h.state().rows, pages.reduce((sum, p) => sum + p.sales.length, 0));
  assert.equal(h.state().venue, 'custom-santos'); assert.ok(h.state().completedAt >= h.state().startedAt);
  assert.equal(r.pending(), false, 'verified ledger allows numerical KPIs, including zero');
  if (h.state().rows === 0) {
    // Exercise the real hero renderer after verification: an authoritative
    // empty ledger must still paint a numeric zero, never an error/placeholder.
    Object.assign(h.context, {
      effRange: () => 'aujourdhui', currentRange: 'aujourdhui', heroDataByVenue: {},
      vData: () => ({}), isLiveDemo: () => false, ownData: () => true,
      realSalesTotals: () => ({ revenue: h.ledger.reduce((sum, s) => sum + s.amount, 0) }),
      realDeltaPct: () => null, HERO_LABEL: { fr: { aujourdhui: 'Encaissé aujourd’hui' } },
      parseAmountFromEl: () => 0, fitHeroAmount() {}, liveTickInProgress: false,
      fmtHeroAmount: n => String(n), animateNumber: (el, _from, to) => { el.textContent = String(to); },
    });
    h.selectors.delete('.hero-breakdown');
    vm.runInContext('renderHero()', h.context);
    assert.equal(h.selectors.get('[data-hero-amount]').textContent, '0', 'verified server zero stays zero');
    assert.equal(h.selectors.get('[data-hero-amount]').attrs['aria-label'], undefined);
  }
  assert.equal(h.window.KiwiLive.status().backfillComplete, true); assert.equal(h.requests.length, pages.length);
  assert.match(h.ids.get('kiwi-op-snapshot').textContent, /santos-store.*historique autorisé.*Instantané complet.*reçu le.*hors direct/);
  assert.ok(h.requests.at(-1).url.endsWith('since=' + (pages.length > 1 ? 50 : 0)));
  const copy = h.state(); copy.phase = 'error'; assert.equal(h.state().phase, 'complete', 'status is a copy');
  h.window.KiwiVenue.getVenue = () => 'other-venue'; assert.equal(r.pending(), true, 'different venue stays guarded');
  h.assertReadOnly(); cases++;
}
for (const options of [{ brokenStore: true }, { cached: [sale(1, 99)] }, { cached: [{ amount: 7, ts }] }]) {
  const h = harness([page([sale(1)])], options); await h.boot();
  assert.equal(h.state().phase, 'incomplete', 'failed or inconsistent local import is not verified');
  assert.equal(h.state().error, 'ledger'); assert.equal(h.window.KiwiLive.status().backfillComplete, true, 'feed is fetched but local ledger is unverified');
  h.assertReadOnly(); cases++;
}
for (const identity of [{ operator: false }, new Error('me unavailable')]) {
  const h = harness([], { identity }); await h.boot();
  assert.equal(h.state().error, 'identity'); assert.equal(h.requests.length, 0, 'unconfirmed identity cannot start feed');
  assert.equal(h.ids.has('kiwi-op-banner'), false, 'URL alone cannot grant operator UI');
  assert.equal(renderers(h).pending(), true); h.assertReadOnly(); cases++;
}
const missing = harness([], { store: false }); await missing.boot();
while (missing.timers.size) await missing.next();
assert.equal(missing.state().error, 'ledger', 'missing sales store does not remain silently loading');
assert.equal(missing.requests.length, 0); missing.assertReadOnly(); cases++;

for (const sales of [[], [sale(1)]]) {
  const h = harness([page(sales)], { delayedVenue: true }), r = renderers(h);
  await h.boot();
  assert.equal(h.state().phase, 'incomplete'); assert.equal(h.state().error, 'venue');
  assert.equal(r.pending(), true); assert.equal(h.ledger.length, 0);
  const fetchedAt = h.state().lastPageAt;
  h.resolveVenue('other-store');
  assert.equal(h.state().error, 'venue', 'wrong venue cannot complete snapshot');
  assert.equal(h.ledger.length, 0, 'no import into wrong tenant');
  h.resolveVenue();
  assert.equal(h.state().phase, 'complete', 'venue subscription finishes cached snapshot');
  assert.equal(r.pending(), false); assert.equal(h.state().lastPageAt, fetchedAt, 'freshness remains the fetch time');
  assert.equal(h.ledger.length, sales.length); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.resolveVenue(); assert.equal(h.ledger.length, sales.length, 'repeat subscription is idempotent');
  h.assertReadOnly(); cases++;
}
const many = Array.from({ length: 1051 }, (_, i) => sale(i + 1, i === 1050 ? -20 : 10));
const manyPages = [];
for (let i = 0; i < many.length; i += 50) manyPages.push(page(many.slice(i, i + 50)));
const retained = harness(manyPages, { realStore: true }); await retained.boot();
while (retained.timers.size) await retained.next();
assert.equal(retained.state().phase, 'complete', 'actual store retains and verifies full history');
assert.equal(retained.window.KiwiSales.list('custom-santos').length, 1050);
assert.equal(retained.window.KiwiRefunds.list('custom-santos').length, 1);
retained.assertReadOnly(); cases++;

console.log(`operator-snapshot-test: ${cases} behavioral scenarios passed`);
