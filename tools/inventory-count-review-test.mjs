#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · inventory count review test — approbation vraie et exactement une fois.
 *
 * Défaut corrigé : les erreurs fetch étaient avalées, le statut local et le
 * toast de succès appliqués quand même, puis moveStock() repostait
 * l'ajustement avec des ids frais APRES l'écriture serveur déterministe.
 * Règles désormais exécutées ici, jamais réimplémentées : le VRAI reviewCount
 * et son VRAI noyau (send/plan/garde/err, extraits de assets/stock.js)
 * tournent en vm. Seul l'environnement est feint : faux DOM ciblé, fetch
 * scripté, registre factice. Le faux ne décide jamais à la place du code.
 *
 *   node tools/inventory-count-review-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 14;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}
function jseq(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

/* Les fonctions module de stock.js se ferment par `\n  }` à l'indent 2. */
function extractFn(name) {
  const m = src.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'extractable: ' + name);
  return m[0];
}
const CORE_SRC = [
  'stReviewBusyTake', 'stReviewBusyRelease',
  'stReviewCountSend', 'stReviewCountErr', 'stReviewCountPlan',
  'reviewCount',
].map(extractFn).join('\n');

function fakeBtn() {
  const attrs = {};
  return {
    dataset: {},
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; },
    has: (k) => k in attrs,
  };
}
/* Faux scope DOM : seules les requêtes que reviewCount émet existent. */
function fakeScope() {
  const el = {
    _approve: fakeBtn(),
    _reject: fakeBtn(),
    _attrs: {},
    setAttribute(k, v) { el._attrs[k] = String(v); },
    removeAttribute(k) { delete el._attrs[k]; },
    querySelector(sel) {
      if (sel === '#st-cnt-approve-btn') return el._approve;
      if (sel === '#st-cnt-reject-btn') return el._reject;
      return null;
    },
  };
  return el;
}
/* Monde feint. `over` règle le scénario : counts, real, fetch, syncResult. */
function makeWorld(over = {}) {
  const spies = { toasts: [], close: 0, render: 0, saveOverlay: 0, moveStock: [], sync: 0, catalogSync: 0 };
  const state = {
    counts: over.counts || [{ id: 'c1', status: 'submitted', storeId: '', lines: [] }],
    real: !!over.real,
    scope: over.scope || null,
    fetchImpl: over.fetch || (async () => { throw new Error('fetch not scripted'); }),
  };
  const win = {
    Kiwi: { toast: (msg, o) => { spies.toasts.push({ msg, type: o && o.type }); } },
    KiwiBoutiqueCatalog: { sync: () => { spies.catalogSync++; } },
    KiwiInventory: { sync: async () => { spies.sync++; return over.syncResult !== false; } },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
    getAllCounts: () => state.counts,
    topBackdrop: () => state.scope,
    stShowReal: () => state.real,
    t: (k) => k,
    moveStock: (...a) => { spies.moveStock.push(a.map((x) => (x && typeof x === 'object' ? { ...x } : x))); return { id: 'm-local' }; },
    stockLocationId: () => 'principal',
    stSaveOverlay: () => { spies.saveOverlay++; },
    closeTopModal: () => { spies.close++; },
    render: () => { spies.render++; },
    document: { querySelector: () => null },
    stPageActive: over.pageActive !== false,
    fetch: (...a) => state.fetchImpl(...a),
  });
  vm.runInContext('let stReviewBusy = false;\n' + CORE_SRC + '\n;window.__rc = { reviewCount, stReviewBusyTake, stReviewBusyRelease, stReviewCountSend, stReviewCountErr, stReviewCountPlan };', ctx,
    { filename: 'stock-count-review-core.js' });
  return { ctx, spies, win, state };
}
function scriptedFetch(sequence) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const next = sequence.length > 1 ? sequence.shift() : sequence[0];
    if (next instanceof Error) throw next;
    return { ok: !!next.ok, status: next.status || 200, json: async () => (next.data === undefined ? null : next.data) };
  };
  fn.calls = calls;
  return fn;
}
function approvedCount(lines) {
  return [{
    id: 'c1', status: 'submitted', storeId: 's1',
    lines: lines || [{ itemId: 'flour', diff: 5, unitCost: 150, explanation: 'ok', locationId: 'principal' }],
  }];
}

