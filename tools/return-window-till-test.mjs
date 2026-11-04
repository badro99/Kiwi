#!/usr/bin/env node
/* Ruling 3 (owner, 4 Nov 2026), till half: the boutique till reads the
 * merchant's return window (0 to 90 days, 7 by default) on the 05:00 business
 * day, keeps enough sales to honour it, announces a sale outside it, and asks a
 * manager whose approval carries `windowOverride`. Runs the real module and the
 * real approval function lifted from the till. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { businessDate } from '../functions/api/_business-day.js';
const require = createRequire(import.meta.url);
const { declaration: scan } = require('./js-declarations.cjs');
import fs from 'node:fs';

let doc = {};
globalThis.KiwiStore = { currentVenue: () => 'v1', define: () => ({ get: () => doc, set: (next) => { doc = next; }, cloud: () => null, subscribe() {} }) };
globalThis.KiwiPolicies = require('../assets/merchant-policies.js');
const till = await import('../assets/pos-boutique/return-window.js?v=2');
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 4, 10, 0, 0);          // 4 Nov 2026, 10:00 UTC (business day 4 Nov)
Date.now = () => NOW;
const dayKey = (ts) => businessDate(ts, 5, 'UTC');
const at = (daysAgo, hour, min = 0) => Date.UTC(2026, 10, 4 - daysAgo, hour, min, 0);

// Default: 7 days, today included.
assert.equal(till.windowDays(), 7);
assert.equal(till.outsideWindow(at(0, 9), dayKey), false);
assert.equal(till.outsideWindow(at(6, 12), dayKey), false, 'the seventh day is still inside');
assert.equal(till.outsideWindow(at(7, 12), dayKey), true, 'the eighth is outside');
assert.equal(till.retainDays(), 7);
// 05:00 business day: 04:59 belongs to the day before.
doc = { returnWindowDays: 3 };
assert.equal(till.outsideWindow(at(2, 5, 0), dayKey), false, 'two days ago at 05:00 is the third business day');
assert.equal(till.outsideWindow(at(2, 4, 59), dayKey), true, 'two days ago at 04:59 is still the previous business day: outside');
assert.equal(till.outsideWindow(at(3, 12), dayKey), true);
assert.equal(till.retainDays(), 7, 'a short window never shrinks the journal below a week');
doc = { returnWindowDays: 14 }; assert.equal(till.retainDays(), 14);
doc = { returnWindowDays: 90 }; assert.equal(till.retainDays(), 30, 'a long window is held at 30 days of local journal');
assert.equal(till.outsideWindow(at(60, 12), dayKey), false, 'the window itself keeps its 90 days');
doc = { returnWindowDays: 0 }; assert.equal(till.outsideWindow(at(0, 9), dayKey), true, '0 days: even today needs a manager');
doc = { returnWindowDays: 'abc' }; assert.equal(till.windowDays(), 7, 'unreadable setting = default');
doc = { returnWindowDays: 500 }; assert.equal(till.windowDays(), 90);
assert.equal(till.outsideWindow(0, dayKey), false, 'a sale without a date never blocks');
doc = { returnWindowDays: 14 };
assert.equal(till.windowSentence(), 'Retour sous 14 jours avec ticket, échange ou avoir, jamais de remboursement espèces');
doc = { returnWindowDays: 1 }; assert.match(till.windowSentence(), /^Retour le jour de l’achat/);
doc = { returnWindowDays: 0 }; assert.match(till.windowSentence(), /^Retour sur accord d’un responsable/);

// The manager approval the till really asks for.
const source = fs.readFileSync(new URL('../assets/pos-boutique.js', import.meta.url), 'utf8');
function approvalFor(sale) {
  const asked = [];
  const ctx = vm.createContext({ Promise, Error, Math, window: { requireManager: (label, ok, action) => { asked.push({ label, action }); ok({ approval: 'signed' }); }, KiwiCaisseLang: { tr: (s) => s } },
    fmtMAD: (n) => n + ' MAD', findSale: () => sale, retDayKey: dayKey, outsideWindow: till.outsideWindow });
  const start = source.indexOf('  function avoirApproval(');
  vm.runInContext(scan(source.slice(start).trimStart(), 'avoirApproval') + '\nglobalThis.run = avoirApproval;', ctx);
  return ctx.run(10, 'issue:1', 'sale-1', '0042').then(() => asked[0]);
}
doc = { returnWindowDays: 7 };
let asked = await approvalFor({ at: at(1, 12) });
assert.equal(asked.action.windowOverride, false, 'a recent sale carries no override');
assert.ok(!asked.label.includes('hors fenêtre'), 'and the manager is not told it is late');
asked = await approvalFor({ at: at(9, 12) });
assert.equal(asked.action.windowOverride, true, 'an old sale asks for an approval that lifts the window');
assert.ok(asked.label.includes('hors fenêtre de retour'), 'and the manager reads that it is outside the window');
assert.equal(asked.action.refundMethod, 'avoir'); assert.equal(asked.action.amountCents, 1000);
doc = { returnWindowDays: 0 };
assert.equal((await approvalFor({ at: at(0, 9) })).action.windowOverride, true, 'with a 0-day window every return is an override');
console.log('✓ return window (till): business-day window, journal retention, override claim and announcement');
