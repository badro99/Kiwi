#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import mergedPart from './merged-source.cjs';

const briefing = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
// cancellation-history.js porte aussi order-course.js depuis le 22 octobre 2026 : seul le lecteur d'annulations.
const reader = mergedPart('assets/cancellation-history.js');
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
ok(/changement du client \(2\)/.test(line.copy.fr) && /customer changed their mind \(2\)/.test(line.copy.en), 'line reports the dominant reason in words');
const tillOnly = T.cancellationRateRule({ ...fixture, current: { cancellations: 3, total: 20, reasons: { 'employee-cancel': 3 } } });
ok(/Motif principal : annulation à la caisse \(3\)/.test(tillOnly.copy.fr) && !/employee-cancel/.test(JSON.stringify(tillOnly.copy)), 'the server’s fallback code reads as words, never as a code');
ok(/5 %/.test(line.copy.fr) && /2×/.test(line.copy.fr), 'line states both thresholds');
ok(line.roles.join(',') === 'owner,manager', 'only owner and manager receive it');
ok(!line.action, 'cancellation signal never performs an action');
ok(line.evidence.count === 3 && /sale_void_history/.test(line.evidence.source), 'evidence carries count and durable source');
ok(!!T.normalizeLine(line), 'line survives the structured evidence contract');
const ROSTER = [{ id: 'cashier-1', name: 'Hind', role: 'Caissière' }];
const one = T.cancellationRateRule({ ...fixture, roster: ROSTER, current: { ...fixture.current, actors: { 'staff:cashier-1': 2, 'account:acct-a': 1 } } });
ok(/Dont 2 par Hind\./.test(one.copy.fr) && /2 of them by Hind\./.test(one.copy.en) && /منها 2 بواسطة Hind\./.test(one.copy.ar), 'one person behind most cancellations is named, in FR, EN and AR');
const spread = T.cancellationRateRule({ ...fixture, current: { ...fixture.current, cancellations: 4, total: 20, actors: { 'staff:a': 1, 'staff:b': 1, 'staff:c': 1, 'staff:d': 1 } } });
ok(spread && !/Dont|par /.test(spread.copy.fr.replace('Seuil', '')), 'cancellations spread across the team name nobody');
ok(!/Dont/.test(line.copy.fr), 'without actor facts the line names nobody');
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