await check('busy guard takes once, exposes disabled + aria-busy, releases', async () => {
  const w = makeWorld({});
  const btns = [fakeBtn(), fakeBtn()];
  const rootEl = fakeScope();
  w.ctx.BTNS = btns;
  w.ctx.ROOT = rootEl;
  assert.equal(await vm.runInContext('window.__rc.stReviewBusyTake(BTNS, ROOT)', w.ctx), true);
  assert.ok(btns.every((b) => b.has('disabled')), 'both buttons disabled');
  assert.equal(rootEl._attrs['aria-busy'], 'true');
  assert.equal(await vm.runInContext('window.__rc.stReviewBusyTake(BTNS, ROOT)', w.ctx), false);
  await vm.runInContext('window.__rc.stReviewBusyRelease(BTNS, ROOT)', w.ctx);
  assert.ok(btns.every((b) => !b.has('disabled')), 'released');
  assert.ok(!('aria-busy' in rootEl._attrs), 'aria-busy cleared');
});

await check('send posts the review shape and reports raw outcomes', async () => {
  const w = makeWorld({});
  const f = scriptedFetch([{ ok: true, status: 200, data: { success: true } }]);
  w.ctx.FETCH = f;
  w.ctx.ARGS = { countId: 'c1', decision: 'approved', note: 'ok' };
  const out = await vm.runInContext(
    'window.__rc.stReviewCountSend({ countId: ARGS.countId, decision: ARGS.decision, note: ARGS.note, fetchFn: FETCH })', w.ctx);
  assert.equal(out.ok, true);
  assert.deepEqual(f.calls[0].body, { action: 'review', id: 'c1', decision: 'approved', reviewNote: 'ok', reviewerName: 'Propriétaire' });
  const net = await vm.runInContext(
    `window.__rc.stReviewCountSend({ countId: 'c1', decision: 'approved', note: '', fetchFn: async () => { throw new TypeError('down'); } }).then(
      () => 'no-throw', (e) => 'threw:' + e.constructor.name)`, w.ctx);
  assert.equal(net, 'threw:TypeError', 'network errors propagate to the shell, never swallowed here');
});

await check('plan matrix: real success pulls, demo overlays, failures touch nothing', async () => {
  const w = makeWorld({});
  const P = (d, r, s) => vm.runInContext(`window.__rc.stReviewCountPlan(${JSON.stringify(d)}, ${r}, ${JSON.stringify(s)})`, w.ctx);
  const jplan = (actual, expected, msg) => assert.deepEqual(
    { ok: actual.ok, setStatus: actual.setStatus, overlay: actual.overlay, close: actual.close, sync: actual.sync },
    expected, msg);
  jplan(await P('approved', true, { ok: true, status: 200, data: { success: true } }),
    { ok: true, setStatus: 'applied', overlay: false, close: true, sync: true }, 'real approve: sync, no overlay');
  jplan(await P('approved', true, { ok: true, status: 200, data: { success: true, count: { alreadyApplied: true } } }),
    { ok: true, setStatus: 'applied', overlay: false, close: true, sync: true }, 'alreadyApplied stays an idempotent success');
  jplan(await P('rejected', true, { ok: true, status: 200, data: { success: true } }),
    { ok: true, setStatus: 'rejected', overlay: false, close: true, sync: false }, 'real reject: status only');
  jplan(await P('approved', false, { ok: true, status: 200, data: { success: true } }),
    { ok: true, setStatus: 'applied', overlay: true, close: true, sync: false }, 'demo approve: overlay, no sync');
  jplan(await P('rejected', false, { ok: true, status: 200, data: { success: true } }),
    { ok: true, setStatus: 'rejected', overlay: false, close: true, sync: false }, 'demo reject posts nothing');
  jplan(await P('approved', true, { ok: false, status: 503, data: null }),
    { ok: false, setStatus: null, overlay: false, close: false, sync: false }, 'failure applies nothing');
});

