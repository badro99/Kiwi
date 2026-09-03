#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake conflict test — l'état dédié du 409 posting-conflict.
 *
 * Quand une reprise relit des valeurs différentes, le prepare refuse AVANT
 * toute écriture. Le client ne doit pas retomber sur l'échec générique : il
 * montre ce qui diffère (sans hash ni empreinte), sans rien écrire, avec
 * pour seules issues fermer, revenir à la relecture, voir l'historique.
 * Cette suite exécute le VRAI code livré (comparateur + rendu + présentation
 * extraits de assets/stock.js, jamais réimplémentés) dans un contexte vm.
 *
 *   node tools/intake-conflict-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 6;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

function grab(re, what) {
  const m = stockSrc.match(re);
  assert.ok(m, 'extractable: ' + what);
  return m[0];
}
/* Dépendances réelles du rendu : dictionnaire, icônes, échappement, langue. */
const stockPrelude = [
  grab(/  const STOCK_MATERIAL_ICONS = \{[\s\S]*?\n  \};/, 'STOCK_MATERIAL_ICONS'),
  grab(/  const svg = [^\n]+\n/, 'svg'),
  grab(/  const esc = [^\n]+\n/, 'esc'),
  grab(/  const STR = \{[\s\S]*?\n  \};/, 'STR'),
  grab(/  const lang = [^\n]+\n/, 'lang'),
  grab(/  const t = \(k, \.\.\.args\) => \{[\s\S]*?\n  \};/, 't'),
].join('\n');
const CONFLICT_FNS = ['stIntakeMerchant', 'stIntakeFetchRecorded', 'stIntakeCompareConflict', 'stRenderIntakeConflict', 'stShowIntakeConflict', 'stRestoreIntakeReview'];
function extractStock(name) {
  const m = stockSrc.match(new RegExp('  (?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'stock helper extractable: ' + name);
  return m[0];
}
const conflictSrc = stockPrelude + '\nlet stConflictStash = null;\n' + CONFLICT_FNS.map(extractStock).join('\n');

function makeCtx({ lang: lg = 'fr', fetchImpl = null, toastCalls = null, addCalls = null } = {}) {
  const win = {
    KiwiI18n: { getLang: () => lg },
    Kiwi: {
      venue: () => 'demo-tenant',
      toast: (...a) => { if (toastCalls) toastCalls.push(a); },
    },
    KiwiInventory: { add: (m) => { if (addCalls) addCalls.push(m); throw new Error('must-not-add'); } },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
    fetch: fetchImpl || (async () => { throw new Error('no-fetch-expected'); }),
  });
  vm.runInContext(conflictSrc + '\n;window.__conflict = { ' + CONFLICT_FNS.join(',') + ', t };', ctx, { filename: 'stock-intake-conflict.js' });
  return { ctx, win };
}
/* Faux stage DOM minimal : enfants chaînés, innerHTML capturé, écouteurs. */
function fakeStage(names = ['review-a', 'review-b']) {
  const listeners = {};
  const nodes = names.map((name) => ({ name }));
  nodes.forEach((n, i) => { Object.defineProperty(n, 'nextSibling', { get: () => nodes[i + 1] || null, configurable: true }); });
  const children = [...nodes];
  return {
    _listeners: listeners,
    _children: children,
    _nodes: nodes,
    get firstChild() { return children[0] || null; },
    removeChild(n) { const i = children.indexOf(n); if (i >= 0) children.splice(i, 1); return n; },
    appendChild(n) { children.push(n); return n; },
    _html: '',
    set innerHTML(h) { this._html = String(h); },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel === '[data-stock-conflict-back]') return { addEventListener: (ev, fn) => { listeners.back = fn; } };
      return null;
    },
  };
}
const DOC = 'c'.repeat(64);
const recordedFixture = () => ([
  { itemId: 'flour', qty: 5, unitCost: 150 },
  { itemId: 'safran', qty: 1000, unitCost: 0.0045 },
]);
const currentFixture = () => ([
  { itemId: 'safran', name: 'Safran', qty: 900, unit: 'g', unitCost: 0.0045 },
  { itemId: 'sucre', name: 'Sucre <script>alert(1)</script>', qty: 2, unit: 'kg', unitCost: 12 },
]);
function fetchRecorded(rows) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ ok: true, movements: rows }) };
  };
  return { calls, impl };
}
/* Présente le conflit dans le vm et rend les constats au monde réel. */
async function runShow({ lang: lg = 'fr', rows = recordedFixture(), current = currentFixture(), fetchImpl = null, failFetch = false } = {}) {
  const toastCalls = [];
  const addCalls = [];
  const rec = rows === null ? null : fetchRecorded(rows);
  const impl = fetchImpl || (failFetch
    ? async (url) => { (rec || { calls: [] }).calls.push(String(url)); throw new Error('net-down'); }
    : rec.impl);
  const calls = rec ? rec.calls : [];
  const { ctx } = makeCtx({ lang: lg, fetchImpl: impl, toastCalls, addCalls });
  const stage = fakeStage();
  ctx.STAGE = stage;
  ctx.CURRENT = current;
  ctx.DOCID = DOC;
  const out = await vm.runInContext(
    '(async () => window.__conflict.stShowIntakeConflict({}, STAGE, { docId: DOCID, currentLines: CURRENT }))()',
    ctx,
  );
  return { out, stage, calls, toastCalls, addCalls, html: stage._html, ctx };
}

