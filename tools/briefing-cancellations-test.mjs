#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const briefing = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../assets/cancellation-history.js', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../functions/api/sale/cancel.js', import.meta.url), 'utf8');
const feed = fs.readFileSync(new URL('../functions/api/feed.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const audit = fs.readFileSync(new URL('../docs/audits/AUDIT_AI.md', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, message) { if (!condition) throw new Error(message); checks += 1; }

function bootBriefing() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, head: { appendChild() {} }, createElement() { return { setAttribute() {}, appendChild() {}, addEventListener() {} }; } };
  const window = { document, console, setTimeout, clearTimeout, addEventListener() {}, KiwiEnv: { isReal: () => true }, KiwiAccount: { get: () => ({ id: 'acct-a', role: 'owner' }) }, KiwiVenue: { getVenue: () => 'venue-a' }, localStorage: { getItem() { return null; }, setItem() {} } };
  window.window = window;
  vm.runInContext(briefing, vm.createContext({ window, document, console, setTimeout, clearTimeout, Date, Math, JSON, isFinite }), { filename: 'briefing.js' });
  return window.KiwiBriefing._test;
}
const T = bootBriefing();
const fixture = { day: '2026-08-20', current: { cancellations: 3, total: 20, reasons: { 'client-change': 2, duplicate: 1 } }, baselineRates: [2, 3, 4, 2] };
const line = T.cancellationRateRule(fixture);
ok(!!line, 'elevated cancellation rate emits');
ok(/client-change \(2\)/.test(line.copy.fr), 'line reports the dominant reason');
ok(/5 %/.test(line.copy.fr) && /2×/.test(line.copy.fr), 'line states both thresholds');
ok(line.roles.join(',') === 'owner,manager', 'only owner and manager receive it');
ok(!line.action, 'cancellation signal never performs an action');
ok(line.evidence.count === 3 && /sale_void_history/.test(line.evidence.source), 'evidence carries count and durable source');
ok(!!T.normalizeLine(line), 'line survives the structured evidence contract');
ok(T.visibleLines([line], 'owner').length === 1 && T.visibleLines([line], 'manager').length === 1, 'owner and manager visibility works');
ok(T.visibleLines([line], 'staff').length === 0, 'staff is filtered');
ok(T.cancellationRateRule({ ...fixture, current: { cancellations: 1, total: 10, reasons: {} } }) === null, 'fewer than two events suppresses');
ok(T.cancellationRateRule({ ...fixture, current: { cancellations: 2, total: 100, reasons: {} } }) === null, 'rate below five percent suppresses');
ok(T.cancellationRateRule({ ...fixture, current: { cancellations: 2, total: 20, reasons: {} }, baselineRates: [7, 6, 8, 7] }) === null, 'rate that does not double baseline suppresses');
ok(T.cancellationRateRule({ ...fixture, baselineRates: [2, 3] }) === null, 'fewer than three comparable days suppresses');
ok(/D\.lastClosedDay\(\)/.test(briefing), 'production uses the canonical 5 h-aware closed day');
ok(/H\.ready\(\)/.test(briefing) && /H\.list\(\)/.test(briefing), 'no line is computed before durable history is ready');
ok(/function salesRows[\s\S]{0,260}?KiwiSales\.list\(id\)/.test(briefing), 'denominator is isolated to the active venue');

const readerWindow = { addEventListener() {}, dispatchEvent() {}, KiwiEnv: { isReal: () => false } };
readerWindow.window = readerWindow;
vm.runInContext(reader, vm.createContext({ window: readerWindow, console, setTimeout, clearTimeout, Date, Math, JSON, Set, CustomEvent: class {} }), { filename: 'cancellation-history.js' });
ok(readerWindow.KiwiCancellationHistory._clean({ id: 'v', saleId: 's', voidedAt: 10, amountCents: 200, actorId: 'staff:a' }).actorId === 'staff:a', 'reader accepts bounded actor ids');
ok(readerWindow.KiwiCancellationHistory._clean({ id: 'v', saleId: 's', voidedAt: 0, amountCents: 200 }) === null, 'reader rejects malformed events');
ok(/KiwiEnv && window\.KiwiEnv\.isReal/.test(reader), 'reader is gated off in demo');
ok(/payload\.merchant !== m/.test(reader), 'reader refuses cross-tenant responses');
ok(/state\.ready = false/.test(reader) && /history-unavailable/.test(reader), 'backend failure remains unavailable, not a zero');

ok(/CREATE TABLE IF NOT EXISTS sale_void_history/.test(schema), 'additive history table exists in schema.sql');
ok(/UNIQUE \(merchant, sale_id\)/.test(schema) && /merchant, voided_ts/.test(schema), 'schema enforces tenant sale identity and indexed tenant time');
ok(!/sale_void_history[\s\S]{0,500}?\bpin\b/i.test(schema), 'history schema contains no credential field');
ok(/WHERE merchant = \? AND voided_ts >= \?/.test(endpoint), 'history read is tenant-scoped');
ok(/actor_id AS actorId/.test(endpoint) && !/pin AS/.test(endpoint), 'history projection exposes an id, never a code');
ok(/INSERT OR IGNORE INTO sale_void_history/.test(endpoint), 'cancel endpoint appends the durable event');
ok(/catch \(_\) \{ \/\* history unavailable: keep the successful void response \*\//.test(endpoint), 'history insertion is fail-soft after the canonical void');
ok(/\{ c: r\.cursor, i: r\.id \|\| '', r: r\.ref \|\| '' \}/.test(feed), 'c/r reconciliation feed remains intact and includes canonical sale identity');
ok(/CREATE TABLE IF NOT EXISTS sale_void_history/.test(audit) && /fail-soft/.test(audit), 'AUDIT_AI records exact migration and fail-soft behavior');

console.log(`briefing-cancellations-test: ${checks} controls passed`);