await check('plan maps every failure to its safe key, never a raw detail', async () => {
  const w = makeWorld({});
  const E = (s) => vm.runInContext(`window.__rc.stReviewCountErr(${JSON.stringify(s)})`, w.ctx);
  assert.equal(await E({ ok: false, network: true }), 'mCountErrOffline');
  assert.equal(await E({ ok: false, status: 403, data: { error: 'forbidden' } }), 'mCountErrDenied');
  assert.equal(await E({ ok: false, status: 404, data: { error: 'not_found' } }), 'mCountErrGone');
  assert.equal(await E({ ok: false, status: 409, data: { error: 'catalog-conflict' } }), 'mCountErrConflict');
  assert.equal(await E({ ok: false, status: 503, data: null }), 'mCountErrGeneric');
  assert.equal(await E(null), 'mCountErrGeneric');
});

await check('real approve writes nothing locally and pulls once', async () => {
  const scope = fakeScope();
  const w = makeWorld({
    real: true, scope,
    counts: approvedCount(),
    fetch: scriptedFetch([{ ok: true, status: 200, data: { success: true } }]),
  });
  await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  assert.equal(w.spies.moveStock.length, 0, 'no second local movement after server approval');
  assert.equal(w.spies.sync, 1, 'authoritative pull exactly once');
  assert.equal(w.spies.close, 1, 'modal closed');
  assert.equal(w.spies.saveOverlay, 0, 'no overlay write on the real path');
  assert.deepEqual(w.spies.toasts, [{ msg: 'Inventaire validé · stock mis à jour', type: 'success' }]);
});

await check('double-click issues a single request and a single pull', async () => {
  const scope = fakeScope();
  let release;
  let fetchCalls = 0;
  const gate = new Promise((res) => { release = res; });
  const w = makeWorld({
    real: true, scope,
    counts: approvedCount(),
    fetch: async (url, opts) => { fetchCalls++; await gate; return { ok: true, status: 200, json: async () => ({ success: true }) }; },
  });
  const p1 = vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  const p2 = vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  await Promise.resolve();
  await Promise.resolve();
  release();
  await p1;
  await p2;
  assert.equal(fetchCalls, 1, 'one request for two taps');
  assert.equal(w.spies.moveStock.length, 0, 'no local movement at all');
  assert.equal(w.spies.sync, 1, 'one pull for two taps');
  assert.equal(w.spies.close, 1, 'one close for two taps');
});

await check('delayed-then-decided retry cannot re-apply: decided state short-circuits', async () => {
  const scope = fakeScope();
  const w = makeWorld({
    real: true, scope,
    counts: approvedCount(),
    fetch: scriptedFetch([{ ok: true, status: 200, data: { success: true } }]),
  });
  await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  assert.equal(w.spies.sync, 1);
  await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  assert.equal(w.spies.sync, 1, 'second run short-circuits on applied status');
  assert.equal(w.spies.moveStock.length, 0);
});

await check('409, 503 and network rejection apply nothing and keep the modal open', async () => {
  for (const [name, seq] of [
    ['conflict-409', [{ ok: false, status: 409, data: { error: 'catalog-conflict' } }]],
    ['server-503', [{ ok: false, status: 503, data: null }]],
    ['network-down', [new TypeError('fetch failed')]],
  ]) {
    const scope = fakeScope();
    const w = makeWorld({ real: true, scope, counts: approvedCount(), fetch: scriptedFetch(seq) });
    await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
    assert.equal(w.spies.moveStock.length, 0, name + ': no movement');
    assert.equal(w.spies.sync, 0, name + ': no pull');
    assert.equal(w.spies.close, 0, name + ': modal stays open');
    assert.equal(w.spies.saveOverlay, 0, name + ': no overlay write');
    assert.equal(w.spies.toasts.length, 1, name + ': exactly one error toast');
    assert.equal(w.spies.toasts[0].type, 'error', name + ': error kind, not success');
    assert.equal(w.state.counts[0].status, 'submitted', name + ': local count untouched');
    assert.ok(!('reviewDecision' in w.state.counts[0]), name + ': no decision recorded');
  }
});