await check('409 renders the dedicated state, never the generic toast, with zero writes', async () => {
  const { out, stage, calls, toastCalls, addCalls, html } = await runShow();
  assert.equal(out.fetchFailed, false);
  assert.equal(out.rows.length, 3);
  assert.ok(calls.length === 1, 'one comparison fetch');
  assert.ok(calls[0].includes('refId=grn-intake-' + DOC.slice(0, 16)), 'fetch targets the receipt ref');
  assert.ok(calls[0].includes('reason=receipt'), 'fetch filters receipt movements');
  assert.ok(calls[0].includes('merchant=demo-tenant'), 'fetch is tenant-scoped');
  assert.ok(html.includes('ne correspond plus au premier envoi'), 'dedicated title, not the generic fallback');
  assert.ok(!html.includes('Lecture automatique indisponible'), 'no generic toast copy in the conflict state');
  assert.ok(html.includes('Modifié') && html.includes('Ajouté') && html.includes('Manquant'), 'all three row kinds shown');
  assert.ok(!html.includes(DOC) && !html.includes('grn-intake') && !html.includes('posting'), 'no hash, ref or fingerprint leaked');
  assert.equal(toastCalls.length, 0, 'no toast on the conflict path');
  assert.equal(addCalls.length, 0, 'no movement write on the conflict path');
  assert.equal(stage._children.length, 0, 'review nodes stashed, stage replaced');
  assert.ok(typeof stage._listeners.back === 'function', 'back handler wired');
});

await check('all three locales exist and Arabic routes through RTL', async () => {
  const fr = await runShow({ lang: 'fr' });
  const en = await runShow({ lang: 'en' });
  const ar = await runShow({ lang: 'ar' });
  assert.ok(fr.html.includes('ne correspond plus au premier envoi'), 'FR title');
  assert.ok(en.html.includes('no longer matches the first submission'), 'EN title');
  assert.ok(ar.html.includes('لم تعد تطابق الإرسال الأول'), 'AR title');
  assert.ok(en.html.includes('Back to review') && en.html.includes('View item history'), 'EN actions');
  assert.ok(ar.html.includes('عودة إلى المراجعة') && ar.html.includes('عرض سجل المنتج'), 'AR actions');
  assert.ok(fr.html.includes('Retour à la relecture'), 'FR back action');
  for (const [name, r] of [['fr', fr], ['en', en], ['ar', ar]]) {
    assert.ok(r.html.includes('<bdi dir="ltr"'), name + ': numbers isolated LTR (house RTL pattern)');
  }
  assert.ok(ar.html.trimStart().startsWith('<div class="st-notice warn">'), 'AR container inherits page direction, never forced LTR');
  assert.ok(!ar.html.includes('This attempt') && !ar.html.includes('Cette tentative'), 'AR view carries no FR/EN copy');
});

await check('no postedAdd, mark, close or movement happens after conflict', async () => {
  const toastCalls = [];
  const addCalls = [];
  const rec = fetchRecorded(recordedFixture());
  const { ctx } = makeCtx({ lang: 'fr', fetchImpl: rec.impl, toastCalls, addCalls });
  const stage = fakeStage();
  const before = [...stage._children];
  ctx.STAGE = stage;
  ctx.CURRENT = currentFixture();
  ctx.DOCID = DOC;
  await vm.runInContext(
    '(async () => window.__conflict.stShowIntakeConflict({}, STAGE, { docId: DOCID, currentLines: CURRENT }))()',
    ctx,
  );
  assert.equal(toastCalls.length, 0, 'no toast fired');
  assert.equal(addCalls.length, 0, 'no ledger write attempted');
  for (const forbidden of ['stIntakePostedAdd', 'stIntakeMarkOnce', 'closeTopModal', 'mScanFailFallback', 'receiveDirect', 'attachInvoice']) {
    assert.ok(!extractStock('stShowIntakeConflict').includes(forbidden), 'show path never touches ' + forbidden);
  }
  assert.ok(!extractStock('stRenderIntakeConflict').includes('stIntakePostedAdd'), 'render never marks');
  // Back restores the exact stashed nodes, still without side effects.
  await vm.runInContext('STAGE._listeners.back()', ctx);
  assert.equal(stage._children.length, before.length, 'review nodes restored');
  assert.ok(stage._children.every((n, i) => n === before[i]), 'same node objects, values and listeners intact');
  assert.equal(toastCalls.length, 0, 'back fires no toast either');
  assert.equal(addCalls.length, 0, 'back writes nothing either');
});

