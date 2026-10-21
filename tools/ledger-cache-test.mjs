#!/usr/bin/env node
/* The sales and refunds ledgers are parsed once per change of the stored
   text, not once per read. Before, a dashboard redraw parsed Santos Store's
   1.2 MB ledger about fifty times (~5 ms each). The real store code from
   assets/venues.js runs in a vm with a counting JSON.parse. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const venues = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');
const start = venues.indexOf('  const salesSubs = new Set();');
const end = venues.indexOf('  function salesTotals(', start);
assert.ok(start >= 0 && end > start, 'store slice found');

const storage = new Map();
const localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
let parses = 0;
const CountingJSON = { parse: (...a) => { parses++; return JSON.parse(...a); }, stringify: JSON.stringify };
const window = { localStorage };
const ctx = vm.createContext({ window, localStorage, JSON: CountingJSON, console, Date, Math, Number, String, Array, Object, Set, Map });
vm.runInContext("'use strict'; const TRANSIENT_IDS = []; const currentVenue = 'v1'; const slugOf = () => 'shop';\n"
  + venues.slice(start, end)
  + '\nwindow.S = { add: salesAdd, addMany: salesAddMany, list: salesList, annotate: salesAnnotate, remove: salesRemove, retain: salesRetainCursors, key: SALES_KEY };'
  + '\nwindow.R = { add: refundsAdd, list: refundsList, retain: refundsRetainCursors };', ctx);
const { S, R } = window;
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

S.addMany('v1', Array.from({ length: 300 }, (_, i) => ({ amount: 10 + i, method: 'cash', cursor: i + 1, ts: 1_700_000_000_000 + i, lines: [{ name: 'Thé', qty: 1, total: 10 }] })));
parses = 0;
const first = S.list('v1');
for (let i = 0; i < 50; i++) S.list('v1');
ok(parses <= 1, `fifty reads of an unchanged ledger parse it ${parses} time(s), not fifty`);
ok(S.list('v1') === first, 'unchanged text returns the same rows');
ok(first.length === 300, 'all 300 rows');

/* Shared rows cannot be altered by a reader, deep included. */
ok(Object.isFrozen(first) && Object.isFrozen(first[0]) && Object.isFrozen(first[0].lines[0]), 'cached rows are frozen, nested lines too');
assert.throws(() => { 'use strict'; first.push({}); }); checks++;
assert.throws(() => { 'use strict'; first[0].amount = 0; }); checks++;

/* Writers still work, and readers see their writes. */
S.add('v1', { amount: 99, method: 'card', cursor: 301, ts: 1_700_000_001_000 });
ok(S.list('v1').length === 301 && S.list('v1').at(-1).amount === 99, 'add() is seen by the next read');
ok(first.length === 300, 'an earlier reader keeps its own snapshot');
ok(S.annotate('v1', 5, { ref: 'T-5', saleId: 'sale-5' }) !== false, 'annotate() still edits a row');
ok(S.list('v1').find((e) => e.cursor === 5).saleId === 'sale-5', 'the annotation is persisted');
ok(first.find((e) => e.cursor === 5).saleId === undefined, 'the frozen snapshot was not touched by annotate()');
ok(S.remove('v1', [1, 2]) === 2 && S.list('v1').length === 299, 'remove() still removes');
ok(S.retain('v1', S.list('v1').map((e) => e.cursor).filter((c) => c !== 3)) === 1, 'retainCursors() still prunes');

/* Another tab writes the same key: the next read sees it at once. */
const key = S.key('v1');
const other = JSON.parse(storage.get(key)); other.push({ ts: 1, amount: 7, method: 'cash', cursor: 999 });
storage.set(key, JSON.stringify(other));
ok(S.list('v1').some((e) => e.cursor === 999), "another tab's write is seen on the next read");

/* Refunds share the cache rules. */
ok(R.add('v1', { amount: 20, cursor: 50, ts: 2 }) === true && R.list('v1').length === 1, 'refunds add and list');
parses = 0; for (let i = 0; i < 20; i++) R.list('v1');
ok(parses <= 1, 'refund reads are cached too');
ok(R.add('v1', { amount: 20, cursor: 50, ts: 2 }) === false, 'a refund is still deduplicated by cursor');

/* A write the browser refuses (quota) leaves the ledger as it was. */
const before = S.list('v1').length;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
S.add('v1', { amount: 1, method: 'cash', cursor: 5000, ts: 3 });
ok(S.list('v1').length === before, 'a refused write changes nothing that readers see');

console.log(`ledger-cache-test: ${checks} checks green`);
