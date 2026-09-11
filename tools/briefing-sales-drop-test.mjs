#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
const callbacks = {};
const memory = {};
const storage = { getItem: (k) => memory[k] || null, setItem: (k, v) => { memory[k] = String(v); } };
let venue = 'venue-a';
let ledgerByVenue = {};
const cutoff = 5;
const iso = (ts) => {
  const d = new Date(ts - cutoff * 3600000);
  return d.toISOString().slice(0, 10);
};
const bounds = (day) => ({ from: Date.parse(day + 'T05:00:00Z'), to: Date.parse(day + 'T05:00:00Z') + 86400000 });
const document = {
  readyState: 'loading', documentElement: { lang: 'fr' }, head: { appendChild() {} },
  querySelector() { return null; }, createElement() { return { setAttribute() {}, addEventListener() {} }; },
  addEventListener(name, fn) { callbacks[name] = fn; }
};
const window = {
  document, localStorage: storage, KiwiEnv: { isReal: () => true }, KiwiMe: { accountId: 'account-a' },
  KiwiCloudDoc: { currentSlug: () => venue }, KiwiDayReport: { cutoff: () => cutoff, businessDay: iso, dayBounds: bounds },
  KiwiVenue: { getVenue: () => venue }, KiwiSales: { list: (id) => ledgerByVenue[id] || [] },
  KiwiLive: { status: () => ({ on: true, merchant: venue, backfillComplete: true }) },
  KiwiAgentTier: () => 'owner', addEventListener() {}
};
window.window = window;
vm.runInNewContext(source, { window, document, localStorage: storage, console, Date, setTimeout, clearTimeout }, { filename: 'assets/briefing.js' });
const T = window.KiwiBriefing._test;
const now = Date.parse('2026-08-21T07:00:00Z');
const at = (daysBack, hour, amount) => ({ ts: now - daysBack * 86400000 - (7 - hour) * 3600000, amount });
const fixture = (currentAmount = 50) => {
  const rows = [
    { ts: Date.parse('2026-08-21T05:30:00Z'), amount: currentAmount },
    { ts: Date.parse('2026-08-21T04:30:00Z'), amount: 9999 }
  ];
  [1, 2, 3, 4, 5, 6, 7].forEach((d) => rows.push(at(d, 6, d === 7 ? 200 : 180)));
  [14, 21, 28].forEach((d) => rows.push(at(d, 6, 200)));
  return rows;
};

let line = T.salesDropRule({ now, rows: fixture(), backfillComplete: true });
assert.ok(line, 'both agreeing baselines emit a line');
assert.match(line.copy.fr, /Seuil : -20 %/, 'the threshold is visible');
assert.equal(line.evidence.count, 1, 'evidence carries the current ticket count');
assert.match(line.evidence.window, /2026-08-21/, 'evidence carries the exact business day');
assert.match(line.evidence.source, /backfill complet/, 'evidence names the authoritative source state');
assert.match(line.copy.fr, /50 MAD/, 'the 05:00 boundary excludes the 04:30 sale');

assert.equal(T.salesDropRule({ now, rows: fixture(), backfillComplete: false }), null, 'unfinished backfill suppresses the rule');
assert.equal(T.salesDropRule({ now, rows: fixture(170), backfillComplete: true }), null, 'disagreeing trailing baseline suppresses the rule');
const short = fixture().filter((row) => row.ts > now - 16 * 86400000);
assert.equal(T.salesDropRule({ now, rows: short, backfillComplete: true }), null, 'fewer than three matching weekdays suppresses the rule');

ledgerByVenue['venue-a'] = fixture();
ledgerByVenue['venue-b'] = [{ ts: Date.parse('2026-08-21T05:30:00Z'), amount: 900000 }];
venue = 'venue-a';
line = T.salesDropRule({ now });
assert.ok(line && /50 MAD/.test(line.copy.fr), 'the rule reads only the active venue ledger');
assert.equal(T.visibleLines([line], 'staff').length, 1, 'sales visibility follows the existing shop-floor sales permission');
assert.ok(T.normalizeLine(line), 'an emitted sales line always passes the evidence gate');

console.log('briefing-sales-drop-test: 12 controls passed');
