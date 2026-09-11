#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Guide d'inventaire test — cause probable, à-l'aveugle, historique,
 * feuille imprimable, et « la revue est le seul chemin d'écriture ».
 *
 *   node tools/inventory-count-test.mjs
 *
 * Discipline: executed controls run code EXTRACTED from assets/stock.js
 * (regex + new Function), never a reimplementation.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log("■ Guide d'inventaire test (tools/inventory-count-test.mjs)");

const src = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

/* Module-level functions in stock.js close with `\n  }` at indent 2 — nested
 * blocks and template literals are all indented deeper. */
function extractFn(name) {
  const m = src.match(new RegExp('(function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\})'));
  if (!m) throw new Error('cannot extract ' + name + ' from assets/stock.js');
  return m[1];
}

// ── 1. Reason engine — executed, extracted from the shipped file ────────────
const reasonSrc = extractFn('stCountReason');
const stCountReason = new Function(reasonSrc + '; return stCountReason;')();
const NOW = 1750000000000;

ok(stCountReason({ diff: 0, expected: 5, counted: 5 }) === '', 'no variance → no reason shown');
ok(stCountReason({ diff: -10, expected: 10, counted: 0 }) === 'reasonZero', 'counted zero with expected stock → reasonZero (introuvable)');
ok(stCountReason({ diff: 1998, expected: 2, counted: 2000 }) === 'reasonUnit', 'counted ≥ 20× expected → reasonUnit (kg vs grammes)');
ok(stCountReason({ diff: -3, expected: 10, counted: 7, moves: [{ reason: 'waste', qty: -1 }] }) === 'reasonWaste', 'recent waste movement → reasonWaste');
ok(stCountReason({ diff: -3, expected: 10, counted: 7, theoUsage: 5, moves: [{ reason: 'waste', qty: -1 }] }) === 'reasonWaste', 'order pinned: recorded waste beats the recipe heuristic');
ok(stCountReason({ diff: -4, expected: 10, counted: 6, theoUsage: 4, moves: [] }) === 'reasonRecipes', '|écart| ≤ 1.25 × conso recettes → reasonRecipes');
ok(stCountReason({ diff: -8, expected: 10, counted: 2, theoUsage: 2, cat: 'viandes', moves: [] }) === 'reasonPerish', 'unexplained loss on perishable cat → reasonPerish');
ok(stCountReason({ diff: -8, expected: 10, counted: 2, theoUsage: 0, cat: 'epicerie', moves: [] }) === 'reasonLoss', 'unexplained loss elsewhere → reasonLoss');
ok(stCountReason({ diff: 5, expected: 10, counted: 15, now: NOW, moves: [{ qty: 10, refType: 'receipt', occurredTs: NOW - 3600e3 }] }) === 'reasonDeliv', 'surplus + delivery < 48h → reasonDeliv (double saisie)');
ok(stCountReason({ diff: 5, expected: 10, counted: 15, now: NOW, moves: [{ qty: 10, refType: 'receipt', occurredTs: NOW - 72 * 3600e3 }] }) === 'reasonExtra', 'surplus with delivery older than 48h → reasonExtra');
ok(stCountReason({ diff: 5, expected: 10, counted: 15, moves: [] }) === 'reasonExtra', 'surplus with no signal → reasonExtra');

// ── 2. History — executed with mocked storage, tenant-scoped key ─────────────
const keyDecl = src.match(/const stCountHistKey = \(\) => 'kiwi:inventoryCounts:v1:' \+ stOverlayScope\(\);/);
ok(!!keyDecl, "history key is tenant-scoped: 'kiwi:inventoryCounts:v1:' + stOverlayScope()");

const histSrc = [keyDecl ? keyDecl[0] : '', extractFn('stCountHistory'), extractFn('stSaveCountHistory')].join('\n');
const store = new Map();
const fakeLS = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const makeHist = new Function('localStorage', 'stOverlayScope', histSrc + '; return { stCountHistory, stSaveCountHistory, stCountHistKey };');
const H = makeHist(fakeLS, () => 'venue-test');

ok(H.stCountHistKey() === 'kiwi:inventoryCounts:v1:venue-test', 'key resolves through the injected tenant scope');
const mkLine = (id, theo, counted, cost) => ({ it: { id, name: id, unit: 'kg' }, theo, counted, diff: Math.round((counted - theo) * 1000) / 1000, costDiff: (counted - theo) * cost, reasonKey: 'reasonLoss' });
const e1 = H.stSaveCountHistory('count-a', [mkLine('tomates', 10, 7, 12), mkLine('riz', 5, 5, 8)]);
ok(e1.counted === 2 && e1.gaps.length === 1 && e1.gaps[0].id === 'tomates', 'entry keeps only variance lines in gaps, counts all lines');
ok(e1.varMad === Math.round(-3 * 12), 'variance value in MAD is the rounded sum of cost diffs');
H.stSaveCountHistory('count-b', [mkLine('tomates', 7, 7, 12)]);
ok(H.stCountHistory()[0].ref === 'count-b' && H.stCountHistory()[1].ref === 'count-a', 'history is newest-first');
for (let i = 0; i < 30; i++) H.stSaveCountHistory('count-x' + i, [mkLine('riz', 5, 4, 8)]);
ok(H.stCountHistory().length === 24, 'history is capped at 24 entries');

