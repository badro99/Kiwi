#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const briefing = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
const sale = fs.readFileSync(new URL('../functions/api/sale.js', import.meta.url), 'utf8');
const feed = fs.readFileSync(new URL('../functions/api/feed.js', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const venues = fs.readFileSync(new URL('../assets/venues.js', import.meta.url), 'utf8');
const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const pairing = fs.readFileSync(new URL('../assets/caisse-pairing.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const audit = fs.readFileSync(new URL('../docs/audits/AUDIT_AI.md', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, message) { if (!condition) throw new Error(message); checks += 1; }
function boot() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, head: { appendChild() {} }, createElement() { return { setAttribute() {}, appendChild() {}, addEventListener() {} }; } };
  const window = { document, console, setTimeout, clearTimeout, addEventListener() {}, KiwiEnv: { isReal: () => true }, KiwiAccount: { get: () => ({ id: 'acct-a', role: 'owner' }) }, KiwiVenue: { getVenue: () => 'venue-a' }, localStorage: { getItem() { return null; }, setItem() {} } };
  window.window = window;
  vm.runInContext(briefing, vm.createContext({ window, document, console, setTimeout, clearTimeout, Date, Math, JSON, isFinite }), { filename: 'briefing.js' });
  return window.KiwiBriefing._test;
}
const T = boot();
const fixture = { day: '2026-08-20', current: { gross: 100000, discount: 10000, discountedCount: 3, actors: { 'staff:manager-a': 7000, 'staff:manager-b': 3000 } }, baselineShares: [2, 3, 2, 3] };
const line = T.discountShareRule(fixture);
ok(!!line, '10 percent share against low baseline emits');
ok(line.roles.length === 1 && line.roles[0] === 'owner', 'per-actor trust signal is owner-only');
ok(/staff:manager-a/.test(line.copy.fr), 'line names the leading actor id');
ok(/5 %/.test(line.copy.fr) && /2×/.test(line.copy.fr), 'line states both thresholds');
ok(!line.action, 'discount signal never acts');
ok(line.evidence.count === 3 && /discount_amount_cents/.test(line.evidence.source), 'evidence carries count and source');
ok(!!T.normalizeLine(line), 'line survives evidence normalization');
ok(T.visibleLines([line], 'owner').length === 1 && T.visibleLines([line], 'manager').length === 0 && T.visibleLines([line], 'staff').length === 0, 'only owner can see it');
ok(T.discountShareRule({ ...fixture, current: { ...fixture.current, discountedCount: 1 } }) === null, 'single discount suppresses');
ok(T.discountShareRule({ ...fixture, current: { ...fixture.current, discount: 4000 } }) === null, 'share below five percent suppresses');
ok(T.discountShareRule({ ...fixture, baselineShares: [7, 8, 6, 7] }) === null, 'share that does not double baseline suppresses');
ok(T.discountShareRule({ ...fixture, baselineShares: [2, 3] }) === null, 'fewer than three comparable days suppresses');
ok(/live\.backfillComplete/.test(briefing) && /D\.lastClosedDay\(\)/.test(briefing), 'production requires finished backfill and the 5 h-aware closed day');
ok(/function salesRows[\s\S]{0,260}?KiwiSales\.list\(id\)/.test(briefing), 'production denominator is active-venue scoped');

for (const column of ['gross_amount_cents INTEGER', 'discount_amount_cents INTEGER', 'discount_reason TEXT', 'discount_actor_id TEXT']) ok(schema.includes(column), `schema includes nullable ${column}`);
ok(!/gross_amount_cents INTEGER NOT NULL|discount_amount_cents INTEGER NOT NULL|discount_reason TEXT NOT NULL|discount_actor_id TEXT NOT NULL/.test(schema), 'all four schema additions are nullable');
ok(/discountAmountCents > grossAmountCents/.test(sale), 'server rejects discount greater than gross');
ok(/DISCOUNT_REASONS\.has\(discountReason\)/.test(sale), 'server validates reason enum');
ok(/\^\\d\{4\}\$/.test(sale) && /bad-discount-actor/.test(sale), 'server refuses a four-digit actor code');
ok(/grossAmountCents - discountAmountCents\) - amountCents/.test(sale), 'server validates gross minus discount against net');
ok(/gross_amount_cents\|discount_amount_cents\|discount_reason\|discount_actor_id/.test(sale), 'server falls back when optional columns lag');
ok(/body\.grossAmountCents/.test(live) && /body\.discountAmountCents/.test(live) && /body\.actorId/.test(live), 'durable outbox forwards all facts');
ok(/sale\.grossAmountCents/.test(venues) && /!\/\^\\d\{4\}\$\//.test(venues), 'dashboard ledger preserves validated facts and rejects codes');
ok(/gross_amount_cents, discount_amount_cents, discount_reason, discount_actor_id/.test(feed), 'feed reads all four columns');
ok(/sale\.discountAmountCents =/.test(feed) && /sale\.actorId =/.test(feed), 'feed projects camel-case dashboard fields');
ok(/lastManager = \{ id: String\(who\.id/.test(pairing), 'manager authorization retains verified id');
ok(/actorId: String\(window\.KiwiCaissePairing\?\.lastManager/.test(caisse), 'caisse freezes the verified manager id on discount');
ok(/function activeSaleDiscount[\s\S]{0,1000}?grossAmountCents: minor\(gross\)/.test(caisse), 'caisse derives gross and discount from immutable sale lines');
ok(/ALTER TABLE sales ADD COLUMN gross_amount_cents INTEGER/.test(audit) && /l'encaissement n'attend jamais/.test(audit), 'AUDIT_AI records exact migration and fail-soft sale behavior');

console.log(`briefing-discounts-test: ${checks} controls passed`);