await check('existing-vs-current rows are escaped and classified correctly', async () => {
  const { ctx } = makeCtx({ lang: 'fr' });
  ctx.REC = recordedFixture();
  ctx.CUR = currentFixture();
  const rows = await vm.runInContext(
    'window.__conflict.stIntakeCompareConflict(REC, CUR)',
    ctx,
  );
  const kinds = {};
  for (const r of rows) kinds[r.itemId] = r.kind;
  assert.equal(kinds.safran, 'changed', 'qty 1000 vs 900');
  assert.equal(kinds.sucre, 'added', 'not previously recorded');
  assert.equal(kinds.flour, 'missing', 'recorded but absent from review');
  assert.equal(rows.length, 3, 'unchanged rows omitted');
  const { html } = await runShow();
  assert.ok(html.includes('Sucre &lt;script&gt;alert(1)&lt;/script&gt;'), 'item names escaped');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'no raw markup injected');
  const nul = await vm.runInContext(
    `window.__conflict.stIntakeCompareConflict(
      [{ itemId: 'x', qty: 1, unitCost: null }],
      [{ itemId: 'x', name: 'X', qty: 1, unit: 'u', unitCost: 0 }])`,
    ctx,
  );
  assert.equal(nul.length, 1, 'null vs 0 cost is a real change');
  assert.equal(nul[0].kind, 'changed');
  const same = await vm.runInContext(
    `window.__conflict.stIntakeCompareConflict(
      [{ itemId: 'x', qty: 1, unitCost: 0.0045 }],
      [{ itemId: 'x', name: 'X', qty: 1, unit: 'u', unitCost: 0.0045 }])`,
    ctx,
  );
  assert.equal(same.length, 0, 'identical rows omitted');
});

await check('a failed comparison fetch remains fail-closed', async () => {
  const { out, stage, html, calls, ctx } = await runShow({ rows: recordedFixture(), failFetch: true });
  assert.equal(out.fetchFailed, true);
  assert.equal(out.rows.length, 0, 'no invented comparison data');
  assert.ok(calls.length === 1, 'the fetch was attempted');
  assert.ok(html.includes('n’ont pas pu être chargées'), 'clear warning retained');
  assert.ok(!html.includes('<table'), 'no comparison table without recorded data');
  assert.ok(!html.includes(DOC) && !html.includes('grn-intake'), 'nothing leaked on the failure path either');
  assert.ok(typeof stage._listeners.back === 'function', 'back still available');
  ctx.STAGE = stage;
  await vm.runInContext('STAGE._listeners.back()', ctx);
  assert.equal(stage._children.length, stage._nodes.length, 'review nodes restored');
  assert.ok(stage._children.every((n, i) => n === stage._nodes[i]), 'review restored even after fetch failure');
});

await check('the normal successful intake path is unchanged', async () => {
  const postAll = extractStock('stIntakePostAll');
  assert.ok(
    postAll.indexOf('stIntakePrepare(docId, postingHash') < postAll.indexOf('receiveDirect('),
    'conflict still occurs before any receipt, movement, cost or invoice write',
  );
  assert.ok(postAll.indexOf('stIntakePrepare(docId, postingHash') < postAll.indexOf('K.add('), 'prepare precedes ledger writes too');
  const confirmZone = stockSrc.slice(stockSrc.indexOf("querySelector('[data-stock-scan-confirm]')"));
  assert.ok(confirmZone.includes('mScanFailFallback'), 'generic fallback retained for non-conflict errors');
  assert.ok(confirmZone.includes('stShowIntakeConflict'), 'conflict branch wired in the confirm handler');
  assert.ok(confirmZone.indexOf('stShowIntakeConflict') < confirmZone.indexOf('stSaveOverlay()'), 'conflict returns before any seal');
});
