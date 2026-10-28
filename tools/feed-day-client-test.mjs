#!/usr/bin/env node
/* feed-day-client-test · a day of sales longer than the feed's 2 000 rows is
 * read to the end, or says it could not be.
 *
 * /api/feed?from= used to answer the newest 2 000 rows with no mark, and the
 * boutique and maison tills, the till's sale sync, the reprint panel, the Sold
 * screen and the Z feed check all took that list for the whole day. The server
 * now says `truncated` and gives `before` (ts + rowid of the last row);
 * KiwiPosSale.feedDay follows those pages. The Z check certifies a day complete
 * only on an explicit signal. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');
const start = live.indexOf('  function feedDay(url, init) {');
const end = live.indexOf('\n  window.KiwiPosSale = {', start);
assert.ok(start > 0 && end > start, 'feedDay is defined in pos-sale.js');
assert.ok(/feedDay: feedDay/.test(live), 'and published as KiwiPosSale.feedDay');
const make = (fetchImpl) => new Function('fetch', live.slice(start, end) + '\nreturn feedDay;')(fetchImpl);

const row = (i) => ({ id: 's' + i, ts: 1e12 - i, cursor: 10000 - i });
const server = (total, pageSize, { failAt = 0 } = {}) => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (failAt && urls.length === failAt) return { ok: false, json: async () => null };
    const m = /[?&]bt=(\d+)&bc=(\d+)/.exec(url);
    const from = m ? Number(m[2]) : 10001;
    const rows = []; for (let i = 10000 - (from - 1); i < total && rows.length < pageSize + 1; i++) rows.push(row(i));
    const truncated = rows.length > pageSize; const page = rows.slice(0, pageSize);
    const last = page[page.length - 1];
    return { ok: true, json: async () => ({ merchant: 'm', sales: page, voided: [{ c: 1 }], truncated, ...(truncated ? { before: { ts: last.ts, cursor: last.cursor } } : {}) }) };
  };
  return { fetchImpl, urls };
};

let s = server(4500, 2000);
let all = await make(s.fetchImpl)('/api/feed?merchant=m&from=5', { credentials: 'same-origin' });
assert.equal(all.sales.length, 4500, 'every page is joined');
assert.equal(new Set(all.sales.map(r => r.id)).size, 4500);
assert.equal(all.truncated, false, 'and the day is complete');
assert.equal(s.urls.length, 3);
assert.ok(s.urls[1].includes('&bt=') && s.urls[1].includes('&bc='), 'later pages ask for the older rows');
assert.deepEqual(all.voided, [{ c: 1 }], 'the rest of the answer is the first page\'s');

s = server(100, 2000);
all = await make(s.fetchImpl)('/api/feed?merchant=m&from=5');
assert.equal(all.sales.length, 100); assert.equal(all.truncated, false); assert.equal(s.urls.length, 1, 'a normal day is one request');

s = server(4500, 2000, { failAt: 2 });
all = await make(s.fetchImpl)('/api/feed?merchant=m&from=5');
assert.equal(all.truncated, true, 'a page that fails leaves the day marked incomplete');
assert.equal(all.sales.length, 2000);

s = server(60000, 2000);
all = await make(s.fetchImpl)('/api/feed?merchant=m&from=5');
assert.equal(all.truncated, true, 'the page budget is bounded and says so');
assert.ok(s.urls.length <= 10);

assert.equal(await make(async () => ({ ok: false, json: async () => null }))('/x'), null, 'a failed first read is still null');

// Every consumer of the day read goes through it, and the Z check needs an explicit signal.
const files = ['pos-boutique.js', 'pos-maison.js', 'pos-sale.js', 'pos-reprint.js', 'sold-insights.js', 'caisse-accounting.js'];
for (const f of files) {
  const text = fs.readFileSync(new URL('../assets/' + f, import.meta.url), 'utf8');
  assert.ok(/KiwiPosSale\??\.feedDay|KiwiPosSale && window\.KiwiPosSale\.feedDay|feedDay\(url/.test(text), f + ' reads the day through feedDay');
}
const acc = fs.readFileSync(new URL('../assets/caisse-accounting.js', import.meta.url), 'utf8');
assert.ok(/data\.truncated === true/.test(acc), 'the Z check reads the explicit truncated flag');
console.log('✓ feed day client: a long day is paged to the end or marked incomplete');