await check('failure leaves controls live and the count retryable', async () => {
  const scope = fakeScope();
  const w = makeWorld({ real: true, scope, counts: approvedCount(), fetch: scriptedFetch([{ ok: false, status: 503, data: null }]) });
  await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  assert.ok(!scope._approve.has('disabled') && !scope._reject.has('disabled'), 'buttons re-enabled');
  assert.ok(!('aria-busy' in scope._attrs), 'aria-busy cleared');
  assert.equal(w.state.counts[0].status, 'submitted', 'failed count stays retryable');
});

await check('demo approve keeps the historical overlay path and closes', async () => {
  const scope = fakeScope();
  const w = makeWorld({ real: false, scope, counts: approvedCount() });
  let fetched = false;
  w.ctx.__fetchImpl = async () => { fetched = true; throw new Error('demo must not call'); };
  await vm.runInContext(`window.__rc.reviewCount('c1', 'approved', '')`, w.ctx);
  assert.equal(fetched, false, 'demo never touches the network');
  assert.equal(w.spies.moveStock.length, 1, 'demo overlay movement preserved');
  assert.equal(w.spies.saveOverlay, 1, 'demo overlay persisted');
  assert.equal(w.spies.sync, 0, 'demo never pulls');
  assert.equal(w.spies.close, 1, 'demo closes');
  assert.deepEqual(w.spies.toasts, [{ msg: 'Inventaire validé · stock mis à jour', type: 'success' }]);
});

await check('demo reject posts nothing and still closes honestly', async () => {
  const scope = fakeScope();
  const w = makeWorld({ real: false, scope, counts: approvedCount() });
  await vm.runInContext(`window.__rc.reviewCount('c1', 'rejected', '')`, w.ctx);
  assert.equal(w.spies.moveStock.length, 0, 'rejected demo posts no movement');
  assert.equal(w.spies.close, 1);
  assert.deepEqual(w.spies.toasts, [{ msg: 'Inventaire refusé', type: 'info' }]);
});

await check('real reject marks without movements, sync or overlay', async () => {
  const scope = fakeScope();
  const w = makeWorld({
    real: true, scope,
    counts: approvedCount(),
    fetch: scriptedFetch([{ ok: true, status: 200, data: { success: true } }]),
  });
  await vm.runInContext(`window.__rc.reviewCount('c1', 'rejected', '')`, w.ctx);
  assert.equal(w.spies.moveStock.length, 0);
  assert.equal(w.spies.sync, 0);
  assert.equal(w.spies.saveOverlay, 0);
  assert.equal(w.spies.close, 1);
  assert.deepEqual(w.spies.toasts, [{ msg: 'Inventaire refusé', type: 'info' }]);
});

await check('wired handler claims the guard before any write and releases on failure', async () => {
  const body = src.slice(src.indexOf('async function reviewCount('));
  const takeAt = body.indexOf('stReviewBusyTake(');
  const fetchAt = body.indexOf('stReviewCountSend(');
  assert.ok(takeAt !== -1 && fetchAt !== -1 && takeAt < fetchAt, 'guard claimed before any network write');
  const releases = body.split('release()').length - 1;
  assert.ok(releases >= 3, 'release on decided-short-circuit, failure, success and crash paths (' + releases + ')');
  const busySrc = src.slice(src.indexOf('function stReviewBusyTake'), src.indexOf('async function stReviewCountSend'));
  assert.ok(busySrc.includes("setAttribute('disabled'") && busySrc.includes("setAttribute('aria-busy'"), 'busy helpers expose disabled + aria-busy');
  const overlayBlock = body.slice(body.indexOf('if (plan.overlay'));
  assert.ok(overlayBlock.indexOf('moveStock(') !== -1, 'overlay path still posts demo movements');
  assert.ok(body.indexOf('plan.sync') !== -1 && body.indexOf('KiwiInventory?.sync') !== -1, 'real success pulls instead of posting');
});

await check('i18n keys exist in FR + EN + AR', async () => {
  for (const k of ['mCountErrOffline', 'mCountErrDenied', 'mCountErrGone', 'mCountErrConflict', 'mCountErrGeneric']) {
    assert.equal((src.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' defined in FR, EN and AR');
  }
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('inventory-count-review-test: ' + checks + ' checks passed\n');
