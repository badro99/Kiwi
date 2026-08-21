#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
const teamSource = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, message) { if (!condition) throw new Error(message); checks += 1; }
function boot(lang = 'fr') {
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, head: { appendChild() {} }, createElement() { return { setAttribute() {}, appendChild() {}, addEventListener() {} }; } };
  let opened = 0;
  const window = { document, console, setTimeout, clearTimeout, addEventListener() {}, KiwiEnv: { isReal: () => true }, KiwiI18n: { getLang: () => lang }, KiwiAccount: { get: () => ({ id: 'acct-a', role: 'owner' }) }, KiwiVenue: { getVenue: () => 'venue-a', getCurrentVenue: () => 'venue-a' }, Kiwi: { handlers: { 'nav-payroll': () => { opened += 1; } } }, localStorage: { getItem() { return null; }, setItem() {} } };
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, document, console, setTimeout, clearTimeout, Date, Math, JSON, isFinite }), { filename: 'briefing.js' });
  return { api: window.KiwiBriefing, opened: () => opened };
}
const periods = [{ from: '09:00', to: '17:00' }];
const published = (members) => ({ configured: true, published: true, members });
const harness = boot();
const rule = harness.api._test.planningGapRule({ day: '2026-08-21', periods, plan: published([{ id: 'a', firstName: 'Amira', start: '09:00', end: '13:00' }]) });
ok(!!rule, 'partial opening coverage emits');
ok(rule.roles.join(',') === 'owner,manager', 'only owner and manager receive the line');
ok(rule.action.name === 'open-planning', 'proposal opens planning');
ok(!/Amira\s+\S+/.test(rule.copy.fr), 'line carries no identity beyond a possible first name');
ok(/planning publié/.test(rule.evidence.source) && /KiwiHours/.test(rule.evidence.source), 'evidence names publication and opening-hours sources');
ok(!!harness.api._test.normalizeLine(rule), 'line survives the evidence contract');
ok(harness.api._test.visibleLines([rule], 'owner').length === 1, 'owner sees the line');
ok(harness.api._test.visibleLines([rule], 'manager').length === 1, 'manager sees the line');
ok(harness.api._test.visibleLines([rule], 'staff').length === 0, 'staff does not see the line');
ok(harness.api._test.planningGapRule({ day: '2026-08-21', periods, plan: published([{ id: 'a', firstName: 'Amira', start: '09:00', end: '17:00' }]) }) === null, 'fully covered opening suppresses');
ok(harness.api._test.planningGapRule({ day: '2026-08-21', periods, plan: { configured: false, published: true, members: [] } }) === null, 'unconfigured day suppresses');
ok(harness.api._test.planningGapRule({ day: '2026-08-21', periods, plan: { configured: true, published: false, members: [] } }) === null, 'draft day suppresses');
ok(harness.api._test.planningGapRule({ day: '2026-08-21', periods: [], plan: published([]) }) === null, 'missing opening hours suppresses');
ok(!!harness.api._test.planningGapRule({ day: '2026-08-21', periods: [{ from: '19:00', to: '02:00' }], plan: published([{ id: 'a', firstName: 'Amira', start: '19:00', end: '01:00' }]) }), 'overnight uncovered tail emits');
ok(harness.api._test.planningGapRule({ day: '2026-08-21', periods: [{ from: '19:00', to: '02:00' }], plan: published([{ id: 'a', firstName: 'Amira', start: '19:00', end: '02:00' }]) }) === null, 'overnight full coverage suppresses');
ok(/D\.today\(\)/.test(source), 'production day follows KiwiDayReport and its 5 h boundary');
ok(/T\.planningDay\(day\)/.test(source), 'production reads the tenant-resolved team adapter');
ok(/H\.isConfigured\(vid\)/.test(source) && /H\.periodsOn\(day, vid\)/.test(source), 'production requires venue-specific configured hours');
ok(/planning\.publishedShifts/.test(teamSource) && /planning\.publishingEnabled === true/.test(teamSource), 'team adapter reads only published shifts');
ok(/const venue = window\.KiwiVenue\?\.getCurrentVenueData/.test(teamSource), 'team adapter resolves the active venue');
ok(/firstName: String\(m\.firstName/.test(teamSource), 'team adapter projects first name only');
ok(!/planningGapRule[\s\S]{0,2600}?fairSchedule\(|planningGapRule[\s\S]{0,2600}?optimize\(/.test(source), 'rule never auto-schedules');

ok(harness.api._test.openPlanning().opened === 'planning' && harness.opened() === 1, 'planning action invokes the existing planning route');
ok(/line\.action\.name === 'open-planning'\) return openPlanning\(\)/.test(source), 'Proposer dispatches the planning action to that route');

console.log(`briefing-planning-test: ${checks} controls passed`);
