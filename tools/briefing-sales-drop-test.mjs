#!/usr/bin/env node
import briefingSource from './briefing-test-source.cjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = briefingSource();
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
/* Decision 2026-11-04 (briefing#1): staff see the drop as a percentage only; dirham amounts stay with owner and manager. */
const floorLine = T.salesDropFloorRule({ now });
assert.deepEqual(T.visibleLines([line, floorLine], 'staff').map((l) => l.id), [floorLine.id], 'staff get the floor card, never the line with amounts');
assert.deepEqual(T.visibleLines([line, floorLine], 'manager').map((l) => l.id), [line.id], 'the manager gets the full card once');
assert.ok(T.normalizeLine(floorLine), 'the floor card passes the evidence gate');
for (const lang of ['fr', 'en', 'ar']) assert.equal(/MAD|درهم/.test(floorLine.copy[lang]), false, 'the floor card names no amount (' + lang + ')');
assert.ok(T.normalizeLine(line), 'an emitted sales line always passes the evidence gate');

/* Le magasin dicte l'heure et la journée, pas l'appareil. */
const storeClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
assert.ok(line.copy.fr.includes(' à ' + storeClock + ','), 'the card time is the store clock (' + storeClock + '), never the device clock');
const realBounds = window.KiwiDayReport.dayBounds;
window.KiwiDayReport.dayBounds = undefined;
const fallback = T.dayBoundsAt(now);
assert.equal(fallback.from, Date.parse('2026-08-21T04:00:00Z'), 'without KiwiDayReport the day still starts at 05:00 in the store zone');
assert.equal(fallback.to - fallback.from, 86400000);
assert.equal(T.dayBoundsAt(Date.parse('2026-08-21T03:00:00Z')).from, Date.parse('2026-08-20T04:00:00Z'), 'before 05:00 store time the previous day applies');
window.KiwiDayReport.dayBounds = realBounds;
if (!process.env.KIWI_BRIEFING_TZ_CHILD) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: 'Pacific/Auckland', KIWI_BRIEFING_TZ_CHILD: '1' }, encoding: 'utf8' });
  assert.equal(child.status, 0, 'the same checks hold on a device in another zone: ' + (child.stdout + child.stderr).slice(-400));
}
console.log('briefing-sales-drop-test: 17 controls passed');
