#!/usr/bin/env node
/* no-random-demo · demo data is seeded by store and business day, never by chance (design 2027, §17.1 and §17.4).
 *
 *   node tools/no-random-demo-test.js
 *
 * assets/kit/demo-seed.js is the one place demo data is made. This lint holds
 * three things:
 *   1 · its code (comments stripped) names no source of chance, time or I/O:
 *       Math.random, crypto, Date, performance, storage, network, timers;
 *   2 · it still works when those sources are taken away: the module is run in
 *       a context where Math.random, Date and performance throw;
 *   3 · its output is a function of (storeId, businessDay) alone, never invents
 *       card last-four digits, brands or banks (§17.3), and equals `hash(storeId
 *       + businessDay)` seeding as the spec writes it.
 * Then the lint itself is proven: each banned source, injected into a copy of
 * the file, makes it fail.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; };
/* The module runs in a vm context, whose arrays and objects have another realm's prototypes: compare as JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (a, b, msg) => { assert.deepStrictEqual(plain(a), plain(b), msg); checks++; };
const section = (t) => console.log('\n' + t);
const done = (t) => console.log('  ✓ ' + t);

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

const BANNED = [
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bcrypto\b/, 'crypto'],
  [/\bDate\b/, 'Date (no clock, no calendar)'],
  [/\bperformance\b/, 'performance'],
  [/\bprocess\b/, 'process'],
  [/\b(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, 'a timer'],
  [/\b(?:localStorage|sessionStorage|indexedDB|document|navigator|location)\b/, 'the page or its storage'],
  [/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/, 'the network'],
  [/\b(?:Intl|toLocale\w*|getTimezoneOffset)\b/, 'a locale or a zone (the caller hands over the window)'],
  [/\bsort\s*\(\s*\(\s*\)\s*=>/, 'a comparator that takes no arguments (a shuffle)'],
  [/\b(?:last4|lastFour|last_four)\b|••|\bvisa\b|\bmastercard\b|attijari|bmce|\bcih\b|\bbnp\b|caixa|soci[eé]t[eé] g[eé]n/i, 'an invented card digit, brand or bank'],
];
function lint(src) {
  const code = stripComments(src);
  return BANNED.filter(([re]) => re.test(code)).map(([, what]) => what);
}

/* ── 1 · The files ────────────────────────────────────────────────────────── */
section('Demo files under assets/kit/');
const kit = path.join(ROOT, 'assets', 'kit');
const files = fs.existsSync(kit)
  ? fs.readdirSync(kit).filter((f) => f.endsWith('.js') && /demo|seed/i.test(f)).map((f) => path.join(kit, f))
  : [];
check(files.some((f) => f.endsWith('demo-seed.js')), 'assets/kit/demo-seed.js exists');
for (const f of files) {
  const found = lint(fs.readFileSync(f, 'utf8'));
  eq(found, [], `${path.relative(ROOT, f)} names no ${found.join(', ') || 'source of chance'}`);
}
done(`${files.length} demo file(s) clean`);

/* ── 2 · It runs with chance and time taken away ──────────────────────────── */
section('Run with Math.random, Date and performance throwing');
const seedPath = path.join(ROOT, 'assets/kit/demo-seed.js');
const SRC = fs.readFileSync(seedPath, 'utf8');
function load(src) {
  const trap = (what) => () => { throw new Error('demo-seed touched ' + what); };
  const M = Object.create(Math); M.random = trap('Math.random');
  const sandbox = { Math: M, Date: trap('Date'), performance: { now: trap('performance.now') }, console: { log: trap('console') } };
  sandbox.globalThis = sandbox; sandbox.window = undefined;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'demo-seed.js' });
  return sandbox.KiwiDemoSeed;
}
const S = load(SRC);
check(S && typeof S.ordersForDay === 'function', 'the module loads without touching any of them');
const win = { startTs: Date.UTC(2026, 9, 12, 4), endTs: Date.UTC(2026, 9, 13, 4) };
const day = S.ordersForDay('store-a', '2026-10-12', win);
check(day.sales.length >= 90 && day.sales.length <= 180, 'between 90 and 180 sales');
done('ordersForDay ran with every source of chance trapped');