// ── 3. Blind count is the default ────────────────────────────────────────────
ok(/<input type="checkbox" data-pc-blind checked \/>/.test(src), 'digital count: blind checkbox is checked by default');
ok(/<div class="st-pc-wrap st-pc-blind">/.test(src), 'digital count: table wrap starts in blind mode');
ok(/classList\.toggle\('st-pc-blind', blindBox\.checked\)/.test(src), 'blind toggle wires the checkbox to the wrap class');
ok(/\.st-pc-wrap\.st-pc-blind \[data-pc-theo\]/.test(html) && /\[data-pc-cost-out\] \{ visibility: hidden; \}/.test(html), 'dashboard.html CSS hides theoretical/variance/value cells in blind mode');
ok(/\.st-pc-blindrow \{/.test(html), 'dashboard.html has the blind-row styles');

// ── 4. Validate → review; the review is the only write path ─────────────────
const valStart = src.indexOf("document.querySelector('[data-stock-pc-validate]')?.addEventListener");
const valEnd = src.indexOf('openCountReview(lines, topBackdrop());', valStart);
ok(valStart !== -1 && valEnd !== -1, 'validate handler routes to openCountReview, stacked over the count grid');
const valBody = valStart !== -1 && valEnd !== -1 ? src.slice(valStart, valEnd) : '';
ok(valBody && !/countStock\(/.test(valBody) && !/KiwiInventory\.add/.test(valBody), 'validate handler itself writes nothing (no countStock, no ledger add)');
ok(valBody && !/closeTopModal\(\)/.test(valBody), 'validate keeps the count grid open — Annuler in the review returns to intact entries');

const revSrc = extractFn('openCountReview');
ok(/countStock\(l\.it, l\.counted, countRef\)/.test(revSrc), 'review apply adjusts through countStock (ledger-backed path)');
ok(/stSaveCountHistory\(countRef, lines\)/.test(revSrc) && /stSaveOverlay\(\)/.test(revSrc), 'review apply persists overlay + count history');
ok(!/KiwiInventory\.add/.test(revSrc), 'review never bypasses countStock with a direct ledger write');
ok(/countBack\?\.querySelector\('\.kiwi-modal-close'\)\?\.click\(\)/.test(revSrc), 'apply closes both the review and the underlying count grid');
ok(/stCountReason\(\{/.test(revSrc) && /stRecentMoves\(l\.it\.id\)/.test(revSrc) && /theoreticalUsageFor\(l\.it\)/.test(revSrc), 'review feeds the reason engine with ledger moves + recipe usage');
ok(/mRevColReason/.test(revSrc) && /st-rev-reason/.test(revSrc), 'review renders the probable-cause column');

const movesSrc = extractFn('stRecentMoves');
ok(/isReal/.test(movesSrc) && /reason !== 'count'/.test(movesSrc), 'stRecentMoves reads the real ledger only and excludes prior counts');

// ── 5. Printable sheet ───────────────────────────────────────────────────────
ok(/<input type="checkbox" data-sheet-theo \/>/.test(src) && !/data-sheet-theo checked/.test(src), 'paper sheet: theoretical column is OFF by default (blind paper)');
const sheetSrc = extractFn('stSheetHtml');
ok(/showTheo \? `<th>\$\{esc\(t\('mCountColTheo'\)\)\}<\/th>` : ''/.test(sheetSrc), 'sheet gates the theoretical column on the checkbox');
ok(/it\.category \|\| it\.cat \|\| 'epicerie'/.test(sheetSrc), 'sheet groups items by category');
ok(/dir="\$\{rtl \? 'rtl' : 'ltr'\}"/.test(sheetSrc), 'sheet honours RTL for Arabic');
ok(/sheetCounter/.test(sheetSrc) && /sheetSign/.test(sheetSrc) && /sheetFoot/.test(sheetSrc), 'sheet carries counted-by / signature lines and instructions');
const printSrc = extractFn('printCountSheet');
ok(/frame\.contentWindow\.print\(\)/.test(printSrc) && /frame\.remove\(\)/.test(printSrc), 'print uses the hidden-iframe pattern and cleans up');
ok(/H\['stock-count-sheet'\] = \(\) => openCountSheet\(\);/.test(src), 'stock-count-sheet handler registered in Kiwi.handlers');
ok(/data-action="stock-count-sheet"/.test(src), 'header carries the Feuille d\'inventaire button');
ok(/mCountLast/.test(extractFn('openPhysicalCount')), 'count modal surfaces the last inventory date + variance');

// ── 6. i18n — every new key exists in FR + EN + AR ──────────────────────────
const KEYS = ['mCountBlind', 'mCountBlindTip', 'mCountLast', 'btnSheet', 'mSheetTitle', 'mSheetSub', 'mSheetTheo', 'mSheetTheoTip', 'mSheetCount', 'mSheetPrint', 'sheetCounter', 'sheetSign', 'sheetColItem', 'sheetColUnit', 'sheetColNotes', 'sheetFoot', 'mRevTitle', 'mRevSub', 'mRevColReason', 'mRevNoneT', 'mRevNone', 'mRevTotal', 'mRevBack', 'mRevApply', 'reasonZero', 'reasonUnit', 'reasonWaste', 'reasonRecipes', 'reasonPerish', 'reasonLoss', 'reasonDeliv', 'reasonExtra'];
const missing = KEYS.filter((k) => (src.match(new RegExp('(?:^      |, )' + k + ':', 'gm')) || []).length < 3);
ok(missing.length === 0, `all ${KEYS.length} new strings exist in FR + EN + AR${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);

// ── 7. Hard count pinning ────────────────────────────────────────────────────
const EXPECTED_COUNT = 43;
ok(passed + 1 === EXPECTED_COUNT, `exact control count verified (${passed + 1}/${EXPECTED_COUNT})`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} failure(s)`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} controls green`);
}