/* ── 3 · A function of (storeId, businessDay) alone ───────────────────────── */
section('Same store and day, same data');
const again = load(SRC).ordersForDay('store-a', '2026-10-12', win);
eq(again, day, 'a fresh load gives the same sales and refunds');
eq(S.ordersForDay('store-a', '2026-10-12', win), day, 'a second call gives the same sales and refunds');
check(JSON.stringify(S.ordersForDay('store-a', '2026-10-13', { startTs: win.startTs + 86400000, endTs: win.endTs + 86400000 })) !== JSON.stringify(day), 'the next day is different');
check(JSON.stringify(S.ordersForDay('store-b', '2026-10-12', win)) !== JSON.stringify(day), 'another store is different');
/* "Today so far" is a prefix of the full day, not another day. */
const until = win.startTs + 12 * 3600000;
const part = S.ordersForDay('store-a', '2026-10-12', { ...win, until });
eq(part.sales, day.sales.filter((s) => s.ts <= until), 'until cuts the day, it does not reshuffle it');
eq(part.refunds, day.refunds.filter((s) => s.ts <= until), 'refunds are cut the same way');
/* Seeding is hash(storeId + businessDay), FNV-1a 32. */
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
eq([S.hash(''), S.hash('a'), S.hash('foobar')], [0x811c9dc5, 0xe40c292c, 0xbf9cf968], 'FNV-1a test vectors');
eq(S.seedFor('store-a', '2026-10-12'), fnv('store-a' + '2026-10-12'), 'seed = hash(storeId + businessDay)');
const r1 = S.rng('store-a', '2026-10-12', 'x'), r2 = S.rng('store-a', '2026-10-12', 'x'), r3 = S.rng('store-a', '2026-10-12', 'y');
const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()], c = [r3(), r3(), r3()];
eq(a, b, 'the same stream twice'); check(JSON.stringify(a) !== JSON.stringify(c), 'a different salt is a different stream');
check(a.every((x) => x >= 0 && x < 1), 'values in [0, 1)');
/* 400 days: every one deterministic, in range, and nothing invented. */
let invented = 0, total = 0;
for (let d = 0; d < 400; d++) {
  const bd = new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
  const w = { startTs: Date.parse(bd + 'T04:00:00Z'), endTs: Date.parse(bd + 'T04:00:00Z') + 86400000 };
  const o = S.ordersForDay('store-' + (d % 5), bd, w);
  eq(JSON.stringify(S.ordersForDay('store-' + (d % 5), bd, w)), JSON.stringify(o), `${bd} repeats`);
  for (const s of o.sales) {
    total++;
    check(Number.isInteger(s.amount) && s.amount > 0, 'whole dirhams');
    check(s.method === 'cash' || s.method === 'card', 'a method, never a brand: ' + s.method);
    check(s.ts >= w.startTs && s.ts < w.endTs, 'inside the day\'s window');
    eq(Object.keys(s).sort(), ['amount', 'id', 'method', 'ts'], 'no field beyond id, ts, amount, method');
    if (!/^demo-[0-9a-z]+$/.test(s.id)) invented++;
  }
  for (const f of o.refunds) { check(f.amount > 0 && f.ts < w.endTs, 'a refund inside the day'); eq(Object.keys(f).sort(), ['amount', 'kind', 'method', 'saleId', 'ts'], 'no field beyond the refund\'s own'); }
}
eq(invented, 0, 'every id is demo- and a hash; no card tail, brand or bank in any field over 400 days');
eq(S.ordersForDay('x', '2026-10-12', null), { sales: [], refunds: [] }, 'no window, no data');
eq(S.ordersForDay('x', '2026-10-12', { startTs: 5, endTs: 5 }), { sales: [], refunds: [] }, 'an empty window, no data');
done(`${total} sales over 400 days repeat exactly and invent nothing`);

/* ── 4 · The lint turns red ───────────────────────────────────────────────── */
section('The lint itself');
eq(lint(SRC), [], 'the shipped file passes');
const inject = (code) => SRC.replace("'use strict';", "'use strict';\n  " + code);
for (const [code, what] of [
  ['var x = Math.random();', 'Math.random'],
  ['var t = Date.now();', 'Date'],
  ['var d = new Date();', 'Date'],
  ['var p = performance.now();', 'performance'],
  ['var c = crypto.getRandomValues(new Uint8Array(1));', 'crypto'],
  ['localStorage.getItem("k");', 'the page or its storage'],
  ['fetch("/x");', 'the network'],
  ['setTimeout(function () {}, 0);', 'a timer'],
  ['var z = new Intl.DateTimeFormat();', 'a locale or a zone'],
  ['var s = [1, 2].sort(() => 0.5 - 1);', 'a comparator'],
  ['var last4 = 1;', 'an invented card digit'],
  ['var b = "Carte marocaine · Attijariwafa";', 'an invented card digit'],
]) {
  const found = lint(inject(code));
  check(found.some((w) => w.indexOf(what) === 0), `injecting ${code.slice(0, 32)}… is caught (${what})`);
}
/* A comment mentioning them is not code. */
eq(lint(inject('/* Math.random() and Date.now() are banned */ // fetch')), [], 'comments may name them');
/* And the sandbox run catches what a regex would miss. */
let trapped = false;
try { load(SRC.replace('var r = rng(storeId, businessDay, \'orders\');', 'var r = function () { return Math["ran" + "dom"](); };')).ordersForDay('s', '2026-10-12', win); } catch (e) { trapped = /touched Math\.random/.test(e.message); }
check(trapped, 'a Math.random built from strings is caught by the trap, not by the regex');
done('twelve injected sources and one disguised call all turn it red');

console.log(`\n${checks} checks passed.`);
